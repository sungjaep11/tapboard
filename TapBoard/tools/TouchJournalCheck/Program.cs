using System;
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

    static void Main(string[] args)
    {
        CheckHttp();
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
