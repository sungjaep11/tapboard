using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Xml.Linq;
using static TapBoard.NativeWindow;

namespace TapBoard
{
    internal static class ConvBoardConfiguration
    {
        private static readonly Dictionary<string,string> values=Read();
        private static Dictionary<string,string> Read()
        {
            var result=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
            string path=Assembly.GetExecutingAssembly().Location+".config";
            if(File.Exists(path))
                foreach(var e in XDocument.Load(path).Root.Element("appSettings")?.Elements("add") ?? new XElement[0])
                    result[(string)e.Attribute("key")]=(string)e.Attribute("value");
            return result;
        }
        internal static string Get(string name)
        {
            string value;
            return values.TryGetValue(name,out value)?value:"";
        }
    }

    internal sealed class ConvBoard : IDisposable
    {
#if TAPBOARD_STUDY
        private const string KeyboardName="TapBoard+";
        private static readonly bool Conventional=false;
#else
        private const string KeyboardName="ConvBoard";
        private static readonly bool Conventional=true;
#endif
        private readonly KeyboardInputController input=new KeyboardInputController(Conventional);
        private readonly WindowsKeyboardOutput output=new WindowsKeyboardOutput();
        private readonly WindowProc callback;
        private readonly KeyboardSettings settings=KeyboardSettings.Current;
        private ClickFeedback sound;
        private TouchMouseFilter mouse;
        private Rectangle screen;
        private IntPtr hwnd,font;
        private int pitch,imePending;
        private volatile bool korean;
        private bool displayedKorean,caps,physicalShift;
        private bool audioWarning,filterWarning,logWarning;
        private Exception callbackError;
        private static readonly IntPtr zero=IntPtr.Zero;

