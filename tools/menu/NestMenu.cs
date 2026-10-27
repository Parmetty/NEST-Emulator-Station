using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;

/// <summary>
/// Nest menu helper.
///
/// Some engines expose "system mode" only through their GUI menu (Dolphin:
/// Tools → Load GameCube Main Menu → NTSC-U). Keyboard automation needs the
/// foreground, which fails while Nest owns the screen; UI Automation can drive
/// the menu without stealing focus for keystrokes, but opening a Qt menu does
/// grab input while it is open — so this tool makes exactly one short attempt
/// and always closes the menu again, even on failure.
///
///   nest-menu.exe --pid 1234 --menu "GameCube" --item "NTSC-U"
///                 [--delay 9000] [--minimize] [--log file]
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
    private static extern bool ShowWindow(IntPtr hWnd, int command);

    private delegate bool EnumProc(IntPtr hWnd, IntPtr param);

    private const int SW_MINIMIZE = 6;
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

    private static AutomationElement[] MenuItems(AutomationElement root)
    {
        var condition = new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.MenuItem);
        var found = root.FindAll(TreeScope.Descendants, condition);
        var result = new AutomationElement[found.Count];
        for (int i = 0; i < found.Count; i++) result[i] = found[i];
        return result;
    }

    /// <summary>
    /// Menu popups are separate top-level windows, so their items are not always
    /// reachable from the app window handle while the menu is animating. The
    /// desktop root stays valid and sees them.
    /// </summary>
    private static AutomationElement FindByName(AutomationElement root, string text, string excludePrefix)
    {
        var item = FindByNameIn(root, text, excludePrefix);
        if (item != null) return item;
        return FindByNameIn(AutomationElement.RootElement, text, excludePrefix);
    }

    private static AutomationElement FindByNameIn(AutomationElement root, string text, string excludePrefix)
    {
        foreach (AutomationElement item in MenuItems(root))
        {
            string name = item.Current.Name ?? string.Empty;
            if (name.Length == 0) continue;
            if (name.IndexOf(text, StringComparison.OrdinalIgnoreCase) < 0) continue;
            if (excludePrefix != null && name.StartsWith(excludePrefix, StringComparison.OrdinalIgnoreCase)) continue;
            return item;
        }
        return null;
    }

    private static bool Expand(AutomationElement element)
    {
        object pattern;
        if (!element.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out pattern)) return false;
        ((ExpandCollapsePattern)pattern).Expand();
        return true;
    }

    private static void Collapse(AutomationElement element)
    {
        try
        {
            object pattern;
            if (element != null && element.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out pattern))
                ((ExpandCollapsePattern)pattern).Collapse();
        }
        catch { /* the menu may already be gone */ }
    }

    private static int Main(string[] args)
    {
        int pid = 0;
        string menuText = null;
        string itemText = null;
        string title = null;
        int delayMs = 9000;
        bool minimize = false;

        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--pid": int.TryParse(args[++i], out pid); break;
                case "--menu": menuText = args[++i]; break;
                case "--item": itemText = args[++i]; break;
                case "--title": title = args[++i]; break;
                case "--delay": int.TryParse(args[++i], out delayMs); break;
                case "--minimize": minimize = true; break;
                case "--log": _log = args[++i]; break;
                default:
                    Console.Error.WriteLine("unknown argument: " + args[i]);
                    return 2;
            }
        }
        if (pid == 0 || string.IsNullOrEmpty(menuText) || string.IsNullOrEmpty(itemText))
        {
            Console.Error.WriteLine("usage: nest-menu --pid <pid> --menu <text> --item <text> [--title text] [--delay ms] [--minimize] [--log file]");
            return 2;
        }

        try
        {
            return Run(pid, menuText, itemText, title, delayMs, minimize);
        }
        catch (Exception ex)
        {
            // A Qt menu that closes under us raises COMException; that must never
            // take the helper down, it only means "we missed the window".
            Log("aborted: " + ex.GetType().Name + ": " + ex.Message);
            return 1;
        }
    }

    private static int Run(int pid, string menuText, string itemText, string title, int delayMs, bool minimize)
    {
        Log("start pid=" + pid + " menu=" + menuText + " item=" + itemText);

        IntPtr window = IntPtr.Zero;
        for (int i = 0; i < 80 && window == IntPtr.Zero; i++)
        {
            try { Process.GetProcessById(pid); }
            catch { Log("process gone"); return 0; }
            window = FindWindow(pid, title);
            if (window == IntPtr.Zero) Thread.Sleep(250);
        }
        if (window == IntPtr.Zero) { Log("window never appeared"); return 1; }

        Thread.Sleep(delayMs);

        AutomationElement root;
        try { root = AutomationElement.FromHandle(window); }
        catch (Exception ex) { Log("uia attach failed: " + ex.Message); return 1; }

        // Qt only materialises submenu children while the frame is active.
        try { root.SetFocus(); } catch { }
        Thread.Sleep(200);

        AutomationElement parent = null;
        AutomationElement openMenu = null;

        try
        {
            // Find which top-level menu holds the target, opening one at a time.
            foreach (AutomationElement candidate in MenuItems(root))
            {
                string name = candidate.Current.Name ?? string.Empty;
                if (name.Length == 0) continue;

                if (name.IndexOf(menuText, StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    parent = candidate;
                    break;
                }

                if (!Expand(candidate)) continue;
                openMenu = candidate;
                Thread.Sleep(300);

                parent = FindByName(root, menuText, name);
                if (parent != null) break;

                Collapse(candidate);
                openMenu = null;
            }

            if (parent == null) { Log("menu item not found: " + menuText); return 1; }

            if (!Expand(parent)) { Log("cannot expand: " + parent.Current.Name); return 1; }
            Log("expanded " + parent.Current.Name);
            Thread.Sleep(500);

            AutomationElement target = null;
            for (int attempt = 0; attempt < 6 && target == null; attempt++)
            {
                target = FindByName(root, itemText, parent.Current.Name);
                if (target == null) Thread.Sleep(250);
            }
            if (target == null) { Log("submenu item not found: " + itemText); return 1; }

            object invoke;
            if (!target.TryGetCurrentPattern(InvokePattern.Pattern, out invoke))
            {
                Log("cannot invoke: " + target.Current.Name);
                return 1;
            }
            ((InvokePattern)invoke).Invoke();
            Log("invoked " + target.Current.Name);
        }
        finally
        {
            // Never leave a menu grabbing the user's mouse.
            Collapse(parent);
            Collapse(openMenu);
        }

        if (minimize)
        {
            Thread.Sleep(1500);
            ShowWindow(window, SW_MINIMIZE);
            Log("launcher minimized");
        }

        return 0;
    }
}
