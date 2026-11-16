'use strict';
const $ = id => document.getElementById(id), M = TapMetrics, T = TapTouch;
const touchLink = new T.FileLink();
let finalizing = false;
function summary(trial, now = trial.endMs ?? trial.lastSavedMs ?? 0) {
  return {...M.summarize(trial, now), ...T.summarize(trial.touch, now)};
}
function captureTouch(trial, now) {
  if (!trial.config.touchEnabled) return;
  trial.touch = touchLink.journal.capture(trial.startedUnix, now, trial.config.touchThresholdMs);
  if (trial.touch && trial.touchClockIssue != null) trial.touch.invalidFromMs = trial.touchClockIssue;
}
function renderTouchStatus() {
  const state = touchLink.status();
  $('touchStatus').textContent = state.message;
  $('touchStatus').classList.toggle('connected', state.ok);
}
const VERSION = '1.1.0', SCHEMA = 'tapboard-study/v1';
const phrases = {
  en: ['The quick brown fox jumps over the lazy dog.','A quiet morning is a good time to start.','Place your hands gently on the keyboard.','Small steps can lead to meaningful changes.','The warm light falls across the wooden desk.','Take a short break before the next sentence.','We learn something new with every attempt.','Keep your eyes on the words in front of you.'],
  ko: ['오늘은 새로운 문장을 천천히 입력합니다.','키보드 위에 손을 편안하게 올려놓으세요.','작은 변화가 더 나은 경험을 만듭니다.','창문 너머로 따뜻한 햇살이 들어옵니다.','잠시 쉬었다가 다음 문장을 입력하세요.','정확하고 편안하게 타이핑하는 연습을 합니다.','책상 위에 놓인 노트를 펼쳐 보았습니다.','한 걸음씩 나아가면 목표에 도착합니다.']
};
let records = [], active = null, origin = 0, phase = 'ready', phraseIndex = 0;
let composing = false, committed = '', db = null, saveQueue = Promise.resolve(), renderedAt = 0, storageBroken = false;
const fmt = (n, digits=1) => n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const time = () => Math.round((performance.now()-origin)*1000)/1000;
const promptText = () => $('language').value==='custom' ? $('customPrompt').value : phrases[$('language').value][phraseIndex % phrases[$('language').value].length];
const notify = s => { $('notice').textContent=s; $('notice').hidden=false; };
const id = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
function event(type, data={}) {
  if (!active) return;
  const t = time();
  active.events.push({seq:active.events.length,t,utc:new Date(active.startedUnix+t).toISOString(),type,...data});
  active.lastSavedMs=t;
}
function txPut(record) {
  return new Promise((resolve,reject)=> {
    const tx = db.transaction('trials','readwrite');
    tx.objectStore('trials').put(record);
    tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error);
  });
}
function persist(record) {
  if (!record) return Promise.resolve();
  if (record === active) captureTouch(record, time());
  const snapshot = JSON.parse(JSON.stringify(record));
  saveQueue = saveQueue.then(async()=>{
    if (!db) throw new Error('Storage unavailable');
    await txPut(snapshot);
    storageBroken=false;
  }).catch(()=>{
    storageBroken=true;
    notify('브라우저 저장소에 기록하지 못했습니다. 현재 데이터는 메모리에 유지됩니다. 창을 닫기 전에 전체 JSON을 내보내세요.');
  });
  return saveQueue;
}
function loadDB() {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('tapboard-study',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('trials',{keyPath:'id'});
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      db=request.result;
      db.onversionchange=()=>db.close();
      const read=db.transaction('trials').objectStore('trials').getAll();
      read.onsuccess=()=>resolve(read.result); read.onerror=()=>reject(read.error);
    };
  });
}
function renderPrompt() {
  const target = active?.prompt ?? promptText(), typed=M.chars(active?.text ?? '');
  const fragment=document.createDocumentFragment();
  M.chars(target).forEach((c,i)=>{
    const span=document.createElement('span'); span.textContent=c;
    span.className=i<typed.length ? (c===typed[i] ? 'correct':'incorrect') : i===typed.length ? 'cursor':'';
    fragment.append(span);
  });
  if (typed.length>M.chars(target).length) {
    const extra=document.createElement('span');extra.className='incorrect';extra.textContent=typed.slice(M.chars(target).length).join('');fragment.append(extra);
  }
  $('prompt').replaceChildren(fragment);
  const length=M.chars(target).length;
  $('progressLabel').textContent=`${typed.length} / ${length}`;
  $('progressBar').style.width=`${Math.min(100,length?typed.length/length*100:0)}%`;
  $('phraseLabel').textContent=$('language').value==='custom'?'CUSTOM':`${$('language').value==='ko'?'한국어':'ENGLISH'} / ${String(phraseIndex+1).padStart(2,'0')}`;
}
function setCue(title,description,icon='↳',resting=false) {
  $('cueTitle').textContent=title; $('cueText').textContent=description; $('cueIcon').textContent=icon; $('cue').classList.toggle('resting',resting);
}
function setPhase(next) {
  phase=next;
  const running=!!active;
  $('state').textContent=({ready:'준비됨',baseline:'레스팅 중',typing:'기록 중',rest:'레스팅 중',done:'저장됨'})[next];
  $('state').classList.toggle('active',running);
  for (const name of ['connectTouch','touchEnabled','touchThreshold']) $(name).disabled=running||finalizing;
  $('settings').disabled=running; $('start').disabled=running; $('nextPrompt').disabled=running;
  $('rest').disabled=!['typing','rest'].includes(next); $('finish').disabled=!['typing','rest'].includes(next); $('abort').disabled=!running;
  $('rest').textContent=next==='rest'?'▶ 입력 재개':'Ⅱ 레스팅';
  $('typing').disabled=next!=='typing';
  $('recordingDot').classList.toggle('live-dot',running);
  $('recordingStatus').textContent=running?'이 회차의 이벤트를 기록하고 있습니다':storageBroken?'저장 실패 · 파일로 내보내세요':'기록 대기 중';
  $('start').innerHTML=next==='done'?'<span>●</span> 다음 회차 시작':'<span>●</span> 로깅 시작';
}
function start() {
  if (active || finalizing) return;
  if ($('touchEnabled').checked && (!$('touchThreshold').reportValidity() || !touchLink.status().ok)) {notify('자동 측정을 사용하려면 같은 PC의 실행 중인 Tapboard 터치 로그를 먼저 연결하세요.');return;}
  for (const name of ['participant','block','restSeconds','idleSeconds']) {
    if (!$(name).reportValidity()) return;
  }
  if (!$('participant').value.trim()) {notify('참가자 ID를 입력하세요.');$('participant').focus();return;}
  const prompt=promptText().normalize('NFC');
  if (!prompt.trim()) {notify('입력할 문장을 먼저 작성하세요.');return;}
  origin=performance.now();composing=false;committed='';$('typing').value='';$('countdown').textContent='';
  active={schema:SCHEMA,version:VERSION,id:id(),sessionId:sessionId,trial:records.length+1,
    participant:$('participant').value.trim(),condition:$('condition').value,block:Number($('block').value),
    kind:$('trialKind').value,language:$('language').value,promptIndex:phraseIndex,prompt,
    notes:$('notes').value,config:{restMs:Number($('restSeconds').value)*1000,idleMs:Number($('idleSeconds').value)*1000,touchEnabled:$('touchEnabled').checked,touchThresholdMs:Number($('touchThreshold').value)},
    startedUnix:Date.now()-time(),startedAt:new Date().toISOString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
    environment:{userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight},screen:{width:screen.width,height:screen.height},devicePixelRatio:devicePixelRatio},
    status:'running',text:'',events:[],rests:[],cueMs:null,lastSavedMs:0};
  event('trial_start');$('trialLabel').textContent=`TRIAL ${String(active.trial).padStart(2,'0')}`;
  if (active.config.restMs>0) {
    active.rests.push({start:0,end:null,kind:'instructed_baseline'});event('rest_start',{kind:'instructed_baseline'});
    setPhase('baseline');setCue('손을 편안하게 쉬어 주세요','카운트다운이 끝나면 문장을 입력하세요.','Ⅱ',true);
  } else beginTyping();
  renderPrompt();renderRecords();persist(active);renderMetrics(active,0);
}
function beginTyping() {
  if (!active) return;
  const now=time(), open=active.rests.find(r=>r.end===null);
  if (open) {open.end=now;event('rest_end',{kind:open.kind,duration_ms:now-open.start});}
  if (active.cueMs===null) active.cueMs=now;
  event('typing_cue');setPhase('typing');$('countdown').textContent='';
  setCue('지금 입력하세요','정확하고 편안한 속도로 문장을 입력한 뒤 회차를 완료하세요.','→');
  $('typing').focus();persist(active);
}
function toggleRest() {
  if (!active || !['typing','rest'].includes(phase)) return;
  if (composing) {notify('한글 조합을 확정한 뒤 레스팅을 시작하세요.');$('typing').focus();return;}
  if (phase==='rest') return beginTyping();
  active.rests.push({start:time(),end:null,kind:'instructed_manual'});event('rest_start',{kind:'instructed_manual'});
  setPhase('rest');setCue('잠시 손을 쉬어 주세요','준비되면 입력 재개 버튼을 누르세요. 이 구간도 기록됩니다.','Ⅱ',true);persist(active);
}
function commitText(inputType='') {
  if (!active || phase!=='typing' || composing) return;
  const next=$('typing').value.normalize('NFC');
  if (next!==committed) {
    const d=M.delta(committed,next);
    event('text_commit',{inputType,before:committed,after:next,...d});committed=next;active.text=next;
    renderPrompt();
  }
}
async function finish(status='completed') {
  if (!active) return;
  if (composing) {notify('한글 조합을 확정한 뒤 회차를 완료하세요.');$('typing').focus();return;}
  commitText();event(status==='completed'?'trial_complete':'trial_abort');
  const now=time(), ended=active;
  for (const r of ended.rests) if (r.end===null) r.end=now;
  ended.endMs=now;ended.endedAt=new Date(ended.startedUnix+now).toISOString();ended.lastSavedMs=now;ended.status=status;ended.metrics=summary(ended);
  captureTouch(ended,now);
  records.push(ended);active=null;finalizing=true;
  setPhase('done');$('countdown').textContent='';$('start').disabled=true;
  setCue(status==='completed'?'회차가 완료되었습니다':'중단한 회차도 보관합니다','데이터를 저장하고 있습니다.','✓');
  renderMetrics(ended,now);renderRecords();
  await persist(ended);
  if (ended.config.touchEnabled) {
    $('recordingStatus').textContent='마지막 터치 이벤트를 동기화하고 있습니다…';
    const deadline=performance.now()+1800;
    do {
      await touchLink.poll();
      const h=touchLink.journal.heartbeat;
      if (h && touchLink.journal.meta.startedUnixMs+h.t>=ended.startedUnix+now) break;
      if(touchLink.failure)break;
      await new Promise(resolve=>setTimeout(resolve,100));
    } while(performance.now()<deadline);
    captureTouch(ended,now);
  }
  ended.metrics=summary(ended);finalizing=false;setPhase('done');
  renderMetrics(ended,now);renderRecords();await persist(ended);
  if(ended.config.touchEnabled&&ended.metrics.touch_quality!=='complete')notify('터치 로그가 일부 구간을 덮지 못했습니다. 실측 값은 확인된 구간만의 합계이며 회차 상세의 측정 범위를 확인하세요.');
  if (!active) {
    $('recordingStatus').textContent=storageBroken?'저장 실패 · 파일로 내보내세요':`${ended.events.length}개 이벤트 · 이 브라우저에 저장됨`;
    $('cueText').textContent=storageBroken?'저장에 실패했습니다. 전체 JSON으로 데이터를 내보내세요.':'요약 CSV 또는 전체 JSON으로 내보낼 수 있습니다. 다음 회차도 같은 문장으로 시작합니다.';
  }
}
function renderMetrics(trial,now) {
  if(trial===active)captureTouch(trial,now);
  const m=summary(trial,now);
  $('wpm').textContent=fmt(m.wpm);$('accuracy').textContent=fmt(m.accuracy_pct);$('latency').textContent=fmt(m.first_key_after_cue_ms,0);
  $('restMetric').textContent=fmt(m.instructed_rest_ms/1000);$('idleMetric').textContent=fmt(m.idle_ms/1000);
  $('physicalRest').textContent=m.physical_rest_ms==null?'— s':`${fmt(m.physical_rest_ms/1000)} s${m.touch_quality==='partial'?' · 일부 구간':''}`;
  $('elapsed').textContent=`${String(Math.floor(now/60000)).padStart(2,'0')}:${(now%60000/1000).toFixed(1).padStart(4,'0')}`;
}
function renderRecords() {
  $('records').replaceChildren();$('recordCount').textContent=records.length;$('empty').hidden=!!records.length;
  for (const r of [...records].reverse()) {
    const m=r.metrics || summary(r), row=document.createElement('tr');
    const values=[`${String(r.trial).padStart(2,'0')} / ${r.participant}`,`${r.condition} · B${r.block}`,`${r.kind==='practice'?'연습 · ':''}${({completed:'완료',aborted:'중단',interrupted:'복구 / 불완전'})[r.status]||r.status}`,fmt(m.wpm),fmt(m.accuracy_pct)+'%',fmt(m.first_key_after_cue_ms,0)+' ms',fmt(m.instructed_rest_ms/1000)+' s',m.physical_rest_ms==null?'—':fmt(m.physical_rest_ms/1000)+' s'+(m.touch_quality==='partial'?' (일부)':'')];
    values.forEach((value,i)=>{const cell=document.createElement('td');cell.textContent=value;if(i>2)cell.className='numeric';row.append(cell);});
    const cell=document.createElement('td'),button=document.createElement('button');button.className='text-button';button.textContent='보기 ↗';button.onclick=()=>showDetail(r);cell.append(button);row.append(cell);$('records').append(row);
  }
  for (const name of ['exportSummary','exportEvents','exportAll']) $(name).disabled=!records.length&&!active;
}
function showDetail(r) {
  const m=r.metrics || summary(r),body=$('detailBody');body.replaceChildren();
  const title=document.createElement('p');title.className='muted-text';title.textContent=`${r.participant} · ${r.condition} · ${r.startedAt} · ${r.kind} · ${r.status}`;body.append(title);
  const grid=document.createElement('div');grid.className='detail-grid';
  const specs=[['실측 레스팅 (ms)',m.physical_rest_ms],['손가락별 레스팅 합계 (ms)',m.physical_rest_finger_ms],['실측 접촉 시간 (ms)',m.physical_contact_ms],['터치 측정 범위 (%)',m.touch_coverage_pct],['터치 기록 품질',m.touch_quality||'not_connected'],['접촉 수',m.touch_contact_count],['레스팅 기준 (ms)',m.touch_threshold_ms],['WPM',m.wpm],['CPM',m.cpm],['정확도 (%)',m.accuracy_pct],['편집 거리',m.edit_distance],['총 기록 시간 (ms)',m.duration_ms],['첫 문자 → 마지막 편집 (ms)',m.transcription_ms],['첫 키 / 입력 신호 (ms)',m.first_key_after_cue_ms],['첫 문자 / 입력 신호 (ms)',m.first_text_after_cue_ms],['첫 키 / 기록 시작 (ms)',m.first_key_from_start_ms],['지시된 레스팅 (ms)',m.instructed_rest_ms],['무입력 시간 (ms)',m.idle_ms],['무입력 구간 수',m.idle_count],['평균 키 간 간격 (ms)',m.mean_iki_ms],['평균 키 누름 시간 (ms)',m.mean_key_dwell_ms],['KSPC',m.kspc],['입력 키 이벤트 수',m.keydown_count],['Backspace / Delete',`${m.backspace_count} / ${m.delete_count}`],['삽입 / 삭제 문자',`${m.inserted_characters} / ${m.removed_characters}`],['포커스 이탈',m.focus_loss_count],['탭 숨김 (ms)',m.hidden_ms],['한글 조합 횟수',m.composition_count],['이벤트 수',r.events.length]];
  for(const [label,value] of specs){const line=document.createElement('div'),name=document.createElement('span'),val=document.createElement('b');name.textContent=label;val.textContent=typeof value==='string'?value:fmt(value);line.append(name,val);grid.append(line);}body.append(grid);
  for(const [name,text] of [['프롬프트',r.prompt],['입력 결과',r.text],['조건 메모',r.notes]]){const label=document.createElement('h3'),p=document.createElement('p');label.textContent=name;p.className='detail-text';p.textContent=text||'—';body.append(label,p);}
  $('detail').showModal();
}
function snapshotRecords() {
  if(active)captureTouch(active,time());
  const all=JSON.parse(JSON.stringify(records));
  if(active){const r=JSON.parse(JSON.stringify(active));r.lastSavedMs=time();r.metrics=summary(r,r.lastSavedMs);all.push(r);}return all;
}
function download(name,content,mime) {
  const blob=new Blob([content],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function exportData(kind) {
  if(active) event('export',{kind});
  const all=snapshotRecords(),stamp=new Date().toISOString().replace(/[:.]/g,'-');
  if(!all.length){notify('내보낼 기록이 없습니다.');return;}
  if(kind==='json')return download(`tapboard-${stamp}.json`,JSON.stringify({schema:SCHEMA,version:VERSION,exportedAt:new Date().toISOString(),definitions:{physicalRest:'union of sustained TAPPER/BLANK contacts after threshold, clipped to trial and heartbeat-covered intervals; modifier/repeating keys excluded; incomplete coverage explicitly marked',touchClock:'same-PC UTC anchors, monotonic elapsed time; native and browser clock jumps over 50ms flagged; 250ms polling affects display only',rest:'instructed intervals; not physical contact detection',wpm:'max(0,NFC character count - 1) / 5 / minutes(first insertion to last committed edit); rests included',accuracy:'100 * (1 - Levenshtein(target, text) / max(length(target), length(text)))',idle:'full typing-key gaps >= threshold, excluding instructed rest intervals',timestamps:'monotonic milliseconds from trial start; UTC anchored to trial start',ime:'composition snapshots retained; text commits counted after composition',storage:'local browser; active checkpoints approximately every 1 second'},trials:all},null,2),'application/json');
  const rows=kind==='summary'?all.map(r=>{
    const {idle_intervals,physical_rest_intervals,touch_coverage_intervals,touch_issues,...metrics}=r.metrics||summary(r);
    return {schema:r.schema,trial_id:r.id,session_id:r.sessionId,participant:r.participant,condition:r.condition,block:r.block,trial:r.trial,kind:r.kind,status:r.status,language:r.language,started_at:r.startedAt,ended_at:r.endedAt,timezone:r.timezone,prompt:r.prompt,transcription:r.text,notes:r.notes,idle_threshold_ms:r.config.idleMs,baseline_rest_ms:r.config.restMs,...metrics,touch_issues};
  }):all.flatMap(r=>[...r.events.map(e=>({...e,source:'browser'})),...(r.touch?.seed||[]).map(e=>({...e,type:'seed_contact',source:'touch'})),...(r.touch?.events||[]).map(e=>({...e,source:'touch'}))].sort((a,b)=>a.t-b.t).map(e=>({trial_id:r.id,participant:r.participant,condition:r.condition,block:r.block,trial:r.trial,kind:r.kind,status:r.status,...e})));
  download(`tapboard-${kind}-${stamp}.csv`,M.csv(rows),'text/csv;charset=utf-8');
}
const sessionId=id();
$('connectTouch').onclick=async()=>{
  if(active||finalizing)return;
  $('start').disabled=true;$('connectTouch').disabled=true;
  try {await touchLink.choose();$('touchEnabled').checked=true;renderTouchStatus();if(touchLink.failure)notify(touchLink.failure);}
  catch(error){if(error.name!=='AbortError')notify(error.message);}
  finally{$('connectTouch').disabled=!!active||finalizing;$('start').disabled=!!active||finalizing;}
};
setInterval(async()=>{
  await touchLink.poll();renderTouchStatus();
  if(active?.config.touchEnabled){
    if(Math.abs(Date.now()-(active.startedUnix+time()))>50 && active.touchClockIssue==null){active.touchClockIssue=time();event('browser_clock_changed');notify('PC 시계 변경을 감지했습니다. 터치 시간 비교가 불완전하므로 앱과 페이지를 다시 시작하세요.');}
    captureTouch(active,time());
  }
},250);
$('start').onclick=start;$('rest').onclick=toggleRest;$('finish').onclick=()=>finish();$('abort').onclick=()=>finish('aborted');
$('exportAll').onclick=()=>exportData('json');$('exportSummary').onclick=()=>exportData('summary');$('exportEvents').onclick=()=>exportData('events');$('closeDetail').onclick=()=>$('detail').close();
$('language').onchange=()=>{phraseIndex=0;$('customWrap').hidden=$('language').value!=='custom';if(!active){$('typing').value='';renderPrompt();}};
$('customPrompt').oninput=()=>{if(!active)renderPrompt();};
$('nextPrompt').onclick=()=>{if(active)return;if($('language').value==='custom'){$('customPrompt').focus();return;}phraseIndex=(phraseIndex+1)%phrases[$('language').value].length;$('typing').value='';renderPrompt();};
for(const type of ['keydown','keyup']) $('typing').addEventListener(type,e=>{
  if(!active || phase!=='typing') return;
  const typingKey=!(e.ctrlKey||e.metaKey||e.altKey) && (e.key.length===1 || ['Backspace','Delete','Enter','Process','Unidentified','Dead'].includes(e.key) || e.isComposing);
  event(type,{key:e.key,code:e.code,repeat:e.repeat,ctrl:e.ctrlKey,alt:e.altKey,shift:e.shiftKey,meta:e.metaKey,isComposing:e.isComposing,typingKey,selectionStart:$('typing').selectionStart,selectionEnd:$('typing').selectionEnd});
});
$('typing').addEventListener('beforeinput',e=>{
  if(!active)return;
  if(e.inputType==='insertFromPaste'||e.inputType==='insertFromDrop') {e.preventDefault();event('paste_blocked',{inputType:e.inputType});return;}
  event('beforeinput',{inputType:e.inputType,data:e.data,isComposing:e.isComposing,selectionStart:$('typing').selectionStart,selectionEnd:$('typing').selectionEnd});
});
$('typing').addEventListener('input',e=>{event('input',{inputType:e.inputType,data:e.data,isComposing:e.isComposing,value:$('typing').value});if(!e.isComposing)commitText(e.inputType);});
$('typing').addEventListener('compositionstart',e=>{composing=true;event('compositionstart',{data:e.data});});
$('typing').addEventListener('compositionupdate',e=>event('compositionupdate',{data:e.data}));
$('typing').addEventListener('compositionend',e=>{composing=false;event('compositionend',{data:e.data});commitText('compositionend');});
for(const type of ['paste','drop']) $('typing').addEventListener(type,e=>{e.preventDefault();event(type+'_blocked');});
for(const type of ['focus','blur']) $('typing').addEventListener(type,()=>event(type,{target:'typing'}));
window.addEventListener('blur',()=>event('window_blur'));
window.addEventListener('focus',()=>event('window_focus'));
document.addEventListener('visibilitychange',()=>{event(document.hidden?'hidden':'visible');if(active)persist(active);});
window.addEventListener('beforeunload',e=>{if(active||finalizing){if(active){event('unload_attempt');persist(active);}e.preventDefault();e.returnValue='';}});
setInterval(()=>{
  if(!active)return;
  const now=time();
  // Only show the cue when the participant can actually see it. Background time remains logged.
  if(phase==='baseline') {
    const left=Math.max(0,active.config.restMs-now);$('countdown').textContent=(left/1000).toFixed(1);
    if(left===0&&!document.hidden)beginTyping();
  }else if(phase==='rest')$('countdown').textContent=((now-active.rests.at(-1).start)/1000).toFixed(1);
  if(now-renderedAt>=200||now<renderedAt){renderMetrics(active,now);renderedAt=now;}
},100);
setInterval(()=>{if(active){active.lastSavedMs=time();persist(active);}},1000);
(async()=>{
  $('start').disabled=true;
  try {
    records=await loadDB();records.sort((a,b)=>a.startedUnix-b.startedUnix);
    let recovered=0;
    for(const r of records)if(r.status==='running'){
      r.status='interrupted';r.endMs=r.lastSavedMs;r.endedAt=new Date(r.startedUnix+r.endMs).toISOString();
      for(const rest of r.rests)if(rest.end===null)rest.end=r.endMs;
      r.events.push({seq:r.events.length,t:r.endMs,utc:r.endedAt,type:'recovered_checkpoint'});r.metrics=summary(r);await persist(r);recovered++;
    }
    if(recovered)notify(`${recovered}개의 진행 중 기록을 마지막 저장 시점까지 복구했습니다. 불완전한 회차로 표시했습니다.`);
  }catch{storageBroken=true;notify('이 환경에서는 브라우저 저장소를 사용할 수 없습니다. 파일 내보내기는 가능합니다. 창을 닫기 전에 데이터를 저장하세요.');}
  $('start').disabled=false;$('trialLabel').textContent=`TRIAL ${String(records.length+1).padStart(2,'0')}`;
  renderRecords();renderPrompt();
})();
