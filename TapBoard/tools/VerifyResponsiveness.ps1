param([string]$BuildDirectory = "$PSScriptRoot\..\TapBoard\bin\LowLatencyAudio", [switch]$NativeAudio)
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Core -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Reflection;
using System.Threading;
using System.Linq.Expressions;
public static class FeedbackCheck
{
    static AutoResetEvent entered = new AutoResetEvent(false);
    static ManualResetEvent release = new ManualResetEvent(false);
    public static void Block(object feedback) { entered.Set(); release.WaitOne(5000); }
    public static string Run(string path, bool native)
    {
        var assembly = Assembly.LoadFrom(path);
        Type type = assembly.GetType("TapBoard.ClickFeedback", true);
        var flags = BindingFlags.Instance | BindingFlags.NonPublic;
        var request = type.GetMethod("Request");
        if (native) {
            var live = (IDisposable)Activator.CreateInstance(type, true);
            try {
                var status = type.GetField("Status", flags);
                for (int i=0; i<150 && (string)status.GetValue(live)=="Starting"; i++) Thread.Sleep(20);
                string value=(string)status.GetValue(live);
                if (!value.StartsWith("WASAPI")) throw new Exception("Native audio: " + value + "; " + type.GetField("Failure",flags).GetValue(live));
                return "PASS: silent native stream initialized; " + value + " (not measured acoustic latency).";
            } finally { live.Dispose(); Thread.Sleep(100); }
        }
        var parameter=Expression.Parameter(type,"feedback");
        Type callbackType=typeof(Action<>).MakeGenericType(type);
        var callback=Expression.Lambda(callbackType, Expression.Call(typeof(FeedbackCheck).GetMethod("Block"),Expression.Convert(parameter,typeof(object))),parameter).Compile();
        var constructor=type.GetConstructor(flags,null,new[]{callbackType},null);
        var worker=(IDisposable)constructor.Invoke(new object[]{callback});
        try {
            if (!entered.WaitOne(2000)) throw new Exception("Worker did not start");
            var watch=Stopwatch.StartNew();
            for(int i=0;i<2000;i++) request.Invoke(worker,null);
            watch.Stop();
            if(watch.ElapsedMilliseconds>1000) throw new Exception("Requests blocked");
            int count=(int)type.GetMethod("DrainRequests",flags).Invoke(worker,null);
            if(count!=2000) throw new Exception("Requests lost or coalesced: "+count);
            var touchRequest = type.GetMethod("RequestTouch");
            for (int i=0; i<2000; i++) touchRequest.Invoke(worker,null);
            if ((int)type.GetMethod("DrainTouchRequests",flags).Invoke(worker,null)!=2000)
                throw new Exception("Touch requests lost or combined with input requests");
            worker.Dispose(); request.Invoke(worker,null);
            if((int)type.GetMethod("DrainRequests",flags).Invoke(worker,null)!=0) throw new Exception("Request after disposal accepted");
            var mixerType=assembly.GetType("TapBoard.ClickMixer",true);
            var ctor=mixerType.GetConstructor(flags,null,new[]{typeof(int)},null);
            object one=ctor.Invoke(new object[]{48000}), two=ctor.Invoke(new object[]{48000});
            var render=mixerType.GetMethod("Render",flags);
            var a=new float[4800*2]; var b=new float[a.Length];
            render.Invoke(one,new object[]{a,4800,2,1}); render.Invoke(two,new object[]{b,4800,2,2});
            if(a[2]==0) throw new Exception("Click onset delayed inside mixer");
            for(int i=0;i<a.Length;i++) if(Math.Abs(b[i]-2*a[i])>0.000001) throw new Exception("Overlapping click lost");
            var down=new float[a.Length]; var combined=new float[a.Length];
            object touchMixer=ctor.Invoke(new object[]{48000}), combinedMixer=ctor.Invoke(new object[]{48000});
            var feedback=mixerType.GetMethod("RenderFeedback",flags);
            feedback.Invoke(touchMixer,new object[]{down,4800,2,0,1});
            feedback.Invoke(combinedMixer,new object[]{combined,4800,2,1,1});
            double inputEnergy=0,touchEnergy=0; bool different=false;
            for(int i=0;i<a.Length;i++) {
                inputEnergy+=a[i]*a[i]; touchEnergy+=down[i]*down[i];
                if(Math.Abs(a[i]-down[i])>0.00001) different=true;
                if(Math.Abs(combined[i]-a[i]-down[i])>0.000001) throw new Exception("Two feedback sounds did not mix");
                if(i>=3360*2 && down[i]!=0) throw new Exception("Touch sound longer than 70ms");
                if(i>=2880*2 && a[i]!=0) throw new Exception("Input sound longer than 60ms");
            }
            if(!different || touchEnergy<=0 || touchEnergy>=inputEnergy) throw new Exception("Touch/input sounds not distinct or touch too loud");
            render.Invoke(one,new object[]{a,4800,2,0});
            foreach(float sample in a) if(sample!=0) throw new Exception("Click tail not cleared");
            return "PASS: 2,000 requests in "+watch.ElapsedMilliseconds+" ms while worker blocked; no coalescing; distinct 70ms touch/60ms input sounds, mixing, silence and nonblocking shutdown verified (no real sound played).";
        } finally { worker.Dispose(); release.Set(); }
    }
}
"@
[FeedbackCheck]::Run((Join-Path (Resolve-Path $BuildDirectory).Path 'TapBoard.exe'), $NativeAudio.IsPresent)
