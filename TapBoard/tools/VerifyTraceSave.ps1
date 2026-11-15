param([string]$BuildDirectory = "$PSScriptRoot\..\TapBoard\bin\Debug")
$ErrorActionPreference = 'Stop'
$build = (Resolve-Path $BuildDirectory).Path
$source = @"
using System;
using System.IO;
using System.Reflection;
using System.Threading;
public static class TraceSaveCheck {
    public static void Run(string build) {
        var assembly = Assembly.LoadFrom(Path.Combine(build, "TapBoard.exe"));
        var type = assembly.GetType("TapBoard.TouchDiagnostics");
        var flags = BindingFlags.NonPublic | BindingFlags.Instance;
        string path = Path.Combine(Path.GetTempPath(), "TapBoard-trace-" + Guid.NewGuid() + ".csv");
        try {
            var constructor = type.GetConstructor(flags, null, new[] { typeof(bool), typeof(string) }, null);
            object trace = constructor.Invoke(new object[] { true, path });
            var record = type.GetMethod("TraceTouch", flags);
            var save = type.GetMethod("SaveTouchTrace", flags);
            record.Invoke(trace, new object[] { "TEST", 1, 10, 20, "periodic-check" });
            save.Invoke(trace, new object[] { false });
            bool found = false;
            for (int i = 0; i < 100 && !found; i++) {
                Thread.Sleep(20);
                try { found = File.Exists(path) && File.ReadAllText(path).Contains("periodic-check"); }
                catch (IOException) { }
            }
            if (!found) throw new Exception("Periodic save failed");
            record.Invoke(trace, new object[] { "TEST", 2, 30, 40, "final-check" });
            save.Invoke(trace, new object[] { true });
            if (!File.ReadAllText(path).Contains("final-check")) throw new Exception("Final save failed");
            File.Delete(path);
            trace = constructor.Invoke(new object[] { false, path });
            record.Invoke(trace, new object[] { "TEST", 3, 0, 0, "disabled" });
            save.Invoke(trace, new object[] { true });
            if (File.Exists(path)) throw new Exception("Disabled diagnostics wrote a file");
            Console.WriteLine("PASS: periodic/final diagnostic snapshots and disabled logging.");
        } finally { if (File.Exists(path)) File.Delete(path); }
    }
}
"@
Add-Type -TypeDefinition $source
[TraceSaveCheck]::Run($build)
