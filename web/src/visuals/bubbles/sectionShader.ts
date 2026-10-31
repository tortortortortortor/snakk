import { SIMPLEX } from './shaders';

export const MAX_BLOBS = 8;
export const MAX_BANDS = MAX_BLOBS - 1;
export const MAX_DROPS = 8;

/** A camera-facing card in front of the group; each fragment casts a ray into the scene. */
export const sectionVertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

/**
 * Ray-marched signed distance field of one section group: the section blob, its active
 * sub-topic, and droplets rising from the sub-topic into the section, merged with a smooth
 * union so droplets bud off one and melt into the other. Finished sub-topics shrink into the
 * section and leave a coloured band on it. Colour and keyword ink blend with the same weights.
 */
export const sectionFragment = /* glsl */ `
#define MAXB ${MAX_BLOBS}
#define MAXBAND ${MAX_BANDS}
#define MAXD ${MAX_DROPS}
#define PI 3.14159265
uniform float uTime;
uniform int uCount;
uniform vec3 uC[MAXB];
uniform float uR[MAXB];
uniform float uSeed[MAXB];
uniform float uAng[MAXB];
uniform float uAmp[MAXB];
uniform float uPulse[MAXB];
uniform float uGlow[MAXB];
uniform vec3 uColA[MAXB];
uniform vec3 uColB[MAXB];
uniform int uBandCount;
uniform float uBandV[MAXBAND];
uniform vec3 uBandCol[MAXBAND];
uniform float uBandAlpha[MAXBAND];
uniform int uDropCount;
uniform vec4 uDrop[MAXD];
uniform float uDropT[MAXD];
uniform vec3 uDropFrom;
uniform float uDropK;
uniform float uK;
/** 0: quick shiver on a keyword landing. 1: slow ripple and swell. */
uniform float uPulseStyle;
/** 0..1, how far this section is faded back (spotlight focus). */
uniform float uDim;
uniform float uDepth;
uniform vec3 uLight;
uniform sampler2D uAtlas;
uniform mat4 projectionMatrix;
varying vec3 vWorld;
${SIMPLEX}

vec3 rotY(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}

float dispAt(int i, vec3 d) {
  float t = uTime * 0.22;
  float n = snoise(d * 1.05 + vec3(uSeed[i], uSeed[i] * 0.7, t));
  n += 0.18 * snoise(d * 2.1 + vec3(t * 1.4 + uSeed[i]));
  float pulse = uPulseStyle > 0.5
    ? uPulse[i] * (0.045 * sin(uTime * 5.0 - d.y * 6.0) + 0.05)
    : uPulse[i] * 0.09 * sin(uTime * 14.0 + d.y * 5.0);
  return n * uAmp[i] + pulse;
}

float sminH(float a, float b, float k, out float h) {
  h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

/** Distance to blob i. Far from the blob, a cheap bound replaces the noise. */
float sdBlob(int i, vec3 p) {
  vec3 q = p - uC[i];
  float l = length(q);
  float r = uR[i];
  if (r < 0.01) return 1e5;
  float bound = l - r * (1.0 + uAmp[i] * 1.5 + 0.1);
  if (bound > 0.3 * r) return bound;
  vec3 dl = rotY(q / max(l, 1e-4), -uAng[i]);
  return l - r * (1.0 + dispAt(i, dl));
}

float mapD(vec3 p) {
  float d = 1e5;
  float h;
  for (int i = 0; i < MAXB; i++) {
    if (i >= uCount) break;
    float di = sdBlob(i, p);
    d = i == 0 ? di : sminH(d, di, uK, h);
  }
  for (int j = 0; j < MAXD; j++) {
    if (j >= uDropCount) break;
    d = sminH(d, length(p - uDrop[j].xyz) - uDrop[j].w, uDropK, h);
  }
  return d;
}

/** Same field as mapD, carrying colour, keyword ink and glow through the blends. */
void shadeField(vec3 p, out vec3 col, out float ink, out float glow) {
  float d = 1e5;
  float h;
  col = vec3(0.0); ink = 0.0; glow = 0.0;
  for (int i = 0; i < MAXB; i++) {
    if (i >= uCount) break;
    vec3 q = p - uC[i];
    float l = length(q);
    vec3 dl = rotY(q / max(l, 1e-4), -uAng[i]);
    float disp = dispAt(i, dl);
    float di = uR[i] < 0.01 ? 1e5 : l - uR[i] * (1.0 + disp);
    float u = atan(dl.z, -dl.x) / (2.0 * PI);
    u = u < 0.0 ? u + 1.0 : u;
    float v = 1.0 - acos(clamp(dl.y, -1.0, 1.0)) / PI;
    float g = clamp(0.5 + disp * 3.0, 0.0, 1.0);
    vec3 ci = mix(uColA[i], uColB[i], g * 0.75 + v * 0.25);
    if (i == 0) {
      // One band per absorbed sub-topic, like the stripes of a gas giant.
      for (int b = 0; b < MAXBAND; b++) {
        if (b >= uBandCount) break;
        float w = 1.0 - smoothstep(0.018, 0.034, abs(v - uBandV[b]));
        ci = mix(ci, uBandCol[b], w * uBandAlpha[b]);
      }
    }
    float av = (float(MAXB - i - 1) + clamp(v, 0.002, 0.998)) / float(MAXB);
    float inki = textureLod(uAtlas, vec2(u, av), 0.0).a;
    if (i == 0) { d = di; col = ci; ink = inki; glow = uGlow[i]; }
    else {
      d = sminH(d, di, uK, h);
      col = mix(ci, col, h);
      ink = mix(inki, ink, h);
      glow = mix(uGlow[i], glow, h);
    }
  }
  for (int j = 0; j < MAXD; j++) {
    if (j >= uDropCount) break;
    float dd = length(p - uDrop[j].xyz) - uDrop[j].w;
    vec3 cd = mix(uDropFrom, uColA[0], smoothstep(0.1, 0.9, uDropT[j]));
    d = sminH(d, dd, uDropK, h);
    col = mix(cd, col, h);
    ink = mix(0.0, ink, h);
  }
}

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.0015;
  return normalize(e.xyy * mapD(p + e.xyy) + e.yyx * mapD(p + e.yyx) + e.yxy * mapD(p + e.yxy) + e.xxx * mapD(p + e.xxx));
}

void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorld - ro);
  float t = length(vWorld - ro);
  float tMax = t + uDepth;
  bool hit = false;
  for (int i = 0; i < 110; i++) {
    float d = mapD(ro + rd * t);
    if (d < 0.0012) { hit = true; break; }
    t += d * 0.8;
    if (t > tMax) break;
  }
  if (!hit) discard;

  vec3 p = ro + rd * t;
  vec3 n = calcNormal(p);
  vec3 col; float ink; float glow;
  shadeField(p, col, ink, glow);

  vec3 V = -rd;
  vec3 L = normalize(uLight);
  vec3 H = normalize(L + V);
  float diff = max(dot(n, L), 0.0);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 R = reflect(rd, n);
  // A small studio: a wide top softbox, warm and cool side strips, a floor bounce.
  vec3 env = vec3(0.05)
    + vec3(1.0) * smoothstep(0.3, 0.95, R.y) * 0.9
    + vec3(1.0, 0.85, 0.76) * smoothstep(0.55, 1.0, -R.x) * 0.45
    + vec3(0.76, 0.84, 1.0) * smoothstep(0.55, 1.0, R.x) * 0.45
    + vec3(0.8) * smoothstep(0.7, 1.0, -R.y) * 0.2;
  vec3 irid = 0.5 + 0.5 * cos(6.2831 * (fres * 0.8 + vec3(0.0, 0.33, 0.67)));
  vec3 base = mix(col, vec3(1.0), ink * 0.9);
  float nh = max(dot(n, H), 0.0);
  vec3 c = base * (0.3 + 0.75 * diff)
    + env * (0.08 + 0.55 * fres) * mix(vec3(1.0), irid, 0.35)
    + vec3(1.0) * (pow(nh, 90.0) * 1.1 + pow(nh, 14.0) * 0.12)
    + col * (0.06 + glow * 0.22)
    + vec3(ink * 0.7);

  c = mix(c, vec3(dot(c, vec3(0.299, 0.587, 0.114))) * 0.5, uDim);

  vec4 clip = projectionMatrix * viewMatrix * vec4(p, 1.0);
  gl_FragDepth = (clip.z / clip.w) * 0.5 + 0.5;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
