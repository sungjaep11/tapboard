const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const P=require('../dist/paragraph.js'), M=require('../dist/metrics.js');
const FIRST_PHRASE='my watch fell in the water';
const SECOND_PHRASE='prevailing wind from the east';
const THIRD_PHRASE='never too rich and never too thin';

test('physical layout, swapped landing order and a miss retain calibrated target distances',()=>{
  const g=P.geometry(1536,307.2,19.5,true);
  assert.equal(g.pitchPx,98);assert.ok(Math.abs(g.mmPerPx-.2)<1e-10);
  const at=label=>{const k=g.keys.find(k=>k.label===label);return {x:k.x+k.w/2,y:k.y+k.h/2};};
  const [left,right]=P.homePoints([{...at('j'),id:3,t:1},{...at('d'),id:4,t:2}],g);
  assert.equal(left.target,'f');assert.equal(left.actual,'d');assert.ok(Math.abs(left.deviationMm-19.6)<1e-9);
  assert.equal(right.actual,'j');assert.equal(right.correct,true);
  assert.throws(()=>P.geometry(0,300,19.5,true));
});
test('paths use cumulative distance and strict limits and never bridge rests, missing coverage or reused IDs',()=>{
  const phases=[{name:'typing',t:0,sentence:0},{name:'inter_rest',t:2000,sentence:1},{name:'typing',t:5000,sentence:1}];
  const events=[];
  const add=(type,t,x,id=1)=>events.push({type,t,x,y:5,id});
  add('down',0,0);add('move',250,1.1);add('up',500,0); // 2.2 mm, zero displacement
  add('down',520,0);add('up',920,9); // exactly 400ms
  add('down',1000,0);add('up',1500,1.9);
  add('down',1600,0);add('up',2100,10);
  add('down',2200,0);add('up',5100,10);
  add('down',5200,0);add('up',5900,10);
  add('down',6100,0);add('reset',6300,0);add('up',6800,10);
  const trial={paragraph:{geometry:{mmPerPx:1},phases},touch:{events},metrics:{touch_coverage_intervals:[[0,5400],[5800,7000]]}};
  const s=P.strokes(trial);assert.equal(s.length,1);assert.equal(s[0].mm,2.2);
  assert.equal(s[0].durationMs,500);assert.equal(s[0].sentence,0);
});
test('sentence timings exclude the rest and first character includes corrected mistakes',()=>{
  const sentences=[{index:0,prompt:'ab',text:'ab',cueMs:100,submittedMs:600},{index:1,prompt:'cd',text:'cd',cueMs:4100,submittedMs:4800}];
  const trial={paragraph:{sentences},config:{idleMs:2000},events:[]};
  for(const [sentence,t,after,added] of [[0,200,'x',1],[0,230,'',0],[0,300,'a',1],[0,500,'ab',1],[1,4400,'c',1],[1,4700,'cd',1]])
    trial.events.push({type:'text_commit',sentence,phase:'typing',t,after,added,removed:added?0:1});
  const [a,b]=P.sentenceMetrics(trial,M);
  assert.equal(a.firstCharacter,'x');assert.equal(a.transcription_ms,300);assert.equal(b.transcription_ms,300);
  assert.equal(b.first_text_after_cue_ms,300);
});

