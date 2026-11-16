using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using TapBoard;

class Program
{
    static void Main(string[] args)
    {
        string directory = args.Length > 0 ? args[0] : System.IO.Path.Combine(System.IO.Path.GetTempPath(), "tapboard-journal-check-" + Guid.NewGuid());
        var log = new TouchExperimentLog(directory, 300);
        log.Record("heartbeat");
        log.Record("down", 7, 10, 20, "TAPPER", "quote\" slash\\ newline\n한국어");
        // Exercise actual append/read sharing before closing the journal.
        string snapshot = "";
        for (int i = 0; i < 100; i++)
        {
            Thread.Sleep(20);
            try { using (var f = new FileStream(log.Path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)) using (var r = new StreamReader(f)) snapshot = r.ReadToEnd(); }
            catch (IOException) { }
            if (snapshot.Contains("down")) break;
        }
        if (!snapshot.Contains("down")) throw new Exception("No live append data: " + log.Failure);
        log.Record("up", 7, 10, 20, "TAPPER"); log.Record("heartbeat"); log.Dispose(); log.Dispose();
        var lines = File.ReadAllLines(log.Path).Select(s => JsonDocument.Parse(s).RootElement.Clone()).ToArray();
        if (lines[0].GetProperty("schema").GetString() != "tapboard-touch/v1" || lines.Last().GetProperty("type").GetString() != "end") throw new Exception("Missing session/end");
        for (int i = 0; i < lines.Length; i++)
        {
            if (lines[i].GetProperty("seq").GetInt32() != i) throw new Exception("Sequence gap");
            if (i > 0 && lines[i].GetProperty("t").GetDouble() < lines[i-1].GetProperty("t").GetDouble()) throw new Exception("Clock reversal");
        }
        if (lines[2].GetProperty("detail").GetString() != "quote\" slash\\ newline\n한국어") throw new Exception("JSON escaping");
        Console.WriteLine("PASS: real C# journal append, live concurrent reads, sequence, clock, Unicode, final flush and idempotent disposal.");
        Console.WriteLine(log.Path);
    }
}
