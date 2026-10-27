using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

/// <summary>
/// Nest input helper.
///
/// Some emulators expose a feature only through their GUI (Dolphin: Tools →
/// Load GameCube Main Menu). This tool waits for the emulator window, brings it
/// to the front and plays a short key sequence, so Nest can boot "system mode"
/// without a human clicking menus.
///
///   nest-input.exe --pid 1234 [--title Dolphin] --keys "alt+t,g,u"
///                 [--delay 9000] [--step 800] [--log file]
///
/// Keys: letters, digits, space, enter, esc, tab, up/down/left/right, f1-f12.
/// Modifiers are joined with '+', sequence items with ','.
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

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int command);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);

    private delegate bool EnumProc(IntPtr hWnd, IntPtr param);

    private const int SW_RESTORE = 9;
    private const uint KEYUP = 2;

    private static string _log;

    private static void Log(string message)
    {
        if (_log == null) return;
        try { System.IO.File.AppendAllText(_log, DateTime.Now.ToString("o") + " " + message + Environment.NewLine); }
        catch { }
    }

    private static IntPtr FindWindow(int pid, string title)
    {
        IntPtr found = IntPtr.Zero;
        EnumWindows((hWnd, param) =>
        {
            uint owner;
            GetWindowThreadProcessId(hWnd, out owner);
            if (owner != pid || !IsWindowVisible(hWnd)) return true;

            var text = new StringBuilder(512);
            GetWindowText(hWnd, text, text.Capacity);
            string caption = text.ToString();
            if (caption.Length == 0) return true;
            if (title != null && caption.IndexOf(title, StringComparison.OrdinalIgnoreCase) < 0) return true;

            found = hWnd;
            return false;
        }, IntPtr.Zero);
        return found;
    }

    private static byte ToVirtualKey(string name)
    {
        if (name.Length == 1)
        {
            char c = char.ToUpperInvariant(name[0]);
            if (c >= 'A' && c <= 'Z') return (byte)c;
            if (c >= '0' && c <= '9') return (byte)c;
        }
        switch (name.ToLowerInvariant())
        {
            case "space": return 0x20;
            case "enter":
            case "return": return 0x0D;
            case "esc":
            case "escape": return 0x1B;
            case "tab": return 0x09;
            case "up": return 0x26;
            case "down": return 0x28;
            case "left": return 0x25;
            case "right": return 0x27;
            case "alt": return 0x12;
            case "ctrl": return 0x11;
            case "shift": return 0x10;
        }
        if (name.Length >= 2 && (name[0] == 'f' || name[0] == 'F'))
        {
            int n;
            if (int.TryParse(name.Substring(1), out n) && n >= 1 && n <= 12) return (byte)(0x70 + n - 1);
        }
        throw new ArgumentException("unknown key: " + name);
    }

    private static bool SendSequence(string spec, int stepMs)
    {
        foreach (string raw in spec.Split(','))
        {
            string item = raw.Trim();
            if (item.Length == 0) continue;

            string[] parts = item.Split('+');
            var held = new List<byte>();
            for (int i = 0; i < parts.Length; i++)
            {
                byte vk = ToVirtualKey(parts[i]);
                held.Add(vk);
                if (i < parts.Length - 1) keybd_event(vk, 0, 0, UIntPtr.Zero);
            }
            byte main = held[held.Count - 1];
            keybd_event(main, 0, 0, UIntPtr.Zero);
            Thread.Sleep(60);
            keybd_event(main, 0, KEYUP, UIntPtr.Zero);
            for (int i = held.Count - 2; i >= 0; i--) keybd_event(held[i], 0, KEYUP, UIntPtr.Zero);
            Thread.Sleep(stepMs);
        }
        return true;
    }

    private static int Main(string[] args)
    {
        int pid = 0;
        string title = null;
        string keys = null;
        int delayMs = 8000;
        int stepMs = 800;

        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--pid": int.TryParse(args[++i], out pid); break;
                case "--title": title = args[++i]; break;
                case "--keys": keys = args[++i]; break;
                case "--delay": int.TryParse(args[++i], out delayMs); break;
                case "--step": int.TryParse(args[++i], out stepMs); break;
                case "--log": _log = args[++i]; break;
                default:
                    Console.Error.WriteLine("unknown argument: " + args[i]);
                    return 2;
            }
        }
        if (pid == 0 || string.IsNullOrEmpty(keys))
        {
            Console.Error.WriteLine("usage: nest-input --pid <pid> [--title text] --keys \"alt+t,g,u\" [--delay ms] [--step ms] [--log file]");
            return 2;
        }

        try { Process.GetProcessById(pid); }
        catch { Log("process gone before start"); return 0; }

        Log("start pid=" + pid + " keys=" + keys);

        // Wait for the window to exist (emulator startup can take a few seconds).
        IntPtr window = IntPtr.Zero;
        for (int i = 0; i < 60 && window == IntPtr.Zero; i++)
        {
            window = FindWindow(pid, title);
            if (window == IntPtr.Zero) Thread.Sleep(250);
        }
        if (window == IntPtr.Zero)
        {
            Log("window never appeared");
            return 1;
        }

        Thread.Sleep(delayMs);
        if (IsIconic(window)) ShowWindow(window, SW_RESTORE);
        SetForegroundWindow(window);
        Thread.Sleep(400);

        if (GetForegroundWindow() != window)
        {
            Log("warning: could not take foreground; keys may go elsewhere");
        }

        try { SendSequence(keys, stepMs); }
        catch (Exception ex) { Log("send failed: " + ex.Message); return 1; }

        Log("sequence sent");
        return 0;
    }
}
