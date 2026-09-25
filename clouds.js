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
  [[0.44, 0.21, 0.29], [1.0, 0.74, 0.38]],
  [[0.35, 0.63, 0.85], [0.94, 0.98, 1.0]],
];

// Summer cumulus are spawned at random bearings, drift with the wind,
// swell slowly, then fade out and respawn somewhere else.
const CUMULUS_COUNT = 10;
const WIND = 0.0035; // radians per second around the horizon
const BIG_CUMULUS = 3;
function spawnCumulus(cloud, big, bearing) {
  cloud.bearing = bearing;
  cloud.height = big ? 0.16 + Math.random() * 0.14 : 0.035 + Math.random() * 0.07;
  cloud.width = cloud.height * (big ? 0.85 + Math.random() * 0.4 : 1.1 + Math.random() * 0.6);
  cloud.seed = Math.random() * 100;
  cloud.speed = WIND * (0.7 + Math.random() * 0.6);
  cloud.life = 120 + Math.random() * 120;
  cloud.age = 0;
}

export function createClouds() {
  const uniforms = {
    uFlow: { value: 0 }, uDrift: { value: 0 },
    uCov: { value: 0 }, uSoft: { value: 0 },
    uScale: { value: 0 }, uStretch: { value: 0 },
    uWarp: { value: 0 }, uDetail: { value: 0 },
    uProj: { value: 0 }, uMinY: { value: 0 },
    uBand: { value: 0 }, uShadow: { value: 0 },
    uOpacity: { value: 0 }, uDarken: { value: 1 }, uSummer: { value: 0 }, uStorm: { value: 0 },
    uSkyColor: { value: new THREE.Vector3() },
    uSkyHor: { value: new THREE.Vector3() },
    uCumulus: { value: Array.from({ length: CUMULUS_COUNT }, () => new THREE.Vector4()) },
    uCumulusFade: { value: new Array(CUMULUS_COUNT).fill(0) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    defines: { CUMULUS_COUNT },
    vertexShader: 'varying vec3 vDir; void main(){ vDir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `
      precision highp float;
      uniform float uFlow,uDrift,uCov,uSoft,uScale,uStretch,uWarp,uDetail,uProj,uMinY,uBand,uShadow,uOpacity,uDarken,uSummer,uStorm;
      uniform vec3 uSkyColor,uSkyHor;
      uniform vec4 uCumulus[CUMULUS_COUNT];
      uniform float uCumulusFade[CUMULUS_COUNT];
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
      float h11(float i, float s){ return fract(sin(i*12.9898+s*78.233)*43758.5453); }
      // Summer cumulus: a cauliflower of shaded round lobes with a flat, hazy base.
      // Positioned by compass bearing, so each cloud stays put as the boat turns.
      vec4 cumulus(vec3 dir, vec2 bearing, float W, float H, float seed, float count){
        vec2 hz=normalize(dir.xz);
        float u=atan(dot(hz,vec2(-bearing.y,bearing.x)),dot(hz,bearing));
        float v=asin(clamp(dir.y,0.0,1.0))-0.012;
        if(abs(u)>W*1.8 || v>H*1.4 || v<0.0) return vec4(0.0);
        vec2 p=vec2(u,v);
        p+=(vec2(fbm(p*34.0/W*0.1+seed),fbm(p*34.0/W*0.1+seed+5.3))-0.5)*W*0.16;
        float cover=-1.0, wsum=0.0;
        vec3 wn=vec3(0.0);
        for(int i=0;i<36;i++){
          float fi=float(i);
          if(fi>=count) break;
          // The first third are big body lobes; the rest are small puffs that bulge out of the outline.
          float small=step(count*0.34,fi);
          float ry=h11(fi,seed);
          float cy=H*(0.10+0.72*ry);
          float cx=(h11(fi,seed+1.7)*2.0-1.0)*W*(0.92-0.62*ry)*mix(1.0,1.12,small);
          float r=W*mix(0.40-0.17*ry,0.10+0.07*h11(fi,seed+6.6),small)*(0.8+0.4*h11(fi,seed+3.1));
          if(i==0){ cx=W*0.06; cy=H*0.76; r=W*0.30; }
          vec2 d=p-vec2(cx,cy);
          float dd=dot(d,d);
          cover=max(cover,1.0-sqrt(dd)/r);
          if(dd<r*r){
            // Soft blend of lobe normals keeps the seams between puffs smooth.
            float z=sqrt(r*r-dd)+h11(fi,seed+4.2)*r*0.4;
            float w=exp(z/(W*0.035));
            wn+=vec3(d,sqrt(r*r-dd))/r*w; wsum+=w;
          }
        }
        // Billowy noise breaks the round lobes into many smaller bulges and wisps.
        float billow=fbm(p/W*6.0+seed*3.0+vec2(uFlow*0.25,uFlow*0.1));
        cover+=(billow-0.5)*0.34*smoothstep(-0.4,-0.1,cover);
        float alpha=smoothstep(0.0,0.10,cover)*smoothstep(0.0,H*0.05,v);
        if(alpha<0.003) return vec4(0.0);
        vec3 n=wsum>0.0 ? normalize(wn) : vec3(0.0,0.0,1.0);
        vec3 L=normalize(vec3(-0.45,0.62,0.64));
        float lam=dot(n,L)*0.5+0.5;
        vec3 col=mix(vec3(0.66,0.74,0.87),vec3(1.0,1.0,0.99),smoothstep(0.40,0.92,lam));
        // Crevices between puffs fall into soft blue shadow.
        col*=mix(0.86,1.0,smoothstep(0.0,0.45,n.z));
        col=mix(vec3(0.56,0.65,0.79),col,smoothstep(0.0,H*0.55,v));
        col*=0.90+0.10*smoothstep(0.30,0.70,billow);
        col*=0.97+0.03*fbm(p/W*14.0+seed);
        col=mix(col,vec3(0.90,0.95,0.99),0.22*(1.0-smoothstep(0.0,H*0.6,v)));
        return vec4(col,alpha);
      }
      void main(){
        vec3 dir=normalize(vDir);
        if(dir.y<=0.01) discard;
        if(uSummer>0.5){
          vec4 sum=vec4(0.0);
          for(int i=0;i<CUMULUS_COUNT;i++){
            vec4 k=uCumulus[i];
            float count=floor(mix(12.0,36.0,clamp(k.z/0.28,0.0,1.0)));
            vec4 c=cumulus(dir,vec2(sin(k.x),-cos(k.x)),k.y,k.z,k.w,count);
            sum=mix(sum,vec4(c.rgb,1.0),c.a*uCumulusFade[i]);
          }
          if(sum.a<0.003) discard;
          vec3 shade=sum.rgb/max(sum.a,0.001);
          float alpha=sum.a;
          shade*=mix(vec3(1.0),vec3(0.39,0.48,0.55),uStorm*0.9);
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
        col*=mix(vec3(1.0),vec3(0.44,0.51,0.57),uStorm*0.9);
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

  // Start spread evenly around the horizon with some jitter; respawns go anywhere.
  const cumulus = Array.from({ length: CUMULUS_COUNT }, (_, i) => {
    const cloud = { big: i < BIG_CUMULUS };
    const slots = cloud.big ? BIG_CUMULUS : CUMULUS_COUNT - BIG_CUMULUS;
    const slot = cloud.big ? i : i - BIG_CUMULUS;
    spawnCumulus(cloud, cloud.big, (slot + 0.3 + Math.random() * 0.4) / slots * Math.PI * 2 + (cloud.big ? 0.4 : 0));
    cloud.age = cloud.life * (0.15 + Math.random() * 0.6);
    return cloud;
  });
  function updateCumulus(dt) {
    cumulus.forEach((cloud, i) => {
      cloud.age += dt;
      if (cloud.age > cloud.life) spawnCumulus(cloud, cloud.big, Math.random() * Math.PI * 2);
      cloud.bearing += cloud.speed * dt;
      const t = cloud.age / cloud.life;
      const fade = Math.min(1, cloud.age / 20, (cloud.life - cloud.age) / 20);
      const grow = 0.8 + 0.2 * Math.min(1, t * 2);
      uniforms.uCumulus.value[i].set(cloud.bearing, cloud.width * grow, cloud.height * grow, cloud.seed);
      uniforms.uCumulusFade.value[i] = fade;
    });
  }

  let mode = 0;
  function setPalette(index) {
    uniforms.uSummer.value = index === 4 ? 1 : 0;
    mode = index === 1 || index === 3 ? 1 : 0;
    const config = CLOUD_CONFIGS[mode];
    for (const key of ['cov', 'soft', 'scale', 'stretch', 'warp', 'detail', 'proj', 'minY', 'band', 'shadow', 'opacity']) {
      const uniform = 'u' + key[0].toUpperCase() + key.slice(1);
      uniforms[uniform].value = config[key];
    }
    uniforms.uDarken.value = index === 2 ? 0.55 : index === 3 ? 0.94 : index === 4 ? 1.0 : 0.90;
    uniforms.uSkyColor.value.set(...SKY[index][0]);
    uniforms.uSkyHor.value.set(...SKY[index][1]);
  }
  function update(dt) {
    const config = CLOUD_CONFIGS[mode];
    uniforms.uFlow.value += dt * config.flow;
    uniforms.uDrift.value += dt * config.drift;
    updateCumulus(dt);
  }
  function setStorm(level) {
    uniforms.uStorm.value = Math.max(0, (level - 3) / 2);
  }
  updateCumulus(0);
  setPalette(0);
  return { mesh, setPalette, setStorm, update };
}
