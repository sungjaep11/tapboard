using System;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using TapBoard;

class Program
{
    static string ReadHttp(StudyFeed feed, string path, string host = "127.0.0.1:47831", string extra = "X-TapBoard-Study: 1\r\n")
    {
        var bytes = System.Text.Encoding.UTF8;
        var assembly = typeof(Program).Assembly;
        using var embedded = assembly.GetManifestResourceStream("tapboard-test.html");
        using var page = new MemoryStream();
        embedded.CopyTo(page);
        using var request = new MemoryStream(bytes.GetBytes("GET " + path + " HTTP/1.1\r\nHost: " + host + "\r\n" + extra + "\r\n"));
        using var response = new MemoryStream();
        LocalStudyServer.Serve(request, response, page.ToArray(), feed);
        return bytes.GetString(response.ToArray());
    }
    static void CheckHttp()
    {
        var feed = new StudyFeed("demo","{\"sessionId\":\"demo\"}");
        feed.Append(1,"down",3,"{\"seq\":1}");
        feed.Append(2,"heartbeat",0,"{\"seq\":2}");
        string Get(string path) => ReadHttp(feed,path).Split("\r\n\r\n",2)[1];
        if (!Get("/").Contains("로깅 시작") || !Get("/").Contains("class LocalLink")) throw new Exception("Embedded HTML");
        if (!Get("/touch").Contains("\"seed\":[{\"seq\":1}]") || !Get("/touch").Contains("\"heartbeat\":{\"seq\":2}")) throw new Exception("Held contacts at attach");
        if (Get("/touch?session=demo&after=1") != "{\"events\":[{\"seq\":2}]}") throw new Exception("Incremental rows");
        if (!ReadHttp(feed,"/touch",extra:"").StartsWith("HTTP/1.1 404") ||
            !ReadHttp(feed,"/touch","foreign.test").StartsWith("HTTP/1.1 403") ||
            !ReadHttp(feed,"/touch",extra:"Origin: https://foreign.test\r\nX-TapBoard-Study: 1\r\n").StartsWith("HTTP/1.1 403"))
            throw new Exception("Local request boundary");
        for(int i=3;i<=32772;i++) feed.Append(i,"up",3,"{\"seq\":"+i+"}");
        if(!Get("/touch?session=demo&after=1").Contains("\"cursor\":32772") || !Get("/touch?session=stale&after=32772").Contains("\"seed\":[]"))
            throw new Exception("Overrun or restart");
        using var batch = JsonDocument.Parse(Get("/touch?session=demo&after=4"));
        if(batch.RootElement.GetProperty("events").GetArrayLength()!=2048) throw new Exception("Batch cap");
        Console.WriteLine("PASS: embedded study, HTTP framing, origin, cursor replay, held contacts, restart and ring rollover.");
    }

    static void CheckRecordingScope(string directory)
    {
        // Same visible 15 x 5.5-key-unit region used by the 1920px, 125px-pitch layout.
        var bounds = new Rectangle(22, 0, 1875, 688);
        foreach (string keyboard in new[] { "TapBoard+", "ConvBoard" })
        {
            var log = new TouchExperimentLog(directory, 300, keyboard, 1920, 125, false, 300, bounds);
            log.Record("down", 90, 600, 1000, "BLANK"); // Resting palm below the keyboard.
            log.Record("move", 90, 600, 300, "BLANK"); // Moving inside does not admit that contact.
            log.Record("ACCEPT", 90, 600, 1000);
            log.Record("up", 90, 600, 300, "BLANK");
            log.Record("down", 91, bounds.Left - 1, 100, "BLANK");
            log.Record("up", 91, bounds.Left, 100, "BLANK");
            log.Record("down", 92, bounds.Right, 100, "BLANK");
            log.Record("up", 92, bounds.Right, 100, "BLANK");
            log.Record("down", 93, 600, bounds.Bottom, "BLANK");
            log.Record("up", 93, 600, bounds.Bottom, "BLANK");
            // Reuse an excluded ID for an inside contact; retain its complete outside release.
            log.Record("down", 91, bounds.Left, bounds.Top, "TAPPER");
            log.Record("move", 91, 600, 800, "TAPPER");
            log.Record("up", 91, 600, 900, "TAPPER");
            // Gaps within the visible keyboard remain valid resting/exploration locations.
            log.Record("down", 94, bounds.Right - 1, bounds.Bottom - 1, "BLANK");
            log.Record("up", 94, bounds.Right - 1, bounds.Bottom - 1, "BLANK");
            // Reuse that included ID outside; the old admission must not survive.
            log.Record("down", 94, 600, 1000, "BLANK");
            log.Record("up", 94, 600, 1000, "BLANK");
            log.Record("heartbeat");
            log.Dispose();
            var rows = File.ReadAllLines(log.Path).Select(s => JsonDocument.Parse(s).RootElement.Clone()).ToArray();
            if (rows[0].GetProperty("recordingPolicy").GetString() != "contact-down-in-keyboard" ||
                rows[0].GetProperty("recordingBounds").GetProperty("bottom").GetInt32() != bounds.Bottom)
                throw new Exception("Recording region metadata");
            var contacts = rows.Where(e => e.GetProperty("type").GetString() is "down" or "move" or "up").ToArray();
            if (contacts.Length != 5 || contacts.Count(e => e.GetProperty("id").GetInt32() == 91) != 3 ||
                contacts.Count(e => e.GetProperty("id").GetInt32() == 94) != 2 ||
                contacts[2].GetProperty("type").GetString() != "up" || contacts[2].GetProperty("y").GetInt32() != 900)
                throw new Exception("Outside contact leaked or inside gesture was truncated");
            if (rows.Any(e => e.GetProperty("type").GetString() == "ACCEPT") ||
                !rows.Any(e => e.GetProperty("type").GetString() == "heartbeat") ||
                rows.Last().GetProperty("type").GetString() != "end") throw new Exception("Control/status filtering");
            for (int i = 0; i < rows.Length; i++)
                if (rows[i].GetProperty("seq").GetInt32() != i) throw new Exception("Filtering created a sequence gap");
        }
        Console.WriteLine("PASS: both keyboards exclude outside palms, preserve inside gestures, boundaries, ID reuse and continuous sequence numbers.");
    }

    static void Main(string[] args)
    {
        CheckHttp();
        string directory = args.Length > 0 ? args[0] : System.IO.Path.Combine(System.IO.Path.GetTempPath(), "tapboard-journal-check-" + Guid.NewGuid());
        CheckRecordingScope(directory);
        var log = new TouchExperimentLog(directory, 300, widthPx: 1920, pitchPx: 125, widthMm: 300);
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
        if (lines[0].GetProperty("widthMm").GetDouble() != 300 || lines[0].GetProperty("widthPx").GetInt32() != 1920 ||
            lines[0].GetProperty("pitchPx").GetInt32() != 125) throw new Exception("Monitor calibration was not preserved");
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
