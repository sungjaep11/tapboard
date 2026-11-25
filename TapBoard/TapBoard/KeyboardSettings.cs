using System;
using System.Drawing;
using System.Collections.Generic;
using System.Diagnostics;

namespace TapBoard
{
    // Read and validate configuration once. Input callbacks only read values;
    // they never parse configuration or perform file I/O.
    internal sealed class KeyboardSettings
    {
        internal static readonly KeyboardSettings Current = new KeyboardSettings();
        internal readonly int TapDurationMs = Integer("TapDurationMs", 300, 1, 5000);
        internal readonly int TapMinDurationMs;
        private KeyboardSettings()
        {
            // Keep the inclusive minimum below the exclusive maximum, even
            // when a custom maximum is smaller than the default minimum.
            TapMinDurationMs = Integer("TapMinDurationMs", Math.Min(10, TapDurationMs - 1), 0, TapDurationMs - 1);
        }
        internal readonly double TapDistancePixels = Number("TapDistancePixels", 60, 1, 1000);
        // Limit distinct non-modifier keys; held modifiers have separate ownership.
        internal readonly int MaxActiveKeys = Integer("MaxActiveKeys", 2, 1, 10);
        internal readonly int RepeatDelayMs = Integer("RepeatDelayMs", 450, 1, 5000);
        internal readonly int RepeatIntervalMs = Integer("RepeatIntervalMs", 100, 10, 2000);
        // Debounce consecutive accepted taps on one key; zero disables this policy.
        internal readonly int SameKeyMinIntervalMs = Integer("SameKeyMinIntervalMs", 100, 0, 1000);
        internal readonly int RepeatPollMs = 10;
        internal readonly double SpaceHitHeightMultiplier = Number("SpaceHitHeightMultiplier", 2, 1, 4);
        internal readonly double LockedBrightness = Number("LockedBrightness", 0.85, 0.1, 1);
        internal readonly double KeyPitchMm = Number("KeyPitchMm", 19.5, 5, 40);
        internal readonly double TouchFrequencyHz = Number("TouchFrequencyHz", 261.625565, 40, 4000);
        internal readonly double InputFrequencyHz = Number("InputFrequencyHz", 329.627557, 40, 4000);
        internal readonly double TouchGain = Number("TouchGain", 0.07, 0, 1);
        internal readonly double InputGain = Number("InputGain", 0.12, 0, 1);
        internal readonly double TouchDurationSeconds = Number("TouchDurationMs", 70, 1, 1000) / 1000;
        internal readonly double InputDurationSeconds = Number("InputDurationMs", 60, 1, 1000) / 1000;
        internal readonly bool ExperimentLogging = Boolean("ExperimentLogging", false);
        internal readonly bool TraceTouches = Boolean("TraceTouches", false);
        internal readonly bool FilterTouchMouse = Boolean("FilterTouchMouse", true);
        // The legacy switch remains a fallback for older configuration files.
        internal readonly bool TouchSoundEnabled = Boolean("TouchSoundEnabled", Boolean("SoundEnabled", true));
        internal readonly bool InputSoundEnabled = Boolean("InputSoundEnabled", Boolean("SoundEnabled", true));
        internal readonly string KeyboardDisplay = Text("KeyboardDisplay");
        internal readonly double DisplayWidthMm = Number("DisplayWidthMm", 0, 0, 5000);
        private static string Text(string name)
        {
#if CONVBOARD
            return ConvBoardConfiguration.Get(name);
#else
            return System.Configuration.ConfigurationManager.AppSettings[name] ?? "";
#endif
        }
        private static bool Boolean(string name, bool fallback)
        { bool value; return bool.TryParse(Text(name), out value) ? value : fallback; }
        private static int Integer(string name, int fallback, int minimum, int maximum)
        {
            int value;
            return int.TryParse(Text(name), out value) && value >= minimum && value <= maximum
                ? value : fallback;
        }
        private static double Number(string name, double fallback, double minimum, double maximum)
        {
            double value;
            return double.TryParse(Text(name), System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out value) &&
                !double.IsNaN(value) && value >= minimum && value <= maximum ? value : fallback;
        }
    }
}
