using System;
using System.Runtime.InteropServices;

namespace NestLibretro
{
    /// <summary>
    /// Audio sink: pushes S16 stereo samples from the core into an SDL3 audio
    /// stream. A missing audio device is never fatal -- playback is a nicety,
    /// emulation must keep running (verification runs headless and silent).
    /// </summary>
    internal static class HostAudio
    {
        private static readonly LibretroCore.AudioSampleFn SampleCallback = OnSample;
        private static readonly LibretroCore.AudioSampleBatchFn BatchCallback = OnBatch;

        private static IntPtr _stream;
        private static int _sampleRate = 48000;
        private static int _queuedCapBytes;
        private static bool _putErrorLogged;

        // Single-sample path is rare (batch path is the norm); accumulate a
        // small block before handing it to SDL to keep per-sample overhead low.
        private static readonly short[] Pending = new short[2048 * 2];
        private static int _pendingFrames;
        private static IntPtr _pendingPtr;

        public static IntPtr SamplePointer
        {
            get { return Marshal.GetFunctionPointerForDelegate(SampleCallback); }
        }

        public static IntPtr BatchPointer
        {
            get { return Marshal.GetFunctionPointerForDelegate(BatchCallback); }
        }

        public static void Open(double coreSampleRate)
        {
            _sampleRate = (int)Math.Round(coreSampleRate);
            if (_sampleRate < 8000 || _sampleRate > 192000) _sampleRate = 48000;
            _queuedCapBytes = _sampleRate * 4; // ~1 second of S16 stereo

            Sdl3.SdlAudioSpec spec;
            spec.format = Sdl3.SDL_AUDIO_S16;
            spec.channels = 2;
            spec.freq = _sampleRate;

            _stream = Sdl3.SDL_OpenAudioDeviceStream(Sdl3.SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK, ref spec,
                IntPtr.Zero, IntPtr.Zero);
            if (_stream == IntPtr.Zero)
            {
                Log.Write("audio: no playback device (" + LastError() + "); continuing silent");
                return;
            }

            if (!Sdl3.SDL_ResumeAudioStreamDevice(_stream))
            {
                Log.Write("audio: resume failed (" + LastError() + "); continuing silent");
            }
            else
            {
                Log.Write("audio: stream opened, " + _sampleRate + " Hz, S16, stereo");
            }
        }

        private static void Push(IntPtr data, int bytes)
        {
            if (_stream == IntPtr.Zero || bytes <= 0) return;

            // If emulation runs faster than real time the stream would grow
            // without bound; drop instead of accumulating latency.
            if (Sdl3.SDL_GetAudioStreamQueued(_stream) > _queuedCapBytes) return;

            if (!Sdl3.SDL_PutAudioStreamData(_stream, data, bytes) && !_putErrorLogged)
            {
                _putErrorLogged = true;
                Log.Write("audio: SDL_PutAudioStreamData failed: " + LastError());
            }
        }

        private static void OnSample(short left, short right)
        {
            try
            {
                if (_pendingFrames >= 2048) FlushPending();

                Pending[_pendingFrames * 2] = left;
                Pending[_pendingFrames * 2 + 1] = right;
                _pendingFrames++;

                if (_pendingFrames >= 2048) FlushPending();
            }
            catch
            {
                // audio must never break the run loop
            }
        }

        private static IntPtr OnBatch(IntPtr data, IntPtr frames)
        {
            try
            {
                FlushPending();

                int count = frames.ToInt64() > int.MaxValue ? int.MaxValue : (int)frames.ToInt64();
                Push(data, count * 4);
            }
            catch
            {
                // ignored
            }

            return frames;
        }

        private static void FlushPending()
        {
            if (_pendingFrames <= 0 || _stream == IntPtr.Zero)
            {
                _pendingFrames = 0;
                return;
            }

            if (_pendingPtr == IntPtr.Zero) _pendingPtr = Marshal.AllocHGlobal(Pending.Length * 2);
            Marshal.Copy(Pending, 0, _pendingPtr, _pendingFrames * 2);
            Push(_pendingPtr, _pendingFrames * 4);
            _pendingFrames = 0;
        }

        public static void Close()
        {
            FlushPending();
            if (_stream != IntPtr.Zero)
            {
                Sdl3.SDL_DestroyAudioStream(_stream);
                _stream = IntPtr.Zero;
            }
            if (_pendingPtr != IntPtr.Zero)
            {
                Marshal.FreeHGlobal(_pendingPtr);
                _pendingPtr = IntPtr.Zero;
            }
        }

        private static string LastError()
        {
            return Native.Utf8ToString(Sdl3.SDL_GetError());
        }
    }
}
