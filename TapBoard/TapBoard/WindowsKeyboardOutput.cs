using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace TapBoard
{
    // Inject physical virtual-key transitions, preserving the target's IME and
    // existing modifiers. Only release native holds acquired by this output.
    internal sealed class WindowsKeyboardOutput : IDisposable
    {
        private const uint InputKeyboard = 1, KeyUp = 2, ExtendedKey = 1;
        private bool shiftDown, controlDown, altDown, windowsKeyDown;
        private bool wantShift, wantControl, wantAlt, wantWindows;
        private bool disposed;
        private readonly Func<ushort, bool> isKeyDown;
        private readonly Func<Input[], uint> sendInputs;
        internal TouchDiagnostics Diagnostics;

        internal WindowsKeyboardOutput()
        {
            isKeyDown = key => (GetAsyncKeyState(key) & 0x8000) != 0;
            sendInputs = SendNativeInputs;
        }
        // Exercise the actual output/ownership policy without injecting OS input.
        internal WindowsKeyboardOutput(Func<ushort, bool> isKeyDown, Func<Input[], uint> sendInputs)
        {
            this.isKeyDown = isKeyDown;
            this.sendInputs = sendInputs;
        }
        internal void SetModifiers(bool shift, bool control, bool alt)
        {
            if (disposed) return;
            wantShift = shift;
            wantControl = control;
            wantAlt = alt;
            SynchronizeModifiers(shift, control, alt);
        }
        private bool SynchronizeModifiers(bool shift, bool control, bool alt)
        {
            // Keep injected ownership separate from GetAsyncKeyState: that API
            // includes our own injected downs, not just physical keyboard input.
            bool ready = SetHeldKey(0x10, shift, ref shiftDown);
            ready &= SetHeldKey(0x11, control, ref controlDown);
            ready &= SetHeldKey(0x12, alt, ref altDown);
            return ready;
        }
        private bool SetHeldKey(ushort key, bool down, ref bool owned, bool extended = false)
        {
            if (down)
            {
                if (owned || isKeyDown(key)) return true;
                if (!SendVirtualKey(key, false, extended)) return false;
                owned = true;
            }
            else if (owned)
            {
                if (!SendVirtualKey(key, true, extended)) return false;
                owned = false;
            }
            return true;
        }
        internal bool Send(KeyInputEventArgs args)
        {
            if (disposed) return false;
            if (args.key == "{WIN_DOWN}" || args.key == "{WIN_UP}")
            {
                wantWindows = args.key == "{WIN_DOWN}";
                SetHeldKey(0x5B, wantWindows, ref windowsKeyDown, true);
                return false;
            }
            if (args.key.Length == 0) return false;
            // Retry failed transitions (or acquire a formerly physical hold)
            // before sending a target key. Never turn a failed shortcut into text.
            Input[] inputs = BuildKeyInputs(args);
            if (inputs.Length == 0) return false;
            try
            {
                if (!SynchronizeModifiers(args.shift, args.control, args.alt) ||
                    !SetHeldKey(0x5B, args.windows, ref windowsKeyDown, true)) return false;
                uint sent = sendInputs(inputs);
                if (sent == 1) SendVirtualKey(inputs[0].data.keyboard.virtualKey, true,
                    (inputs[0].data.keyboard.flags & ExtendedKey) != 0);
                return sent == inputs.Length;
            }
            finally
            {
                // A buffered tap can outlive its modifiers. Restore the live
                // finger holds even if delivery of the target key failed.
                if (args.shift != wantShift || args.control != wantControl || args.alt != wantAlt)
                    SynchronizeModifiers(wantShift, wantControl, wantAlt);
                if (args.windows != wantWindows) SetHeldKey(0x5B, wantWindows, ref windowsKeyDown, true);
            }
        }
        public void Dispose()
        {
            wantShift = wantControl = wantAlt = wantWindows = false;
            SynchronizeModifiers(false, false, false);
            SetHeldKey(0x5B, false, ref windowsKeyDown, true);
            disposed = true;
        }
        // Physical key events preserve Caps Lock and the target app's IME.
        // Include the full native union for both x86 and x64.
        [StructLayout(LayoutKind.Sequential)]
        internal struct KeyboardInput
        {
            public ushort virtualKey, scanCode;
            public uint flags, time;
            public UIntPtr extraInfo;
        }
        [StructLayout(LayoutKind.Sequential)]
        internal struct MouseInput
        {
            public int x, y;
            public uint mouseData, flags, time;
            public UIntPtr extraInfo;
        }
        [StructLayout(LayoutKind.Explicit)]
        internal struct InputUnion
        {
            [FieldOffset(0)] public KeyboardInput keyboard;
            [FieldOffset(0)] public MouseInput mouse;
        }
        [StructLayout(LayoutKind.Sequential)]
        internal struct Input
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

        private static Input[] BuildKeyInputs(KeyInputEventArgs args)
        {
            bool extended;
            ushort key = GetVirtualKey(args.key, out extended);
            if (key == 0) return new Input[0];
            // Shift/Ctrl/Alt are already held by contact lifetime. Emitting their
            // UP here would dismiss Alt+Tab after every Tab/arrow keystroke.
            return new[] { MakeKeyInput(key, false, extended), MakeKeyInput(key, true, extended) };
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
                case "{HANGUL}": return 0x15;
                case "{HANJA}": return 0x19;
                case "{LEFT}": extended = true; return 0x25;
                case "{UP}": extended = true; return 0x26;
                case "{RIGHT}": extended = true; return 0x27;
                case "{DOWN}": extended = true; return 0x28;
                default: return 0;
            }
        }

        private bool SendVirtualKey(ushort key, bool keyUp, bool extended)
        {
            Input input = MakeKeyInput(key, keyUp, extended);
            return sendInputs(new[] { input }) == 1;
        }
        private uint SendNativeInputs(Input[] inputs)
        {
            IntPtr foreground = GetForegroundWindow();
            uint sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(Input)));
            int error = sent == inputs.Length ? 0 : Marshal.GetLastWin32Error();
            Diagnostics?.TraceDelivery(sent, inputs.Length, error, foreground);
            if (sent != inputs.Length) Debug.WriteLine("SendInput failed: " + error);
            return sent;
        }

    }
}
