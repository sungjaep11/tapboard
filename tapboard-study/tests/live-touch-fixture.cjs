// Synthetic local UI fixture, never an actual participant recording.
const fs=require('node:fs'),{performance}=require('node:perf_hooks');
const file=process.argv[2];if(!file)throw Error('Provide a fixture path');
const start=Date.now(),mono=performance.now();let seq=0,held=false;
fs.writeFileSync(file,JSON.stringify({schema:'tapboard-touch/v1',type:'session',seq:0,t:0,sessionId:'QA-SIMULATED',startedUnixMs:start,tapDurationMs:300})+'\n');
function row(type){const t=performance.now()-mono;fs.appendFileSync(file,JSON.stringify({type,t,seq:++seq,id:1,x:10,y:20,keyType:'TAPPER',...(type==='heartbeat'?{wallUnixMs:start+t}:{})})+'\n');}
const interval=setInterval(()=>{
 const t=performance.now()-mono,down=t%6000<4000;
 if(down!==held){row(down?'down':'up');held=down;}
 row('heartbeat');
 if(t>180000){row('end');clearInterval(interval);}
},100);
console.log('QA synthetic touch journal: '+file);