// Run the public standalone scripts with deterministic DOM, sensor and time inputs.
// This exercises the same buttons, start/submit functions, exports and map drawing as the offline file.
function lab(code,source='browser',journalKeyboard=null,autostart=true,direct=false) {
  const html=fs.readFileSync(path.join(__dirname,'../../tapboard-test.html'),'utf8');
  const elements=new Map(), timers=[];
  class Element {
    constructor(){this.checked=false;this.value='';this.classList={toggle(){}};this.events={};this.style={};this.width=1050;this.height=385;this.selectionStart=0;this.selectionEnd=0;this.hidden=false;}
    get value(){return this._value || '';}
    set value(value){this._value=String(value);this.selectionStart=this.selectionEnd=this._value.length;}
    get valueAsNumber(){return this.value===''?NaN:Number(this.value);}
    focus(){} append(...nodes){this.textContent=(this.textContent||'')+nodes.map(n=>n.textContent||'').join('');}
    replaceChildren(...nodes){this.textContent='';this.append(...nodes);} remove(){} reportValidity(){return true;}
    addEventListener(name,fn){(this.events[name]??=[]).push(fn);}
    getContext(){return {fillRect(){},strokeRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},fillText(){}};}
    setRangeText(str,start,end){this.value=this.value.slice(0,start)+str+this.value.slice(end);this.selectionStart=this.selectionEnd=start+str.length;}
  }
  const document=new Element();
  document.body=new Element();document.createElement=()=>new Element();document.createDocumentFragment=document.createElement;
  for(const match of html.matchAll(/\bid="([^"]+)"/g)) elements.set(match[1],new Element());
  document.getElementById=id=>elements.get(id);
  for(const [id,value] of Object.entries({protocol:'paragraph',convSource:source,studyCondition:code,mapCondition:code,mapKind:'measured',paragraphCount:'1',pitchMm:'19.5',participant:'P1',block:'1',trialKind:'measured',language:'en',restSeconds:'3',idleSeconds:'2',touchThreshold:'300'})) elements.get(id).value=value;
  const ctx=vm.createContext({document,console,Intl,window:null,Element,performance:{now:()=>ctx.clockOffset+ctx.clock,timeOrigin:100000},
    sensorKeyboard:journalKeyboard ?? (source==='native' && ['A','B'].includes(code)?'ConvBoard':'TapBoard+'),clock:0,clockOffset:0,Date:class extends Date {static now(){return 100000+ctx.clockOffset+ctx.clock;}},
    setInterval:(fn,ms)=>{timers.push({fn,ms});},setTimeout:fn=>{fn();},clearInterval(){},crypto:require('node:crypto').webcrypto,
    timerTick:()=>timers.find(timer=>timer.ms===100).fn(),
    Blob,URL,TextDecoder,navigator:{userAgent:'test'},screen:{width:1550,height:900},innerWidth:1550,innerHeight:900,devicePixelRatio:1,
    indexedDB:{open(){return {}; }},addEventListener(){}});
  ctx.window=ctx;
  if(direct) Object.assign(ctx,{location:{origin:'http://127.0.0.1:47831'},AbortController,clearTimeout(){}});
  const run=code=>vm.runInContext(code,ctx);
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) run(match[1]);
  run(`db={transaction(){const tx={objectStore(){return {put(){queue(tx)}}}};return tx}};
       const queue=tx=>Promise.resolve().then(()=>tx.oncomplete());
       const j=new TapTouch.Journal();
       j.feed(JSON.stringify({schema:'tapboard-touch/v1',type:'session',seq:0,t:0,sessionId:'s',keyboard:sensorKeyboard,widthPx:1280,widthMm:300,pitchPx:83,startedUnixMs:100000})+'\\n');
       function feed(type,t,id=0,x=0,y=0){clock=t;const e={seq:j.lastSeq+1,type,t:t+clockOffset,id,x,y,keyType:'TAPPER'};
         if(type==='heartbeat')e.wallUnixMs=Date.now();j.feed(JSON.stringify(e)+'\\n');}
       feed('heartbeat',0);
       touchLink.journal=j;touchLink.handle={};touchLink.poll=async()=>{};
       conv.win={closed:false,document:{fullscreenElement:{}},innerHeight:900};
       conv.settings=calibration();conv.geometry=P.geometry(1280,browserDisplayWidthMm,19.5,false);conv.journal=j;
       function tick(type,t,id=0,x=0,y=0){feed(type,t,id,x,y);if(pendingStart)timerTick();if(active){captureTouch(active,time());processStudyTouch();advanceStudyTimer(time());}}
       // Complete the initial countdown with live heartbeats, then express test times from its end.
       // Both clocks and sensor timestamps keep advancing monotonically across the rebasing.
       function ready(){if(!pendingStart)return;const end=pendingStart.deadline-clockOffset;
         while(clock<end)tick('heartbeat',Math.min(clock+1000,end));
         clockOffset+=clock;clock=0;}
       function typeChar(c){if(browserTrial(active))convKey(c,false,false,'keydown',4);
         else {$('typing').value+=c;commitText('insertText');}}
       `);
  if(autostart) run("$('start').onclick();ready()");
  return {run,elements};
}
test('paragraph setup uses MacKenzie without a sentence editor and explains blocked starts',()=>{
  const {run,elements}=lab('C','native',null,false);
  assert.equal(elements.has('paragraphText'),false);
  assert.equal(elements.get('prompt').textContent,FIRST_PHRASE);
  run("touchLink.handle=null;$('start').onclick()");
  assert.equal(elements.get('prompt').textContent,FIRST_PHRASE);
  assert.match(elements.get('cueText').textContent,/연결/);
  assert.equal(run('active'),null);
  assert.equal(elements.has('widthMm'),false);assert.equal(elements.has('nativeWidth'),false);
  run("touchLink.handle={};$('start').onclick()");
  assert.equal(run('phase'),'countdown');assert.equal(elements.get('prompt').textContent,'');
  assert.equal(run('active'),null);
  run('ready()');
  assert.equal(run('active.paragraph.geometry.widthMm'),300);
  assert.equal(run('active.paragraph.geometry.widthPx'),1280);
  assert.equal(run('phase'),'typing');
  assert.equal(elements.get('prompt').textContent,FIRST_PHRASE);
});
test('single sentence logging starts with a visible prompt without a native keyboard',()=>{
  const {run,elements}=lab('C','native',null,false);
  run("$('protocol').value='single';$('protocol').onchange();touchLink.handle=null;$('restSeconds').value='0';$('start').onclick()");
  assert.equal(run('phase'),'typing');
  assert.equal(elements.get('prompt').textContent,'my watch fell in the water');
  assert.equal(run('active.config.touchEnabled'),false);
});
test('the five-second timer starts recording exactly at the cue and excludes preparation input and touch',()=>{
  const {run,elements}=lab('C','native',null,false);
  run("$('start').onclick()");
  assert.equal(elements.get('countdown').textContent,'5');
  assert.equal(elements.get('typing').disabled,true);
  assert.equal(elements.get('settings').disabled,true);
  assert.equal(elements.get('abort').disabled,false);
  assert.equal(run('active'),null);
  assert.equal(run('snapshotRecords().length'),0);
  run("tick('down',100,1);tick('up',200,1);logEvent('keydown',{key:'x'});$('nextPrompt').onclick()");
  for(let seconds=1;seconds<=4;seconds++) {
    run(`tick('heartbeat',${seconds*1000})`);
    assert.equal(elements.get('countdown').textContent,String(5-seconds));
    assert.equal(run('active'),null);
    assert.equal(elements.get('prompt').textContent,'');
  }
  run("tick('heartbeat',4999);$('start').onclick()");
  assert.equal(run('phase'),'countdown');
  assert.equal(run('pendingStart.deadline'),5000);
  assert.equal(run('snapshotRecords().length'),0);
  run("tick('heartbeat',5000)");
  assert.equal(run('phase'),'typing');
  assert.equal(run('pendingStart'),null);
  assert.equal(elements.get('prompt').textContent,FIRST_PHRASE);
  assert.equal(elements.get('typing').disabled,false);
  assert.equal(elements.get('countdown').textContent,'');
  assert.equal(run('active.startedUnix'),105000);
  assert.equal(run('active.cueMs'),0);
  assert.equal(run('active.paragraph.phases[0].name'),'typing');
  assert.equal(run('active.paragraph.phases[0].t'),0);
  assert.equal(run('active.paragraph.homeTask'),'none');
  assert.equal(run('active.paragraph.home.length'),0);
  assert.equal(run('active.rests.length'),0);
  assert.equal(run('active.events.every(e=>e.t>=0)'),true);
  assert.equal(run("active.events.some(e=>e.type==='keydown'||e.type==='home_pair')"),false);
  run(`tick('down',5020,2);clock=5025;
    for(const handler of $('typing').events.keydown)handler({key:'a',code:'KeyA',repeat:false});
    typeChar('a');tick('up',5100,2);tick('heartbeat',5150)`);
  assert.equal(run('summary(active,time()).first_key_after_cue_ms'),25);
  assert.equal(run('summary(active,time()).first_text_after_cue_ms'),25);
  assert.equal(run('summary(active,time()).duration_ms'),150);
  assert.equal(run('active.touch.seed.length'),0);
  assert.equal(run("active.touch.events.filter(e=>['down','up'].includes(e.type)).every(e=>e.id===2 && e.t>=0)"),true);
});

