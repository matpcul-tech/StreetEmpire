// Demo crew member: MakeHuman CC0 body, fabric painted hoodie/jeans/sneakers,
// Quaternius UAL idle/walk/run retargeted onto the same bone names.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { retargetClip } from 'three/addons/utils/SkeletonUtils.js';

function boneAlias(bone) {
  if (bone.name === 'head') return 'Head';
  if (bone.name === 'Root') return 'root';
  return bone.name;
}

function loadTex(loader, url, srgb) {
  return new Promise((resolve, reject) => {
    loader.load(url, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      resolve(t);
    }, undefined, reject);
  });
}

function paintMaterial(hoodie, jeans) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.04,
    envMapIntensity: 0.28,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uHoodie = { value: hoodie.c };
    shader.uniforms.uJeans = { value: jeans.c };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 bpos;\nvarying vec3 vBpos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBpos = bpos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vBpos;
        uniform sampler2D uHoodie, uJeans;
        float hash31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      `)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 p = vBpos;
        float ax = abs(p.x);
        float y = p.y;
        float n1 = hash31(p * 28.0);
        vec2 uvH = p.zy * 2.4 + vec2(p.x * 0.4, 0.0);
        vec2 uvJ = vec2(p.x * 3.4 + p.z * 1.2, y * 2.8);
        vec3 hoodC = texture2D(uHoodie, uvH).rgb * vec3(0.16, 0.48, 0.24);
        vec3 jeanC = texture2D(uJeans, uvJ).rgb * vec3(0.10, 0.13, 0.22);
        vec3 skin = vec3(0.50, 0.34, 0.24) * (0.9 + 0.12 * n1);
        vec3 hair = vec3(0.07, 0.055, 0.045) * (0.85 + 0.25 * n1);
        vec3 shoe = vec3(0.82, 0.80, 0.74);
        bool head = (y > 1.46 && ax < 0.15);
        bool hand = (ax > 0.42 && y < 1.30);
        bool foot = (y < 0.16);
        bool arm = (ax > 0.18 && y > 1.05 && !head && !hand);
        bool leg = (y < 1.02 && !foot && !hand);
        vec3 col = skin;
        if (foot) {
          col = y < 0.045 ? vec3(0.12, 0.12, 0.13) : shoe;
          if (y > 0.045 && y < 0.08) col *= 0.55;
          if (p.z > 0.08 && y < 0.11) col *= 0.75;
        } else if (leg) {
          col = jeanC;
          if (y > 0.97) col *= 0.55;
        } else if (hand) {
          col = skin;
        } else if (head) {
          bool hairOn = (y > 1.575 || (p.z < 0.03 && y > 1.54) || (ax > 0.055 && y > 1.55));
          bool hoodBack = (p.z < -0.015 && y < 1.60);
          if (hoodBack) { col = hoodC * 0.92; }
          else if (hairOn) { col = hair; }
          else {
            col = skin;
            vec2 e = vec2(ax - 0.033, (y - 1.585) * 1.35);
            if (length(e) < 0.014) col *= 0.55;
            if (length(vec2(ax - 0.033, y - 1.585)) < 0.007) col = vec3(0.10, 0.08, 0.07);
            if (y > 1.548 && y < 1.560 && ax < 0.022) col *= vec3(0.75, 0.45, 0.42);
          }
        } else {
          col = hoodC;
          if (y < 1.06) col *= 0.78;
          if (p.z > 0.04 && y > 1.12 && y < 1.28 && ax < 0.10) col *= 0.82;
          if (arm && ax > 0.42) col *= 0.72;
        }
        diffuseColor.rgb *= col;
      `);
  };
  mat.customProgramCacheKey = () => 'se-demo-crew-paint-v1';
  return mat;
}

function gatherBones(root) {
  const byName = new Map();
  root.traverse((o) => { if (o.name) byName.set(o.name, o); });
  return byName;
}

function attachSkeleton(root) {
  if (root.skeleton) return root;
  const list = [];
  root.traverse((o) => {
    if (o.isBone || o.name === 'root' || o.name === 'pelvis' || o.name === 'Head'
      || /^(spine|clavicle|upperarm|lowerarm|hand|thigh|calf|foot|ball|neck|index|middle|ring|pinky|thumb)/.test(o.name)) {
      list.push(o);
    }
  });
  root.skeleton = new THREE.Skeleton([...new Set(list)]);
  return root;
}

