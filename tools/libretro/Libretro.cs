using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace NestLibretro
{
    // Native layouts from libretro.h. Only the fields the host actually reads
    // are declared, but each struct must keep its exact byte size/alignment.
    [StructLayout(LayoutKind.Sequential)]
    internal struct RetroGameGeometry
    {
        public uint base_width;
        public uint base_height;
        public uint max_width;
        public uint max_height;
        public float aspect_ratio;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct RetroSystemTiming
    {
        public double fps;
        public double sample_rate;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct RetroSystemAvInfo
    {
        public RetroGameGeometry geometry;
        public RetroSystemTiming timing;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct RetroSystemInfo
    {
        public IntPtr library_name;
        public IntPtr library_version;
        public IntPtr valid_extensions;
        [MarshalAs(UnmanagedType.U1)] public bool need_fullpath;
        [MarshalAs(UnmanagedType.U1)] public bool block_extract;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct RetroGameInfo
    {
        public IntPtr path;
        public IntPtr data;
        public UIntPtr size;
        public IntPtr meta;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct RetroVariable
    {
        public IntPtr key;
        public IntPtr value;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct RetroInputDescriptor
    {
        public uint port;
        public uint device;
        public uint index;
        public uint id;
        public IntPtr description;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct RetroControllerInfo
    {
        public IntPtr types;
        public uint num_types;
    }

    /// <summary>
    /// Dynamically loaded libretro core.
    ///
    /// Every entry point and, more importantly, every callback delegate is kept
    /// in a static field: if a delegate is collected while native code still
    /// holds its function pointer the next callback jumps into freed memory.
    ///
    /// Order matters: <c>retro_set_environment</c> must run *before*
    /// <c>retro_init</c>, because the core caches its configuration/variables
    /// during init.
    /// </summary>
    internal static class LibretroCore
    {
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern IntPtr LoadLibraryW(string path);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr GetProcAddress(IntPtr module, string name);

        [DllImport("kernel32.dll")]
        private static extern bool FreeLibrary(IntPtr module);

        // ---- callback types exposed by the core ----
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        internal delegate bool EnvironmentFn(uint cmd, IntPtr data);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate void VideoRefreshFn(IntPtr data, uint width, uint height, IntPtr pitch);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate void AudioSampleFn(short left, short right);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate IntPtr AudioSampleBatchFn(IntPtr data, IntPtr frames);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate void InputPollFn();

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate short InputStateFn(uint port, uint device, uint index, uint id);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate void LogFn(int level, IntPtr fmt);

        // ---- libretro API entry points ----
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate uint ApiVersionFn();

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void SetEnvironmentFn(IntPtr callback);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void SetCallbackFn(IntPtr callback);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void VoidFn();

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void GetSystemInfoFn(ref RetroSystemInfo info);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void GetSystemAvInfoFn(ref RetroSystemAvInfo info);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        private delegate bool LoadGameFn(ref RetroGameInfo info);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate UIntPtr SerializeSizeFn();

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        private delegate bool SerializeFn(IntPtr data, UIntPtr size);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate IntPtr GetMemoryDataFn(uint id);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate UIntPtr GetMemorySizeFn(uint id);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate uint GetRegionFn();

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void SetControllerPortDeviceFn(uint port, uint device);

        private static IntPtr _module;
        private static readonly Dictionary<string, Delegate> KeepAlive = new Dictionary<string, Delegate>();

        private static ApiVersionFn ApiVersion;

        public static void Load(string path)
        {
            _module = LoadLibraryW(path);
            if (_module == IntPtr.Zero)
            {
                throw new InvalidOperationException("LoadLibraryW failed for '" + path + "' (error " +
                                                    Marshal.GetLastWin32Error() + ")");
            }

            Bind("retro_api_version", true);
            Bind("retro_init", true);
            Bind("retro_deinit", true);
            Bind("retro_get_system_info", true);
            Bind("retro_get_system_av_info", true);
            Bind("retro_set_environment", true);
            Bind("retro_set_video_refresh", true);
            Bind("retro_set_audio_sample", true);
            Bind("retro_set_audio_sample_batch", true);
            Bind("retro_set_input_poll", true);
            Bind("retro_set_input_state", true);
            Bind("retro_load_game", true);
            Bind("retro_unload_game", true);
            Bind("retro_run", true);
            Bind("retro_serialize_size", false);
            Bind("retro_serialize", false);
            Bind("retro_get_memory_data", false);
            Bind("retro_get_memory_size", false);
            Bind("retro_get_region", false);
            Bind("retro_set_controller_port_device", false);
            Bind("retro_reset", false);
        }

        public static bool IsBound(string name)
        {
            return KeepAlive.ContainsKey(name);
        }

        private static void Bind(string name, bool required)
        {
            IntPtr ptr = GetProcAddress(_module, name);
            if (ptr == IntPtr.Zero)
            {
                if (required) throw new EntryPointNotFoundException(name);
                return;
            }

            // The concrete delegate type is chosen by name; keeping one master
            // dictionary of live delegates doubles as the GC root.
            Type type;
            switch (name)
            {
                case "retro_api_version": type = typeof(ApiVersionFn); break;
                case "retro_init": type = typeof(VoidFn); break;
                case "retro_deinit": type = typeof(VoidFn); break;
                case "retro_get_system_info": type = typeof(GetSystemInfoFn); break;
                case "retro_get_system_av_info": type = typeof(GetSystemAvInfoFn); break;
                case "retro_set_environment": type = typeof(SetEnvironmentFn); break;
                case "retro_set_video_refresh": type = typeof(SetCallbackFn); break;
                case "retro_set_audio_sample": type = typeof(SetCallbackFn); break;
                case "retro_set_audio_sample_batch": type = typeof(SetCallbackFn); break;
                case "retro_set_input_poll": type = typeof(SetCallbackFn); break;
                case "retro_set_input_state": type = typeof(SetCallbackFn); break;
                case "retro_load_game": type = typeof(LoadGameFn); break;
                case "retro_unload_game": type = typeof(VoidFn); break;
                case "retro_run": type = typeof(VoidFn); break;
                case "retro_serialize_size": type = typeof(SerializeSizeFn); break;
                case "retro_serialize": type = typeof(SerializeFn); break;
                case "retro_get_memory_data": type = typeof(GetMemoryDataFn); break;
                case "retro_get_memory_size": type = typeof(GetMemorySizeFn); break;
                case "retro_get_region": type = typeof(GetRegionFn); break;
                case "retro_set_controller_port_device": type = typeof(SetControllerPortDeviceFn); break;
                case "retro_reset": type = typeof(VoidFn); break;
                default: throw new ArgumentException("unhandled entry point " + name);
            }

            Delegate fn = Marshal.GetDelegateForFunctionPointer(ptr, type);
            KeepAlive[name] = fn;
            if (name == "retro_api_version") ApiVersion = (ApiVersionFn)fn;
        }

        private static T Get<T>(string name) where T : class
        {
            Delegate fn;
            if (!KeepAlive.TryGetValue(name, out fn)) return null;
            return fn as T;
        }

        public static uint GetApiVersion()
        {
            return ApiVersion();
        }

        public static void SetEnvironment(IntPtr callback) { Get<SetEnvironmentFn>("retro_set_environment")(callback); }        public static void SetVideoRefresh(IntPtr callback) { Get<SetCallbackFn>("retro_set_video_refresh")(callback); }
        public static void SetAudioSample(IntPtr callback) { Get<SetCallbackFn>("retro_set_audio_sample")(callback); }
        public static void SetAudioSampleBatch(IntPtr callback) { Get<SetCallbackFn>("retro_set_audio_sample_batch")(callback); }
        public static void SetInputPoll(IntPtr callback) { Get<SetCallbackFn>("retro_set_input_poll")(callback); }
        public static void SetInputState(IntPtr callback) { Get<SetCallbackFn>("retro_set_input_state")(callback); }
        public static void Init() { Get<VoidFn>("retro_init")(); }
        public static void Deinit() { Get<VoidFn>("retro_deinit")(); }
        public static void Run() { Get<VoidFn>("retro_run")(); }
        public static void UnloadGame() { Get<VoidFn>("retro_unload_game")(); }
        public static void Reset() { VoidFn fn = Get<VoidFn>("retro_reset"); if (fn != null) fn(); }

        public static RetroSystemInfo GetSystemInfo()
        {
            RetroSystemInfo info = new RetroSystemInfo();
            Get<GetSystemInfoFn>("retro_get_system_info")(ref info);
            return info;
        }

        public static RetroSystemAvInfo GetSystemAvInfo()
        {
            RetroSystemAvInfo info = new RetroSystemAvInfo();
            Get<GetSystemAvInfoFn>("retro_get_system_av_info")(ref info);
            return info;
        }

        public static bool LoadGame(ref RetroGameInfo info)
        {
            return Get<LoadGameFn>("retro_load_game")(ref info);
        }

        public static UIntPtr SerializeSize()
        {
            SerializeSizeFn fn = Get<SerializeSizeFn>("retro_serialize_size");
            return fn == null ? UIntPtr.Zero : fn();
        }

        public static uint GetRegion()
        {
            GetRegionFn fn = Get<GetRegionFn>("retro_get_region");
            return fn == null ? 0 : fn();
        }

        public static void SetControllerPortDevice(uint port, uint device)
        {
            SetControllerPortDeviceFn fn = Get<SetControllerPortDeviceFn>("retro_set_controller_port_device");
            if (fn != null) fn(port, device);
        }

        public static void Free()
        {
            KeepAlive.Clear();
            if (_module != IntPtr.Zero)
            {
                FreeLibrary(_module);
                _module = IntPtr.Zero;
            }
        }
    }
}
