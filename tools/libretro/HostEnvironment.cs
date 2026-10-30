using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;

namespace NestLibretro
{
    /// <summary>
    /// The libretro "environment" callback: the contract between core and host.
    ///
    /// Two rules matter here:
    ///  - the callback delegate lives in a static readonly field so the GC can
    ///    never collect the thunk while the core still holds its pointer;
    ///  - every string pointer handed back to the core is kept alive for the
    ///    lifetime of the process (the core caches them).
    ///
    /// Unknown commands return false. That is a valid "not supported" answer and
    /// makes cores fall back to their defaults (e.g. the software renderer).
    /// </summary>
    internal static class HostEnvironment
    {
        // ---- libretro environment commands ----
        private const uint CMD_SET_ROTATION = 1;
        private const uint CMD_GET_OVERSCAN = 2;
        private const uint CMD_GET_CAN_DUPE = 3;
        private const uint CMD_SET_MESSAGE = 6;
        private const uint CMD_SHUTDOWN = 7;
        private const uint CMD_SET_PERFORMANCE_LEVEL = 8;
        private const uint CMD_GET_SYSTEM_DIRECTORY = 9;
        private const uint CMD_SET_PIXEL_FORMAT = 10;
        private const uint CMD_SET_INPUT_DESCRIPTORS = 11;
        private const uint CMD_SET_HW_RENDER = 14;
        private const uint CMD_GET_VARIABLE = 15;
        private const uint CMD_SET_VARIABLES = 16;
        private const uint CMD_GET_VARIABLE_UPDATE = 17;
        private const uint CMD_SET_SUPPORT_NO_GAME = 18;
        private const uint CMD_GET_LIBRETRO_PATH = 19;
        private const uint CMD_GET_LOG_INTERFACE = 27;
        private const uint CMD_GET_CORE_ASSETS_DIRECTORY = 30;
        private const uint CMD_GET_SAVE_DIRECTORY = 31;
        private const uint CMD_SET_SYSTEM_AV_INFO = 32;
        private const uint CMD_SET_CONTROLLER_INFO = 35;
        private const uint CMD_SET_GEOMETRY = 37;
        private const uint CMD_GET_LANGUAGE = 39;
        private const uint CMD_GET_INPUT_BITMASKS = 51;
        private const uint CMD_GET_PREFERRED_HW_RENDER = 56;

        // ---- exposed state ----
        public static int PixelFormat; // 0=0RGB1555, 1=XRGB8888, 2=RGB565
        public static bool SupportNoGame;
        public static bool ShutdownRequested;
        public static int PerformanceLevel;
        public static int InputBitmasks;
        public static string CorePath;
        public static string SystemDirectory;
        public static string SaveDirectory;
        public static string CoreAssetsDirectory;

        public static int Language = 0; // 0 = English

        public static readonly RetroSystemAvInfo AvInfo; // reserved, currently unused
        public static RetroGameGeometry Geometry;

        public static readonly Dictionary<uint, uint[]> ControllerDevices = new Dictionary<uint, uint[]>();

        /// <summary>One entry of RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS.</summary>
        public struct InputDescriptorInfo
        {
            public uint Port;
            public uint Device;
            public uint Index;
            public uint Id;
            public string Description;
        }

        public static readonly List<InputDescriptorInfo> InputDescriptors =
            new List<InputDescriptorInfo>();

        private static bool _inputDescriptorsChanged;

        /// <summary>Consumes the "core just published new descriptors" flag.</summary>
        public static bool ConsumeInputDescriptorsChanged()
        {
            if (!_inputDescriptorsChanged) return false;
            _inputDescriptorsChanged = false;
            return true;
        }

