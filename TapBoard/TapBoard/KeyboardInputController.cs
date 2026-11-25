using System;
using System.Drawing;
using System.Collections.Generic;

namespace TapBoard
{
    // All contact methods run on one owner thread. There are no
    // Control, timer, audio, or native-window dependencies in the input policy.
    internal sealed class KeyboardInputController
    {
        internal readonly List<Key> keys = new List<Key>();
        private readonly Dictionary<int, Key> keyContacts = new Dictionary<int, Key>();
        // Modifiers keep contact ownership but do not consume ordinary-key slots.
        private readonly Dictionary<int, Key> modifierContacts = new Dictionary<int, Key>();
        private sealed class PendingTap
        {
            internal Key Key;
            internal Stroke Contact;
            internal bool ShiftAtDown;
            internal double? ReleasedAt;
            internal KeyInputEventArgs Input;
        }
        // The queue keeps press order even after Windows reuses a released contact ID.
        private readonly Queue<PendingTap> tapOrder = new Queue<PendingTap>();
        private readonly Dictionary<int, PendingTap> activeTaps = new Dictionary<int, PendingTap>();
        private bool inputLocked;
        private readonly Func<double> clock;
        private readonly int sameKeyMinIntervalMs;
        private readonly bool conventional;
        private PendingTap lastTap;

        internal KeyboardInputController() : this(false) { }
        internal KeyboardInputController(bool conventional) : this(KeyboardSettings.Current.SameKeyMinIntervalMs,
            () => System.Diagnostics.Stopwatch.GetTimestamp() * 1000.0 / System.Diagnostics.Stopwatch.Frequency, conventional) { }
        // Inject a monotonic clock for deterministic boundary and bounce tests.
        internal KeyboardInputController(int minimumIntervalMs, Func<double> clock) : this(minimumIntervalMs, clock, false) { }
        internal KeyboardInputController(int minimumIntervalMs, Func<double> clock, bool conventional)
        {
            this.conventional = conventional;
            sameKeyMinIntervalMs = minimumIntervalMs;
            this.clock = clock;
        }

        private bool AllowTap(PendingTap tap)
        {
            // Compare actual releases, which can be far apart or in reverse order
            // even when the two keys are delivered together.
            if (lastTap != null && lastTap.Key == tap.Key &&
                lastTap.Input.shift == tap.Input.shift && lastTap.Input.control == tap.Input.control &&
                lastTap.Input.alt == tap.Input.alt && lastTap.Input.windows == tap.Input.windows &&
                Math.Abs(tap.ReleasedAt.Value - lastTap.ReleasedAt.Value) < sameKeyMinIntervalMs)
                return false;
            lastTap = tap;
            return true;
        }

        private void UpdateTap(Key key, KeyAreaEvent e, int id, bool accepted, bool shift)
        {
            PendingTap tap;
            if (e == KeyAreaEvent.TOUCH && !activeTaps.ContainsKey(id))
            {
                Stroke contact = key.State.GetTappingContact(id);
                if (contact == null) return;
                tap = new PendingTap { Key = key, Contact = contact, ShiftAtDown = shift };
                activeTaps.Add(id, tap);
                tapOrder.Enqueue(tap);
            }
            else if (e == KeyAreaEvent.RELEASE && activeTaps.TryGetValue(id, out tap))
            {
                activeTaps.Remove(id);
                tap.ReleasedAt = clock();
                if (accepted)
                    tap.Input = CaptureInput(key.GetName(), key.Definition.label2 != null ? tap.ShiftAtDown : shift,
                        IsControlKeyOn());
                FlushTaps();
            }
        }

        private void FlushTaps()
        {
            while (tapOrder.Count != 0)
            {
                PendingTap tap = tapOrder.Peek();
                // A finger can move away and come back. Only its age can rule
                // out a still-held contact before its final position is known.
                if (!tap.ReleasedAt.HasValue && !tap.Contact.HasTimedOut) return;
                tapOrder.Dequeue();
                if (tap.Input == null) continue;
                Stroke contact = tap.Contact;
                if (AllowTap(tap))
                {
                    TraceTouch("ACCEPT", contact.pointID, contact.currentX, contact.currentY, "RELEASE");
                    OnKeyInput(tap.Input);
                }
                else TraceTouch("REJECT_DUPLICATE", contact.pointID, contact.currentX, contact.currentY, tap.Input.key);
            }
        }

