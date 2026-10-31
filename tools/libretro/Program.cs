using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace NestLibretro
{
    /// <summary>
    /// Nest's own libretro host -- the replacement for driving the Dolphin GUI
    /// through UIA. It boots a libretro core directly (no RetroArch), runs it on
    /// a fixed cadence, and can run fully headless for verification.
    ///
    ///   nest-libretro.exe --core dolphin_libretro.dll [--rom game.gcm]
    ///                     [--frames 600] [--headless] [--shot out.png]
    ///
    /// Exit codes: 0 ok, 1 bad arguments, 2 core load failed, 3 load_game
    /// failed, 4 SDL init failed.
    /// </summary>
    internal static class Program
    {
        [DllImport("winmm.dll")]
        private static extern uint timeBeginPeriod(uint milliseconds);

        [DllImport("winmm.dll")]
        private static extern uint timeEndPeriod(uint milliseconds);

        private static string _corePath;
        private static string _romPath;
        private static string _shotPath;
        private static string _shotDir;
        private static int _shotEvery;
        private static int _timeoutSeconds = 120;
        private static string _keySpec;
        private static bool _noMouse;
        private static string _logPath;
        private static string _systemDir;
        private static string _saveDir;
        private static int _scale = 2;
        private static int _frames;
        private static bool _fullscreen;
        private static bool _headless;
        private static bool _forceAudio;
        private static bool _noAudio;
        private static bool _fast;
        private static bool _controllerPreset;
        private static bool _noCrashGuard;
        private static bool _glDisabled;
        private static readonly List<string[]> CoreOptions = new List<string[]>();

        private static IntPtr _romDataPtr;

        private static int Main(string[] args)
        {
            int exitCode;
            if (!ParseArguments(args, out exitCode)) return exitCode;

            try
            {
                return Run();
            }
            catch (Exception ex)
            {
                Log.Error("unhandled exception: " + ex);
                return 1;
            }
        }

        private static bool ParseArguments(string[] args, out int exitCode)
        {
            exitCode = 0;

            for (int i = 0; i < args.Length; i++)
            {
                string arg = args[i];

                switch (arg)
                {
                    case "--core":
                        if (!Next(args, ref i, out _corePath)) { exitCode = 1; return false; }
                        break;
                    case "--rom":
                        if (!Next(args, ref i, out _romPath)) { exitCode = 1; return false; }
                        break;
                    case "--shot":
                        if (!Next(args, ref i, out _shotPath)) { exitCode = 1; return false; }
                        break;
                    case "--shot-dir":
                        if (!Next(args, ref i, out _shotDir)) { exitCode = 1; return false; }
                        break;
                    case "--shot-every":
                        if (!NextInt(args, ref i, out _shotEvery) || _shotEvery < 0) { exitCode = 1; return false; }
                        break;
                    case "--timeout":
                        if (!NextInt(args, ref i, out _timeoutSeconds) || _timeoutSeconds < 0) { exitCode = 1; return false; }
                        break;
                    case "--keys":
                        if (!Next(args, ref i, out _keySpec)) { exitCode = 1; return false; }
                        break;
                    case "--no-mouse": _noMouse = true; break;
                    case "--log":
                        if (!Next(args, ref i, out _logPath)) { exitCode = 1; return false; }
                        break;
                    case "--system-dir":
                        if (!Next(args, ref i, out _systemDir)) { exitCode = 1; return false; }
                        break;
                    case "--save-dir":
                        if (!Next(args, ref i, out _saveDir)) { exitCode = 1; return false; }
                        break;
                    case "--scale":
                        if (!NextInt(args, ref i, out _scale) || _scale < 1) { exitCode = 1; return false; }
                        break;
                    case "--frames":
                        if (!NextInt(args, ref i, out _frames) || _frames < 0) { exitCode = 1; return false; }
                        break;
                    case "--core-option":
                        {
                            string spec;
                            if (!Next(args, ref i, out spec)) { exitCode = 1; return false; }
                            int equals = spec.IndexOf('=');
                            if (equals <= 0 || equals == spec.Length - 1)
                            {
                                Console.Error.WriteLine("--core-option needs Name=Value, got: " + spec);
                                exitCode = 1;
                                return false;
                            }
                            CoreOptions.Add(new[] { spec.Substring(0, equals).Trim(), spec.Substring(equals + 1).Trim() });
                            break;
                        }
                    case "--fullscreen": _fullscreen = true; break;
                    case "--headless": _headless = true; break;
                    case "--audio": _forceAudio = true; break;
                    case "--no-audio": _noAudio = true; break;
                    case "--fast": _fast = true; break;
                    case "--controller-preset": _controllerPreset = true; break;
                    case "--no-crash-guard": _noCrashGuard = true; break;
                    case "--no-gl": _glDisabled = true; break;
                    case "--help":
                    case "-h":
                        Usage();
                        exitCode = 0;
                        return false;
                    default:
                        Console.Error.WriteLine("unknown argument: " + arg);
                        Usage();
                        exitCode = 1;
                        return false;
                }
            }

            if (string.IsNullOrEmpty(_corePath))
            {
                Console.Error.WriteLine("missing required --core <path to dolphin_libretro.dll>");
                Usage();
                exitCode = 1;
                return false;
            }

            if (_frames == 0 && _headless) _frames = 600;
            if (!string.IsNullOrEmpty(_shotDir) && _shotEvery <= 0) _shotEvery = 120;
            return true;
        }

        private static bool Next(string[] args, ref int index, out string value)
        {
            if (index + 1 >= args.Length)
            {
                Console.Error.WriteLine("missing value after " + args[index]);
                value = null;
                return false;
            }
            value = args[++index];
            return true;
        }

        private static bool NextInt(string[] args, ref int index, out int value)
        {
            value = 0;
            string text;
            if (!Next(args, ref index, out text)) return false;
            if (!int.TryParse(text, out value))
            {
                Console.Error.WriteLine("expected a number after " + args[index - 1] + ", got: " + text);
                return false;
            }
            return true;
        }

        private static void Usage()
        {
            Console.WriteLine(
                "nest-libretro -- libretro host for Nest (no RetroArch, no GUI automation)\n" +
                "\n" +
                "usage: nest-libretro --core <dolphin_libretro.dll> [options]\n" +
                "\n" +
                "  --rom <path>             content to boot (.gcm/.iso/.wad/.bin); omit for no-game\n" +
                "  --fullscreen             start the window fullscreen\n" +
                "  --scale <n>              window scale factor (default 2)\n" +
                "  --frames <n>             stop after n frames (0 = until the window closes)\n" +
                "  --headless               no window; frames stay in memory (--shot still works)\n" +
                "  --shot <png>             write the last frame as PNG on exit\n" +
                "  --shot-dir <dir>         save a PNG every --shot-every frames (frame-<n>.png)\n" +
                "  --shot-every <n>         frame interval for --shot-dir (first shot skips black frames)\n" +
                "  --timeout <seconds>      hard run limit, 0 = no limit (default 120)\n" +
                "  --keys Name=Key[,...]    override keyboard bindings (A=J,B=K,LX=LEFT,...)\n" +
                "  --no-mouse               do not use the mouse for Wii pointer / IR\n" +
                "  --log <file>             append the log to a file (always written to stderr)\n" +
                "  --core-option Name=Value override a core variable (repeatable)\n" +
                "  --system-dir <dir>       core system directory\n" +
                "  --save-dir <dir>         core save directory (NAND lives here)\n" +
                "  --audio / --no-audio     force audio on/off (headless defaults to off)\n" +
                "  --fast                   disable fps pacing (verification shortcut)\n" +
                "  --controller-preset      call retro_set_controller_port_device before load_game\n" +
                "                           (this core crashes on it; experiment only)\n" +
                "  --no-crash-guard         do not install the vectored exception handler\n" +
                "  --no-gl                  do not create an OpenGL context (software fallback only)\n" +
                "\n" +
                "exit codes: 0 ok, 1 argument error, 2 core load failed, 3 load_game failed,\n" +
                "            4 SDL init failed\n");
        }

        private static int Run()
        {
            try { Console.OutputEncoding = Encoding.UTF8; }
            catch { }

            if (!string.IsNullOrEmpty(_logPath)) _logPath = Path.GetFullPath(_logPath);
            Log.Open(_logPath);
            Log.Write("nest-libretro start");
            LogRuntimeDlls();

            string crashPath = string.IsNullOrEmpty(_logPath)
                ? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "nest-libretro-crash.txt")
                : _logPath + ".crash.txt";
            if (!_noCrashGuard) CrashGuard.Install(crashPath);

            Log.Write("core = " + Path.GetFullPath(_corePath));
            Log.Write("rom  = " + (_romPath == null ? "(none, no-game boot)" : Path.GetFullPath(_romPath)));
            Log.Write("headless = " + _headless + " frames = " + (_frames == 0 ? "until closed" : _frames.ToString()) +
                      " scale = " + _scale + " fullscreen = " + _fullscreen);

            bool audio = !_noAudio && (_forceAudio || !_headless);
            if (_headless && !audio) Log.Write("audio disabled for headless run");

            // ---- SDL ----
            // Video is always initialised: a hidden SDL window is needed for the
            // OpenGL context even when --headless is used.
            uint flags = Sdl3.SDL_INIT_EVENTS | Sdl3.SDL_INIT_VIDEO;
            if (!_headless) flags |= Sdl3.SDL_INIT_GAMEPAD;
            if (audio) flags |= Sdl3.SDL_INIT_AUDIO;

            if (!Sdl3.SDL_Init(flags))
            {
                Log.Error("SDL_Init failed: " + LastError());
                return 4;
            }

            string pixelFormatName = Native.Utf8ToString(Sdl3.SDL_GetPixelFormatName(Sdl3.SDL_PIXELFORMAT_XRGB8888));
            Log.Write("SDL3 texture format 0x" + Sdl3.SDL_PIXELFORMAT_XRGB8888.ToString("X8") + " = " + pixelFormatName);
            if (pixelFormatName != "SDL_PIXELFORMAT_XRGB8888")
            {
                Log.Write("WARNING: SDL3 does not name 0x16161804 SDL_PIXELFORMAT_XRGB8888; " +
                          "XRGB8888 texture uploads may render incorrectly");
            }

            CrashGuard.RefreshModules();

            // ---- core ----
            try
            {
                LibretroCore.Load(Path.GetFullPath(_corePath));
            }
            catch (Exception ex)
            {
                Log.Error("core load failed: " + ex.Message);
                Sdl3.SDL_Quit();
                return 2;
            }

            CrashGuard.RefreshModules();

            Log.Write("core api version = " + LibretroCore.GetApiVersion());

            string exeDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
            string nestRoot = Path.GetFullPath(Path.Combine(exeDir, "..", ".."));
            string defaultBase = Path.Combine(nestRoot, "data", "libretro");
            if (string.IsNullOrEmpty(_systemDir)) _systemDir = Path.Combine(defaultBase, "system");
            if (string.IsNullOrEmpty(_saveDir)) _saveDir = Path.Combine(defaultBase, "save");

            HostEnvironment.Init(Path.GetFullPath(_corePath), Path.GetFullPath(_systemDir), Path.GetFullPath(_saveDir));
            for (int i = 0; i < CoreOptions.Count; i++)
            {
                HostEnvironment.AddOverride(CoreOptions[i][0], CoreOptions[i][1]);
            }

            HostVideo.Init(_scale, _fullscreen, _headless);
            HostInput.Init(_headless);
            HostInput.Configure(_keySpec, !_noMouse);

            // The core negotiates hardware rendering during retro_init and needs
            // get_proc_address to work from that moment on, so the GL context is
            // created before the core is initialised.
            bool glReady = HostVideo.InitGl(!_glDisabled);
            Log.Write("GL available = " + glReady + " (hardware render " +
                      (glReady ? "possible" : "unavailable") + ")");

            // Order is not optional: the environment callback must be installed
            // before retro_init, the rest can follow.
            LibretroCore.SetEnvironment(HostEnvironment.CallbackPointer);
            LibretroCore.SetVideoRefresh(HostVideo.CallbackPointer);
            LibretroCore.SetAudioSample(HostAudio.SamplePointer);
            LibretroCore.SetAudioSampleBatch(HostAudio.BatchPointer);
            LibretroCore.SetInputPoll(HostInput.PollPointer);
            LibretroCore.SetInputState(HostInput.StatePointer);

            Log.Write("retro_init");
            LibretroCore.Init();

            RetroSystemInfo systemInfo = LibretroCore.GetSystemInfo();
            Log.Write("core info: name='" + Native.Utf8ToString(systemInfo.library_name) +
                      "' version='" + Native.Utf8ToString(systemInfo.library_version) +
                      "' extensions='" + Native.Utf8ToString(systemInfo.valid_extensions) +
                      "' need_fullpath=" + systemInfo.need_fullpath +
                      " block_extract=" + systemInfo.block_extract);

            // ---- load content ----
            // The Dolphin core has no no-game support: retro_load_game dereferences
            // game->path unconditionally (DolphinLibretro/Boot.cpp:691), so a NULL
            // path crashes inside the core. Passing an ordinary non-NULL empty
            // string makes it return false cleanly instead.
            RetroGameInfo gameInfo = new RetroGameInfo();
            gameInfo.path = Native.AllocUtf8(string.Empty);
            if (!string.IsNullOrEmpty(_romPath))
            {
                _romPath = Path.GetFullPath(_romPath);
                if (!File.Exists(_romPath))
                {
                    Log.Error("rom not found: " + _romPath);
                    LibretroCore.Deinit();
                    LibretroCore.Free();
                    Sdl3.SDL_Quit();
                    return 3;
                }

                gameInfo.path = Native.AllocUtf8(_romPath);
                if (!systemInfo.need_fullpath)
                {
                    // Cores that do not need a full path want the content in
                    // memory. Reading a 1.4 GB disc image would be wasteful, so
                    // only do it for reasonably sized files.
                    FileInfo file = new FileInfo(_romPath);
                    if (file.Length <= 256L * 1024 * 1024)
                    {
                        byte[] bytes = File.ReadAllBytes(_romPath);
                        _romDataPtr = Marshal.AllocHGlobal(bytes.Length);
                        Marshal.Copy(bytes, 0, _romDataPtr, bytes.Length);
                        gameInfo.data = _romDataPtr;
                        gameInfo.size = (UIntPtr)(ulong)bytes.Length;
                        Log.Write("content loaded into memory: " + bytes.Length + " bytes");
                    }
                    else
                    {
                        Log.Write("WARNING: core reports need_fullpath=false for a " + file.Length +
                                  " byte image; passing the path only");
                    }
                }
            }

            // libretro convention says the frontend picks a device per port
            // before loading content, but this core crashes (null deref in its
            // own input-container lookup) if retro_set_controller_port_device
            // runs before retro_load_game. Keep it behind a flag for
            // experiments; the default path selects devices after load_game.
            if (_controllerPreset)
            {
                LibretroCore.SetControllerPortDevice(0, 1);
                LibretroCore.SetControllerPortDevice(1, 0);
                LibretroCore.SetControllerPortDevice(2, 0);
                LibretroCore.SetControllerPortDevice(3, 0);
                Log.Write("controller ports preset before load_game: 0=joypad, 1..3=none");
            }

            Log.Write("retro_load_game");
            bool loaded = LibretroCore.LoadGame(ref gameInfo);
            if (!loaded)
            {
                // A half-initialised Dolphin core (video backend up, no content)
                // never finishes its shutdown: retro_deinit blocks forever and the
                // process hangs. Report the failure and leave the process.
                Log.Error("retro_load_game failed; aborting without core teardown");
                Log.Flush();
                Environment.Exit(3);
                return 3;
            }

            if (HostEnvironment.SupportNoGame && string.IsNullOrEmpty(_romPath))
            {
                Log.Write("no-game boot accepted by core");
            }

            RetroSystemAvInfo avInfo = LibretroCore.GetSystemAvInfo();
            Log.Write(string.Format("av_info: video={0}x{1} max={2}x{3} aspect={4:F3} fps={5:F4} sample_rate={6:F0}",
                avInfo.geometry.base_width, avInfo.geometry.base_height,
                avInfo.geometry.max_width, avInfo.geometry.max_height,
                avInfo.geometry.aspect_ratio, avInfo.timing.fps, avInfo.timing.sample_rate));
            Log.Write("serialize size = " + LibretroCore.SerializeSize());
            Log.Write("region = " + LibretroCore.GetRegion());

            HostVideo.SetVideoSize(avInfo.geometry.base_width, avInfo.geometry.base_height);
            if (HostVideo.HwRenderActive)
            {
                Log.Write("hardware rendering active; handing the GL context to the core");
                HostVideo.NotifyCoreLoaded();
            }
            else
            {
                Log.Write("core did not enable hardware rendering (software/null path)");
            }

            Log.Write("core variables:" + Environment.NewLine + HostEnvironment.DescribeOptions());
            Log.Write(HostEnvironment.DescribeOverrides());

            // The core publishes its input descriptors on the emulation thread
            // during the first retro_run(), so the joypad id table is rebuilt as
            // soon as they arrive (see RefreshInputMappingIfNeeded).
            Log.Write(HostInput.DescribeMapping());
            RefreshInputMappingIfNeeded();

            // Pick a controller device for ports where the core did not list the
            // default joypad; joypad stays the default elsewhere.
            foreach (KeyValuePair<uint, uint[]> pair in HostEnvironment.ControllerDevices)
            {
                uint[] types = pair.Value;
                uint chosen = 0;
                bool hasJoypad = false;
                for (int i = 0; i < types.Length; i++) if (types[i] == 1) hasJoypad = true;

                if (hasJoypad) chosen = 1;
                else if (types.Length > 0) chosen = types[0] != 0 ? types[0] : (types.Length > 1 ? types[1] : 0);

                if (chosen != 0)
                {
                    LibretroCore.SetControllerPortDevice(pair.Key, chosen);
                    Log.Write("controller port " + pair.Key + " -> device " + chosen);
                }
            }

            if (audio)
            {
                HostAudio.Open(avInfo.timing.sample_rate > 0 ? avInfo.timing.sample_rate : 48000.0);
            }

            // ---- main loop ----
            double fps = avInfo.timing.fps;
            if (fps < 1.0 || fps > 1000.0) fps = 60.0;
            double frameTime = 1.0 / fps;

            // Dolphin runs emulation on its own thread: retro_run() returns before a
            // frame exists, so counting calls exits (and unloads) during boot, which
            // crashes inside the core. Count frames delivered by the video callback
            // instead, and give the core a bounded amount of time to boot.
            bool infinite = _frames == 0;
            long targetFrames = infinite ? long.MaxValue : _frames;
            long iterations = 0;
            bool shutdownRequested = false;

            string shotDirFull = string.IsNullOrEmpty(_shotDir) ? null : Path.GetFullPath(_shotDir);
            if (shotDirFull != null) Directory.CreateDirectory(shotDirFull);
            int shotsSaved = 0;
            bool firstShotPending = shotDirFull != null && _shotEvery > 0;
            long lastShotFrame = -1;

            double timeLimit = _timeoutSeconds > 0 ? _timeoutSeconds : double.MaxValue;
            if (shotDirFull != null)
            {
                Log.Write("shot-dir = " + shotDirFull + " every=" + _shotEvery +
                          " frame(s); first shot skips black frames (retries up to frame 600)");
            }
            Log.Write("hard timeout = " + (_timeoutSeconds > 0 ? _timeoutSeconds + "s" : "none"));

            try { timeBeginPeriod(1); }
            catch { }

            Stopwatch clock = Stopwatch.StartNew();
            Log.Write("main loop: fps=" + fps.ToString("F4") + " frames=" + (infinite ? "until closed" : _frames.ToString()) +
                      " fast=" + _fast);

            bool frameTimeout = false;

            while (true)
            {
                if (HostVideo.FrameCount >= targetFrames) break;
                if (clock.Elapsed.TotalSeconds > timeLimit)
                {
                    frameTimeout = true;
                    break;
                }

                HostInput.Pump();
                if (HostInput.QuitRequested) break;

                if (HostEnvironment.ShutdownRequested)
                {
                    shutdownRequested = true;
                    break;
                }

                LibretroCore.Run();
                iterations++;

                RefreshInputMappingIfNeeded();

                long frameNo = HostVideo.FrameCount;
                bool periodicShot = shotDirFull != null && _shotEvery > 0 && frameNo > 0 &&
                                    frameNo != lastShotFrame && (frameNo % _shotEvery) == 0;
                bool finalShot = !string.IsNullOrEmpty(_shotPath) && frameNo >= targetFrames;

                if (!_headless || HostVideo.GlActive)
                {
                    // Capture the requested frame before the swap so both --shot
                    // and --shot-dir get real framebuffer content.
                    HostVideo.Present(periodicShot || finalShot);
                }

                if (periodicShot)
                {
                    lastShotFrame = frameNo;
                    HandleShot(shotDirFull, frameNo, ref firstShotPending, ref shotsSaved);
                }

                if (iterations % 600 == 0)
                {
                    Log.Write("waiting: iterations=" + iterations + " video_frames=" + HostVideo.FrameCount +
                              " elapsed=" + clock.Elapsed.TotalSeconds.ToString("F1") + "s");
                }

                if (!_fast)
                {
                    long delivered = HostVideo.FrameCount;
                    if (delivered > 0) Pace(clock, (int)delivered, frameTime);
                    else Thread.Sleep(1);
                }
            }

            Log.Write(string.Format("loop finished: iterations={0} video_frames={1} elapsed={2:F2}s timeout={3}",
                iterations, HostVideo.FrameCount, clock.Elapsed.TotalSeconds, frameTimeout));

            if (frameTimeout && HostVideo.FrameCount == 0)
            {
                Log.Error("no frame delivered within " + timeLimit.ToString("F0") + "s; core did not produce video (backend/boot failure)");
                HostVideo.Close();
                return 5;
            }
            if (frameTimeout)
            {
                Log.Write("WARNING: hard timeout reached after " + HostVideo.FrameCount + " frame(s)");
            }

            // let a frame that is already in flight land before we tear down
            Thread.Sleep(50);
            double elapsed = clock.Elapsed.TotalSeconds;
            if (elapsed <= 0) elapsed = 0.0001;
            long deliveredFrames = HostVideo.FrameCount;
            Log.Write(string.Format("run summary: frames={0} elapsed={1:F2}s effective_fps={2:F2}" +
                                    " shutdown_requested={3} quit_requested={4}",
                deliveredFrames, elapsed, deliveredFrames / elapsed, shutdownRequested, HostInput.QuitRequested));
            if (shotDirFull != null)
            {
                Log.Write("shot-dir summary: saved=" + shotsSaved +
                          " first_shot_pending=" + firstShotPending);
            }

            // ---- screenshot ----
            if (!string.IsNullOrEmpty(_shotPath))
            {
                HostVideo.SaveScreenshot(_shotPath);
            }

            // ---- teardown ----
            // Let the core release its GL resources while the context is still
            // current, then unload.
            HostVideo.NotifyBeforeUnload();

            try { LibretroCore.UnloadGame(); }
            catch (Exception ex) { Log.Error("retro_unload_game failed: " + ex.Message); }

            try { LibretroCore.Deinit(); }
            catch (Exception ex) { Log.Error("retro_deinit failed: " + ex.Message); }

            HostAudio.Close();
            HostVideo.Close();
            HostInput.Close();
            LibretroCore.Free();

            if (_romDataPtr != IntPtr.Zero)
            {
                Marshal.FreeHGlobal(_romDataPtr);
                _romDataPtr = IntPtr.Zero;
            }

            Sdl3.SDL_Quit();
            try { timeEndPeriod(1); }
            catch { }
            CrashGuard.Uninstall();

            string unused = HostEnvironment.UnusedOverrides();
            if (unused != null) Log.Write("WARNING: core options not matched by the core: " + unused);

            Log.Write("done");
            return 0;
        }

        private static void Pace(Stopwatch clock, int frame, double frameTime)
        {
            double target = frame * frameTime;
            while (true)
            {
                double remaining = target - clock.Elapsed.TotalSeconds;
                if (remaining <= 0.001) return;
                if (remaining > 0.003) Thread.Sleep(1);
                else Thread.Sleep(0);
            }
        }

        /// <summary>
        /// Rebuilds the joypad-id table / mapping log once the core publishes its
        /// input descriptors (they arrive on the emulation thread during the
        /// first retro_run, not during load_game).
        /// </summary>
        private static void RefreshInputMappingIfNeeded()
        {
            if (!HostEnvironment.ConsumeInputDescriptorsChanged()) return;

            HostInput.ApplyDescriptors(HostEnvironment.InputDescriptors);
            Log.Write(HostEnvironment.DescribeInputMapping());
            Log.Write(HostInput.DescribeMapping());
        }

        /// <summary>
        /// Writes one PNG for --shot-dir. The very first file is dropped while
        /// the screen is still black (avg luma &lt; 5); retries continue at the
        /// regular interval until frame 600, then we accept whatever we have.
        /// </summary>
        private static void HandleShot(string directory, long frameNo, ref bool firstShotPending, ref int shotsSaved)
        {
            string path = Path.Combine(directory, "frame-" + frameNo.ToString("D5") + ".png");
            double luma = HostVideo.SaveCurrentFrame(path);
            if (luma < 0)
            {
                Log.Error("shot-dir: no frame available at frame " + frameNo);
                return;
            }

            if (firstShotPending)
            {
                // A pure black GL frame has almost no non-black pixels at all;
                // dark-but-valid screens (memory card prompt, boot logo) have
                // text/UI pixels, so require both conditions to call it black.
                bool black = luma < 5.0 && HostVideo.LastShotNonBlack < 0.02;
                if (black)
                {
                    try { File.Delete(path); } catch { }
                    Log.Write("shot-dir: first shot at frame " + frameNo + " is black (avg_luma=" +
                              luma.ToString("F2") + ", nonblack=" + HostVideo.LastShotNonBlack.ToString("P2") +
                              "); skipping");
                    if (frameNo >= 600)
                    {
                        firstShotPending = false;
                        Log.Write("shot-dir: giving up on a non-black first shot after frame " + frameNo);
                    }
                    return;
                }

                firstShotPending = false;
                Log.Write("shot-dir: first non-black shot at frame " + frameNo + " (avg_luma=" +
                          luma.ToString("F2") + ", nonblack=" + HostVideo.LastShotNonBlack.ToString("P2") + ")");
            }

            shotsSaved++;
        }

        private static void LogRuntimeDlls()
        {
            string dir = AppDomain.CurrentDomain.BaseDirectory;
            string[] names = { "msvcp140.dll", "vcruntime140.dll", "vcruntime140_1.dll", "concrt140.dll" };
            for (int i = 0; i < names.Length; i++)
            {
                string path = Path.Combine(dir, names[i]);
                if (!File.Exists(path))
                {
                    Log.Write("vc runtime: " + names[i] + " MISSING next to exe");
                    continue;
                }

                string version = "?";
                try { version = FileVersionInfo.GetVersionInfo(path).FileVersion; }
                catch { }
                Log.Write("vc runtime: " + names[i] + " present, version=" + version);
            }
        }

        private static string LastError()
        {
            return Native.Utf8ToString(Sdl3.SDL_GetError());
        }
    }
}
