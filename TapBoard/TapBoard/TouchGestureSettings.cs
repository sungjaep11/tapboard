using System;
using System.Diagnostics;
using System.Runtime.InteropServices;


namespace TapBoard
{
    internal static class TouchGestureSettings
    {
        private const uint AllGestures = 1;
        private const int QuerySystemGestureStatus = 0x02CC, GestureNotify = 0x011A;
        private const string TabletProperty = "MicrosoftTabletPenServiceProperty";
        private const int TabletFlags = 0x00010001; // disable press-and-hold and flicks
        [StructLayout(LayoutKind.Sequential)]
        private struct GestureConfig { public uint id, want, block; }
        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetGestureConfig(IntPtr window, uint reserved, uint count,
            ref GestureConfig config, uint size);
        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool SetProp(IntPtr window, string name, IntPtr value);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern IntPtr RemoveProp(IntPtr window, string name);

        internal static void Apply(IntPtr window)
        {
            if (!SetProp(window, TabletProperty, new IntPtr(TabletFlags)))
                Debug.WriteLine("Tablet property failed: " + Marshal.GetLastWin32Error());
            BlockGestures(window);
        }

        private static void BlockGestures(IntPtr window)
        {
            GestureConfig config = new GestureConfig { block = AllGestures }; // GC_ALLGESTURES
            if (!SetGestureConfig(window, 0, 1, ref config, (uint)Marshal.SizeOf(typeof(GestureConfig))))
                Debug.WriteLine("SetGestureConfig failed: " + Marshal.GetLastWin32Error());
        }

        internal static bool HandleMessage(IntPtr window, int message, out IntPtr result)
        {
            result = IntPtr.Zero;
            if (message == QuerySystemGestureStatus) // WM_TABLET_QUERYSYSTEMGESTURESTATUS
            {
                result = new IntPtr(TabletFlags);
                return true;
            }
            if (message == GestureNotify) BlockGestures(window); // WM_GESTURENOTIFY
            return false;
        }

        internal static void Remove(IntPtr window) { RemoveProp(window, TabletProperty); }
    }
}
