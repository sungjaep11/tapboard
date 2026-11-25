const P=TapParagraph, conv=new ConvBoardWindow();
let studyTouchState=null, studyRun=null, paragraphPracticeIndex=0;
// The browser-only keyboard uses this panel's reported visible width. Native apps send their own calibration.
const browserDisplayWidthMm=302, startCountdownMs=5000;
const integrated=()=>$('protocol').value==='paragraph';
const isConv=()=>P.conditions[$('studyCondition').value].keyboard==='ConvBoard';
const browserConv=()=>isConv() && $('convSource').value==='browser';
const browserTrial=trial=>trial?.paragraph?.touchSource==='browser-pointer';
const studyLink=trial=>browserTrial(trial)?conv:touchLink;
function nativeStudyStatus() {
  const state=touchLink.status();
  if(!state.ok || !integrated()) return state;
  // Journals written before the source marker was introduced came from TapBoard+.
  const actual=touchLink.journal.meta.keyboard ?? 'TapBoard+';
  const expected=P.conditions[$('studyCondition').value].keyboard;
  return actual===expected?{...state,message:actual+' · 실시간 연결됨'}:
    {ok:false,message:expected+' 조건입니다. '+expected+' 앱을 실행하고 터치 연결을 확인하세요.'};
}
function setupProtocol() {
  const on=integrated();
  $('typing').readOnly=false;
  $('paragraphSettings').hidden=!on;
  for(const el of ['legacyPrompt','legacyCondition','baselineSetup']) $(el).hidden=on;
  $('convSetup').hidden=!isConv();$('convBrowserSetup').hidden=!browserConv();
  $('nextPrompt').hidden=on && (!!active || !!pendingStart);
  $('connectTouch').hidden=directStudy || on && browserConv();
  $('directPage').hidden=directStudy || on && browserConv();
  $('touchSwitch').hidden=on;$('thresholdSetup').hidden=on;
  $('touchInfo').textContent=on?(browserConv()?'아래쪽 ConvBoard 창의 멀티터치 좌표와 이동 경로를 기록합니다.':
    nativeHelp()):
    nativeHelp();
  renderTouchStatus();
  if(!active && !pendingStart && !finalizing && on) {
    paragraphPracticeIndex=0;
    $('typing').value='';$('typing').disabled=false;
    if(phase!=='done') showPractice();
    conv.typing=browserConv();
    previewParagraph();
    setCue('바로 타이핑하세요','Enter로 다음 연습 문장으로 넘어갑니다. 로깅을 시작하면 5초 준비 후 첫 문단부터 기록합니다.');
  } else if(!active && !pendingStart && !finalizing) {showPractice();renderPrompt();}
}
function nativeHelp() {
  return directStudy?'실행 중인 키보드 앱에 자동 연결합니다. 앱을 바꿀 때는 현재 회차를 마치고 기존 앱을 종료하세요.':
    '새 Windows 키보드 앱을 실행한 뒤 ‘앱 직접 연결’을 여세요. 파일 방식은 ‘터치 로그 연결’에서 기존 JSONL을 선택하세요.';
}
function paragraphPractice() {
  const index=paragraphPracticeIndex%mackenziePhrases.length;
  return {prompt:mackenziePhrases[index],index,total:mackenziePhrases.length};
}
function requestedParagraphs() {
  const count=$('paragraphCount').valueAsNumber;
  if(!Number.isSafeInteger(count) || count<1 || count>100) throw new Error('진행할 문단 수를 1~100 사이의 정수로 입력하세요.');
  return count;
}
function previewParagraph() {
  if(active || pendingStart || finalizing || !integrated()) return;
  const count=$('paragraphCount').valueAsNumber;
  $('paragraphPlan').textContent=Number.isSafeInteger(count) && count>=1 && count<=100 ?
    count+'문단 · 총 '+count*3+'문장 · 문단 시작 전 5초 준비 · 문장 사이 3초 휴식':'문단 수를 1~100 사이의 정수로 입력하세요.';
  renderPrompt();
}
function calibration() {return {widthMm:browserConv()?browserDisplayWidthMm:touchLink.journal.meta?.widthMm,pitchMm:$('pitchMm').valueAsNumber};}
function prepareStudyRun() {
  const total=requestedParagraphs();
  const lines=mackenziePhrases.slice(0,total*3);
  return {id:id(),index:0,total,paragraphs:Array.from({length:total},(_,i)=>lines.slice(i*3,i*3+3))};
}
function prepareParagraph(run) {
  const code=$('studyCondition').value, c=P.conditions[code], settings=calibration();
  const sentences=run.paragraphs[run.index];
  let g;
  if(browserConv()) {
    if(!conv.ready(settings)) throw new Error('아래 화면에서 ConvBoard 창을 전체 화면으로 여세요.');
    g=conv.geometry;
  } else {
    const status=nativeStudyStatus();
    if(!status.ok) throw new Error(status.message+' · '+(directStudy?c.keyboard+' 앱과 선택한 조건을 확인하세요.':c.keyboard+' 앱의 직접 연결 페이지를 열거나 터치 로그를 연결하세요.'));
    const meta=touchLink.journal.meta;
    // Native touch coordinates use physical pixels, independent of the upper browser's DPI/zoom.
    if(!Number.isSafeInteger(meta.widthPx) || meta.widthPx<=0)
      throw new Error('키보드 화면의 가로 해상도를 읽을 수 없습니다. 최신 키보드 앱을 실행하고 다시 연결하세요.');
    if(!Number.isFinite(settings.widthMm) || settings.widthMm<=0)
      throw new Error('키보드 앱의 화면 보정값(mm)이 없습니다. 최신 키보드 앱을 실행하고 다시 연결하세요.');
    g=P.geometry(meta.widthPx,settings.widthMm,settings.pitchMm,true,meta.pitchPx || null);
  }
  return {...c,runId:run.id,number:run.index+1,count:run.total,
    touchSource:browserConv()?'browser-pointer':'windows-touch',condition:code,geometry:g,home:[],phases:[],sentences:sentences.map((prompt,index)=>({
    index,prompt,text:'',cueMs:null,submittedMs:null})),index:0,restMs:P.restMs,startCountdownMs,homeTask:'none',
    restPolicy:'timed',displayWidthPx:g.widthPx,minDurationMs:P.minDurationMs,
    minPathMm:P.minPathMm,distanceDefinition:'sum of consecutive touch sample distances'};
}
function startCountdown(paragraph,prompt) {
  pendingStart={paragraph,prompt,deadline:performance.now()+startCountdownMs,
    sourceSessionId:studyLink({paragraph}).journal.meta.sessionId};
  composing=false;$('typing').value='';
  conv.locked=browserTrial(pendingStart);conv.typing=false;conv.caps=false;
  setPhase('countdown');
  $('paragraphSettings').hidden=true;
  $('trialLabel').textContent=`TRIAL ${String(records.length+1).padStart(2,'0')}`;
  $('elapsed').textContent='00:00.0';
  for(const name of ['wpm','accuracy','latency']) $(name).textContent='—';
  for(const name of ['restMetric','idleMetric']) $(name).textContent='0.0';
  $('physicalRest').textContent='— s';
  setCue('5초 뒤 시작합니다','손을 키보드에서 떼고 기다려 주세요. 타이머가 끝나면 문장이 나타나고 기록을 시작합니다.','Ⅱ',true);
  $('countdown').textContent='5';
  renderPrompt();renderRecords();
}
function cancelStart(message='') {
  pendingStart=null;studyRun=null;conv.locked=false;conv.typing=false;
  composing=false;$('typing').value='';$('countdown').textContent='';
  setPhase('ready');setupProtocol();renderRecords();
  if(message) startProblem(message);
  else setCue('시작을 취소했습니다','준비 시간은 기록되지 않았습니다. 바로 연습하거나 로깅을 다시 시작할 수 있습니다.');
}
function advanceStartCountdown() {
  if(!pendingStart) return;
  if(document.hidden) {cancelStart('실험 화면이 숨겨져 시작을 취소했습니다. 화면을 열고 다시 시작하세요.');return;}
  const left=Math.max(0,pendingStart.deadline-performance.now());
  $('countdown').textContent=String(Math.ceil(left/1000));
  if(left>0) return;
  const prepared=pendingStart;
  try {
    // Recheck the keyboard after preparation; never record against a changed source.
    const paragraph=prepareParagraph(studyRun), journal=studyLink(prepared).journal;
    if(journal.meta.sessionId!==prepared.sourceSessionId || journal.integrityFault || journal.error || journal.ended)
      throw new Error('준비 중 키보드 연결이 바뀌거나 끊겼습니다. 연결을 확인하고 다시 시작하세요.');
    prepared.paragraph=paragraph;
  } catch(error) {cancelStart(error.message);return;}
  pendingStart=null;
  beginRecording(prepared.paragraph,prepared.prompt);
}
function paragraphProgress(p) {return '문단 '+p.number+' / '+p.count+' · 문장 '+(p.index+1)+' / '+p.sentences.length;}
function studyPhase(name,description) {
  const p=active.paragraph;
  const boundary={name,t:time(),sentence:p.index};
  p.phases.push(boundary);logEvent('phase_change',boundary);
  setPhase(name);conv.typing=name==='typing' && browserTrial(active);
  $('state').textContent=({inter_rest:'3초 휴식',typing:'문장 입력',fault:'수집 중단'})[name] || name;
  $('typing').readOnly=name==='typing' && browserTrial(active);
  $('typing').disabled=name!=='typing';$('rest').disabled=true;$('finish').disabled=true;
  $('countdown').textContent='';$('phraseLabel').textContent=paragraphProgress(p);
  setCue($('state').textContent,description);
  renderPrompt();
  return boundary.t;
}
function startParagraph() {
  const p=active.paragraph;
  studyTouchState={held:new Map(),lastSeq:-1,seeded:false};
  conv.locked=browserTrial(active);conv.caps=false;
  logEvent('keyboard_geometry',{geometry:p.geometry,keyboard:p.keyboard,surface:p.surface});
  $('paragraphSettings').hidden=true;
  showSentence();
}
function showSentence() {
  const p=active.paragraph, s=p.sentences[p.index];
  const open=active.rests.at(-1);
  if(open && open.end===null) {open.end=time();logEvent('rest_end',{kind:open.kind,duration_ms:open.end-open.start});}
  active.prompt=s.prompt;active.text='';$('typing').value='';
  s.cueMs=studyPhase('typing','문장을 정확히 다 입력한 뒤 스페이스바로 넘기세요. Enter로도 제출할 수 있습니다.');
  if(active.cueMs===null) active.cueMs=s.cueMs;
  logEvent('typing_cue',{prompt:s.prompt});
  if(!browserTrial(active)) $('typing').focus();
  persist(active);
}
function submitSentence() {
  if(!active?.paragraph || phase!=='typing' || composing) return;
  const p=active.paragraph, s=p.sentences[p.index];
  commitText();s.text=active.text;s.submittedMs=time();logEvent('sentence_submit',{text:s.text});
  if(p.index+1===p.sentences.length) {finish();return;}
  p.index++;active.text='';active.prompt='';$('typing').value='';
  const start=studyPhase('inter_rest','3초 동안 쉬세요. 시간이 끝나면 다음 문장이 자동으로 나타납니다.');
  $('countdown').textContent='3.0';
  logEvent('rest_start',{kind:'inter_sentence',plannedMs:P.restMs});
  active.rests.push({start,end:null,kind:'inter_sentence'});
  persist(active);
}
function studyFault(message) {
  if(pendingStart) {cancelStart(message+' 준비를 취소했습니다. 연결을 확인하고 다시 시작하세요.');return;}
  if(!active?.paragraph || phase==='fault') return;
  logEvent('touch_failure',{message});active.paragraph.failure=message;
  studyPhase('fault',message+' 중단을 눌러 현재 기록을 저장하세요.');persist(active);
}
function processStudyTouch() {
  if(!active?.paragraph || phase==='fault') return;
  const touch=active.touch, gate=studyTouchState;
  if(!touch) return;
  if((browserTrial(active) && (!conv.win || conv.win.closed)) ||
      (!browserTrial(active) && !touchLink.status().ok) || studyLink(active).journal.integrityFault || touch.invalidFromMs!=null) {
    studyFault('터치 연결 또는 시각 동기화가 끊겼습니다.');return;
  }
  if(!gate.seeded) {
    // A file flush may deliver pre-trial downs after the first browser poll.
    if(!touch.events.some(e=>e.type==='heartbeat' && e.t>=0 && e.t<=time())) return;
    for(const e of touch.seed) gate.held.set(e.id,e);
    gate.seeded=true;
  }
  for(const e of touch.events) {
    if(e.seq<=gate.lastSeq || e.t>time()) continue;
    gate.lastSeq=e.seq;
    if(['reset','gap','end','NATIVE_ERROR'].includes(e.type) || e.clockDrift) {
      studyFault('터치 원자료가 끊겼습니다.');return;
    }
    if(e.type==='down') {
      if(gate.held.has(e.id)) {studyFault('접촉 ID가 중복되었습니다.');return;}
      gate.held.set(e.id,e);
    }
    if(e.type==='up' && !gate.held.delete(e.id)) {studyFault('시작이 없는 접촉이 감지되었습니다.');return;}
  }
}
function advanceStudyTimer(now=time()) {
  if(!active?.paragraph || phase!=='inter_rest' || document.hidden) return;
  const left=Math.max(0,P.restMs-(now-active.paragraph.phases.at(-1).t));
  $('countdown').textContent=(left/1000).toFixed(1);
  if(left>0) return;
  showSentence();
}
function convKey(label,shift,caps,type,contactId) {
  const practicing=!active && !pendingStart && !finalizing && integrated() && browserConv();
  if(!conv.typing || !practicing && (!active?.paragraph || phase!=='typing')) return;
  if(practicing && phase==='done') showPractice();
  const plain="`1234567890-=[]\\;',./", shifted='~!@#$%^&*()_+{}|:"<>?';
  let key=label;
  if(/^[a-z]$/.test(key)) key=shift!==caps?key.toUpperCase():key;
  else if(shift && key.length===1 && plain.includes(key)) key=shifted[plain.indexOf(key)];
  if(key==='Space') key=' ';
  const arrows=['←','→','↑','↓'];
  const edit=['Backspace','Del','Enter'].includes(key) || key.length===1 && !['↑','↓','←','→','⏻'].includes(key);
  logEvent(type,{key,code:label,typingKey:edit,repeat:false,contactId});
  if(type!=='keydown') return;
  if(arrows.includes(key)) {
    const f=$('typing'),n=f.value.length;
    const caret=key==='←'?Math.max(0,f.selectionStart-1):key==='→'?Math.min(n,f.selectionEnd+1):key==='↑'?0:n;
    f.setSelectionRange(caret,caret);return;
  }
  if(!edit) return;
  if(key==='Enter') {if(practicing) nextPrompt();else submitSentence();return;}
  const field=$('typing');
  let start=field.selectionStart,end=field.selectionEnd;
  if(key===' ' && !shift && !composing && promptCompleteAtEnd(field,practicing?promptText():active.prompt)) {
    if(practicing) nextPrompt();else submitSentence();return;
  }
  const deleting=key==='Backspace'||key==='Del';
  if(deleting && start===end) {
    if(key==='Backspace') start=Math.max(0,start-1);
    else end=Math.min(field.value.length,end+1);
  }
  field.setRangeText(deleting?'':key,start,end,'end');
  commitText(deleting?(key==='Del'?'deleteContentForward':'deleteContentBackward'):'insertText');
  renderPrompt();
}
function initStudyUI() {
  $('protocol').onchange=setupProtocol;
  $('paragraphCount').oninput=previewParagraph;
  $('paragraphCount').onchange=previewParagraph;
  $('convSource').onchange=setupProtocol;
  $('studyCondition').onchange=()=>{$('mapCondition').value=$('studyCondition').value;setupProtocol();renderMaps();};
  $('openConv').onclick=()=>{
    try {const s=calibration();P.geometry(1000,s.widthMm,s.pitchMm,false);conv.open(s,convKey,studyFault);conv.typing=!active && !pendingStart && !finalizing;}
    catch(e){notify(e.message);}
  };
  $('mapCondition').onchange=renderMaps;
  $('mapKind').onchange=renderMaps;
  $('mapFile').onchange=async e=>{
    const file=e.target.files[0];if(!file) return;
    try {
      const data=JSON.parse(await file.text());
      if(data.schema!=='tapboard-study/v1' || !Array.isArray(data.trials)) throw new Error('전체 JSON 파일을 선택하세요.');
      const trials=data.trials.filter(r=>r.paragraph);
      for(const r of trials) {
        if(!P.conditions[r.condition] || !Array.isArray(r.paragraph.phases) || !Array.isArray(r.paragraph.home) ||
          !Array.isArray(r.paragraph.geometry?.keys) || !(r.paragraph.geometry?.pitchPx>0) ||
          !(r.paragraph.geometry?.mmPerPx>0) || !Array.isArray(r.touch?.events) && r.status==='completed')
          throw new Error('문단 또는 좌표 정보가 올바르지 않습니다.');
      }
      importedMaps={name:file.name,trials};renderMaps();
    } catch(error) {notify(error.message);}
    e.target.value='';
  };
  $('localMaps').onclick=()=>{importedMaps=null;renderMaps();};
  for(const [button,canvas,kind] of [['saveHome','homeMap','home'],['saveStrokes','strokeMap','strokes']])
    $(button).onclick=()=>$(canvas).toBlob(blob=>{if(blob)download('tapboard-'+$('mapCondition').value+'-'+kind+'.png',blob,'image/png');});
  document.addEventListener('keydown',e=>{
    if(pendingStart) {if(e.target!==$('abort')) e.preventDefault();return;}
    if(!active?.paragraph || composing || e.isComposing || e.keyCode===229) return;
    if(phase==='typing' && !browserTrial(active) && e.target===$('typing')) {
      const space=e.key===' ' && !(e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) &&
        (promptCompleteAtEnd($('typing'),active.prompt) || e.repeat && $('typing').value==='');
      if(e.key==='Enter' || space) {e.preventDefault();if(!e.repeat) submitSentence();}
    } else if(phase!=='typing' && e.target!==$('abort')) e.preventDefault();
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden && pendingStart) cancelStart('실험 화면이 숨겨져 시작을 취소했습니다. 화면을 열고 다시 시작하세요.');
    if(document.hidden && active?.paragraph) studyFault('실험 화면이 숨겨졌습니다.');
  });
  window.addEventListener('pagehide',()=>{if(conv.win && !conv.win.closed) conv.win.close();});
  setupProtocol();
}
