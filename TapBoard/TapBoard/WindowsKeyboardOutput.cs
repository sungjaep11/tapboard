using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace TapBoard
{
    // Inject physical virtual-key transitions, preserving the target's IME and
    // physical modifiers. Own the held Windows key so shutdown can release it.
    internal sealed class WindowsKeyboardOutput : IDisposable
    {
        private const uint InputKeyboard = 1, KeyUp = 2, ExtendedKey = 1;
        private bool windowsKeyDown;
        internal TouchDiagnostics Diagnostics;
        internal bool Send(KeyInputEventArgs args)
        {
            if (args.key == "{WIN_DOWN}" || args.key == "{WIN_UP}")
            {
                windowsKeyDown = args.key == "{WIN_DOWN}";
                SendVirtualKey(0x5B, !windowsKeyDown, true);
                return false;
            }
            if (args.key.Length == 0) return false;
            string code = args.key;
            if (code == "{HANGUL}" || code == "{HANJA}")
            {
                ushort virtualKey = (ushort)(code == "{HANGUL}" ? 0x15 : 0x19);
                SendVirtualKey(virtualKey, false, false);
                SendVirtualKey(virtualKey, true, false);
                return true;
            }
            Input[] inputs = BuildKeyInputs(args,
                (GetAsyncKeyState(0x10) & 0x8000) != 0,
                (GetAsyncKeyState(0x11) & 0x8000) != 0,
                (GetAsyncKeyState(0x12) & 0x8000) != 0);
            if (inputs.Length > 0)
            {
                IntPtr foreground = GetForegroundWindow();
                uint sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(Input)));
                int error = sent == inputs.Length ? 0 : Marshal.GetLastWin32Error();
                Diagnostics?.TraceDelivery(sent, inputs.Length, error, foreground);
                if (sent != inputs.Length) Debug.WriteLine("SendInput failed: " + error);
            }
            return inputs.Length > 0;
        }
        public void Dispose()
        {
            if (windowsKeyDown) SendVirtualKey(0x5B, true, true);
            windowsKeyDown = false;
        }
        // Physical key events preserve Caps Lock and the target app's IME.
        // Include the full native union for both x86 and x64.
        [StructLayout(LayoutKind.Sequential)]
        private struct KeyboardInput
        {
            public ushort virtualKey, scanCode;
            public uint flags, time;
            public UIntPtr extraInfo;
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct MouseInput
        {
            public int x, y;
            public uint mouseData, flags, time;
            public UIntPtr extraInfo;
        }
        [StructLayout(LayoutKind.Explicit)]
        private struct InputUnion
        {
            [FieldOffset(0)] public KeyboardInput keyboard;
            [FieldOffset(0)] public MouseInput mouse;
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct Input
        {
            public uint type;
            public InputUnion data;
        }
        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint count, Input[] inputs, int size);
        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int key);
        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        private static Input MakeKeyInput(ushort key, bool keyUp, bool extended)
        {
            Input input = new Input { type = InputKeyboard };
            input.data.keyboard.virtualKey = key;
            input.data.keyboard.flags = (keyUp ? KeyUp : 0u) | (extended ? ExtendedKey : 0u);
            return input;
        }

        private static Input[] BuildKeyInputs(KeyInputEventArgs args,
            bool physicalShift, bool physicalControl, bool physicalAlt)
        {
            bool extended;
            ushort key = GetVirtualKey(args.key, out extended);
            if (key == 0) return new Input[0];
            var inputs = new System.Collections.Generic.List<Input>();
            bool shift = args.shift && !physicalShift;
            bool control = args.control && !physicalControl;
            bool alt = args.alt && !physicalAlt;
            if (shift) inputs.Add(MakeKeyInput(0x10, false, false));
            if (control) inputs.Add(MakeKeyInput(0x11, false, false));
            if (alt) inputs.Add(MakeKeyInput(0x12, false, false));
            inputs.Add(MakeKeyInput(key, false, extended));
            inputs.Add(MakeKeyInput(key, true, extended));
            if (alt) inputs.Add(MakeKeyInput(0x12, true, false));
            if (control) inputs.Add(MakeKeyInput(0x11, true, false));
            if (shift) inputs.Add(MakeKeyInput(0x10, true, false));
            return inputs.ToArray();
        }

        private static ushort GetVirtualKey(string code, out bool extended)
        {
            extended = false;
            if (code == " ") return 0x20;
            if (code.Length == 3 && code[0] == '{' && code[2] == '}')
            {
                char character = code[1];
                if (character >= 'a' && character <= 'z') return (ushort)char.ToUpperInvariant(character);
                if (character >= '0' && character <= '9') return character;
                // Standard US/Korean two-set physical punctuation keys.
                switch (character)
                {
                    case ';': return 0xBA;
                    case '=': return 0xBB;
                    case ',': return 0xBC;
                    case '-': return 0xBD;
                    case '.': return 0xBE;
                    case '/': return 0xBF;
                    case '`': return 0xC0;
                    case '[': return 0xDB;
                    case '\\': return 0xDC;
                    case ']': return 0xDD;
                    case '\'': return 0xDE;
                }
            }
            if (code.StartsWith("{F") && code.EndsWith("}"))
            {
                int function;
                if (int.TryParse(code.Substring(2, code.Length - 3), out function) &&
                    function >= 1 && function <= 12) return (ushort)(0x70 + function - 1);
            }
            switch (code)
            {
                case "{ESC}": return 0x1B;
                case "{TAB}": return 0x09;
                case "{CAPSLOCK}": return 0x14;
                case "{BKSP}": return 0x08;
                case "{ENTER}": return 0x0D;
                case "{DEL}": extended = true; return 0x2E;
                case "{LEFT}": extended = true; return 0x25;
                case "{UP}": extended = true; return 0x26;
                case "{RIGHT}": extended = true; return 0x27;
                case "{DOWN}": extended = true; return 0x28;
                default: return 0;
            }
        }

        private static void SendVirtualKey(ushort key, bool keyUp, bool extended)
        {
            Input input = MakeKeyInput(key, keyUp, extended);
            if (SendInput(1, new[] { input }, Marshal.SizeOf(typeof(Input))) != 1)
                Debug.WriteLine("SendInput failed: " + Marshal.GetLastWin32Error());
        }

    }
}
