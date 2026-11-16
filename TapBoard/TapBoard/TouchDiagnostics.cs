using System;
using System.Drawing;
using System.Collections.Generic;
using System.Diagnostics;

namespace TapBoard
{
    // Record on the input thread; never perform periodic disk I/O in a touch callback.
    internal sealed class TouchDiagnostics
    {
        internal TouchExperimentLog Experiment { get; private set; }
        internal void StartExperiment()
        {
            if (Experiment == null && KeyboardSettings.Current.ExperimentLogging)
                Experiment = new TouchExperimentLog(System.IO.Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
                    "TapBoard-Experiments"), KeyboardSettings.Current.TapDurationMs);
        }
        private readonly bool traceTouches;
        private readonly string destination;
        internal TouchDiagnostics() : this(KeyboardSettings.Current.TraceTouches,
            System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "touch-diagnostics.csv")) { }
        internal TouchDiagnostics(bool enabled, string destination)
        { traceTouches = enabled; this.destination = destination; }
        private readonly Stopwatch traceClock = Stopwatch.StartNew();
        private readonly Queue<string> touchTrace = new Queue<string>();

        internal void TraceTouch(string stage, int id, int x, int y, string detail)
        {
            if (stage == "LOCK" || stage == "UNLOCK" || stage == "ACCEPT" || stage == "REJECT_DUPLICATE" || stage == "NATIVE_ERROR")
                Experiment?.Record(stage, id, x, y, "", detail);
            if (!traceTouches) return;
            if (touchTrace.Count >= 10000) touchTrace.Dequeue();
            touchTrace.Enqueue(traceClock.Elapsed.TotalMilliseconds.ToString("F3",
                System.Globalization.CultureInfo.InvariantCulture) + "," + stage + "," +
                id + "," + x + "," + y + "," + detail);
        }
        internal void TraceDelivery(uint sent, int expected, int error, IntPtr foreground)
        {
            TraceTouch("SEND", 0, 0, 0, sent + "/" + expected + ";error=" + error +
                ";foreground=" + foreground.ToInt64());
        }
        private long lastTraceSave = -1000;
        private readonly object traceFileLock = new object();
        private int traceSavePending;
        private bool traceFinalSaved;
        internal void SaveTouchTrace(bool final = false)
        {
            if (final) Experiment?.Dispose();
            else Experiment?.Record("heartbeat");
            if (!traceTouches) return;
            if (!final && (traceClock.ElapsedMilliseconds - lastTraceSave < 1000 ||
                System.Threading.Interlocked.CompareExchange(ref traceSavePending, 1, 0) != 0)) return;
            lastTraceSave = traceClock.ElapsedMilliseconds;
            string[] snapshot = touchTrace.ToArray();
            Action save = () =>
            {
                try
                {
                    lock (traceFileLock)
                    {
                        // A queued older snapshot must not overwrite the final save.
                        if (!final && traceFinalSaved) return;
                        if (final) traceFinalSaved = true;
                        string path = destination;
                        System.IO.File.WriteAllLines(path, new[] { "elapsed_ms,stage,contact_id,x,y,detail" });
                        System.IO.File.AppendAllLines(path, snapshot);
                    }
                }
                catch (Exception ex) { Debug.WriteLine(ex); }
                finally { if (!final) System.Threading.Interlocked.Exchange(ref traceSavePending, 0); }
            };
            if (final) save();
            else System.Threading.ThreadPool.QueueUserWorkItem(state => save());
        }
    }
}
