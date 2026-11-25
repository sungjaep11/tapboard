(function(root){
  'use strict';
  const M=typeof module!=='undefined'?require('./metrics.js'):root.TapMetrics;
  const SCHEMA='tapboard-touch/v1', MAX_GAP=1500;
  class Journal {
    constructor(){this.meta=null;this.rows=[];this.partial='';this.lastSeq=-1;this.lastT=0;this.error=null;this.integrityFault=null;this.lastHeartbeatT=null;}
    feed(text){
      if(this.error)throw new Error(this.error);
      const lines=(this.partial+text).split('\n');this.partial=lines.pop();
      if(this.partial.length>65536)throw new Error('로그 한 줄의 크기가 너무 큽니다.');
      try{for(const line of lines){
        if(!line.trim())continue;
        const e=JSON.parse(line);
        if(!Number.isSafeInteger(e.seq)||!Number.isFinite(e.t)||e.t<0)throw new Error('잘못된 이벤트 형식');
        if(!this.meta){
          if(e.schema!==SCHEMA||e.type!=='session'||e.seq!==0||!Number.isFinite(e.startedUnixMs)||typeof e.sessionId!=='string')throw new Error('새 Tapboard 앱의 touch-*.jsonl 파일을 선택하세요.');
          this.meta=e;
        }else{
          if(e.seq!==this.lastSeq+1||e.t<this.lastT)throw new Error('로그 이벤트 누락·순서 변경이 감지되었습니다.');
          if(!['heartbeat','down','up','move','end','gap','reset','LOCK','UNLOCK','ACCEPT','REJECT_DUPLICATE','NATIVE_ERROR'].includes(e.type))throw new Error('알 수 없는 터치 이벤트');
          if(['down','up','move'].includes(e.type)&&(!Number.isSafeInteger(e.id)||!Number.isFinite(e.x)||!Number.isFinite(e.y)||typeof e.keyType!=='string'))throw new Error('잘못된 접촉 이벤트');
          if(e.type==='heartbeat'&&!Number.isFinite(e.wallUnixMs))throw new Error('잘못된 하트비트');
          if(['gap','reset','NATIVE_ERROR'].includes(e.type))this.integrityFault=e.type;
          if(e.type==='heartbeat'){
            if(this.lastHeartbeatT!==null&&e.t-this.lastHeartbeatT>MAX_GAP)this.integrityFault='heartbeat_gap';
            this.lastHeartbeatT=e.t;
          }
          this.rows.push(e);
        }
        this.lastSeq=e.seq;this.lastT=e.t;
      }}catch(error){this.error=error.message;throw error;}
    }
    get heartbeat(){for(let i=this.rows.length-1;i>=0;i--)if(this.rows[i].type==='heartbeat')return this.rows[i];return null;}
    get ended(){return this.rows.at(-1)?.type==='end';}
    capture(startUnixMs,endMs,thresholdMs){
      if(!this.meta)return null;
      const offset=this.meta.startedUnixMs-startUnixMs;
      // Polling a long recording should convert each sample only once per trial.
      if(this.captureCache?.start!==startUnixMs)
        this.captureCache={start:startUnixMs,index:0,held:new Map(),previousHeartbeat:null,events:[],beats:[]};
      const c=this.captureCache;
      const map=row=>{
        const t=row.t+offset;
        const e={...row,native_t:row.t,t,utc:new Date(this.meta.startedUnixMs+row.t).toISOString()};
        if(row.type==='heartbeat') e.clockDrift=Math.abs(row.wallUnixMs-(this.meta.startedUnixMs+row.t))>50;
        return e;
      };
      while(c.index<this.rows.length) {
        const row=this.rows[c.index++];
        if(row.t+offset<0) {
          if(row.type==='down') c.held.set(row.id,row);
          if(row.type==='up') c.held.delete(row.id);
          if(['reset','end','gap','NATIVE_ERROR'].includes(row.type)) c.held.clear();
          if(row.type==='heartbeat') c.previousHeartbeat=row;
        } else {
          const e=map(row);
          c.events.push(e);
          if(e.type==='heartbeat') c.beats.push(e);
        }
      }
      function through(rows) {
        let lo=0,hi=rows.length;
        while(lo<hi){const mid=Math.floor((lo+hi)/2);if(rows[mid].t<=endMs)lo=mid+1;else hi=mid;}
        return lo;
      }
      const events=c.events.slice(0,through(c.events));
      if(c.previousHeartbeat) events.unshift(map(c.previousHeartbeat));
      const next=c.beats[through(c.beats)];
      if(next) events.push(next);
      return {schema:SCHEMA,sessionId:this.meta.sessionId,startedUnixMs:this.meta.startedUnixMs,
        ...(this.meta.recordingPolicy?{recordingPolicy:this.meta.recordingPolicy,recordingBounds:this.meta.recordingBounds}:{}),
        ...(this.meta.keyboard?{keyboard:this.meta.keyboard,activation:this.meta.activation,
          nativeWidthPx:this.meta.widthPx,nativePitchPx:this.meta.pitchPx,
          ...(this.meta.widthMm>0?{nativeWidthMm:this.meta.widthMm}:{})}:{}),
        timeMapping:'native UTC anchor to browser UTC anchor on the same PC',thresholdMs,
        seed:Array.from(c.held.values(),map),events,error:this.error};
    }
  }
  const intersect=(xs,ys)=>M.union(xs.flatMap(([a,b])=>ys.map(([s,e])=>[Math.max(a,s),Math.min(b,e)]).filter(([s,e])=>e>s)));
  const duration=xs=>xs.reduce((n,[a,b])=>n+b-a,0);
  function summarize(touch,endMs){
    if(!touch)return {physical_rest_ms:null,touch_coverage_ms:0,touch_quality:'not_connected'};
    const held=new Map((touch.seed||[]).map(e=>[e.id,e])),contacts=[],issues=[];
    const heartbeats=[],cutoffs=[];
    if(touch.error)issues.push(touch.error);
    const close=(e,end)=>contacts.push({id:e.id,start:e.t,end,keyType:e.keyType,x:e.x,y:e.y});
    for(const e of touch.events){
      if(e.type==='heartbeat'){
        if(e.clockDrift){issues.push("native_clock_changed");cutoffs.push(Math.max(0,e.t));}
        if(heartbeats.length && e.t-heartbeats.at(-1)>MAX_GAP){issues.push("heartbeat_gap");cutoffs.push(Math.max(0,heartbeats.at(-1)));}
        heartbeats.push(e.t);continue;
      }
      if(e.t>endMs)continue;
      if(e.type==='down'){
        if(held.has(e.id)){close(held.get(e.id),e.t);issues.push('duplicate_down');cutoffs.push(e.t);}
        held.set(e.id,e);
      }
      if(e.type==='up'){
        if(held.has(e.id)){close(held.get(e.id),e.t);held.delete(e.id);}else{issues.push('unmatched_up');cutoffs.push(e.t);}
      }
      if(['reset','end','gap','NATIVE_ERROR'].includes(e.type)){
        held.forEach(c=>close(c,e.t));held.clear();issues.push(e.type);cutoffs.push(e.t);
      }
    }
    held.forEach(c=>close(c,endMs));
    let coverage=heartbeats.slice(1).flatMap((t,i)=>t-heartbeats[i]<=MAX_GAP?[[Math.max(0,heartbeats[i]),Math.min(endMs,t)]]:[]).filter(([a,b])=>b>a);
    if(touch.invalidFromMs!=null){issues.push("browser_clock_changed");cutoffs.push(touch.invalidFromMs);}
    if(cutoffs.length)coverage=intersect(coverage,[[0,Math.min(...cutoffs)]]);
    coverage=M.union(coverage);
    const all=contacts.map(c=>[Math.max(0,c.start),Math.min(endMs,c.end)]).filter(([a,b])=>b>a);
    const rest=contacts.filter(c=>c.keyType==='TAPPER'||c.keyType==='BLANK').map(c=>[Math.max(0,c.start+touch.thresholdMs),Math.min(endMs,c.end)]).filter(([a,b])=>b>a);
    const measured=intersect(rest,coverage), total=duration(coverage);
    return {physical_rest_ms:total>0?duration(measured):null,physical_rest_finger_ms:rest.reduce((n,r)=>n+duration(intersect([r],coverage)),0),
      physical_contact_ms:duration(intersect(all,coverage)),physical_rest_count:measured.length,
      touch_contact_count:contacts.filter(c=>c.end>0&&c.start<endMs).length,touch_coverage_ms:total,
      touch_coverage_pct:endMs>0?total/endMs*100:0,touch_quality:issues.length||total<endMs-1?'partial':'complete',
      touch_threshold_ms:touch.thresholdMs,touch_session_id:touch.sessionId,
      physical_rest_intervals:measured,touch_coverage_intervals:coverage,touch_issues:[...new Set(issues)]};
  }
  class FileLink {
    constructor(){this.handle=null;this.journal=new Journal();this.offset=0;this.busy=null;this.failure=null;this.decoder=new TextDecoder();}
    async choose(){
      if(!root.showOpenFilePicker)throw new Error('자동 연결은 데스크톱 Chrome 또는 Edge에서 열어 사용하세요.');
      const [handle]=await root.showOpenFilePicker({multiple:false,types:[{description:'Tapboard 터치 실험 로그',accept:{'application/json':['.jsonl']}}]});
      if(this.busy)await this.busy;
      this.handle=handle;this.journal=new Journal();this.offset=0;this.failure=null;this.decoder=new TextDecoder();
      await this.poll();
    }
    poll(){
      if(this.busy)return this.busy;
      if(!this.handle||this.failure)return Promise.resolve();
      this.busy=this.read().finally(()=>{this.busy=null;});return this.busy;
    }
    async read(){
      try{
        const file=await this.handle.getFile();
        if(file.size<this.offset)throw new Error('로그 파일이 초기화되었습니다. 새 로그를 연결하세요.');
        if(file.size>128*1024*1024)throw new Error('로그가 128MB를 넘었습니다. Tapboard를 재시작하고 새 로그로 회차를 진행하세요.');
        const end=Math.min(file.size,this.offset+4*1024*1024);
        const buffer=await file.slice(this.offset,end).arrayBuffer();
        this.journal.feed(this.decoder.decode(buffer,{stream:true}));this.offset=end;
      }catch(error){
        // getFile snapshots can become unreadable while the writer appends.
        // Retry from the same byte offset with a fresh File on the next poll.
        if(error.name==='NotReadableError'||error.name==='AbortError')return;
        this.failure=error.message;this.journal.error=error.message;
      }
    }
    status(now=Date.now()){
      if(this.failure)return {ok:false,message:this.failure};
      if(!this.handle)return {ok:false,message:'연결 안 됨'};
      return journalStatus(this.journal,now,'로그를 읽는 중 · 새 앱의 로그인지 확인하세요','터치 기록 중단 · 앱을 다시 시작하고 새 로그를 연결하세요');
    }
  }
  function journalStatus(j,now,waiting,lost) {
      const h=j.heartbeat;
      if(!h)return {ok:false,message:waiting};
      if(j.integrityFault)return {ok:false,message:lost};
      if(j.ended)return {ok:false,message:lost};
      const drift=Math.abs(h.wallUnixMs-(j.meta.startedUnixMs+h.t));
      if(drift>50)return {ok:false,message:'PC 시계 변경 감지 · 앱과 페이지를 다시 시작하세요'};
      const age=now-(j.meta.startedUnixMs+h.t);
      if(age< -100||age>2000)return {ok:false,message:'로그 신호 끊김 · 같은 PC의 실행 중인 앱인지 확인하세요'};
      return {ok:true,message:'실시간 연결됨',ageMs:age,sessionId:j.meta.sessionId};
  }
  class LocalLink {
    constructor(pinned, request=(path, options)=>root.fetch(path,options)) {
      this.pinned=pinned;
      this.request=request;
      this.journal=new Journal();
      this.busy=null;
      this.failure=null;
      this.discontinuity=false;
    }
    poll() {
      if(!this.busy) this.busy=this.read().finally(()=>{ this.busy=null; });
      return this.busy;
    }
    async read() {
      if(this.discontinuity && this.pinned()) return;
      const old=this.journal;
      const compact=!this.pinned() && old.rows.length>12000;
      const resume=old.meta && !this.discontinuity && !compact;
      const path=resume?'/touch?session='+encodeURIComponent(old.meta.sessionId)+'&after='+old.lastSeq:'/touch';
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),1500);
      try {
        const response=await this.request(path,{headers:{'X-TapBoard-Study':'1'},cache:'no-store',signal:controller.signal});
        if(!response.ok) throw new Error('키보드 앱 응답 오류 ('+response.status+')');
        const data=await response.json();
        if(data.session) {
          if(old.meta && this.pinned()) {
            // An idle compaction request may complete just after Start was pressed.
            if(compact && data.session.sessionId===old.meta.sessionId) return;
            this.discontinuity=true;
            throw new Error('키보드 앱이 바뀌었거나 터치 이벤트가 누락되었습니다. 현재 회차를 중단하세요.');
          }
          const j=new Journal();
          j.feed(JSON.stringify(data.session)+'\n');
          if(!Number.isSafeInteger(data.cursor) || data.cursor<0 || !Array.isArray(data.seed)) throw new Error('터치 연결 응답이 올바르지 않습니다.');
          const seed=[...data.seed];
          if(data.heartbeat) seed.push(data.heartbeat);
          seed.sort((a,b)=>a.seq-b.seq);
          for(const row of seed) {
            if(!['heartbeat','down'].includes(row.type) || row.seq<=j.lastSeq || row.seq>data.cursor)
              throw new Error('터치 시작 상태가 올바르지 않습니다.');
            j.lastSeq=row.seq-1;
            j.feed(JSON.stringify(row)+'\n');
          }
          j.lastSeq=data.cursor;
          this.journal=j;
          this.discontinuity=false;
        } else {
          if(!resume || !Array.isArray(data.events)) throw new Error('터치 이벤트를 읽을 수 없습니다.');
          if(data.events.length) old.feed(data.events.map(e=>JSON.stringify(e)).join('\n')+'\n');
        }
        this.failure=null;
      } catch(error) {
        this.failure=this.discontinuity || old.error?error.message:'키보드 앱 연결 대기 중 · 같은 PC에서 실험용 앱을 실행하세요.';
        if(old.error || this.discontinuity) {
          this.discontinuity=true;
          old.error=this.failure;
        }
      } finally {clearTimeout(timeout);}
    }
    status(now=Date.now()) {
      if(this.failure) return {ok:false,message:this.failure};
      return journalStatus(this.journal,now,'키보드 앱 연결 중','키보드 신호가 끊겼습니다. 앱을 확인하세요.');
    }
  }
  root.TapTouch={Journal,FileLink,LocalLink,summarize};
  if(typeof module!=='undefined')module.exports=root.TapTouch;
})(typeof window!=='undefined'?window:globalThis);
