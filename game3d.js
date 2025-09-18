import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

let renderer, scene, camera, composer, controls, running=false;

function makePostShader(){
  return {
    uniforms: {
      tDiffuse: { value: null },
      uLevels: { value: 5.0 },
      uEdgeMix: { value: 0.14 },
      uTime: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      precision highp float; varying vec2 vUv; uniform sampler2D tDiffuse;
      uniform float uLevels; uniform float uEdgeMix; uniform float uTime;
      float luma(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }
      vec3 posterize(vec3 c,float lv){ return floor(c*lv)/lv; }
      void main(){
        vec2 texel = vec2(1.0/1024.0, 1.0/1024.0);
        vec3 col = texture2D(tDiffuse, vUv).rgb;
        vec3 post = posterize(pow(col, vec3(1.0/2.2)), uLevels);
        post = pow(post, vec3(2.2));
        float tl=luma(texture2D(tDiffuse, vUv+texel*vec2(-1.0,-1.0)).rgb);
        float tc=luma(texture2D(tDiffuse, vUv+texel*vec2( 0.0,-1.0)).rgb);
        float tr=luma(texture2D(tDiffuse, vUv+texel*vec2( 1.0,-1.0)).rgb);
        float ml=luma(texture2D(tDiffuse, vUv+texel*vec2(-1.0, 0.0)).rgb);
        float mr=luma(texture2D(tDiffuse, vUv+texel*vec2( 1.0, 0.0)).rgb);
        float bl=luma(texture2D(tDiffuse, vUv+texel*vec2(-1.0, 1.0)).rgb);
        float bc=luma(texture2D(tDiffuse, vUv+texel*vec2( 0.0, 1.0)).rgb);
        float br=luma(texture2D(tDiffuse, vUv+texel*vec2( 1.0, 1.0)).rgb);
        float gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
        float gy = -tl - 2.0*tc - tr + bl + 2.0*bc + br;
        float edge = clamp(length(vec2(gx,gy))*0.9,0.0,1.0);
        vec3 edgeCol = vec3(1.0 - edge);
        vec3 finalCol = mix(post, post*edgeCol, uEdgeMix);
        gl_FragColor = vec4(finalCol,1.0);
      }`
  };
}

function buildBarn(){
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(8,5,10),
    new THREE.MeshStandardMaterial({ color: 0x5b0a0a, roughness:0.9, metalness:0.0 })
  );
  body.position.y = 2.5; group.add(body);

  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness:0.7 });
  const roofGeom = new THREE.BoxGeometry(9.2,0.4,10.2);
  const roofL = new THREE.Mesh(roofGeom, roofMat);
  roofL.position.set(0,5.5,0); roofL.rotation.z = Math.PI/6; group.add(roofL);
  const roofR = new THREE.Mesh(roofGeom, roofMat);
  roofR.position.set(0,5.5,0); roofR.rotation.z = -Math.PI/6; group.add(roofR);

  const door = new THREE.Mesh(new THREE.BoxGeometry(2.5,3.2,0.2),
    new THREE.MeshStandardMaterial({ color: 0x3a0707, roughness:0.8 }));
  door.position.set(0,1.6,5.11); group.add(door);

  return group;
}

function init(){
  const container = document.getElementById('game3d');
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050805);
  scene.fog = new THREE.FogExp2(0x050805, 0.035);

  camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 200);
  camera.position.set(0, 1.7, 6.5);

  const hemi = new THREE.HemisphereLight(0x445544, 0x101010, 0.7);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0x999999, 0.4); dir.position.set(-3,6,2); scene.add(dir);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200,200,64,64),
    new THREE.MeshStandardMaterial({ color:0x1a2a1a, roughness:1.0, metalness:0 })
  );
  ground.rotation.x = -Math.PI/2; scene.add(ground);

  const barn = buildBarn(); scene.add(barn); barn.position.set(0,0,0);

  controls = new PointerLockControls(camera, renderer.domElement);
  const state = { f:0,b:0,l:0,r:0,vy:0 };
  const speed = 2.5;

  function onKey(e, v){
    if(e.code==='KeyW') state.f=v;
    if(e.code==='KeyS') state.b=v;
    if(e.code==='KeyA') state.l=v;
    if(e.code==='KeyD') state.r=v;
  }
  addEventListener('keydown', e=>onKey(e,1));
  addEventListener('keyup', e=>onKey(e,0));
  renderer.domElement.addEventListener('click', ()=>controls.lock());

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const post = new ShaderPass(makePostShader()); composer.addPass(post);

  window.addEventListener('resize', ()=>{
    camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  }, { passive:true });

  running = true;
  let last = performance.now();
  (function loop(now){
    if(!running) return;
    const dt = Math.min(0.033, (now-last)/1000); last = now;
    const dirX = (state.r - state.l), dirZ = (state.b - state.f);
    const forward = new THREE.Vector3(); controls.getDirection(forward);
    forward.y=0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).negate();
    camera.position.addScaledVector(forward, -dirZ*speed*dt);
    camera.position.addScaledVector(right, dirX*speed*dt);
    composer.render();
    requestAnimationFrame(loop);
  })(last);
}

export function start3DScene(){
  const el = document.getElementById('game3d');
  if (!running) { init(); }
  el.style.display='block'; el.removeAttribute('aria-hidden');
}

