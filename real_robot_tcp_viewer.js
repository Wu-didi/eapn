/* Measured-state URDF reconstruction. Never render without actual trace data. */
'use strict';
window.createRealTCPViewer = function(section, data) {
  if (!data) return null;
  if (data.kind !== 'urdf_fk_from_measured_state') throw Error('Unexpected TCP provenance');
  const videoClips = window.REAL_ROBOT_DEMO?.clips;
  if (!videoClips || data.clips.length !== 2 || data.clips.some((c,i) =>
    c.method !== videoClips[i].method || c.collection_id !== videoClips[i].collection_id ||
    c.frames !== videoClips[i].frames || c.fps !== videoClips[i].fps ||
    c.times_s.length !== c.frames || ['left','right'].some(side =>
      c.arms[side].xyz_m.length !== c.frames || c.arms[side].speed_m_s.length !== c.frames))) {
    throw Error('TCP trace does not match the displayed video pair');
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const colors = ['#087d66', '#cb732f'];
  const wrap = document.createElement('div');
  wrap.className = 'tcp-panel real-tcp-panel';
  const methodLabel = c => c.method === 'ours' ? 'Ours · Our method' : 'Baseline · Comparison baseline';
  wrap.innerHTML = `<div class="tcp-heading"><div><b>Real-robot TCP trajectories · forward-kinematics reconstruction</b><small>Measured joint state → URDF → end-effector coordinates · metres · no smoothing</small></div><div class="real-tcp-selectors"><label>Arm <select class="real-tcp-arm"><option value="left">Left</option><option value="right">Right</option></select></label><label>View <select class="real-tcp-projection"><option value="iso">3D isometric</option><option value="xy">XY</option><option value="xz">XZ</option><option value="yz">YZ</option></select></label></div></div>
    <p class="tcp-caption real-tcp-definition"></p>
    <div class="tcp-spatial">${data.clips.map((c,i)=>`<div><div class="tcp-label"><b style="color:${colors[i]}">${methodLabel(c)}</b><span>Collection ${c.collection_id}</span></div><canvas class="tcp-plot" width="800" height="490" role="img" aria-label="${methodLabel(c)} forward-kinematics TCP trajectory"></canvas><div class="tcp-coordinates"></div></div>`).join('')}</div>
    <div class="tcp-curve-head"><b>TCP motion curves linked to the videos</b><select class="real-tcp-signal" aria-label="Real-robot TCP signal"><option value="speed">End-effector speed (m/s)</option><option value="x">X position (m)</option><option value="y">Y position (m)</option><option value="z">Z position (m)</option></select></div>
    <p class="tcp-caption"><span class="dot green"></span>Ours <span class="dot orange"></span>Baseline · dark trajectories show the played portion; dots mark the position at the current exported frame.</p>
    <p class="tcp-caption"><a href="real_robot_tcp.json" download>Download complete bimanual TCP coordinates, timestamps and model provenance</a></p>`;
  section.querySelector('.controls').after(wrap);
  const spatial = [...wrap.querySelectorAll('.tcp-plot')];
  const coordinates = [...wrap.querySelectorAll('.tcp-coordinates')];
  const clipElements = [...section.querySelectorAll('.clips > .clip')];
  const curves = data.clips.map((clip,i) => {
    const box = document.createElement('div');
    box.className = 'real-tcp-under-video';
    const canvas = document.createElement('canvas');
    canvas.className = 'tcp-curve real-tcp-curve';
    canvas.width = 800; canvas.height = 220;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `${methodLabel(clip)} TCP motion curve`);
    canvas.dataset.method = clip.method;
    canvas.dataset.collectionId = clip.collection_id;
    box.append(canvas); clipElements[i].append(box);
    return canvas;
  });
  const arm = wrap.querySelector('.real-tcp-arm');
  const projection = wrap.querySelector('.real-tcp-projection');
  const signal = wrap.querySelector('.real-tcp-signal');
  let currentTime = 0;
  const frameAt = (time, c) => Math.max(0, Math.min(c.frames-1, Math.floor((time+1e-7)*c.fps)));
  const stroke = (ctx, points, color, width=2) => {
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();let started=false;
    for(const point of points){if(!point){started=false;continue;}if(started)ctx.lineTo(...point);else ctx.moveTo(...point);started=true;}
    ctx.stroke();
  };
  const dot = (ctx, p, color, radius) => {ctx.fillStyle=color;ctx.beginPath();ctx.arc(...p,radius,0,Math.PI*2);ctx.fill();};
  function project(p) {
    if(projection.value==='xy')return [p[0],-p[1]];
    if(projection.value==='xz')return [p[0],-p[2]];
    if(projection.value==='yz')return [p[1],-p[2]];
    return [(p[0]-p[1])/Math.sqrt(2),(p[0]+p[1])/Math.sqrt(6)-p[2]*Math.sqrt(2/3)];
  }
  function draw(time) {
    currentTime=time;
    const curveWidth=window.matchMedia('(max-width: 700px)').matches?400:800;
    curves.forEach(curve=>{if(curve.width!==curveWidth)curve.width=curveWidth;});
    const indices=data.clips.map(c=>frameAt(time,c));
    wrap.dataset.frames=indices.join(',');wrap.dataset.arm=arm.value;
    wrap.dataset.projection=projection.value;wrap.dataset.signal=signal.value;
    const spec=data.arms[arm.value];
    wrap.querySelector('.real-tcp-definition').textContent=`${arm.value === 'left' ? 'Left' : 'Right'} symmetric gripper center, following the inference end-effector definition; coordinates use the URDF footprint frame and are not camera-calibrated. Both methods use identical coordinate ranges and scale.`;
    const points=data.clips.map(c=>c.arms[arm.value].xyz_m);
    const all=points.flat();
    const lows=[0,1,2].map(d=>Math.min(...all.map(p=>p[d])));
    const highs=[0,1,2].map(d=>Math.max(...all.map(p=>p[d])));
    const corners=Array.from({length:8},(_,i)=>[0,1,2].map(d=>(i&(1<<d))?highs[d]:lows[d]));
    const projected=corners.map(project);
    const bounds=[0,1].map(d=>[Math.min(...projected.map(p=>p[d])),Math.max(...projected.map(p=>p[d]))]);
    spatial.forEach((canvas,i)=>{
      const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
      ctx.fillStyle='#f8faf7';ctx.fillRect(0,0,w,h);
      const scale=Math.min((w-165)/Math.max(.05,bounds[0][1]-bounds[0][0]),(h-125)/Math.max(.05,bounds[1][1]-bounds[1][0]));
      const xy=p=>{const q=project(p);return [w/2+(q[0]-(bounds[0][0]+bounds[0][1])/2)*scale,h/2+(q[1]-(bounds[1][0]+bounds[1][1])/2)*scale];};
      for(let a=0;a<8;a++)for(let d=0;d<3;d++)if(!(a&(1<<d)))stroke(ctx,[xy(corners[a]),xy(corners[a|(1<<d)])],'#d9e3db',1);
      ctx.font='18px system-ui';ctx.fillStyle='#66766d';
      ['X','Y','Z'].forEach((letter,d)=>{if(projection.value!=='iso'&&!projection.value.includes(letter.toLowerCase()))return;const p=xy(corners[1<<d]);ctx.fillText(`${letter} ${highs[d].toFixed(2)}`,Math.min(w-100,Math.max(10,p[0]+8)),Math.max(22,p[1]-8));});
      const pp=points[i].map(xy),f=indices[i],tail=Math.max(0,f-29);
      stroke(ctx,pp,'#d1ddd5',2);stroke(ctx,pp.slice(0,f+1),colors[i],2.4);stroke(ctx,pp.slice(tail,f+1),colors[i],4);
      pp.slice(tail,f+1).forEach(p=>dot(ctx,p,colors[i],2.5));
      dot(ctx,pp[f],'#fff',9);dot(ctx,pp[f],colors[i],6);
      ctx.fillStyle='#66766d';ctx.fillText('Raw samples / identical coordinate scale',20,h-20);
      const p=points[i][f];
      coordinates[i].textContent=`frame ${f} · t ${data.clips[i].times_s[f].toFixed(3)} s · X ${p[0].toFixed(3)} / Y ${p[1].toFixed(3)} / Z ${p[2].toFixed(3)} m`;
    });
    const dindex={x:0,y:1,z:2}[signal.value];
    const values=data.clips.map(c=>signal.value==='speed'?c.arms[arm.value].speed_m_s:c.arms[arm.value].xyz_m.map(p=>p[dindex]));
    const valid=values.flat().filter(v=>v!==null && Number.isFinite(v));
    let lo=Math.min(...valid),hi=Math.max(...valid);
    const padding=Math.max((hi-lo)*.08,1e-4);
    lo=signal.value==='speed'?0:lo-padding;hi+=padding;
    const xmax=Math.max(...data.clips.map(c=>c.times_s.at(-1)));
    curves.forEach((curve,i)=>{
      const ctx=curve.getContext('2d'),w=curve.width,h=curve.height;
      const left=76,right=w-20,top=32,bottom=h-38;
      const xy=(t,v)=>[left+t/xmax*(right-left),bottom-(v-lo)/(hi-lo)*(bottom-top)];
      ctx.fillStyle='#fafcf9';ctx.fillRect(0,0,w,h);ctx.font='18px system-ui';ctx.fillStyle='#66766d';
      for(let j=0;j<=3;j++){const v=lo+(hi-lo)*j/3;stroke(ctx,[xy(0,v),xy(xmax,v)],'#dce5de',1);ctx.fillText(v.toFixed(3),8,xy(0,v)[1]+6);}
      for(let j=0;j<=3;j++){const t=xmax*j/3;ctx.textAlign=j===0?'left':j===3?'right':'center';ctx.fillText(t.toFixed(1)+' s',xy(t,lo)[0],bottom+27);}ctx.textAlign='left';
      const vv=values[i];
      const tt=data.clips[i].times_s,f=indices[i];
      const pp=vv.map((v,j)=>v===null?null:xy(tt[j],v));
      stroke(ctx,pp,colors[i]+'55',1.7);stroke(ctx,pp.slice(0,f+1),colors[i],2.7);
      ctx.setLineDash([5,7]);stroke(ctx,[xy(tt[f],lo),xy(tt[f],hi)],colors[i],1.6);ctx.setLineDash([]);
      if(pp[f])dot(ctx,pp[f],colors[i],5);
      ctx.fillStyle='#20382e';ctx.fillText(`${arm.value==='left'?'Left arm':'Right arm'} · ${signal.value==='speed'?'TCP speed (m/s)':`TCP ${signal.value.toUpperCase()} (m)`}`,left,23);
      curve.dataset.frame=f;curve.dataset.arm=arm.value;curve.dataset.signal=signal.value;
      curve.dataset.time=tt[f];curve.dataset.range=[lo,hi,xmax].join(',');
    });
  }
  [arm,projection,signal].forEach(select=>select.addEventListener('change',()=>draw(currentTime)));
  window.addEventListener('resize',()=>draw(currentTime));
  draw(0);return {draw};
};
