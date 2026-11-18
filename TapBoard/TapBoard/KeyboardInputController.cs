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
        // One snapshot per finger, including overlapping taps of the same character.
        private readonly Dictionary<int, bool> characterShiftAtDown = new Dictionary<int, bool>();
        private bool inputLocked;
        private readonly Func<double> clock;
        private readonly int sameKeyMinIntervalMs;
        private Key lastTapKey;
        private double lastTapTime;
        private bool lastTapShift, lastTapControl, lastTapAlt;

        internal KeyboardInputController() : this(KeyboardSettings.Current.SameKeyMinIntervalMs,
            () => System.Diagnostics.Stopwatch.GetTimestamp() * 1000.0 / System.Diagnostics.Stopwatch.Frequency) { }
        // Inject a monotonic clock for deterministic boundary and bounce tests.
        internal KeyboardInputController(int minimumIntervalMs, Func<double> clock)
        {
            sameKeyMinIntervalMs = minimumIntervalMs;
            this.clock = clock;
        }

        private bool AllowTap(Key key, bool shift, bool control, bool altOn)
        {
            double now = clock();
            if (lastTapKey == key && lastTapShift == shift && lastTapControl == control &&
                lastTapAlt == altOn && now - lastTapTime < sameKeyMinIntervalMs)
                return false;
            // Rejected bounces never extend the suppression period. Intervening
            // accepted keys and changed modifiers permit a fresh input immediately.
            lastTapKey = key;
            lastTapTime = now;
            lastTapShift = shift;
            lastTapControl = control;
            lastTapAlt = altOn;
            return true;
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
            if (inputLocked || new HashSet<Key>(keyContacts.Values).Count <= KeyboardSettings.Current.MaxActiveKeys) return;
            // Cancel before processing releases in the native packet. Once
            // locked, every tracked contact (including modifiers) must lift.
            inputLocked = true;
            characterShiftAtDown.Clear();
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
            bool accepted = key != null && key.OnKeyAreaEvent(e, pointID, x, y);
            bool shiftIsActive = IsShiftKeyOn(), controlIsActive = IsControlKeyOn();
            bool altIsActive = alt != null && alt.IsActive();
            // Native modifier transitions follow contact lifetime, independently
            // of the ordinary key's release/tap decision and repeat schedule.
            if (shiftWasActive != shiftIsActive || controlWasActive != controlIsActive || altWasActive != altIsActive)
                ModifiersChanged?.Invoke(shiftIsActive, controlIsActive, altIsActive);
            bool shift = shiftIsActive;
            // Only character keys have a shifted label. Remember Shift for
            // each pending tap, and discard the snapshot even on a rejected up.
            if (key != null && key.Definition.label2 != null)
            {
                if (e == KeyAreaEvent.TOUCH && !characterShiftAtDown.ContainsKey(pointID))
                    characterShiftAtDown.Add(pointID, shift);
                else if (e == KeyAreaEvent.RELEASE)
                {
                    characterShiftAtDown.TryGetValue(pointID, out shift);
                    characterShiftAtDown.Remove(pointID);
                }
            }
            if (accepted)
            {
                bool control = controlIsActive;
                bool allowed = key.Definition.type != Key.TYPE.TAPPER ||
                    AllowTap(key, shift, control, alt != null && alt.IsActive());
                if (allowed)
                {
                    if (key.Definition.type == Key.TYPE.NORMAL) lastTapKey = null;
                    TraceTouch("ACCEPT", pointID, x, y, e.ToString());
                    CreateKeyInputEvent(key.GetName(), shift, control);
                }
                else TraceTouch("REJECT_DUPLICATE", pointID, x, y, key.GetName());
            }
            bool windowsIsActive = windowsKey != null && windowsKey.IsActive();
            if (windowsWasActive != windowsIsActive)
                CreateKeyInputEvent(windowsIsActive ? "{WIN_DOWN}" : "{WIN_UP}", false, false);
        }

        internal void Repeat()
        {
            if (inputLocked) return;
            foreach (Key key in keys)
            {
                if (key.WantRepeat())
                {
                    lastTapKey = null;
                    TraceTouch("REPEAT", 0, 0, 0, "");
                    CreateKeyInputEvent(key.GetName(), IsShiftKeyOn(), IsControlKeyOn());
                }
            }
        }

        private void CreateKeyInputEvent(string key, bool shift, bool control)
        {
            KeyInputEventArgs args = new KeyInputEventArgs();
            args.key = key;
            args.shift = shift;
            args.control = control;
            args.alt = alt != null && alt.IsActive();

            OnKeyInput(args);
        }

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
            characterShiftAtDown.Clear();
            keyContacts.Clear();
            modifierContacts.Clear();
            lastTapKey = null;
            inputLocked = false;
        }
        private void Reset()
        {
            CancelContacts();
            keys.Clear();
        }
    }
}
