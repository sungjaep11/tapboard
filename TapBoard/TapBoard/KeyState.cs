using System;
using System.Drawing;
using System.Collections.Generic;

namespace TapBoard
{
    // A tapping key tracks every contact independently. Releasing a resting
    // finger must not consume another finger's brief tap on the same key.
    internal sealed class KeyState
    {
        private Stroke stroke = null;       // held normal/modifier key
        private readonly Dictionary<int, Stroke> tappingContacts = new Dictionary<int, Stroke>();
        private readonly RepeatSchedule repeatSchedule = new RepeatSchedule(KeyboardSettings.Current.RepeatIntervalMs);

        public bool IsActive()      // is pressed. 
        {
            return stroke != null || tappingContacts.Count != 0;
        }

        public bool IsExpired()
        {
            if (definition.type == Key.TYPE.TAPPER && tappingContacts.Count != 0)
            {
                foreach (Stroke contact in tappingContacts.Values)
                    if (!contact.IsExpired()) return false;
                return true;
            }
            return false;
        }

        internal bool OnKeyAreaEvent(KeyAreaEvent e, int pointID, int x, int y)
        {
            switch (definition.type)
            {
                case Key.TYPE.NORMAL:
                    return OnKeyAreaEventForNormalKey(e, pointID, x, y);
                case Key.TYPE.TAPPER:
                    return OnKeyAreaEventForTappingKey(e, pointID, x, y);
                case Key.TYPE.MODIFIER:
                    return OnKeyAreaEventForModifierKey(e, pointID, x, y);
            }
            return false;
        }

        internal void CancelContact()
        {
            stroke = null;
            tappingContacts.Clear();
            repeatSchedule.Stop();
        }

        // Only NORMAL keys start repeating. Release/lock cancels immediately.
        public bool WantRepeat()
        {
            return repeatSchedule.IsDue();
        }
        private bool OnKeyAreaEventForNormalKey(KeyAreaEvent e, int pointID, int x, int y)
        {
            bool acceptKey = false;

            switch (e)
            {
                case KeyAreaEvent.TOUCH:
                    if (stroke == null && IsPointInside(x, y))
                    {
                        stroke = new Stroke(pointID, x, y);
                        acceptKey = true;
                        repeatSchedule.Start();
                    }
                    break;

                case KeyAreaEvent.MOVE:
                    if (stroke != null && stroke.pointID == pointID)
                    {
                        stroke.AddPoint(pointID, x, y);
                    }
                    break;

                case KeyAreaEvent.RELEASE:
                    if (stroke != null && stroke.pointID == pointID)
                    {
                        stroke = null;
                        repeatSchedule.Stop();
                    }
                    break;
            }
            return acceptKey;
        }

        // Commit exactly once, on release. A long rest expires naturally and
        // cannot become a new tap without a fresh down event.
        private bool OnKeyAreaEventForTappingKey(KeyAreaEvent e, int pointID, int x, int y)
        {
            Stroke contact;
            switch (e)
            {
                case KeyAreaEvent.TOUCH:
                    if (IsPointInside(x, y) && !tappingContacts.ContainsKey(pointID))
                        tappingContacts.Add(pointID, new Stroke(pointID, x, y));
                    break;
                case KeyAreaEvent.MOVE:
                    if (tappingContacts.TryGetValue(pointID, out contact))
                        contact.AddPoint(pointID, x, y);
                    break;
                case KeyAreaEvent.RELEASE:
                    if (tappingContacts.TryGetValue(pointID, out contact))
                    {
                        contact.AddPoint(pointID, x, y);
                        tappingContacts.Remove(pointID);
                        return contact.IsTap();
                    }
                    break;
            }
            return false;
        }

        private bool OnKeyAreaEventForModifierKey(KeyAreaEvent e, int pointID, int x, int y)
        {
            bool acceptKey = false;

            switch (e)
            {
                case KeyAreaEvent.TOUCH:
                    if (stroke == null && IsPointInside(x, y))
                    {
                        stroke = new Stroke(pointID, x, y);
                        acceptKey = true;
                    }
                    break;

                case KeyAreaEvent.MOVE:
                    if (stroke != null && stroke.pointID == pointID)
                    {
                        stroke.AddPoint(pointID, x, y);
                    }
                    break;

                case KeyAreaEvent.RELEASE:
                    if (stroke != null && stroke.pointID == pointID)
                    {
                        stroke.AddPoint(pointID, x, y);
                        stroke = null;
                    }
                    break;
            }
            return acceptKey;
        }

        private readonly KeyDefinition definition;
        internal KeyState(KeyDefinition definition) { this.definition = definition; }
        private bool IsPointInside(int x, int y) { return definition.HitBounds.Contains(x, y); }
    }
}
