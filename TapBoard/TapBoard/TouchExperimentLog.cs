using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;

namespace TapBoard
{
    // Dedicated append-only journal. The input thread only queues small records;
    // the worker owns all disk I/O. UI-thread heartbeats prove contact processing
    // is alive; the writer must never manufacture heartbeats during a UI stall.
    internal sealed class TouchExperimentLog : IDisposable
    {
        private readonly object gate = new object();
        private readonly Queue<string> pending = new Queue<string>();
        private readonly Stopwatch clock = Stopwatch.StartNew();
        private readonly Thread worker;
        private readonly StudyFeed feed;
        private readonly LocalStudyServer server;
        private bool stopping;
        private long sequence;
        private volatile string failure;
        internal string Failure { get { return failure; } }
        internal readonly string Path;
        internal readonly string SessionId = Guid.NewGuid().ToString("N");
        private static double UnixNow()
        { return (DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds; }
        private static string Number(double value) { return value.ToString("F3", CultureInfo.InvariantCulture); }
        private static string Quote(string value)
        {
            var text = new StringBuilder("\"");
            foreach (char c in value ?? "")
                if (c == '"' || c == '\\') text.Append('\\').Append(c);
                else if (c < 32) text.Append("\\u").Append(((int)c).ToString("x4"));
                else text.Append(c);
            return text.Append('"').ToString();
        }

        internal TouchExperimentLog(string directory, int tapDurationMs, string keyboard = "TapBoard+", int widthPx = 0, int pitchPx = 0, bool direct = false, double widthMm = 0)
        {
            double startedUnixMs = UnixNow() - clock.Elapsed.TotalMilliseconds;
            string header = "{\"schema\":\"tapboard-touch/v1\",\"type\":\"session\",\"seq\":0,\"t\":0,\"sessionId\":" +
                Quote(SessionId) + ",\"keyboard\":" + Quote(keyboard) + ",\"widthPx\":" + widthPx +
                (widthMm > 0 ? ",\"widthMm\":" + Number(widthMm) : "") +
                ",\"pitchPx\":" + pitchPx + ",\"startedUnixMs\":" + Number(startedUnixMs) + ",\"activation\":" + Quote(keyboard == "ConvBoard" ? "touch-down" : "tap-release") +
                ",\"tapDurationMs\":" + (keyboard == "ConvBoard" ? "null" : tapDurationMs.ToString(CultureInfo.InvariantCulture)) + "}";
            if (direct)
            {
                feed = new StudyFeed(SessionId, header);
                try { server = new LocalStudyServer(feed); }
                catch (Exception error) { failure = "직접 연결을 열 수 없습니다. 다른 키보드 앱을 종료한 뒤 다시 실행하세요. " + error.Message; }
                return;
            }
            Path = System.IO.Path.Combine(directory, (keyboard == "ConvBoard" ? "convboard-touch-" : "touch-") + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + "-" + SessionId + ".jsonl");
            pending.Enqueue(header);
            worker = new Thread(WriteLoop) { IsBackground = true, Name = "TapBoard experiment log" };
            worker.Start();
        }

        internal void Record(string type, int id = 0, int x = 0, int y = 0, string keyType = "", string detail = "")
        {
            lock (gate)
            {
                if (stopping || failure != null) return;
                if (pending.Count >= 16384)
                {
                    failure = "Experiment log queue overflow; this recording is incomplete.";
                    type = "gap";
                    stopping = true;
                }
                string row = "{\"seq\":" + (++sequence) + ",\"t\":" + Number(clock.Elapsed.TotalMilliseconds) +
                    ",\"type\":" + Quote(type) + ",\"id\":" + id + ",\"x\":" + x + ",\"y\":" + y +
                    ",\"keyType\":" + Quote(keyType) + ",\"detail\":" + Quote(detail) +
                    (type == "heartbeat" ? ",\"wallUnixMs\":" + Number(UnixNow()) : "") + "}";
                if (feed != null) feed.Append(sequence, type, id, row);
                else pending.Enqueue(row);
                if (stopping) Monitor.PulseAll(gate);
            }
        }

        private void WriteLoop()
        {
            try
            {
                Directory.CreateDirectory(System.IO.Path.GetDirectoryName(Path));
                using (var stream = new FileStream(Path, FileMode.CreateNew, FileAccess.Write, FileShare.ReadWrite))
                using (var writer = new StreamWriter(stream, new UTF8Encoding(false)))
                {
                    while (true)
                    {
                        string[] batch; bool finished;
                        lock (gate)
                        {
                            // A bounded flush delay keeps touch events off the disk path.
                            if (!stopping) Monitor.Wait(gate, 100);
                            batch = pending.ToArray(); pending.Clear(); finished = stopping;
                        }
                        foreach (string line in batch) writer.WriteLine(line);
                        writer.Flush();
                        if (finished) break;
                    }
                }
            }
            catch (Exception error)
            {
                failure = error.Message;
                lock (gate) { stopping = true; pending.Clear(); }
            }
        }

        public void Dispose()
        {
            lock (gate)
            {
                if (!stopping) { Record("end"); stopping = true; Monitor.PulseAll(gate); }
            }
            // Bounded shutdown: a blocked disk must not trap the UI forever.
            worker?.Join(2000);
            server?.Dispose();
        }
    }
}
