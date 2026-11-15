using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

namespace TapBoard
{
    // Keep an event-driven WASAPI stream open, including during silence.
    internal sealed class ClickFeedback : IDisposable
    {
        private const uint EventCallback = 0x40000;
        private readonly object gate = new object();
        private readonly ManualResetEvent stop = new ManualResetEvent(false);
        private volatile bool stopping;
        private int pending;
        private int pendingTouches;
        internal volatile string Status = "Starting";
        internal volatile string Failure;
        internal bool IsStopping { get { return stopping; } }
        internal int DrainRequests() { return Interlocked.Exchange(ref pending, 0); }
        internal int DrainTouchRequests() { return Interlocked.Exchange(ref pendingTouches, 0); }

        public ClickFeedback() : this(null) { }
        internal ClickFeedback(Action<ClickFeedback> testWorker)
        {
            var thread = new Thread(() =>
            {
                try { if (testWorker != null) testWorker(this); else Run(); }
                catch (Exception ex) { Failure = ex.Message; Status = "Failed"; Debug.WriteLine(ex); }
                finally { lock (gate) { stopping = true; stop.Dispose(); } }
            }) { IsBackground = true, Name = "TapBoard WASAPI feedback", Priority = ThreadPriority.Highest };
            thread.SetApartmentState(ApartmentState.MTA);
            thread.Start();
        }
        public void Request()
        {
            if (!stopping) Interlocked.Increment(ref pending);
        }
        public void RequestTouch()
        {
            if (!stopping) Interlocked.Increment(ref pendingTouches);
        }
        public void Dispose()
        {
            lock (gate)
            {
                if (stopping) return;
                stopping = true;
                stop.Set();
            }
        }
        private static void Check(int result) { Marshal.ThrowExceptionForHR(result); }
        private static void Release(object value) { if (value != null && Marshal.IsComObject(value)) Marshal.ReleaseComObject(value); }

