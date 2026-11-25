// Lower-screen conventional keyboard. Coordinates and edits come from the same pointer event.
class ConvBoardWindow {
  constructor() { this.win=null; this.contacts=new Map(); this.caps=false; }
  open(settings,onKey,onFault) {
    if(this.win && !this.win.closed) this.win.close();
    const w=window.open('','_blank','popup,width=960,height=520');
    if(!w) throw new Error('ConvBoard 창을 열 수 없습니다. 브라우저의 팝업을 허용하세요.');
    this.win=w; this.contacts.clear(); this.caps=false; this.typing=false;
    this.settings=settings;
    const d=w.document;
    d.title='ConvBoard · 아래쪽 키보드';
    d.body.style.cssText='margin:0;background:#171a1f;color:white;font:16px system-ui;touch-action:none;user-select:none;overflow:hidden';
    const surface=d.createElement('div'), setup=d.createElement('button');
    surface.style.cssText='position:absolute;inset:0;touch-action:none;';
    setup.textContent='아래쪽 화면으로 창을 옮긴 후 전체 화면으로 열기';
    setup.style.cssText='position:fixed;bottom:8px;right:10px;padding:10px;z-index:1';
    setup.onclick=()=>d.documentElement.requestFullscreen().catch(()=>{setup.textContent='전체 화면 전환을 다시 눌러 주세요';});
    d.body.replaceChildren(surface,setup);
    const journal=new TapTouch.Journal(), recordedContacts=new Set(), startUnix=Date.now(), startPerf=performance.now();
    this.journal=journal;
    journal.feed(JSON.stringify({type:'session',schema:'tapboard-touch/v1',seq:0,t:0,
      sessionId:'conv-'+crypto.randomUUID(),startedUnixMs:startUnix,recordingPolicy:'contact-down-in-keyboard'})+'\n');
    const add=(type,data={},sampleMs=performance.now()-startPerf)=>{
      const row={type,seq:journal.lastSeq+1,t:Math.max(journal.lastT,sampleMs),...data};
      journal.feed(JSON.stringify(row)+'\n');
      return row;
    };
    const heartbeat=()=>add('heartbeat',{wallUnixMs:Date.now()});
    heartbeat();
    const timer=w.setInterval(()=>{
      if(w.closed) {w.clearInterval(timer);add('end');return;}
      heartbeat();
    },100);
    const draw=()=>{
      const g=TapParagraph.geometry(w.innerWidth,settings.widthMm,settings.pitchMm,false);
      if(this.locked && (!this.fullscreen() || g.widthPx!==this.geometry.widthPx)) onFault('ConvBoard 화면 크기 또는 전체 화면 상태가 바뀌었습니다.');
      this.geometry=g;
      journal.meta.recordingBounds={...g.recordingBounds};
      surface.replaceChildren();
      for(const k of g.keys) {
        const el=d.createElement('div');
        el.textContent=k.label;
        Object.assign(el.style,{position:'absolute',left:k.x+'px',top:k.y+'px',width:k.w+'px',height:k.h+'px',
          boxSizing:'border-box',border:Math.max(1,g.pitchPx/15)+'px solid #171a1f',background:'#353941',
          display:'grid',placeItems:'center',fontSize:Math.max(10,g.pitchPx*.22)+'px',pointerEvents:'none'});
        surface.append(el);
      }
      setup.hidden=this.fullscreen();
    };
    draw(); w.addEventListener('resize',draw); d.addEventListener('fullscreenchange',draw);
    const handle=(e,type)=>{
      if(e.pointerType!=='touch') return;
      e.preventDefault();
      const id=e.pointerId;
      if(type==='down') surface.setPointerCapture(id);
      else if(!this.contacts.has(id)) return;
      const samples=type==='move' ? (e.getCoalescedEvents?.() || []) : [];
      for(const sample of [...samples,e]) {
        const p={id,x:sample.clientX,y:sample.clientY};
        const k=TapParagraph.hit(this.geometry,p)?.label || '';
        if(type==='down') {
          this.contacts.set(id,k);
          if(TapParagraph.withinKeyboard(this.geometry,p)) recordedContacts.add(id);
          else recordedContacts.delete(id);
        }
        const owner=this.contacts.get(id);
        const keyType=!owner?'BLANK':['Shift','Ctrl','Alt','Win'].includes(owner)?'MODIFIER':
          ['Backspace','↑','↓','←','→'].includes(owner)?'NORMAL':'TAPPER';
        const sampleMs=w.performance.timeOrigin+sample.timeStamp-performance.timeOrigin-startPerf;
        if(recordedContacts.has(id)) add(type,{...p,keyType,key:owner},sampleMs);
        if(type==='down') {
          if(k==='Caps Lock' && this.typing) this.caps=!this.caps;
          if(this.typing && k) onKey(k,[...this.contacts.values()].includes('Shift'),this.caps,'keydown',id);
        } else if(type==='up') {
          if(this.typing && owner) onKey(owner,[...this.contacts.values()].includes('Shift'),this.caps,'keyup',id);
          this.contacts.delete(id);
          recordedContacts.delete(id);
        }
      }
    };
    for(const [name,type] of [['pointerdown','down'],['pointermove','move'],['pointerup','up']])
      surface.addEventListener(name,e=>handle(e,type));
    const cancel=e=>{
      if(!this.contacts.has(e.pointerId)) return;
      if(!recordedContacts.has(e.pointerId)) {this.contacts.delete(e.pointerId);return;}
      add('reset');this.contacts.clear();recordedContacts.clear();onFault('ConvBoard 터치 추적이 중단되었습니다.');
    };
    surface.addEventListener('pointercancel',cancel);
    surface.addEventListener('lostpointercapture',cancel);
    w.addEventListener('pagehide',()=>{w.clearInterval(timer);add('end');if(this.locked) onFault('ConvBoard 창이 닫혔습니다.');});
  }
  fullscreen() {
    const w=this.win;
    return !!w && !w.closed && (!!w.document.fullscreenElement ||
      (w.innerWidth===w.screen.width && w.innerHeight===w.screen.height));
  }
  ready(settings) {
    return this.fullscreen() &&
      this.settings.widthMm===settings.widthMm && this.settings.pitchMm===settings.pitchMm &&
      this.geometry.pitchPx*5.5<=this.win.innerHeight;
  }
}
