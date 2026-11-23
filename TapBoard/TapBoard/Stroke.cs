using System;
using System.Diagnostics;

namespace TapBoard
{
    // A contact clock starts at down and is never restarted by move events.
    internal sealed class Stroke
    {
        public readonly int pointID;
        public int currentX;
        public int currentY;
        public readonly int startX;
        public readonly int startY;
        private readonly Func<long> elapsedMilliseconds;


        public Stroke(int _pointID, int x, int y) : this(_pointID, x, y, CreateClock()) { }

        private static Func<long> CreateClock()
        {
            var watch = Stopwatch.StartNew();
            return () => watch.ElapsedMilliseconds;
        }

        // Tests can advance contact age without sleeping or relying on UI timing.
        internal Stroke(int _pointID, int x, int y, Func<long> elapsedMilliseconds)
        {
            pointID = _pointID;
            currentX = startX = x;
            currentY = startY = y;
            this.elapsedMilliseconds = elapsedMilliseconds;
        }

        public void AddPoint(int _pointID, int x, int y)
        {
            if (pointID != _pointID) 
                return;

            currentX = x;
            currentY = y;

            // Retain the latest point: tap classification uses release displacement.
        }

        public int GetDisplacement()
        {
            int dx = currentX - startX;
            int dy = currentY - startY;
            return (int)Math.Sqrt(dx * dx + dy * dy);
        }

        // A young contact is still pending, not expired. The minimum duration
        // only rejects a completed tap; it must not dim a newly touched key.
        internal bool HasTimedOut { get { return elapsedMilliseconds() >= KeyboardSettings.Current.TapDurationMs; } }

        internal bool IsExpired()
        {
            return HasTimedOut || GetDisplacement() >= KeyboardSettings.Current.TapDistancePixels;
        }

        public bool IsTap()
        {
            long elapsed = elapsedMilliseconds();
            return elapsed >= KeyboardSettings.Current.TapMinDurationMs &&
                elapsed < KeyboardSettings.Current.TapDurationMs &&
                GetDisplacement() < KeyboardSettings.Current.TapDistancePixels;
        }

    }
}
