const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../dist/metrics.js');
const trial = extra => ({prompt:'hello',text:'hello',cueMs:1000,endMs:9000,config:{idleMs:2000},rests:[{start:0,end:1000}],events:[],...extra});
test('WPM excludes initial reaction and post-typing completion delay',()=>{
  const m=M.summarize(trial({events:[{type:'text_commit',t:2000,added:1,removed:0},{type:'text_commit',t:6000,added:4,removed:0}]}));
  assert.equal(m.wpm,12);assert.equal(m.first_text_after_cue_ms,1000);assert.equal(m.transcription_ms,4000);
});
test('final deletion extends transcription duration',()=>{
  const m=M.summarize(trial({events:[{type:'text_commit',t:2000,added:6,removed:0},{type:'text_commit',t:8000,added:0,removed:1}]}));
  assert.equal(m.wpm,8);assert.equal(m.removed_characters,1);
});
test('no text and single event cannot produce finite WPM',()=>{
  assert.equal(M.summarize(trial({text:''})).wpm,null);
  assert.equal(M.summarize(trial({text:'a',events:[{type:'text_commit',t:1000,added:1,removed:0}]})).wpm,null);
});
test('Unicode counts NFC Hangul syllables and astral codepoints',()=>{
  assert.equal(M.chars('가😀').length,2);assert.equal(M.distance('가','가'),0);
  assert.deepEqual(M.delta('가나다','가라다'),{added:1,removed:1});
});
test('edit distance handles insertion deletion substitution and omissions',()=>{
  assert.equal(M.distance('kitten','sitting'),3);
  assert.equal(M.summarize(trial({text:'hell'})).accuracy_pct,80);
  assert.equal(M.summarize(trial({text:'hello!'})).edit_distance,1);
});
test('rest intervals are unioned and excluded from idle before thresholding',()=>{
  const m=M.summarize(trial({endMs:11000,rests:[{start:0,end:1000},{start:3000,end:7000},{start:6000,end:8000}],events:[{type:'keydown',typingKey:true,t:2000}]}));
  assert.equal(m.instructed_rest_ms,6000);assert.equal(m.idle_ms,3000);assert.deepEqual(m.idle_intervals,[[8000,11000]]);
});
test('an active rest closes at the snapshot time',()=>{
  const m=M.summarize(trial({rests:[{start:0,end:null}],cueMs:null}),4000);
  assert.equal(m.instructed_rest_ms,4000);assert.equal(m.idle_ms,0);
});
test('key latency, repeat, dwell and IKI come from received keys',()=>{
  const m=M.summarize(trial({events:[{type:'keydown',typingKey:true,key:'a',code:'KeyA',t:1200},{type:'keydown',typingKey:true,key:'a',code:'KeyA',repeat:true,t:1300},{type:'keyup',code:'KeyA',t:1500}]}));
  assert.equal(m.first_key_after_cue_ms,200);assert.equal(m.mean_iki_ms,100);assert.equal(m.mean_key_dwell_ms,300);assert.equal(m.repeat_count,1);
});
test('focus loss invalidates unmatched key holds',()=>{
  const m=M.summarize(trial({events:[{type:'keydown',code:'KeyA',t:1200},{type:'blur',t:1300},{type:'keyup',code:'KeyA',t:2000}]}));
  assert.equal(m.mean_key_dwell_ms,null);assert.equal(m.focus_loss_count,1);
});
test('CSV escapes commas quotes newlines and formula-like participant input',()=>{
  const csv=M.csv([{name:'=1+1',text:'가,"a"\n나',num:-2}]);
  assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"\'=1+1"'));assert.ok(csv.includes('"가,""a""\n나"'));assert.ok(csv.includes('"-2"'));
});