test('the countdown never waits for F/J contacts or for a contact release',()=>{
  const {run}=lab('C','native',null,false);
  run("$('start').onclick();tick('down',100,7);ready()");
  assert.equal(run('phase'),'typing');
  assert.equal(run('active.touch.seed.length'),1);
  assert.equal(run('active.paragraph.home.length'),0);
  run("tick('up',20,7);tick('heartbeat',100)");
  assert.equal(run('phase'),'typing');
  assert.equal(run('active.paragraph.failure'),undefined);
});

test('canceling and restarting preparation creates no empty trial and resets the full countdown',async()=>{
  const {run,elements}=lab('A','browser',null,false);
  run("$('start').onclick();tick('heartbeat',1000)");
  await run("$('abort').onclick()");
  assert.equal(run('pendingStart'),null);
  assert.equal(run('active'),null);
  assert.equal(run('records.length'),0);
  assert.equal(run('studyRun'),null);
  assert.equal(run('conv.locked'),false);
  assert.equal(run('conv.typing'),true);
  assert.equal(elements.get('typing').disabled,false);
  assert.equal(elements.get('settings').disabled,false);
  run("$('start').onclick();tick('heartbeat',2000);tick('heartbeat',3000);tick('heartbeat',4000);tick('heartbeat',5000)");
  assert.equal(run('phase'),'countdown');
  assert.equal(elements.get('countdown').textContent,'1');
  run("tick('heartbeat',6000)");
  assert.equal(run('phase'),'typing');
  assert.equal(run('active.startedUnix'),106000);
  assert.equal(run('active.trial'),1);
});

test('a hidden countdown is canceled without recording or starting when the tab returns',()=>{
  const {run,elements}=lab('C','native',null,false);
  run("$('start').onclick();tick('heartbeat',1000);document.hidden=true;document.events.visibilitychange.forEach(fn=>fn())");
  assert.equal(run('pendingStart'),null);
  assert.equal(run('records.length'),0);
  assert.equal(elements.get('typing').disabled,false);
  assert.match(elements.get('cueText').textContent,/숨겨져/);
  run("document.hidden=false;clock=6000;timerTick()");
  assert.equal(run('active'),null);
});

test('a disconnected or changed native source cannot start a trial at the end of preparation',()=>{
  for(const mutation of ['touchLink.handle=null','j.meta.sessionId="changed"']) {
    const {run,elements}=lab('C','native',null,false);
    run("$('start').onclick();tick('heartbeat',1000);tick('heartbeat',2000);tick('heartbeat',3000);tick('heartbeat',4000)");
    run(`${mutation};tick('heartbeat',5000)`);
    assert.equal(run('active'),null);
    assert.equal(run('pendingStart'),null);
    assert.equal(run('records.length'),0);
    assert.equal(elements.get('settings').disabled,false);
    assert.match(elements.get('cueText').textContent,/연결/);
  }
});

test('a browser keyboard resize or touch failure cancels preparation without a partial trial',()=>{
  const {run,elements}=lab('A','browser',null,false);
  run("$('start').onclick();studyFault('ConvBoard 화면 크기가 바뀌었습니다.')");
  assert.equal(run('pendingStart'),null);
  assert.equal(run('active'),null);
  assert.equal(run('records.length'),0);
  assert.equal(run('conv.locked'),false);
  assert.match(elements.get('cueText').textContent,/크기/);
});

