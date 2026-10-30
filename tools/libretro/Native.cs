using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

namespace NestLibretro
{
    /// <summary>
    /// UTF-8 / unmanaged-memory helpers shared by the host.
    ///
    /// libretro passes every string as UTF-8 <c>char*</c>. .NET Framework 4.0 has
    /// no <c>Marshal.PtrToStringUTF8</c>, and ANSI conversion mangles Chinese
    /// paths, so strings are decoded by hand.
    /// </summary>
    internal static class Native
    {
        // Every string handed to native code stays alive for the whole process.
        // The core keeps the pointers from the environment callback, so freeing
        // them would dangle immediately.
        private static readonly List<IntPtr> Strings = new List<IntPtr>();

        [DllImport("kernel32.dll", EntryPoint = "RtlMoveMemory")]
        private static extern void RtlMoveMemory(IntPtr destination, IntPtr source, UIntPtr length);

        /// <summary>Fast unmanaged-to-unmanaged copy (frame rows).</summary>
        public static void CopyMemory(IntPtr destination, IntPtr source, int length)
        {
            if (length > 0) RtlMoveMemory(destination, source, (UIntPtr)(uint)length);
        }

        public static string Utf8ToString(IntPtr ptr)
        {
            if (ptr == IntPtr.Zero) return null;

            int length = 0;
            while (Marshal.ReadByte(ptr, length) != 0) length++;
            if (length == 0) return string.Empty;

            byte[] bytes = new byte[length];
            Marshal.Copy(ptr, bytes, 0, length);
            return Encoding.UTF8.GetString(bytes);
        }

        /// <summary>Allocates a UTF-8 copy of <paramref name="text"/> (process lifetime).</summary>
        public static IntPtr AllocUtf8(string text)
        {
            if (text == null) return IntPtr.Zero;

            byte[] bytes = Encoding.UTF8.GetBytes(text);
            IntPtr ptr = Marshal.AllocHGlobal(bytes.Length + 1);
            Marshal.Copy(bytes, 0, ptr, bytes.Length);
            Marshal.WriteByte(ptr, bytes.Length, 0);
            Strings.Add(ptr);
            return ptr;
        }
    }

    /// <summary>Small timestamped logger: stderr (live) plus an optional file.</summary>
    internal static class Log
    {
        private static readonly object Gate = new object();
        private static string _path;
        private static int _fileLines;

        public static void Open(string path)
        {
            _path = path;
            if (string.IsNullOrEmpty(_path)) return;

            string dir = System.IO.Path.GetDirectoryName(_path);
            if (!string.IsNullOrEmpty(dir)) System.IO.Directory.CreateDirectory(dir);

            // A header per run keeps the evidence files readable when re-used.
            AppendLine("# nest-libretro " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
        }

        public static void Write(string message)
        {
            string line = DateTime.Now.ToString("HH:mm:ss.fff") + " " + message;
            lock (Gate)
            {
                try { Console.Error.WriteLine(line); }
                catch { }

                if (_path != null)
                {
                    AppendLine(line);
                    _fileLines++;
                }
            }
        }

        public static void Error(string message)
        {
            Write("ERROR " + message);
        }

        private static void AppendLine(string line)
        {
            try { System.IO.File.AppendAllText(_path, line + Environment.NewLine); }
            catch { }
        }
    }
}
