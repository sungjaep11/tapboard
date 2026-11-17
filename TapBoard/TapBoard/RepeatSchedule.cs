using System;
using System.Diagnostics;

namespace TapBoard
{
    // Wait for a deliberate hold before the first repeat, then enforce a
    // minimum interval after each emitted repeat. Do not shorten
    // the next interval to compensate for a delayed UI callback.
    internal sealed class RepeatSchedule
    {
        private readonly double delay;
        private readonly double interval;
        private readonly Func<double> clock;
        private double next;
        private bool running;

        internal RepeatSchedule(int delayMs, int intervalMs) : this(delayMs, intervalMs,
            () => Stopwatch.GetTimestamp() * 1000.0 / Stopwatch.Frequency) { }
        internal RepeatSchedule(int delayMs, int intervalMs, Func<double> clock)
        {
            if (delayMs <= 0) throw new ArgumentOutOfRangeException("delayMs");
            if (intervalMs <= 0) throw new ArgumentOutOfRangeException("intervalMs");
            delay = delayMs;
            interval = intervalMs;
            this.clock = clock;
        }
        internal void Start() { next = clock() + delay; running = true; }
        internal void Stop() { running = false; }
        internal bool IsDue()
        {
            if (!running) return false;
            double now = clock();
            if (now < next) return false;
            next = now + interval;
            return true;
        }
    }
}
