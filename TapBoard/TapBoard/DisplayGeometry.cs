using System;
using System.Drawing;
using System.Management;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace TapBoard
{
    internal static class DisplayGeometry
    {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct DisplayDevice
        {
            public int cb;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString;
            public int StateFlags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
        }
        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern bool EnumDisplayDevices(string name, uint index, ref DisplayDevice device, uint flags);

        public static Screen SelectScreen()
        {
            string configured = KeyboardSettings.Current.KeyboardDisplay;
            Screen chosen = null;
            foreach (Screen screen in Screen.AllScreens)
            {
                if (string.Equals(screen.DeviceName, configured, StringComparison.OrdinalIgnoreCase)) return screen;
                if (chosen == null || screen.Bounds.Bottom > chosen.Bounds.Bottom) chosen = screen;
            }
            return chosen ?? Screen.PrimaryScreen;
        }

        public static int GetPitch(Screen screen, out double width)
        {
            width = KeyboardSettings.Current.DisplayWidthMm;
            if (width <= 0)
            {
                DisplayDevice device = new DisplayDevice(); device.cb = Marshal.SizeOf(device);
                if (EnumDisplayDevices(screen.DeviceName, 0, ref device, 0))
                {
                    string[] parts = (device.DeviceID ?? "").Split('\\');
                    try
                    {
                        using (var searcher = new ManagementObjectSearcher(@"root\wmi", "SELECT InstanceName, MaxHorizontalImageSize FROM WmiMonitorBasicDisplayParams"))
                        using (var results = searcher.Get())
                            foreach (ManagementObject monitor in results)
                                using (monitor)
                                    if (parts.Length > 1 && Convert.ToString(monitor["InstanceName"]).IndexOf(parts[1], StringComparison.OrdinalIgnoreCase) >= 0)
                                        width = Convert.ToDouble(monitor["MaxHorizontalImageSize"]) * 10;
                    }
                    catch (ManagementException) { }
                    catch (UnauthorizedAccessException) { }
                }
            }
            if (width <= 0)
            {
                MessageBox.Show("The display did not report its physical width. Set DisplayWidthMm in TapBoard.exe.config to the visible screen width in millimetres for accurate 19.5 mm key spacing.", "TapBoard calibration");
                using (Graphics g = Graphics.FromHwnd(IntPtr.Zero)) width = screen.Bounds.Width * 25.4 / g.DpiX;
            }
            int pitch = Math.Max(1, (int)Math.Round(screen.Bounds.Width * KeyboardSettings.Current.KeyPitchMm / width));
            if (Math.Round(pitch * KeyArea.LayoutWidthUnits) > screen.Bounds.Width || Math.Round(pitch * KeyArea.LayoutHeightUnits) > screen.Bounds.Height)
                throw new InvalidOperationException("The keyboard does not fit this display at 19.5 mm spacing. Check KeyboardDisplay and DisplayWidthMm in TapBoard.exe.config.");
            return pitch;
        }
    }
}
