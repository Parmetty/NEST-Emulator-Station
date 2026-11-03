using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

namespace NestLibretro
{
    /// <summary>
    /// Video sink for both libretro rendering models.
    ///
    /// Hardware rendering: an SDL3 window with a real OpenGL core context is
    /// created up front (hidden when --headless) and its GL entry points are
    /// handed to the core through RETRO_ENVIRONMENT_SET_HW_RENDER. Frames are
    /// presented with SDL_GL_SwapWindow and captured with glReadPixels.
    ///
    /// Software rendering (fallback): the newest frame is kept in XRGB8888
    /// (byte order B,G,R,X, which is GDI+'s 32bppRgb layout) and blitted through
    /// an SDL renderer / saved to PNG.
    /// </summary>
    internal static class HostVideo
    {
        private const long RetroHwFrameBufferValid = -1;

        private static readonly LibretroCore.VideoRefreshFn Callback = OnVideoRefresh;

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate uint GetCurrentFramebufferFn();

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate IntPtr GetProcAddressFn(IntPtr symbol);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void ContextResetFn();

        // Frontend-side callbacks handed to the core in retro_hw_render_callback.
        // Static readonly fields keep the thunks alive for the whole process.
        private static readonly GetCurrentFramebufferFn GetFramebufferDelegate = OnGetCurrentFramebuffer;
        private static readonly GetProcAddressFn GetProcAddressDelegate = OnGetProcAddress;

        private static ContextResetFn _coreContextResetDelegate;
        private static ContextResetFn _coreContextDestroyDelegate;

        private static int _scale = 2;
        private static bool _fullscreen;
        private static bool _headless;

        // ---- window / GL ----
        private static IntPtr _window;
        private static IntPtr _glContext;
        private static bool _glActive;
        private static bool _glSetupFailed;
        private static int _glMajor;
        private static int _glMinor;
        private static bool _glCoreProfile;
        private static bool _swapErrorLogged;

        // ---- hardware render state ----
        private static bool _hwRenderActive;
        private static bool _hwBottomLeftOrigin = true;
        private static IntPtr _coreContextReset;
        private static IntPtr _coreContextDestroy;
        private static int _hwWidth;
        private static int _hwHeight;

        // ---- software render path ----
        private static IntPtr _frame;
        private static int _width;
        private static int _height;
        private static bool _hasFrame;
        private static long _frameCount;
        private static int _videoWidth;
        private static int _videoHeight;

        private static byte[] _sourceRow;
        private static byte[] _destRow;

        private static IntPtr _renderer;
        private static IntPtr _texture;
        private static int _textureWidth;
        private static int _textureHeight;
        private static bool _windowFailed;
        private static bool _rendererFailed;
        private static bool _updateFailed;

        // ---- screenshot ----
        private static byte[] _captureRgb;
        private static int _captureWidth;
        private static int _captureHeight;
        private static bool _captureFresh;

        public static bool HasFrame { get { return _hasFrame; } }
        public static long FrameCount { get { return _frameCount; } }
        public static int Width { get { return _width; } }

        /// <summary>Current SDL window size in pixels (0x0 when there is no window).</summary>
        public static bool WindowSize(out int width, out int height)
        {
            width = 0;
            height = 0;
            if (_window == IntPtr.Zero) return false;
            return Sdl3.SDL_GetWindowSizeInPixels(_window, out width, out height) && width > 0 && height > 0;
        }
        public static int Height { get { return _height; } }
        public static bool GlActive { get { return _glActive; } }
        public static bool HwRenderActive { get { return _hwRenderActive; } }
        public static int GlMajor { get { return _glMajor; } }
        public static int GlMinor { get { return _glMinor; } }

        /// <summary>Non-black pixel fraction of the most recent saved frame.</summary>
        public static double LastShotNonBlack { get; private set; }

        public static IntPtr CallbackPointer
        {
            get { return Marshal.GetFunctionPointerForDelegate(Callback); }
        }

        public static void Init(int scale, bool fullscreen, bool headless)
        {
            _scale = scale < 1 ? 1 : scale;
            _fullscreen = fullscreen;
            _headless = headless;
        }

        // ------------------------------------------------------------------
        // OpenGL context
        // ------------------------------------------------------------------

        /// <summary>
        /// Creates the window + GL context. Must run after SDL_Init and before
        /// retro_init, because the core negotiates SET_HW_RENDER during init and
        /// expects get_proc_address to work from that point on.
        /// </summary>
        public static bool InitGl(bool enabled)
        {
            if (!enabled)
            {
                Log.Write("GL: disabled by --no-gl; core will fall back to software rendering");
                return false;
            }

            // (major, minor, core-profile) in order of preference. Dolphin asks
            // for "OpenGL Core"; 3.3 core is the minimum usable core profile.
            int[][] candidates = new int[][]
            {
                new[] { 4, 5, 1 },
                new[] { 4, 3, 1 },
                new[] { 3, 3, 1 },
                new[] { 4, 5, 0 },
                new[] { 3, 0, 0 }
            };

            for (int i = 0; i < candidates.Length; i++)
            {
                int major = candidates[i][0];
                int minor = candidates[i][1];
                bool core = candidates[i][2] == 1;

                SetGlAttributes(major, minor, core);
                CreateWindow();

                if (_window == IntPtr.Zero)
                {
                    Log.Error("GL: SDL_CreateWindow failed: " + LastError());
                    _glSetupFailed = true;
                    return false;
                }

                IntPtr context = Sdl3.SDL_GL_CreateContext(_window);
                if (context == IntPtr.Zero)
                {
                    Log.Write("GL: context " + major + "." + minor + (core ? " core" : " compat") +
                              " unavailable: " + LastError());
                    Sdl3.SDL_DestroyWindow(_window);
                    _window = IntPtr.Zero;
                    continue;
                }

                _glContext = context;
                _glMajor = major;
                _glMinor = minor;
                _glCoreProfile = core;
                _glActive = true;

                if (!Sdl3.SDL_GL_MakeCurrent(_window, _glContext))
                {
                    Log.Error("GL: SDL_GL_MakeCurrent failed: " + LastError());
                }
                Sdl3.SDL_GL_SetSwapInterval(0);
                Sdl3.SDL_GL_SetAttribute(Sdl3.SDL_GL_CONTEXT_FLAGS, 0);

                Log.Write("GL: context created " + major + "." + minor + (core ? " core" : " compatibility") +
                          " (window " + ((_headless) ? "hidden" : "visible") + ")");
                LogGlStrings();
                return true;
            }

            Log.Error("GL: could not create any OpenGL context; continuing without hardware rendering");
            _glSetupFailed = true;
            return false;
        }