        private static readonly HashSet<string> LoggedOverrides = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        private static readonly Dictionary<string, string> Defaults = new Dictionary<string, string>(StringComparer.Ordinal);
        private static readonly Dictionary<string, string[]> Values = new Dictionary<string, string[]>(StringComparer.Ordinal);
        private static readonly Dictionary<string, IntPtr> ValuePointers = new Dictionary<string, IntPtr>(StringComparer.Ordinal);
        private static readonly Dictionary<string, string> Overrides = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        private static readonly Dictionary<string, string> Descriptions = new Dictionary<string, string>(StringComparer.Ordinal);
        private static readonly HashSet<string> AppliedOverrides = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        private static IntPtr _systemDirPtr;
        private static IntPtr _saveDirPtr;
        private static IntPtr _assetsDirPtr;
        private static IntPtr _corePathPtr;

        private static readonly Dictionary<uint, int> CommandCounts = new Dictionary<uint, int>();
        private static int _coreLogLines;

        public static readonly LibretroCore.EnvironmentFn Callback = OnEnvironment;
        public static readonly LibretroCore.LogFn CoreLogCallback = OnCoreLog;

        public static IntPtr CallbackPointer
        {
            get { return Marshal.GetFunctionPointerForDelegate(Callback); }
        }

        public static IntPtr LogCallbackPointer
        {
            get { return Marshal.GetFunctionPointerForDelegate(CoreLogCallback); }
        }

        public static void Init(string corePath, string systemDir, string saveDir)
        {
            CorePath = corePath;
            SystemDirectory = systemDir;
            SaveDirectory = saveDir;
            CoreAssetsDirectory = saveDir;

            Directory.CreateDirectory(systemDir);
            Directory.CreateDirectory(saveDir);

            _systemDirPtr = Native.AllocUtf8(systemDir);
            _saveDirPtr = Native.AllocUtf8(saveDir);
            _assetsDirPtr = Native.AllocUtf8(CoreAssetsDirectory);
            _corePathPtr = Native.AllocUtf8(corePath);

            Log.Write("system directory = " + systemDir);
            Log.Write("save directory   = " + saveDir);
        }

        public static void AddOverride(string name, string value)
        {
            Overrides[name] = value;
            Log.Write("core option override queued: " + name + "=" + value);
        }

        public static string DescribeOptions()
        {
            if (Defaults.Count == 0) return "(core did not publish any variables)";
            List<string> keys = new List<string>(Defaults.Keys);
            keys.Sort(StringComparer.Ordinal);
            System.Text.StringBuilder sb = new System.Text.StringBuilder();
            foreach (string key in keys)
            {
                string[] values;
                Values.TryGetValue(key, out values);
                sb.Append("  ").Append(key).Append(" = ").Append(Defaults[key]);
                if (values != null && values.Length > 1)
                {
                    sb.Append("  [");
                    sb.Append(string.Join("|", values));
                    sb.Append("]");
                }
                sb.Append(Environment.NewLine);
            }
            return sb.ToString();
        }

        /// <summary>Returns a summary of overrides that were never matched to a core variable.</summary>
        public static string UnusedOverrides()
        {
            List<string> unused = new List<string>();
            foreach (string name in Overrides.Keys)
            {
                if (!AppliedOverrides.Contains(name)) unused.Add(name);
            }
            return unused.Count == 0 ? null : string.Join(", ", unused.ToArray());
        }

        public static void Finish()
        {
            Log.Write(DescribeOptions());
        }

        private static string Resolve(string key)
        {
            string value;
            if (Overrides.TryGetValue(key, out value))
            {
                AppliedOverrides.Add(key);
                return value;
            }

            // Options can also be addressed by their human readable name
            // ("Skip GameCube BIOS") instead of the internal key.
            string description;
            if (Descriptions.TryGetValue(key, out description) && description.Length > 0)
            {
                foreach (KeyValuePair<string, string> pair in Overrides)
                {
                    if (string.Equals(pair.Key, description, StringComparison.OrdinalIgnoreCase))
                    {
                        AppliedOverrides.Add(pair.Key);
                        return pair.Value;
                    }
                }
            }

            if (Defaults.TryGetValue(key, out value)) return value;
            return null;
        }