test('paragraph practice accepts input without a sensor and starts a clean recorded trial',()=>{
  const {run,elements}=lab('C','native',null,false);
  run(`touchLink.handle=null;
    const practiceInput=$('typing');
    const practiceType=value=>{practiceInput.value=value;practiceInput.events.input[0]({inputType:'insertText',data:value,isComposing:false})};
    const practiceKey=(key,extra={})=>{
      let prevented=false;
      const event={key,currentTarget:practiceInput,repeat:false,preventDefault(){prevented=true},...extra};
      for(const handler of practiceInput.events.keydown) handler(event);
      return prevented;
    };
    practiceType('m');`);
  assert.equal(elements.get('typing').disabled,false);
  assert.equal(elements.get('typing').readOnly,false);
  assert.equal(elements.get('prompt').textContent,FIRST_PHRASE);
  assert.equal(elements.get('progressLabel').textContent,'1 / '+FIRST_PHRASE.length);
  assert.equal(elements.get('nextPrompt').hidden,false);
  assert.equal(run('active'),null);
  assert.equal(run('records.length'),0);
  assert.equal(run("practiceKey(' ')") ,false);
  assert.equal(run("practiceKey('Enter',{isComposing:true})"),false);
  assert.equal(run("practiceKey('Enter',{repeat:true})"),true);
  assert.equal(elements.get('prompt').textContent,FIRST_PHRASE);
  run("practiceType(mackenziePhrases[0])");
  assert.equal(run("practiceKey(' ')") ,true);
  assert.equal(elements.get('prompt').textContent,SECOND_PHRASE);
  assert.equal(elements.get('typing').value,'');
  run("practiceType('practice only');$('start').onclick()");
  assert.equal(run('active'),null);
  assert.equal(elements.get('typing').disabled,false);
  assert.equal(elements.get('typing').value,'practice only');
  run("touchLink.handle={};$('start').onclick()");
  assert.equal(run('phase'),'countdown');
  assert.equal(run('active'),null);
  assert.equal(run('pendingStart.paragraph.sentences[0].prompt'),FIRST_PHRASE);
  assert.equal(run('records.length'),0);
  assert.equal(elements.get('typing').value,'');
  assert.equal(elements.get('typing').disabled,true);
  assert.equal(elements.get('nextPrompt').hidden,true);
  run('ready()');
  assert.equal(run('phase'),'typing');
  assert.equal(run('active.text'),'');
  assert.equal(run("active.events.some(e=>e.type==='input'||e.type==='text_commit')"),false);
  assert.equal(elements.get('typing').disabled,false);
});
test('practice follows all 500 MacKenzie phrases and wraps after the final phrase',()=>{
  const {run,elements}=lab('C','native',null,false);
  assert.equal(run('mackenziePhrases.length'),500);
  for(const expected of [SECOND_PHRASE,THIRD_PHRASE]) {
    run("$('nextPrompt').onclick()");
    assert.equal(elements.get('prompt').textContent,expected);
  }
  run("paragraphPracticeIndex=499;renderPrompt()");
  assert.equal(elements.get('prompt').textContent,'the picket line gives me the chills');
  assert.equal(elements.get('phraseLabel').textContent,'MacKenzie · 500 / 500');
  run("$('nextPrompt').onclick()");
  assert.equal(elements.get('prompt').textContent,FIRST_PHRASE);
  assert.equal(elements.get('typing').value,'');
  run("$('typing').value='my';$('paragraphCount').value='2';$('paragraphCount').onchange()");
  assert.equal(elements.get('typing').value,'my');
  assert.equal(elements.get('prompt').textContent,FIRST_PHRASE);
  assert.equal(elements.get('typing').disabled,false);
  assert.equal(run('records.length'),0);
});
test('browser ConvBoard can practice before logging and stops typing during the countdown',()=>{
  const {run,elements}=lab('A','browser',null,false);
  assert.equal(run('conv.typing'),true);
  run("for(const key of mackenziePhrases[0]) convKey(key===' '?'Space':key,false,false,'keydown',1)");
  assert.equal(elements.get('typing').value,FIRST_PHRASE);
  assert.equal(elements.get('prompt').textContent,FIRST_PHRASE);
  assert.equal(run('active'),null);
  assert.equal(run('records.length'),0);
  run("convKey('Space',false,false,'keydown',3)");
  assert.equal(elements.get('typing').value,'');
  assert.equal(elements.get('prompt').textContent,SECOND_PHRASE);
  run("convKey('c',false,false,'keydown',4);convKey('Enter',false,false,'keydown',5)");
  assert.equal(elements.get('prompt').textContent,THIRD_PHRASE);
  run("$('start').onclick();convKey('x',false,false,'keydown',6)");
  assert.equal(run('phase'),'countdown');
  assert.equal(run('conv.typing'),false);
  assert.equal(run('active'),null);
  assert.equal(elements.get('typing').value,'');
  run("ready();convKey('a',false,false,'keydown',7)");
  assert.equal(run('conv.typing'),true);
  assert.equal(run('active.text'),'a');
});
for(const code of ['A','C']) test(code+' native Space submits a completed sentence without affecting spaces, edits or IME',()=>{
  const {run,elements}=lab(code,'native');
  run(`function nativePress(key,extra={}) {
    let prevented=false;
    const event={target:$('typing'),currentTarget:$('typing'),key,code:key===' '?'Space':key,
      repeat:false,preventDefault(){prevented=true},...extra};
    for(const handler of $('typing').events.keydown)handler(event);
    for(const handler of document.events.keydown)handler(event);
    return prevented;
  }
  $('typing').value='my';commitText();`);
  assert.equal(run("nativePress(' ')") ,false);
  assert.equal(run('phase'),'typing');
  run("clock=100;$('typing').value=active.prompt;commitText();$('typing').selectionStart=$('typing').selectionEnd=3");
  assert.equal(run("nativePress(' ')") ,false);
  run("$('typing').selectionStart=0;$('typing').selectionEnd=$('typing').value.length");
  assert.equal(run("nativePress(' ')") ,false);
  run("$('typing').selectionStart=$('typing').selectionEnd=$('typing').value.length");
  for(const flag of ['ctrlKey','altKey','metaKey','shiftKey','isComposing'])
    assert.equal(run(`nativePress(' ',{${flag}:true})`),false);
  assert.equal(run("nativePress(' ',{keyCode:229})"),false);
  run('composing=true');assert.equal(run("nativePress(' ')") ,false);run('composing=false');
  assert.equal(run("nativePress(' ',{repeat:true})"),true);
  assert.equal(run('phase'),'typing');
  assert.equal(run('active.paragraph.index'),0);
  run('clock=300');assert.equal(run("nativePress(' ')") ,true);
  assert.equal(run('phase'),'inter_rest');
  assert.equal(run('active.paragraph.sentences[0].text'),FIRST_PHRASE);
  assert.equal(run('active.paragraph.sentences[0].submittedMs'),300);
  assert.equal(run("active.events.filter(e=>e.type==='sentence_submit').length"),1);
  assert.equal(elements.get('typing').value,'');
  run("tick('heartbeat',1000);tick('heartbeat',2000);tick('heartbeat',3000);tick('heartbeat',3299)");
  assert.equal(run('phase'),'inter_rest');
  run("tick('heartbeat',3300)");
  assert.equal(run('phase'),'typing');
  assert.equal(elements.get('prompt').textContent,SECOND_PHRASE);
  assert.equal(run("nativePress(' ',{repeat:true})"),true);
  assert.equal(run('active.paragraph.index'),1);
  run("clock=3400;$('typing').value='typo';commitText()");
  assert.equal(run("nativePress('Enter')"),true);
  assert.equal(run('active.paragraph.sentences[1].text'),'typo');
  assert.equal(run('phase'),'inter_rest');
});