        private static void SetGlAttributes(int major, int minor, bool core)
        {
            Sdl3.SDL_GL_SetAttribute(Sdl3.SDL_GL_DOUBLEBUFFER, 1);
            Sdl3.SDL_GL_SetAttribute(Sdl3.SDL_GL_DEPTH_SIZE, 24);
            Sdl3.SDL_GL_SetAttribute(Sdl3.SDL_GL_STENCIL_SIZE, 8);
            Sdl3.SDL_GL_SetAttribute(Sdl3.SDL_GL_CONTEXT_MAJOR_VERSION, major);
            Sdl3.SDL_GL_SetAttribute(Sdl3.SDL_GL_CONTEXT_MINOR_VERSION, minor);
            Sdl3.SDL_GL_SetAttribute(Sdl3.SDL_GL_CONTEXT_PROFILE_MASK,
                core ? Sdl3.SDL_GL_CONTEXT_PROFILE_CORE : Sdl3.SDL_GL_CONTEXT_PROFILE_COMPATIBILITY);
        }

        private static void CreateWindow()
        {
            if (_window != IntPtr.Zero) return;

            int width = 640;
            int height = 480;

            ulong flags = Sdl3.SDL_WINDOW_OPENGL;
            if (_headless) flags |= Sdl3.SDL_WINDOW_HIDDEN;
            else
            {
                if (_fullscreen) flags |= Sdl3.SDL_WINDOW_FULLSCREEN;
            }

            _window = Sdl3.SDL_CreateWindow(Native.AllocUtf8("Nest"), width * _scale, height * _scale, flags);
            if (_window != IntPtr.Zero)
            {
                Log.Write("window created: " + (width * _scale) + "x" + (height * _scale) +
                          " scale=" + _scale + " hidden=" + _headless + " fullscreen=" + _fullscreen);
            }
        }

        private static void LogGlStrings()
        {
            try
            {
                IntPtr glGetString = Sdl3.SDL_GL_GetProcAddress(Native.AllocUtf8("glGetString"));
                if (glGetString == IntPtr.Zero) return;

                GlGetStringFn getString = (GlGetStringFn)Marshal.GetDelegateForFunctionPointer(glGetString,
                    typeof(GlGetStringFn));

                Log.Write("GL: vendor   = " + SafeGlString(getString, Sdl3.GL_VENDOR));
                Log.Write("GL: renderer = " + SafeGlString(getString, Sdl3.GL_RENDERER));
                Log.Write("GL: version  = " + SafeGlString(getString, Sdl3.GL_VERSION));
            }
            catch (Exception ex)
            {
                Log.Write("GL: could not query GL strings: " + ex.Message);
            }
        }

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate IntPtr GlGetStringFn(uint name);

        private static string SafeGlString(GlGetStringFn getString, uint name)
        {
            try
            {
                IntPtr value = getString(name);
                return value == IntPtr.Zero ? "(null)" : Native.Utf8ToString(value);
            }
            catch
            {
                return "(unavailable)";
            }
        }

        /// <summary>Sizes the window to the core's reported geometry.</summary>
        public static void SetVideoSize(uint width, uint height)
        {
            if (width == 0 || height == 0) return;

            _videoWidth = (int)width;
            _videoHeight = (int)height;

            if (_window == IntPtr.Zero) return;
            if (!Sdl3.SDL_SetWindowSize(_window, _videoWidth * _scale, _videoHeight * _scale))
            {
                Log.Write("GL: SDL_SetWindowSize failed: " + LastError());
            }
            else
            {
                Log.Write("window resized to " + (_videoWidth * _scale) + "x" + (_videoHeight * _scale));
            }
        }

        // ------------------------------------------------------------------
        // hardware render negotiation
        // ------------------------------------------------------------------

        private static uint OnGetCurrentFramebuffer()
        {
            // The Dolphin core draws into the default framebuffer at its own
            // fixed surface size; we copy that surface into an FBO and scale it.
            return 0u;
        }

        private static IntPtr OnGetProcAddress(IntPtr symbol)
        {
            try
            {
                if (symbol == IntPtr.Zero) return IntPtr.Zero;
                return Sdl3.SDL_GL_GetProcAddress(symbol);
            }
            catch
            {
                return IntPtr.Zero;
            }
        }

