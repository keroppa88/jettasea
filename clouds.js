import * as THREE from 'three';

// Cloud types and shader structure adapted from car2026/js/main.js.
// Type 1: broad cumulus. Type 2: stretched cloud bands.
const CLOUD_CONFIGS = [
  {
    cov: 0.40, soft: 0.28, scale: 1.2, stretch: 1.0, warp: 1.6,
    detail: 0.8, proj: 0.06, minY: 0.18, band: 0.10,
    flow: 0.05, drift: 0, shadow: 0.8, opacity: 0.9,
  },
  {
    cov: 0.45, soft: 0.22, scale: 1.8, stretch: 0.4, warp: 2.0,
    detail: 0.5, proj: 0.06, minY: 0.30, band: 0.10,
    flow: 0, drift: 0.025, shadow: 0.85, opacity: 0.85,
  },
];
const SKY = [
  [[0.055, 0.085, 0.18], [0.22, 0.34, 0.43]],
  [[0.19, 0.18, 0.25], [0.43, 0.43, 0.44]],
  [[0.030, 0.045, 0.13], [0.16, 0.24, 0.39]],
  [[0.25, 0.12, 0.25], [0.60, 0.33, 0.34]],
  [[0.06, 0.43, 0.88], [0.94, 0.98, 1.0]],
];

export function createClouds() {
  const uniforms = {
    uFlow: { value: 0 }, uDrift: { value: 0 },
    uCov: { value: 0 }, uSoft: { value: 0 },
    uScale: { value: 0 }, uStretch: { value: 0 },
    uWarp: { value: 0 }, uDetail: { value: 0 },
    uProj: { value: 0 }, uMinY: { value: 0 },
    uBand: { value: 0 }, uShadow: { value: 0 },
    uOpacity: { value: 0 }, uDarken: { value: 1 }, uSummer: { value: 0 },
    uSkyColor: { value: new THREE.Vector3() },
    uSkyHor: { value: new THREE.Vector3() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec3 vDir; void main(){ vDir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `
      precision highp float;
      uniform float uFlow,uDrift,uCov,uSoft,uScale,uStretch,uWarp,uDetail,uProj,uMinY,uBand,uShadow,uOpacity,uDarken,uSummer;
      uniform vec3 uSkyColor,uSkyHor;
      varying vec3 vDir;
      float hash(vec2 p){ p=fract(p*vec2(123.34,345.45)); p+=dot(p,p+34.345); return fract(p.x*p.y); }
      float noise(vec2 p){
        vec2 i=floor(p), f=fract(p);
        float a=hash(i), b=hash(i+vec2(1.0,0.0)), c=hash(i+vec2(0.0,1.0)), d=hash(i+vec2(1.0,1.0));
        vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
      }
      float fbm(vec2 p){
        float v=0.0, a=0.5;
        for(int i=0;i<6;i++){ v+=a*noise(p); p=p*2.02+vec2(1.7,9.2); a*=0.5; }
        return v;
      }
      // Cumulus towers are positioned by compass direction, so they wrap around the sky.
      float cumulus(vec3 dir, vec2 bearing, float width, float height, float seed){
        vec2 horizontal=normalize(dir.xz);
        float x=dot(horizontal,vec2(-bearing.y,bearing.x))/width;
        float facing=smoothstep(0.55,0.85,dot(horizontal,bearing));
        float billow=fbm(vec2(x*3.8+seed,dir.y*10.0+uFlow*0.12));
        float crown=height*(0.44+0.56*exp(-x*x*0.68))+(billow-0.5)*0.10;
        float shape=smoothstep(0.02,0.055,dir.y)*(1.0-smoothstep(crown-0.018,crown+0.018,dir.y));
        return shape*(1.0-smoothstep(0.85,1.50,abs(x)))*facing;
      }
      void main(){
        vec3 dir=normalize(vDir);
        if(dir.y<=0.01) discard;
        if(uSummer>0.5){
          float towers=0.0;
          towers=max(towers,cumulus(dir,normalize(vec2(0.40,-0.92)),0.23,0.39,1.2));
          towers=max(towers,cumulus(dir,normalize(vec2(-0.76,-0.65)),0.19,0.31,4.7));
          towers=max(towers,cumulus(dir,normalize(vec2(0.92,0.39)),0.26,0.36,8.3));
          towers=max(towers,cumulus(dir,normalize(vec2(-0.34,0.94)),0.16,0.27,12.6));
          float texture=fbm(dir.xz*19.0+vec2(dir.y*7.0,uFlow*0.09));
          float alpha=towers*(0.83+0.13*texture);
          if(alpha<0.003) discard;
          vec3 shade=mix(vec3(0.70,0.83,0.91),vec3(1.0,1.0,0.98),smoothstep(0.035,0.25,dir.y));
          shade*=0.91+0.09*texture;
          gl_FragColor=vec4(shade,alpha);
          return;
        }
        // This projection uses the continuous 3D direction, with no longitude seam.
        vec2 p=dir.xz/max(dir.y,uProj);
        p*=uScale; p.x*=uStretch;
        vec2 sp=p+vec2(uDrift,-uFlow);
        vec2 q=vec2(fbm(sp),fbm(sp+vec2(3.1,6.7)));
        float base=fbm(sp+uWarp*q);
        float detail=fbm(sp*3.0+4.0*q);
        float d=mix(base,base*0.7+detail*0.3,uDetail);
        float dens=smoothstep(uCov,uCov+uSoft,d);
        dens*=smoothstep(uMinY,uMinY+uBand,dir.y);
        float lit=smoothstep(uCov,uCov+0.5,d);
        vec3 darkest=mix(vec3(0.5),vec3(1.0),uShadow);
        vec3 horTint=uSkyHor/max(max(uSkyHor.r,uSkyHor.g),max(uSkyHor.b,0.001));
        vec3 topTint=uSkyColor/max(max(uSkyColor.r,uSkyColor.g),max(uSkyColor.b,0.001));
        vec3 litCol=mix(vec3(1.0),horTint,0.5);
        vec3 darkCol=mix(darkest,darkest*topTint,0.5);
        vec3 col=mix(darkCol,litCol,lit);
        float alpha=dens*uOpacity;
        if(alpha<0.003) discard;
        gl_FragColor=vec4(col*uDarken,alpha);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1450, 48, 24), material);
  mesh.renderOrder = -9;
  mesh.frustumCulled = false;

  let mode = 0;
  function setPalette(index) {
    uniforms.uSummer.value = index === 4 ? 1 : 0;
    mode = index === 1 || index === 3 ? 1 : 0;
    const config = CLOUD_CONFIGS[mode];
    for (const key of ['cov', 'soft', 'scale', 'stretch', 'warp', 'detail', 'proj', 'minY', 'band', 'shadow', 'opacity']) {
      const uniform = 'u' + key[0].toUpperCase() + key.slice(1);
      uniforms[uniform].value = config[key];
    }
    uniforms.uDarken.value = index === 2 ? 0.55 : index === 3 ? 0.78 : index === 4 ? 1.0 : 0.90;
    uniforms.uSkyColor.value.set(...SKY[index][0]);
    uniforms.uSkyHor.value.set(...SKY[index][1]);
  }
  function update(dt) {
    const config = CLOUD_CONFIGS[mode];
    uniforms.uFlow.value += dt * config.flow;
    uniforms.uDrift.value += dt * config.drift;
  }
  setPalette(0);
  return { mesh, setPalette, update };
}