test('browser ConvBoard uses ordinary spaces inside a sentence and Space submits all three sentences',async()=>{
  const {run,elements}=lab('A','browser');
  run("convKey('m',false,false,'keydown',1);convKey('y',false,false,'keydown',1);convKey('Space',false,false,'keydown',1)");
  assert.equal(run('active.text'),'my ');
  assert.equal(run('phase'),'typing');
  run("$('typing').value=active.prompt;commitText();$('typing').selectionStart=$('typing').selectionEnd=2;convKey('Space',false,false,'keydown',1)");
  assert.equal(run('active.text'),'my  watch fell in the water');
  assert.equal(run('phase'),'typing');
  run("$('typing').value='';commitText()");
  for(const prompt of [FIRST_PHRASE,SECOND_PHRASE,THIRD_PHRASE]) {
    run("for(const key of active.prompt){clock+=10;convKey(key===' '?'Space':key,false,false,'keydown',1)}");
    assert.equal(run('active.text'),prompt);
    assert.equal(run('phase'),'typing');
    run("tick('heartbeat',clock);convKey('Space',false,false,'keydown',1)");
    if(prompt!==THIRD_PHRASE) {
      assert.equal(run('phase'),'inter_rest');
      run("convKey('Space',false,false,'keydown',1)");
      assert.equal(elements.get('typing').value,'');
      run("tick('heartbeat',clock+1000);tick('heartbeat',clock+1000);tick('heartbeat',clock+1000)");
    }
  }
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(run('records.length'),1);
  assert.equal(run('records[0].status'),'completed');
  assert.equal(run('records[0].text'),[FIRST_PHRASE,SECOND_PHRASE,THIRD_PHRASE].join(' '));
  assert.equal(run("records[0].events.filter(e=>e.type==='sentence_submit').length"),3);
  assert.equal(run('records[0].metrics.accuracy_pct'),100);
});

