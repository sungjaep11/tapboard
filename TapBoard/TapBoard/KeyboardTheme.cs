using System;
using System.Drawing;

namespace TapBoard
{
    // Central palette: state changes should remain readable without flashing
    // the entire keyboard. The lock shade is derived from each base color.
    internal static class KeyboardTheme
    {
        internal static readonly Color Character = Color.Navy;
        internal static readonly Color Special = Color.Gray;
        internal static readonly Color Active = Color.Yellow;
        internal static readonly Color CapsLock = Color.DarkGoldenrod;
        internal static readonly Color Label = Color.White;
        internal static readonly Color ShortcutLabel = Color.Red;
        internal static readonly Color Resting = Color.Gray;
    }
}
