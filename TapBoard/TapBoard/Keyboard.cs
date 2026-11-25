using System;
using System.Drawing;
using System.Threading;
using System.Windows.Forms;

namespace TapBoard
{
    public partial class Keyboard : Form
    {
        private readonly WindowsKeyboardOutput keyboardOutput = new WindowsKeyboardOutput();
        private ClickFeedback clickFeedback;
        private System.Windows.Forms.Timer labelTimer;
        private volatile bool koreanLabels;
        private int imeQueryPending;
        private TouchMouseFilter touchMouseFilter;
        private bool hookErrorReported;
        private bool audioErrorReported;
        private bool experimentErrorReported;

        private void RefreshKeyLabels(object sender, EventArgs e)
        {
            keyArea.SaveTouchTrace();
            keyArea.RefreshHeldKeys();
            if (!experimentErrorReported && keyArea.Diagnostics.Experiment?.Failure != null)
            {
                experimentErrorReported = true;
                MessageBox.Show("Touch experiment logging failed: " + keyArea.Diagnostics.Experiment.Failure, "TapBoard");
            }
            if (clickFeedback != null && clickFeedback.Failure != null && !audioErrorReported)
            {
                audioErrorReported = true;
                MessageBox.Show("Low-latency audio could not start: " + clickFeedback.Failure, "TapBoard");
            }
            if (touchMouseFilter != null && touchMouseFilter.InstallError != 0 && !hookErrorReported)
            {
                hookErrorReported = true;
                MessageBox.Show("Touch mouse filtering could not start (error " +
                    touchMouseFilter.InstallError + "). Resting touches may still move the mouse.", "TapBoard");
            }
            keyArea.SetLabelState(koreanLabels, Control.IsKeyLocked(Keys.CapsLock),
                (Control.ModifierKeys & Keys.Shift) != 0);
            if (Interlocked.CompareExchange(ref imeQueryPending, 1, 0) != 0) return;
            ThreadPool.QueueUserWorkItem(state =>
            {
                try
                {
                    bool korean;
                    if (ImeStateReader.TryGetKoreanMode(out korean)) koreanLabels = korean;
                }
                finally { Interlocked.Exchange(ref imeQueryPending, 0); }
            });
        }

        public Keyboard()
        {
            InitializeComponent();
            keyboardOutput.Diagnostics = keyArea.Diagnostics;
            keyArea.ModifiersChanged += keyboardOutput.SetModifiers;
            keyArea.KeyTouched += () =>
            {
                if (KeyboardSettings.Current.TouchSoundEnabled) clickFeedback?.RequestTouch();
            };
            keyArea.PrimaryTouchChanged += active =>
            {
                if (touchMouseFilter != null) touchMouseFilter.SetPrimaryTouch(active);
            };
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            TouchGestureSettings.Apply(Handle);
        }

        protected override void OnHandleDestroyed(EventArgs e)
        {
            if (IsHandleCreated) TouchGestureSettings.Remove(Handle);
            base.OnHandleDestroyed(e);
        }

        protected override void WndProc(ref Message message)
        {
            IntPtr result;
            if (TouchGestureSettings.HandleMessage(message.HWnd, message.Msg, out result)) message.Result = result;
            else base.WndProc(ref message);
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            if (KeyboardSettings.Current.FilterTouchMouse)
            {
                touchMouseFilter = new TouchMouseFilter(RectangleToScreen(ClientRectangle));
                touchMouseFilter.SetPrimaryTouch(keyArea.HasPrimaryTouch);
            }
        }

        private void UpdateTouchMouseBounds()
        {
            if (touchMouseFilter != null)
                touchMouseFilter.UpdateBounds(Visible && WindowState != FormWindowState.Minimized
                    ? RectangleToScreen(ClientRectangle) : Rectangle.Empty);
        }

        protected override void OnLocationChanged(EventArgs e)
        {
            base.OnLocationChanged(e);
            UpdateTouchMouseBounds();
        }

        protected override void OnSizeChanged(EventArgs e)
        {
            base.OnSizeChanged(e);
            UpdateTouchMouseBounds();
        }

        protected override void OnVisibleChanged(EventArgs e)
        {
            base.OnVisibleChanged(e);
            UpdateTouchMouseBounds();
        }

        // Keep the focused application on the upper screen active while typing.
        private const int NoActivate = 0x08000000;
        protected override CreateParams CreateParams
        {
            get { CreateParams cp = base.CreateParams; cp.ExStyle |= NoActivate; return cp; }
        }

        private void keyArea_KeyInput(object sender, KeyInputEventArgs args)
        {
            if (IsDisposed || Disposing) return;
            if (InvokeRequired)
            {
                BeginInvoke(new Action(() => keyArea_KeyInput(sender, args)));
                return;
            }
            if (args.key == "{APP_EXIT}")
            {
                Close();
                return;
            }
            if (keyboardOutput.Send(args) && KeyboardSettings.Current.InputSoundEnabled)
                clickFeedback?.Request();
        }

        private void Keyboard_Load(object sender, EventArgs e)
        {
            Screen screen = DisplayGeometry.SelectScreen();
            double widthMm;
            int pitch = DisplayGeometry.GetPitch(screen, out widthMm);
            StartPosition = FormStartPosition.Manual;
            Bounds = screen.Bounds;
            keyArea.CreateKeys(pitch, widthMm);
            // Avoid starting the audio engine when both feedback channels are disabled.
            if (KeyboardSettings.Current.TouchSoundEnabled || KeyboardSettings.Current.InputSoundEnabled)
                clickFeedback = new ClickFeedback();
            labelTimer = new System.Windows.Forms.Timer { Interval = 100 };
            labelTimer.Tick += RefreshKeyLabels;
            RefreshKeyLabels(this, EventArgs.Empty);
            labelTimer.Start();
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            keyArea.SaveTouchTrace(true);
            if (touchMouseFilter != null) { touchMouseFilter.Dispose(); touchMouseFilter = null; }
            if (labelTimer != null) { labelTimer.Stop(); labelTimer.Dispose(); }
            keyboardOutput.Dispose();
            if (clickFeedback != null) clickFeedback.Dispose();
            base.OnFormClosed(e);
        }
    }
}
