// Color grade: a 3D look-up table built in code (warm highlights, lifted
// deep brown shadows, high contrast, slightly washed out), plus optional soft
// film grain and a vignette. Runs after tone mapping in display space.
//
// v0.13 adds the lens: a contrast-adaptive sharpen (phones render under native
// resolution, this puts the edge back without halos), a radial speed blur that
// pulls the frame toward the middle at speed, and a faint color split at the
// edges of the frame. All in this one pass, a handful of taps each.
import * as THREE from 'three';

function buildLut(N = 16) {
  const data = new Uint8Array(N * N * N * 4);
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
    let R = r / (N - 1), G = g / (N - 1), B = b / (N - 1);
    const L = 0.299 * R + 0.587 * G + 0.114 * B;
    // washed out: pull saturation down a little
    R = L + (R - L) * 0.94; G = L + (G - L) * 0.94; B = L + (B - L) * 0.94;
    // soft S curve
    const curve = (x) => { const t = x * x * (3 - 2 * x); return x + (t - x) * 0.55; }; // high contrast S curve
    R = curve(R); G = curve(G); B = curve(B);
    // highlights warm, shadows teal, blacks lifted toward plum
    const hi = smooth(0.45, 1, L), lo = 1 - smooth(0, 0.4, L);
    R += 0.07 * hi + 0.02 * lo; G += 0.02 * hi + 0.005 * lo; B += -0.07 * hi - 0.01 * lo; // golden highlights, deep brown shadows
    R = 0.016 + R * 0.984; G = 0.01 + G * 0.985; B = 0.006 + B * 0.97;
    const i = (r + g * N + b * N * N) * 4;
    data[i] = Math.min(255, Math.max(0, R * 255)); data[i + 1] = Math.min(255, Math.max(0, G * 255)); data[i + 2] = Math.min(255, Math.max(0, B * 255)); data[i + 3] = 255;
  }
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

export function makeGradePass(ShaderPass) {
  const N = 16;
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, tLut: { value: buildLut(N) }, uTime: { value: 0 }, uGrain: { value: 1 }, uNight: { value: 0 }, uDusk: { value: 0 }, uSize: { value: N },
      uRes: { value: new THREE.Vector2(1 / 1280, 1 / 720) }, // one texel
      uSharp: { value: 0.3 }, // 0 off; phones a little more, since they render under native size
      uSpeed: { value: 0 }, // 0..1 radial blur toward the middle (driving fast)
      uSplit: { value: 0.6 }, // color split at the frame edge, in texels at the corner
      uWet: { value: 0 }, // rain: a cooler, flatter grade
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      precision highp sampler3D;
      uniform sampler2D tDiffuse; uniform sampler3D tLut; uniform float uTime, uGrain, uNight, uDusk, uSize, uSharp, uSpeed, uSplit, uWet;
      uniform vec2 uRes;
      varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 toC = vec2(0.5) - vUv; float d = length(toC);
        // color split: red and blue pulled apart along the radius, only toward the edges
        vec2 ca = toC * d * uSplit * 6.0 * uRes;
        vec4 c = texture2D(tDiffuse, vUv);
        c.r = texture2D(tDiffuse, vUv + ca).r; c.b = texture2D(tDiffuse, vUv - ca).b;
        // sharpen: lift the pixel away from its four neighbours, clamped to their range so there are no halos
        if (uSharp > 0.001) {
          vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, uRes.y)).rgb, s = texture2D(tDiffuse, vUv - vec2(0.0, uRes.y)).rgb;
          vec3 e = texture2D(tDiffuse, vUv + vec2(uRes.x, 0.0)).rgb, w = texture2D(tDiffuse, vUv - vec2(uRes.x, 0.0)).rgb;
          vec3 mn = min(min(n, s), min(e, w)), mx = max(max(n, s), max(e, w));
          vec3 sharp = c.rgb + (c.rgb - (n + s + e + w) * 0.25) * uSharp;
          c.rgb = clamp(sharp, min(mn, c.rgb), max(mx, c.rgb));
        }
        // speed: streak toward the middle, more at the edges, the center stays readable
        if (uSpeed > 0.001) {
          vec2 st = toC * uSpeed * 0.055 * smoothstep(0.08, 0.5, d);
          vec3 acc = c.rgb;
          acc += texture2D(tDiffuse, vUv + st * 0.2).rgb; acc += texture2D(tDiffuse, vUv + st * 0.4).rgb;
          acc += texture2D(tDiffuse, vUv + st * 0.6).rgb; acc += texture2D(tDiffuse, vUv + st * 0.8).rgb; acc += texture2D(tDiffuse, vUv + st).rgb;
          c.rgb = acc / 6.0;
        }
        vec3 uvw = clamp(c.rgb, 0.0, 1.0) * ((uSize - 1.0) / uSize) + 0.5 / uSize;
        vec3 g = texture(tLut, uvw).rgb;
        g = mix(g, g * vec3(0.9, 0.94, 1.08), uNight * 0.6);
        g = mix(g, pow(max(g, 0.0), vec3(0.82)) + vec3(0.018, 0.02, 0.034), uNight); // lift night shadows, deep blue-brown floor
        // rain: cooler and a touch flatter, like a wet grey afternoon
        g = mix(g, (g - 0.5) * 0.92 + 0.5 + vec3(-0.015, 0.0, 0.03), uWet * 0.7);
        g *= 1.0 - smoothstep(0.45, 0.95, d) * (0.45 - 0.2 * uNight);
        // soft grain: low amplitude, coarser hash so phones do not sparkle
        float n = hash(vUv * 280.0 + fract(uTime * 2.1) * 37.0) - 0.5;
        g += n * 0.012 * uGrain;
        gl_FragColor = vec4(g, c.a);
      }`,
  });
}
