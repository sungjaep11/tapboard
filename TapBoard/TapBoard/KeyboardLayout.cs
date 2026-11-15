using System;
using System.Drawing;
using System.Collections.Generic;

namespace TapBoard
{
    // Layout dimensions are physical keyboard units. Hit extensions are explicit
    // layout data, so input handling never needs to recognize a key by its label.
    internal sealed class KeyboardLayout
    {
        private int ppku;
        internal readonly List<Key> Keys = new List<Key>();
        internal Key LeftShift, RightShift, Control, RightControl, Alt, Windows;
        private List<Key> keys { get { return Keys; } }
        // One keyboard unit uses the configured physical pitch (19.5 mm by default).
        internal const double LayoutWidthUnits = 15;
        internal const double LayoutHeightUnits = 5.5;

        private Key AddKey(string code, string label, string shifted, double x, double y,
            double width = 1, double height = 1, Key.TYPE type = Key.TYPE.TAPPER,
            bool special = false, double hitHeightMultiplier = 1)
        {
            int left = (int)Math.Round(x * ppku);
            int top = (int)Math.Round(y * ppku);
            Key key = new Key(code, label, shifted, left, top,
                (int)Math.Round((x + width) * ppku) - left,
                (int)Math.Round((y + height) * ppku) - top,
                type, special ? KeyboardTheme.Special : KeyboardTheme.Character);
            key.SetHitHeightMultiplier(hitHeightMultiplier);
            keys.Add(key);
            return key;
        }

        private void AddCharacterRow(string characters, string shifted, double x, double y)
        {
            for (int i = 0; i < characters.Length; i++)
            {
                string label = characters[i].ToString();
                AddKey("{" + label + "}", label, shifted[i].ToString(), x + i, y);
            }
        }

        internal KeyboardLayout(int pitch, int availableWidth)
        {
            ppku = pitch;

            // Half-height function row, aligned with the full-size number row.
            AddKey("{ESC}", "Esc", null, 0, 0, height: 0.5, special: true);
            for (int i = 1; i <= 12; i++)
                AddKey("{F" + i + "}", "F" + i, null, i, 0, height: 0.5, special: true);
            AddKey("{DEL}", "Del", null, 13, 0, height: 0.5, special: true);
            AddKey("{APP_EXIT}", "⏻", null, 14.25, 0, width: 0.5, height: 0.5,
                type: Key.TYPE.NORMAL, special: true);

            AddCharacterRow("`1234567890-=", "~!@#$%^&*()_+", 0, 0.5);
            AddKey("{BKSP}", "Backspace", null, 13, 0.5, width: 2, type: Key.TYPE.NORMAL, special: true);

            AddKey("{TAB}", "Tab", null, 0, 1.5, width: 1.5, special: true);
            AddCharacterRow("qwertyuiop[]", "QWERTYUIOP{}", 1.5, 1.5);
            AddKey("{\\}", "\\", "|", 13.5, 1.5, width: 1.5);

            AddKey("{CAPSLOCK}", "Caps Lock", null, 0, 2.5, width: 1.75, special: true);
            AddCharacterRow("asdfghjkl;'", "ASDFGHJKL:\"", 1.75, 2.5);
            AddKey("{ENTER}", "Enter", null, 12.75, 2.5, width: 2.25, special: true);

            LeftShift = AddKey("", "Shift", null, 0, 3.5, width: 2.25,
                type: Key.TYPE.MODIFIER, special: true);
            AddCharacterRow("zxcvbnm,./", "ZXCVBNM<>?", 2.25, 3.5);
            RightShift = AddKey("", "Shift", null, 12.25, 3.5, width: 2.75,
                type: Key.TYPE.MODIFIER, special: true);

            Control = AddKey("", "Ctrl", null, 0, 4.5, width: 1.25,
                type: Key.TYPE.MODIFIER, special: true);
            Windows = AddKey("", "Win", null, 1.25, 4.5, width: 1.25,
                type: Key.TYPE.MODIFIER, special: true);
            Alt = AddKey("", "Alt", null, 2.5, 4.5, width: 1.25,
                type: Key.TYPE.MODIFIER, special: true);
            AddKey(" ", "Space", null, 3.75, 4.5, width: 5.25, 
                hitHeightMultiplier: KeyboardSettings.Current.SpaceHitHeightMultiplier);
            AddKey("{HANGUL}", "한/영", null, 9, 4.5, special: true);
            AddKey("{HANJA}", "한자", null, 10, 4.5, special: true);
            RightControl = AddKey("", "Ctrl", null, 11, 4.5,
                type: Key.TYPE.MODIFIER, special: true);

            // Inverted-T arrow buttons; no global flick gestures or Fn layer.
            AddKey("{UP}", "↑", null, 13, 4.5, height: 0.5, type: Key.TYPE.NORMAL, special: true);
            AddKey("{LEFT}", "←", null, 12, 5, height: 0.5, type: Key.TYPE.NORMAL, special: true);
            AddKey("{DOWN}", "↓", null, 13, 5, height: 0.5, type: Key.TYPE.NORMAL, special: true);
            AddKey("{RIGHT}", "→", null, 14, 5, height: 0.5, type: Key.TYPE.NORMAL, special: true);

            int dx = (availableWidth - (int)Math.Round(LayoutWidthUnits * ppku)) / 2;
            foreach (Key key in keys) key.Move(dx, 0);
        }

    }
}
