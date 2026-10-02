import * as THREE from './three.module.min.js';

let seed = 1337;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function tex16(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d');
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  return `rgb(${Math.min(255, c.r * 255 * k) | 0},${Math.min(255, c.g * 255 * k) | 0},${Math.min(255, c.b * 255 * k) | 0})`;
};

function speckle(ctx, base, spread) {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      ctx.fillStyle = shade(base, 1 + (rnd() * 2 - 1) * spread);
      ctx.fillRect(x, y, 1, 1);
    }
}

function blob(ctx, color, count, size = 2) {
  for (let i = 0; i < count; i++) {
    const x = (rnd() * 14) | 0, y = (rnd() * 14) | 0;
    for (let j = 0; j < size + 1; j++) {
      ctx.fillStyle = shade(color, 0.85 + rnd() * 0.35);
      ctx.fillRect(x + ((rnd() * size) | 0), y + ((rnd() * size) | 0), 1, 1);
    }
  }
}

function makeTextures() {
  const T = {};
  T.dirt = tex16((c) => { speckle(c, '#866043', 0.18); blob(c, '#5d4129', 6); blob(c, '#a07a52', 4); });
  T.grassTop = tex16((c) => { speckle(c, '#5f9e35', 0.2); blob(c, '#4a822a', 8); blob(c, '#79bd48', 6); });
  T.grassSide = tex16((c) => {
    speckle(c, '#866043', 0.18);
    blob(c, '#5d4129', 5);
    for (let x = 0; x < 16; x++) {
      const h = 3 + ((rnd() * 2.4) | 0);
      for (let y = 0; y < h; y++) { c.fillStyle = shade('#5f9e35', 0.85 + rnd() * 0.3); c.fillRect(x, y, 1, 1); }
    }
  });
  T.stone = tex16((c) => { speckle(c, '#7f7f7f', 0.12); blob(c, '#666666', 7, 3); blob(c, '#959595', 4); });
  T.cobble = tex16((c) => {
    speckle(c, '#7a7a7a', 0.1);
    c.fillStyle = '#4e4e4e';
    for (let i = 0; i < 26; i++) c.fillRect((rnd() * 16) | 0, (rnd() * 16) | 0, 1 + ((rnd() * 3) | 0), 1);
    blob(c, '#9a9a9a', 8);
  });
  T.planks = tex16((c) => {
    speckle(c, '#a2834f', 0.08);
    c.fillStyle = '#6b5332';
    for (let y = 3; y < 16; y += 4) c.fillRect(0, y, 16, 1);
    for (let r = 0; r < 4; r++) c.fillRect(r % 2 ? 4 : 11, r * 4, 1, 3);
    blob(c, '#8c7042', 5);
  });
  T.logSide = tex16((c) => {
    for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
      c.fillStyle = shade(x % 4 === 0 ? '#4a3923' : '#6b5232', 0.85 + rnd() * 0.3);
      c.fillRect(x, y, 1, 1);
    }
  });
  T.logTop = tex16((c) => {
    c.fillStyle = '#6b5232'; c.fillRect(0, 0, 16, 16);
    for (let r = 7; r >= 1; r -= 2) { c.fillStyle = r % 4 === 3 ? '#b8945f' : '#a2834f'; c.fillRect(8 - r, 8 - r, r * 2, r * 2); }
  });
  T.leaves = tex16((c) => { speckle(c, '#3b7a24', 0.3); blob(c, '#25561a', 12); });
  const ore = (color) => tex16((c) => { speckle(c, '#7f7f7f', 0.12); blob(c, '#666666', 4, 3); blob(c, color, 5, 2); });
  T.diamond = ore('#62e8e1');
  T.gold = ore('#fcee4b');
  T.emerald = ore('#2be36c');
  T.redstone = ore('#ff1a1a');
  T.lapis = ore('#2c50c9');
  T.glow = tex16((c) => { speckle(c, '#e0b45a', 0.2); blob(c, '#fff3b0', 10); blob(c, '#8c6a2e', 6); });
  T.tnt = tex16((c) => {
    speckle(c, '#d23c2d', 0.12);
    c.fillStyle = '#e8e8e8'; c.fillRect(0, 5, 16, 6);
    c.fillStyle = '#222'; 'TNT'.split('').forEach((_, i) => c.fillRect(3 + i * 4, 7, 2, 2));
  });
  return T;
}

