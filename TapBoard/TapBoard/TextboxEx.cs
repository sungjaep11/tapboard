using System;
using System.Windows.Forms;

namespace TapBoard
{
    public class TextboxEx : TextBox
    {
        private const int EM_GETLINECOUNT = 0xBA;
        private const int EM_LINEINDEX = 0xBB;
        private const int EM_LINELENGTH = 0xC1;

        public TextboxEx() : base()
        {
            this.Multiline = true;
            this.ScrollBars = ScrollBars.Vertical;
        }

        public int LineCount
        {
            get
            {
                System.Windows.Forms.Message msg = System.Windows.Forms.Message.Create(this.Handle, EM_GETLINECOUNT, IntPtr.Zero, IntPtr.Zero);
                base.DefWndProc(ref msg);
                return msg.Result.ToInt32();
            }
        }
        public int LineIndex(int Index)
        {
            System.Windows.Forms.Message msg = System.Windows.Forms.Message.Create(this.Handle, EM_LINEINDEX, (IntPtr)Index, IntPtr.Zero);
            base.DefWndProc(ref msg);
            return msg.Result.ToInt32();
        }
        public int LineLength(int Index)
        {
            System.Windows.Forms.Message msg = System.Windows.Forms.Message.Create(this.Handle, EM_LINELENGTH, (IntPtr)Index, IntPtr.Zero);
            base.DefWndProc(ref msg);
            return msg.Result.ToInt32();
        }
    }
}
