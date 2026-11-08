// Checks the bone name matching that lets kit characters play the game's clips
// (src/retarget.js), across the rigs the art team is likely to send.
// Run: node tools/retarget-test.mjs
import { canonical } from '../src/retarget.js';

const cases = {
  // Meshy auto rig (Humanoid)
  Hips: 'pelvis', Spine: 'spine', Spine01: 'spine', Spine02: 'spine', neck: 'neck_01', Head: 'Head', head_end: null,
  LeftShoulder: 'clavicle_l', LeftArm: 'upperarm_l', LeftForeArm: 'lowerarm_l', LeftHand: 'hand_l',
  RightShoulder: 'clavicle_r', RightArm: 'upperarm_r', RightForeArm: 'lowerarm_r', RightHand: 'hand_r',
  LeftUpLeg: 'thigh_l', LeftLeg: 'calf_l', LeftFoot: 'foot_l', LeftToeBase: 'ball_l', LeftToe_End: null,
  RightUpLeg: 'thigh_r', RightLeg: 'calf_r', RightFoot: 'foot_r', RightToeBase: 'ball_r',
  // Mixamo (three.js sanitizes the colon away)
  mixamorigHips: 'pelvis', 'mixamorig:Spine2': 'spine', mixamorigRightArm: 'upperarm_r', mixamorigLeftHandIndex1: 'index_01_l',
  mixamorigRightHandThumb3: 'thumb_03_r', mixamorigLeftHandPinky2: 'pinky_02_l', mixamorigHeadTop_End: null, mixamorigLeftHandIndex4: null,
  // the game's own rig (Unreal style)
  pelvis: 'pelvis', spine_03: 'spine', neck_01: 'neck_01', clavicle_l: 'clavicle_l', upperarm_r: 'upperarm_r', lowerarm_l: 'lowerarm_l',
  thigh_r: 'thigh_r', calf_l: 'calf_l', ball_r: 'ball_r', index_04_leaf_l: null, middle_02_r: 'middle_02_r', root: null,
  // Blender Rigify deform bones and 3ds Max Biped
  'DEF-upper_arm.L': 'upperarm_l', 'DEF-forearm.R': 'lowerarm_r', 'DEF-thigh.L': 'thigh_l', 'DEF-shin.R': 'calf_r',
  'Bip01 R Forearm': 'lowerarm_r', 'Bip01 L Thigh': 'thigh_l', 'Bip01 Pelvis': 'pelvis',
  // twist and helper bones are left alone
  upperarm_twist_01_l: null, LeftArmRoll: null, 'IK_foot_l': null,
};

let fail = 0;
for (const [name, want] of Object.entries(cases)) {
  const got = canonical(name);
  if (got !== want) { fail++; console.log(`FAIL ${name}: got ${got}, want ${want}`); }
}
console.log(fail ? `${fail} of ${Object.keys(cases).length} bone names wrong` : `all ${Object.keys(cases).length} bone names match`);
process.exitCode = fail ? 1 : 0;
