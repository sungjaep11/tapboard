using System;

namespace TapBoard
{
    // Shared touch contracts contain no Windows handles.
    public enum KeyAreaEvent { TOUCH = 1, MOVE = 2, RELEASE = 3 }

    public class KeyInputEventArgs : EventArgs
    {
        public string key;
        public bool shift;
        public bool control;
        public bool alt;
    }


}
