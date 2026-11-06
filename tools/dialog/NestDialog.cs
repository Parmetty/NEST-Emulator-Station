using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;

/// <summary>
/// Nest dialog helper. Fast UIA button press for native Windows prompts that an
/// emulator shows at launch (for example Xenia's disclaimer MessageBox).
///
/// It does not use a fixed initial delay: it polls for the dialog every 100 ms,
/// finds the requested button by UIA name (with a Win32 BM_CLICK fallback), and
/// exits as soon as the button was pressed. No keyboard focus is stolen.
///
///   nest-dialog.exe --pid 1234 --title Xenia --button "是" [--timeout 15000] [--log file]
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

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string className, string windowName);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    private delegate bool EnumProc(IntPtr hWnd, IntPtr param);
    private const uint BM_CLICK = 0x00F5;
    private static string _log;

    private static void Log(string message)
    {
        if (_log == null) return;
        try { System.IO.File.AppendAllText(_log, DateTime.Now.ToString("o") + " " + message + Environment.NewLine); }
        catch { }
    }

    private static IntPtr FindDialog(int pid, string title)
    {
        IntPtr exact = IntPtr.Zero;
        IntPtr contains = IntPtr.Zero;
        EnumWindows((hWnd, param) =>
        {
            uint owner;
            GetWindowThreadProcessId(hWnd, out owner);
            if (owner != pid || !IsWindowVisible(hWnd)) return true;
            var text = new StringBuilder(512);
            GetWindowText(hWnd, text, text.Capacity);
            string caption = text.ToString();
            if (caption.Length == 0) return true;
            if (string.Equals(caption, title, StringComparison.OrdinalIgnoreCase))
            {
                exact = hWnd;
                return false;
            }
            if (contains == IntPtr.Zero && caption.IndexOf(title, StringComparison.OrdinalIgnoreCase) >= 0)
                contains = hWnd;
            return true;
        }, IntPtr.Zero);
        return exact != IntPtr.Zero ? exact : contains;
    }

    private static bool ClickButton(IntPtr dialog, string buttonText)
    {
        try
        {
            var root = AutomationElement.FromHandle(dialog);
            var condition = new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button);
            foreach (AutomationElement button in root.FindAll(TreeScope.Descendants, condition))
            {
                string name = button.Current.Name ?? string.Empty;
                if (name.Length == 0) continue;
                if (name.IndexOf(buttonText, StringComparison.OrdinalIgnoreCase) < 0 &&
                    !name.StartsWith("是", StringComparison.OrdinalIgnoreCase) &&
                    !name.StartsWith("Yes", StringComparison.OrdinalIgnoreCase) &&
                    !name.StartsWith("OK", StringComparison.OrdinalIgnoreCase) &&
                    !name.StartsWith("确定", StringComparison.OrdinalIgnoreCase)) continue;
                object pattern;
                if (button.TryGetCurrentPattern(InvokePattern.Pattern, out pattern))
                {
                    ((InvokePattern)pattern).Invoke();
                    Log("clicked via UIA: " + name);
                    return true;
                }
            }
        }
        catch (Exception ex)
        {
            Log("uia click failed: " + ex.GetType().Name + ": " + ex.Message);
        }

        // Native MessageBox fallback: enumerate child Button windows.
        IntPtr child = IntPtr.Zero;
        while ((child = FindWindowEx(dialog, child, "Button", null)) != IntPtr.Zero)
        {
            var cls = new StringBuilder(64);
            var text = new StringBuilder(512);
            GetClassName(child, cls, cls.Capacity);
            GetWindowText(child, text, text.Capacity);
            string label = text.ToString();
            if (label.IndexOf(buttonText, StringComparison.OrdinalIgnoreCase) < 0 &&
                !label.StartsWith("是", StringComparison.OrdinalIgnoreCase) &&
                !label.StartsWith("Yes", StringComparison.OrdinalIgnoreCase) &&
                !label.StartsWith("OK", StringComparison.OrdinalIgnoreCase) &&
                !label.StartsWith("确定", StringComparison.OrdinalIgnoreCase)) continue;
            SendMessage(child, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
            Log("clicked via WM_CLICK: " + label);
            return true;
        }
        return false;
    }

    private static int Main(string[] args)
    {
        int pid = 0;
        int timeoutMs = 15000;
        string title = "Xenia";
        string button = "是";
        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--pid": int.TryParse(args[++i], out pid); break;
                case "--title": title = args[++i]; break;
                case "--button": button = args[++i]; break;
                case "--timeout": int.TryParse(args[++i], out timeoutMs); break;
                case "--log": _log = args[++i]; break;
                default:
                    Console.Error.WriteLine("unknown argument: " + args[i]);
                    return 2;
            }
        }
        if (pid == 0)
        {
            Console.Error.WriteLine("usage: nest-dialog --pid <pid> [--title text] [--button text] [--timeout ms] [--log file]");
            return 2;
        }

        Log("start pid=" + pid + " title=" + title + " button=" + button);
        var started = DateTime.UtcNow;
        var deadline = started.AddMilliseconds(timeoutMs);
        while (DateTime.UtcNow < deadline)
        {
            try { Process.GetProcessById(pid); }
            catch { Log("process gone"); return 0; }
            IntPtr dialog = FindDialog(pid, title);
            if (dialog != IntPtr.Zero)
            {
                Log("dialog found after " + (int)(DateTime.UtcNow - started).TotalMilliseconds + " ms");
                if (ClickButton(dialog, button))
                {
                    Log("dialog dismissed");
                    return 0;
                }
            }
            Thread.Sleep(100);
        }
        Log("dialog not found before timeout");
        return 1;
    }
}
