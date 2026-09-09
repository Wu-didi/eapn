/* Additive, offline 3D playback. The existing video player remains the only clock. */
'use strict';
(() => {
  const section=document.getElementById('real-robot-case'),tcp=window.REAL_ROBOT_TCP;
  if(!section||!tcp)return;
  const panel=document.createElement('div');panel.className='real-urdf-panel';panel.id='real-robot-3d';panel.dataset.status='waiting';
  panel.innerHTML=`<div class="real-urdf-heading"><div><b>3D 双臂与夹爪回放</b><small>真实关节角驱动 · 跟随上方视频 · 拖动旋转 / 滚轮缩放</small></div><div class="real-urdf-actions"><button class="urdf-play" type="button">播放 / 暂停</button><button class="urdf-restart" type="button">从头</button><select class="urdf-view" aria-label="3D 模型视角"><option value="iso">3D 视角</option><option value="front">正面</option><option value="top">俯视</option></select><button class="urdf-reset-view" type="button">复位视角</button><button class="urdf-trails" type="button" aria-pressed="true">隐藏轨迹</button></div></div>
    <div class="real-urdf-grid">${tcp.clips.map(c=>`<div class="real-urdf-model" data-method="${c.method}"><div class="real-urdf-label"><b class="${c.method}">${c.method==='ours'?'Ours · 我们的方法':'Baseline · 对比基线'}</b><span class="real-urdf-gripper-source">等待夹爪数据…</span></div><div class="real-urdf-viewport"><canvas class="real-urdf-canvas" width="800" height="580" aria-label="${c.method==='ours'?'我们的方法':'对比基线'}双臂与夹爪三维回放"></canvas></div><div class="real-urdf-frame">等待加载模型…</div><div class="real-urdf-opening"></div></div>`).join('')}</div>
    <p class="real-urdf-status" role="status">滚动到这里后加载本地模型，不影响上方视频播放。</p>
    <p class="real-urdf-note">浅色为完整轨迹，深色为已播放部分，亮点标出当前 TCP。双臂使用实测关节角；我们的方法使用夹爪实测 state，基线因夹爪 state 全为 0，使用录制的 action 指令示意开合（非实测开度，不用于平滑性指标）。两指对称开合，不猜测动作阶段。机身、衣服和接触过程不显示；网格做了轻量化，关节角与轨迹未平滑，模型坐标未与相机标定。</p>`;
  section.querySelector('.real-tcp-panel').after(panel);
  const status=panel.querySelector('.real-urdf-status');
  const modelCards=[...panel.querySelectorAll('.real-urdf-model')];
  let loaded=false,started=false,visible=false,request=0,pair=[],modelData=null,syncing=false,showTrails=true;
  let resolveReady;const ready=new Promise(resolve=>{resolveReady=resolve;});
  const currentTime=()=>Number(section.dataset.time||0);
  const frameAt=(time,c)=>Math.max(0,Math.min(c.frames-1,Math.floor((time+1e-7)*c.fps)));
  const loadScript=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('无法加载本地资源 '+src));document.head.append(s);});
  function schedule(){if(!loaded||!visible||document.hidden||request)return;request=requestAnimationFrame(()=>{request=0;draw();});}
  function draw(){
    const time=currentTime();
    pair.forEach((view,i)=>{
      const clip=modelData.clips[i],frame=frameAt(time,clip);
      if(view.frame!==frame){
        view.rig.setFrame(clip,frame);view.frame=frame;
        const points=view.rig.tcpPositions();
        for(const side of ['left','right']){
          view.markers[side].position.set(...points[side]);
          view.trails[side].geometry.setDrawRange(0,frame+1);
        }
        modelCards[i].dataset.frame=frame;
        const ended=frame===clip.frames-1?' · 末帧保持':'';
        modelCards[i].querySelector('.real-urdf-frame').textContent=`frame ${frame} · 采集 t ${tcp.clips[i].times_s[frame].toFixed(3)} s${ended}`;
        modelCards[i].querySelector('.real-urdf-opening').textContent=`夹爪开度 · 左 ${(clip.grippers.left.width_m[frame]*1000).toFixed(1)} mm / 右 ${(clip.grippers.right.width_m[frame]*1000).toFixed(1)} mm`;
      }
      const box=view.canvas.parentElement,w=Math.max(1,Math.round(box.clientWidth)),h=Math.max(1,Math.round(box.clientHeight));
      if(view.width!==w||view.height!==h){view.renderer.setSize(w,h,false);view.camera.aspect=w/h;view.camera.updateProjectionMatrix();view.width=w;view.height=h;}
      view.renderer.render(view.scene,view.camera);
    });
    panel.dataset.frames=pair.map(v=>v.frame).join(',');
  }
  function viewMode(mode='iso'){
    if(!loaded)return;
    syncing=true;
    pair.forEach(view=>{
      const p=mode==='top'?[.5,0,2.7]:mode==='front'?[2.2,0,1.05]:[1.58,-1.24,1.8];
      view.camera.up.set(0,0,1);view.camera.position.set(...p);
      // Avoid an exact pole for OrbitControls in top view.
      if(mode==='top')view.camera.position.y=-.001;
      view.controls.target.set(.5,0,1.03);view.controls.update();
    });
    syncing=false;panel.dataset.view=mode;schedule();
  }
  function makeView(T,clip,i,geometries){
    const canvas=modelCards[i].querySelector('canvas');
    const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.outputColorSpace=T.SRGBColorSpace;
    renderer.setClearColor(0xf5f8f3);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();panel.dataset.status='error';status.textContent='3D 显示上下文已中断；视频与曲线仍可使用，刷新页面可重试。';});
    const scene=new T.Scene();scene.background=new T.Color(0xf5f8f3);
    const camera=new T.PerspectiveCamera(39,1,.01,20);camera.up.set(0,0,1);
    const controls=new window.REAL_ROBOT_ORBIT.OrbitControls(camera,canvas);
    controls.enableDamping=false;controls.enablePan=false;controls.minDistance=.7;controls.maxDistance=4;
    scene.add(new T.HemisphereLight(0xffffff,0x809485,2));
    const key=new T.DirectionalLight(0xffffff,2.8);key.position.set(1.5,-2,3);scene.add(key);
    const fill=new T.DirectionalLight(0xc6eadb,1);fill.position.set(-1,2,2);scene.add(fill);
    const ground=new T.Mesh(new T.PlaneGeometry(1.35,1.25),new T.MeshStandardMaterial({color:0xe9efdf,roughness:1}));
    ground.position.set(.52,0,.744);scene.add(ground);
    const grid=new T.GridHelper(1.3,13,0xc3d3c7,0xdbe4d7);grid.rotation.x=Math.PI/2;grid.position.set(.52,0,.746);scene.add(grid);
    const mountMaterial=new T.MeshStandardMaterial({color:0x869c90,roughness:.65,metalness:.2});
    for(const y of [.3,-.3]){const mount=new T.Mesh(new T.CylinderGeometry(.068,.075,.026,32),mountMaterial);mount.rotation.x=Math.PI/2;mount.position.set(.23875,y,.762);scene.add(mount);}
    const rig=window.createRealURDFRig(modelData,geometries);scene.add(rig.root);
    const colors=i===0?{left:0x087d66,right:0x2ca498}:{left:0xcb732f,right:0xe6a65c};
    const trails={},ghosts={},markers={};
    for(const side of ['left','right']){
      const points=tcp.clips[i].arms[side].xyz_m.map(p=>new T.Vector3(...p));
      const ghostGeometry=new T.BufferGeometry().setFromPoints(points);
      ghosts[side]=new T.Line(ghostGeometry,new T.LineBasicMaterial({color:colors[side],transparent:true,opacity:.16,depthWrite:false}));scene.add(ghosts[side]);
      const trailGeometry=new T.BufferGeometry().setFromPoints(points);trailGeometry.setDrawRange(0,1);
      trails[side]=new T.Line(trailGeometry,new T.LineBasicMaterial({color:colors[side],transparent:true,opacity:.85,depthWrite:false}));scene.add(trails[side]);
      ghosts[side].visible=showTrails;trails[side].visible=showTrails;
      markers[side]=new T.Mesh(new T.SphereGeometry(.009,16,12),new T.MeshStandardMaterial({color:colors[side],emissive:colors[side],emissiveIntensity:.25,roughness:.3}));scene.add(markers[side]);
    }
    controls.addEventListener('change',()=>{
      if(syncing)return;syncing=true;
      pair.forEach((other,j)=>{if(i===j)return;other.camera.position.copy(camera.position);other.camera.quaternion.copy(camera.quaternion);other.camera.up.copy(camera.up);other.controls.target.copy(controls.target);other.controls.update();});
      syncing=false;panel.dataset.view='custom';schedule();
    });
    return {canvas,renderer,scene,camera,controls,rig,trails,ghosts,markers,frame:-1};
  }
  async function initialize(){
    if(started)return ready;started=true;panel.dataset.status='loading';status.textContent='正在加载本地双臂模型…';
    try{
      await Promise.all([loadScript('real_robot_urdf_assets/model_data.js'),loadScript('real_robot_urdf_assets/three.offline.js')]);
      await Promise.all([loadScript('real_robot_urdf_assets/orbit.offline.js'),loadScript('real_robot_urdf_rig.js')]);
      modelData=window.REAL_ROBOT_URDF_DATA;
      if(modelData.version!==2||modelData.kind!=='recorded_state_urdf_replay'||!modelData.grippers_shown||modelData.gripper_mesh_variant!=='piper_slave_meshes'||modelData.urdf_sha256!==tcp.urdf_sha256)throw Error('3D 模型来源不匹配，请刷新页面');
      if(modelData.clips.length!==2||modelData.clips.some((c,i)=>c.method!==tcp.clips[i].method||c.collection_id!==tcp.clips[i].collection_id||c.frames!==tcp.clips[i].frames||c.fps!==tcp.clips[i].fps||c.annotation_sha256!==tcp.clips[i].annotation_sha256))throw Error('3D 关节记录与视频不匹配');
      modelData.clips.forEach((c,i)=>{
        const command=Object.values(c.grippers).some(g=>g.source==='observation_hands_action');
        modelCards[i].querySelector('.real-urdf-gripper-source').textContent=command?'夹爪：指令回放 · 非实测':'夹爪：实测状态';
      });
      const T=window.REAL_ROBOT_THREE,geometries=window.createRealURDFGeometry(modelData);
      for(let i=0;i<2;i++)pair.push(makeView(T,modelData.clips[i],i,geometries));
      loaded=true;viewMode();draw();panel.dataset.status='ready';
      status.textContent='已加载 · 与视频逐帧联动 · 两侧视角同步 · 绿色 / 橙色为两种方法的双臂轨迹';
      resolveReady(true);
    }catch(error){panel.dataset.status='error';status.textContent=`3D 暂不可用：${error.message}。上方视频和 TCP 曲线不受影响。`;resolveReady(false);}
    return ready;
  }
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){initialize();schedule();}},{rootMargin:'250px'});observer.observe(panel);
  new MutationObserver(schedule).observe(section,{attributes:true,attributeFilter:['data-time']});
  new ResizeObserver(schedule).observe(panel);
  document.addEventListener('visibilitychange',schedule);
  panel.querySelector('.urdf-play').addEventListener('click',()=>section.querySelector('.controls .play').click());
  panel.querySelector('.urdf-restart').addEventListener('click',()=>section.querySelector('.controls .reset').click());
  panel.querySelector('.urdf-view').addEventListener('change',event=>viewMode(event.target.value));
  panel.querySelector('.urdf-reset-view').addEventListener('click',()=>{panel.querySelector('.urdf-view').value='iso';viewMode();});
  panel.querySelector('.urdf-trails').addEventListener('click',event=>{
    showTrails=!showTrails;pair.forEach(v=>{for(const side of ['left','right']){v.trails[side].visible=showTrails;v.ghosts[side].visible=showTrails;}});
    event.target.textContent=showTrails?'隐藏轨迹':'显示轨迹';event.target.setAttribute('aria-pressed',String(showTrails));schedule();
  });
  window.REAL_ROBOT_URDF_VIEWER={ready,initialize,inspect:()=>({status:panel.dataset.status,showTrails,views:pair.map((v,i)=>({method:modelData.clips[i].method,frame:v.frame,links:v.rig.linkNames,tcp:v.rig.tcpPositions(),grippers:v.rig.gripperState(),camera:v.camera.position.toArray(),trailCounts:Object.fromEntries(Object.entries(v.trails).map(([side,t])=>[side,t.geometry.drawRange.count])),renderCalls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles}))})};
})();