export async function loadCrew(base) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const texLoader = new THREE.TextureLoader();
  const [crewG, ualG, hc, hn, hr, jc, jn, jr] = await Promise.all([
    loader.loadAsync(`${base}demo/street/models/crew.glb`),
    loader.loadAsync(`${base}demo/street/models/ual-loco.glb`),
    loadTex(texLoader, `${base}demo/street/tex/hoodie_c.webp`, true),
    loadTex(texLoader, `${base}demo/street/tex/hoodie_n.webp`, false),
    loadTex(texLoader, `${base}demo/street/tex/hoodie_r.webp`, false),
    loadTex(texLoader, `${base}demo/street/tex/jeans_c.webp`, true),
    loadTex(texLoader, `${base}demo/street/tex/jeans_n.webp`, false),
    loadTex(texLoader, `${base}demo/street/tex/jeans_r.webp`, false),
  ]);

  const root = crewG.scene;
  root.updateMatrixWorld(true);
  let mesh = null;
  root.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
  if (!mesh) throw new Error('crew.glb has no skinned mesh');
  const pos = mesh.geometry.attributes.position;
  const bpos = new Float32Array(pos.count * 3);
  let ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    bpos[i * 3] = x; bpos[i * 3 + 1] = y; bpos[i * 3 + 2] = z;
    ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
  }
  // meshopt stores positions in a packed range (about -1 to 1). Stretch them
  // back to meters, feet at 0, head near 1.68, so clothing bands line up.
  const sy = 1.68 / Math.max(0.001, ymax - ymin);
  for (let i = 0; i < pos.count; i++) {
    bpos[i * 3] *= sy;
    bpos[i * 3 + 1] = (bpos[i * 3 + 1] - ymin) * sy;
    bpos[i * 3 + 2] *= sy;
  }
  mesh.geometry.setAttribute('bpos', new THREE.BufferAttribute(bpos, 3));
  mesh.material = paintMaterial({ c: hc, n: hn, r: hr }, { c: jc, n: jn, r: jr });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  const src = attachSkeleton(ualG.scene);
  src.updateMatrixWorld(true);
  const srcBones = gatherBones(src);
  if (!srcBones.get('pelvis')) {
    throw new Error('ual-loco.glb is missing pelvis, cannot retarget');
  }

  const names = {};
  for (const b of mesh.skeleton.bones) names[b.name] = boneAlias(b);
  const opt = {
    hip: 'pelvis',
    getBoneName: boneAlias,
    names,
    useFirstFramePosition: true,
    preserveBonePositions: true,
  };

  const want = ['Idle_Loop', 'Walk_Loop', 'Sprint_Loop', 'Jog_Fwd_Loop'];
  const clips = {};
  for (const clip of ualG.animations) {
    if (!want.includes(clip.name)) continue;
    try {
      clips[clip.name] = retargetClip(mesh, src, clip, opt);
      clips[clip.name].name = clip.name;
    } catch (err) {
      console.warn('retarget failed', clip.name, err);
    }
  }
  if (!clips.Walk_Loop && clips.Jog_Fwd_Loop) clips.Walk_Loop = clips.Jog_Fwd_Loop;
  if (!clips.Idle_Loop || !clips.Walk_Loop) {
    throw new Error('retarget produced no idle/walk clips: ' + Object.keys(clips).join(','));
  }
  if (!clips.Sprint_Loop && clips.Jog_Fwd_Loop) clips.Sprint_Loop = clips.Jog_Fwd_Loop;

  const group = new THREE.Group();
  group.add(root);
  const mixer = new THREE.AnimationMixer(mesh);
  const act = {};
  for (const [n, c] of Object.entries(clips)) {
    act[n] = mixer.clipAction(c);
    act[n].setLoop(THREE.LoopRepeat, Infinity);
    act[n].clampWhenFinished = false;
  }
  act.Walk_Loop.enabled = true;
  act.Walk_Loop.play();
  let cur = 'Walk_Loop';

  function play(name, fade = 0.18) {
    if (!act[name] || name === cur) return;
    const next = act[name];
    const prev = act[cur];
    next.reset().setEffectiveWeight(1).play();
    if (prev) prev.crossFadeTo(next, fade, false);
    cur = name;
  }

  const footL = mesh.skeleton.bones.find((b) => b.name === 'foot_l');
  const footR = mesh.skeleton.bones.find((b) => b.name === 'foot_r');
  function plantFeet() {
    group.updateMatrixWorld(true);
    mesh.skeleton.update();
    mesh.updateMatrixWorld(true);
    const yl = footL ? footL.matrixWorld.elements[13] : 0;
    const yr = footR ? footR.matrixWorld.elements[13] : yl;
    const minY = Math.min(yl, yr);
    if (Number.isFinite(minY)) group.position.y -= (minY - 0.045);
  }
  mixer.update(0);
  plantFeet();

  return {
    group, mesh, mixer, act, play,
    update(dt) { mixer.update(dt); plantFeet(); },
    get clipNames() { return Object.keys(act); },
    get current() { return cur; },
  };
}
