// Shader patches for the winter world. They hook MeshStandardMaterial via onBeforeCompile, so the materials keep
// three's lighting, shadows and fog and only gain world-space snow and rock detail.
const NOISE = `
float snH(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float snV(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(snH(i), snH(i + vec2(1., 0.)), f.x), mix(snH(i + vec2(0., 1.)), snH(i + vec2(1., 1.)), f.x), f.y); }
float snF(vec2 p){ return snV(p) * .5 + snV(p * 2.03) * .25 + snV(p * 4.1) * .125 + snV(p * 8.2) * .0625; }
varying vec3 vWPos; varying vec3 vWNorm;
`;
// World position and normal (instancing-aware) for the fragment stage.
function worldVaryings(shader) {
  shader.vertexShader = NOISE + shader.vertexShader
    .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\n  vWNorm = normalize((vec4(transformedNormal, 0.) * viewMatrix).xyz);')
    .replace('#include <project_vertex>', `#include <project_vertex>
  { vec4 wp = vec4(transformed, 1.);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
    vWPos = (modelMatrix * wp).xyz; }`);
  shader.fragmentShader = NOISE + shader.fragmentShader;
}

// Snow settles on every upward-facing surface: roofs, wall-walks, merlons, ledges, tower tops.
export function snowify(material, amount = 1) {
  if (material.userData.snow) return material;
  material.userData.snow = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    prev?.call(material, shader, r);
    worldVaryings(shader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  { float drift = (snF(vWPos.xz * .7 + vWPos.y * .3) - .5) * .35;
    float sn = smoothstep(.42, .7, vWNorm.y + drift) * ${amount.toFixed(2)};
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.88, .91, .96) * (.94 + .1 * snV(vWPos.xz * 3.)), sn); }`);
  };
  material.customProgramCacheKey = () => 'snow' + amount;
  material.needsUpdate = true;
  return material;
}

// Terrain: rock with strata where it is steep (snow kept on ledges), wind ripples and grain in the snow, faint glints.
export function snowTerrain(material) {
  material.onBeforeCompile = shader => {
    worldVaryings(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
  float slope = 1. - clamp(vWNorm.y, 0., 1.);
  float n1 = snF(vWPos.xz * .045), n2 = snF(vWPos.xz * .31 + 7.), n3 = snV(vWPos.xz * 2.3);
  float strata = sin(vWPos.y * .7 + n1 * 16. + n2 * 5. + vWPos.x * .02) * .5 + .5;   // irregular bedding, not contour lines
  vec3 rockC = mix(vec3(.3, .29, .3), vec3(.44, .41, .38), smoothstep(.2, .8, strata) * .6 + n2 * .4) * (.8 + .35 * n3);
  rockC = mix(rockC, vec3(.36, .3, .26), smoothstep(.55, .9, n1) * .5);
  float rockAmt = smoothstep(.36, .62, slope + (n1 - .5) * .28 + (n2 - .5) * .3 + (n3 - .5) * .12);   // noise breaks the mesh's straight iso-lines
  rockAmt *= 1. - smoothstep(.75, .95, strata) * smoothstep(.35, .6, n2) * .8;   // ledges hold snow
  vec3 snowC = diffuseColor.rgb;
  float near = smoothstep(140., 40., length(cameraPosition - vWPos));              // fine detail fades before it can alias
  snowC *= 1. - near * (.03 - .03 * sin(dot(vWPos.xz, vec2(.55, .9)) * 1.6 + n2 * 7.));   // wind ripples
  snowC *= 1. - near * .04 + near * .07 * n3;
  snowC = mix(snowC, snowC * vec3(.9, .94, 1.02), smoothstep(.4, .8, n1));          // cold blue drifts
  diffuseColor.rgb = mix(snowC, rockC, rockAmt);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { vec3 vd = normalize(cameraPosition - vWPos); float dist = length(cameraPosition - vWPos);
    float g = snH(floor(vWPos.xz * 7.) + floor(vd.xz * 5.) * 17.31);
    totalEmissiveRadiance += vec3(1., .96, .88) * step(.9965, g) * (1. - rockAmt) * smoothstep(110., 30., dist) * .9; }`);
  };
  material.customProgramCacheKey = () => 'snowTerrain';
  return material;
}
