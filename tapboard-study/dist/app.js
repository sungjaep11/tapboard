'use strict';
const $ = id => document.getElementById(id), M = TapMetrics, T = TapTouch;
const touchLink = new T.FileLink();
let finalizing = false;
function summary(trial, now = trial.endMs ?? trial.lastSavedMs ?? 0) {
  const touch=T.summarize(trial.touch,now);
  if(!trial.paragraph) return {...M.summarize(trial,now),...touch};
  const sentences=P.sentenceMetrics(trial,M);
  const prompt=sentences.map(s=>s.prompt).join(' '), text=sentences.map(s=>s.text).join(' ');
  const metrics=M.summarize({...trial,prompt,text},now);
  const timed=sentences.filter(s=>s.transcription_ms>0);
  const ms=timed.reduce((total,s)=>total+s.transcription_ms,0);
  const chars=timed.reduce((total,s)=>total+Math.max(0,s.characters-1),0);
  const home=trial.paragraph.home;
  return {...metrics,...touch,wpm:ms>0?chars*12000/ms:null,cpm:ms>0?chars*60000/ms:null,
    transcription_ms:ms,home_both_correct:home.length===2?home.every(h=>h.correct):null,
    home_latency_ms:home.length===2?Math.max(...home.map(h=>h.t))-trial.paragraph.homeCueMs:null};
}
function captureTouch(trial, now) {
  if (!trial.config.touchEnabled) return;
  trial.touch = studyLink(trial).journal.capture(trial.startedUnix, now, trial.config.touchThresholdMs);
  if(trial.touch && trial.paragraph) {
    trial.touch.source=trial.paragraph.touchSource;
    if(trial.touch.source==='browser-pointer') trial.touch.timeMapping='lower-window pointer samples mapped to the upper browser monotonic clock; same-PC UTC anchor';
  }
  if (trial.touch && trial.touchClockIssue != null) trial.touch.invalidFromMs = trial.touchClockIssue;
}
function renderTouchStatus() {
  const usingConv=integrated() && browserConv();
  const state = usingConv?{ok:!!conv.win && !conv.win.closed,message:conv.win && !conv.win.closed?'ConvBoard 창 연결됨':'아래 화면에서 ConvBoard를 여세요'}:nativeStudyStatus();
  $('touchStatus').textContent = state.message;
  $('touchStatus').classList.toggle('connected', state.ok);
}
const VERSION = '1.3.0', SCHEMA = 'tapboard-study/v1';
const phrases = {
  en: mackenziePhrases,
  ko: ['오늘은 새로운 문장을 천천히 입력합니다.','키보드 위에 손을 편안하게 올려놓으세요.','작은 변화가 더 나은 경험을 만듭니다.','창문 너머로 따뜻한 햇살이 들어옵니다.','잠시 쉬었다가 다음 문장을 입력하세요.','정확하고 편안하게 타이핑하는 연습을 합니다.','책상 위에 놓인 노트를 펼쳐 보았습니다.','한 걸음씩 나아가면 목표에 도착합니다.']
};
let records = [], active = null, origin = 0, phase = 'ready', phraseIndex = 0;
let composing = false, db = null, saveQueue = Promise.resolve(), renderedAt = 0, storageBroken = false;
const fmt = (n, digits=1) => n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const time = () => Math.round((performance.now()-origin)*1000)/1000;
const promptText = () => $('language').value==='custom' ? $('customPrompt').value : phrases[$('language').value][phraseIndex % phrases[$('language').value].length];
const notify = s => { $('notice').textContent=s; $('notice').hidden=false; };
const id = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
function event(type, data={}) {
  if (!active) return;
  const t = time();
  active.events.push({seq:active.events.length,t,utc:new Date(active.startedUnix+t).toISOString(),type,...(active.paragraph?{phase:active.paragraph.phases.at(-1)?.name,sentence:active.paragraph.index}:{}),...data});
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
  const paragraph=active?.paragraph;
  const visiblePrompt=paragraph && phase!=='typing'?'':active?.prompt ?? promptText();
  const target = M.chars(visiblePrompt), typed = M.chars($('typing').value);
  const fragment=document.createDocumentFragment();
  target.forEach((c,i)=>{
    const span=document.createElement('span'); span.textContent=c;
    span.className=i<typed.length ? (c===typed[i] ? 'correct':'incorrect') : i===typed.length ? 'cursor':'';
    fragment.append(span);
  });
  $('prompt').replaceChildren(fragment);
  const length=target.length;
  $('progressLabel').textContent=`${typed.length} / ${length}`;
  $('progressBar').style.width=`${Math.min(100,length?typed.length/length*100:0)}%`;
  if(paragraph) { $('phraseLabel').textContent='문장 '+(paragraph.index+1)+' / '+paragraph.sentences.length;return; }
  $('phraseLabel').textContent=$('language').value==='custom'?'CUSTOM':`${$('language').value==='ko'?'한국어':'ENGLISH'} / ${String(phraseIndex+1).padStart(2,'0')}`;
}
function setCue(title,description,icon='↳',resting=false) {
  $('cueTitle').textContent=title; $('cueText').textContent=description; $('cueIcon').textContent=icon; $('cue').classList.toggle('resting',resting);
}
function setPhase(next) {
  phase=next;
  const running=!!active;
  $('state').textContent=({ready:'자유 연습',baseline:'레스팅 중',typing:'기록 중',rest:'레스팅 중',done:finalizing?'저장 중':'회차 종료'})[next];
  $('state').classList.toggle('active',running);
  for (const name of ['connectTouch','touchEnabled','touchThreshold']) $(name).disabled=running||finalizing;
  $('settings').disabled=running||finalizing; $('start').disabled=running||finalizing; $('nextPrompt').disabled=running||finalizing;
  $('rest').disabled=!['typing','rest'].includes(next); $('finish').disabled=!['typing','rest'].includes(next); $('abort').disabled=!running;
  $('rest').textContent=next==='rest'?'▶ 입력 재개':'Ⅱ 레스팅';
  $('typing').disabled=finalizing || next==='baseline' || next==='rest';
  $('recordingDot').classList.toggle('live-dot',running);
  $('recordingStatus').textContent=running?'이 회차의 이벤트를 기록하고 있습니다':storageBroken?'저장 실패 · 파일로 내보내세요':'기록 대기 중';
  $('start').innerHTML=next==='done'?'<span>●</span> 다음 회차 시작':'<span>●</span> 로깅 시작';
}
function showPractice() {
  setPhase('ready');
  setCue('바로 타이핑하세요','기본 문장 세트에서는 Enter로 다음 문장으로 넘어갑니다. 문장을 정확히 다 치면 스페이스바로도 넘어갈 수 있습니다.');
  $('trialLabel').textContent=`TRIAL ${String(records.length+1).padStart(2,'0')}`;
  for (const name of ['wpm','accuracy','latency']) $(name).textContent='—';
  for (const name of ['restMetric','idleMetric']) $(name).textContent='0.0';
  $('physicalRest').textContent='— s';
  $('elapsed').textContent='00:00.0';
}
function resetPracticeText() {
  if (phase==='done') showPractice();
  $('typing').value='';
  renderPrompt();
}
function start() {
  if (active || finalizing) return;
  let paragraph=null;
  if(integrated()) {
    try {paragraph=prepareParagraph();} catch(error) {notify(error.message);return;}
  }
  if (!paragraph && $('touchEnabled').checked && (!$('touchThreshold').reportValidity() || !touchLink.status().ok)) {notify('자동 측정을 사용하려면 같은 PC의 실행 중인 Tapboard 터치 로그를 먼저 연결하세요.');return;}
  const fields=paragraph?['participant','block','idleSeconds']:['participant','block','restSeconds','idleSeconds'];
  for (const name of fields) {
    if (!$(name).reportValidity()) return;
  }
  if (!$('participant').value.trim()) {notify('참가자 ID를 입력하세요.');$('participant').focus();return;}
  const prompt=paragraph?paragraph.sentences[0].prompt:promptText().normalize('NFC');
  if (!prompt.trim()) {notify('입력할 문장을 먼저 작성하세요.');return;}
  origin=performance.now();composing=false;$('typing').value='';$('countdown').textContent='';
  active={schema:SCHEMA,version:VERSION,id:id(),sessionId:sessionId,trial:records.length+1,
    participant:$('participant').value.trim(),condition:paragraph?.condition ?? $('condition').value,block:Number($('block').value),
    kind:$('trialKind').value,language:paragraph?'en':$('language').value,...(paragraph?{paragraph}:{}),promptIndex:phraseIndex,prompt,
    notes:$('notes').value,config:{restMs:paragraph?0:Number($('restSeconds').value)*1000,idleMs:Number($('idleSeconds').value)*1000,touchEnabled:!!paragraph || $('touchEnabled').checked,touchThresholdMs:Number($('touchThreshold').value)},
    startedUnix:Date.now()-time(),startedAt:new Date().toISOString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
    environment:{userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight},screen:{width:screen.width,height:screen.height},devicePixelRatio:devicePixelRatio},
    status:'running',text:'',events:[],rests:[],cueMs:null,lastSavedMs:0};
  event('trial_start');$('trialLabel').textContent=`TRIAL ${String(active.trial).padStart(2,'0')}`;
  if(paragraph) startParagraph();
  else if (active.config.restMs>0) {
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
  if (next!==active.text) {
    const d=M.delta(active.text,next);
    event('text_commit',{inputType,before:active.text,after:next,...d});active.text=next;
    if(active.paragraph) active.paragraph.sentences[active.paragraph.index].text=next;
  }
}
async function finish(status='completed') {
  if (!active) return;
  if (composing) {notify('한글 조합을 확정한 뒤 회차를 완료하세요.');$('typing').focus();return;}
  commitText();
  if(active.paragraph) {
    const p=active.paragraph;
    p.phases.push({name:'end',t:time(),sentence:p.index});
    active.prompt=p.sentences.map(s=>s.prompt).join(' ');
    active.text=p.sentences.map(s=>s.text).join(' ').trimEnd();
    conv.locked=false;conv.typing=false;
  }
  event(status==='completed'?'trial_complete':'trial_abort');
  const now=time(), ended=active;
  for (const r of ended.rests) if (r.end===null) r.end=now;
  ended.endMs=now;ended.endedAt=new Date(ended.startedUnix+now).toISOString();ended.lastSavedMs=now;ended.status=status;ended.metrics=summary(ended);
  captureTouch(ended,now);
  records.push(ended);active=null;finalizing=true;
  setPhase('done');$('countdown').textContent='';
  setCue(status==='completed'?'회차가 완료되었습니다':'중단한 회차도 보관합니다','데이터를 저장하고 있습니다.','✓');
  renderMetrics(ended,now);renderRecords();
  await persist(ended);
  if (ended.config.touchEnabled) {
    $('recordingStatus').textContent='마지막 터치 이벤트를 동기화하고 있습니다…';
    const deadline=performance.now()+1800;
    do {
      const link=studyLink(ended);
      await link.poll?.();
      const h=link.journal.heartbeat;
      if (h && link.journal.meta.startedUnixMs+h.t>=ended.startedUnix+now) break;
      if(link.failure || link.journal.ended)break;
      await new Promise(resolve=>setTimeout(resolve,100));
    } while(performance.now()<deadline);
    captureTouch(ended,now);
  }
  ended.metrics=summary(ended);await persist(ended);finalizing=false;setPhase('done');
  renderMetrics(ended,now);renderRecords();

  if(ended.config.touchEnabled&&ended.metrics.touch_quality!=='complete')notify('터치 로그가 일부 구간을 덮지 못했습니다. 실측 값은 확인된 구간만의 합계이며 회차 상세의 측정 범위를 확인하세요.');
  if (!active) {
    $('recordingStatus').textContent=storageBroken?'저장 실패 · 파일로 내보내세요':`${ended.events.length}개 이벤트 · 이 브라우저에 저장됨`;
    $('cueText').textContent=storageBroken?'저장에 실패했습니다. 전체 JSON으로 데이터를 내보내세요.':'요약 CSV 또는 전체 JSON으로 내보낼 수 있습니다. 다음 회차도 같은 문장으로 시작합니다.';
    if(ended.paragraph) setupProtocol();
    if (document.activeElement===document.body) $('typing').focus({preventScroll:true});
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
  renderMaps();
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
  if(r.paragraph) {
    const info=document.createElement('p');
    info.textContent='홈키 접촉 '+r.paragraph.home.map(h=>h.target.toUpperCase()+' → '+(h.actual??'빈 영역')+' ('+fmt(h.deviationMm)+' mm)').join(', ');
    body.append(info);
    for(const s of P.sentenceMetrics(r,M)){
      const line=document.createElement('p');
      line.textContent=(s.index+1)+' · '+s.text+' · '+fmt(s.wpm)+' WPM · 첫 문자 '+fmt(s.first_text_after_cue_ms,0)+' ms';body.append(line);
    }
  }
  $('detail').showModal();
}
function snapshotRecords() {
  if(active)captureTouch(active,time());
  const all=JSON.parse(JSON.stringify(records));
  if(active){const r=JSON.parse(JSON.stringify(active));r.lastSavedMs=time();r.metrics=summary(r,r.lastSavedMs);all.push(r);}return all;
}
function download(name,content,mime) {
  const blob=content instanceof Blob?content:new Blob([content],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function exportData(kind) {
  if(active) event('export',{kind});
  const all=snapshotRecords(),stamp=new Date().toISOString().replace(/[:.]/g,'-');
  if(!all.length){notify('내보낼 기록이 없습니다.');return;}
  if(kind==='json')return download(`tapboard-${stamp}.json`,JSON.stringify({schema:SCHEMA,version:VERSION,exportedAt:new Date().toISOString(),definitions:{paragraph:'keyboard geometry in source pixels; hand assignment by first landing x; rest requires two continuous contacts for 3000 ms; completed strokes entirely within a typing phase with duration >400 ms and cumulative length >1.9 mm; paragraph WPM pooled over individual sentence editing intervals',physicalRest:'union of sustained TAPPER/BLANK contacts after threshold, clipped to trial and heartbeat-covered intervals; modifier/repeating keys excluded; incomplete coverage explicitly marked',touchClock:'same-PC UTC anchors, monotonic elapsed time; native and browser clock jumps over 50ms flagged; 250ms polling affects display only',rest:'instructed intervals; not physical contact detection',wpm:'max(0,NFC character count - 1) / 5 / minutes(first insertion to last committed edit); rests included',accuracy:'100 * (1 - Levenshtein(target, text) / max(length(target), length(text)))',idle:'full typing-key gaps >= threshold, excluding instructed rest intervals',timestamps:'monotonic milliseconds from trial start; UTC anchored to trial start',ime:'composition snapshots retained; text commits counted after composition',storage:'local browser; active checkpoints approximately every 1 second'},trials:all.map(r=>r.paragraph?{...r,sentenceMetrics:P.sentenceMetrics(r,M),explorationStrokes:P.strokeSummary(r)}:r)},null,2),'application/json');
  const rows=kind==='summary'?all.map(r=>{
    const {idle_intervals,physical_rest_intervals,touch_coverage_intervals,touch_issues,...metrics}=r.metrics||summary(r);
    return {schema:r.schema,trial_id:r.id,session_id:r.sessionId,participant:r.participant,condition:r.condition,keyboard:r.paragraph?.keyboard,surface:r.paragraph?.surface,block:r.block,trial:r.trial,kind:r.kind,status:r.status,language:r.language,started_at:r.startedAt,ended_at:r.endedAt,timezone:r.timezone,prompt:r.prompt,transcription:r.text,notes:r.notes,idle_threshold_ms:r.config.idleMs,baseline_rest_ms:r.config.restMs,...metrics,...(r.paragraph?{home_left_target_mm:r.paragraph.home[0]?.deviationMm,
      home_right_target_mm:r.paragraph.home[1]?.deviationMm,
      stroke_count:r.metrics?.touch_quality==='complete'?P.strokes(r).length:null}:{}),touch_issues};
  }):all.flatMap(r=>[...r.events.map(e=>({...e,source:'browser'})),...(r.touch?.seed||[]).map(e=>({...e,type:'seed_contact',source:'touch'})),...(r.touch?.events||[]).map(e=>({...e,...(r.paragraph?{phase:P.phaseAt(r.paragraph.phases,e.t).name,sentence:P.phaseAt(r.paragraph.phases,e.t).sentence}:{}),source:'touch'}))].sort((a,b)=>a.t-b.t).map(e=>({trial_id:r.id,participant:r.participant,condition:r.condition,keyboard:r.paragraph?.keyboard,surface:r.paragraph?.surface,block:r.block,trial:r.trial,kind:r.kind,status:r.status,...e})));
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
    if(active.paragraph)processStudyTouch();
  }
},250);
$('start').onclick=start;$('rest').onclick=toggleRest;$('finish').onclick=()=>finish();$('abort').onclick=()=>finish('aborted');
$('exportAll').onclick=()=>exportData('json');$('exportSummary').onclick=()=>exportData('summary');$('exportEvents').onclick=()=>exportData('events');$('closeDetail').onclick=()=>$('detail').close();
$('language').onchange=()=>{
  phraseIndex=0;
  const custom=$('language').value==='custom';
  $('customWrap').hidden=!custom;
  resetPracticeText();
  $(custom?'customPrompt':'typing').focus();
};
$('customPrompt').oninput=resetPracticeText;
function nextPrompt() {
  if($('language').value==='custom'){$('customPrompt').focus();return;}
  phraseIndex=(phraseIndex+1)%phrases[$('language').value].length;
  resetPracticeText();
  $('typing').focus();
}
$('nextPrompt').onclick=nextPrompt;
$('typing').addEventListener('keydown', e=>{
  if (active || finalizing || $('language').value==='custom') return;
  if (composing || e.isComposing || e.keyCode===229 || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
  if (e.key!=='Enter' && e.key!==' ') return;
  const input=e.currentTarget;
  if (e.key===' ' && !(e.repeat && input.value==='')) {
    if (input.selectionStart!==input.value.length || input.selectionEnd!==input.value.length) return;
    if (input.value.normalize('NFC')!==promptText().normalize('NFC')) return;
  }
  e.preventDefault();
  if (!e.repeat) nextPrompt();
});
for(const type of ['keydown','keyup']) $('typing').addEventListener(type,e=>{
  if(!active || phase!=='typing' || browserTrial(active)) return;
  const typingKey=!(e.ctrlKey||e.metaKey||e.altKey) && (e.key.length===1 || ['Backspace','Delete','Enter','Process','Unidentified','Dead'].includes(e.key) || e.isComposing);
  event(type,{key:e.key,code:e.code,repeat:e.repeat,ctrl:e.ctrlKey,alt:e.altKey,shift:e.shiftKey,meta:e.metaKey,isComposing:e.isComposing,typingKey,selectionStart:$('typing').selectionStart,selectionEnd:$('typing').selectionEnd});
});
$('typing').addEventListener('beforeinput',e=>{
  if(e.inputType==='insertFromPaste'||e.inputType==='insertFromDrop') {e.preventDefault();event('paste_blocked',{inputType:e.inputType});return;}
  event('beforeinput',{inputType:e.inputType,data:e.data,isComposing:e.isComposing,selectionStart:$('typing').selectionStart,selectionEnd:$('typing').selectionEnd});
});
$('typing').addEventListener('input',e=>{
  if(phase==='done') showPractice();
  event('input',{inputType:e.inputType,data:e.data,isComposing:e.isComposing,value:$('typing').value});
  if(!e.isComposing) commitText(e.inputType);
  renderPrompt();
});
$('typing').addEventListener('compositionstart',e=>{composing=true;event('compositionstart',{data:e.data});});
$('typing').addEventListener('compositionupdate',e=>event('compositionupdate',{data:e.data}));
$('typing').addEventListener('compositionend',e=>{composing=false;event('compositionend',{data:e.data});commitText('compositionend');renderPrompt();});
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
  showPractice();
  renderPrompt();
  initStudyUI();
  $('typing').focus({preventScroll:true});
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
  renderRecords();
})();
