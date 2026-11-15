using System;
using System.Drawing;
using System.Collections.Generic;
using System.Diagnostics;

namespace TapBoard
{
    // TOUCHINPUT coordinates are hundredths of physical screen pixels.
    internal static class WindowsTouchInput
    {
        internal const int Message = 0x0240;
        internal const uint Move = 1, Down = 2, Up = 4, Primary = 16, WantPalm = 2;
        [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
        internal struct NativeTouch
        {
            public int x, y;
            public IntPtr source;
            public uint id, flags, mask, time;
            public UIntPtr extraInfo;
            public uint width, height;
        }
        [System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true)]
        internal static extern bool GetTouchInputInfo(IntPtr handle, uint count,
            [System.Runtime.InteropServices.Out] NativeTouch[] inputs, int size);

        [System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true)]
        internal static extern bool RegisterTouchWindow(IntPtr window, uint flags);
        [System.Runtime.InteropServices.DllImport("user32.dll")]
        internal static extern bool UnregisterTouchWindow(IntPtr window);
        [System.Runtime.InteropServices.DllImport("user32.dll")]
        internal static extern bool CloseTouchInputHandle(IntPtr handle);

    }
}