        private static IntPtr PointerFor(string key, string value)
        {
            IntPtr ptr;
            if (ValuePointers.TryGetValue(key, out ptr)) return ptr;
            ptr = Native.AllocUtf8(value);
            ValuePointers[key] = ptr;
            return ptr;
        }

        private static bool OnEnvironment(uint cmd, IntPtr data)
        {
            try
            {
                return Dispatch(cmd, data);
            }
            catch (Exception ex)
            {
                Log.Error("environment callback 0x" + cmd.ToString("X2") + " failed: " + ex);
                return false;
            }
        }

        private static bool Dispatch(uint cmd, IntPtr data)
        {
            CountAndLog(cmd);

            switch (cmd)
            {
                case CMD_GET_CAN_DUPE:
                    if (data != IntPtr.Zero) Marshal.WriteByte(data, 1);
                    return true;

                case CMD_SHUTDOWN:
                    ShutdownRequested = true;
                    Log.Write("core requested SHUTDOWN");
                    return true;

                case CMD_SET_PERFORMANCE_LEVEL:
                    if (data != IntPtr.Zero) PerformanceLevel = Marshal.ReadInt32(data);
                    return true;

                case CMD_GET_SYSTEM_DIRECTORY:
                    if (data == IntPtr.Zero) return false;
                    Marshal.WriteIntPtr(data, _systemDirPtr);
                    return true;

                case CMD_GET_SAVE_DIRECTORY:
                    if (data == IntPtr.Zero) return false;
                    Marshal.WriteIntPtr(data, _saveDirPtr);
                    return true;

                case CMD_GET_CORE_ASSETS_DIRECTORY:
                    if (data == IntPtr.Zero) return false;
                    Marshal.WriteIntPtr(data, _assetsDirPtr);
                    return true;

                case CMD_GET_LIBRETRO_PATH:
                    if (data == IntPtr.Zero) return false;
                    Marshal.WriteIntPtr(data, _corePathPtr);
                    return true;

                case CMD_SET_PIXEL_FORMAT:
                    if (data == IntPtr.Zero) return false;
                    PixelFormat = Marshal.ReadInt32(data);
                    Log.Write("pixel format = " + PixelFormatName(PixelFormat) + " (" + PixelFormat + ")");
                    return true;

                case CMD_SET_VARIABLES:
                    ParseVariables(data);
                    return true;

                case CMD_GET_VARIABLE:
                    return GetVariable(data);

                case CMD_GET_VARIABLE_UPDATE:
                    if (data != IntPtr.Zero) Marshal.WriteByte(data, 0);
                    return true;

                case CMD_SET_SUPPORT_NO_GAME:
                    if (data != IntPtr.Zero) SupportNoGame = Marshal.ReadByte(data) != 0;
                    Log.Write("core supports no-game boot = " + SupportNoGame);
                    return true;

                case CMD_SET_INPUT_DESCRIPTORS:
                    LogInputDescriptors(data);
                    return true;

                case CMD_SET_CONTROLLER_INFO:
                    ParseControllerInfo(data);
                    return true;

                case CMD_GET_LOG_INTERFACE:
                    if (data == IntPtr.Zero) return false;
                    Marshal.WriteIntPtr(data, LogCallbackPointer);
                    Log.Write("core log interface connected");
                    return true;

                case CMD_GET_LANGUAGE:
                    if (data == IntPtr.Zero) return false;
                    Marshal.WriteInt32(data, Language);
                    return true;

                case CMD_GET_INPUT_BITMASKS:
                    if (data != IntPtr.Zero) Marshal.WriteByte(data, 1);
                    InputBitmasks = 1;
                    return true;

                case CMD_GET_PREFERRED_HW_RENDER:
                    // Tell the core to try OpenGL Core first (its best path).
                    if (data == IntPtr.Zero) return false;
                    Marshal.WriteInt32(data, 3); // RETRO_HW_CONTEXT_OPENGL_CORE
                    return true;

                case CMD_SET_HW_RENDER:
                    return HostVideo.EnableHardwareRender(data);

                case CMD_SET_MESSAGE:
                    Log.Write("core message: " + Native.Utf8ToString(data));
                    return true;

                case CMD_SET_SYSTEM_AV_INFO:
                    if (data != IntPtr.Zero) ReadAvInfo(data, "SET_SYSTEM_AV_INFO");
                    return true;

                case CMD_SET_GEOMETRY:
                    if (data != IntPtr.Zero) ReadGeometry(data);
                    return true;

                // Deliberately unsupported; logged so the evidence trail shows
                // what the core asked for and fell back from.
                default:
                    return false;
            }
        }

