using System;
using System.Runtime.InteropServices;

namespace NestLibretro
{
    /// <summary>
    /// The small slice of SDL3 that a libretro host needs: an OpenGL-backed
    /// window (real GL context for hardware-rendering cores, hidden window in
    /// --headless), a software renderer fallback, an audio stream, keyboard
    /// state and gamepad buttons.
    ///
    /// SDL3 returns C99 <c>bool</c> (1 byte), so every bool return/parameter is
    /// annotated with <see cref="UnmanagedType.I1"/>; getting this wrong silently
    /// flips results on x64.
    ///
    /// SDL3.dll must sit next to nest-libretro.exe.
    /// </summary>
    internal static class Sdl3
    {
        private const string Dll = "SDL3.dll";

        public const uint SDL_INIT_AUDIO = 0x00000010;
        public const uint SDL_INIT_VIDEO = 0x00000020;
        public const uint SDL_INIT_JOYSTICK = 0x00000200;
        public const uint SDL_INIT_GAMEPAD = 0x00002000;
        public const uint SDL_INIT_EVENTS = 0x00004000;

        public const ulong SDL_WINDOW_FULLSCREEN = 0x0000000000000001UL;
        public const ulong SDL_WINDOW_OPENGL = 0x0000000000000002UL;
        public const ulong SDL_WINDOW_HIDDEN = 0x0000000000000008UL;
        public const ulong SDL_WINDOW_RESIZABLE = 0x0000000000000020UL;

        public const uint SDL_EVENT_QUIT = 0x100;
        public const uint SDL_EVENT_KEY_DOWN = 0x300;
        public const uint SDL_EVENT_KEY_UP = 0x301;

        // SDL_DEFINE_PIXELFORMAT(PACKED32, XRGB, 8888, 24, 4):
        // (1<<28)|(6<<24)|(1<<20)|(6<<16)|(24<<8)|4
        public const uint SDL_PIXELFORMAT_XRGB8888 = 0x16161804u;

        public const int SDL_TEXTUREACCESS_STREAMING = 1;
        public const int SDL_LOGICAL_PRESENTATION_LETTERBOX = 1;

        public const uint SDL_AUDIO_S16 = 0x8010u;
        public const uint SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK = 0xFFFFFFFFu;

        public const int SDL_SCANCODE_ESCAPE = 41;
        public const int SDL_SCANCODE_F11 = 68;

        // Gamepad buttons (SDL3 order).
        public const int SDL_GAMEPAD_BUTTON_SOUTH = 0;
        public const int SDL_GAMEPAD_BUTTON_EAST = 1;
        public const int SDL_GAMEPAD_BUTTON_WEST = 2;
        public const int SDL_GAMEPAD_BUTTON_NORTH = 3;
        public const int SDL_GAMEPAD_BUTTON_BACK = 4;
        public const int SDL_GAMEPAD_BUTTON_GUIDE = 5;
        public const int SDL_GAMEPAD_BUTTON_START = 6;
        public const int SDL_GAMEPAD_BUTTON_LEFT_STICK = 7;
        public const int SDL_GAMEPAD_BUTTON_RIGHT_STICK = 8;
        public const int SDL_GAMEPAD_BUTTON_LEFT_SHOULDER = 9;
        public const int SDL_GAMEPAD_BUTTON_RIGHT_SHOULDER = 10;
        public const int SDL_GAMEPAD_BUTTON_DPAD_UP = 11;
        public const int SDL_GAMEPAD_BUTTON_DPAD_DOWN = 12;
        public const int SDL_GAMEPAD_BUTTON_DPAD_LEFT = 13;
        public const int SDL_GAMEPAD_BUTTON_DPAD_RIGHT = 14;

        // Gamepad axes (SDL3 order).
        public const int SDL_GAMEPAD_AXIS_LEFTX = 0;
        public const int SDL_GAMEPAD_AXIS_LEFTY = 1;
        public const int SDL_GAMEPAD_AXIS_RIGHTX = 2;
        public const int SDL_GAMEPAD_AXIS_RIGHTY = 3;
        public const int SDL_GAMEPAD_AXIS_TRIGGER_LEFT = 4;
        public const int SDL_GAMEPAD_AXIS_TRIGGER_RIGHT = 5;

        // SDL_GLattr (SDL3 order).
        public const int SDL_GL_DOUBLEBUFFER = 5;
        public const int SDL_GL_DEPTH_SIZE = 6;
        public const int SDL_GL_STENCIL_SIZE = 7;
        public const int SDL_GL_CONTEXT_MAJOR_VERSION = 17;
        public const int SDL_GL_CONTEXT_MINOR_VERSION = 18;
        public const int SDL_GL_CONTEXT_FLAGS = 19;
        public const int SDL_GL_CONTEXT_PROFILE_MASK = 20;

