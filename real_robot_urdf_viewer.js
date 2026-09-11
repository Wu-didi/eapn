/* Additive, offline 3D playback. The existing video player remains the only clock. */
'use strict';
(() => {
  const section=document.getElementById('real-robot-case'),tcp=window.REAL_ROBOT_TCP;
  if(!section||!tcp)return;
  const panel=document.createElement('div');panel.className='real-urdf-panel';panel.id='real-robot-3d';panel.dataset.status='waiting';
  panel.innerHTML=`<div class="real-urdf-heading"><div><b>3D bimanual arm and gripper replay</b><small>Recorded joint angles · linked to the videos above · drag to rotate / wheel to zoom</small></div><div class="real-urdf-actions"><button class="urdf-play" type="button">Play / pause</button><button class="urdf-restart" type="button">Restart</button><select class="urdf-view" aria-label="3D model view"><option value="iso">3D view</option><option value="front">Front</option><option value="top">Top</option></select><button class="urdf-reset-view" type="button">Reset view</button><button class="urdf-trails" type="button" aria-pressed="true">Hide trails</button></div></div>
    <div class="real-urdf-grid">${tcp.clips.map(c=>`<div class="real-urdf-model" data-method="${c.method}"><div class="real-urdf-label"><b class="${c.method}">${c.method==='ours'?'Ours · Our method':'Baseline · Comparison baseline'}</b><span class="real-urdf-gripper-source">Waiting for gripper data…</span></div><div class="real-urdf-viewport"><canvas class="real-urdf-canvas" width="800" height="580" aria-label="${c.method==='ours'?'Our method':'Comparison baseline'} bimanual arm and gripper 3D replay"></canvas></div><div class="real-urdf-frame">Waiting for model…</div><div class="real-urdf-opening"></div></div>`).join('')}</div>
    <p class="real-urdf-status" role="status">The local model loads when this panel approaches the viewport and does not affect video playback above.</p>
    `;
  section.querySelector('.real-tcp-panel').after(panel);
  const status=panel.querySelector('.real-urdf-status');
  const modelCards=[...panel.querySelectorAll('.real-urdf-model')];
  let loaded=false,started=false,visible=false,request=0,pair=[],modelData=null,syncing=false,showTrails=true;
  let resolveReady;const ready=new Promise(resolve=>{resolveReady=resolve;});
  const currentTime=()=>Number(section.dataset.time||0);
  const frameAt=(time,c)=>Math.max(0,Math.min(c.frames-1,Math.floor((time+1e-7)*c.fps)));
  const loadScript=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('Unable to load local resource '+src));document.head.append(s);});
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
        const ended=frame===clip.frames-1?' · END FRAME HELD':'';
        modelCards[i].querySelector('.real-urdf-frame').textContent=`frame ${frame} · recorded t ${tcp.clips[i].times_s[frame].toFixed(3)} s${ended}`;
        modelCards[i].querySelector('.real-urdf-opening').textContent=`Gripper opening · left ${(clip.grippers.left.width_m[frame]*1000).toFixed(1)} mm / right ${(clip.grippers.right.width_m[frame]*1000).toFixed(1)} mm`;
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
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();panel.dataset.status='error';status.textContent='The 3D display context was interrupted. Videos and curves remain available; reload to retry.';});
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
    if(started)return ready;started=true;panel.dataset.status='loading';status.textContent='Loading the local bimanual model…';
    try{
      await Promise.all([loadScript('real_robot_urdf_assets/model_data.js'),loadScript('real_robot_urdf_assets/three.offline.js')]);
      await Promise.all([loadScript('real_robot_urdf_assets/orbit.offline.js'),loadScript('real_robot_urdf_rig.js')]);
      modelData=window.REAL_ROBOT_URDF_DATA;
      if(modelData.version!==2||modelData.kind!=='recorded_state_urdf_replay'||!modelData.grippers_shown||modelData.gripper_mesh_variant!=='piper_slave_meshes'||modelData.urdf_sha256!==tcp.urdf_sha256)throw Error('3D model provenance mismatch; reload the page');
      if(modelData.clips.length!==2||modelData.clips.some((c,i)=>c.method!==tcp.clips[i].method||c.collection_id!==tcp.clips[i].collection_id||c.frames!==tcp.clips[i].frames||c.fps!==tcp.clips[i].fps||c.annotation_sha256!==tcp.clips[i].annotation_sha256))throw Error('3D joint records do not match the displayed videos');
      modelData.clips.forEach((c,i)=>{
        const command=Object.values(c.grippers).some(g=>g.source==='observation_hands_action');
        modelCards[i].querySelector('.real-urdf-gripper-source').textContent=command?'Gripper: command replay · not measured':'Gripper: measured state';
      });
      const T=window.REAL_ROBOT_THREE,geometries=window.createRealURDFGeometry(modelData);
      for(let i=0;i<2;i++)pair.push(makeView(T,modelData.clips[i],i,geometries));
      loaded=true;viewMode();draw();panel.dataset.status='ready';
      status.textContent='Loaded · frame-linked to video · synchronized views · green / orange show the two methods’ bimanual trajectories';
      resolveReady(true);
    }catch(error){panel.dataset.status='error';status.textContent=`3D unavailable: ${error.message}. Videos and TCP curves above remain available.`;resolveReady(false);}
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
    event.target.textContent=showTrails?'Hide trails':'Show trails';event.target.setAttribute('aria-pressed',String(showTrails));schedule();
  });
  window.REAL_ROBOT_URDF_VIEWER={ready,initialize,inspect:()=>({status:panel.dataset.status,showTrails,views:pair.map((v,i)=>({method:modelData.clips[i].method,frame:v.frame,links:v.rig.linkNames,tcp:v.rig.tcpPositions(),grippers:v.rig.gripperState(),camera:v.camera.position.toArray(),trailCounts:Object.fromEntries(Object.entries(v.trails).map(([side,t])=>[side,t.geometry.drawRange.count])),renderCalls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles}))})};
})();