        /// <summary>
        /// RETRO_ENVIRONMENT_SET_HW_RENDER handler. The core fills context_type,
        /// version, depth/stencil, bottom_left_origin and its context_reset /
        /// context_destroy pointers; the frontend fills get_current_framebuffer
        /// and get_proc_address and returns true.
        /// </summary>
        public static bool EnableHardwareRender(IntPtr data)
        {
            if (data == IntPtr.Zero) return false;
            if (!_glActive)
            {
                Log.Write("SET_HW_RENDER requested but no GL context is available; returning false");
                return false;
            }

            int contextType = Marshal.ReadInt32(data, 0);

            // Layout from the authoritative libretro.h (x64, natural alignment):
            //   +0  enum retro_hw_context_type context_type
            //   +8  context_reset            (core -> frontend, must not be touched)
            //   +16 get_current_framebuffer  (frontend fills)
            //   +24 get_proc_address         (frontend fills)
            //   +32 bool depth
            //   +33 bool stencil
            //   +34 bool bottom_left_origin
            //   +36 unsigned version_major
            //   +40 unsigned version_minor
            //   +44 bool cache_context
            //   +48 context_destroy          (core -> frontend, must not be touched)
            //   +56 bool debug_context
            IntPtr coreContextReset = Marshal.ReadIntPtr(data, 8);
            IntPtr coreContextDestroy = Marshal.ReadIntPtr(data, 48);
            byte depth = Marshal.ReadByte(data, 32);
            byte stencil = Marshal.ReadByte(data, 33);
            byte bottomLeft = Marshal.ReadByte(data, 34);
            uint versionMajor = (uint)Marshal.ReadInt32(data, 36);
            uint versionMinor = (uint)Marshal.ReadInt32(data, 40);
            byte cacheContext = Marshal.ReadByte(data, 44);
            byte debugContext = Marshal.ReadByte(data, 56);

            System.Text.StringBuilder hex = new System.Text.StringBuilder();
            for (int i = 0; i < 64; i++) hex.Append(Marshal.ReadByte(data, i).ToString("X2")).Append(' ');
            Log.Write("SET_HW_RENDER raw bytes: " + hex);

            Log.Write("SET_HW_RENDER: context_type=" + contextType + " version=" + versionMajor + "." + versionMinor +
                      " depth=" + depth + " stencil=" + stencil + " bottom_left_origin=" + bottomLeft +
                      " cache_context=" + cacheContext + " debug_context=" + debugContext +
                      " (our context " + _glMajor + "." + _glMinor + (_glCoreProfile ? " core" : " compat") + ")");

            // 1 = RETRO_HW_CONTEXT_OPENGL, 3 = RETRO_HW_CONTEXT_OPENGL_CORE.
            if (contextType != 1 && contextType != 3)
            {
                Log.Write("SET_HW_RENDER: unsupported context type " + contextType + "; returning false");
                return false;
            }

            _coreContextReset = coreContextReset;
            _coreContextDestroy = coreContextDestroy;

            Marshal.WriteIntPtr(data, 16, Marshal.GetFunctionPointerForDelegate(GetFramebufferDelegate));
            Marshal.WriteIntPtr(data, 24, Marshal.GetFunctionPointerForDelegate(GetProcAddressDelegate));

            _hwRenderActive = true;
            _hwBottomLeftOrigin = bottomLeft != 0;

            Log.Write("SET_HW_RENDER accepted: core context_reset=0x" + _coreContextReset.ToInt64().ToString("X") +
                      " context_destroy=0x" + _coreContextDestroy.ToInt64().ToString("X"));
            return true;
        }

        /// <summary>Called once retro_load_game has succeeded: GL is ready to use.</summary>
        public static void NotifyCoreLoaded()
        {
            if (!_hwRenderActive || _coreContextReset == IntPtr.Zero) return;

            try
            {
                Sdl3.SDL_GL_MakeCurrent(_window, _glContext);

                _coreContextResetDelegate = (ContextResetFn)Marshal.GetDelegateForFunctionPointer(_coreContextReset,
                    typeof(ContextResetFn));
                Log.Write("calling core context_reset");
                _coreContextResetDelegate();
                Log.Write("core context_reset returned");
            }
            catch (Exception ex)
            {
                Log.Error("core context_reset failed: " + ex.Message);
            }
        }

        /// <summary>Called before retro_unload_game so the core can drop GL resources.</summary>
        public static void NotifyBeforeUnload()
        {
            if (!_hwRenderActive || _coreContextDestroy == IntPtr.Zero) return;

            try
            {
                Sdl3.SDL_GL_MakeCurrent(_window, _glContext);

                _coreContextDestroyDelegate = (ContextResetFn)Marshal.GetDelegateForFunctionPointer(_coreContextDestroy,
                    typeof(ContextResetFn));
                Log.Write("calling core context_destroy");
                _coreContextDestroyDelegate();
                Log.Write("core context_destroy returned");
            }
            catch (Exception ex)
            {
                Log.Error("core context_destroy failed: " + ex.Message);
            }
        }

        // ------------------------------------------------------------------
        // frame callback
        // ------------------------------------------------------------------

