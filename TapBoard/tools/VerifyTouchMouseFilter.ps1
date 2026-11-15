param(
    [string]$BuildDirectory = "$PSScriptRoot\..\TapBoard\bin\TouchGuard",
    [switch]$NativeLifecycle
)
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
public static class TouchFilterCheck
{
    private static Type policyType;
    private static MethodInfo shouldBlock;
    [StructLayout(LayoutKind.Sequential)]
    private struct GestureConfig { public uint id, want, block; }
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetGestureConfig(IntPtr window, uint reserved, uint flags,
        ref uint count, ref GestureConfig config, uint size);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr GetProp(IntPtr window, string name);
    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);

    private static void CheckGestureWindow(object control)
    {
        IntPtr handle = (IntPtr)control.GetType().GetProperty("Handle").GetValue(control, null);
        Check((GetProp(handle, "MicrosoftTabletPenServiceProperty").ToInt64() & 1) != 0,
            "Press-and-hold window property is missing");
        Check((SendMessage(handle, 0x02CC, IntPtr.Zero, IntPtr.Zero).ToInt64() & 1) != 0,
            "Gesture status does not disable press-and-hold");
        uint count = 1;
        var config = new GestureConfig { id = 3 }; // GID_ZOOM; dwID=0 is not valid for querying.
        Check(GetGestureConfig(handle, 0, 0, ref count, ref config,
            (uint)Marshal.SizeOf(typeof(GestureConfig))), "Cannot read gesture config: " + Marshal.GetLastWin32Error());
        Check((config.block & 1) != 0, "Legacy gestures remain enabled");
    }
    private static object NewPolicy() { return Activator.CreateInstance(policyType, true); }
    private static bool Block(object policy, int message, int x, int y, ulong source, Rectangle area)
    {
        return (bool)shouldBlock.Invoke(policy, new object[] { message, new Point(x, y), source, area });
    }
    private static void Check(bool value, string message) { if (!value) throw new Exception(message); }
    public static string Run(string path, bool nativeLifecycle)
    {
        Assembly assembly = Assembly.LoadFrom(path);
        policyType = assembly.GetType("TapBoard.TouchMousePolicy", true);
        shouldBlock = policyType.GetMethod("ShouldBlock", BindingFlags.Instance | BindingFlags.NonPublic);
        var area = new Rectangle(0, 1000, 1800, 1200);
        const ulong touch = 0xFF515780;
        var policy = NewPolicy();
        foreach (int message in new[] { 0x200, 0x201, 0x202, 0x204, 0x205, 0x20A })
        {
            Check(!Block(policy, message, 100, 1500, 0, area), "Physical mouse blocked");
            Check(!Block(policy, message, 100, 1500, 0xFF515701, area), "Pen blocked");
            Check(!Block(policy, message, 100, 1500, 0x12345678, area), "Unrelated injected input blocked");
        }
        Check(Block(policy, 0x200, 100, 1500, touch, area), "Touch move over resting area passed");
        Check(Block(policy, 0x200, 100, 1500, 0xFF5157FF, area), "Touch cursor ID changed classification");
        Check(Block(policy, 0x200, 100, 1500, 0xFFFFFFFFFF515780, area), "64-bit signature not recognized");
        Check(!Block(policy, 0x200, 100, 500, touch, area), "Upper-screen touch blocked");
        Check(!Block(policy, 0x200, 1800, 1500, touch, area), "Right boundary exceeded");
        Check(!Block(policy, 0x200, 100, 2200, touch, area), "Bottom boundary exceeded");
        Check(Block(policy, 0x201, 100, 1500, touch, area), "Touch press inside passed");
        Check(Block(policy, 0x200, 100, 500, touch, area), "Blocked contact escaped on movement");
        Check(!Block(policy, 0x200, 100, 500, 0, area), "Physical mouse movement during touch blocked");
        Check(!Block(policy, 0x202, 100, 500, 0, area), "Physical mouse release during touch blocked");
        Check(Block(policy, 0x202, 100, 500, touch, area), "Blocked contact release escaped");
        Check(!Block(policy, 0x200, 100, 500, touch, area), "Suppression persisted after release");
        Check(!Block(policy, 0x201, 100, 500, touch, area), "Outside press blocked");
        Check(!Block(policy, 0x200, 100, 1500, touch, area), "Outside contact blocked after entering area");
        Check(!Block(policy, 0x202, 100, 1500, touch, area), "Outside contact lost its release");
        Check(Block(policy, 0x200, 100, 1500, touch, area), "Region not restored after outside contact");
        policy = NewPolicy();
        Check(!Block(policy, 0x201, 100, 1500, touch, Rectangle.Empty), "Hidden/minimized region blocks touches");
        Check(!Block(policy, 0x202, 100, 1500, touch, Rectangle.Empty), "Hidden/minimized release blocked");
        policy = NewPolicy();
        var negativeArea = new Rectangle(-1800, -1200, 1800, 1200);
        Check(Block(policy, 0x201, -100, -100, touch, negativeArea), "Negative display coordinates failed");
        Check(Block(policy, 0x202, -100, -100, touch, negativeArea), "Negative display release failed");
        string result = "PASS: touch-only signatures, mouse/pen passthrough, region boundaries, cross-region press/release, physical drag continuity, hidden regions and negative display coordinates.";
        policy = NewPolicy();
        var primaryTouch = policyType.GetMethod("SetPrimaryTouch", BindingFlags.Instance | BindingFlags.NonPublic);
        primaryTouch.Invoke(policy, new object[] { true });
        Check(Block(policy, 0x204, 100, 500, touch, area), "Long-press right-click at old cursor position escaped");
        Check(!Block(policy, 0x204, 100, 500, 0, area), "Physical right-click during touch blocked");
        Check(!Block(policy, 0x205, 100, 500, 0, area), "Physical right release during touch blocked");
        primaryTouch.Invoke(policy, new object[] { false });
        Check(Block(policy, 0x205, 100, 500, touch, area), "Delayed long-press right release escaped");
        Check(!Block(policy, 0x204, 100, 500, touch, area), "Upper-screen long-press blocked after contact ended");
        Check(!Block(policy, 0x205, 100, 500, touch, area), "Upper-screen right release blocked");
        result += Environment.NewLine + "PASS: primary-touch long-press at old cursor coordinates, delayed release, and physical/upper-screen right-click preservation.";
        if (nativeLifecycle)
        {
            // Construct hidden windows; never show or interact with the user's desktop.
            Type keyboardType = assembly.GetType("TapBoard.Keyboard", true);
            using (var form = (IDisposable)Activator.CreateInstance(keyboardType))
            {
                CheckGestureWindow(form);
                object touchControl = keyboardType.GetField("keyArea", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(form);
                CheckGestureWindow(touchControl);
            }
            result += Environment.NewLine + "PASS: press-and-hold property, gesture status response and native gesture configuration on both hidden form and touch control.";
            Type filterType = assembly.GetType("TapBoard.TouchMouseFilter", true);
            var constructor = filterType.GetConstructor(BindingFlags.Instance | BindingFlags.NonPublic,
                null, new[] { typeof(Rectangle) }, null);
            var installed = filterType.GetField("IsInstalled", BindingFlags.Instance | BindingFlags.NonPublic);
            var error = filterType.GetField("InstallError", BindingFlags.Instance | BindingFlags.NonPublic);
            var worker = filterType.GetField("worker", BindingFlags.Instance | BindingFlags.NonPublic);
            // Empty region: verify the real hook lifetime without suppressing any input.
            IDisposable filter = (IDisposable)constructor.Invoke(new object[] { Rectangle.Empty });
            try
            {
                bool completed = SpinWait.SpinUntil(() => (bool)installed.GetValue(filter) || (int)error.GetValue(filter) != 0, 3000);
                Check(completed && (bool)installed.GetValue(filter), "Native hook install failed: " + error.GetValue(filter));
                filter.Dispose();
                Check(!(bool)installed.GetValue(filter), "Hook remained installed after Dispose");
                Check(!((Thread)worker.GetValue(filter)).IsAlive, "Hook worker remained alive");
                filter.Dispose();
            }
            finally { filter.Dispose(); }
            // Cover shutdown before the worker has initialized its queue.
            for (int i = 0; i < 3; i++)
            {
                filter = (IDisposable)constructor.Invoke(new object[] { Rectangle.Empty });
                filter.Dispose();
                Check(!((Thread)worker.GetValue(filter)).IsAlive, "Immediate shutdown leaked the worker");
                Check(!(bool)installed.GetValue(filter), "Immediate shutdown leaked the hook");
            }
            result += Environment.NewLine + "PASS: native hook installation, explicit unhook, worker exit, repeated disposal and immediate-start shutdown (empty region; no input suppressed).";
        }
        return result;
    }
}
"@
[TouchFilterCheck]::Run((Join-Path (Resolve-Path $BuildDirectory).Path 'TapBoard.exe'), [bool]$NativeLifecycle)