        [STAThread]
        private static int Main()
        {
            try
            {
                try { SetProcessDpiAwareness(2); }
                catch(DllNotFoundException) {SetProcessDPIAware();}
                catch(EntryPointNotFoundException) {SetProcessDPIAware();}
                if((GetSystemMetrics(94)&0xc0)!=0xc0) throw new InvalidOperationException("멀티터치 디스플레이를 연결하세요.");
                using(var app=new ConvBoard()) app.Run();
                return 0;
            }
            catch(Exception ex) {MessageBox(zero,ex.GetBaseException().Message,KeyboardName,0x10);return 1;}
        }
        private ConvBoard()
        {
            callback=Handle;
            output.Diagnostics=input.Diagnostics;
            input.ModifiersChanged+=output.SetModifiers;
            input.KeyInput+=(sender,e)=>{
                if(e.key=="{APP_EXIT}") PostMessage(hwnd,0x10,zero,zero);
                else if(output.Send(e) && settings.InputSoundEnabled) sound?.Request();
            };
        }
        private void Run()
        {
            var display=SelectDisplay(settings.KeyboardDisplay);
            var r=display.bounds;
            screen=Rectangle.FromLTRB(r.left,r.top,r.right,r.bottom);
            double mm=settings.DisplayWidthMm>0?settings.DisplayWidthMm:WidthMm(display.device);
            if(mm<=0) throw new InvalidOperationException("키보드 앱 설정 파일의 DisplayWidthMm에 아래 화면의 실제 가로 길이(mm)를 입력하세요.");
            pitch=Math.Max(1,(int)Math.Round(screen.Width*settings.KeyPitchMm/mm));
            if(pitch*KeyboardLayout.LayoutWidthUnits>screen.Width || pitch*KeyboardLayout.LayoutHeightUnits>screen.Height)
                throw new InvalidOperationException("키보드가 화면보다 큽니다. KeyboardDisplay와 DisplayWidthMm을 확인하세요.");
            input.CreateKeys(pitch,screen.Width);
            var instance=GetModuleHandle(null);
            var arrow=LoadCursor(zero,new IntPtr(IDC_ARROW));
            Require(arrow!=zero,"기본 마우스 커서를 불러올 수 없습니다.");
            var wc=new WindowClass { size=(uint)Marshal.SizeOf(typeof(WindowClass)),className=KeyboardName+"Keyboard",callback=callback,instance=instance,cursor=arrow };
            Require(RegisterClassEx(ref wc)!=0,"키보드 창 등록 실패");
            // WS_EX_TOPMOST | WS_EX_NOACTIVATE, WS_POPUP. Input stays with the upper screen.
            hwnd=CreateWindowEx(0x08000008,wc.className,KeyboardName,0x80000000,
                screen.X,screen.Y,screen.Width,screen.Height,zero,zero,instance,zero);
            Require(hwnd!=zero,"키보드 창 생성 실패");
            Require(WindowsTouchInput.RegisterTouchWindow(hwnd,WindowsTouchInput.WantPalm),"멀티터치 등록 실패");
            TouchGestureSettings.Apply(hwnd);
            font=CreateFont(-Math.Max(10,(int)(pitch*.22)),0,0,0,400,0,0,0,1,0,0,5,0,"Malgun Gothic");
            input.Diagnostics.StartExperiment(KeyboardName,screen.Width,pitch,mm,KeyboardLayout.RecordingBounds(pitch,screen.Width));
            if(settings.FilterTouchMouse) mouse=new TouchMouseFilter(screen);
            if(settings.TouchSoundEnabled||settings.InputSoundEnabled) sound=new ClickFeedback();
            Require(SetTimer(hwnd,new UIntPtr(1),10,zero)!=UIntPtr.Zero,"키 반복 타이머 생성 실패");
            Require(SetTimer(hwnd,new UIntPtr(2),100,zero)!=UIntPtr.Zero,"터치 기록 타이머 생성 실패");
            ShowWindow(hwnd,4);
            Message msg;
            int result;
            while((result=GetMessage(out msg,zero,0,0))>0) DispatchMessage(ref msg);
            if(callbackError!=null) throw callbackError;
            Require(result==0,"Windows 메시지 읽기 실패");
        }
        private IntPtr Handle(IntPtr window,uint message,IntPtr w,IntPtr l)
        {
            try
            {
                IntPtr result;
                if(TouchGestureSettings.HandleMessage(window,(int)message,out result)) return result;
                switch(message)
                {
                    case 0x21: return new IntPtr(3); // MA_NOACTIVATE
                    case 0x0f: Paint(window);return zero;
                    case WindowsTouchInput.Message: Touch(w,l);return zero;
                    case 0x113: if(w.ToInt64()==1) input.Repeat();else Refresh();return zero;
                    case 0x7e: throw new InvalidOperationException("디스플레이 구성이 변경되었습니다. 키보드 앱을 다시 실행하세요.");
                    case 0x10: DestroyWindow(window);return zero;
                    case 0x02:
                        WindowsTouchInput.UnregisterTouchWindow(window);
                        TouchGestureSettings.Remove(window);
                        hwnd=zero;PostQuitMessage(0);return zero;
                }
                return DefWindowProc(window,message,w,l);
            }
            catch(Exception error)
            {
                callbackError=error;
                input.Diagnostics.Experiment?.Record("NATIVE_ERROR",detail:error.Message);
                PostQuitMessage(1);return zero;
            }
        }
        private void Touch(IntPtr w,IntPtr packet)
        {
            try
            {
                uint count=(uint)(w.ToInt64()&0xffff);
                var samples=new WindowsTouchInput.NativeTouch[count];
                Require(WindowsTouchInput.GetTouchInputInfo(packet,count,samples,Marshal.SizeOf(typeof(WindowsTouchInput.NativeTouch))),"터치 패킷 읽기 실패");
                if(!Conventional)
                    foreach(var s in samples)
                        if((s.flags&WindowsTouchInput.Down)!=0)
                            input.TrackKeyDown((int)s.id,(int)Math.Round(s.x/100.0)-screen.X,(int)Math.Round(s.y/100.0)-screen.Y);
                foreach(var s in samples)
                {
                    int id=(int)s.id;
                    var pt=new Point((int)Math.Round(s.x/100.0)-screen.X,(int)Math.Round(s.y/100.0)-screen.Y);
                    bool down=(s.flags&WindowsTouchInput.Down)!=0,up=(s.flags&WindowsTouchInput.Up)!=0;
                    if(!down && !up && (s.flags&WindowsTouchInput.Move)==0) continue;
                    if(Conventional && down) input.TrackKeyDown(id,pt.X,pt.Y);
                    var key=input.GetContactKey(id);
                    input.Diagnostics.Experiment?.Record(down?"down":up?"up":"move",id,pt.X,pt.Y,
                        key==null?"BLANK":key.Definition.type.ToString(),s.time+";flags="+s.flags);
                    if(down)
                    {
                        if(input.TouchDown(id,pt) && settings.TouchSoundEnabled) sound?.RequestTouch();
                    }
                    else input.DistributeEvent(up?KeyAreaEvent.RELEASE:KeyAreaEvent.MOVE,id,pt.X,pt.Y);
                    if((s.flags&WindowsTouchInput.Primary)!=0 && (down||up)) mouse?.SetPrimaryTouch(down);
                    if(down||up) InvalidateRect(hwnd,zero,false);
                }
            }
            finally {WindowsTouchInput.CloseTouchInputHandle(packet);}
        }
        private void Refresh()
        {
            input.Diagnostics.SaveTouchTrace();
            WarnOnce(ref logWarning,input.Diagnostics.Experiment?.Failure,"실험 로그를 기록할 수 없습니다.");
            if(mouse!=null && mouse.InstallError!=0)
                WarnOnce(ref filterWarning,mouse.InstallError.ToString(),"터치 마우스 필터를 시작할 수 없습니다.");
            WarnOnce(ref audioWarning,sound?.Failure,"입력 소리를 재생할 수 없습니다.");
            bool newCaps=(GetKeyState(0x14)&1)!=0, newShift=GetKeyState(0x10)<0;
            if((!Conventional && input.keys.Exists(key=>key.IsActive())) || newCaps!=caps || newShift!=physicalShift || displayedKorean!=korean)
            {
                caps=newCaps;physicalShift=newShift;displayedKorean=korean;InvalidateRect(hwnd,zero,false);
            }
            if(Interlocked.CompareExchange(ref imePending,1,0)==0)
                ThreadPool.QueueUserWorkItem(_=>{
                    try { bool mode;if(ImeStateReader.TryGetKoreanMode(out mode)) korean=mode; }
                    finally {Interlocked.Exchange(ref imePending,0);}
                });
        }
        private void WarnOnce(ref bool reported,string detail,string message)
        {
            if(reported || detail==null) return;
            reported=true;
            MessageBox(hwnd,message+"\n"+detail,KeyboardName,0x30);
        }
        private static uint Rgb(Color c) {return (uint)(c.R | c.G<<8 | c.B<<16);}
        private void Paint(IntPtr window)
        {
            PaintInfo paint;
            var dc=BeginPaint(window,out paint);
            try
            {
                FillRect(dc,ref paint.rect,GetStockObject(4));
                var old=SelectObject(dc,font);
                SetBkMode(dc,1);
                SetTextColor(dc,Rgb(input.IsControlKeyOn()?KeyboardTheme.ShortcutLabel:KeyboardTheme.Label));
                foreach(var key in input.keys)
                {
                    var b=key.VisualBounds;b.Inflate(-pitch/15,-pitch/15);
                    var rect=new Rect{left=b.Left,top=b.Top,right=b.Right,bottom=b.Bottom};
                    Color color=key.IsActive()?KeyboardTheme.Active:key.GetName()=="{CAPSLOCK}"&&caps?KeyboardTheme.CapsLock:key.Definition.color;
                    if(!Conventional && input.IsLocked)
                    {
                        var palette=key.GetName()=="{CAPSLOCK}"&&caps?KeyboardTheme.CapsLock:key.Definition.color;
                        double level=settings.LockedBrightness;
                        color=Color.FromArgb((int)(palette.R*level),(int)(palette.G*level),(int)(palette.B*level));
                    }
                    else if(!Conventional && key.IsActive() && key.IsExpired()) color=KeyboardTheme.Resting;
                    SetDCBrushColor(dc,Rgb(color));
                    FillRect(dc,ref rect,GetStockObject(18));FrameRect(dc,ref rect,GetStockObject(0));
                    DrawText(dc,key.GetLabel(input.IsShiftKeyOn()||physicalShift,displayedKorean,caps),-1,ref rect,0x825);
                }
                if(old!=zero) SelectObject(dc,old);
            }
            finally {EndPaint(window,ref paint);}
        }
        public void Dispose()
        {
            if(hwnd!=zero) DestroyWindow(hwnd);
            input.CancelContacts();output.Dispose();mouse?.Dispose();sound?.Dispose();
            input.Diagnostics.SaveTouchTrace(true);
            if(font!=zero) DeleteObject(font);
        }
    }
}