        private static void OnVideoRefresh(IntPtr data, uint width, uint height, IntPtr pitch)
        {
            try
            {
                if (data == IntPtr.Zero) return; // dupe frame, keep the previous image

                // Hardware rendering: the core renders straight into the default
                // framebuffer; only the size and the frame count are interesting.
                if (data.ToInt64() == RetroHwFrameBufferValid)
                {
                    _hwWidth = (int)width;
                    _hwHeight = (int)height;
                    _hasFrame = true;
                    _frameCount++;
                    if (_frameCount == 1)
                    {
                        Log.Write("first hardware frame: " + width + "x" + height + " (RETRO_HW_FRAME_BUFFER_VALID)");
                    }
                    return;
                }

                int w = (int)width;
                int h = (int)height;
                int p = (int)pitch;
                if (w <= 0 || h <= 0 || p <= 0 || w > 4096 || h > 4096) return;

                EnsureBuffer(w, h);
                Convert(data, w, h, p);

                if (!_hasFrame)
                {
                    Log.Write("first software frame: " + w + "x" + h + " pitch=" + p +
                              " format=" + FormatName(HostEnvironment.PixelFormat));
                }
                _hasFrame = true;
                _frameCount++;
            }
            catch (Exception ex)
            {
                Log.Error("video_refresh failed: " + ex.Message);
            }
        }

        private static void EnsureBuffer(int width, int height)
        {
            if (_frame != IntPtr.Zero && width == _width && height == _height) return;

            if (_frame != IntPtr.Zero) Marshal.FreeHGlobal(_frame);

            _width = width;
            _height = height;
            _frame = Marshal.AllocHGlobal(width * height * 4);
            _sourceRow = new byte[width * 2];
            _destRow = new byte[width * 4];
        }

        private static void Convert(IntPtr data, int width, int height, int pitch)
        {
            int rowBytes = width * 4;
            int format = HostEnvironment.PixelFormat;

            if (format == 1)
            {
                for (int y = 0; y < height; y++)
                {
                    Native.CopyMemory(IntPtr.Add(_frame, y * rowBytes), IntPtr.Add(data, y * pitch), rowBytes);
                }
                return;
            }

            bool rgb565 = format == 2;
            for (int y = 0; y < height; y++)
            {
                Marshal.Copy(IntPtr.Add(data, y * pitch), _sourceRow, 0, width * 2);

                int src = 0;
                int dst = 0;
                for (int x = 0; x < width; x++)
                {
                    int value = _sourceRow[src] | (_sourceRow[src + 1] << 8);
                    src += 2;

                    int r, g, b;
                    if (rgb565)
                    {
                        r = (value >> 11) & 0x1F;
                        g = (value >> 5) & 0x3F;
                        b = value & 0x1F;
                        _destRow[dst + 0] = (byte)((b << 3) | (b >> 2));
                        _destRow[dst + 1] = (byte)((g << 2) | (g >> 4));
                        _destRow[dst + 2] = (byte)((r << 3) | (r >> 2));
                    }
                    else
                    {
                        r = (value >> 10) & 0x1F;
                        g = (value >> 5) & 0x1F;
                        b = value & 0x1F;
                        _destRow[dst + 0] = (byte)((b << 3) | (b >> 2));
                        _destRow[dst + 1] = (byte)((g << 3) | (g >> 2));
                        _destRow[dst + 2] = (byte)((r << 3) | (r >> 2));
                    }

                    _destRow[dst + 3] = 0xFF;
                    dst += 4;
                }

                Marshal.Copy(_destRow, 0, IntPtr.Add(_frame, y * rowBytes), rowBytes);
            }
        }

        // ------------------------------------------------------------------
        // presentation
        // ------------------------------------------------------------------

        /// <summary>
        /// Presents one frame. Hardware mode swaps the GL window (also when the
        /// window is hidden); software mode uploads the XRGB8888 buffer.
        /// <paramref name="capture"/> reads the framebuffer back before the swap.
        /// </summary>
        public static void Present(bool capture)
        {
            if (_hwRenderActive && _glActive)
            {
                MatchWindowToCoreViewport();
                if (capture) CaptureGlFrame();

                if (!Sdl3.SDL_GL_SwapWindow(_window))
                {
                    if (!_swapErrorLogged)
                    {
                        _swapErrorLogged = true;
                        Log.Error("SDL_GL_SwapWindow failed: " + LastError());
                    }
                }
                return;
            }

            if (_headless || !_hasFrame) return;

            if (_window == IntPtr.Zero || _windowFailed)
            {
                CreateWindow();
                if (_window == IntPtr.Zero) { _windowFailed = true; return; }
            }

            if (_renderer == IntPtr.Zero && !_rendererFailed)
            {
                _renderer = Sdl3.SDL_CreateRenderer(_window, IntPtr.Zero);
                if (_renderer == IntPtr.Zero)
                {
                    _rendererFailed = true;
                    Log.Error("SDL_CreateRenderer failed: " + LastError());
                    return;
                }
                Sdl3.SDL_SetRenderDrawColor(_renderer, 0, 0, 0, 255);
            }
            if (_renderer == IntPtr.Zero) return;

            if (_texture == IntPtr.Zero || _textureWidth != _width || _textureHeight != _height)
            {
                if (_texture != IntPtr.Zero) Sdl3.SDL_DestroyTexture(_texture);

                _texture = Sdl3.SDL_CreateTexture(_renderer, Sdl3.SDL_PIXELFORMAT_XRGB8888,
                    Sdl3.SDL_TEXTUREACCESS_STREAMING, _width, _height);
                if (_texture == IntPtr.Zero)
                {
                    _windowFailed = true;
                    Log.Error("SDL_CreateTexture failed: " + LastError());
                    return;
                }
                Sdl3.SDL_SetRenderLogicalPresentation(_renderer, _width, _height,
                    Sdl3.SDL_LOGICAL_PRESENTATION_LETTERBOX);
                _textureWidth = _width;
                _textureHeight = _height;
            }

            if (Sdl3.SDL_UpdateTexture(_texture, IntPtr.Zero, _frame, _width * 4))
            {
                Sdl3.SDL_RenderClear(_renderer);
                Sdl3.SDL_RenderTexture(_renderer, _texture, IntPtr.Zero, IntPtr.Zero);
                Sdl3.SDL_RenderPresent(_renderer);
            }
            else if (!_updateFailed)
            {
                _updateFailed = true;
                Log.Error("SDL_UpdateTexture failed: " + LastError());
            }
        }

