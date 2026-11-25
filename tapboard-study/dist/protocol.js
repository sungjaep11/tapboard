const P=TapParagraph, conv=new ConvBoardWindow();
let gate=null;
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
    {ok:false,message:expected+' 조건입니다. '+expected+' 앱의 최신 터치 로그를 연결하세요.'};
}
function setupProtocol() {
  const on=integrated();
  $('typing').readOnly=false;
  $('paragraphSettings').hidden=!on;
  for(const el of ['legacyPrompt','legacyCondition','baselineSetup']) $(el).hidden=on;
  $('convSetup').hidden=!isConv();$('convBrowserSetup').hidden=!browserConv();$('nativeCalibration').hidden=browserConv();
  $('nextPrompt').hidden=on;
  $('connectTouch').hidden=on && browserConv();
  $('touchSwitch').hidden=on;$('thresholdSetup').hidden=on;
  $('touchInfo').textContent=on?(browserConv()?'아래쪽 ConvBoard 창의 멀티터치 좌표와 이동 경로를 기록합니다.':
    '같은 PC의 Windows 앱에서 생성한 문서/TapBoard-Experiments/touch-*.jsonl을 연결하세요.'):
    'Windows 앱의 최신 touch-*.jsonl을 연결하면 실제 접촉과 레스팅을 측정합니다.';
  renderTouchStatus();
  if(!active && !finalizing && on) {
    $('prompt').textContent='';$('typing').value='';$('typing').disabled=true;
    $('progressLabel').textContent='';$('phraseLabel').textContent='문단 입력';
    setCue('문단 입력 준비','조건과 보정값을 설정한 뒤 로깅을 시작하세요.');
  } else if(!active && !finalizing) {showPractice();renderPrompt();}
}
function calibration() {return {widthMm:$('widthMm').valueAsNumber,pitchMm:$('pitchMm').valueAsNumber};}
function prepareParagraph() {
  const code=$('studyCondition').value, c=P.conditions[code], settings=calibration();
  const sentences=$('paragraphText').value.split(/\r?\n/).map(s=>s.trim().normalize('NFC')).filter(Boolean);
  if(!sentences.length) throw new Error('영어 목표 문장을 한 줄에 하나씩 입력하세요.');
  let g;
  if(browserConv()) {
    if(!conv.ready(settings)) throw new Error('보정값을 입력하고 아래 화면에서 ConvBoard 창을 전체 화면으로 여세요.');
    g=conv.geometry;
  } else {
    const status=nativeStudyStatus();
    if(!status.ok) throw new Error(status.message+' · '+c.keyboard+'의 터치 로그를 확인하세요.');
    const meta=touchLink.journal.meta;
    g=P.geometry(meta.widthPx || $('nativeWidth').valueAsNumber,settings.widthMm,settings.pitchMm,true,meta.pitchPx || null);
  }
  return {...c,touchSource:browserConv()?'browser-pointer':'windows-touch',condition:code,geometry:g,home:[],phases:[],sentences:sentences.map((prompt,index)=>({
    index,prompt,text:'',cueMs:null,submittedMs:null})),index:0,restMs:P.restMs,minDurationMs:P.minDurationMs,
    minPathMm:P.minPathMm,distanceDefinition:'sum of consecutive touch sample distances',handRule:'two index fingers only; left/right ordered by initial x'};
}
function studyPhase(name,description) {
  const p=active.paragraph;
  const boundary={name,t:time(),sentence:p.index};
  p.phases.push(boundary);event('phase_change',boundary);
  setPhase(name);conv.typing=name==='typing' && browserTrial(active);
  $('state').textContent=({hands_off:'손 떼기',home:'홈키 찾기',release:'손 들기',inter_rest:'3초 레스팅',typing:'문장 입력',fault:'수집 중단'})[name] || name;
  $('typing').readOnly=name==='typing' && browserTrial(active);
  $('typing').disabled=name!=='typing';$('rest').disabled=true;$('finish').disabled=true;
  $('countdown').textContent='';$('phraseLabel').textContent='문장 '+(p.index+1)+' / '+p.sentences.length;
  setCue($('state').textContent,description);
  renderPrompt();
  return boundary.t;
}
function startParagraph() {
  const p=active.paragraph;
  gate={held:new Map(),lastSeq:-1,seeded:false,pair:null,restStart:null};
  conv.locked=browserTrial(active);conv.caps=false;
  event('keyboard_geometry',{geometry:p.geometry,keyboard:p.keyboard,surface:p.surface});
  $('paragraphSettings').hidden=true;
  studyPhase('hands_off','양손을 키보드 밖에 놓으세요.');
}
function showSentence() {
  const p=active.paragraph, s=p.sentences[p.index];
  const open=active.rests.at(-1);
  if(open && open.end===null) open.end=time();
  active.prompt=s.prompt;active.text='';$('typing').value='';
  s.cueMs=studyPhase('typing','검지를 들고 문장을 입력하세요. Enter로 제출합니다.');
  if(active.cueMs===null) active.cueMs=s.cueMs;
  event('typing_cue',{prompt:s.prompt});
  if(!browserTrial(active)) $('typing').focus();
  persist(active);
}
function submitSentence(submitContact=null) {
  if(!active?.paragraph || phase!=='typing' || composing) return;
  const p=active.paragraph, s=p.sentences[p.index];
  commitText();s.text=active.text;s.submittedMs=time();event('sentence_submit',{text:s.text});
  if(p.index+1===p.sentences.length) {finish();return;}
  p.index++;active.text='';active.prompt='';$('typing').value='';
  gate.pair=null;gate.restStart=null;gate.submitContact=submitContact;
  const start=studyPhase('inter_rest','양 검지만 가볍게 올리고 3초 동안 유지하세요.');
  active.rests.push({start,end:null,kind:'inter_sentence'});
  persist(active);
}
function studyFault(message) {
  if(!active?.paragraph || phase==='fault') return;
  event('touch_failure',{message});active.paragraph.failure=message;
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
    if(e.type==='up' && e.id===gate.submitContact) gate.submitContact=null;
    if(e.type==='up' && !gate.held.delete(e.id)) {studyFault('시작이 없는 접촉이 감지되었습니다.');return;}
    if(e.type==='heartbeat') heartbeat=e;
    const boundary=p.phases.at(-1).t;
    if(e.t<boundary || document.hidden) continue;
    if(phase==='home' && e.type==='down') {
      // Preserve the first two distinct landings, including wrong or blank locations.
      if(!gate.first) gate.first=e;
      else {
        p.home=P.homePoints([gate.first,e],p.geometry);
        event('home_pair',{points:p.home,bothCorrect:p.home.every(h=>h.correct)});
        studyPhase('release','두 검지를 제자리에서 들어 주세요. 첫 문장이 나타납니다.');
      }
    } else if(phase==='inter_rest') {
      const contacts=[...gate.held.values()];
      const submitHeld=c=>p.keyboard==='ConvBoard' && !browserTrial(active) &&
        c.t<=boundary && P.hit(p.geometry,c)?.label==='Enter';
      const pair=contacts.length===2 && contacts.every(c=>c.id!==gate.submitContact && !submitHeld(c)) ? contacts.map(c=>c.seq).join(',') : null;
      if(pair!==gate.pair) {
        if(gate.pair!==null) event('rest_contact_break',{sensorMs:e.t});
        gate.pair=pair;
        // A finger already on the board can rest across Enter. Removing a third
        // contact starts a fresh two-finger interval at that release.
        gate.restStart=pair===null?null:Math.max(boundary,...contacts.map(c=>c.t),e.type==='up'?e.t:0);
        if(pair!==null) event('rest_contact_start',{sensorMs:gate.restStart,contactSeqs:contacts.map(c=>c.seq)});
      }
      if(pair!==null && e.type==='heartbeat') {
        const elapsed=e.t-gate.restStart;
        $('countdown').textContent=(Math.max(0,P.restMs-elapsed)/1000).toFixed(1);
      } else if(pair===null) $('countdown').textContent='3.0';
    }
  }
  // Use the most recent complete contact state in this poll before presenting a cue.
  if(!heartbeat || heartbeat.t<p.phases.at(-1).t || document.hidden) return;
  if(phase==='hands_off' && gate.held.size===0) {
    p.homeCueMs=studyPhase('home','키보드를 보지 않고 F와 J라고 생각하는 곳에 양 검지를 올리세요.');
  } else if(phase==='release' && gate.held.size===0) {
    showSentence();
  } else if(phase==='inter_rest' && gate.restStart!==null && heartbeat.t-gate.restStart>=P.restMs) {
    event('rest_contact_complete',{startSensorMs:gate.restStart,endSensorMs:heartbeat.t});
    showSentence();
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
  event(type,{key,code:label,typingKey:edit,repeat:false,contactId});
  if(type!=='keydown') return;
  if(arrows.includes(key)) {
    const f=$('typing'),n=f.value.length;
    const caret=key==='←'?Math.max(0,f.selectionStart-1):key==='→'?Math.min(n,f.selectionEnd+1):key==='↑'?0:n;
    f.setSelectionRange(caret,caret);return;
  }
  if(!edit) return;
  if(key==='Enter') {submitSentence(contactId);return;}
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