for(const code of ['A','B','C','D']) test(code+' accepts 1920px native coordinates with a 150% scaled browser',()=>{
  const {run,elements}=lab(code,'native',null,false);
  run(`j.meta.widthPx=1920;j.meta.pitchPx=125;
    screen.width=1280;screen.height=800;devicePixelRatio=1.5;
    renderTouchStatus();$('start').onclick();ready()`);
  assert.equal(run('phase'),'typing');
  assert.equal(run('active.paragraph.geometry.widthPx'),1920);
  assert.equal(run('active.paragraph.displayWidthPx'),1920);
  assert.equal(run('active.paragraph.geometry.pitchPx'),125);
  assert.equal(run('active.paragraph.geometry.mmPerPx'),300/1920);
  assert.equal(run('active.touch.nativeWidthPx'),1920);
  assert.equal(run('active.touch.nativeWidthMm'),300);
  assert.match(elements.get('displayCalibration').textContent,/300mm/);
  assert.match(elements.get('displayCalibration').textContent,/1920 px/);
  assert.equal(run('active.paragraph.home.length'),0);
});
test('browser keyboard calibration and recorded width stay in the lower window CSS coordinates',()=>{
  const {run,elements}=lab('A','browser',null,false);
  run(`conv.geometry=P.geometry(1440,browserDisplayWidthMm,19.5,false);
    devicePixelRatio=1.5;renderTouchStatus();$('start').onclick();ready()`);
  assert.equal(run('phase'),'typing');
  assert.equal(run('active.paragraph.geometry.widthPx'),1440);
  assert.equal(run('active.paragraph.displayWidthPx'),1440);
  assert.equal(run('active.paragraph.geometry.mmPerPx'),302/1440);
  assert.equal(run('active.paragraph.geometry.coordinateSpace'),'ConvBoard CSS pixels');
  assert.match(elements.get('displayCalibration').textContent,/1440 CSS px/);
});
test('missing or invalid native width blocks calibrated logging instead of guessing 1280px',()=>{
  const {run,elements}=lab('C','native',null,false);
  for(const width of ['undefined','null','0','-1','1920.5','"1920"']) {
    run(`j.meta.widthPx=${width};renderTouchStatus();$('start').onclick()`);
    assert.equal(run('active'),null);
    assert.match(elements.get('cueText').textContent,/가로 해상도/);
    assert.match(elements.get('displayCalibration').textContent,/자동 감지/);
  }
});
test('native calibration follows the app monitor width and explicit overrides',()=>{
  const {run,elements}=lab('A','native',null,false);
  for(const [widthMm,pitchPx] of [[302,124],[310,121]]) {
    run(`j.meta.widthPx=1920;j.meta.widthMm=${widthMm};j.meta.pitchPx=${pitchPx};
      renderTouchStatus();var prepared=prepareParagraph(prepareStudyRun())`);
    assert.equal(run('prepared.geometry.widthMm'),widthMm);
    assert.equal(run('prepared.geometry.pitchPx'),pitchPx);
    assert.equal(run('prepared.geometry.mmPerPx'),widthMm/1920);
    assert.match(elements.get('displayCalibration').textContent,new RegExp(widthMm+'mm'));
  }
});
test('missing physical calibration blocks a new paragraph without guessing a monitor width',()=>{
  const {run,elements}=lab('C','native',null,false);
  for(const width of ['undefined','null','0','-1','NaN','"300"']) {
    run(`j.meta.widthMm=${width};renderTouchStatus();$('start').onclick()`);
    assert.equal(run('active'),null);
    assert.match(elements.get('cueText').textContent,/보정값/);
    assert.match(elements.get('displayCalibration').textContent,/자동 감지/);
  }
});
for(const code of ['A','B','C','D'])test(code+' standalone paragraph from countdown to typing, maps and export',async()=>{
  const {run,elements}=lab(code);
  assert.equal(run('phase'),'typing');assert.equal(run('active.paragraph.home.length'),0);
  run("tick('heartbeat',300);clock=330;typeChar('a');clock=370;typeChar('b')");
  assert.equal(run('phase'),'typing');assert.equal(run('active.text'),'ab');
  run("tick('down',400,3,550,310);tick('move',600,3,565,310);tick('up',900,3,550,310);tick('heartbeat',950);clock=1000;submitSentence()");
  assert.equal(run('phase'),'inter_rest');assert.equal(elements.get('prompt').textContent||'','');
  // The first rest has no contacts. The second has three, including a contact on Enter.
  run("tick('heartbeat',2000);tick('heartbeat',3000);tick('heartbeat',3999)");
  assert.equal(run('phase'),'inter_rest');
  run("tick('heartbeat',4000);clock=4100;typeChar('c');clock=4200;typeChar('d');tick('heartbeat',4300);submitSentence()");
  assert.equal(run('phase'),'inter_rest');
  run("tick('down',4400,1);tick('down',4420,2);tick('down',4440,3);tick('heartbeat',5300);tick('heartbeat',6300);tick('heartbeat',7299)");
  assert.equal(run('phase'),'inter_rest');
  run("tick('heartbeat',7300)");
  assert.equal(run('phase'),'typing');
  run("tick('up',7310,1);tick('up',7320,2);tick('up',7330,3);clock=7400;typeChar('e');clock=7500;typeChar('f');tick('heartbeat',7600);submitSentence()");
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(run('records[0].status'),'completed');assert.equal(run('records[0].text'),'ab cd ef');
  assert.equal(run('records[0].metrics.touch_quality'),'complete');assert.equal(run('P.strokes(records[0]).length'),1);
  assert.equal(run('records[0].metrics.transcription_ms'),240);
  assert.equal(elements.get('maps').hidden,false);
  assert.equal(elements.get('homeMap').hidden,true);
  assert.equal(elements.get('homeMapTitle').hidden,true);
  assert.equal(elements.get('saveHome').hidden,true);
  run("let exported;download=(name,content)=>exported=content;exportData('json')");
  const trial=JSON.parse(run('exported')).trials[0];
  assert.equal(trial.sentenceMetrics.length,3);assert.equal(trial.sentenceMetrics[1].first_text_after_cue_ms,100);
  assert.equal(trial.paragraph.geometry.keys.length,79);assert.equal(trial.paragraph.condition,code);
  assert.equal(trial.explorationStrokes.length,1);
  assert.equal(trial.explorationStrokes[0].durationMs,500);
  await run("const json=exported;const input={files:[{name:'export.json',text:async()=>json}]};$('mapFile').onchange({target:input})");
  assert.equal(elements.get('mapSource').textContent,'export.json');
  assert.equal(elements.get('maps').hidden,false);
  run("$('localMaps').onclick()");
  run("exportData('events')");assert.match(run('exported'),/keyboard_geometry/);assert.match(run('exported'),/inter_rest/);
});
test('a lost stream faults the study and a legacy record never appears on a calibrated map',()=>{
  const {run,elements}=lab('C');
  run("tick('heartbeat',100);tick('reset',200)");
  assert.equal(run('phase'),'fault');assert.ok(run('active.paragraph.failure'));
  run("active=null;records=[{condition:'C',status:'completed',kind:'measured',metrics:{touch_quality:'complete'}}];renderMaps()");
  assert.equal(elements.get('maps').hidden,true);
});
test('ConvBoard pointer callbacks capture untyped movement, reuse contact IDs and enter text only in the typing phase',()=>{
  const {run}=lab('A','browser',null,false);
  // Reopen a real ConvBoardWindow controller against a small popup DOM.
  run(`const pad=new ConvBoardWindow(), nodes=[], keys=[], faults=[];
    const doc=new Element();doc.body=new Element();doc.documentElement=new Element();
    doc.createElement=()=>{const el=new Element();nodes.push(el);return el};
    const popup={document:doc,innerWidth:1550,innerHeight:900,screen:{width:1550,height:900},
      performance:{timeOrigin:100000},setInterval:()=>1,clearInterval(){},addEventListener(){},closed:false};
    window.open=()=>popup;pad.open({widthMm:310,pitchMm:19.5},(...args)=>keys.push(args),s=>faults.push(s));
    const surface=nodes[0];surface.setPointerCapture=()=>{};
    const keyF=pad.geometry.keys.find(k=>k.label==='f');
    function point(type,t,dx=0){clock=t;surface.events[type][0]({preventDefault(){},pointerType:'touch',
      pointerId:2,timeStamp:t,clientX:keyF.x+keyF.w/2+dx,clientY:keyF.y+keyF.h/2})}
    point('pointerdown',100);point('pointermove',400,12);point('pointerup',600);
    pad.typing=true;point('pointerdown',700);point('pointerup',740);`);
  assert.equal(run("pad.journal.rows.filter(e=>['down','move','up'].includes(e.type)).length"),5);
  assert.equal(run("keys.map(k=>k[0]+':'+k[3]).join(',')"),'f:keydown,f:keyup');
  assert.equal(run('faults.length'),0);
});

