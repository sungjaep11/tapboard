using System;
using System.Windows.Forms;

namespace TapBoard
{
    static class Program
    {
        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();
        [System.Runtime.InteropServices.DllImport("shcore.dll")]
        private static extern int SetProcessDpiAwareness(int awareness);

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int index);

        [STAThread]
        static void Main()
        {
            try { SetProcessDpiAwareness(2); }
            catch (DllNotFoundException) { SetProcessDPIAware(); }
            catch (EntryPointNotFoundException) { SetProcessDPIAware(); }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            const int SM_DIGITIZER = 94;
            const int NID_MULTI_INPUT = 0x40;
            const int NID_READY = 0x80;
            int capabilities = GetSystemMetrics(SM_DIGITIZER);
            if ((capabilities & (NID_MULTI_INPUT | NID_READY)) != (NID_MULTI_INPUT | NID_READY))
            {
                MessageBox.Show("A ready multitouch device is required.", "TapBoard");
                return;
            }
            Application.Run(new Keyboard());
        }
    }
}