        private static void CountAndLog(uint cmd)
        {
            int count;
            CommandCounts.TryGetValue(cmd, out count);
            CommandCounts[cmd] = count + 1;
            if (count < 3)
            {
                Log.Write("env 0x" + cmd.ToString("X2") + " " + CommandName(cmd) + " (#" + (count + 1) + ")");
            }
        }

        private static void ParseVariables(IntPtr data)
        {
            if (data == IntPtr.Zero) return;

            IntPtr entry = data;
            while (true)
            {
                IntPtr keyPtr = Marshal.ReadIntPtr(entry);
                if (keyPtr == IntPtr.Zero) break;
                IntPtr valuePtr = Marshal.ReadIntPtr(entry, IntPtr.Size);

                string key = Native.Utf8ToString(keyPtr);
                string raw = valuePtr == IntPtr.Zero ? string.Empty : Native.Utf8ToString(valuePtr);

                string description;
                string options = SplitValues(raw, out description);

                string[] values = options.Split('|');
                for (int i = 0; i < values.Length; i++) values[i] = values[i].Trim();
                string defaultValue = values.Length > 0 ? values[0] : string.Empty;

                Defaults[key] = defaultValue;
                Values[key] = values;
                if (!string.IsNullOrEmpty(description)) Descriptions[key] = description;

                Log.Write("variable " + key + " = '" + defaultValue + "'" +
                          (values.Length > 1 ? "  options=[" + string.Join("|", values) + "]" : "") +
                          (description.Length > 0 ? "  (" + description + ")" : ""));

                entry = IntPtr.Add(entry, IntPtr.Size * 2);
            }
        }

        private static string SplitValues(string raw, out string description)
        {
            description = string.Empty;
            if (raw == null) return string.Empty;

            int semicolon = raw.IndexOf(';');
            if (semicolon < 0) return raw;

            description = raw.Substring(0, semicolon).Trim();
            return raw.Substring(semicolon + 1);
        }

        private static bool GetVariable(IntPtr data)
        {
            if (data == IntPtr.Zero) return false;

            IntPtr keyPtr = Marshal.ReadIntPtr(data);
            string key = Native.Utf8ToString(keyPtr);
            if (string.IsNullOrEmpty(key)) return false;

            string value = Resolve(key);
            if (value == null) return false;

            // Surface --core-option hits in the log: without this, the only
            // visible line is the SET_VARIABLES default dump, which looks as if
            // the override was ignored.
            if (Overrides.ContainsKey(key) && LoggedOverrides.Add(key))
            {
                Log.Write("GET_VARIABLE " + key + " -> '" + value + "' (core option override)");
            }

            Marshal.WriteIntPtr(data, IntPtr.Size, PointerFor(key, value));
            return true;
        }