test('browser keyboard excludes lower-screen palms from contacts, trial seeds and resting metrics',()=>{
  const {run}=lab('A','browser',null,false);
  run(`const pad=new ConvBoardWindow(), nodes=[], faults=[];
    const doc=new Element();doc.body=new Element();doc.documentElement=new Element();
    doc.createElement=()=>{const el=new Element();nodes.push(el);return el};
    const popup={document:doc,innerWidth:1550,innerHeight:900,screen:{width:1550,height:900},
      performance:{timeOrigin:100000},setInterval:()=>1,clearInterval(){},addEventListener(){},closed:false};
    window.open=()=>popup;pad.open({widthMm:310,pitchMm:19.5},()=>{},s=>faults.push(s));
    const surface=nodes[0];surface.setPointerCapture=()=>{};
    const bounds=pad.geometry.recordingBounds;
    function point(type,t,id,x,y){clock=t;surface.events[type][0]({preventDefault(){},pointerType:'touch',
      pointerId:id,timeStamp:t,clientX:x,clientY:y})}
    point('pointerdown',50,7,600,850);
    point('pointermove',100,7,600,200);
    point('pointerdown',200,2,bounds.left,0);
    point('pointermove',400,2,500,800);
    point('pointerup',800,2,500,850);
    point('pointerup',900,7,600,200);
    point('pointerdown',910,8,bounds.right,100);
    surface.events.pointercancel[0]({pointerId:8});
    point('pointerdown',920,9,600,bounds.bottom);
    surface.events.lostpointercapture[0]({pointerId:9});
    pad.journal.feed(JSON.stringify({seq:pad.journal.lastSeq+1,type:'heartbeat',t:1000,wallUnixMs:101000})+'\\n');
    const capture=pad.journal.capture(100000,1000,300);
    const measured=TapTouch.summarize(capture,1000);`);
  assert.equal(run("capture.events.filter(e=>['down','move','up'].includes(e.type)).length"),3);
  assert.equal(run("capture.events.filter(e=>['down','move','up'].includes(e.type)).every(e=>e.id===2)"),true);
  assert.equal(run('capture.recordingPolicy'),'contact-down-in-keyboard');
  assert.equal(run('capture.recordingBounds.bottom'),run('pad.geometry.recordingBounds.bottom'));
  assert.equal(run('measured.touch_contact_count'),1);
  assert.equal(run('measured.physical_contact_ms'),600);
  assert.equal(run('measured.physical_rest_ms'),300);
  assert.equal(run('measured.touch_quality'),'complete');
  assert.equal(run('faults.length'),0);
  assert.equal(run('pad.journal.capture(100500,400,300).seed.map(e=>e.id).join()'),'2');
  run("point('pointerdown',1100,7,600,200);point('pointerup',1150,7,600,200)");
  assert.equal(run("pad.journal.rows.filter(e=>e.id===7).length"),2);
});

for(const code of ['A','B']) test(code+' Windows ConvBoard uses native geometry, typing and touch stream',async()=>{
  const {run,elements}=lab(code,'native');
  assert.equal(run('phase'),'typing');
  assert.equal(run('active.paragraph.touchSource'),'windows-touch');
  assert.equal(run('active.paragraph.geometry.pitchPx'),83);
  assert.equal(run('phase'),'typing');assert.equal(elements.get('typing').readOnly,false);
  run("clock=300;typeChar('a');tick('heartbeat',350);const handleEnter=()=>document.events.keydown[0]({target:$('typing'),key:'Enter',preventDefault(){}});handleEnter()");
  assert.equal(run('phase'),'inter_rest');
  run("tick('heartbeat',1200);tick('heartbeat',2100);tick('heartbeat',3100);tick('heartbeat',3350);clock=3420;typeChar('c');tick('heartbeat',3500);handleEnter()");
  assert.equal(run('phase'),'inter_rest');
  run("tick('heartbeat',4500);tick('heartbeat',5500);tick('heartbeat',6500);clock=6600;typeChar('e');tick('heartbeat',6700);handleEnter()");
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(run('records[0].touch.source'),'windows-touch');
  assert.equal(run('records[0].status'),'completed');assert.equal(run('records[0].metrics.touch_quality'),'complete');
});
test('native A/B and C/D reject a journal from the other keyboard',()=>{
  for(const [code,sensor] of [['A','TapBoard+'],['C','ConvBoard']]) {
    const labState=lab(code,'native',sensor);
    assert.equal(labState.run('active'),null);
    assert.match(labState.elements.get('notice').textContent,/터치 로그/);
  }
});

test('the served standalone uses the direct feed to start, show a sentence and detect an app switch',async()=>{
  const {run,elements}=lab('C','native',null,false,true);
  assert.equal(elements.get('connectTouch').hidden,true);
  await run(`delete touchLink.poll;touchLink.journal=new TapTouch.Journal();
    let reply={session:j.meta,seed:[],heartbeat:j.heartbeat,cursor:j.lastSeq};
    window.fetch=async()=>({ok:true,json:async()=>reply});touchLink.poll()`);
  run("$('start').onclick()");assert.equal(run('phase'),'countdown');
  async function batch(events,at) {
    await run(`clock=${at};reply={events:${JSON.stringify(events)}.map(([type,t,id=0],i)=>({type,t,id,seq:touchLink.journal.lastSeq+i+1,
        keyType:'TAPPER',x:530+id*80,y:290,...(type==='heartbeat'?{wallUnixMs:100000+t}:{})}))};
      touchLink.poll()`);
    run("timerTick();if(active){captureTouch(active,time());processStudyTouch()}");
  }
  for(let t=1000;t<=5000;t+=1000) await batch([['heartbeat',t]],t);
  assert.equal(run('phase'),'typing');assert.equal(elements.get('prompt').textContent,FIRST_PHRASE);
  await run("reply={session:{...j.meta,sessionId:'other'},seed:[],cursor:0,heartbeat:null};touchLink.poll()");
  run("captureTouch(active,time());processStudyTouch()");
  assert.equal(run('phase'),'fault');assert.equal(run('active.touch.sessionId'),'s');
});

