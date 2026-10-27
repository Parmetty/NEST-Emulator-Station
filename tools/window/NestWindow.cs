using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

/// <summary>
/// Nest window watcher.
///
/// Some engines keep their launcher process alive after the game window is
/// closed (Dolphin's GUI stays in the taskbar). For "system mode" the session
/// should end when the *emulation window* goes away, not when the process dies.
///
/// This tool snapshots the process's visible top-level windows, waits for a new
/// one to appear (the render window), then exits 0 as soon as that window is
/// gone. Nest then stops the session.
///
///   nest-window.exe --pid 1234 [--timeout 21600] [--log file]
/// </summary>
internal static class Program
{
    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumProc callback, IntPtr param);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);

    [DllImport("user32.dll")]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    private delegate bool EnumProc(IntPtr hWnd, IntPtr param);

    private static string _log;

    private static void Log(string message)
    {
        if (_log == null) return;
        try { System.IO.File.AppendAllText(_log, DateTime.Now.ToString("o") + " " + message + Environment.NewLine); }
        catch { }
    }

    private static Dictionary<IntPtr, string> VisibleWindows(int pid)
    {
        var result = new Dictionary<IntPtr, string>();
        EnumWindows((hWnd, param) =>
        {
            uint owner;
            GetWindowThreadProcessId(hWnd, out owner);
            if (owner != pid || !IsWindowVisible(hWnd)) return true;
            var text = new StringBuilder(512);
            GetWindowText(hWnd, text, text.Capacity);
            string caption = text.ToString();
            if (caption.Length == 0) return true;
            result[hWnd] = caption;
            return true;
        }, IntPtr.Zero);
        return result;
    }

    private static int Main(string[] args)
    {
        int pid = 0;
        int timeoutSec = 21600;
        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--pid": int.TryParse(args[++i], out pid); break;
                case "--timeout": int.TryParse(args[++i], out timeoutSec); break;
                case "--log": _log = args[++i]; break;
                default:
                    Console.Error.WriteLine("unknown argument: " + args[i]);
                    return 2;
            }
        }
        if (pid == 0)
        {
            Console.Error.WriteLine("usage: nest-window --pid <pid> [--timeout seconds] [--log file]");
            return 2;
        }

        Log("start pid=" + pid);
        var deadline = DateTime.UtcNow.AddSeconds(timeoutSec);

        // Wait for the launcher window to exist before taking the baseline, then
        // treat any window that appears afterwards as the emulation window.
        Dictionary<IntPtr, string> initial = null;
        while (DateTime.UtcNow < deadline)
        {
            try { Process.GetProcessById(pid); }
            catch { Log("process exited before baseline"); return 0; }
            var windows = VisibleWindows(pid);
            if (windows.Count > 0) { initial = windows; break; }
            Thread.Sleep(200);
        }
        if (initial == null) { Log("no window appeared"); return 2; }
        Log("baseline windows=" + initial.Count);

        IntPtr render = IntPtr.Zero;
        string renderTitle = null;

        while (DateTime.UtcNow < deadline)
        {
            try { Process.GetProcessById(pid); }
            catch
            {
                Log("process exited");
                return 0;
            }

            var current = VisibleWindows(pid);

            if (render == IntPtr.Zero)
            {
                foreach (var pair in current)
                {
                    if (initial.ContainsKey(pair.Key)) continue;
                    render = pair.Key;
                    renderTitle = pair.Value;
                    Log("emulation window appeared: " + renderTitle);
                    break;
                }
            }
            else if (!current.ContainsKey(render))
            {
                Log("emulation window closed: " + renderTitle);
                return 0;
            }

            Thread.Sleep(400);
        }

        Log("timeout");
        return 2;
    }
}
