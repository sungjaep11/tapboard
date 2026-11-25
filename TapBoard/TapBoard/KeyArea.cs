using System;
using System.Drawing;
using System.Windows.Forms;

namespace TapBoard
{
    // The control translates physical Windows contacts and requests repainting.
    // It delegates all input decisions to the controller.
    public class KeyArea : Control
    {
        private readonly KeyRenderer renderer = new KeyRenderer();
        private readonly KeyboardInputController input = new KeyboardInputController();
        private readonly System.Windows.Forms.Timer autoRepeatTimer;
        private int ppku = 74;
        private bool koreanLabels, capsLockLabels, physicalShiftLabels;
        private int? primaryTouchId;
        internal const double LayoutWidthUnits = KeyboardLayout.LayoutWidthUnits;
        internal const double LayoutHeightUnits = KeyboardLayout.LayoutHeightUnits;
        internal TouchDiagnostics Diagnostics { get { return input.Diagnostics; } }
        private Rectangle KeyboardBounds
        { get { return new Rectangle(0, 0, Width, (int)Math.Ceiling(LayoutHeightUnits * ppku)); } }

        private void InvalidateKeyboard() { Invalidate(KeyboardBounds); }
        private void InvalidateTouchChange(Key key, bool shiftBefore, bool controlBefore)
        {
            if (IsDisposed || Disposing) return;
            // Shift changes every label, and Ctrl changes every label color.
            // Other key contacts affect only their own highlight. The release
            // uses the original contact owner even if the finger moved outside.
            if (shiftBefore != input.IsShiftKeyOn() || controlBefore != input.IsControlKeyOn())
                InvalidateKeyboard();
            else if (key != null) Invalidate(key.VisualBounds);
        }
        internal void RefreshHeldKeys()
        {
            // Resting tap keys may expire without moving. Refresh only held
            // keys at 10 Hz rather than repainting on every raw MOVE packet.
            foreach (Key key in input.keys)
                if (key.IsActive()) Invalidate(key.VisualBounds);
        }
        public void CreateKeys(int pitch, double widthMm = 0) { ppku = pitch; input.CreateKeys(pitch, Width); Diagnostics.StartExperiment("TapBoard+", Width, pitch, widthMm, KeyboardLayout.RecordingBounds(pitch, Width)); Invalidate(); }
        public bool IsShiftKeyOn() { return input.IsShiftKeyOn(); }
        public bool IsControlKeyOn() { return input.IsControlKeyOn(); }
        private void OnAutoRepeatTimerElapsed(object sender, EventArgs args) { input.Repeat(); }
        private void TraceTouch(string stage, int id, int x, int y, string detail)
        { input.Diagnostics.TraceTouch(stage, id, x, y, detail); }
        internal void TraceDelivery(uint sent, int expected, int error, IntPtr foreground)
        { input.Diagnostics.TraceDelivery(sent, expected, error, foreground); }
        internal void SaveTouchTrace(bool final = false) { input.Diagnostics.SaveTouchTrace(final); }
        public delegate void KeyInputEventHandler(object sender, KeyInputEventArgs args);
        public event KeyInputEventHandler KeyInput;
        internal event Action<bool, bool, bool> ModifiersChanged;
        private void ProcessTouchInputs(WindowsTouchInput.NativeTouch[] inputs)
        {
            // Inspect every new contact first: a third non-modifier key down
            // must cancel pending taps before any earlier up is committed.
            foreach (WindowsTouchInput.NativeTouch touch in inputs)
            {
                if ((touch.flags & WindowsTouchInput.Down) == 0) continue;
                Point point = PointToClient(new Point((int)Math.Round(touch.x / 100.0),
                    (int)Math.Round(touch.y / 100.0)));
                input.TrackKeyDown((int)touch.id, point.X, point.Y);
            }
            foreach (WindowsTouchInput.NativeTouch touch in inputs)
            {
                Point pt = PointToClient(new Point((int)Math.Round(touch.x / 100.0),
                    (int)Math.Round(touch.y / 100.0)));
                int id = (int)touch.id;
                string detail = touch.time + ";flags=" + touch.flags;
                Key owner = input.GetContactKey(id);
                string keyType = owner == null ? "BLANK" : owner.Definition.type.ToString();
                if ((touch.flags & WindowsTouchInput.Down) != 0)
                {
                    TraceTouch("NATIVE_DOWN", id, pt.X, pt.Y, detail);
                    Diagnostics.Experiment?.Record("down", id, pt.X, pt.Y, keyType, detail);
                    OnTouchDown(id, pt, (touch.flags & WindowsTouchInput.Primary) != 0);
                }
                else if ((touch.flags & WindowsTouchInput.Up) != 0)
                {
                    TraceTouch("NATIVE_UP", id, pt.X, pt.Y, detail);
                    Diagnostics.Experiment?.Record("up", id, pt.X, pt.Y, keyType, detail);
                    OnTouchUp(id, pt);
                }
                else if ((touch.flags & WindowsTouchInput.Move) != 0)
                {
                    TraceTouch("NATIVE_MOVE", id, pt.X, pt.Y, detail);
                    Diagnostics.Experiment?.Record("move", id, pt.X, pt.Y, keyType, detail);
                    OnTouchMove(id, pt);
                }
            }
        }
        internal bool HasPrimaryTouch { get { return primaryTouchId.HasValue; } }
        internal event Action<bool> PrimaryTouchChanged;
        internal event Action KeyTouched;

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            TouchGestureSettings.Apply(Handle);
            // TWF_WANTPALM: deliver contacts immediately, including resting palms.
            if (!WindowsTouchInput.RegisterTouchWindow(Handle, WindowsTouchInput.WantPalm))
                throw new System.ComponentModel.Win32Exception(
                    System.Runtime.InteropServices.Marshal.GetLastWin32Error());
        }

