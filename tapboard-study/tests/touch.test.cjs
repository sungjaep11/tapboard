const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Journal,FileLink,summarize}=require('../dist/touch.js');
function journal(events){
 const j=new Journal(), rows=[{schema:'tapboard-touch/v1',type:'session',seq:0,t:0,sessionId:'test',startedUnixMs:1000000,tapDurationMs:300},...events.sort((a,b)=>a.t-b.t).map((e,i)=>({id:1,x:10,y:20,keyType:'TAPPER',...e,seq:i+1,...(e.type==='heartbeat'?{wallUnixMs:1000000+e.t}: {})}))];
 j.feed(rows.map(e=>JSON.stringify(e)).join('\n')+'\n');return j;
}
const hb=(end,step=100)=>Array.from({length:Math.floor(end/step)+1},(_,i)=>({type:'heartbeat',t:i*step}));
test('sustained touch excludes threshold and merges overlapping fingers',()=>{
 const j=journal([...hb(2000),{type:'down',t:100,id:1},{type:'down',t:500,id:2},{type:'up',t:1500,id:1},{type:'up',t:1900,id:2}]);
 const m=summarize(j.capture(1000000,2000,300),2000);
 assert.equal(m.physical_rest_ms,1500);assert.equal(m.physical_rest_finger_ms,2200);assert.equal(m.touch_quality,'complete');assert.equal(m.physical_contact_ms,1800);
});
test('short taps, modifiers and repeating keys do not count as resting',()=>{
 const j=journal([...hb(1000),{type:'down',t:100},{type:'up',t:200},{type:'down',id:2,t:100,keyType:'MODIFIER'},{type:'up',id:2,t:1000},{type:'down',id:3,t:100,keyType:'NORMAL'},{type:'up',id:3,t:1000}]);
 assert.equal(summarize(j.capture(1000000,1000,300),1000).physical_rest_ms,0);
});
test('blank resting area is included; already-held contacts are seeded and clipped to trial',()=>{
 const j=journal([...hb(3000),{type:'down',t:100,keyType:'BLANK'},{type:'up',t:2900}]);
 const capture=j.capture(1001000,1000,300),m=summarize(capture,1000);
 assert.equal(capture.seed[0].t,-900);assert.equal(m.physical_rest_ms,1000);assert.equal(m.touch_coverage_pct,100);
});
test('live open contact stops at latest heartbeat, not browser now',()=>{
 const j=journal([...hb(1000),{type:'down',t:100}]);
 const m=summarize(j.capture(1000000,3000,300),3000);
 assert.equal(m.physical_rest_ms,600);assert.equal(m.touch_coverage_ms,1000);assert.equal(m.touch_quality,'partial');
});
test('UI heartbeat outage is excluded instead of invented continuous rest',()=>{
 const j=journal([...hb(1000),...hb(1000).map(e=>({...e,t:e.t+4000})),{type:'down',t:100},{type:'up',t:5000}]);
 const m=summarize(j.capture(1000000,5000,300),5000);
 assert.equal(m.physical_rest_ms,600);assert.equal(m.touch_coverage_ms,1000);assert.equal(m.touch_quality,'partial');
});
test('reset invalidates downstream contact coverage',()=>{
 const j=journal([...hb(2000),{type:'down',t:100},{type:'reset',t:1000}]);
 const m=summarize(j.capture(1000000,2000,300),2000);
 assert.equal(m.physical_rest_ms,600);assert.equal(m.touch_quality,'partial');assert.deepEqual(m.touch_issues,['reset']);
});
test('truncated lines are retained until complete and old CSV is rejected',()=>{
 const j=journal([]),row=JSON.stringify({seq:1,t:50,type:'down',id:1,x:0,y:0,keyType:'TAPPER'});
 j.feed(row.slice(0,20));assert.equal(j.rows.length,0);j.feed(row.slice(20)+'\n');assert.equal(j.rows.length,1);
 assert.throws(()=>new Journal().feed('elapsed_ms,stage\n'));
});
test('missing events and decreasing native time are errors',()=>{
 const j=journal([]);assert.throws(()=>j.feed(JSON.stringify({seq:2,t:1,type:'end'})+'\n'));
 const k=journal([{type:'end',t:100}]);assert.throws(()=>k.feed(JSON.stringify({seq:2,t:1,type:'end'})+'\n'));
});
test('clock changes mark results incomplete and stop coverage',()=>{
 const j=journal([...hb(2000),{type:'down',t:0}]);j.rows.find(e=>e.type==='heartbeat'&&e.t===1000).wallUnixMs+=100;
 const m=summarize(j.capture(1000000,2000,300),2000);assert.equal(m.physical_rest_ms,700);assert.equal(m.touch_quality,'partial');
 const c=j.capture(1000000,2000,300);c.invalidFromMs=500;assert.equal(summarize(c,2000).physical_rest_ms,200);
});
test('disconnected means missing, never zero observed rest',()=>assert.equal(summarize(null,1000).physical_rest_ms,null));
test('live status requires current heartbeat and unchanged same-PC clock',()=>{
 const link=new FileLink();link.handle={};link.journal=journal(hb(1000));
 assert.equal(link.status(1001100).ok,true);assert.equal(link.status(1005000).ok,false);
 link.journal.rows.at(-1).wallUnixMs+=100;assert.equal(link.status(1001100).ok,false);
});
test('incremental file reader retries changing snapshots without duplicating bytes',async()=>{
 const link=new FileLink(),j=journal(hb(1000)),header=JSON.stringify(j.meta)+'\n',body=j.rows.map(e=>JSON.stringify(e)).join('\n')+'\n';let calls=0;
 link.handle={getFile:async()=>{if(calls++===0){const e=new Error('changed');e.name='NotReadableError';throw e;}return new Blob([header,body]);}};
 await link.poll();assert.equal(link.offset,0);await link.poll();const offset=link.offset;await link.poll();assert.equal(link.offset,offset);assert.equal(link.journal.rows.length,j.rows.length);
});

