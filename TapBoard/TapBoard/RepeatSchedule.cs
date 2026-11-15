using System;
using System.Diagnostics;

namespace TapBoard
{
    // Enforce a minimum interval after each emitted repeat. Do not shorten
    // the next interval to compensate for a delayed UI callback.
    internal sealed class RepeatSchedule
    {
        private readonly double interval;
        private readonly Func<double> clock;
        private double next;
        private bool running;

        internal RepeatSchedule(int intervalMs) : this(intervalMs,
            () => Stopwatch.GetTimestamp() * 1000.0 / Stopwatch.Frequency) { }
        internal RepeatSchedule(int intervalMs, Func<double> clock)
        {
            if (intervalMs <= 0) throw new ArgumentOutOfRangeException("intervalMs");
            interval = intervalMs;
            this.clock = clock;
        }
        internal void Start() { next = clock() + interval; running = true; }
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
