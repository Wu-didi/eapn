/* URDF joint graph in the original footprint frame. No IK, interpolation or limits clamp. */
'use strict';
(() => {
  const T = window.REAL_ROBOT_THREE;
  function unpack(text, Type) {
    const binary = atob(text), bytes = new Uint8Array(binary.length);
    for (let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
    const view = new DataView(bytes.buffer), result = new Type(bytes.length/4);
    for(let i=0;i<result.length;i++) result[i]=Type===Float32Array?view.getFloat32(i*4,true):view.getUint32(i*4,true);
    return result;
  }
  window.createRealURDFGeometry = data => Object.fromEntries(Object.entries(data.meshes).map(([name,mesh]) => {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position',new T.BufferAttribute(unpack(mesh.positions_f32_le,Float32Array),3));
    geometry.setIndex(new T.BufferAttribute(unpack(mesh.indices_u32_le,Uint32Array),1));
    geometry.computeVertexNormals();geometry.computeBoundingSphere();
    return [name,geometry];
  }));
  window.createRealURDFRig = (data,geometries) => {
    const root = new T.Group(), tips = {}, pivots = {}, fingerPivots = {}, linkNames = [];
    let gripperValues={};
    root.name='recorded_front_arms_with_grippers';
    const shell = new T.MeshStandardMaterial({color:0xe0e8e2,roughness:.42,metalness:.23});
    const motor = new T.MeshStandardMaterial({color:0x57665f,roughness:.48,metalness:.35});
    const wrist = new T.MeshStandardMaterial({color:0xc5d6cd,roughness:.32,metalness:.36});
    for(const [side,spec] of Object.entries(data.arms)) {
      let parent=root;pivots[side]=[];
      for(const joint of spec.chain) {
        const origin=new T.Group();origin.name=joint.name+'_origin';origin.matrixAutoUpdate=false;
        origin.matrix.set(...joint.origin_matrix_rows);parent.add(origin);
        const motion=new T.Group();motion.name=joint.name;origin.add(motion);
        if(joint.kind!=='fixed') {
          const column=spec.state_names.indexOf(joint.state_name);
          if(joint.kind!=='revolute'||column<0)throw Error('Unsupported or unmapped recorded joint');
          pivots[side].push({motion,column,axis:new T.Vector3(...joint.axis).normalize()});
        }
        if(joint.mesh) {
          if(!geometries[joint.mesh])throw Error('Missing arm mesh');
          const material=joint.mesh==='base_link'||joint.mesh==='link1'?motor:joint.mesh==='link6'?wrist:shell;
          const mesh=new T.Mesh(geometries[joint.mesh],material);mesh.name=joint.child;
          mesh.matrixAutoUpdate=false;mesh.matrix.set(...joint.mesh_origin_matrix_rows);motion.add(mesh);
          linkNames.push(joint.child);
        }
        parent=motion;
      }
      const tip=new T.Object3D();tip.name=side+'_nominal_tcp';tip.position.set(...spec.tcp_offset_m);
      parent.add(tip);tips[side]=tip;
      fingerPivots[side]=[];
      for(const finger of spec.gripper_joints){
        const origin=new T.Group();origin.name=finger.name+'_origin';origin.matrixAutoUpdate=false;
        origin.matrix.set(...finger.origin_matrix_rows);parent.add(origin);
        const motion=new T.Group();motion.name=finger.name;origin.add(motion);
        const mesh=new T.Mesh(geometries[finger.mesh],motor);mesh.name=finger.child;
        mesh.matrixAutoUpdate=false;mesh.matrix.set(...finger.mesh_origin_matrix_rows);motion.add(mesh);
        fingerPivots[side].push({motion,axis:new T.Vector3(...finger.axis).normalize(),scale:finger.opening_scale,name:finger.name});
        linkNames.push(finger.child);
      }
    }
    return {
      root,linkNames,
      setFrame(clip,frame) {
        if(!Number.isInteger(frame)||frame<0||frame>=clip.frames)throw Error('Invalid replay frame');
        for(const side of ['left','right']) {
          const states=clip.states[side][frame];
          for(const {motion,column,axis} of pivots[side]) {
            if(!Number.isFinite(states[column]))throw Error('Invalid measured joint angle');
            motion.quaternion.setFromAxisAngle(axis,states[column]);
          }
          const grip=clip.grippers[side],width=grip.width_m[frame];
          if(!Number.isFinite(width)||width<0||width>data.arms[side].max_opening_m)throw Error('Invalid jaw opening');
          for(const {motion,axis,scale} of fingerPivots[side])motion.position.copy(axis).multiplyScalar(width*scale);
          gripperValues[side]={width_m:width,source:grip.source};
        }
        root.updateMatrixWorld(true);
      },
      tcpPositions() {
        root.updateMatrixWorld(true);
        return Object.fromEntries(Object.entries(tips).map(([side,tip])=>[side,tip.getWorldPosition(new T.Vector3()).toArray()]));
      },
      gripperState() {
        root.updateMatrixWorld(true);
        return Object.fromEntries(['left','right'].map(side=>[side,{...gripperValues[side],
          joint_displacements_m:fingerPivots[side].map(f=>f.motion.position.dot(f.axis)),
          jaw_origins: fingerPivots[side].map(f=>f.motion.getWorldPosition(new T.Vector3()).toArray())}]));
      }
    };
  };
})();
