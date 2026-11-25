const P=TapParagraph, conv=new ConvBoardWindow();
let gate=null, studyRun=null;
// The browser-only keyboard uses this panel's reported visible width. Native apps send their own calibration.
const browserDisplayWidthMm=302, paragraphRestMs=5000;
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
  $('nextPrompt').hidden=on;
  $('connectTouch').hidden=directStudy || on && browserConv();
  $('directPage').hidden=directStudy || on && browserConv();
  $('touchSwitch').hidden=on;$('thresholdSetup').hidden=on;
  $('touchInfo').textContent=on?(browserConv()?'아래쪽 ConvBoard 창의 멀티터치 좌표와 이동 경로를 기록합니다.':
    nativeHelp()):
    nativeHelp();
  renderTouchStatus();
  if(!active && !finalizing && on) {
    $('typing').value='';$('typing').disabled=true;
    previewParagraph();
    setCue('문단 입력 준비','조건과 문단 수를 선택한 뒤 로깅을 시작하세요.');
  } else if(!active && !finalizing) {showPractice();renderPrompt();}
}
function nativeHelp() {
  return directStudy?'실행 중인 키보드 앱에 자동 연결합니다. 앱을 바꿀 때는 현재 회차를 마치고 기존 앱을 종료하세요.':
    '새 Windows 키보드 앱을 실행한 뒤 ‘앱 직접 연결’을 여세요. 파일 방식은 ‘터치 로그 연결’에서 기존 JSONL을 선택하세요.';
}
function paragraphLines() {
  return $('paragraphText').value.split(/\r?\n/).map(s=>s.trim().normalize('NFC')).filter(Boolean);
}
function requestedParagraphs() {
  const count=$('paragraphCount').valueAsNumber;
  if(!Number.isSafeInteger(count) || count<1 || count>100) throw new Error('진행할 문단 수를 1~100 사이의 정수로 입력하세요.');
  return count;
}
function fillParagraphText() {
  if(active || finalizing) return;
  let count;
  try {count=requestedParagraphs();} catch {previewParagraph();return;}
  const lines=paragraphLines();
  const needed=count*3;
  const available=mackenziePhrases.filter(sentence=>!lines.includes(sentence));
  for(let i=0;lines.length<needed;i++) lines.push(available[i]);
  $('paragraphText').value=lines.join('\n');
  previewParagraph();
}
function previewParagraph() {
  if(active || finalizing || !integrated()) return;
  const lines=paragraphLines(), count=$('paragraphCount').valueAsNumber;
  $('prompt').textContent=lines[0] || mackenziePhrases[0];
  $('progressLabel').textContent='';
  $('phraseLabel').textContent='첫 문단 미리보기';
  $('paragraphPlan').textContent=Number.isSafeInteger(count) && count>=1 && count<=100 ?
    count+'문단 · 총 '+count*3+'문장 · 문장 사이 3초 휴식 · 문단 사이 5초 손 떼기':'문단 수를 1~100 사이의 정수로 입력하세요.';
  $('progressBar').style.width='0%';
}
function calibration() {return {widthMm:browserConv()?browserDisplayWidthMm:touchLink.journal.meta?.widthMm,pitchMm:$('pitchMm').valueAsNumber};}
function prepareStudyRun() {
  const total=requestedParagraphs();
  fillParagraphText();
  const lines=paragraphLines();
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
    index,prompt,text:'',cueMs:null,submittedMs:null})),index:0,restMs:P.restMs,paragraphRestMs,
    restPolicy:'timed',displayWidthPx:g.widthPx,minDurationMs:P.minDurationMs,
    minPathMm:P.minPathMm,distanceDefinition:'sum of consecutive touch sample distances',handRule:'two index fingers only; left/right ordered by initial x'};
}
function paragraphProgress(p) {return '문단 '+p.number+' / '+p.count+' · 문장 '+(p.index+1)+' / '+p.sentences.length;}
function studyPhase(name,description) {
  const p=active.paragraph;
  const boundary={name,t:time(),sentence:p.index};
  p.phases.push(boundary);logEvent('phase_change',boundary);
  setPhase(name);conv.typing=name==='typing' && browserTrial(active);
  $('state').textContent=({hands_off:'손 떼기',home:'홈키 찾기',release:'손 들기',inter_rest:'3초 휴식',paragraph_rest:'5초 손 떼기',typing:'문장 입력',fault:'수집 중단'})[name] || name;
  $('typing').readOnly=name==='typing' && browserTrial(active);
  $('typing').disabled=name!=='typing';$('rest').disabled=true;$('finish').disabled=true;
  $('countdown').textContent='';$('phraseLabel').textContent=paragraphProgress(p);
  setCue($('state').textContent,description);
  renderPrompt();
  return boundary.t;
}
function startParagraph() {
  const p=active.paragraph;
  gate={held:new Map(),lastSeq:-1,seeded:false};
  conv.locked=browserTrial(active);conv.caps=false;
  logEvent('keyboard_geometry',{geometry:p.geometry,keyboard:p.keyboard,surface:p.surface});
  $('paragraphSettings').hidden=true;
  if(p.number>1) {
    const start=studyPhase('paragraph_rest','양손을 키보드에서 떼고 5초 동안 쉬세요. 다음 문단을 준비합니다.');
    active.rests.push({start,end:null,kind:'inter_paragraph'});
    logEvent('rest_start',{kind:'inter_paragraph',plannedMs:paragraphRestMs});
    $('countdown').textContent='5.0';
  } else studyPhase('hands_off','양손을 키보드 밖에 놓으세요.');
}
function showSentence() {
  const p=active.paragraph, s=p.sentences[p.index];
  const open=active.rests.at(-1);
  if(open && open.end===null) {open.end=time();logEvent('rest_end',{kind:open.kind,duration_ms:open.end-open.start});}
  active.prompt=s.prompt;active.text='';$('typing').value='';
  s.cueMs=studyPhase('typing','문장을 입력하세요. Enter로 제출합니다.');
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
  if(!active?.paragraph || phase==='fault') return;
  logEvent('touch_failure',{message});active.paragraph.failure=message;
  studyPhase('fault',message+' 중단을 눌러 현재 기록을 저장하세요.');persist(active);
}
function processStudyTouch() {
  if(!active?.paragraph || phase==='fault') return;
  const p=active.paragraph, touch=active.touch;
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
  let heartbeat=null;
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
    if(e.type==='heartbeat') heartbeat=e;
    const boundary=p.phases.at(-1).t;
    if(e.t<boundary || document.hidden) continue;
    if(phase==='home' && e.type==='down') {
      // Preserve the first two distinct landings, including wrong or blank locations.
      if(!gate.first) gate.first=e;
      else {
        p.home=P.homePoints([gate.first,e],p.geometry);
        logEvent('home_pair',{points:p.home,bothCorrect:p.home.every(h=>h.correct)});
        studyPhase('release','두 검지를 제자리에서 들어 주세요. 첫 문장이 나타납니다.');
      }
    }
  }
  // Use the most recent complete contact state in this poll before presenting a cue.
  if(!heartbeat || heartbeat.t<p.phases.at(-1).t || document.hidden) return;
  if(phase==='hands_off' && gate.held.size===0) {
    p.homeCueMs=studyPhase('home','키보드를 보지 않고 F와 J라고 생각하는 곳에 양 검지를 올리세요.');
  } else if(phase==='release' && gate.held.size===0) {
    showSentence();
  }
}
function advanceStudyTimer(now=time()) {
  if(!active?.paragraph || !['inter_rest','paragraph_rest'].includes(phase) || document.hidden) return;
  const duration=phase==='inter_rest'?P.restMs:paragraphRestMs;
  const left=Math.max(0,duration-(now-active.paragraph.phases.at(-1).t));
  $('countdown').textContent=(left/1000).toFixed(1);
  if(left>0) return;
  if(phase==='inter_rest') showSentence();
  else {
    const rest=active.rests.at(-1);
    rest.end=now;logEvent('rest_end',{kind:rest.kind,duration_ms:now-rest.start});
    studyPhase('hands_off','양손을 키보드 밖에 놓으세요. 다음 홈키 신호를 기다리세요.');
    persist(active);
  }
}
function convKey(label,shift,caps,type,contactId) {
  if(!active?.paragraph || phase!=='typing' || !conv.typing) return;
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
  if(key==='Enter') {submitSentence();return;}
  const field=$('typing');
  let start=field.selectionStart,end=field.selectionEnd;
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
  $('paragraphText').oninput=previewParagraph;
  $('paragraphCount').oninput=fillParagraphText;
  $('paragraphCount').onchange=fillParagraphText;
  $('convSource').onchange=setupProtocol;
  $('studyCondition').onchange=()=>{$('mapCondition').value=$('studyCondition').value;setupProtocol();renderMaps();};
  $('openConv').onclick=()=>{
    try {const s=calibration();P.geometry(1000,s.widthMm,s.pitchMm,false);conv.open(s,convKey,studyFault);}
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
    if(!active?.paragraph || composing || e.isComposing || e.keyCode===229) return;
    if(phase==='typing' && !browserTrial(active) && e.target===$('typing') && e.key==='Enter') {
      e.preventDefault();if(!e.repeat) submitSentence();
    } else if(phase!=='typing' && e.target!==$('abort')) e.preventDefault();
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden && active?.paragraph) studyFault('실험 화면이 숨겨졌습니다.');
  });
  window.addEventListener('pagehide',()=>{if(conv.win && !conv.win.closed) conv.win.close();});
  setupProtocol();
}