        // ------------------------------------------------------------------
        // screenshot
        // ------------------------------------------------------------------

        private static IntPtr _glReadPixels;
        private static IntPtr _glReadBuffer;
        private static IntPtr _glPixelStorei;

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void GlReadPixelsFn(int x, int y, int width, int height, uint format, uint type,
            IntPtr pixels);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void GlReadBufferFn(uint mode);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void GlBindFramebufferFn(uint target, uint framebuffer);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void GlPixelStoreiFn(uint pname, int param);

        private static void CaptureGlFrame()
        {
            try
            {
                int width = (!IsDolphinCore() && _hwWidth > 0) ? _hwWidth : (_coreVpWidth > 0 ? _coreVpWidth : 0);
                int height = (!IsDolphinCore() && _hwHeight > 0) ? _hwHeight : (_coreVpHeight > 0 ? _coreVpHeight : 0);
                if (width <= 0 || height <= 0)
                {
                    width = _hwWidth > 0 ? _hwWidth : (_videoWidth > 0 ? _videoWidth : 640);
                    height = _hwHeight > 0 ? _hwHeight : (_videoHeight > 0 ? _videoHeight : 480);
                }

                Sdl3.SDL_GL_MakeCurrent(_window, _glContext);


                if (_glReadPixels == IntPtr.Zero)
                {
                    _glReadPixels = GlProc("glReadPixels");
                    _glReadBuffer = GlProc("glReadBuffer");
                    _glPixelStorei = GlProc("glPixelStorei");
                }
                IntPtr bindFboProc = GlProc("glBindFramebuffer");
                if (bindFboProc != IntPtr.Zero)
                {
                    GlBindFramebufferFn bind = (GlBindFramebufferFn)Marshal.GetDelegateForFunctionPointer(
                        bindFboProc, typeof(GlBindFramebufferFn));
                    bind(Sdl3.GL_FRAMEBUFFER, 0);
                }
                if (_glReadPixels == IntPtr.Zero)
                {
                    Log.Error("GL: glReadPixels unavailable; cannot capture a screenshot");
                    return;
                }

                if (_glReadBuffer != IntPtr.Zero)
                {
                    GlReadBufferFn readBuffer = (GlReadBufferFn)Marshal.GetDelegateForFunctionPointer(
                        _glReadBuffer, typeof(GlReadBufferFn));
                    readBuffer(Sdl3.GL_BACK);
                }
                if (_glPixelStorei != IntPtr.Zero)
                {
                    GlPixelStoreiFn pixelStore = (GlPixelStoreiFn)Marshal.GetDelegateForFunctionPointer(
                        _glPixelStorei, typeof(GlPixelStoreiFn));
                    pixelStore(Sdl3.GL_PACK_ALIGNMENT, 1);
                }

                int rowBytes = width * 4;
                IntPtr buffer = Marshal.AllocHGlobal(rowBytes * height);
                try
                {
                    GlReadPixelsFn readPixels = (GlReadPixelsFn)Marshal.GetDelegateForFunctionPointer(
                        _glReadPixels, typeof(GlReadPixelsFn));
                    readPixels(0, 0, width, height, Sdl3.GL_RGBA, Sdl3.GL_UNSIGNED_BYTE, buffer);

                    byte[] rgba = new byte[rowBytes * height];
                    Marshal.Copy(buffer, rgba, 0, rgba.Length);

                    // glReadPixels rows are bottom-up; PNG rows are top-down.
                    byte[] rgb = new byte[width * height * 3];
                    for (int y = 0; y < height; y++)
                    {
                        int srcRow = (height - 1 - y) * rowBytes;
                        int dstRow = y * width * 3;
                        for (int x = 0; x < width; x++)
                        {
                            rgb[dstRow + x * 3 + 0] = rgba[srcRow + x * 4 + 0];
                            rgb[dstRow + x * 3 + 1] = rgba[srcRow + x * 4 + 1];
                            rgb[dstRow + x * 3 + 2] = rgba[srcRow + x * 4 + 2];
                        }
                    }

                    _captureRgb = rgb;
                    _captureWidth = width;
                    _captureHeight = height;
                    _captureFresh = true;
                    Log.Write("GL: captured frame " + width + "x" + height + " via glReadPixels");
                }
                finally
                {
                    Marshal.FreeHGlobal(buffer);
                }
            }
            catch (Exception ex)
            {
                Log.Error("GL screenshot failed: " + ex.Message);
            }
        }

        private static IntPtr GlProc(string name)
        {
            return Sdl3.SDL_GL_GetProcAddress(Native.AllocUtf8(name));
        }

        /// <summary>Writes the captured/last frame as PNG and logs pixel statistics.</summary>
        public static void SaveScreenshot(string path)
        {
            if (!_hasFrame)
            {
                Log.Error("screenshot requested but the core never produced a frame");
                return;
            }

            try
            {
                string full = Path.GetFullPath(path);
                string dir = Path.GetDirectoryName(full);
                if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

                if (_captureRgb != null)
                {
                    SaveRgbPng(full, _captureRgb, _captureWidth, _captureHeight);
                    return;
                }

                if (_frame == IntPtr.Zero)
                {
                    Log.Error("screenshot requested but no pixel buffer is available " +
                              "(hardware rendering without a captured frame)");
                    return;
                }

                SaveXrgbPng(full);
            }
            catch (Exception ex)
            {
                Log.Error("screenshot failed: " + ex.Message);
            }
        }