        private void Run()
        {
            object enumeratorObject = null, clientObject = null, renderObject = null;
            IMMDevice device = null;
            IAudioClient3 client = null;
            IntPtr format = IntPtr.Zero;
            bool started = false;
            using (var ready = new AutoResetEvent(false))
            {
                try
                {
                    enumeratorObject = Activator.CreateInstance(Type.GetTypeFromCLSID(
                        new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")));
                    Check(((IMMDeviceEnumerator)enumeratorObject).GetDefaultAudioEndpoint(0, 0, out device));
                    Guid clientId = typeof(IAudioClient3).GUID;
                    Check(device.Activate(ref clientId, 23, IntPtr.Zero, out clientObject));
                    client = (IAudioClient3)clientObject;
                    Check(client.GetMixFormat(out format));
                    int channels = (ushort)Marshal.ReadInt16(format, 2);
                    int rate = Marshal.ReadInt32(format, 4);
                    int bits = (ushort)Marshal.ReadInt16(format, 14);
                    int tag = (ushort)Marshal.ReadInt16(format, 0);
                    if (tag == 0xfffe) tag = Marshal.ReadInt32(format, 24);
                    bool floating = tag == 3 && bits == 32;
                    if (!floating && !(tag == 1 && bits == 16))
                        throw new NotSupportedException("Unsupported audio mix format: " + tag + "/" + bits);
                    uint defaultFrames, fundamental, minimum, maximum;
                    Check(client.GetSharedModeEnginePeriod(format, out defaultFrames, out fundamental, out minimum, out maximum));
                    uint period = minimum;
                    int result = client.InitializeSharedAudioStream(EventCallback, period, format, IntPtr.Zero);
                    if (result < 0)
                    {
                        // Another shared stream may have locked the engine period.
                        IntPtr currentFormat;
                        Check(client.GetCurrentSharedModeEnginePeriod(out currentFormat, out period));
                        Marshal.FreeCoTaskMem(currentFormat);
                        Check(client.InitializeSharedAudioStream(EventCallback, period, format, IntPtr.Zero));
                    }
                    Check(client.SetEventHandle(ready.SafeWaitHandle.DangerousGetHandle()));
                    uint capacity;
                    Check(client.GetBufferSize(out capacity));
                    Guid renderId = typeof(IAudioRenderClient).GUID;
                    Check(client.GetService(ref renderId, out renderObject));
                    var render = (IAudioRenderClient)renderObject;
                    var mixer = new ClickMixer(rate);
                    float[] samples = new float[checked((int)capacity * channels)];
                    short[] pcm = floating ? null : new short[samples.Length];
                    IntPtr destination;
                    uint target = Math.Min(period, capacity);
                    Check(render.GetBuffer(target, out destination));
                    Check(render.ReleaseBuffer(target, 2)); // initial silence
                    Check(client.Start());
                    started = true;
                    Status = "WASAPI period=" + (period * 1000.0 / rate).ToString("F2") +
                        "ms; queued<=" + (target * 1000.0 / rate).ToString("F2") +
                        "ms; capacity=" + (capacity * 1000.0 / rate).ToString("F2") + "ms";
                    Debug.WriteLine(Status);
                    WaitHandle[] waits = { stop, ready };
                    while (!stopping && WaitHandle.WaitAny(waits, 1000) != 0)
                    {
                        uint padding;
                        Check(client.GetCurrentPadding(out padding));
                        // Keep only one engine period queued, not the full endpoint
                        // capacity: queued silence would delay the next click.
                        uint frames = padding < target ? target - padding : 0;
                        if (frames == 0) continue;
                        // Requests are counted, never coalesced. Overlapping clicks mix.
                        mixer.RenderFeedback(samples, (int)frames, channels, DrainRequests(), DrainTouchRequests());
                        Check(render.GetBuffer(frames, out destination));
                        int count = (int)frames * channels;
                        if (floating) Marshal.Copy(samples, 0, destination, count);
                        else
                        {
                            for (int i = 0; i < count; i++) pcm[i] = (short)(samples[i] * 32767);
                            Marshal.Copy(pcm, 0, destination, count);
                        }
                        Check(render.ReleaseBuffer(frames, 0));
                    }
                }
                finally
                {
                    if (started) client.Stop();
                    Release(renderObject);
                    Release(clientObject);
                    Release(device);
                    Release(enumeratorObject);
                    if (format != IntPtr.Zero) Marshal.FreeCoTaskMem(format);
                }
            }
        }

        [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IMMDeviceEnumerator
        {
            [PreserveSig] int EnumAudioEndpoints(int flow, uint mask, out IntPtr collection);
            [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device);
        }
        [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IMMDevice
        {
            [PreserveSig] int Activate(ref Guid iid, uint context, IntPtr parameters,
                [MarshalAs(UnmanagedType.IUnknown)] out object instance);
        }
        [ComImport, Guid("7ED4EE07-8E67-4CD4-8C1A-2B7A5987AD42"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IAudioClient3
        {
            // IAudioClient and IAudioClient2 slots must precede IAudioClient3 slots.
            [PreserveSig] int Initialize(int mode, uint flags, long duration, long periodicity, IntPtr format, IntPtr session);
            [PreserveSig] int GetBufferSize(out uint frames);
            [PreserveSig] int GetStreamLatency(out long latency);
            [PreserveSig] int GetCurrentPadding(out uint frames);
            [PreserveSig] int IsFormatSupported(int mode, IntPtr format, out IntPtr closest);
            [PreserveSig] int GetMixFormat(out IntPtr format);
            [PreserveSig] int GetDevicePeriod(out long normal, out long minimum);
            [PreserveSig] int Start();
            [PreserveSig] int Stop();
            [PreserveSig] int Reset();
            [PreserveSig] int SetEventHandle(IntPtr handle);
            [PreserveSig] int GetService(ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object service);
            [PreserveSig] int IsOffloadCapable(int category, [MarshalAs(UnmanagedType.Bool)] out bool capable);
            [PreserveSig] int SetClientProperties(IntPtr properties);
            [PreserveSig] int GetBufferSizeLimits(IntPtr format, [MarshalAs(UnmanagedType.Bool)] bool eventDriven, out long minimum, out long maximum);
            [PreserveSig] int GetSharedModeEnginePeriod(IntPtr format, out uint normal, out uint fundamental, out uint minimum, out uint maximum);
            [PreserveSig] int GetCurrentSharedModeEnginePeriod(out IntPtr format, out uint frames);
            [PreserveSig] int InitializeSharedAudioStream(uint flags, uint period, IntPtr format, IntPtr session);
        }
        [ComImport, Guid("F294ACFC-3146-4483-A7BF-ADDCA7C260E2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IAudioRenderClient
        {
            [PreserveSig] int GetBuffer(uint frames, out IntPtr data);
            [PreserveSig] int ReleaseBuffer(uint frames, uint flags);
        }
    }

}