        private static void LogInputDescriptors(IntPtr data)
        {
            if (data == IntPtr.Zero) return;

            InputDescriptors.Clear();

            const int size = 24; // 4 * u32 + pointer, aligned to 8
            IntPtr entry = data;
            int count = 0;
            int lines = 0;
            while (count < 256)
            {
                IntPtr description = Marshal.ReadIntPtr(entry, 16);
                if (description == IntPtr.Zero) break;

                InputDescriptorInfo info = new InputDescriptorInfo();
                info.Port = (uint)Marshal.ReadInt32(entry, 0);
                info.Device = (uint)Marshal.ReadInt32(entry, 4);
                info.Index = (uint)Marshal.ReadInt32(entry, 8);
                info.Id = (uint)Marshal.ReadInt32(entry, 12);
                info.Description = Native.Utf8ToString(description);
                InputDescriptors.Add(info);

                if (lines < 200)
                {
                    Log.Write("input descriptor port=" + info.Port +
                              " device=" + info.Device +
                              " index=" + info.Index +
                              " id=" + info.Id +
                              " desc=" + info.Description);
                    lines++;
                }

                entry = IntPtr.Add(entry, size);
                count++;
            }
            Log.Write("input descriptors: " + count);
            _inputDescriptorsChanged = true;
        }

        /// <summary>Compact table of the descriptors the core declared.</summary>
        public static string DescribeInputMapping()
        {
            if (InputDescriptors.Count == 0) return "core declared no input descriptors";

            System.Text.StringBuilder sb = new System.Text.StringBuilder();
            sb.Append("input mapping (declared by the core):").Append(Environment.NewLine);

            List<string> groups = new List<string>();
            Dictionary<string, List<InputDescriptorInfo>> byGroup =
                new Dictionary<string, List<InputDescriptorInfo>>(StringComparer.Ordinal);
            foreach (InputDescriptorInfo info in InputDescriptors)
            {
                string key = info.Port + "/" + info.Device + "/" + info.Index;
                List<InputDescriptorInfo> list;
                if (!byGroup.TryGetValue(key, out list))
                {
                    list = new List<InputDescriptorInfo>();
                    byGroup[key] = list;
                    groups.Add(key);
                }
                list.Add(info);
            }
            groups.Sort(StringComparer.Ordinal);

            foreach (string group in groups)
            {
                string[] parts = group.Split('/');
                uint port = uint.Parse(parts[0]);
                if (port != 0) continue; // only player 1 is wired to the keyboard

                string deviceName = DeviceName(uint.Parse(parts[1]));
                sb.Append("  port=0 device=").Append(deviceName)
                  .Append(" index=").Append(parts[2]).Append(": ");

                List<InputDescriptorInfo> list = byGroup[group];
                for (int i = 0; i < list.Count; i++)
                {
                    if (i > 0) sb.Append(", ");
                    sb.Append(list[i].Description).Append("=").Append(list[i].Id);
                }
                sb.Append(Environment.NewLine);
            }
            return sb.ToString();
        }

        /// <summary>Shows default vs --core-option value for every override.</summary>
        public static string DescribeOverrides()
        {
            if (Overrides.Count == 0) return "core option overrides: none";

            System.Text.StringBuilder sb = new System.Text.StringBuilder();
            sb.Append("core option overrides:").Append(Environment.NewLine);
            foreach (KeyValuePair<string, string> pair in Overrides)
            {
                string defaultValue = null;
                if (Defaults.TryGetValue(pair.Key, out defaultValue)) { }
                else
                {
                    foreach (KeyValuePair<string, string> descriptionPair in Descriptions)
                    {
                        if (string.Equals(descriptionPair.Value, pair.Key, StringComparison.OrdinalIgnoreCase))
                        {
                            Defaults.TryGetValue(descriptionPair.Key, out defaultValue);
                            break;
                        }
                    }
                }

                sb.Append("  ").Append(pair.Key)
                  .Append(": default=").Append(defaultValue ?? "(unknown)")
                  .Append(" -> override=").Append(pair.Value)
                  .Append(AppliedOverrides.Contains(pair.Key) ? "  [queried by core]" : "  [not queried]")
                  .Append(Environment.NewLine);
            }
            return sb.ToString();
        }