        private void ClearPendingTaps()
        {
            activeTaps.Clear();
            tapOrder.Clear();
        }
        internal void TrackKeyDown(int id, int x, int y)
        {
            // Track contacts until release, including cancelled strokes. Blank
            // resting-area contacts never consume a slot. Multiple fingers on
            // one key count as one distinct key, not multiple keys. Modifiers
            // are tracked separately so shortcuts do not trigger the limit.
            if (GetContactKey(id) != null) return;
            foreach (Key key in keys)
            {
                if (!key.IsPointInside(x, y)) continue;
                if (key.Definition.type == Key.TYPE.MODIFIER) modifierContacts.Add(id, key);
                else keyContacts.Add(id, key);
                break;
            }
            if (conventional || inputLocked || new HashSet<Key>(keyContacts.Values).Count <= KeyboardSettings.Current.MaxActiveKeys) return;
            // Cancel before processing releases in the native packet. Once
            // locked, every tracked contact (including modifiers) must lift.
            inputLocked = true;
            ClearPendingTaps();
            bool releaseWindows = windowsKey != null && windowsKey.IsActive();
            foreach (Key key in keys) key.CancelContact();
            ModifiersChanged?.Invoke(false, false, false);
            if (releaseWindows) CreateKeyInputEvent("{WIN_UP}", false, false);
            TraceTouch("LOCK", id, x, y, "active-key-limit-exceeded");
            StateChanged?.Invoke();
        }

        private Key leftShift = null;
        private Key rightShift = null;
        private Key ctrl = null;
        private Key alt = null;
        private Key rightCtrl = null;
        private Key windowsKey = null;
        internal readonly TouchDiagnostics Diagnostics = new TouchDiagnostics();
        internal event Action StateChanged;
        internal event Action<bool, bool, bool> ModifiersChanged;
        internal bool IsLocked { get { return inputLocked; } }
        internal Key GetContactKey(int id)
        {
            Key key;
            return keyContacts.TryGetValue(id, out key) || modifierContacts.TryGetValue(id, out key)
                ? key : null;
        }
        private void TraceTouch(string stage, int id, int x, int y, string detail)
        { Diagnostics.TraceTouch(stage, id, x, y, detail); }
        public bool IsShiftKeyOn()
        {
            if ((leftShift == null) || (rightShift == null))
                return false;
            else
                return leftShift.IsActive() || rightShift.IsActive();
        }
        public bool IsControlKeyOn()
        {
            if (ctrl == null)
                return false;
            else
                return ctrl.IsActive() || (rightCtrl != null && rightCtrl.IsActive());
        }

