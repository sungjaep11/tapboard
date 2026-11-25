using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;

namespace TapBoard
{
    // Single-origin offline study page. The keyboard thread only writes to memory.
    internal sealed class StudyFeed
    {
        private const int Capacity = 32768, BatchSize = 2048;
        private readonly string[] ring = new string[Capacity];
        private readonly Dictionary<int, string> held = new Dictionary<int, string>();
        private readonly string sessionId, header;
        private string heartbeat;
        private long cursor;

        internal StudyFeed(string sessionId, string header)
        { this.sessionId = sessionId; this.header = header; }

        internal void Append(long seq, string type, int id, string row)
        {
            lock (ring)
            {
                ring[seq % Capacity] = row;
                cursor = seq;
                if (type == "down") held[id] = row;
                else if (type == "up") held.Remove(id);
                else if (type == "heartbeat") heartbeat = row;
                else if (type == "reset" || type == "gap" || type == "NATIVE_ERROR" || type == "end") held.Clear();
            }
        }

        internal string Read(string session, long after)
        {
            lock (ring)
            {
                if (session != sessionId || after < 0 || after > cursor || cursor - after > Capacity)
                    return "{\"session\":" + header + ",\"cursor\":" + cursor.ToString(CultureInfo.InvariantCulture) +
                        ",\"seed\":[" + string.Join(",", held.Values) + "],\"heartbeat\":" + (heartbeat ?? "null") + "}";
                int count = (int)Math.Min(cursor - after, BatchSize);
                var rows = new string[count];
                for (int i = 0; i < count; i++) rows[i] = ring[(after + i + 1) % Capacity];
                return "{\"events\":[" + string.Join(",", rows) + "]}";
            }
        }
    }

    internal sealed class LocalStudyServer : IDisposable
    {
        internal const int Port = 47831;
        private const string Host = "127.0.0.1:47831";
        private readonly StudyFeed feed;
        private readonly TcpListener listener = new TcpListener(IPAddress.Loopback, Port);
        private readonly byte[] page;
        private volatile bool stopped;
        private int clients;

        internal LocalStudyServer(StudyFeed feed)
        {
            this.feed = feed;
            using (var embedded = Assembly.GetExecutingAssembly().GetManifestResourceStream("tapboard-test.html"))
            using (var bytes = new MemoryStream())
            {
                if (embedded == null) throw new IOException("실험 HTML이 포함된 새 Windows 앱을 사용하세요.");
                embedded.CopyTo(bytes);
                page = bytes.ToArray();
            }
            try
            {
                listener.ExclusiveAddressUse = true;
                listener.Start(12);
                new Thread(Accept) { IsBackground = true, Name = "TapBoard local study" }.Start();
            }
            catch { listener.Stop(); throw; }
        }

        private void Accept()
        {
            while (!stopped)
            {
                TcpClient client;
                try { client = listener.AcceptTcpClient(); }
                catch (SocketException) { if (stopped) return; continue; }
                catch (ObjectDisposedException) { return; }
                if (Interlocked.Increment(ref clients) > 12)
                { Interlocked.Decrement(ref clients); client.Close(); continue; }
                ThreadPool.QueueUserWorkItem(_ =>
                {
                    try
                    {
                        using (client)
                        {
                            client.ReceiveTimeout = 2000;
                            client.SendTimeout = 2500;
                            using (var stream = client.GetStream()) Serve(stream, stream, page, feed);
                        }
                    }
                    catch (IOException) { }
                    catch (SocketException) { }
                    finally { Interlocked.Decrement(ref clients); }
                });
            }
        }

        internal static void Serve(Stream input, Stream output, byte[] page, StudyFeed feed)
        {
            var bytes = new byte[8192];
            int count = 0;
            while (count < bytes.Length)
            {
                int n = input.Read(bytes, count, bytes.Length - count);
                if (n == 0) return;
                int start = Math.Max(0, count - 3);
                count += n;
                for (int i = start; i <= count - 4; i++)
                    if (bytes[i] == 13 && bytes[i+1] == 10 && bytes[i+2] == 13 && bytes[i+3] == 10)
                    { Respond(output, Encoding.ASCII.GetString(bytes, 0, i), page, feed); return; }
            }
        }

        private static void Respond(Stream stream, string request, byte[] page, StudyFeed feed)
        {
            string[] lines = request.Split(new[] { "\r\n" }, StringSplitOptions.None);
            string[] first = lines[0].Split(' ');
            var headers = new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
            for (int i = 1; i < lines.Length; i++)
            {
                int at = lines[i].IndexOf(':');
                if (at < 1) return;
                string name = lines[i].Substring(0, at);
                if (headers.ContainsKey(name)) return;
                headers.Add(name, lines[i].Substring(at + 1).Trim());
            }
            string host, origin, token;
            string status = "403 Forbidden", mime = "text/plain";
            byte[] body = new byte[0];
            if (first.Length == 3 && first[0] == "GET" && headers.TryGetValue("Host", out host) && host == Host &&
                (!headers.TryGetValue("Origin", out origin) || origin == "http://" + Host))
            {
                string path = first[1];
                status = "404 Not Found";
                if (path == "/")
                { status = "200 OK"; mime = "text/html; charset=utf-8"; body = page; }
                else if ((path == "/touch" || path.StartsWith("/touch?", StringComparison.Ordinal)) &&
                    headers.TryGetValue("X-TapBoard-Study", out token) && token == "1")
                {
                    string[] parts = path.Split('?');
                    string[] query = parts.Length == 2 ? parts[1].Split('&') : new string[0];
                    long after = -1;
                    string session = null;
                    if (query.Length == 2 && query[0].StartsWith("session=", StringComparison.Ordinal) &&
                        query[1].StartsWith("after=", StringComparison.Ordinal) &&
                        long.TryParse(query[1].Substring(6), NumberStyles.None, CultureInfo.InvariantCulture, out after))
                        session = query[0].Substring(8);
                    status = "200 OK"; mime = "application/json; charset=utf-8";
                    body = Encoding.UTF8.GetBytes(feed.Read(session, after));
                }
            }
            byte[] head = Encoding.ASCII.GetBytes("HTTP/1.1 " + status + "\r\nConnection: close\r\nCache-Control: no-store\r\n" +
                "X-Content-Type-Options: nosniff\r\nX-Frame-Options: DENY\r\nContent-Security-Policy: frame-ancestors 'none'\r\n" +
                "Content-Type: " + mime + "\r\nContent-Length: " + body.Length.ToString(CultureInfo.InvariantCulture) + "\r\n\r\n");
            stream.Write(head, 0, head.Length);
            stream.Write(body, 0, body.Length);
        }

        public void Dispose() { stopped = true; listener.Stop(); }
    }
}