        private static string DeviceName(uint device)
        {
            uint baseDevice = device & 0xFF;
            string name;
            switch (baseDevice)
            {
                case 1: name = "JOYPAD"; break;
                case 2: name = "MOUSE"; break;
                case 3: name = "KEYBOARD"; break;
                case 4: name = "LIGHTGUN"; break;
                case 5: name = "ANALOG"; break;
                case 6: name = "POINTER"; break;
                default: name = "DEVICE" + baseDevice; break;
            }
            if ((device >> 8) != 0) name += "(subclass" + (device >> 8) + ")";
            return name;
        }

        private static void ParseControllerInfo(IntPtr data)
        {
            if (data == IntPtr.Zero) return;

            const int size = 16; // pointer + u32 + padding
            IntPtr entry = data;
            int port = 0;
            while (port < 16)
            {
                uint numTypes = (uint)Marshal.ReadInt32(entry, 8);
                if (numTypes == 0) break;

                IntPtr types = Marshal.ReadIntPtr(entry, 0);
                uint[] ids = new uint[numTypes];
                List<string> names = new List<string>();
                for (int i = 0; i < numTypes && i < 32; i++)
                {
                    IntPtr descPtr = Marshal.ReadIntPtr(types, i * 16);
                    ids[i] = (uint)Marshal.ReadInt32(types, i * 16 + 8);
                    names.Add(ids[i] + "=" + Native.Utf8ToString(descPtr));
                }

                ControllerDevices[(uint)port] = ids;
                Log.Write("controller port " + port + " types: " + string.Join(", ", names.ToArray()));

                entry = IntPtr.Add(entry, size);
                port++;
            }
        }

        private static void ReadAvInfo(IntPtr data, string why)
        {
            ReadGeometry(data);
            double fps = BitConverter.Int64BitsToDouble(Marshal.ReadInt64(data, 24));
            double rate = BitConverter.Int64BitsToDouble(Marshal.ReadInt64(data, 32));
            Log.Write(why + ": fps=" + fps.ToString("F4") + " sample_rate=" + rate.ToString("F0"));
        }

        private static void ReadGeometry(IntPtr data)
        {
            Geometry.base_width = (uint)Marshal.ReadInt32(data, 0);
            Geometry.base_height = (uint)Marshal.ReadInt32(data, 4);
            Geometry.max_width = (uint)Marshal.ReadInt32(data, 8);
            Geometry.max_height = (uint)Marshal.ReadInt32(data, 12);
            Geometry.aspect_ratio = ToFloat(Marshal.ReadInt32(data, 16));
            Log.Write("geometry: base=" + Geometry.base_width + "x" + Geometry.base_height +
                      " max=" + Geometry.max_width + "x" + Geometry.max_height +
                      " aspect=" + Geometry.aspect_ratio.ToString("F3"));
        }

        private static float ToFloat(int bits)
        {
            return BitConverter.ToSingle(BitConverter.GetBytes(bits), 0);
        }

        private static void OnCoreLog(int level, IntPtr fmt)
        {
            try
            {
                if (_coreLogLines > 4000) return;
                _coreLogLines++;

                string message = Native.Utf8ToString(fmt);
                if (message == null) return;
                message = message.Replace("\r", string.Empty).TrimEnd('\n');
                if (message.Length == 0) return;

                Log.Write("[core " + LevelName(level) + "] " + message);
            }
            catch
            {
                // never let logging break the emulation thread
            }
        }

        private static string LevelName(int level)
        {
            switch (level)
            {
                case 0: return "debug";
                case 1: return "info";
                case 2: return "warn";
                case 3: return "error";
                default: return "log";
            }
        }

        private static string PixelFormatName(int format)
        {
            switch (format)
            {
                case 0: return "0RGB1555";
                case 1: return "XRGB8888";
                case 2: return "RGB565";
                default: return "unknown";
            }
        }