function grassMaterials(T, extra = {}) {
  const side = new THREE.MeshLambertMaterial({ map: T.grassSide, ...extra });
  return [side, side, new THREE.MeshLambertMaterial({ map: T.grassTop, ...extra }), new THREE.MeshLambertMaterial({ map: T.dirt, ...extra }), side, side];
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const SKY = { top: '#0d1430', mid: '#262d62', hor: '#4b3a6e', bot: '#0b0b16' };

export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(SKY.hor, 110, 380);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 1200);
    this.scene.add(this.camera);
    this.time = 0;
    this.pan = 0;
    this.mode = 'library';
    this.textures = makeTextures();

    this.amb = new THREE.AmbientLight(0xffffff, 0.55);
    this.sun = new THREE.DirectionalLight(0xfff0dc, 0.75);
    this.sun.position.set(40, 90, 55);
    this.camLight = new THREE.DirectionalLight(0xffffff, 0);
    this.camLight.position.set(6, 8, 0);
    this.lightTarget = new THREE.Object3D();
    this.lightTarget.position.set(0, 16, 0);
    this.camLight.target = this.lightTarget;
    this.camera.add(this.camLight);
    this.scene.add(this.amb, this.sun, this.lightTarget);

    this.buildSky();
    this.buildBlocks();
    this.buildDust();
    this.buildStage();
    this.particles = [];
    this.pool = [];
    this.particleGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);

    this.onResize = [];
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  buildSky() {
    const uniforms = {};
    for (const k in SKY) uniforms[k] = { value: new THREE.Color(SKY[k]) };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(600, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, uniforms,
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform vec3 top, mid, hor, bot; varying vec3 vP;
          void main(){ float h = vP.y; vec3 c;
            if (h > 0.0) c = mix(mix(hor, mid, smoothstep(0.0, 0.28, h)), top, smoothstep(0.28, 0.95, h));
            else c = mix(hor, bot, smoothstep(0.0, 0.35, -h));
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    const n = 700, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = rnd() * Math.PI * 2, y = 0.05 + rnd() * 0.95, r = Math.sqrt(1 - y * y);
      p.set([Math.cos(th) * r * 560, y * 560, Math.sin(th) * r * 560], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false, depthWrite: false }));
    this.sky.add(this.stars);
  }

  buildBlocks() {
    const T = this.textures;
    const box = new THREE.BoxGeometry(16, 16, 16);
    const mat = (t) => new THREE.MeshLambertMaterial({ map: t });
    const log = [mat(T.logSide), mat(T.logSide), mat(T.logTop), mat(T.logTop), mat(T.logSide), mat(T.logSide)];
    const kinds = [
      grassMaterials(T), grassMaterials(T), grassMaterials(T), mat(T.dirt), mat(T.stone), mat(T.stone), mat(T.cobble),
      mat(T.planks), log, mat(T.leaves), mat(T.diamond), mat(T.gold), mat(T.emerald), mat(T.redstone), mat(T.lapis),
      new THREE.MeshLambertMaterial({ map: T.glow, emissive: 0x6b4a10, emissiveMap: T.glow }), mat(T.tnt),
    ];
    this.blocks = new THREE.Group();
    for (let i = 0; i < 54; i++) {
      const m = new THREE.Mesh(box, kinds[(rnd() * kinds.length) | 0]);
      const th = (i / 54) * Math.PI * 2 + rnd() * 0.4;
      const r = 95 + rnd() * 140;
      m.position.set(Math.cos(th) * r, 16 + (rnd() * 2 - 1) * 70, Math.sin(th) * r);
      m.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
      m.scale.setScalar(0.7 + rnd() * 0.6);
      m.userData = { y: m.position.y, ph: rnd() * 6.28, sp: 0.2 + rnd() * 0.5, rx: (rnd() - 0.5) * 0.3, ry: (rnd() - 0.5) * 0.35 };
      this.blocks.add(m);
    }
    this.scene.add(this.blocks);
  }

  buildDust() {
    const n = 380, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) p.set([(rnd() * 2 - 1) * 170, rnd() * 220 - 90, (rnd() * 2 - 1) * 170], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xc9b5ff, size: 0.9, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.scene.add(this.dust);
  }

  buildStage() {
    this.stage = new THREE.Group();
    this.pedestal = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 16), grassMaterials(this.textures));
    this.pedestal.position.y = -8;
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(15, 15),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.05;
    this.stage.add(this.pedestal, this.shadow);
    this.stage.visible = false;
    this.scene.add(this.stage);
  }

  setMode(mode) {
    this.mode = mode;
    const ed = mode === 'editor';
    this.stage.visible = ed;
    this.sun.intensity = ed ? 0.38 : 0.8;
    this.amb.intensity = ed ? 0.52 : 0.72;
    this.camLight.intensity = ed ? 0.42 : 0;
    if (!ed) {
      this.camera.clearViewOffset();
      this.camera.fov = 50;
      this.camera.updateProjectionMatrix();
    } else {
      this.camera.fov = 42;
      this.camera.updateProjectionMatrix();
    }
  }

  setLite(on) {
    this.lite = on;
    this.blocks.visible = this.dust.visible = this.stars.visible = !on;
    this.renderer.setPixelRatio(on ? 1 : Math.min(window.devicePixelRatio, 2));
    this.resize();
  }

  burst(pos, color, count = 6, { speed = 14, up = 10, size = 1, life = 0.7 } = {}) {
    if (this.lite) return;
    for (let i = 0; i < count; i++) {
      let m = this.pool.pop();
      if (!m) {
        if (this.particles.length > 260) return;
        m = new THREE.Mesh(this.particleGeo, new THREE.MeshLambertMaterial());
      }
      m.material.color.set(Array.isArray(color) ? color[(Math.random() * color.length) | 0] : color);
      m.position.copy(pos);
      const a = Math.random() * Math.PI * 2, e = Math.random();
      m.userData = {
        v: new THREE.Vector3(Math.cos(a) * speed * e, up * (0.4 + Math.random()), Math.sin(a) * speed * e),
        life: life * (0.6 + Math.random() * 0.6), max: 0, size: size * (0.6 + Math.random() * 0.7),
        spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0),
      };
      m.userData.max = m.userData.life;
      this.scene.add(m);
      this.particles.push(m);
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const f of this.onResize) f(w, h);
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    if (!this.lite) this.animateScenery(dt, t);
    this.updateParticles(dt);
    if (this.mode === 'library') {
      this.pan += dt * 0.035;
      this.camera.position.set(0, 16, 0);
      this.camera.rotation.set(0.06 + Math.sin(t * 0.13) * 0.05, this.pan, 0, 'YXZ');
    }
    this.sky.position.copy(this.camera.position);
  }

  animateScenery(dt, t) {
    for (const b of this.blocks.children) {
      const u = b.userData;
      b.rotation.x += u.rx * dt;
      b.rotation.y += u.ry * dt;
      b.position.y = u.y + Math.sin(t * u.sp + u.ph) * 4;
    }
    const dp = this.dust.geometry.attributes.position;
    for (let i = 0; i < dp.count; i++) {
      let y = dp.getY(i) + dt * (1.5 + (i % 5) * 0.6);
      if (y > 130) y = -90;
      dp.setY(i, y);
      dp.setX(i, dp.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.8);
    }
    dp.needsUpdate = true;
    this.stars.rotation.y = t * 0.004;
    this.stars.material.opacity = 0.7 + Math.sin(t * 1.7) * 0.15;
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const m = this.particles[i], u = m.userData;
      u.life -= dt;
      if (u.life <= 0) {
        this.scene.remove(m);
        this.particles.splice(i, 1);
        this.pool.push(m);
        continue;
      }
      u.v.y -= 42 * dt;
      m.position.addScaledVector(u.v, dt);
      m.rotation.x += u.spin.x * dt;
      m.rotation.y += u.spin.y * dt;
      m.scale.setScalar(u.size * Math.min(1, (u.life / u.max) * 1.6));
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