test('zero sensor coverage is missing, not zero measured rest',()=>{
 const j=journal([{type:'heartbeat',t:1000},{type:'down',t:1000}]);
 const m=summarize(j.capture(1000000,1000,300),1000);
 assert.equal(m.physical_rest_ms,null);assert.equal(m.touch_coverage_pct,0);
});
test('incremental capture incorporates late pre-trial contact data and supports earlier cutoffs',()=>{
 const j=journal(hb(100));
 const initial=j.capture(1000200,10,300);
 assert.equal(initial.seed.length,0);
 const append=e=>j.feed(JSON.stringify({seq:j.lastSeq+1,id:2,x:5,y:8,keyType:'TAPPER',...e})+'\n');
 append({type:'down',t:180});append({type:'heartbeat',t:210,wallUnixMs:1000210});
 append({type:'up',t:240});append({type:'heartbeat',t:300,wallUnixMs:1000300});
 const later=j.capture(1000200,90,300),earlier=j.capture(1000200,5,300);
 assert.equal(later.seed[0].t,-20);assert.ok(later.events.some(e=>e.type==='up'));
 assert.deepEqual(earlier.events.map(e=>e.t),[-100,10]);
 assert.equal(initial.seed.length,0);
 assert.equal(j.capture(1000250,10,300).seed.length,0);
});

test('direct link resumes in sequence, preserves held fingers, and pins the source during recording',async()=>{
 const {LocalLink}=require('../dist/touch.js');
 const header=journal([]).meta, held={seq:7,t:100,type:'down',id:4,x:3,y:8,keyType:'TAPPER'};
 const first={session:header,seed:[held],heartbeat:{seq:9,t:200,type:'heartbeat',wallUnixMs:1000200},cursor:12};
 let reply=first,pinned=false,calls=0,path;
 const link=new LocalLink(()=>pinned,async(url,options)=>{
   calls++;path=url;assert.equal(options.headers['X-TapBoard-Study'],'1');
   return {ok:true,json:async()=>reply};
 });
 await Promise.all([link.poll(),link.poll()]);
 assert.equal(calls,1);assert.equal(path,'/touch');assert.equal(link.status(1000250).ok,true);
 assert.equal(link.journal.capture(1000250,50,300).seed[0].seq,7);
 pinned=true;
 reply={events:[{seq:13,t:300,type:'up',id:4,x:3,y:8,keyType:'TAPPER'}]};
 await link.poll();assert.equal(path,'/touch?session='+header.sessionId+'&after=12');
 assert.equal(link.journal.lastSeq,13);
 reply={...first,session:{...header,sessionId:'restart',keyboard:'ConvBoard'}};
 await link.poll();assert.equal(link.status().ok,false);
 assert.equal(link.journal.meta.sessionId,header.sessionId);assert.ok(link.journal.capture(1000250,100,300).error);
 pinned=false;await link.poll();assert.equal(path,'/touch');assert.equal(link.journal.meta.sessionId,'restart');
});
test('direct link detects a dropped batch and resumes with a snapshot between trials',async()=>{
 const {LocalLink}=require('../dist/touch.js');
 const header=journal([]).meta;
 let reply={session:header,seed:[],heartbeat:null,cursor:5},pinned=false;
 const link=new LocalLink(()=>pinned,async()=>({ok:true,json:async()=>reply}));
 await link.poll();pinned=true;
 reply={events:[{seq:7,t:100,type:'end'}]};await link.poll();assert.equal(link.status().ok,false);
 const original=link.journal;
 reply={session:header,seed:[],heartbeat:null,cursor:7};await link.poll();assert.equal(link.journal,original);
 pinned=false;await link.poll();assert.notEqual(link.journal,original);assert.equal(link.journal.lastSeq,7);
});