        public static string CommandName(uint cmd)
        {
            switch (cmd)
            {
                case 1: return "SET_ROTATION";
                case 2: return "GET_OVERSCAN";
                case 3: return "GET_CAN_DUPE";
                case 6: return "SET_MESSAGE";
                case 7: return "SHUTDOWN";
                case 8: return "SET_PERFORMANCE_LEVEL";
                case 9: return "GET_SYSTEM_DIRECTORY";
                case 10: return "SET_PIXEL_FORMAT";
                case 11: return "SET_INPUT_DESCRIPTORS";
                case 12: return "SET_KEYBOARD_CALLBACK";
                case 13: return "SET_DISK_CONTROL_INTERFACE";
                case 14: return "SET_HW_RENDER";
                case 15: return "GET_VARIABLE";
                case 16: return "SET_VARIABLES";
                case 17: return "GET_VARIABLE_UPDATE";
                case 18: return "SET_SUPPORT_NO_GAME";
                case 19: return "GET_LIBRETRO_PATH";
                case 21: return "SET_FRAME_TIME_CALLBACK";
                case 22: return "SET_AUDIO_CALLBACK";
                case 23: return "GET_RUMBLE_INTERFACE";
                case 24: return "GET_INPUT_DEVICE_CAPABILITIES";
                case 25: return "GET_SENSOR_INTERFACE";
                case 26: return "GET_CAMERA_INTERFACE";
                case 27: return "GET_LOG_INTERFACE";
                case 28: return "GET_PERF_INTERFACE";
                case 29: return "GET_LOCATION_INTERFACE";
                case 30: return "GET_CORE_ASSETS_DIRECTORY";
                case 31: return "GET_SAVE_DIRECTORY";
                case 32: return "SET_SYSTEM_AV_INFO";
                case 33: return "SET_PROC_ADDRESS_CALLBACK";
                case 34: return "SET_SUBSYSTEM_INFO";
                case 35: return "SET_CONTROLLER_INFO";
                case 36: return "SET_MEMORY_MAPS";
                case 37: return "SET_GEOMETRY";
                case 38: return "GET_USERNAME";
                case 39: return "GET_LANGUAGE";
                case 40: return "GET_CURRENT_SOFTWARE_FRAMEBUFFER";
                case 45: return "GET_VFS_INTERFACE";
                case 46: return "GET_LED_INTERFACE";
                case 47: return "GET_AUDIO_VIDEO_ENABLE";
                case 48: return "GET_MIDI_INTERFACE";
                case 49: return "GET_FASTFORWARDING";
                case 50: return "GET_TARGET_REFRESH_RATE";
                case 51: return "GET_INPUT_BITMASKS";
                case 52: return "GET_CORE_OPTIONS_VERSION";
                case 53: return "SET_CORE_OPTIONS";
                case 54: return "SET_CORE_OPTIONS_INTL";
                case 55: return "SET_CORE_OPTIONS_DISPLAY";
                case 56: return "GET_PREFERRED_HW_RENDER";
                case 57: return "GET_DISK_CONTROL_INTERFACE_VERSION";
                case 58: return "SET_DISK_CONTROL_EXT_INTERFACE";
                case 59: return "GET_MESSAGE_INTERFACE_VERSION";
                case 60: return "SET_MESSAGE_EXT";
                case 61: return "GET_INPUT_MAX_USERS";
                case 62: return "SET_AUDIO_BUFFER_STATUS_CALLBACK";
                case 63: return "SET_MINIMUM_AUDIO_LATENCY";
                case 64: return "SET_FASTFORWARDING_OVERRIDE";
                case 65: return "SET_CONTENT_INFO_OVERRIDE";
                case 66: return "GET_GAME_INFO_EXT";
                case 67: return "SET_CORE_OPTIONS_V2";
                case 68: return "SET_CORE_OPTIONS_V2_INTL";
                case 69: return "SET_CORE_OPTIONS_UPDATE_DISPLAY_CALLBACK";
                case 70: return "SET_VARIABLE";
                case 71: return "GET_THROTTLE_STATE";
                case 72: return "GET_SAVESTATE_CONTEXT";
                default: return "UNKNOWN";
            }
        }
    }
}
