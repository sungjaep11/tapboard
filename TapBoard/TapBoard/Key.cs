using System;
using System.Drawing;
using System.Collections.Generic;
using System.Diagnostics;

namespace TapBoard
{
    // A key joins identity/layout data with mutable interaction state.
    // Rendering and hit testing deliberately use different rectangles.
    public sealed class Key
    {
        public enum TYPE { NORMAL, TAPPER, MODIFIER }
        internal readonly KeyDefinition Definition;
        internal readonly KeyState State;
        public int x { get { return Definition.x; } }
        public int y { get { return Definition.y; } }
        public int width { get { return Definition.width; } }
        public int height { get { return Definition.height; } }
        public Rectangle VisualBounds { get { return Definition.VisualBounds; } }
        public Rectangle HitBounds { get { return Definition.HitBounds; } }
        public Key(string name, string label, string shifted, int x, int y, int width,
            int height, TYPE type, Color color)
        {
            Definition = new KeyDefinition(name, label, shifted, x, y, width, height, type, color);
            State = new KeyState(Definition);
        }
        internal void SetHitHeightMultiplier(double multiplier)
        { Definition.hitHeight = (int)Math.Round(height * multiplier); }
        public void Move(int dx, int dy) { Definition.x += dx; Definition.y += dy; }
        public string GetName() { return Definition.name ?? ""; }
        public string GetLabel(bool shifted, bool korean = false, bool capsLock = false)
        { return Definition.GetLabel(shifted, korean, capsLock); }
        public bool IsActive() { return State.IsActive(); }
        public bool IsExpired() { return State.IsExpired(); }
        public bool WantRepeat() { return State.WantRepeat(); }
        internal void CancelContact() { State.CancelContact(); }
        internal bool IsPointInside(int x, int y) { return HitBounds.Contains(x, y); }
        public bool OnKeyAreaEvent(KeyAreaEvent e, int id, int x, int y)
        { return State.OnKeyAreaEvent(e, id, x, y); }
    }
}
