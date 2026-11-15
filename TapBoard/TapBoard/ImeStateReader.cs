using System;
using System.Runtime.InteropServices;

namespace TapBoard
{
    internal static class ImeStateReader
    {
        [StructLayout(LayoutKind.Sequential)]
        private struct Rect { public int left, top, right, bottom; }
        [StructLayout(LayoutKind.Sequential)]
        private struct GuiThreadInfo
        {
            public int size;
            public uint flags;
            public IntPtr active, focus, capture, menuOwner, moveSize, caret;
            public Rect caretRect;
        }
        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
        [DllImport("user32.dll")]
        private static extern IntPtr GetKeyboardLayout(uint threadId);
        [DllImport("user32.dll")]
        private static extern bool GetGUIThreadInfo(uint threadId, ref GuiThreadInfo info);
        [DllImport("imm32.dll")]
        private static extern IntPtr ImmGetDefaultIMEWnd(IntPtr window);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern IntPtr SendMessageTimeout(IntPtr window, uint message,
            UIntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result);

        public static bool TryGetKoreanMode(out bool korean)
        {
            korean = false;
            IntPtr foreground = GetForegroundWindow();
            if (foreground == IntPtr.Zero) return false;
            uint processId;
            uint thread = GetWindowThreadProcessId(foreground, out processId);
            if (thread == 0) return false;
            IntPtr layout = GetKeyboardLayout(thread);
            if (layout == IntPtr.Zero) return false;
            // Korean IME can itself be in Latin mode; language alone is insufficient.
            if ((layout.ToInt64() & 0x3ff) != 0x12) return true;

            GuiThreadInfo info = new GuiThreadInfo { size = Marshal.SizeOf(typeof(GuiThreadInfo)) };
            IntPtr target = GetGUIThreadInfo(thread, ref info) && info.focus != IntPtr.Zero
                ? info.focus : foreground;
            IntPtr imeWindow = ImmGetDefaultIMEWnd(target);
            if (imeWindow == IntPtr.Zero) imeWindow = ImmGetDefaultIMEWnd(foreground);
            if (imeWindow == IntPtr.Zero) return false;

            // Query the target app, not TapBoard. Bound calls to avoid hangs.
            UIntPtr open, conversion;
            const uint WmImeControl = 0x0283;
            if (SendMessageTimeout(imeWindow, WmImeControl, new UIntPtr(5), IntPtr.Zero,
                0x0003, 25, out open) == IntPtr.Zero) return false;
            if (open == UIntPtr.Zero) return true;
            if (SendMessageTimeout(imeWindow, WmImeControl, new UIntPtr(1), IntPtr.Zero,
                0x0003, 25, out conversion) == IntPtr.Zero) return false;
            korean = (conversion.ToUInt64() & 1) != 0; // IME_CMODE_NATIVE
            return true;
        }
    }
}
