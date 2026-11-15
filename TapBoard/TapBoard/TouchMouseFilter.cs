using System;
using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;

namespace TapBoard
{
    // This policy handles only the legacy mouse stream, never WM_TOUCH.
    internal sealed class TouchMousePolicy
    {
        private int blockedButtons;
        private int passedButtons;
        private volatile bool keyboardPrimaryTouch;

        internal void SetPrimaryTouch(bool active) { keyboardPrimaryTouch = active; }

        internal static bool IsTouchMouse(ulong extraInfo)
        {
            // Microsoft tablet signature plus the touch (rather than pen) bit.
            return (extraInfo & 0xFFFFFF80UL) == 0xFF515780UL;
        }

        internal bool ShouldBlock(int message, Point point, ulong extraInfo, Rectangle area)
        {
            if (!IsTouchMouse(extraInfo)) return false;
            // Press-and-hold can use the unchanged mouse cursor position rather
            // than the touch position. Raw primary-touch ownership disambiguates it.
            bool inside = area.Contains(point) || (keyboardPrimaryTouch && !area.IsEmpty);
            int down = message == 0x0201 ? 1 : message == 0x0204 ? 2 : 0;
            int up = message == 0x0202 ? 1 : message == 0x0205 ? 2 : 0;
            if (down != 0)
            {
                // A contact which starts elsewhere must retain its matching up
                // even if it subsequently moves over the keyboard.
                bool block = blockedButtons != 0 || (passedButtons == 0 && inside);
                if (block) blockedButtons |= down;
                else passedButtons |= down;
                return block;
            }
            if (up != 0)
            {
                bool blocked = (blockedButtons & up) != 0;
                bool passed = (passedButtons & up) != 0;
                blockedButtons &= ~up;
                passedButtons &= ~up;
                return blocked || (!passed && inside);
            }
            // Suppress the rest of a blocked touch even if it leaves the area.
            // Physical mouse packets never enter this state machine.
            return blockedButtons != 0 || (passedButtons == 0 && inside);
        }
    }

    internal sealed class TouchMouseFilter : IDisposable
    {
        private sealed class Region
        {
            internal readonly Rectangle Bounds;
            internal Region(Rectangle bounds) { Bounds = bounds; }
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct NativePoint { public int x, y; }
        [StructLayout(LayoutKind.Sequential)]
        private struct MouseHookInfo
        {
            public NativePoint point;
            public uint mouseData, flags, time;
            public UIntPtr extraInfo;
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct NativeMessage
        {
            public IntPtr window;
            public uint message;
            public UIntPtr wParam;
            public IntPtr lParam;
            public uint time;
            public NativePoint point;
            public uint privateData;
        }

        private delegate IntPtr HookProc(int code, IntPtr message, IntPtr data);
        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int hookType, HookProc callback, IntPtr module, uint thread);
        [DllImport("user32.dll")]
        private static extern bool UnhookWindowsHookEx(IntPtr hook);
        [DllImport("user32.dll")]
        private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        private static extern IntPtr GetModuleHandle(string name);
        [DllImport("kernel32.dll")]
        private static extern uint GetCurrentThreadId();
        [DllImport("user32.dll")]
        private static extern bool PeekMessage(out NativeMessage message, IntPtr window, uint min, uint max, uint flags);
        [DllImport("user32.dll")]
        private static extern int GetMessage(out NativeMessage message, IntPtr window, uint min, uint max);
        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool PostThreadMessage(uint thread, uint message, UIntPtr wParam, IntPtr lParam);

        private readonly object lifecycle = new object();
        private readonly TouchMousePolicy policy = new TouchMousePolicy();
        private readonly HookProc callback;
        private readonly Thread worker;
        private volatile Region region;
        private volatile bool stopping;
        private uint workerId;
        private IntPtr hook;
        internal volatile int InstallError;
        internal volatile bool IsInstalled;

        internal TouchMouseFilter(Rectangle bounds)
        {
            region = new Region(bounds);
            callback = FilterMouse;
            worker = new Thread(Run) { IsBackground = true, Name = "TapBoard touch mouse filter" };
            worker.Start();
        }

        internal void UpdateBounds(Rectangle bounds) { region = new Region(bounds); }
        internal void SetPrimaryTouch(bool active) { policy.SetPrimaryTouch(active); }

        private IntPtr FilterMouse(int code, IntPtr message, IntPtr data)
        {
            if (code >= 0 && !stopping)
            {
                MouseHookInfo input = Marshal.PtrToStructure<MouseHookInfo>(data);
                if (policy.ShouldBlock(message.ToInt32(), new Point(input.point.x, input.point.y),
                    input.extraInfo.ToUInt64(), region.Bounds)) return new IntPtr(1);
            }
            return CallNextHookEx(hook, code, message, data);
        }

        private void Run()
        {
            try
            {
                NativeMessage message;
                // Create this thread's queue before exposing its ID to Dispose.
                PeekMessage(out message, IntPtr.Zero, 0, 0, 0);
                lock (lifecycle)
                {
                    if (stopping) return;
                    workerId = GetCurrentThreadId();
                }
                hook = SetWindowsHookEx(14, callback, GetModuleHandle(null), 0); // WH_MOUSE_LL
                if (hook == IntPtr.Zero)
                {
                    InstallError = Marshal.GetLastWin32Error();
                    if (InstallError == 0) InstallError = -1;
                    return;
                }
                IsInstalled = true;
                while (GetMessage(out message, IntPtr.Zero, 0, 0) > 0) { }
            }
            catch (Exception ex) { InstallError = -1; Debug.WriteLine(ex); }
            finally
            {
                if (hook != IntPtr.Zero) { UnhookWindowsHookEx(hook); hook = IntPtr.Zero; }
                IsInstalled = false;
                GC.KeepAlive(callback);
            }
        }

        public void Dispose()
        {
            lock (lifecycle)
            {
                if (!stopping)
                {
                    stopping = true;
                    region = new Region(Rectangle.Empty);
                    if (workerId != 0) PostThreadMessage(workerId, 0x0012, UIntPtr.Zero, IntPtr.Zero); // WM_QUIT
                }
            }
            // No UI work is dispatched by the callback, so it is safe to wait
            // briefly for explicit unhooking before the form/process exits.
            if (Thread.CurrentThread != worker) worker.Join(1000);
        }
    }
}
