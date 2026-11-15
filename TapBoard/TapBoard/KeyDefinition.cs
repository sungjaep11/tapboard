using System;
using System.Drawing;
using System.Diagnostics;

namespace TapBoard
{
    // Identity, labels, appearance role, and geometry do not contain touch state.
    internal sealed class KeyDefinition
    {
        internal readonly Key.TYPE type;
        internal readonly string name;
        internal readonly string label1;
        internal readonly string label2;     // shifted code
        public int x;
        public int y;
        public readonly int width;
        public readonly int height;
        internal readonly Color color;

        internal Rectangle VisualBounds { get { return new Rectangle(x, y, width, height); } }
        internal Rectangle HitBounds { get { return new Rectangle(x, y, width, hitHeight); } }
        internal int hitHeight;
        internal KeyDefinition(string _name, string _label1, string _label2, int _x, int _y, int _width, int _height, Key.TYPE _type, Color _color)
        {
            name = _name;
            label1 = _label1;
            label2 = _label2;
            x = _x;
            y = _y;
            width = _width;
            height = _height;
            hitHeight = _height;
            type = _type;
            color = _color;
        }
        public string GetLabel(bool shifted, bool korean = false, bool capsLock = false)
        {
            Debug.Assert(label1 != null);
            if (label1.Length == 1 && label1[0] >= 'a' && label1[0] <= 'z')
            {
                int index = label1[0] - 'a';
                if (korean)
                {
                    // Indexed by Latin a..z; these are physical two-set keys,
                    // not composed Hangul syllables. Caps Lock does not alter them.
                    const string normal = "ㅁㅠㅊㅇㄷㄹㅎㅗㅑㅓㅏㅣㅡㅜㅐㅔㅂㄱㄴㅅㅕㅍㅈㅌㅛㅋ";
                    const string shiftedHangul = "ㅁㅠㅊㅇㄸㄹㅎㅗㅑㅓㅏㅣㅡㅜㅒㅖㅃㄲㄴㅆㅕㅍㅉㅌㅛㅋ";
                    return (shifted ? shiftedHangul : normal)[index].ToString();
                }
                return shifted ^ capsLock ? label1.ToUpperInvariant() : label1;
            }
            string s = label1;
            if (shifted && label2 != null)
                s = label2;
            return s;
        }

    }
}
