  (function () {
    'use strict';

    const SL_CARD_IMAGES = {"1": "./assets/img/sl-card-01.webp", "2": "./assets/img/sl-card-02.webp", "3": "./assets/img/sl-card-03.webp", "4": "./assets/img/sl-card-04.webp", "5": "./assets/img/sl-card-05.webp", "6": "./assets/img/sl-card-06.webp"};

    const SL_LEVELS = {
      1: { hex: '#38bdf8', color: 0x38bdf8, master: false },
      2: { hex: '#00f0ff', color: 0x00f0ff, master: false },
      3: { hex: '#c084fc', color: 0xc084fc, master: false },
      4: { hex: '#818cf8', color: 0x818cf8, master: false },
      5: { hex: '#a855f7', color: 0xa855f7, master: false },
      6: { hex: '#38f2ff', color: 0x38f2ff, master: true }
    };

    // 按 6 大課題進度：每完成 1 個大課題（達 80%）解鎖 1 級，完成全部 6 個大課題解鎖 Lv.6 Master
    const SL_TOPIC_PASS_RATIO = 0.80;

    let activeSession = null;
    let isMuted = false;

    function getLevel(doneMap) {
      const map = (doneMap && typeof doneMap === 'object')
        ? doneMap
        : ((typeof practiceState !== 'undefined' && practiceState && practiceState.done) ? practiceState.done : {});
      if (typeof PRACTICE_TAXONOMY === 'undefined' || typeof PRACTICE_BANK === 'undefined') return 0;
      let cleared = 0;
      for (let i = 0; i < PRACTICE_TAXONOMY.length; i++) {
        const catKey = PRACTICE_TAXONOMY[i].catKey;
        let tot = 0, done = 0;
        for (let j = 0; j < PRACTICE_BANK.length; j++) {
          if (PRACTICE_BANK[j].cat === catKey) {
            tot++;
            if (map[PRACTICE_BANK[j].id]) done++;
          }
        }
        if (tot > 0 && (done / tot) >= SL_TOPIC_PASS_RATIO) cleared++;
      }
      return Math.min(6, cleared);
    }

    function syncBadge(doneMap) {
      const lv = getLevel(doneMap);
      const btn = document.getElementById('prSlLevelBadgeBtn');
      if (!btn) return;
      if (lv <= 0) {
        btn.textContent = 'Lv.0 (0/6 課題達80%)';
        btn.style.borderColor = 'rgba(100,116,139,0.45)';
        btn.style.color = '#94a3b8';
        btn.dataset.unlockedLv = '0';
      } else {
        const cfg = SL_LEVELS[lv];
        btn.textContent = lv === 6 ? 'Lv.6 MASTER ★' : `Lv.${lv} (${lv}/6 課題)`;
        btn.style.borderColor = cfg.hex;
        btn.style.color = cfg.hex;
        btn.dataset.unlockedLv = String(lv);
      }
    }

    // === Web Audio API Synthesizer ===
    function createAudioEngine() {
      let ctx = null;
      function getCtx() {
        if (isMuted) return null;
        if (!ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return null;
          ctx = new AC();
        }
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        return ctx;
      }
      return {
        playCharge(lv) {
          const c = getCtx();
          if (!c) return;
          const now = c.currentTime;
          const baseFreq = 140 + lv * 22;
          const osc = c.createOscillator();
          const gain = c.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(baseFreq, now);
          osc.frequency.exponentialRampToValueAtTime(baseFreq * 3.1, now + 1.25);
          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.14, now + 0.18);
          gain.gain.linearRampToValueAtTime(0.20, now + 1.12);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 1.32);
          osc.connect(gain);
          gain.connect(c.destination);
          osc.start(now);
          osc.stop(now + 1.35);
        },
        playBurst(isMaster) {
          const c = getCtx();
          if (!c) return;
          const now = c.currentTime;
          const notes = isMaster
            ? [261.63, 329.63, 392.0, 523.25, 659.25]
            : [220, 329.63, 440, 554.37];
          const sustain = isMaster ? 1.5 : 1.05;

          // Sub-bass impact
          const sub = c.createOscillator();
          const subG = c.createGain();
          sub.type = 'sine';
          sub.frequency.setValueAtTime(isMaster ? 128 : 108, now);
          sub.frequency.exponentialRampToValueAtTime(34, now + (isMaster ? 0.65 : 0.45));
          subG.gain.setValueAtTime(isMaster ? 0.36 : 0.24, now);
          subG.gain.exponentialRampToValueAtTime(0.001, now + (isMaster ? 0.72 : 0.50));
          sub.connect(subG);
          subG.connect(c.destination);
          sub.start(now);
          sub.stop(now + 0.75);

          // Chord shimmer
          notes.forEach((freq, idx) => {
            const o = c.createOscillator();
            const g = c.createGain();
            o.type = isMaster ? 'triangle' : 'sine';
            o.frequency.setValueAtTime(freq, now + idx * 0.025);
            g.gain.setValueAtTime(0.001, now + idx * 0.025);
            g.gain.linearRampToValueAtTime(isMaster ? 0.11 : 0.085, now + idx * 0.025 + 0.04);
            g.gain.exponentialRampToValueAtTime(0.001, now + sustain);
            o.connect(g);
            g.connect(c.destination);
            o.start(now + idx * 0.025);
            o.stop(now + sustain + 0.08);
          });
        },
        dispose() {
          if (ctx) {
            try { ctx.close(); } catch (e) {}
            ctx = null;
          }
        }
      };
    }

    // === Rounded Rect THREE.Shape Helper ===
    function createRoundedRectShape(w, h, r) {
      const s = new THREE.Shape();
      const x = -w / 2, y = -h / 2;
      s.moveTo(x + r, y);
      s.lineTo(x + w - r, y);
      s.quadraticCurveTo(x + w, y, x + w, y + r);
      s.lineTo(x + w, y + h - r);
      s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      s.lineTo(x + r, y + h);
      s.quadraticCurveTo(x, y + h, x, y + h - r);
      s.lineTo(x, y + r);
      s.quadraticCurveTo(x, y, x + r, y);
      return s;
    }

    function createRoundedPlaneGeo(w, h, r) {
      const geo = new THREE.ShapeGeometry(createRoundedRectShape(w, h, r), 24);
      const pos = geo.attributes.position;
      const uv = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        uv[i * 2] = (pos.getX(i) + w / 2) / w;
        uv[i * 2 + 1] = (pos.getY(i) + h / 2) / h;
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      return geo;
    }

    // === Pure-Geometry Neural Circuit Card Back (Zero Text) ===
    function createNeuralBackTexture(hexColor) {
      const c = document.createElement('canvas');
      c.width = 1024; c.height = 576;
      const g = c.getContext('2d');

      const bg = g.createLinearGradient(0, 0, 1024, 576);
      bg.addColorStop(0, '#070d1e');
      bg.addColorStop(0.5, '#0c1833');
      bg.addColorStop(1, '#070b18');
      g.fillStyle = bg;
      g.fillRect(0, 0, 1024, 576);

      // Subtle hex grid
      g.strokeStyle = 'rgba(56,189,248,0.08)';
      g.lineWidth = 1.5;
      const hexR = 34;
      for (let row = -1; row < 12; row++) {
        for (let col = -1; col < 18; col++) {
          const cx = col * hexR * 1.732 + (row % 2 ? hexR * 0.866 : 0);
          const cy = row * hexR * 1.5;
          g.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (Math.PI / 3) * k - Math.PI / 6;
            const px = cx + hexR * Math.cos(a);
            const py = cy + hexR * Math.sin(a);
            if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
          }
          g.closePath();
          g.stroke();
        }
      }

      // Neural circuit paths (left & right symmetric)
      g.strokeStyle = hexColor;
      g.globalAlpha = 0.55;
      g.lineWidth = 2.5;
      const traces = [
        [[110, 120], [260, 120], [330, 190], [420, 190]],
        [[80, 288], [220, 288], [280, 240], [390, 240]],
        [[110, 456], [260, 456], [330, 386], [420, 386]],
        [[160, 200], [300, 200], [350, 288], [410, 288]],
        [[160, 376], [300, 376], [350, 288]]
      ];
      traces.forEach((pts) => {
        [1, -1].forEach((dir) => {
          g.beginPath();
          pts.forEach((p, idx) => {
            const x = dir === 1 ? p[0] : 1024 - p[0];
            const y = p[1];
            if (idx === 0) g.moveTo(x, y); else g.lineTo(x, y);
          });
          g.stroke();
          const endP = pts[0];
          const ex = dir === 1 ? endP[0] : 1024 - endP[0];
          g.fillStyle = hexColor;
          g.beginPath();
          g.arc(ex, endP[1], 5, 0, Math.PI * 2);
          g.fill();
        });
      });
      g.globalAlpha = 1;

      // Central hexagonal geometric core emblem
      const drawHex = (cx, cy, rad, lw, strokeCol, fillCol) => {
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k - Math.PI / 2;
          const px = cx + rad * Math.cos(a);
          const py = cy + rad * Math.sin(a);
          if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.closePath();
        if (fillCol) { g.fillStyle = fillCol; g.fill(); }
        if (strokeCol) { g.lineWidth = lw; g.strokeStyle = strokeCol; g.stroke(); }
      };
      drawHex(512, 288, 128, 3, hexColor, 'rgba(10,18,38,0.85)');
      drawHex(512, 288, 92, 2, 'rgba(192,132,252,0.75)', null);
      drawHex(512, 288, 52, 3, '#ffffff', 'rgba(56,189,248,0.22)');
      drawHex(512, 288, 20, 0, null, hexColor);

      // Outer border
      g.strokeStyle = hexColor;
      g.lineWidth = 4;
      g.strokeRect(22, 22, 980, 532);

      const tex = new THREE.CanvasTexture(c);
      tex.anisotropy = 8;
      return tex;
    }

    // === Hexagonal Cyber Circuit Deck Texture (Middle Pad Layer) ===
    function createHexDeckTexture(hexColor) {
      const c = document.createElement('canvas');
      c.width = 512; c.height = 512;
      const g = c.getContext('2d');
      g.fillStyle = '#091122';
      g.fillRect(0, 0, 512, 512);

      const cx = 256, cy = 256;
      const drawHex = (rad, lw, alpha) => {
        g.save();
        g.globalAlpha = alpha;
        g.strokeStyle = hexColor;
        g.lineWidth = lw;
        g.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i;
          const x = cx + rad * Math.cos(a);
          const y = cy + rad * Math.sin(a);
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.closePath();
        g.stroke();
        g.restore();
      };

      drawHex(230, 5, 0.9);
      drawHex(188, 3, 0.65);
      drawHex(142, 2.5, 0.55);
      drawHex(92, 3, 0.85);

      // 6-way radial docking markers
      g.strokeStyle = hexColor;
      g.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        g.globalAlpha = 0.75;
        g.beginPath();
        g.moveTo(cx + 92 * Math.cos(a), cy + 92 * Math.sin(a));
        g.lineTo(cx + 230 * Math.cos(a), cy + 230 * Math.sin(a));
        g.stroke();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(cx + 188 * Math.cos(a), cy + 188 * Math.sin(a), 5, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      return new THREE.CanvasTexture(c);
    }

    // === Soft Feathered Glow Texture (for card back glow & particles) ===
    function createGlowTexture(hexColor) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 256;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(128, 128, 4, 128, 128, 128);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.28, hexColor);
      gr.addColorStop(0.65, 'rgba(14,25,52,0.18)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 256);
      return new THREE.CanvasTexture(c);
    }

    function close() {
      if (!activeSession) return;
      activeSession.cleanup();
      activeSession = null;
    }

    function play(levelInput) {
      if (typeof THREE === 'undefined') return;
      close();

      const lv = Math.max(1, Math.min(6, Number(levelInput) || 1));
      const cfg = SL_LEVELS[lv];
      const overlay = document.getElementById('slCardOverlay');
      const host = document.getElementById('slCanvasHost');
      const flashEl = document.getElementById('slFlashOverlay');
      const closeBtn = document.getElementById('slCloseIconBtn');
      const muteBtn = document.getElementById('slMuteIconBtn');
      if (!overlay || !host) return;

      overlay.style.background = `radial-gradient(circle at 50% 48%, ${cfg.hex}1f 0%, #04070f 68%)`;
      overlay.style.display = 'block';
      if (closeBtn) {
        closeBtn.style.opacity = '0';
        closeBtn.style.pointerEvents = 'none';
      }

      const audio = createAudioEngine();
      audio.playCharge(lv);

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.18;
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      host.innerHTML = '';
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 100);
      camera.position.set(0, 0.10, 8.8);
      camera.lookAt(0, -0.15, 0);

      // Lights
      scene.add(new THREE.AmbientLight(0x94a3b8, 0.9));
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
      keyLight.position.set(4, 6, 7);
      scene.add(keyLight);
      const rimLight = new THREE.PointLight(cfg.color, 3.2, 18);
      rimLight.position.set(-4.5, 2.5, 4.0);
      scene.add(rimLight);
      const underLight = new THREE.PointLight(cfg.color, 2.8, 12);
      underLight.position.set(0, -1.6, 1.5);
      scene.add(underLight);

      const disposables = [];
      const track = (obj) => { disposables.push(obj); return obj; };

      // === A. Landscape 3D Rainbow Holo Card ===
      const CARD_W = 4.20, CARD_H = 2.36, CARD_D = 0.08, CARD_R = 0.14;
      const cardGroup = new THREE.Group();
      scene.add(cardGroup);

      // Metallic beveled edge body
      const extrudeGeo = track(new THREE.ExtrudeGeometry(createRoundedRectShape(CARD_W, CARD_H, CARD_R), {
        depth: CARD_D,
        bevelEnabled: true,
        bevelThickness: 0.022,
        bevelSize: 0.022,
        bevelSegments: 4,
        curveSegments: 16
      }));
      extrudeGeo.translate(0, 0, -CARD_D / 2);
      const bodyMat = track(new THREE.MeshStandardMaterial({
        color: 0x162238,
        metalness: 0.92,
        roughness: 0.20,
        emissive: new THREE.Color(cfg.color),
        emissiveIntensity: 0.35
      }));
      const bodyMesh = new THREE.Mesh(extrudeGeo, bodyMat);
      cardGroup.add(bodyMesh);

      // Front rainbow holo ShaderMaterial
      const slTexLoader = new THREE.TextureLoader();
      slTexLoader.setCrossOrigin('anonymous');
      const frontTex = track(slTexLoader.load(SL_CARD_IMAGES[String(lv)]));
      frontTex.anisotropy = 8;
      const accentVec = new THREE.Color(cfg.color);

      const frontHoloMat = track(new THREE.ShaderMaterial({
        uniforms: {
          uTex: { value: frontTex },
          uTime: { value: 0 },
          uTilt: { value: new THREE.Vector2(0, 0) },
          uAccent: { value: accentVec },
          uFlash: { value: 0 }
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D uTex;
          uniform float uTime;
          uniform vec2 uTilt;
          uniform vec3 uAccent;
          uniform float uFlash;
          varying vec2 vUv;

          vec3 rainbow(float t) {
            return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
          }

          void main() {
            vec4 texCol = texture2D(uTex, vUv);
            float diag = vUv.x * 1.15 + vUv.y * 0.85 + uTilt.x * 0.75 - uTilt.y * 0.55;
            float sweep = sin(diag * 7.0 - uTime * 1.8) * 0.5 + 0.5;
            float band = pow(sweep, 4.0);
            vec3 holo = rainbow(diag * 0.85 + uTime * 0.14);

            // Edge rim flow
            vec2 edgeDist = min(vUv, 1.0 - vUv);
            float edge = 1.0 - smoothstep(0.0, 0.065, min(edgeDist.x, edgeDist.y));
            float rimPulse = 0.6 + 0.4 * sin(uTime * 3.0 + (vUv.x + vUv.y) * 6.0);

            float tiltMag = clamp(length(uTilt) * 1.4, 0.18, 1.0);
            vec3 col = texCol.rgb + holo * band * (0.24 * tiltMag) + uAccent * edge * (0.45 * rimPulse) + vec3(uFlash * 0.65);
            gl_FragColor = vec4(col, 1.0);
          }
        `
      }));

      const faceGeo = track(createRoundedPlaneGeo(CARD_W - 0.04, CARD_H - 0.04, CARD_R));
      const frontMesh = new THREE.Mesh(faceGeo, frontHoloMat);
      frontMesh.position.z = CARD_D / 2 + 0.024;
      cardGroup.add(frontMesh);

      // Back neural circuit canvas face (zero text)
      const backTex = track(createNeuralBackTexture(cfg.hex));
      const backMat = track(new THREE.MeshStandardMaterial({
        map: backTex,
        metalness: 0.65,
        roughness: 0.28
      }));
      const backMesh = new THREE.Mesh(faceGeo, backMat);
      backMesh.position.z = -(CARD_D / 2 + 0.024);
      backMesh.rotation.y = Math.PI;
      cardGroup.add(backMesh);

      // Behind-card feathered glow plane
      const glowTex = track(createGlowTexture(cfg.hex));
      const backGlowGeo = track(new THREE.PlaneGeometry(CARD_W * 1.58, CARD_H * 1.85));
      const backGlowMat = track(new THREE.MeshBasicMaterial({
        map: glowTex,
        color: cfg.color,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }));
      const backGlowMesh = new THREE.Mesh(backGlowGeo, backGlowMat);
      backGlowMesh.position.z = -0.35;
      cardGroup.add(backGlowMesh);

      // === B. 3D Layered Hexagonal Cyber Landing Pad (y = -1.95) ===
      const padGroup = new THREE.Group();
      padGroup.position.set(0, -1.95, 0);
      scene.add(padGroup);

      // 1. Outer heavy beveled hex base
      const outerPadGeo = track(new THREE.CylinderGeometry(2.85, 3.22, 0.28, 6));
      const outerPadMat = track(new THREE.MeshStandardMaterial({
        color: 0x0b1222,
        metalness: 0.86,
        roughness: 0.28
      }));
      const outerPad = new THREE.Mesh(outerPadGeo, outerPadMat);
      padGroup.add(outerPad);

      // 2. Middle cyber circuit hex deck
      const deckTex = track(createHexDeckTexture(cfg.hex));
      const midPadGeo = track(new THREE.CylinderGeometry(2.42, 2.70, 0.14, 6));
      const midPadMat = track(new THREE.MeshStandardMaterial({
        map: deckTex,
        metalness: 0.72,
        roughness: 0.26,
        emissive: new THREE.Color(cfg.color),
        emissiveMap: deckTex,
        emissiveIntensity: 0.55
      }));
      const midPad = new THREE.Mesh(midPadGeo, midPadMat);
      midPad.position.y = 0.21;
      padGroup.add(midPad);

      // 3. Inner translucent holo hex core plate
      const innerPadGeo = track(new THREE.CylinderGeometry(1.62, 1.82, 0.06, 6));
      const innerPadMat = track(new THREE.MeshStandardMaterial({
        color: cfg.color,
        metalness: 0.90,
        roughness: 0.12,
        transparent: true,
        opacity: 0.34,
        emissive: new THREE.Color(cfg.color),
        emissiveIntensity: 0.35
      }));
      const innerPad = new THREE.Mesh(innerPadGeo, innerPadMat);
      innerPad.position.y = 0.31;
      padGroup.add(innerPad);

      // 4. Dual hexagonal neon rims (RingGeometry(..., ..., 6))
      const rimOuterGeo = track(new THREE.RingGeometry(2.74, 2.86, 6));
      const rimMidGeo = track(new THREE.RingGeometry(2.30, 2.40, 6));
      const rimMat = track(new THREE.MeshBasicMaterial({
        color: cfg.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }));
      const rimOuter = new THREE.Mesh(rimOuterGeo, rimMat);
      rimOuter.rotation.x = -Math.PI / 2;
      rimOuter.rotation.z = Math.PI / 6;
      rimOuter.position.y = 0.15;
      padGroup.add(rimOuter);

      const rimMid = new THREE.Mesh(rimMidGeo, rimMat);
      rimMid.rotation.x = -Math.PI / 2;
      rimMid.rotation.z = Math.PI / 6;
      rimMid.position.y = 0.29;
      padGroup.add(rimMid);

      // 5. 6 Corner Pylons at hexagon vertices
      const pylonBodyGeo = track(new THREE.CylinderGeometry(0.11, 0.15, 0.44, 6));
      const pylonCapGeo = track(new THREE.CylinderGeometry(0.085, 0.085, 0.10, 6));
      const pylonBodyMat = track(new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.88, roughness: 0.25 }));
      const pylonCapMat = track(new THREE.MeshBasicMaterial({ color: cfg.color }));
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI / 3) * i + Math.PI / 6;
        const px = Math.cos(ang) * 2.92;
        const pz = Math.sin(ang) * 2.92;
        const pylon = new THREE.Mesh(pylonBodyGeo, pylonBodyMat);
        pylon.position.set(px, 0.18, pz);
        padGroup.add(pylon);
        const cap = new THREE.Mesh(pylonCapGeo, pylonCapMat);
        cap.position.set(px, 0.44, pz);
        padGroup.add(cap);
      }

      // === C. Dual-Side Laser Scanning Rails (x = ±2.95, tilt ±0.14 rad) ===
      const railGroup = new THREE.Group();
      scene.add(railGroup);
      const RAIL_X = 2.95, RAIL_H = 3.60;
      const railPillarGeo = track(new THREE.BoxGeometry(0.14, RAIL_H, 0.16));
      const railMountGeo = track(new THREE.BoxGeometry(0.32, 0.20, 0.28));
      const railStripGeo = track(new THREE.BoxGeometry(0.04, RAIL_H - 0.36, 0.06));
      const emitterGeo = track(new THREE.BoxGeometry(0.24, 0.22, 0.24));
      const railMetalMat = track(new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.90, roughness: 0.24 }));
      const railStripMat = track(new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending }));

      const emitters = [];
      [-1, 1].forEach((side) => {
        const gSide = new THREE.Group();
        gSide.position.set(side * RAIL_X, -0.05, 0);
        gSide.rotation.z = -side * 0.14;
        const pillar = new THREE.Mesh(railPillarGeo, railMetalMat);
        gSide.add(pillar);
        const topM = new THREE.Mesh(railMountGeo, railMetalMat);
        topM.position.y = RAIL_H / 2;
        gSide.add(topM);
        const botM = new THREE.Mesh(railMountGeo, railMetalMat);
        botM.position.y = -RAIL_H / 2;
        gSide.add(botM);
        const strip = new THREE.Mesh(railStripGeo, railStripMat);
        strip.position.x = -side * 0.08;
        gSide.add(strip);
        const em = new THREE.Mesh(emitterGeo, railMetalMat);
        em.position.set(-side * 0.06, 0, 0);
        gSide.add(em);
        emitters.push(em);
        railGroup.add(gSide);
      });

      // Volumetric horizontal laser scan beam connecting both emitters
      const beamGeo = track(new THREE.PlaneGeometry(RAIL_X * 1.94, 0.36));
      const beamMat = track(new THREE.ShaderMaterial({
        uniforms: {
          uAccent: { value: accentVec },
          uOpacity: { value: 0.9 },
          uTime: { value: 0 }
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uAccent;
          uniform float uOpacity;
          uniform float uTime;
          varying vec2 vUv;
          void main() {
            float dy = abs(vUv.y - 0.5) * 2.0;
            float core = exp(-dy * dy * 48.0);
            float halo = exp(-dy * dy * 6.5);
            float edgeFade = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
            float flicker = 0.88 + 0.12 * sin(uTime * 42.0 + vUv.x * 18.0);
            vec3 col = mix(uAccent, vec3(1.0), core * 0.9);
            float alpha = (core + halo * 0.55) * edgeFade * uOpacity * flicker;
            gl_FragColor = vec4(col, alpha);
          }
        `
      }));
      const laserBeam = new THREE.Mesh(beamGeo, beamMat);
      laserBeam.position.set(0, 0, 0.14);
      scene.add(laserBeam);

      // === D. Hexagonal Expanding Shockwave Shader (PlaneGeometry 13.0 x 13.0) ===
      const shockGeo = track(new THREE.PlaneGeometry(13.0, 13.0));
      const shockMat = track(new THREE.ShaderMaterial({
        uniforms: {
          uProgress: { value: 0 },
          uAccent: { value: accentVec },
          uActive: { value: 0 }
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uProgress;
          uniform vec3 uAccent;
          uniform float uActive;
          varying vec2 vUv;

          // Exact Regular Hexagon SDF
          float sdHexagon(vec2 p, float r) {
            const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
            p = abs(p);
            p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
            p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
            return length(p) * sign(p.y);
          }

          void main() {
            if (uActive < 0.5) discard;
            vec2 p = (vUv - 0.5) * 2.0;
            float r1 = mix(0.14, 0.95, uProgress);
            float r2 = mix(0.06, 0.72, uProgress);
            float d1 = abs(sdHexagon(p, r1));
            float d2 = abs(sdHexagon(p, r2));
            float ring1 = exp(-d1 * 38.0);
            float ring2 = exp(-d2 * 26.0) * 0.72;
            float fade = (1.0 - smoothstep(0.55, 1.0, uProgress)) * smoothstep(0.0, 0.06, uProgress);
            vec3 col = mix(uAccent, vec3(1.0), ring1 * 0.55);
            float alpha = (ring1 + ring2) * fade;
            gl_FragColor = vec4(col, alpha);
          }
        `
      }));
      const shockMesh = new THREE.Mesh(shockGeo, shockMat);
      shockMesh.rotation.x = -Math.PI / 2;
      shockMesh.position.set(0, -1.78, 0);
      scene.add(shockMesh);

      // === E1. 150 Ambient Rising Particles ===
      const AMB_COUNT = 150;
      const ambPos = new Float32Array(AMB_COUNT * 3);
      const ambSpd = new Float32Array(AMB_COUNT);
      for (let i = 0; i < AMB_COUNT; i++) {
        const rad = Math.sqrt(Math.random()) * 3.1;
        const ang = Math.random() * Math.PI * 2;
        ambPos[i * 3] = Math.cos(ang) * rad;
        ambPos[i * 3 + 1] = -1.8 + Math.random() * 4.8;
        ambPos[i * 3 + 2] = Math.sin(ang) * rad;
        ambSpd[i] = 0.25 + Math.random() * 0.55;
      }
      const ambGeo = track(new THREE.BufferGeometry());
      ambGeo.setAttribute('position', new THREE.BufferAttribute(ambPos, 3));
      const ambMat = track(new THREE.PointsMaterial({
        color: cfg.color,
        map: glowTex,
        size: 0.14,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }));
      const ambPoints = new THREE.Points(ambGeo, ambMat);
      scene.add(ambPoints);

      // === E2. 135 Burst Sparks ===
      const SPARK_COUNT = 135;
      const spPos = new Float32Array(SPARK_COUNT * 3);
      const spVel = new Float32Array(SPARK_COUNT * 3);
      const sparkSpeedScale = cfg.master ? 1.38 : 1.0;
      for (let i = 0; i < SPARK_COUNT; i++) {
        spPos[i * 3] = 0; spPos[i * 3 + 1] = 0; spPos[i * 3 + 2] = 0;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const spd = (2.6 + Math.random() * 4.8) * sparkSpeedScale;
        spVel[i * 3] = Math.sin(phi) * Math.cos(theta) * spd;
        spVel[i * 3 + 1] = Math.abs(Math.cos(phi)) * spd * 0.9 + 1.0;
        spVel[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * spd;
      }
      const spGeo = track(new THREE.BufferGeometry());
      spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
      const spMat = track(new THREE.PointsMaterial({
        color: cfg.master ? 0xffffff : cfg.color,
        map: glowTex,
        size: cfg.master ? 0.24 : 0.19,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }));
      const sparkPoints = new THREE.Points(spGeo, spMat);
      scene.add(sparkPoints);

      // === Responsive Framing (iPad Landscape/Portrait & PC Browser Resize/Zoom) ===
      function updateCameraFraming() {
        const vv = window.visualViewport;
        const w = Math.max(1, Math.round(overlay.clientWidth || (vv ? vv.width : window.innerWidth)));
        const h = Math.max(1, Math.round(overlay.clientHeight || (vv ? vv.height : window.innerHeight)));
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        camera.aspect = w / h;
        // Fit full stage (8.2w x 5.4h incl. landscape card, dual laser rails & hex pad) cleanly
        const vFov = THREE.MathUtils.degToRad(camera.fov);
        const halfTan = Math.tan(vFov / 2);
        const distH = (5.4 / 2) / halfTan;
        const distW = (8.2 / 2) / (halfTan * camera.aspect);
        camera.position.set(0, 0.10, Math.max(7.4, distH, distW));
        camera.lookAt(0, -0.15, 0);
        camera.updateProjectionMatrix();
      }
      function onViewportChange() {
        updateCameraFraming();
        setTimeout(updateCameraFraming, 120);
      }
      updateCameraFraming();
      const ro = new ResizeObserver(updateCameraFraming);
      ro.observe(overlay);
      window.addEventListener('resize', onViewportChange);
      window.addEventListener('orientationchange', onViewportChange);
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onViewportChange);
      }

      // === Pointer / Touch 3D Tilt ===
      let targetX = 0, targetY = 0, smX = 0, smY = 0;
      function onPointerMove(ev) {
        const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
        const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
        const w = Math.max(1, window.innerWidth);
        const h = Math.max(1, window.innerHeight);
        targetX = ((cx / w) - 0.5) * 2.0;
        targetY = ((cy / h) - 0.5) * 2.0;
      }
      overlay.addEventListener('pointermove', onPointerMove, { passive: true });
      overlay.addEventListener('touchmove', onPointerMove, { passive: true });

      // === Animation Timeline (0.00s -> 1.25s -> 2.25s -> 2.95s -> Idle) ===
      const t0 = performance.now();
      let lastTs = t0;
      let burstFired = false;
      let canClose = false;
      let rafId = 0;

      function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
      function easeInOutQuad(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }

      function animate(ts) {
        rafId = requestAnimationFrame(animate);
        const dt = Math.min(0.05, (ts - lastTs) / 1000);
        lastTs = ts;
        const t = (ts - t0) / 1000;

        smX += (targetX - smX) * 0.08;
        smY += (targetY - smY) * 0.08;

        frontHoloMat.uniforms.uTime.value = t;
        frontHoloMat.uniforms.uTilt.value.set(smX, smY);
        beamMat.uniforms.uTime.value = t;

        if (t < 1.25) {
          // Phase 1: Charge, Rise & Fast Dual-Pass Laser Scan
          const p = t / 1.25;
          const e = easeInOutQuad(p);
          cardGroup.position.set(0, -1.55 + e * 1.65, -0.5 + e * 0.5);
          const sc = 0.42 + e * 0.58;
          cardGroup.scale.set(sc, sc, sc);
          cardGroup.rotation.set(0, Math.PI * 3.0 * p, 0);
          padGroup.rotation.y += dt * (1.2 + p * 3.8);

          const scanY = Math.sin(p * Math.PI * 4.0) * 1.45;
          emitters[0].position.y = scanY;
          emitters[1].position.y = scanY;
          laserBeam.position.y = scanY;
          beamMat.uniforms.uOpacity.value = 0.92;
          backGlowMat.opacity = 0.25 + p * 0.40;
        } else if (t < 2.25) {
          // Phase 2: Decelerated Hero Flip & Tension Push
          const p = (t - 1.25) / 1.0;
          const e = easeOutCubic(p);
          cardGroup.position.set(0, 0.10 + Math.sin(p * Math.PI) * 0.12, Math.sin(p * Math.PI) * 0.55);
          cardGroup.scale.set(1, 1, 1);
          cardGroup.rotation.set(0, Math.PI * 3.0 + Math.PI * e, 0); // Ends at 4*PI (front facing)
          padGroup.rotation.y += dt * (4.2 * (1 - p) + 0.55);

          const scanY = Math.cos(p * Math.PI * 2.0) * 1.15;
          emitters[0].position.y = scanY;
          emitters[1].position.y = scanY;
          laserBeam.position.y = scanY;
          beamMat.uniforms.uOpacity.value = 0.85 * (1 - p * 0.55);
          backGlowMat.opacity = 0.55 + Math.sin(p * Math.PI) * 0.35;
        } else {
          // Phase 3: Hex Shockwave Burst & Interactive Idle
          if (!burstFired) {
            burstFired = true;
            audio.playBurst(cfg.master);
            if (flashEl) {
              flashEl.style.opacity = cfg.master ? '0.96' : '0.82';
              setTimeout(() => { if (flashEl) flashEl.style.opacity = '0'; }, 110);
            }
          }

          const bt = t - 2.25;
          const shockDur = cfg.master ? 0.95 : 0.72;
          if (bt < shockDur) {
            shockMat.uniforms.uActive.value = 1;
            shockMat.uniforms.uProgress.value = bt / shockDur;
          } else {
            shockMat.uniforms.uActive.value = 0;
          }

          // Spark burst physics
          if (bt < 1.65) {
            const arr = spGeo.attributes.position.array;
            for (let i = 0; i < SPARK_COUNT; i++) {
              spVel[i * 3 + 1] -= 4.8 * dt;
              arr[i * 3] += spVel[i * 3] * dt;
              arr[i * 3 + 1] += spVel[i * 3 + 1] * dt;
              arr[i * 3 + 2] += spVel[i * 3 + 2] * dt;
            }
            spGeo.attributes.position.needsUpdate = true;
            spMat.opacity = Math.max(0, 1.0 - bt / 1.55);
          } else {
            spMat.opacity = 0;
          }

          frontHoloMat.uniforms.uFlash.value = Math.max(0, 1.0 - bt * 2.6);

          // Enable closing after 2.95s
          if (t >= 2.95 && !canClose) {
            canClose = true;
            if (closeBtn) {
              closeBtn.style.opacity = '1';
              closeBtn.style.pointerEvents = 'auto';
            }
          }

          // Gentle floating idle + responsive 3D tilt
          const floatY = 0.10 + Math.sin(bt * 1.9) * 0.09;
          cardGroup.position.set(0, floatY, 0);
          cardGroup.rotation.y = smX * 0.34;
          cardGroup.rotation.x = smY * 0.22;
          padGroup.rotation.y += dt * 0.32;

          // Slow low-opacity laser cruise
          const cruiseY = Math.sin(bt * 0.9) * 1.35;
          emitters[0].position.y = cruiseY;
          emitters[1].position.y = cruiseY;
          laserBeam.position.y = cruiseY;
          beamMat.uniforms.uOpacity.value = 0.22;
          backGlowMat.opacity = 0.38 + Math.sin(bt * 2.2) * 0.12;
        }

        // Ambient rising particles
        const aArr = ambGeo.attributes.position.array;
        for (let i = 0; i < AMB_COUNT; i++) {
          aArr[i * 3 + 1] += ambSpd[i] * dt;
          if (aArr[i * 3 + 1] > 3.1) aArr[i * 3 + 1] = -1.8;
        }
        ambGeo.attributes.position.needsUpdate = true;

        renderer.render(scene, camera);
      }
      rafId = requestAnimationFrame(animate);

      function onOverlayClick(ev) {
        if (!canClose) return;
        if (ev.target === muteBtn || muteBtn.contains(ev.target)) return;
        close();
      }
      function onKeyDown(ev) {
        if (ev.key === 'Escape' && canClose) close();
      }
      function onMuteClick(ev) {
        ev.stopPropagation();
        isMuted = !isMuted;
        const onSvg = document.getElementById('slVolOnSvg');
        const offSvg = document.getElementById('slVolOffSvg');
        if (onSvg) onSvg.style.display = isMuted ? 'none' : 'block';
        if (offSvg) offSvg.style.display = isMuted ? 'block' : 'none';
      }
      function onCloseBtnClick(ev) {
        ev.stopPropagation();
        close();
      }

      overlay.addEventListener('click', onOverlayClick);
      window.addEventListener('keydown', onKeyDown);
      if (muteBtn) muteBtn.addEventListener('click', onMuteClick);
      if (closeBtn) closeBtn.addEventListener('click', onCloseBtnClick);

      activeSession = {
        cleanup() {
          cancelAnimationFrame(rafId);
          ro.disconnect();
          window.removeEventListener('resize', onViewportChange);
          window.removeEventListener('orientationchange', onViewportChange);
          if (window.visualViewport) {
            window.visualViewport.removeEventListener('resize', onViewportChange);
          }
          overlay.removeEventListener('pointermove', onPointerMove);
          overlay.removeEventListener('touchmove', onPointerMove);
          overlay.removeEventListener('click', onOverlayClick);
          window.removeEventListener('keydown', onKeyDown);
          if (muteBtn) muteBtn.removeEventListener('click', onMuteClick);
          if (closeBtn) closeBtn.removeEventListener('click', onCloseBtnClick);
          audio.dispose();
          disposables.forEach((d) => { if (d && typeof d.dispose === 'function') d.dispose(); });
          renderer.dispose();
          host.innerHTML = '';
          overlay.style.display = 'none';
        }
      };
    }

    // Wire up Extra Practice badge & teacher preview buttons
    function bindSlTriggers() {
      const badgeBtn = document.getElementById('prSlLevelBadgeBtn');
      if (badgeBtn && !badgeBtn.dataset.slBound) {
        badgeBtn.dataset.slBound = '1';
        badgeBtn.addEventListener('click', () => {
          const lv = Number(badgeBtn.dataset.unlockedLv || 0);
          if (lv >= 1) play(lv);
        });
      }
      document.querySelectorAll('[data-sl-preview]').forEach((btn) => {
        if (btn.dataset.slBound) return;
        btn.dataset.slBound = '1';
        btn.addEventListener('click', () => {
          const lv = Number(btn.getAttribute('data-sl-preview') || 1);
          play(lv);
        });
      });
      if (typeof practiceState !== 'undefined' && practiceState && practiceState.done) {
        syncBadge(practiceState.done);
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindSlTriggers);
    } else {
      bindSlTriggers();
    }

    window.SelfLearningCardEngine = {
      play,
      close,
      getLevel,
      syncBadge,
      TOPIC_PASS_RATIO: SL_TOPIC_PASS_RATIO
    };
  })();
