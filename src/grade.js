// Color grade: a 3D look-up table built in code (warm highlights, lifted
// deep brown shadows, high contrast, slightly washed out), plus optional soft
// film grain and a vignette. Runs after tone mapping in display space.
import * as THREE from 'three';

function buildLut(N = 16) {
  const data = new Uint8Array(N * N * N * 4);
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
    let R = r / (N - 1), G = g / (N - 1), B = b / (N - 1);
    const L = 0.299 * R + 0.587 * G + 0.114 * B;
    // washed out: pull saturation down a little
    R = L + (R - L) * 0.86; G = L + (G - L) * 0.86; B = L + (B - L) * 0.86;
    // soft S curve
    const curve = (x) => { const t = x * x * (3 - 2 * x); return x + (t - x) * 0.55; }; // high contrast S curve
    R = curve(R); G = curve(G); B = curve(B);
    // highlights warm, shadows teal, blacks lifted toward plum
    const hi = smooth(0.45, 1, L), lo = 1 - smooth(0, 0.4, L);
    R += 0.07 * hi + 0.02 * lo; G += 0.02 * hi + 0.005 * lo; B += -0.07 * hi - 0.01 * lo; // golden highlights, deep brown shadows
    R = 0.03 + R * 0.97; G = 0.018 + G * 0.97; B = 0.01 + B * 0.95;
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
    uniforms: { tDiffuse: { value: null }, tLut: { value: buildLut(N) }, uTime: { value: 0 }, uGrain: { value: 1 }, uNight: { value: 0 }, uDusk: { value: 0 }, uSize: { value: N } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      precision highp sampler3D;
      uniform sampler2D tDiffuse; uniform sampler3D tLut; uniform float uTime, uGrain, uNight, uDusk, uSize;
      varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        vec3 uvw = clamp(c.rgb, 0.0, 1.0) * ((uSize - 1.0) / uSize) + 0.5 / uSize;
        vec3 g = texture(tLut, uvw).rgb;
        g = mix(g, g * vec3(0.9, 0.94, 1.08), uNight * 0.6);
        g = mix(g, pow(max(g, 0.0), vec3(0.82)) + vec3(0.018, 0.02, 0.034), uNight); // lift night shadows, deep blue-brown floor
        float d = distance(vUv, vec2(0.5));
        g *= 1.0 - smoothstep(0.45, 0.95, d) * (0.45 - 0.2 * uNight);
        // soft grain: low amplitude, coarser hash so phones do not sparkle
        float n = hash(vUv * 280.0 + fract(uTime * 2.1) * 37.0) - 0.5;
        g += n * 0.012 * uGrain;
        gl_FragColor = vec4(g, c.a);
      }`,
  });
}
