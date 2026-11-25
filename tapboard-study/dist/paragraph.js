(function(root){
'use strict';
// Physical layout from Overlay/keys.json, relative to Esc in key-pitch units.
const keyUnits = [
  ["Esc", 0.0, 0.0, 1.0, 0.5],
  ["F1", 1.0, 0.0, 1.0, 0.5],
  ["F2", 2.0, 0.0, 1.0, 0.5],
  ["F3", 3.0, 0.0, 1.0, 0.5],
  ["F4", 4.0, 0.0, 1.0, 0.5],
  ["F5", 5.0, 0.0, 1.0, 0.5],
  ["F6", 6.0, 0.0, 1.0, 0.5],
  ["F7", 7.0, 0.0, 1.0, 0.5],
  ["F8", 8.0, 0.0, 1.0, 0.5],
  ["F9", 9.0, 0.0, 1.0, 0.5],
  ["F10", 10.0, 0.0, 1.0, 0.5],
  ["F11", 11.0, 0.0, 1.0, 0.5],
  ["F12", 12.0, 0.0, 1.0, 0.5],
  ["Del", 13.0, 0.0, 1.0, 0.5],
  ["⏻", 14.25, 0.0, 0.5, 0.5],
  ["`", 0.0, 0.5, 1.0, 1.0],
  ["1", 1.0, 0.5, 1.0, 1.0],
  ["2", 2.0, 0.5, 1.0, 1.0],
  ["3", 3.0, 0.5, 1.0, 1.0],
  ["4", 4.0, 0.5, 1.0, 1.0],
  ["5", 5.0, 0.5, 1.0, 1.0],
  ["6", 6.0, 0.5, 1.0, 1.0],
  ["7", 7.0, 0.5, 1.0, 1.0],
  ["8", 8.0, 0.5, 1.0, 1.0],
  ["9", 9.0, 0.5, 1.0, 1.0],
  ["0", 10.0, 0.5, 1.0, 1.0],
  ["-", 11.0, 0.5, 1.0, 1.0],
  ["=", 12.0, 0.5, 1.0, 1.0],
  ["Backspace", 13.0, 0.5, 2.0, 1.0],
  ["Tab", 0.0, 1.5, 1.5, 1.0],
  ["q", 1.5, 1.5, 1.0, 1.0],
  ["w", 2.5, 1.5, 1.0, 1.0],
  ["e", 3.5, 1.5, 1.0, 1.0],
  ["r", 4.5, 1.5, 1.0, 1.0],
  ["t", 5.5, 1.5, 1.0, 1.0],
  ["y", 6.5, 1.5, 1.0, 1.0],
  ["u", 7.5, 1.5, 1.0, 1.0],
  ["i", 8.5, 1.5, 1.0, 1.0],
  ["o", 9.5, 1.5, 1.0, 1.0],
  ["p", 10.5, 1.5, 1.0, 1.0],
  ["[", 11.5, 1.5, 1.0, 1.0],
  ["]", 12.5, 1.5, 1.0, 1.0],
  ["\\", 13.5, 1.5, 1.5, 1.0],
  ["Caps Lock", 0.0, 2.5, 1.75, 1.0],
  ["a", 1.75, 2.5, 1.0, 1.0],
  ["s", 2.75, 2.5, 1.0, 1.0],
  ["d", 3.75, 2.5, 1.0, 1.0],
  ["f", 4.75, 2.5, 1.0, 1.0],
  ["g", 5.75, 2.5, 1.0, 1.0],
  ["h", 6.75, 2.5, 1.0, 1.0],
  ["j", 7.75, 2.5, 1.0, 1.0],
  ["k", 8.75, 2.5, 1.0, 1.0],
  ["l", 9.75, 2.5, 1.0, 1.0],
  [";", 10.75, 2.5, 1.0, 1.0],
  ["'", 11.75, 2.5, 1.0, 1.0],
  ["Enter", 12.75, 2.5, 2.25, 1.0],
  ["Shift", 0.0, 3.5, 2.25, 1.0],
  ["z", 2.25, 3.5, 1.0, 1.0],
  ["x", 3.25, 3.5, 1.0, 1.0],
  ["c", 4.25, 3.5, 1.0, 1.0],
  ["v", 5.25, 3.5, 1.0, 1.0],
  ["b", 6.25, 3.5, 1.0, 1.0],
  ["n", 7.25, 3.5, 1.0, 1.0],
  ["m", 8.25, 3.5, 1.0, 1.0],
  [",", 9.25, 3.5, 1.0, 1.0],
  [".", 10.25, 3.5, 1.0, 1.0],
  ["/", 11.25, 3.5, 1.0, 1.0],
  ["Shift", 12.25, 3.5, 2.75, 1.0],
  ["Ctrl", 0.0, 4.5, 1.25, 1.0],
  ["Win", 1.25, 4.5, 1.25, 1.0],
  ["Alt", 2.5, 4.5, 1.25, 1.0],
  ["Space", 3.75, 4.5, 5.25, 1.0],
  ["한/영", 9.0, 4.5, 1.0, 1.0],
  ["한자", 10.0, 4.5, 1.0, 1.0],
  ["Ctrl", 11.0, 4.5, 1.0, 1.0],
  ["↑", 13.0, 4.5, 1.0, 0.5],
  ["←", 12.0, 5.0, 1.0, 0.5],
  ["↓", 13.0, 5.0, 1.0, 0.5],
  ["→", 14.0, 5.0, 1.0, 0.5]
];
const conditions = {
  A:{keyboard:'ConvBoard',surface:'bare'}, B:{keyboard:'ConvBoard',surface:'film'},
  C:{keyboard:'TapBoard+',surface:'bare'}, D:{keyboard:'TapBoard+',surface:'film'}
};
const restMs = 3000, minDurationMs = 400, minPathMm = 1.9;
// KeyboardLayout.cs uses .NET midpoint-to-even rounding and integer centering.
function roundEven(n) {
  const low = Math.floor(n);
  return n-low === 0.5 ? low + low%2 : Math.round(n);
}
function geometry(widthPx, widthMm, pitchMm, native, recordedPitchPx=null) {
  if (![widthPx,widthMm,pitchMm].every(v => Number.isFinite(v) && v>0))
    throw new Error('아래 화면의 가로 길이와 해상도, 키 간격을 확인하세요.');
  const mmPerPx = widthMm / widthPx;
  if(recordedPitchPx!==null && (!Number.isSafeInteger(recordedPitchPx) || recordedPitchPx<=0))
    throw new Error('앱 로그의 키 간격(px)을 확인하세요.');
  const pitch = native ? (recordedPitchPx ?? roundEven(widthPx*pitchMm/widthMm)) : pitchMm/mmPerPx;
  if (!pitch || 15*pitch>widthPx) throw new Error('키보드가 화면 너비를 초과합니다. 보정값을 확인하세요.');
  const px = native ? n=>roundEven(n*pitch) : n=>n*pitch;
  const left = native ? Math.trunc((widthPx-px(15))/2) : (widthPx-px(15))/2;
  const keys = keyUnits.map(([label,x,y,w,h])=>({
    label,x:left+px(x),y:px(y),w:px(x+w)-px(x),h:px(y+h)-px(y)
  }));
  return {widthPx,widthMm,pitchMm,pitchPx:pitch,effectivePitchMm:pitch*mmPerPx,mmPerPx,left,top:0,
    coordinateSpace:native?'KeyArea client pixels':'ConvBoard CSS pixels',keys};
}
const hit = (g,p) => g.keys.find(k => p.x>=k.x && p.x<k.x+k.w && p.y>=k.y && p.y<k.y+k.h);
function homePoints(events,g) {
  return [...events].sort((a,b)=>a.x-b.x || a.seq-b.seq).map((p,i)=>{
    const target=i===0?'f':'j', k=g.keys.find(k=>k.label===target);
    const actual=hit(g,p)?.label ?? null;
    return {id:p.id,seq:p.seq,t:p.t,x:p.x,y:p.y,target,actual,correct:actual===target,
      deviationMm:Math.hypot(p.x-k.x-k.w/2,p.y-k.y-k.h/2)*g.mmPerPx};
  });
}
function phaseAt(phases,t) {
  for(let i=phases.length-1;i>=0;i--) if(t>=phases[i].t) return phases[i];
  return {name:'before',sentence:null};
}
// Use the complete down..up path of a single contact within one sentence.
// A contact that began in a rest or crosses a boundary never counts as exploration.
function strokes(trial) {
  const p=trial.paragraph, pending=new Map(), found=[];
  const coverage=trial.metrics?.touch_coverage_intervals ?? [];
  for(const e of trial.touch?.events || []) {
    if (['reset','end','gap','NATIVE_ERROR'].includes(e.type)) pending.clear();
    if (!['down','move','up'].includes(e.type)) continue;
    const phase=phaseAt(p.phases,e.t);
    if(e.type==='down') {
      pending.delete(e.id);
      if(phase.name==='typing') pending.set(e.id,{sentence:phase.sentence,id:e.id,points:[e],mm:0});
      continue;
    }
    const s=pending.get(e.id);
    if(!s) continue;
    if(phase.name!=='typing' || phase.sentence!==s.sentence) {pending.delete(e.id);continue;}
    const prev=s.points.at(-1);
    s.mm+=Math.hypot(e.x-prev.x,e.y-prev.y)*p.geometry.mmPerPx;
    s.points.push(e);
    if(e.type==='up') {
      pending.delete(e.id);
      const start=s.points[0].t;
      s.durationMs=e.t-start;
      if(s.durationMs>minDurationMs && s.mm>minPathMm && coverage.some(([a,b])=>a<=start && e.t<=b)) found.push(s);
    }
  }
  return found;
}
function strokeSummary(trial) {
  return strokes(trial).map(s=>{
    const start=s.points[0],end=s.points.at(-1),sentence=trial.paragraph.sentences[s.sentence];
    const span=sentence.submittedMs-sentence.cueMs;
    return {sentence:s.sentence,id:s.id,downSeq:start.seq,upSeq:end.seq,startMs:start.t,endMs:end.t,
      durationMs:s.durationMs,pathMm:s.mm,
      timeDecile:sentence.submittedMs!=null && span>0?Math.min(10,1+Math.floor(10*(start.t-sentence.cueMs)/span)):null};
  });
}
function sentenceMetrics(trial, M) {
  return trial.paragraph.sentences.filter(s=>s.cueMs!=null).map(s=>{
    const events=trial.events.filter(e=>e.phase==='typing' && e.sentence===s.index);
    const m=M.summarize({prompt:s.prompt,text:s.text,config:trial.config,events,rests:[],cueMs:s.cueMs},
      s.submittedMs ?? trial.endMs ?? trial.lastSavedMs);
    return {index:s.index,prompt:s.prompt,text:s.text,submittedMs:s.submittedMs,cueMs:s.cueMs,
      firstCharacter:events.find(e=>e.type==='text_commit'&&e.added)?.after?.[0] ?? null,
      ...m};
  });
}
const api={conditions,geometry,homePoints,phaseAt,strokes,strokeSummary,sentenceMetrics,hit,restMs,minDurationMs,minPathMm};
root.TapParagraph=api;
if(typeof module!=='undefined') module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