function firstParagraph(run) {
  run("clock=250;typeChar('a');tick('heartbeat',300);submitSentence();tick('heartbeat',1300);tick('heartbeat',2300);tick('heartbeat',3300)");
  run("clock=3350;typeChar('c');tick('heartbeat',3400);submitSentence();tick('heartbeat',4400);tick('heartbeat',5400);tick('heartbeat',6400)");
  run("clock=6450;typeChar('e');tick('heartbeat',6500);submitSentence()");
}
test('two paragraphs record only after each five-second countdown and advance MacKenzie phrases',async()=>{
  const {run,elements}=lab('C','native',null,false);
  run("$('paragraphCount').value='2';$('paragraphCount').onchange();$('start').onclick();ready()");
  assert.equal(run('active.paragraph.count'),2);assert.equal(run('active.paragraph.number'),1);
  firstParagraph(run);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(run('records.length'),1);assert.equal(run('records[0].status'),'completed');
  assert.equal(run('active'),null);
  assert.equal(run('pendingStart.paragraph.number'),2);assert.equal(run('phase'),'countdown');
  assert.match(elements.get('cueText').textContent,/손/);
  assert.equal(elements.get('typing').disabled,true);
  run("tick('heartbeat',7500);tick('heartbeat',8500);tick('heartbeat',9500);tick('heartbeat',10500);tick('heartbeat',11499)");
  assert.equal(run('phase'),'countdown');
  assert.equal(run('active'),null);
  run("tick('heartbeat',11500)");
  assert.equal(run('phase'),'typing');
  assert.equal(elements.get('prompt').textContent,'breathing is difficult');
  assert.equal(run('active.cueMs'),0);
  run("clock=11650;typeChar('x');tick('heartbeat',11700);submitSentence();tick('heartbeat',12700);tick('heartbeat',13700);tick('heartbeat',14700)");
  run("clock=14750;typeChar('y');tick('heartbeat',14800);submitSentence();tick('heartbeat',15800);tick('heartbeat',16800);tick('heartbeat',17800)");
  run("clock=17850;typeChar('z');tick('heartbeat',17900);submitSentence()");
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(run('active'),null);assert.equal(run('records.length'),2);assert.equal(run('studyRun'),null);
  assert.equal(run('records[0].paragraph.runId'),run('records[1].paragraph.runId'));
  assert.equal(run('records[1].paragraph.sentences.length'),3);
  assert.equal(run('records[1].startedUnix-records[0].startedUnix-records[0].endMs'),5000);
  assert.equal(run('records[1].rests.some(r=>r.kind==="inter_paragraph")'),false);
  assert.equal(run('records[1].paragraph.startCountdownMs'),5000);
  assert.equal(run('records[1].metrics.touch_quality'),'complete');
  run("let exported;download=(name,content)=>exported=content;exportData('json')");
  const exported=JSON.parse(run('exported'));
  assert.equal(exported.trials[1].paragraph.number,2);assert.equal(exported.trials[1].paragraph.count,2);
});
test('aborting the paragraph break stops the remaining run',async()=>{
  const {run}=lab('A','native',null,false);
  run("$('paragraphCount').value='3';$('paragraphCount').onchange();$('start').onclick();ready()");
  firstParagraph(run);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(run('phase'),'countdown');
  await run("finish('aborted')");
  run("tick('heartbeat',7500);tick('heartbeat',8500);tick('heartbeat',9500);tick('heartbeat',10500);tick('heartbeat',11500);tick('heartbeat',12500)");
  assert.equal(run('active'),null);assert.equal(run('pendingStart'),null);assert.equal(run('studyRun'),null);
  assert.equal(run('records.length'),1);assert.equal(run('records[0].status'),'completed');
});
test('paragraph count validates and creates consecutive three-phrase MacKenzie paragraphs',()=>{
  const {run,elements}=lab('C','native',null,false);
  run("$('paragraphCount').value='0';$('start').onclick()");assert.equal(run('active'),null);
  assert.match(elements.get('cueText').textContent,/문단/);
  run("$('paragraphCount').value='2';$('paragraphCount').onchange();var plan=prepareStudyRun()");
  assert.deepEqual(JSON.parse(run('JSON.stringify(plan.paragraphs)')),[
    [FIRST_PHRASE,SECOND_PHRASE,THIRD_PHRASE],
    ['breathing is difficult','I can see the rings on Saturn','physics and chemistry are hard']
  ]);
  run("$('paragraphCount').value='100';$('paragraphCount').onchange();plan=prepareStudyRun()");
  assert.equal(run('plan.paragraphs.length'),100);
  assert.equal(run('plan.paragraphs.every(p=>p.length===3)'),true);
  assert.equal(run('plan.paragraphs.flat().every((phrase,i)=>phrase===mackenziePhrases[i])'),true);
  run("$('paragraphCount').value='3';$('paragraphCount').onchange()");
  run("$('start').onclick();ready()");assert.equal(run('active.paragraph.sentences.length'),3);
});

test('failed automatic reconnection restores setup after the completed paragraph',async()=>{
  const {run,elements}=lab('C','native',null,false);
  run("$('paragraphCount').value='2';$('paragraphCount').onchange();$('start').onclick();ready()");
  firstParagraph(run);
  run('touchLink.handle=null');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(run('records.length'),1);
  assert.equal(run('records[0].status'),'completed');
  assert.equal(run('records[0].metrics.touch_quality'),'complete');
  assert.equal(run('active'),null);assert.equal(run('studyRun'),null);
  assert.equal(elements.get('paragraphSettings').hidden,false);
  assert.equal(elements.get('settings').disabled,false);
  assert.equal(elements.get('start').disabled,false);
  assert.match(elements.get('cueText').textContent,/연결/);
});
