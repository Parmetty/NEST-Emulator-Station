using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace NestLibretro
{
    /// <summary>
    /// Minimal crash forensics without a debugger.
    ///
    /// A vectored exception handler is installed first in the chain, so it runs
    /// before the CLR turns a native access violation into SEHException. It
    /// writes the exception code, the faulting module + RVA and a stack scan
    /// (raw stack qwords mapped to module+RVA, read through ReadProcessMemory so
    /// invalid memory cannot fault again) to a dedicated file.
    ///
    /// The module list is snapshotted on demand: SDL3.dll and the libretro core
    /// are loaded after startup, so <see cref="RefreshModules"/> must be called
    /// after they are in memory.
    ///
    /// Only hard CPU exceptions are recorded; CLR exceptions (0xE0434352) and
    /// C++ exceptions (0xE06D7363) are ignored so normal control flow stays
    /// untouched. The handler never throws and always returns
    /// EXCEPTION_CONTINUE_SEARCH.
    /// </summary>
    internal static class CrashGuard
    {
        private const uint EXCEPTION_CONTINUE_SEARCH = 0;

        private const uint EXCEPTION_ACCESS_VIOLATION = 0xC0000005;
        private const uint EXCEPTION_ILLEGAL_INSTRUCTION = 0xC000001D;
        private const uint EXCEPTION_INT_DIVIDE_BY_ZERO = 0xC0000094;
        private const uint EXCEPTION_STACK_OVERFLOW = 0xC00000FD;
        private const uint EXCEPTION_PRIV_INSTRUCTION = 0xC0000096;

        private const uint GENERIC_WRITE = 0x40000000;
        private const uint FILE_SHARE_READ_WRITE = 0x00000003;
        private const uint CREATE_ALWAYS = 2;
        private const uint FILE_ATTRIBUTE_NORMAL = 0x80;

        private const int StackScanBytes = 64 * 1024;

        private struct ModuleRange
        {
            public IntPtr Base;
            public long Size;
            public string Name;
        }

        [UnmanagedFunctionPointer(CallingConvention.Winapi)]
        private delegate int VectoredHandler(IntPtr exceptionPointers);

        [DllImport("kernel32.dll")]
        private static extern IntPtr AddVectoredExceptionHandler(uint first, VectoredHandler handler);

        [DllImport("kernel32.dll")]
        private static extern uint RemoveVectoredExceptionHandler(IntPtr handle);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern IntPtr CreateFileW(string name, uint access, uint share, IntPtr security,
            uint disposition, uint flags, IntPtr template);

        [DllImport("kernel32.dll")]
        private static extern bool WriteFile(IntPtr file, byte[] buffer, uint count, out uint written,
            IntPtr overlapped);

        [DllImport("kernel32.dll")]
        private static extern bool CloseHandle(IntPtr handle);

        [DllImport("kernel32.dll")]
        private static extern IntPtr GetCurrentProcess();

        [DllImport("kernel32.dll")]
        private static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] buffer, IntPtr size,
            out IntPtr bytesRead);

        [DllImport("kernel32.dll")]
        private static extern ushort RtlCaptureStackBackTrace(uint toSkip, uint toCapture, IntPtr[] backTrace,
            out uint hash);

        private static readonly VectoredHandler HandlerDelegate = OnException;
        private static readonly object Gate = new object();

        private static ModuleRange[] _modules = new ModuleRange[0];
        private static IntPtr _file = IntPtr.Zero;
        private static IntPtr _veh;
        private static int _eventCount;
        private const int MaxEvents = 16;

        public static void Install(string dumpPath)
        {
            try
            {
                RefreshModules();

                string full = Path.GetFullPath(dumpPath);
                string dir = Path.GetDirectoryName(full);
                if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
                _file = CreateFileW(full, GENERIC_WRITE, FILE_SHARE_READ_WRITE, IntPtr.Zero,
                    CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, IntPtr.Zero);

                _veh = AddVectoredExceptionHandler(1, HandlerDelegate);
                Log.Write("crash guard installed (dump: " + full + ")");
            }
            catch (Exception ex)
            {
                Log.Write("crash guard install failed: " + ex.Message);
            }
        }

        /// <summary>Re-reads the loaded module list (call again after LoadLibrary).</summary>
        public static void RefreshModules()
        {
            try
            {
                List<ModuleRange> list = new List<ModuleRange>();
                Process process = Process.GetCurrentProcess();
                foreach (ProcessModule module in process.Modules)
                {
                    ModuleRange range = new ModuleRange();
                    range.Base = module.BaseAddress;
                    range.Size = module.ModuleMemorySize;
                    range.Name = module.ModuleName;
                    list.Add(range);
                }
                list.Sort(delegate(ModuleRange a, ModuleRange b)
                {
                    return a.Base.ToInt64().CompareTo(b.Base.ToInt64());
                });
                _modules = list.ToArray();
            }
            catch
            {
                // keep the previous snapshot
            }
        }

        public static void Uninstall()
        {
            try
            {
                if (_veh != IntPtr.Zero)
                {
                    RemoveVectoredExceptionHandler(_veh);
                    _veh = IntPtr.Zero;
                }
                if (_file != IntPtr.Zero)
                {
                    CloseHandle(_file);
                    _file = IntPtr.Zero;
                }
            }
            catch
            {
                // nothing we can do during shutdown
            }
        }

        private static string DescribeAddress(IntPtr address)
        {
            long value = address.ToInt64();

            int low = 0;
            int high = _modules.Length - 1;
            while (low <= high)
            {
                int mid = (low + high) / 2;
                ModuleRange range = _modules[mid];
                long start = range.Base.ToInt64();
                long end = start + range.Size;

                if (value >= start && value < end)
                {
                    return range.Name + "+0x" + (value - start).ToString("X");
                }

                if (value < start) high = mid - 1;
                else low = mid + 1;
            }

            return "0x" + value.ToString("X") + " (unknown module)";
        }

        private static int OnException(IntPtr exceptionPointers)
        {
            try
            {
                if (exceptionPointers == IntPtr.Zero) return (int)EXCEPTION_CONTINUE_SEARCH;

                IntPtr record = Marshal.ReadIntPtr(exceptionPointers);
                if (record == IntPtr.Zero) return (int)EXCEPTION_CONTINUE_SEARCH;

                uint code = (uint)Marshal.ReadInt32(record, 0);
                if (!IsHardFault(code)) return (int)EXCEPTION_CONTINUE_SEARCH;

                lock (Gate)
                {
                    // First-chance faults exist in native code (the core may
                    // probe memory), so keep recording rather than stopping at
                    // the first one; the last event before exit is the fatal one.
                    if (_eventCount >= MaxEvents) return (int)EXCEPTION_CONTINUE_SEARCH;
                    _eventCount++;
                }

                IntPtr address = Marshal.ReadIntPtr(record, 16);
                uint parameterCount = (uint)Marshal.ReadInt32(record, 24);
                IntPtr context = Marshal.ReadIntPtr(exceptionPointers, IntPtr.Size);

                StringBuilder text = new StringBuilder();
                text.AppendLine("=== nest-libretro native crash event #" + _eventCount + " ===");
                text.AppendLine("time: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff"));
                text.AppendLine("exception code: 0x" + code.ToString("X8"));
                text.AppendLine("exception address: " + DescribeAddress(address));

                if (code == EXCEPTION_ACCESS_VIOLATION && parameterCount >= 2)
                {
                    long access = Marshal.ReadIntPtr(record, 32).ToInt64();
                    long faultAddress = Marshal.ReadIntPtr(record, 40).ToInt64();
                    string accessName = access == 0 ? "read" : access == 1 ? "write" : access == 8 ? "execute" : access.ToString();
                    text.AppendLine("access: " + accessName + " at 0x" + faultAddress.ToString("X"));
                    text.AppendLine("fault address: " + DescribeAddress(new IntPtr(faultAddress)));
                }

                // x64 CONTEXT: Rsp at +0x98, Rip at +0xF8.
                long rsp = 0;
                if (context != IntPtr.Zero)
                {
                    rsp = Marshal.ReadIntPtr(context, 0x98).ToInt64();
                    IntPtr rip = Marshal.ReadIntPtr(context, 0xF8);
                    text.AppendLine("context rip: " + DescribeAddress(rip));
                    text.AppendLine("context rsp: 0x" + rsp.ToString("X"));
                }

                // RtlCaptureStackBackTrace is best effort; with mixed native /
                // managed frames it sometimes reports a single frame only.
                IntPtr[] frames = new IntPtr[32];
                uint hash;
                ushort count = 0;
                try
                {
                    count = RtlCaptureStackBackTrace(0, (uint)frames.Length, frames, out hash);
                }
                catch
                {
                }

                text.AppendLine("stack walk (" + count + " frames):");
                for (int i = 0; i < count; i++)
                {
                    text.AppendLine("  #" + i.ToString("00") + " " + DescribeAddress(frames[i]));
                }

                // Raw stack scan: every qword in the first 64 KB above Rsp that
                // points into a known module is a very likely return address.
                text.AppendLine("stack scan:");
                AppendStackScan(text, rsp);

                text.AppendLine("modules:");
                for (int i = 0; i < _modules.Length; i++)
                {
                    text.AppendLine("  " + _modules[i].Name + " base=0x" + _modules[i].Base.ToInt64().ToString("X") +
                                    " size=0x" + _modules[i].Size.ToString("X"));
                }
                text.AppendLine("=== end ===");

                WriteRaw(text.ToString());

                try
                {
                    Console.Error.WriteLine("[crash] native exception 0x" + code.ToString("X8") + " at " +
                                            DescribeAddress(address) + " (dump written)");
                }
                catch
                {
                }
            }
            catch
            {
                // a fault while handling a fault must never recurse
            }

            return (int)EXCEPTION_CONTINUE_SEARCH;
        }

        private static void AppendStackScan(StringBuilder text, long rsp)
        {
            if (rsp == 0) return;

            byte[] buffer = new byte[StackScanBytes];
            IntPtr read;
            bool ok = ReadProcessMemory(GetCurrentProcess(), new IntPtr(rsp), buffer, (IntPtr)buffer.Length, out read);
            int available = ok ? (int)read.ToInt64() : 0;

            if (available <= 0)
            {
                // Near the top of the stack a big read can fail; retry smaller.
                for (int size = 16384; size >= 2048 && available <= 0; size /= 2)
                {
                    buffer = new byte[size];
                    ok = ReadProcessMemory(GetCurrentProcess(), new IntPtr(rsp), buffer, (IntPtr)buffer.Length, out read);
                    available = ok ? (int)read.ToInt64() : 0;
                }
            }

            if (available <= 0)
            {
                text.AppendLine("  (stack memory unreadable)");
                return;
            }

            int printed = 0;
            int slots = available / 8;
            for (int i = 0; i < slots; i++)
            {
                long value = BitConverter.ToInt64(buffer, i * 8);
                if (value < 0x10000) continue;

                string description = DescribeAddress(new IntPtr(value));
                if (description.IndexOf("unknown module", StringComparison.Ordinal) >= 0) continue;

                // Skip values that resolve to our own little helper module,
                // they are less interesting than the core frames.
                text.AppendLine("  [rsp+0x" + (i * 8).ToString("X4") + "] " + description);
                printed++;
                if (printed >= 80) break;
            }

            if (printed == 0) text.AppendLine("  (no module pointers found on the stack)");
        }

        private static bool IsHardFault(uint code)
        {
            switch (code)
            {
                case EXCEPTION_ACCESS_VIOLATION:
                case EXCEPTION_ILLEGAL_INSTRUCTION:
                case EXCEPTION_INT_DIVIDE_BY_ZERO:
                case EXCEPTION_STACK_OVERFLOW:
                case EXCEPTION_PRIV_INSTRUCTION:
                    return true;
                default:
                    return false;
            }
        }

        private static void WriteRaw(string text)
        {
            IntPtr file = _file;
            if (file == IntPtr.Zero) return;

            try
            {
                byte[] bytes = Encoding.ASCII.GetBytes(text);
                uint written;
                WriteFile(file, bytes, (uint)bytes.Length, out written, IntPtr.Zero);
            }
            catch
            {
                // nothing to do
            }
        }
    }
}