        private static void SaveRgbPng(string path, byte[] rgb, int width, int height)
        {
            SaveRgbPngAndLuma(path, rgb, width, height);
        }

        /// <summary>Writes the RGB buffer as PNG and returns the average luma.</summary>
        private static double SaveRgbPngAndLuma(string path, byte[] rgb, int width, int height)
        {
            using (Bitmap bitmap = new Bitmap(width, height, PixelFormat.Format24bppRgb))
            {
                BitmapData bits = bitmap.LockBits(new Rectangle(0, 0, width, height),
                    ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);

                long sum = 0;
                long nonBlack = 0;

                for (int y = 0; y < height; y++)
                {
                    Marshal.Copy(rgb, y * width * 3, IntPtr.Add(bits.Scan0, y * bits.Stride), width * 3);

                    int row = y * width * 3;
                    for (int x = 0; x < width; x++)
                    {
                        int r = rgb[row + x * 3];
                        int g = rgb[row + x * 3 + 1];
                        int b = rgb[row + x * 3 + 2];
                        int luma = (r + g + b) / 3;
                        sum += luma;
                        if (luma > 8) nonBlack++;
                    }
                }

                bitmap.UnlockBits(bits);
                bitmap.Save(path, ImageFormat.Png);

                double pixels = (double)width * height;
                LastShotNonBlack = nonBlack / pixels;
                Log.Write(string.Format("shot {0} {1}x{2} avg_luma={3:F2} nonblack={4:P1} (GL readback)",
                    path, width, height, sum / pixels, nonBlack / pixels));
                return sum / pixels;
            }
        }

        private static void SaveXrgbPng(string path)
        {
            SaveXrgbPngAndLuma(path);
        }

        /// <summary>Writes the software XRGB buffer as PNG and returns the average luma.</summary>
        private static double SaveXrgbPngAndLuma(string path)
        {
            using (Bitmap bitmap = new Bitmap(_width, _height, PixelFormat.Format32bppRgb))
            {
                BitmapData bits = bitmap.LockBits(new Rectangle(0, 0, _width, _height),
                    ImageLockMode.WriteOnly, PixelFormat.Format32bppRgb);

                byte[] row = new byte[_width * 4];
                long sum = 0;
                long nonBlack = 0;

                for (int y = 0; y < _height; y++)
                {
                    Marshal.Copy(IntPtr.Add(_frame, y * _width * 4), row, 0, row.Length);
                    Marshal.Copy(row, 0, IntPtr.Add(bits.Scan0, y * bits.Stride), row.Length);

                    for (int x = 0; x < _width; x++)
                    {
                        int b = row[x * 4];
                        int g = row[x * 4 + 1];
                        int r = row[x * 4 + 2];
                        int luma = (r + g + b) / 3;
                        sum += luma;
                        if (luma > 8) nonBlack++;
                    }
                }

                bitmap.UnlockBits(bits);
                bitmap.Save(path, ImageFormat.Png);

                double pixels = (double)_width * _height;
                LastShotNonBlack = nonBlack / pixels;
                Log.Write(string.Format("shot {0} {1}x{2} avg_luma={3:F2} nonblack={4:P1} (software frame)",
                    path, _width, _height, sum / pixels, nonBlack / pixels));
                return sum / pixels;
            }
        }

        // ------------------------------------------------------------------
        // periodic frame capture (--shot-dir / --shot-every)
        // ------------------------------------------------------------------

        /// <summary>
        /// Saves the frame currently in memory to <paramref name="path"/> and
        /// returns its average luma (or -1 when no frame/capture is available).
        /// Hardware frames are pulled back with glReadPixels; software frames are
        /// already in the XRGB8888 buffer.
        /// </summary>
        public static double SaveCurrentFrame(string path)
        {
            if (!_hasFrame) return -1.0;

            try
            {
                string full = Path.GetFullPath(path);
                string dir = Path.GetDirectoryName(full);
                if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

                if (_hwRenderActive && _glActive)
                {
                    if (!_captureFresh) CaptureGlFrame();
                    if (_captureRgb == null) return -1.0;

                    double luma = SaveRgbPngAndLuma(full, _captureRgb, _captureWidth, _captureHeight);
                    _captureFresh = false;
                    return luma;
                }

                if (_frame == IntPtr.Zero) return -1.0;
                return SaveXrgbPngAndLuma(full);
            }
            catch (Exception ex)
            {
                Log.Error("SaveCurrentFrame failed: " + ex.Message);
                return -1.0;
            }
        }

        /// <summary>Causes the next Present() to capture the framebuffer for --shot.</summary>
        public static void RequestCapture()
        {
            _captureFresh = false;
        }

        // ------------------------------------------------------------------
        // fullscreen / shutdown
        // ------------------------------------------------------------------

        public static void ToggleFullscreen()
        {
            if (_window == IntPtr.Zero) return;

            _fullscreen = !_fullscreen;
            if (!Sdl3.SDL_SetWindowFullscreen(_window, _fullscreen))
            {
                Log.Error("SDL_SetWindowFullscreen failed: " + LastError());
                return;
            }
            Log.Write("fullscreen = " + _fullscreen);
        }


        // ------------------------------------------------------------------
        // Render target FBO (hardware rendering)
        // ------------------------------------------------------------------