        public const int SDL_GL_CONTEXT_PROFILE_CORE = 0x0001;
        public const int SDL_GL_CONTEXT_PROFILE_COMPATIBILITY = 0x0002;

        // OpenGL constants used for readback only.
        public const uint GL_RGBA = 0x1908;
        public const uint GL_UNSIGNED_BYTE = 0x1401;
        public const uint GL_BACK = 0x0405;
        public const uint GL_FRAMEBUFFER = 0x8D40;
        public const uint GL_COLOR_ATTACHMENT0 = 0x8CE0;
        public const uint GL_PACK_ALIGNMENT = 0x0D05;
        public const uint GL_VENDOR = 0x1F00;
        public const uint GL_RENDERER = 0x1F01;
        public const uint GL_VERSION = 0x1F02;

        [StructLayout(LayoutKind.Sequential)]
        public struct SdlAudioSpec
        {
            public uint format;
            public int channels;
            public int freq;
        }

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        public static extern bool SDL_Init(uint flags);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern void SDL_Quit();

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr SDL_GetError();

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr SDL_GetPixelFormatName(uint format);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern void SDL_PumpEvents();

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        public static extern bool SDL_PollEvent(IntPtr ev);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr SDL_GetKeyboardState(out int numkeys);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr SDL_CreateWindow(IntPtr title, int w, int h, ulong flags);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern void SDL_DestroyWindow(IntPtr window);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        public static extern bool SDL_SetWindowSize(IntPtr window, int w, int h);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        public static extern bool SDL_GetWindowSizeInPixels(IntPtr window, out int w, out int h);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr SDL_CreateRenderer(IntPtr window, IntPtr name);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern void SDL_DestroyRenderer(IntPtr renderer);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        public static extern bool SDL_SetRenderLogicalPresentation(IntPtr renderer, int w, int h, int mode);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        public static extern bool SDL_SetRenderDrawColor(IntPtr renderer, byte r, byte g, byte b, byte a);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        public static extern bool SDL_RenderClear(IntPtr renderer);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        public static extern bool SDL_RenderTexture(IntPtr renderer, IntPtr texture, IntPtr srcrect, IntPtr dstrect);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        public static extern bool SDL_RenderPresent(IntPtr renderer);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr SDL_CreateTexture(IntPtr renderer, uint format, int access, int w, int h);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern void SDL_DestroyTexture(IntPtr texture);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        public static extern bool SDL_UpdateTexture(IntPtr texture, IntPtr rect, IntPtr pixels, int pitch);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        public static extern bool SDL_SetWindowFullscreen(IntPtr window,
            [MarshalAs(UnmanagedType.I1)] bool fullscreen);

        // ---- OpenGL ----

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        public static extern bool SDL_GL_SetAttribute(int attr, int value);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr SDL_GL_CreateContext(IntPtr window);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        public static extern bool SDL_GL_MakeCurrent(IntPtr window, IntPtr context);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        public static extern bool SDL_GL_SwapWindow(IntPtr window);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        public static extern bool SDL_GL_DestroyContext(IntPtr context);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr SDL_GL_GetProcAddress(IntPtr proc);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        public static extern bool SDL_GL_SetSwapInterval(int interval);

        // ---- audio ----

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr SDL_OpenAudioDeviceStream(uint device, ref SdlAudioSpec spec, IntPtr callback,
            IntPtr userdata);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        public static extern bool SDL_ResumeAudioStreamDevice(IntPtr stream);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        public static extern bool SDL_PutAudioStreamData(IntPtr stream, IntPtr data, int len);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern int SDL_GetAudioStreamQueued(IntPtr stream);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern void SDL_DestroyAudioStream(IntPtr stream);

        // ---- gamepad ----

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr SDL_GetGamepads(out int count);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr SDL_OpenGamepad(int instanceId);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern void SDL_CloseGamepad(IntPtr gamepad);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern void SDL_UpdateGamepads();

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        public static extern bool SDL_GetGamepadButton(IntPtr gamepad, int button);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr SDL_GetGamepadName(IntPtr gamepad);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern short SDL_GetGamepadAxis(IntPtr gamepad, int axis);

        // ---- mouse ----

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern uint SDL_GetRelativeMouseState(out float x, out float y);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern uint SDL_GetMouseState(out float x, out float y);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        public static extern bool SDL_SetRelativeMouseMode([MarshalAs(UnmanagedType.I1)] bool enabled);

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern void SDL_free(IntPtr mem);
    }
}
