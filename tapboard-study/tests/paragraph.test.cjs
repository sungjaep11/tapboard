const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const P=require('../dist/paragraph.js'), M=require('../dist/metrics.js');

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
  for(const [id,value] of Object.entries({protocol:'paragraph',convSource:source,studyCondition:code,mapCondition:code,mapKind:'measured',paragraphCount:'1',pitchMm:'19.5',paragraphText:'ab\ncd\nef',participant:'P1',block:'1',trialKind:'measured',language:'en',restSeconds:'3',idleSeconds:'2',touchThreshold:'300'})) elements.get(id).value=value;
  const ctx=vm.createContext({document,console,Intl,window:null,Element,performance:{now:()=>ctx.clock,timeOrigin:100000},
    sensorKeyboard:journalKeyboard ?? (source==='native' && ['A','B'].includes(code)?'ConvBoard':'TapBoard+'),clock:0,Date:class extends Date {static now(){return 100000+ctx.clock;}},
    setInterval:fn=>{timers.push(fn);},setTimeout:fn=>{fn();},clearInterval(){},crypto:require('node:crypto').webcrypto,
    Blob,URL,TextDecoder,navigator:{userAgent:'test'},screen:{width:1550,height:900},innerWidth:1550,innerHeight:900,devicePixelRatio:1,
    indexedDB:{open(){return {}; }},addEventListener(){}});
  ctx.window=ctx;
  if(direct) Object.assign(ctx,{location:{origin:'http://127.0.0.1:47831'},AbortController,clearTimeout(){}});
  const run=code=>vm.runInContext(code,ctx);
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) run(match[1]);
  run(`db={transaction(){const tx={objectStore(){return {put(){queue(tx)}}}};return tx}};
       const queue=tx=>Promise.resolve().then(()=>tx.oncomplete());
       const j=new TapTouch.Journal();
       j.feed(JSON.stringify({schema:'tapboard-touch/v1',type:'session',seq:0,t:0,sessionId:'s',keyboard:sensorKeyboard,widthPx:1280,pitchPx:81,startedUnixMs:100000})+'\\n');
       function feed(type,t,id=0,x=0,y=0){clock=t;const e={seq:j.lastSeq+1,type,t,id,x,y,keyType:'TAPPER'};
         if(type==='heartbeat')e.wallUnixMs=Date.now();j.feed(JSON.stringify(e)+'\\n');}
       feed('heartbeat',0);
       touchLink.journal=j;touchLink.handle={};touchLink.poll=async()=>{};
       conv.win={closed:false,document:{fullscreenElement:{}},innerHeight:900};
       conv.settings=calibration();conv.geometry=P.geometry(1280,310,19.5,false);conv.journal=j;
       function tick(type,t,id=0,x=0,y=0){feed(type,t,id,x,y);if(active){captureTouch(active,time());processStudyTouch();advanceStudyTimer(time());}}
       function typeChar(c){if(browserTrial(active))convKey(c,false,false,'keydown',4);
         else {$('typing').value+=c;commitText('insertText');}}
       `);
  if(autostart) run("$('start').onclick()");
  return {run,elements};
}
test('paragraph setup previews editable sentences and explains blocked starts at the controls',()=>{
  const {run,elements}=lab('C','native',null,false);
  assert.equal(elements.get('prompt').textContent,'ab');
  run("$('paragraphText').value='first sentence\\nsecond';$('paragraphText').oninput();touchLink.handle=null;$('start').onclick()");
  assert.equal(elements.get('prompt').textContent,'first sentence');
  assert.match(elements.get('cueText').textContent,/연결/);
  assert.equal(run('active'),null);
  assert.equal(elements.has('widthMm'),false);assert.equal(elements.has('nativeWidth'),false);
  run("touchLink.handle={};$('start').onclick()");
  assert.equal(run('active.paragraph.geometry.widthMm'),310);
  assert.equal(run('active.paragraph.geometry.widthPx'),1280);
  assert.equal(run('phase'),'hands_off');assert.equal(elements.get('prompt').textContent,'');
  run("tick('heartbeat',100);tick('down',120,1);tick('down',140,2);tick('up',160,1);tick('up',170,2);tick('heartbeat',200)");
  assert.equal(elements.get('prompt').textContent,'first sentence');
});
test('single sentence logging starts with a visible prompt without a native keyboard',()=>{
  const {run,elements}=lab('C','native',null,false);
  run("$('protocol').value='single';$('protocol').onchange();touchLink.handle=null;$('restSeconds').value='0';$('start').onclick()");
  assert.equal(run('phase'),'typing');
  assert.equal(elements.get('prompt').textContent,'my watch fell in the water');
  assert.equal(run('active.config.touchEnabled'),false);
});
for(const code of ['A','B','C','D'])test(code+' standalone paragraph from hands-off to maps and export',async()=>{
  const {run,elements}=lab(code);
  assert.equal(run('phase'),'hands_off');
  run("tick('heartbeat',100); tick('down',160,1,540,310);tick('down',190,2,860,310)");
  assert.equal(run('phase'),'release');assert.equal(run('active.paragraph.home.length'),2);
  run("tick('up',210,1);tick('up',220,2);tick('heartbeat',300);clock=330;typeChar('a');clock=370;typeChar('b')");
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
  const {run}=lab('A');
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

for(const code of ['A','B']) test(code+' Windows ConvBoard uses native geometry, typing and touch stream',async()=>{
  const {run,elements}=lab(code,'native');
  assert.equal(run('phase'),'hands_off');
  assert.equal(run('active.paragraph.touchSource'),'windows-touch');
  assert.equal(run('active.paragraph.geometry.pitchPx'),81);
  run("tick('heartbeat',100);tick('down',130,1,530,280);tick('down',150,2,810,280);tick('up',170,1);tick('up',190,2);tick('heartbeat',250)");
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
  run("$('start').onclick()");assert.equal(run('phase'),'hands_off');
  async function batch(events,at) {
    await run(`clock=${at};reply={events:${JSON.stringify(events)}.map(([type,t,id=0],i)=>({type,t,id,seq:touchLink.journal.lastSeq+i+1,
        keyType:'TAPPER',x:530+id*80,y:290,...(type==='heartbeat'?{wallUnixMs:100000+t}:{})}))};
      touchLink.poll()`);
    run("captureTouch(active,time());processStudyTouch()");
  }
  await batch([['heartbeat',100]],100);
  await batch([['down',110,1],['down',115,2]],120);
  await batch([['up',140,1],['up',145,2],['heartbeat',150]],150);
  assert.equal(run('phase'),'typing');assert.equal(elements.get('prompt').textContent,'ab');
  await run("reply={session:{...j.meta,sessionId:'other'},seed:[],cursor:0,heartbeat:null};touchLink.poll()");
  run("captureTouch(active,time());processStudyTouch()");
  assert.equal(run('phase'),'fault');assert.equal(run('active.touch.sessionId'),'s');
});

function firstParagraph(run) {
  run("tick('heartbeat',100);tick('down',120,1);tick('down',140,2);tick('up',160,1);tick('up',180,2);tick('heartbeat',200)");
  run("clock=250;typeChar('a');tick('heartbeat',300);submitSentence();tick('heartbeat',1300);tick('heartbeat',2300);tick('heartbeat',3300)");
  run("clock=3350;typeChar('c');tick('heartbeat',3400);submitSentence();tick('heartbeat',4400);tick('heartbeat',5400);tick('heartbeat',6400)");
  run("clock=6450;typeChar('e');tick('heartbeat',6500);submitSentence()");
}
test('two paragraphs save separate records and wait five seconds before the next home-key cue',async()=>{
  const {run,elements}=lab('C','native',null,false);
  run("$('paragraphCount').value='2';$('paragraphCount').onchange();$('start').onclick()");
  assert.equal(run('active.paragraph.count'),2);assert.equal(run('active.paragraph.number'),1);
  firstParagraph(run);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(run('records.length'),1);assert.equal(run('records[0].status'),'completed');
  assert.equal(run('active.paragraph.number'),2);assert.equal(run('phase'),'paragraph_rest');
  assert.match(elements.get('cueText').textContent,/손/);
  assert.equal(elements.get('typing').disabled,true);
  run("tick('heartbeat',7500);tick('heartbeat',8500);tick('heartbeat',9500);tick('heartbeat',10500);tick('heartbeat',11499)");
  assert.equal(run('phase'),'paragraph_rest');
  run("tick('heartbeat',11500)");assert.equal(run('phase'),'hands_off');
  run("tick('heartbeat',11510);tick('down',11520,1);tick('down',11540,2);tick('up',11560,1);tick('up',11580,2);tick('heartbeat',11600)");
  assert.equal(run('phase'),'typing');
  run("clock=11650;typeChar('x');tick('heartbeat',11700);submitSentence();tick('heartbeat',12700);tick('heartbeat',13700);tick('heartbeat',14700)");
  run("clock=14750;typeChar('y');tick('heartbeat',14800);submitSentence();tick('heartbeat',15800);tick('heartbeat',16800);tick('heartbeat',17800)");
  run("clock=17850;typeChar('z');tick('heartbeat',17900);submitSentence()");
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(run('active'),null);assert.equal(run('records.length'),2);assert.equal(run('studyRun'),null);
  assert.equal(run('records[0].paragraph.runId'),run('records[1].paragraph.runId'));
  assert.equal(run('records[1].paragraph.sentences.length'),3);
  assert.equal(run('records[1].rests.find(r=>r.kind==="inter_paragraph").end-records[1].rests.find(r=>r.kind==="inter_paragraph").start'),5000);
  assert.equal(run('records[1].metrics.touch_quality'),'complete');
  run("let exported;download=(name,content)=>exported=content;exportData('json')");
  const exported=JSON.parse(run('exported'));
  assert.equal(exported.trials[1].paragraph.number,2);assert.equal(exported.trials[1].paragraph.count,2);
});
test('aborting the paragraph break stops the remaining run',async()=>{
  const {run}=lab('A','native',null,false);
  run("$('paragraphCount').value='3';$('paragraphCount').onchange();$('start').onclick()");
  firstParagraph(run);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(run('phase'),'paragraph_rest');
  await run("finish('aborted')");
  run("tick('heartbeat',7500);tick('heartbeat',8500);tick('heartbeat',9500);tick('heartbeat',10500);tick('heartbeat',11500);tick('heartbeat',12500)");
  assert.equal(run('active'),null);assert.equal(run('studyRun'),null);assert.equal(run('records.length'),2);
  assert.equal(run('records[1].status'),'aborted');
});
test('paragraph count validates before starting and the full sentence list can be reviewed',()=>{
  const {run,elements}=lab('C','native',null,false);
  run("$('paragraphCount').value='0';$('start').onclick()");assert.equal(run('active'),null);
  assert.match(elements.get('cueText').textContent,/문단/);
  run("$('paragraphCount').value='2';$('paragraphCount').onchange()");
  assert.equal(elements.get('paragraphText').value.split('\n').length,6);
  assert.equal(elements.get('paragraphText').value.split('\n')[0],'ab');
  run("$('paragraphCount').value='3';$('paragraphCount').onchange()");
  assert.equal(new Set(elements.get('paragraphText').value.split('\n')).size,9);
  run("$('start').onclick()");assert.equal(run('active.paragraph.sentences.length'),3);
});

test('failed automatic reconnection restores setup after the completed paragraph',async()=>{
  const {run,elements}=lab('C','native',null,false);
  run("$('paragraphCount').value='2';$('paragraphCount').onchange();$('start').onclick()");
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
