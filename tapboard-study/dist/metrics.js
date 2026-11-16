(function (root) {
  'use strict';
  const chars = s => Array.from((s || '').normalize('NFC'));
  function distance(a, b) {
    a = chars(a); b = chars(b);
    let row = Array.from({length: b.length + 1}, (_, i) => i);
    for (let i = 0; i < a.length; i++) {
      const next = [i + 1];
      for (let j = 0; j < b.length; j++) next[j + 1] = Math.min(next[j] + 1, row[j + 1] + 1, row[j] + (a[i] === b[j] ? 0 : 1));
      row = next;
    }
    return row[b.length];
  }
  function delta(before, after) {
    const a = chars(before), b = chars(after); let start = 0, end = 0;
    while (start < Math.min(a.length,b.length) && a[start] === b[start]) start++;
    while (end < Math.min(a.length,b.length) - start && a[a.length-1-end] === b[b.length-1-end]) end++;
    return {added: b.length-start-end, removed: a.length-start-end};
  }
  function union(intervals) {
    const result = [];
    for (const [a,b] of intervals.filter(x=>x[1]>x[0]).sort((x,y)=>x[0]-y[0])) {
      const last = result[result.length-1];
      if (last && a <= last[1]) last[1] = Math.max(last[1],b); else result.push([a,b]);
    }
    return result;
  }
  function subtract(intervals, exclusions) {
    let result = intervals;
    for (const [a,b] of union(exclusions)) result = result.flatMap(([s,e]) => b <= s || a >= e ? [[s,e]] : [[s,Math.min(e,a)],[Math.max(s,b),e]].filter(([x,y])=>y>x));
    return result;
  }
  const sum = xs => xs.reduce((a,b)=>a+b,0);
  const avg = xs => xs.length ? sum(xs)/xs.length : null;
  function summarize(t, now = t.endMs ?? t.lastSavedMs ?? 0) {
    const events = t.events || [], text = t.text || '', length = chars(text).length;
    const inputs = events.filter(e=>e.type==='text_commit' && e.added>0);
    const keys = events.filter(e=>e.type==='keydown' && e.typingKey);
    const rests = union((t.rests||[]).map(r=>[r.start,r.end ?? now]));
    const first = inputs[0]?.t ?? null, last = events.filter(e=>e.type==='text_commit').at(-1)?.t ?? null;
    const typingMs = first === null || last === null ? 0 : last-first;
    const min = typingMs/60000;
    const cue = t.cueMs ?? null;
    const keyTimes = keys.map(e=>e.t);
    const gaps = keyTimes.slice(1).map((v,i)=>v-keyTimes[i]);
    const points = [cue,...keyTimes,now].filter(v=>v!==null && v>= (cue ?? now));
    const idleIntervals = cue===null ? [] : subtract(points.slice(1).map((v,i)=>[points[i],v]),rests).filter(([a,b])=>b-a>=t.config.idleMs);
    const pending = new Map(), dwell=[];
    for (const e of events) {
      if (e.type==='keydown' && !e.repeat) pending.set(e.code,e.t);
      if (e.type==='keyup' && pending.has(e.code)) { dwell.push(e.t-pending.get(e.code)); pending.delete(e.code); }
      if (e.type==='blur' || e.type==='rest_start') pending.clear();
    }
    const errors = distance(t.prompt,text), denom = Math.max(chars(t.prompt).length,length);
    const hidden = union(events.filter(e=>e.type==='hidden').map(e=>[e.t,events.find(f=>f.type==='visible'&&f.t>=e.t)?.t ?? now]));
    return {
      duration_ms: now, instructed_rest_ms: sum(rests.map(([a,b])=>b-a)), rest_count: rests.length,
      cue_ms: cue, first_key_from_start_ms: keys[0]?.t ?? null,
      first_key_after_cue_ms: cue!==null && keys.length ? keys[0].t-cue : null,
      first_text_after_cue_ms: cue!==null && first!==null ? first-cue : null,
      first_text_ms: first, last_text_ms: last, transcription_ms: typingMs,
      characters: length, inserted_characters: sum(inputs.map(e=>e.added)),
      removed_characters: sum(events.filter(e=>e.type==='text_commit').map(e=>e.removed)),
      wpm: min>0 ? Math.max(0,length-1)/5/min : null,
      cpm: min>0 ? Math.max(0,length-1)/min : null,
      edit_distance: errors, error_rate_pct: denom ? errors/denom*100 : 0,
      accuracy_pct: denom ? (1-errors/denom)*100 : 100,
      keydown_count: keys.length, backspace_count: keys.filter(e=>e.key==='Backspace').length,
      delete_count: keys.filter(e=>e.key==='Delete').length,
      repeat_count: keys.filter(e=>e.repeat).length,
      kspc: length ? keys.length/length : null, mean_iki_ms: avg(gaps), mean_key_dwell_ms: avg(dwell),
      idle_ms: sum(idleIntervals.map(([a,b])=>b-a)), idle_count: idleIntervals.length,
      idle_intervals: idleIntervals, max_iki_ms: gaps.length ? Math.max(...gaps) : null,
      focus_loss_count: events.filter(e=>e.type==='blur').length,
      hidden_ms: sum(hidden.map(([a,b])=>b-a)),
      blocked_paste_count: events.filter(e=>e.type==='paste_blocked'||e.type==='drop_blocked').length,
      composition_count: events.filter(e=>e.type==='compositionstart').length,
      exact_match: t.prompt.normalize('NFC')===text.normalize('NFC')
    };
  }
  function csv(rows) {
    if (!rows.length) return '';
    const fields = [...new Set(rows.flatMap(Object.keys))];
    const cell = value => {
      let s = value == null ? '' : typeof value==='object' ? JSON.stringify(value) : String(value);
      // Prevent spreadsheet formulas in participant text and transcriptions.
      if (typeof value==='string' && /^[\s]*[=+@-]/.test(s)) s="'"+s;
      return '"'+s.replaceAll('"','""')+'"';
    };
    return '\uFEFF'+[fields.map(cell).join(','),...rows.map(r=>fields.map(f=>cell(r[f])).join(','))].join('\r\n');
  }
  root.TapMetrics = {chars,distance,delta,union,subtract,summarize,csv};
  if (typeof module!=='undefined') module.exports=root.TapMetrics;
})(typeof window!=='undefined' ? window : globalThis);
