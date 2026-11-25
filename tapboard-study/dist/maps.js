let importedMaps=null;
function renderMaps() {
  $('mapPanel').hidden=!!active || finalizing;
  if($('mapPanel').hidden) return;
  const code=$('mapCondition').value, condition=TapParagraph.conditions[code];
  const source=importedMaps?.trials ?? records;
  $('mapSource').textContent=importedMaps?.name ?? '현재 브라우저 기록';
  $('localMaps').hidden=!importedMaps;
  const group=source.filter(r=>r.paragraph && r.condition===code && r.kind===$('mapKind').value);
  const valid=group.filter(r=>r.status==='completed' && r.metrics?.touch_quality==='complete');
  $('maps').hidden=!valid.length;
  const excluded=group.length-valid.length;
  const note=excluded?' · 미완료/터치 누락 '+excluded+'회 제외':'';
  if(!valid.length) {
    $('mapStatus').textContent='선택한 조건과 측정 구분에 완료된 기록이 없습니다.'+note;
    return;
  }
  const plots=valid.map(r=>({g:r.paragraph.geometry,home:r.paragraph.home,strokes:TapParagraph.strokes(r)}));
  const count=plots.reduce((n,p)=>n+p.strokes.length,0);
  $('mapStatus').textContent=valid.length+'문단 · 탐색 '+count+'회 · 홈키는 왼쪽 검지(파랑), 오른쪽 검지(주황)'+note;
  const title=code+' · '+condition.keyboard+' · '+(condition.surface==='film'?'필름':'맨유리');
  for(const kind of ['home','stroke']) drawStudyMap($(kind+'Map'),plots,kind,title);
}
function drawStudyMap(canvas,plots,kind,title) {
  const ctx=canvas.getContext('2d');
  let minX=0,minY=0,maxX=15,maxY=5.5;
  const units=(p,g)=>[(p.x-g.left)/g.pitchPx,(p.y-g.top)/g.pitchPx];
  for(const plot of plots) {
    const paths=kind==='home'?[plot.home]:plot.strokes.map(s=>s.points);
    for(const path of paths) for(const p of path) {
      const [x,y]=units(p,plot.g);
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    }
  }
  const size=Math.min((canvas.width-24)/(maxX-minX),(canvas.height-42)/(maxY-minY));
  const x0=(canvas.width-(maxX-minX)*size)/2-minX*size,y0=32-minY*size;
  const screen=(p,g)=>{const [x,y]=units(p,g);return [x0+x*size,y0+y*size];};
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#233039';ctx.font='15px system-ui';ctx.textAlign='left';
  ctx.fillText(title+' · '+(kind==='home'?'F·J 최초 접촉점':'문장 입력 중 탐색 경로'),12,20);
  ctx.textAlign='center';ctx.font=Math.max(8,size*.22)+'px system-ui';
  const base=plots[0].g;
  for(const k of base.keys) {
    const [x,y]=screen(k,base),w=k.w/base.pitchPx*size,h=k.h/base.pitchPx*size;
    ctx.fillStyle=['f','j'].includes(k.label)?'#e7f3f0':'#f6f7f8';
    ctx.fillRect(x,y,w,h);ctx.strokeStyle='#b7c1c6';ctx.lineWidth=1;ctx.strokeRect(x,y,w,h);
    ctx.fillStyle='#35464d';ctx.fillText(k.label,x+w/2,y+h/2+4);
  }
  for(const plot of plots) {
    if(kind==='home') for(const p of plot.home) {
      ctx.fillStyle=p.target==='f'?'rgba(19,97,198,.65)':'rgba(209,89,15,.65)';
      ctx.beginPath();ctx.arc(...screen(p,plot.g),4,0,Math.PI*2);ctx.fill();
    }
    if(kind==='stroke') for(const s of plot.strokes) {
      ctx.beginPath();ctx.strokeStyle='rgba(187,31,42,.55)';ctx.lineWidth=1.5;
      s.points.forEach((p,i)=>{const xy=screen(p,plot.g);if(i===0)ctx.moveTo(...xy);else ctx.lineTo(...xy);});
      ctx.stroke();
    }
  }
}