        private static uint _fbo;
        private static uint _fboTex;
        private static bool _fboReady;
        private static int _fboW;
        private static int _fboH;

        private static int _destX;
        private static int _destY;
        private static int _destW;
        private static int _destH;

        private const uint GL_TEXTURE_2D = 0x0DE1;
        private const uint GL_RGBA8 = 0x8058;
        private const uint GL_RGBA = 0x1908;
        private const uint GL_UNSIGNED_BYTE = 0x1401;
        private const uint GL_READ_FRAMEBUFFER = 0x8CA8;
        private const uint GL_DRAW_FRAMEBUFFER = 0x8CA9;
        private const uint GL_COLOR_BUFFER_BIT = 0x4000;
        private const uint GL_NEAREST = 0x2600;

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void GlGenFramebuffersFn(int n, out uint ids);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void GlGenTexturesFn(int n, out uint ids);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void GlBindTextureFn(uint target, uint texture);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void GlTexImage2DFn(uint target, int level, int internalFormat, int width, int height,
            int border, uint format, uint type, IntPtr pixels);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void GlFramebufferTexture2DFn(uint target, uint attachment, uint textarget, uint texture,
            int level);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void GlCopyTexSubImage2DFn(uint target, int level, int xoffset, int yoffset,
            int x, int y, int width, int height);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void GlBlitFramebufferFn(int srcX0, int srcY0, int srcX1, int srcY1,
            int dstX0, int dstY0, int dstX1, int dstY1, uint mask, uint filter);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void GlViewportFn(int x, int y, int width, int height);

        /// <summary>Creates the offscreen render target the core draws into.</summary>
        private static bool EnsureFbo()
        {
            if (_fboReady) return true;
            if (!_glActive) return false;

            int width = _hwWidth > 0 ? _hwWidth : (_videoWidth > 0 ? _videoWidth : 640);
            int height = _hwHeight > 0 ? _hwHeight : (_videoHeight > 0 ? _videoHeight : 528);
            if (width <= 0 || height <= 0) { width = 640; height = 528; }

            IntPtr genFbProc = GlProc("glGenFramebuffers");
            IntPtr bindFbProc = GlProc("glBindFramebuffer");
            IntPtr genTexProc = GlProc("glGenTextures");
            IntPtr bindTexProc = GlProc("glBindTexture");
            IntPtr texImageProc = GlProc("glTexImage2D");
            IntPtr fbTexProc = GlProc("glFramebufferTexture2D");
            if (genFbProc == IntPtr.Zero || bindFbProc == IntPtr.Zero || genTexProc == IntPtr.Zero ||
                bindTexProc == IntPtr.Zero || texImageProc == IntPtr.Zero || fbTexProc == IntPtr.Zero)
            {
                Log.Error("GL: FBO entry points unavailable");
                return false;
            }

            Sdl3.SDL_GL_MakeCurrent(_window, _glContext);

            var genFb = (GlGenFramebuffersFn)Marshal.GetDelegateForFunctionPointer(genFbProc, typeof(GlGenFramebuffersFn));
            var bindFb = (GlBindFramebufferFn)Marshal.GetDelegateForFunctionPointer(bindFbProc, typeof(GlBindFramebufferFn));
            var genTex = (GlGenTexturesFn)Marshal.GetDelegateForFunctionPointer(genTexProc, typeof(GlGenTexturesFn));
            var bindTex = (GlBindTextureFn)Marshal.GetDelegateForFunctionPointer(bindTexProc, typeof(GlBindTextureFn));
            var texImage = (GlTexImage2DFn)Marshal.GetDelegateForFunctionPointer(texImageProc, typeof(GlTexImage2DFn));
            var fbTex = (GlFramebufferTexture2DFn)Marshal.GetDelegateForFunctionPointer(fbTexProc, typeof(GlFramebufferTexture2DFn));

            uint tex;
            genTex(1, out tex);
            bindTex(GL_TEXTURE_2D, tex);
            texImage(GL_TEXTURE_2D, 0, (int)GL_RGBA8, width, height, 0, GL_RGBA, GL_UNSIGNED_BYTE, IntPtr.Zero);
            bindTex(GL_TEXTURE_2D, 0);

            uint fbo;
            genFb(1, out fbo);
            bindFb(Sdl3.GL_FRAMEBUFFER, fbo);
            fbTex(Sdl3.GL_FRAMEBUFFER, Sdl3.GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, tex, 0);
            bindFb(Sdl3.GL_FRAMEBUFFER, 0);

            _fbo = fbo;
            _fboTex = tex;
            _fboW = width;
            _fboH = height;
            _fboReady = true;
            Log.Write("GL: render target FBO created " + width + "x" + height);
            return true;
        }

        private static string _coreName = "";

        /// <summary>Name of the loaded core file (set by Program before Init).</summary>
        public static void SetCoreName(string name)
        {
            _coreName = name ?? "";
        }

