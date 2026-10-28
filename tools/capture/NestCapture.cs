using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

/// <summary>
/// Nest capture tool.
///
/// Grabs the *client area* of a window owned by a process — for an emulator that
/// is exactly the emulated screen — and writes PNG frames while the process is
/// alive. Deliberately standalone: no PowerShell, no Electron, no focus stealing.
///
///   nest-capture.exe --pid 1234 --out C:\shots [--interval 5000] [--max 60]
///                    [--aspect 1.5] [--once] [--log C:\shots\capture.log]
///
/// --aspect crops the client area to the console's screen ratio from the top,
/// which drops emulator status bars without guessing about pixel content.
/// </summary>
internal static class Program
{
    [StructLayout(LayoutKind.Sequential)]
    private struct Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Point
    {
        public int X;
        public int Y;
    }

    [DllImport("user32.dll")]
    private static extern bool GetClientRect(IntPtr hWnd, out Rect rect);

    [DllImport("user32.dll")]
    private static extern bool ClientToScreen(IntPtr hWnd, ref Point point);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    private static extern IntPtr WindowFromPoint(Point point);

    [DllImport("user32.dll")]
    private static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr hWnd);

    private const uint GA_ROOT = 2;

    private static string _log;

    private static void Log(string message)
    {
        if (_log == null) return;
        try
        {
            File.AppendAllText(_log, DateTime.Now.ToString("o") + " " + message + Environment.NewLine);
        }
        catch
        {
            // logging must never break capture
        }
    }

    private static int Main(string[] args)
    {
        int pid = 0;
        string outDir = null;
        int intervalMs = 5000;
        int maxFiles = 60;
        double aspect = 0;
        bool once = false;
        bool allowBackground = false;
        bool anchorTop = false;
        int minHeight = 0;
        int cropTop = 0;
        int cropBottom = 0;
        double contentAspect = 0;
        bool topOnly = false;

        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--pid":
                    int.TryParse(args[++i], out pid);
                    break;
                case "--out":
                    outDir = args[++i];
                    break;
                case "--interval":
                    int.TryParse(args[++i], out intervalMs);
                    break;
                case "--max":
                    int.TryParse(args[++i], out maxFiles);
                    break;
                case "--aspect":
                    double.TryParse(args[++i], System.Globalization.NumberStyles.Float,
                        System.Globalization.CultureInfo.InvariantCulture, out aspect);
                    break;
                case "--once":
                    once = true;
                    break;
                case "--allow-background":
                    allowBackground = true;
                    break;
                case "--anchor":
                    anchorTop = args[++i] == "top";
                    break;
                case "--min-height":
                    int.TryParse(args[++i], out minHeight);
                    break;
                case "--crop-top":
                    int.TryParse(args[++i], out cropTop);
                    break;
                case "--crop-bottom":
                    int.TryParse(args[++i], out cropBottom);
                    break;
                case "--content-aspect":
                    double.TryParse(args[++i], System.Globalization.NumberStyles.Float,
                        System.Globalization.CultureInfo.InvariantCulture, out contentAspect);
                    break;
                case "--top-only":
                    topOnly = true;
                    break;
                case "--log":
                    _log = args[++i];
                    break;
                default:
                    Console.Error.WriteLine("unknown argument: " + args[i]);
                    return 2;
            }
        }

        if (pid == 0 || string.IsNullOrEmpty(outDir))
        {
            Console.Error.WriteLine("usage: nest-capture --pid <pid> --out <dir> [--interval ms] [--max n] [--aspect r] [--min-height px] [--crop-top px@96dpi] [--crop-bottom px@96dpi] [--once] [--log file]");
            return 2;
        }

        Directory.CreateDirectory(outDir);
        try
        {
            SetProcessDPIAware();
        }
        catch
        {
            // older systems: DPI awareness is best-effort
        }

        Log("start pid=" + pid + " out=" + outDir + " aspect=" + aspect);
        int written = 0;

        while (true)
        {
            Process process;
            try
            {
                process = Process.GetProcessById(pid);
            }
            catch
            {
                Log("process gone");
                return 0;
            }

            IntPtr handle = IntPtr.Zero;
            try
            {
                handle = process.MainWindowHandle;
            }
            catch
            {
                // window may still be creating
            }

            if (handle == IntPtr.Zero || IsIconic(handle))
            {
                Thread.Sleep(400);
                continue;
            }

            if (minHeight > 0)
            {
                Rect size;
                if (GetClientRect(handle, out size) && (size.Bottom - size.Top) < minHeight)
                {
                    Log("skipped small window: " + (size.Bottom - size.Top) + "px");
                    Thread.Sleep(400);
                    continue;
                }
            }

            try
            {
                if (Capture(handle, outDir, aspect, written + 1, allowBackground, anchorTop, cropTop, cropBottom, contentAspect, topOnly))
                {
                    written++;
                    Prune(outDir, maxFiles);
                }
            }
            catch (Exception ex)
            {
                Log("capture failed: " + ex.Message);
            }

            if (once)
            {
                Log("captured " + written + " frame(s)");
                return 0;
            }

            Thread.Sleep(intervalMs);
        }
    }

    private static bool Capture(IntPtr handle, string outDir, double aspect, int index, bool allowBackground, bool anchorTop,
        int cropTop, int cropBottom, double contentAspect, bool topOnly)
    {
        Rect rect;
        if (!GetClientRect(handle, out rect)) return false;

        int width = rect.Right - rect.Left;
        int height = rect.Bottom - rect.Top;
        if (width <= 0 || height <= 0) return false;

        Point origin = new Point();
        origin.X = 0;
        origin.Y = 0;
        if (!ClientToScreen(handle, ref origin)) return false;

        // Screen capture only sees what is on top, and a window that just
        // appeared can already own its rectangle while still showing whatever
        // was underneath. Require the emulator to be the foreground window.
        if (!allowBackground && GetForegroundWindow() != handle)
        {
            Log("skipped frame: window is not in the foreground");
            return false;
        }

        Point center = new Point();
        center.X = origin.X + width / 2;
        center.Y = origin.Y + height / 2;
        IntPtr covered = WindowFromPoint(center);
        if (!allowBackground && covered != IntPtr.Zero && GetAncestor(covered, GA_ROOT) != handle)
        {
            Log("skipped frame: window is occluded");
            return false;
        }

        // Frontend chrome (Azahar: menu bar + status bar) is given in 96-DPI
        // units; scale it so 125%/150% displays trim the right number of pixels.
        int dpi = 96;
        try
        {
            dpi = (int)GetDpiForWindow(handle);
        }
        catch
        {
            dpi = 96;
        }
        if (dpi <= 0) dpi = 96;

        int trimTop = (int)Math.Ceiling(cropTop * dpi / 96.0);
        int trimBottom = (int)Math.Ceiling(cropBottom * dpi / 96.0);
        if (trimTop < 0) trimTop = 0;
        if (trimBottom < 0) trimBottom = 0;
        if (trimTop + trimBottom >= height)
        {
            trimTop = 0;
            trimBottom = 0;
        }

        int cropTopPx = trimTop;
        int cropHeight = height - trimTop - trimBottom;

        if (aspect > 0)
        {
            int target = (int)Math.Round(width / aspect);
            if (target > 0 && target < cropHeight)
            {
                int extra = cropHeight - target;
                // Emulators put their chrome on different edges: Qt frontends
                // keep a menu bar at the top (crop from the top, anchor bottom),
                // ares keeps a status bar at the bottom (anchor top).
                cropTopPx += anchorTop ? 0 : extra;
                cropHeight = target;
            }
        }

        // Some frontends letterbox the emulated screen inside a wider window
        // (Azahar keeps both 3DS screens stacked in a landscape window). Crop to
        // the real screen rectangle, centred horizontally, then keep the top
        // screen only when asked.
        int contentLeft = 0;
        if (contentAspect > 0)
        {
            int targetWidth = (int)Math.Round(cropHeight * contentAspect);
            if (targetWidth > 0 && targetWidth < width)
            {
                contentLeft = (width - targetWidth) / 2;
                width = targetWidth;
            }
        }
        if (topOnly && cropHeight > 1)
        {
            cropHeight = cropHeight / 2;
        }

        using (Bitmap bitmap = new Bitmap(width, cropHeight))
        {
            using (Graphics graphics = Graphics.FromImage(bitmap))
            {
                graphics.CopyFromScreen(origin.X + contentLeft, origin.Y + cropTopPx, 0, 0, new Size(width, cropHeight));
            }

            string name = string.Format("shot-{0:yyyyMMdd-HHmmss}-{1:000}.png", DateTime.Now, index);
            bitmap.Save(Path.Combine(outDir, name), ImageFormat.Png);
            Log("saved " + name + " " + width + "x" + cropHeight);
        }

        return true;
    }

    private static void Prune(string outDir, int maxFiles)
    {
        try
        {
            string[] files = Directory.GetFiles(outDir, "shot-*.png");
            if (files.Length <= maxFiles) return;

            Array.Sort(files, StringComparer.OrdinalIgnoreCase);
            int remove = files.Length - maxFiles;
            for (int i = 0; i < remove; i++) File.Delete(files[i]);
        }
        catch
        {
            // pruning is housekeeping only
        }
    }
}