        internal void DistributeEvent(KeyAreaEvent e, int pointID, int x, int y)
        {
            if (e == KeyAreaEvent.TOUCH)
                TrackKeyDown(pointID, x, y);
            // Keep the original owner before removing an UP contact. MOVE/UP
            // coordinates may be outside that key; never re-hit-test them or
            // broadcast the contact to every key in the layout.
            Key key = GetContactKey(pointID);
            if (e == KeyAreaEvent.RELEASE)
            {
                keyContacts.Remove(pointID);
                modifierContacts.Remove(pointID);
            }
            if (inputLocked)
            {
                if (keyContacts.Count == 0 && modifierContacts.Count == 0)
                {
                    inputLocked = false;
                    TraceTouch("UNLOCK", pointID, x, y, "all-key-contacts-released");
                    StateChanged?.Invoke();
                }
                return;
            }
            bool windowsWasActive = windowsKey != null && windowsKey.IsActive();
            bool shiftWasActive = IsShiftKeyOn(), controlWasActive = IsControlKeyOn();
            bool altWasActive = alt != null && alt.IsActive();
            bool newConventionalPress = conventional && e == KeyAreaEvent.TOUCH &&
                key != null && key.Definition.type == Key.TYPE.TAPPER && key.State.GetTappingContact(pointID) == null;
            bool accepted = key != null && key.OnKeyAreaEvent(e, pointID, x, y);
            bool shiftIsActive = IsShiftKeyOn(), controlIsActive = IsControlKeyOn();
            bool altIsActive = alt != null && alt.IsActive();
            // Native modifier transitions follow contact lifetime, independently
            // of the ordinary key's release/tap decision and repeat schedule.
            if (shiftWasActive != shiftIsActive || controlWasActive != controlIsActive || altWasActive != altIsActive)
                ModifiersChanged?.Invoke(shiftIsActive, controlIsActive, altIsActive);
            if (key != null && key.Definition.type == Key.TYPE.TAPPER)
            {
                if (newConventionalPress)
                {
                    TraceTouch("ACCEPT", pointID, x, y, key.GetName());
                    CreateKeyInputEvent(key.GetName(), shiftIsActive, controlIsActive);
                }
                else if (!conventional) UpdateTap(key, e, pointID, accepted, shiftIsActive);
            }
            else if (accepted)
            {
                if (key.Definition.type == Key.TYPE.NORMAL) lastTap = null;
                TraceTouch("ACCEPT", pointID, x, y, e.ToString());
                CreateKeyInputEvent(key.GetName(), shiftIsActive, controlIsActive);
            }
            bool windowsIsActive = windowsKey != null && windowsKey.IsActive();
            if (windowsWasActive != windowsIsActive)
                CreateKeyInputEvent(windowsIsActive ? "{WIN_DOWN}" : "{WIN_UP}", false, false);
        }

        internal void Repeat()
        {
            if (inputLocked) return;
            FlushTaps();
            foreach (Key key in keys)
            {
                if (key.WantRepeat())
                {
                    lastTap = null;
                    TraceTouch("REPEAT", 0, 0, 0, "");
                    CreateKeyInputEvent(key.GetName(), IsShiftKeyOn(), IsControlKeyOn());
                }
            }
        }

        private KeyInputEventArgs CaptureInput(string key, bool shift, bool control)
        {
            return new KeyInputEventArgs { key = key, shift = shift, control = control,
                alt = alt != null && alt.IsActive(), windows = windowsKey != null && windowsKey.IsActive() };
        }
        private void CreateKeyInputEvent(string key, bool shift, bool control)
        { OnKeyInput(CaptureInput(key, shift, control)); }

        public event EventHandler<KeyInputEventArgs> KeyInput;

        private void OnKeyInput(KeyInputEventArgs args)
        {
            KeyInput?.Invoke(this, args);
        }
        internal bool TouchDown(int id, Point point)
        {
            // Batch preflight preserves the distinct-key lock. Standalone
            // touches start immediately; tap keys still commit only on release.
            TrackKeyDown(id, point.X, point.Y);
            if (GetContactKey(id) == null || inputLocked) return false;
            DistributeEvent(KeyAreaEvent.TOUCH, id, point.X, point.Y);
            return true;
        }
        internal void CreateKeys(int pitch, int availableWidth)
        {
            // Build first: a layout failure must not partially clear live state.
            var layout = new KeyboardLayout(pitch, availableWidth);
            Reset();
            keys.AddRange(layout.Keys);
            leftShift = layout.LeftShift;
            rightShift = layout.RightShift;
            ctrl = layout.Control;
            rightCtrl = layout.RightControl;
            alt = layout.Alt;
            windowsKey = layout.Windows;
        }
        internal void CancelContacts()
        {
            // Contact loss, layout changes and shutdown must release native holds.
            if (windowsKey != null && windowsKey.IsActive())
                CreateKeyInputEvent("{WIN_UP}", false, false);
            foreach (Key key in keys) key.CancelContact();
            ModifiersChanged?.Invoke(false, false, false);
            ClearPendingTaps();
            keyContacts.Clear();
            modifierContacts.Clear();
            lastTap = null;
            inputLocked = false;
        }
        private void Reset()
        {
            CancelContacts();
            keys.Clear();
        }
    }
}