        protected override void OnHandleDestroyed(EventArgs e)
        {
            input.CancelContacts();
            primaryTouchId = null;
            PrimaryTouchChanged?.Invoke(false);
            if (IsHandleCreated)
            {
                WindowsTouchInput.UnregisterTouchWindow(Handle);
                TouchGestureSettings.Remove(Handle);
            }
            Diagnostics.Experiment?.Record("reset", detail: "touch-window-destroyed");
            base.OnHandleDestroyed(e);
        }

        protected override void WndProc(ref Message message)
        {
            if (message.Msg == WindowsTouchInput.Message) // WM_TOUCH; physical screen coordinates
            {
                try
                {
                    uint count = (uint)(message.WParam.ToInt64() & 0xffff);
                    TraceTouch("WM_TOUCH", 0, 0, 0, count.ToString());
                    WindowsTouchInput.NativeTouch[] inputs = new WindowsTouchInput.NativeTouch[count];
                    if (WindowsTouchInput.GetTouchInputInfo(message.LParam, count, inputs,
                        System.Runtime.InteropServices.Marshal.SizeOf(typeof(WindowsTouchInput.NativeTouch))))
                        ProcessTouchInputs(inputs);
                    else TraceTouch("NATIVE_ERROR", 0, 0, 0,
                        System.Runtime.InteropServices.Marshal.GetLastWin32Error().ToString());
                }
                finally { WindowsTouchInput.CloseTouchInputHandle(message.LParam); }
                message.Result = IntPtr.Zero;
                return;
            }
            IntPtr result;
            if (TouchGestureSettings.HandleMessage(message.HWnd, message.Msg, out result)) message.Result = result;
            else base.WndProc(ref message);
        }

        public void SetLabelState(bool korean, bool capsLock, bool physicalShift)
        {
            if (koreanLabels == korean && capsLockLabels == capsLock &&
                physicalShiftLabels == physicalShift) return;
            koreanLabels = korean;
            capsLockLabels = capsLock;
            physicalShiftLabels = physicalShift;
            InvalidateKeyboard();
        }


        public KeyArea()
        {
            input.KeyInput += (sender, args) => KeyInput?.Invoke(this, args);
            input.ModifiersChanged += (shift, control, alt) => ModifiersChanged?.Invoke(shift, control, alt);
            input.StateChanged += InvalidateKeyboard;

            SetStyle(ControlStyles.OptimizedDoubleBuffer, true);
            SetStyle(ControlStyles.AllPaintingInWmPaint, true);
            SetStyle(ControlStyles.UserPaint, true);
            SetStyle(ControlStyles.ResizeRedraw, true);

            autoRepeatTimer = new System.Windows.Forms.Timer();
            autoRepeatTimer.Interval = KeyboardSettings.Current.RepeatPollMs;

            autoRepeatTimer.Tick += OnAutoRepeatTimerElapsed;
            autoRepeatTimer.Enabled = true;

        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                input.CancelContacts();
                autoRepeatTimer.Dispose();
                renderer.Dispose();
                SaveTouchTrace(true);
            }
            base.Dispose(disposing);
        }

        protected override void OnPaint(PaintEventArgs args)
        {
            DrawKeys(args.Graphics, args.ClipRectangle);
            base.OnPaint(args);
        }

        private void OnTouchDown(int id, Point pt, bool primary)
        {
            if (primary)
            {
                primaryTouchId = id;
                PrimaryTouchChanged?.Invoke(true);
            }
            TraceTouch("DOWN", id, pt.X, pt.Y, "");
            bool shiftBefore = input.IsShiftKeyOn(), controlBefore = input.IsControlKeyOn();
            // Feedback follows a key contact that is allowed by the resting lock.
            if (input.TouchDown(id, pt)) KeyTouched?.Invoke();

            InvalidateTouchChange(input.GetContactKey(id), shiftBefore, controlBefore);
        }

        private void OnTouchMove(int id, Point pt)
        {
            TraceTouch("MOVE", id, pt.X, pt.Y, "");
            input.DistributeEvent(KeyAreaEvent.MOVE, id, pt.X, pt.Y);

            // Movement changes tap qualification, not key geometry or labels.
            // Continuous MOVE-triggered full paints can starve WM_TIMER repeat.
        }

        private void OnTouchUp(int id, Point pt)
        {
            TraceTouch("UP", id, pt.X, pt.Y, "");
            Key key = input.GetContactKey(id);
            bool shiftBefore = input.IsShiftKeyOn(), controlBefore = input.IsControlKeyOn();
            input.DistributeEvent(KeyAreaEvent.RELEASE, id, pt.X, pt.Y);
            if (primaryTouchId == id)
            {
                primaryTouchId = null;
                PrimaryTouchChanged?.Invoke(false);
            }
            InvalidateTouchChange(key, shiftBefore, controlBefore);
        }

        public void DrawKeys(Graphics canvas)
        {
            DrawKeys(canvas, ClientRectangle);
        }

        private void DrawKeys(Graphics canvas, Rectangle clip)
        {
            // draw in physical pixel unit.
            canvas.PageUnit = GraphicsUnit.Pixel;

            int keyMargin = -ppku / 15;
            bool shift = input.IsShiftKeyOn() || physicalShiftLabels;
            bool control = input.IsControlKeyOn();
            foreach (Key key in input.keys)
            {
                if (!clip.IntersectsWith(key.VisualBounds)) continue;
                renderer.Draw(key, canvas, keyMargin, shift, control, Math.Max(10, ppku * 0.22f),
                    koreanLabels, capsLockLabels, input.IsLocked);
            }
        }
    }
}
