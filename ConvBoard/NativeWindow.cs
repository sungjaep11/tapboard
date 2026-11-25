using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

namespace TapBoard
{
    internal static class NativeWindow
    {
        internal delegate IntPtr WindowProc(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
        private delegate bool MonitorProc(IntPtr monitor, IntPtr dc, IntPtr rect, IntPtr data);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        internal struct WindowClass
        {
            internal uint size, style;
            internal WindowProc callback;
            internal int classExtra, windowExtra;
            internal IntPtr instance, icon, cursor, brush;
            internal string menuName, className;
            internal IntPtr smallIcon;
        }
        [StructLayout(LayoutKind.Sequential)]
        internal struct Rect { internal int left, top, right, bottom; }
        [StructLayout(LayoutKind.Sequential)]
        internal struct Message
        {
            internal IntPtr hwnd;
            internal uint type;
            internal UIntPtr wParam;
            internal IntPtr lParam;
            internal uint time;
            internal int x, y;
            internal uint privateData;
        }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        internal struct MonitorInfo
        {
            internal int size;
            internal Rect bounds, work;
            internal uint flags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] internal string device;
        }
        [StructLayout(LayoutKind.Sequential)]
        internal struct PaintInfo
        {
            internal IntPtr dc;
            internal int erase;
            internal Rect rect;
            internal int restore, update;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)] internal byte[] reserved;
        }

        [DllImport("user32.dll")] internal static extern bool SetProcessDPIAware();
        [DllImport("shcore.dll")] internal static extern int SetProcessDpiAwareness(int awareness);
        [DllImport("user32.dll")] internal static extern int GetSystemMetrics(int index);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] internal static extern IntPtr GetModuleHandle(string name);
        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] internal static extern ushort RegisterClassEx(ref WindowClass wc);
        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] internal static extern IntPtr CreateWindowEx(uint exStyle, string cls, string title, uint style, int x, int y, int width, int height, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr arg);
        [DllImport("user32.dll")] internal static extern bool ShowWindow(IntPtr hwnd, int command);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] internal static extern IntPtr DefWindowProc(IntPtr hwnd,uint msg,IntPtr w,IntPtr l);
        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] internal static extern int GetMessage(out Message msg, IntPtr hwnd, uint min, uint max);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] internal static extern IntPtr DispatchMessage(ref Message msg);
        [DllImport("user32.dll")] internal static extern bool DestroyWindow(IntPtr hwnd);
        [DllImport("user32.dll")] internal static extern void PostQuitMessage(int code);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] internal static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr w, IntPtr l);
        [DllImport("user32.dll")] internal static extern UIntPtr SetTimer(IntPtr hwnd, UIntPtr id, uint interval, IntPtr callback);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] internal static extern int MessageBox(IntPtr hwnd, string text, string title, uint flags);
        [DllImport("user32.dll")] internal static extern short GetKeyState(int key);
        [DllImport("user32.dll")] internal static extern bool InvalidateRect(IntPtr hwnd, IntPtr rect, bool erase);
        [DllImport("user32.dll")] internal static extern IntPtr BeginPaint(IntPtr hwnd, out PaintInfo info);
        [DllImport("user32.dll")] internal static extern bool EndPaint(IntPtr hwnd, ref PaintInfo info);
        [DllImport("user32.dll")] internal static extern int FillRect(IntPtr dc, ref Rect rect, IntPtr brush);
        [DllImport("user32.dll")] internal static extern int FrameRect(IntPtr dc, ref Rect rect, IntPtr brush);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] internal static extern int DrawText(IntPtr dc,string text,int count,ref Rect rect,uint format);
        [DllImport("gdi32.dll")] internal static extern IntPtr GetStockObject(int id);
        [DllImport("gdi32.dll")] internal static extern uint SetDCBrushColor(IntPtr dc, uint color);
        [DllImport("gdi32.dll")] internal static extern uint SetTextColor(IntPtr dc, uint color);
        [DllImport("gdi32.dll")] internal static extern int SetBkMode(IntPtr dc,int mode);
        [DllImport("gdi32.dll")] internal static extern IntPtr SelectObject(IntPtr dc,IntPtr obj);
        [DllImport("gdi32.dll")] internal static extern bool DeleteObject(IntPtr obj);
        [DllImport("gdi32.dll", CharSet = CharSet.Unicode)] internal static extern IntPtr CreateFont(int height,int width,int angle,int orientation,int weight,uint italic,uint underline,uint strike,uint charset,uint precision,uint clip,uint quality,uint family,string face);
        [DllImport("user32.dll")] private static extern bool EnumDisplayMonitors(IntPtr dc,IntPtr clip,MonitorProc callback,IntPtr data);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool GetMonitorInfo(IntPtr monitor,ref MonitorInfo info);
        [DllImport("gdi32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr CreateDC(string driver,string device,string output,IntPtr init);
        [DllImport("gdi32.dll")] private static extern int GetDeviceCaps(IntPtr dc,int index);
        [DllImport("gdi32.dll")] private static extern bool DeleteDC(IntPtr dc);

        internal static MonitorInfo SelectDisplay(string configured)
        {
            MonitorInfo selected = default(MonitorInfo);
            EnumDisplayMonitors(IntPtr.Zero,IntPtr.Zero,delegate(IntPtr monitor,IntPtr dc,IntPtr rect,IntPtr arg) {
                var info = new MonitorInfo { size = Marshal.SizeOf(typeof(MonitorInfo)) };
                if (!GetMonitorInfo(monitor,ref info)) return true;
                bool exact = string.Equals(info.device,configured,StringComparison.OrdinalIgnoreCase);
                if (exact || selected.device == null || info.bounds.bottom > selected.bounds.bottom) selected = info;
                return !exact;
            },IntPtr.Zero);
            if (selected.device == null) throw new InvalidOperationException("Windows 디스플레이를 찾지 못했습니다.");
            return selected;
        }
        internal static double WidthMm(string device)
        {
            var dc=CreateDC("DISPLAY",device,null,IntPtr.Zero);
            if(dc==IntPtr.Zero) return 0;
            try {return GetDeviceCaps(dc,4);} finally {DeleteDC(dc);}
        }
        internal static void Require(bool ok,string action)
        {
            if(!ok) throw new Win32Exception(Marshal.GetLastWin32Error(),action);
        }
    }
}