        private static bool IsDolphinCore()
        {
            return _coreName.IndexOf("dolphin", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static int _coreVpWidth;
        private static int _coreVpHeight;
        private static bool _viewportChecked;

        /// <summary>
        /// The Dolphin core ignores the window size and draws into a fixed
        /// viewport inside whatever framebuffer it got. Read that viewport once
        /// and resize our window to it, so the picture fills the window exactly
        /// (and mouse coordinates map 1:1).
        /// </summary>
        private static void MatchWindowToCoreViewport()
        {
            if (_viewportChecked)
            {
                // Non-Dolphin cores only report the real frame size on their first
                // hardware frame, which can arrive after the first Present(). Keep the
                // window matched to that size once it is known.
                if (!IsDolphinCore() && _hwWidth > 0 && _hwHeight > 0 && !_fullscreen && _window != IntPtr.Zero)
                {
                    int ww, wh;
                    if (Sdl3.SDL_GetWindowSizeInPixels(_window, out ww, out wh) && (ww != _hwWidth || wh != _hwHeight))
                    {
                        Sdl3.SDL_SetWindowSize(_window, _hwWidth, _hwHeight);
                        Log.Write("window resized to core frame " + _hwWidth + "x" + _hwHeight);
                    }
                }
                return;
            }
            IntPtr proc = GlProc("glGetIntegerv");
            if (proc == IntPtr.Zero) return;

            int[] vp = new int[4];
            // glGetIntegerv needs a real pointer; use a marshalled buffer.
            IntPtr buf = Marshal.AllocHGlobal(4 * sizeof(int));
            try
            {
                ((GlGetIntegervPtrFn)Marshal.GetDelegateForFunctionPointer(proc, typeof(GlGetIntegervPtrFn)))(GL_VIEWPORT, buf);
                vp[0] = Marshal.ReadInt32(buf, 0);
                vp[1] = Marshal.ReadInt32(buf, 4);
                vp[2] = Marshal.ReadInt32(buf, 8);
                vp[3] = Marshal.ReadInt32(buf, 12);
            }
            finally
            {
                Marshal.FreeHGlobal(buf);
            }

            if (vp[2] <= 0 || vp[3] <= 0) return;
            _coreVpWidth = vp[2];
            _coreVpHeight = vp[3];
            _viewportChecked = true;
            Log.Write("core viewport = " + vp[0] + "," + vp[1] + " " + vp[2] + "x" + vp[3]);

            if (_fullscreen || _window == IntPtr.Zero) return;
            int winW, winH;
            if (!Sdl3.SDL_GetWindowSizeInPixels(_window, out winW, out winH)) return;
            int targetW;
            int targetH;
            if (IsDolphinCore())
            {
                // The Dolphin core always blits its 640x480 output into the lower-left
                // corner, whatever the window size is, so match the window to that
                // surface instead of to the reported GL viewport.
                targetW = 640 * (_scale < 1 ? 1 : _scale);
                targetH = 480 * (_scale < 1 ? 1 : _scale);
            }
            else
            {
                // Other cores (e.g. SwanStation) draw into their own viewport and do
                // not scale it. Match the window to that viewport so the picture fills
                // the window instead of sitting in a corner of a much larger surface.
                targetW = _hwWidth > 0 ? _hwWidth : _coreVpWidth;
                targetH = _hwHeight > 0 ? _hwHeight : _coreVpHeight;
            }
            if (winW != targetW || winH != targetH)
            {
                Sdl3.SDL_SetWindowSize(_window, targetW, targetH);
                Log.Write("window resized to core surface " + targetW + "x" + targetH);
            }
        }

        /// <summary>Window pixel position -> normalized position inside the video rect.</summary>
        public static void WindowToVideo(float mouseX, float mouseY, out float nx, out float ny)
        {
            nx = 0.5f;
            ny = 0.5f;
            int winW, winH;
            if (_window == IntPtr.Zero || !Sdl3.SDL_GetWindowSizeInPixels(_window, out winW, out winH) || winW <= 0 || winH <= 0)
                return;
            // The core's output is 16:9 letterboxed inside the window; map the
            // cursor into that visible rect, not the whole window.
            double aspect = HostEnvironment.Geometry.aspect_ratio;
            if (aspect < 0.5 || aspect > 3.0) aspect = 16.0 / 9.0;
            int destW = winW;
            int destH = (int)Math.Round(destW / aspect);
            if (destH > winH)
            {
                destH = winH;
                destW = (int)Math.Round(destH * aspect);
            }
            int destX = (winW - destW) / 2;
            int destY = (winH - destH) / 2;

            nx = (mouseX - destX) / (float)destW;
            ny = (mouseY - destY) / (float)destH;
            if (nx < 0f) nx = 0f;
            if (nx > 1f) nx = 1f;
            if (ny < 0f) ny = 0f;
            if (ny > 1f) ny = 1f;
        }

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void GlGetIntegervPtrFn(uint pname, IntPtr data);

        private const uint GL_VIEWPORT = 0x0BA2;

        public static bool FboActive { get { return _fboReady; } }

        public static void Close()
        {
            if (_texture != IntPtr.Zero) { Sdl3.SDL_DestroyTexture(_texture); _texture = IntPtr.Zero; }
            if (_renderer != IntPtr.Zero) { Sdl3.SDL_DestroyRenderer(_renderer); _renderer = IntPtr.Zero; }

            if (_glContext != IntPtr.Zero)
            {
                Sdl3.SDL_GL_DestroyContext(_glContext);
                _glContext = IntPtr.Zero;
            }
            if (_window != IntPtr.Zero)
            {
                Sdl3.SDL_DestroyWindow(_window);
                _window = IntPtr.Zero;
            }

            if (_frame != IntPtr.Zero) { Marshal.FreeHGlobal(_frame); _frame = IntPtr.Zero; }
            _captureRgb = null;
        }

        private static string FormatName(int format)
        {
            switch (format)
            {
                case 0: return "0RGB1555";
                case 1: return "XRGB8888";
                case 2: return "RGB565";
                default: return "unknown(" + format + ")";
            }
        }

        private static string LastError()
        {
            return Native.Utf8ToString(Sdl3.SDL_GetError());
        }
    }
}
