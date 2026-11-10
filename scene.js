// The run, as one three.js scene driven by the story progress `s` (see script.js).
// s = 0 table · 1 small blind · 2 big blind · 3 casino 2 · 4 cheats · 5 boss blind · 6 bustatro · 7 bonus round · 8 cash out
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const root = document.documentElement;
const story = window.__story;
const canvas = document.getElementById("gl");
const debug = new URLSearchParams(location.search).has("debug");
const phoneQuery = matchMedia("(max-width: 700px)");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");

// the scene is decoration: build it after the page has loaded and painted, in small steps
const nextTask = () => new Promise((r) => (globalThis.scheduler?.yield ? scheduler.yield().then(r) : setTimeout(r, 0)));
const idle = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 1200 }) : setTimeout(r, 200)));

try {
  if (!root.classList.contains("no-gl")) {
    if (document.readyState !== "complete") await new Promise((r) => addEventListener("load", r, { once: true }));
    await idle();
    await init();
  }
} catch (err) {
  console.error(err);
  root.classList.remove("gl", "scene-ready");
  root.classList.add("no-gl");
}

async function init() {
  const gl = canvas.getContext("webgl2", { antialias: true, powerPreference: "high-performance" });
  if (!gl) throw new Error("no WebGL2");

  // ---------- palette (linear colours are converted by three) ----------
  const C = {
    felt: "#0e3b2b", feltDeep: "#082a1e", brass: "#e8b84a", ivory: "#f3ecdc", ink: "#17130e", red: "#c42a3c",
    redDeep: "#7a1424", neonFelt: "#1d1233", neonDeep: "#120c1f", cyan: "#3ef2e6", magenta: "#ff3fa4",
    bgWarm: "#070504", bgNeon: "#0b0714", bgHouse: "#140e09",
  };
  const col = (h) => new THREE.Color(h);
  const BG = { warm: col(C.bgWarm), neon: col(C.bgNeon), house: col(C.bgHouse) };

  // ---------- renderer ----------
  const coarse = matchMedia("(pointer: coarse)").matches;
  let pixelRatio = Math.min(devicePixelRatio, coarse ? 1.5 : 2);
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true });
  renderer.setPixelRatio(pixelRatio);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.background = col(C.bgWarm);
  scene.fog = new THREE.Fog(C.bgWarm, 7, 16);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);

  await nextTask();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  // fonts must be ready before anything is printed onto a canvas
  await Promise.race([
    Promise.all(['400 100px "League Gothic"', '600 40px "Sofia Sans"', '900 80px "Doto"'].map((f) => document.fonts.load(f))),
    new Promise((r) => setTimeout(r, 2500)),
  ]);

  const canvasTex = (w, h, draw, srgb = true) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return t;
  };
  const rand = mulberry32(7);

  // ---------- table ----------
  const W = 8, D = 5;                                // felt size in world units (1 unit = 10 cm)
  const toPx = (x, z, cw, ch) => [(x / W + 0.5) * cw, (z / D + 0.5) * ch];
  const HAND = [[-1.15, 0.32, -0.06], [-0.47, 0.34, 0.03], [0.21, 0.31, -0.04], [0.89, 0.3, 0.1]];   // x, z, yaw of the four hand cards
  const DECK = [-1.55, -0.95, 0.18];
  const PLAQUE = [0, -1.75];

  function printFelt(ctx, cw, ch, { base, deep, ink, glow }) {
    if (base) {
      const g = ctx.createRadialGradient(cw / 2, ch * 0.52, 0, cw / 2, ch * 0.52, cw * 0.62);
      g.addColorStop(0, base); g.addColorStop(1, deep);
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = ctx.createPattern(fibre, "repeat");   // felt fibre
      ctx.fillRect(0, 0, cw, ch);
    } else {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cw, ch);
    }
    ctx.strokeStyle = ink; ctx.fillStyle = ink;
    if (glow) { ctx.shadowColor = ink; ctx.shadowBlur = 10; }
    const [ax, ay] = toPx(0, -2.35, cw, ch);
    const unit = cw / W;
    // the two printed arcs, like a casino layout
    const arcText = (text, r, size, spacing) => {
      ctx.font = `400 ${size}px "League Gothic"`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const chars = [...text];
      const widths = chars.map((c) => ctx.measureText(c).width + spacing);
      const total = widths.reduce((a, b) => a + b, 0);
      let a = Math.PI / 2 + total / r / 2;
      chars.forEach((c, i) => {
        const w = widths[i];
        a -= w / r / 2;
        ctx.save();
        ctx.translate(ax + Math.cos(a) * r, ay + Math.sin(a) * r);
        ctx.rotate(a - Math.PI / 2);
        ctx.fillText(c, 0, 0);
        ctx.restore();
        a -= w / r / 2;
      });
    };
    arcText("BUSTATRO PAYS CHIPS × MULT", 1.78 * unit, 0.24 * unit, 0.03 * unit);
    arcText("DEALER MUST STAND ON 17 AND DRAW TO 16", 2.12 * unit, 0.12 * unit, 0.025 * unit);
    ctx.lineWidth = 0.014 * unit;
    for (const r of [1.5, 2.36]) { ctx.beginPath(); ctx.arc(ax, ay, r * unit, 0.12 * Math.PI, 0.88 * Math.PI); ctx.stroke(); }
    // betting boxes under the hand
    HAND.forEach(([x, z]) => {
      const [px, py] = toPx(x, z, cw, ch);
      ctx.beginPath(); ctx.arc(px, py, 0.44 * unit, 0, Math.PI * 2); ctx.stroke();
    });
    // the cash-out box
    const [bx, by] = toPx(1.45, 1.55, cw, ch);
    roundRect(ctx, bx - 1.2 * unit, by - 0.42 * unit, 2.4 * unit, 0.84 * unit, 0.12 * unit); ctx.stroke();
    ctx.font = `400 ${0.13 * unit}px "League Gothic"`; ctx.textAlign = "center";
    ctx.fillText("CASH OUT", bx, by + 0.56 * unit);
  }

  const fibre = document.createElement("canvas");
  fibre.width = fibre.height = 256;
  {
    const fx = fibre.getContext("2d"), img = fx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) { const n = rand(); img.data.set(n > 0.5 ? [255, 255, 255, (n - 0.5) * 30] : [0, 0, 0, (0.5 - n) * 30], i); }
    fx.putImageData(img, 0, 0);
  }
  const FW = 2048, FH = 1280;
  const feltWarm = canvasTex(FW, FH, (c, w, h) => printFelt(c, w, h, { base: C.felt, deep: C.feltDeep, ink: "rgba(232,184,74,.82)" }));
  await nextTask();
  const feltNeon = canvasTex(FW, FH, (c, w, h) => printFelt(c, w, h, { base: C.neonFelt, deep: C.neonDeep, ink: "rgba(62,242,230,.9)" }));
  await nextTask();
  const feltGlow = canvasTex(FW, FH, (c, w, h) => printFelt(c, w, h, { ink: "#3ef2e6", glow: true }));
  await nextTask();
  const feltRough = canvasTex(512, 320, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) { const v = 200 + rand() * 55; img.data.set([v, v, v, 255], i); }
    ctx.putImageData(img, 0, 0);
  }, false);

  const uNeon = { value: 0 };
  const feltMat = new THREE.MeshPhysicalMaterial({
    map: feltWarm, roughness: 1, roughnessMap: feltRough, sheen: 1, sheenRoughness: 0.75, sheenColor: col("#2f6b52"),
    emissiveMap: feltGlow, emissive: col("#ffffff"), emissiveIntensity: 0,
  });
  feltMat.onBeforeCompile = (sh) => {
    sh.uniforms.uNeon = uNeon;
    sh.uniforms.uMap2 = { value: feltNeon };
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uNeon;\nuniform sampler2D uMap2;")
      .replace("#include <map_fragment>", `
        vec4 feltA = texture2D( map, vMapUv );
        vec4 feltB = texture2D( uMap2, vMapUv );
        diffuseColor *= mix( feltA, feltB, uNeon );
        diffuseColor.rgb *= 1.0 - uNeon * 0.28 * step( 0.5, fract( gl_FragCoord.y * 0.25 ) );`);
  };
  const felt = new THREE.Mesh(new THREE.PlaneGeometry(W, D), feltMat);
  felt.rotation.x = -Math.PI / 2;
  felt.receiveShadow = true;
  scene.add(felt);

  // leather rail around the felt, with a neon strip tucked under it
  const railPath = roundedRectCurve(W / 2 + 0.06, D / 2 + 0.06, 0.7, 0.07);
  const rail = new THREE.Mesh(
    new THREE.TubeGeometry(railPath, 280, 0.16, 14, true),
    new THREE.MeshPhysicalMaterial({ color: col("#1d140e"), roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.5, sheen: 0.4, sheenColor: col("#4a3020") }),
  );
  rail.castShadow = true; rail.receiveShadow = true;
  scene.add(rail);
  const stripPath = roundedRectCurve(W / 2 - 0.12, D / 2 - 0.12, 0.6, 0.012);
  const neonStrip = new THREE.Mesh(new THREE.TubeGeometry(stripPath, 200, 0.012, 5, true), new THREE.MeshBasicMaterial({ color: col(C.cyan), transparent: true, opacity: 0 }));
  const neonHalo = new THREE.Mesh(new THREE.TubeGeometry(stripPath, 200, 0.07, 6, true), new THREE.MeshBasicMaterial({ color: col(C.cyan), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(neonStrip, neonHalo);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: col("#050403"), roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.9;
  scene.add(floor);

  await nextTask();
  // ---------- cards ----------
  const CW = 0.63, CH = 0.88, CT = 0.006, CR = 0.035;
  const cardShape = roundedRectShape(CW, CH, CR);
  const bodyGeo = new THREE.ExtrudeGeometry(cardShape, { depth: CT, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0012, bevelSegments: 2, curveSegments: 8 });
  bodyGeo.translate(0, 0, -CT / 2);
  const faceGeo = normalizedShapeGeometry(cardShape, CW, CH);
  const edgeMat = new THREE.MeshPhysicalMaterial({ color: col("#efe6d2"), roughness: 0.6 });

  const backTex = canvasTex(512, 716, (ctx, w, h) => {
    ctx.fillStyle = "#f3ecdc"; ctx.fillRect(0, 0, w, h);
    roundRect(ctx, 22, 22, w - 44, h - 44, 14); ctx.fillStyle = C.redDeep; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = "rgba(232,184,74,.42)"; ctx.lineWidth = 3;
    for (let i = -h; i < w + h; i += 26) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + h, 0); ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(w / 2, h / 2, 118, 150, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#f3ecdc"; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = C.brass; ctx.stroke();
    ctx.fillStyle = C.redDeep; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = '400 116px "League Gothic"'; ctx.fillText("D", w / 2, h / 2 - 62);
    ctx.font = '600 70px "Sofia Sans"'; ctx.fillText("♠", w / 2, h / 2 + 6);
    ctx.font = '400 116px "League Gothic"'; ctx.fillText("M", w / 2, h / 2 + 78);
  });

  function drawFace(ctx, w, h, { rank, suit, title, sub }) {
    const red = suit === "♥" || suit === "♦";
    const ink = red ? C.red : C.ink;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#f8f2e5"); g.addColorStop(1, "#e7dcc4");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = ink; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    const s = w / 512;
    const corner = () => {
      ctx.font = `400 ${86 * s}px "League Gothic"`; ctx.fillText(rank, 52 * s, 100 * s);
      ctx.font = `600 ${48 * s}px "Sofia Sans"`; ctx.fillText(suit, 52 * s, 150 * s);
    };
    corner();
    ctx.save(); ctx.translate(w, h); ctx.rotate(Math.PI); corner(); ctx.restore();
    if (title) {
      ctx.font = `600 ${150 * s}px "Sofia Sans"`; ctx.fillText(suit, w / 2, 300 * s);
      ctx.strokeStyle = ink; ctx.globalAlpha = 0.35; ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.moveTo(130 * s, 352 * s); ctx.lineTo(382 * s, 352 * s); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = C.ink;
      let size = 74 * s;
      ctx.font = `400 ${size}px "League Gothic"`;
      const lines = title.split("\n");
      lines.forEach((ln, i) => ctx.fillText(ln.toUpperCase(), w / 2, (432 + i * 70) * s));
      ctx.font = `600 ${24 * s}px "Sofia Sans"`; ctx.fillStyle = "#5a5045";
      ctx.fillText(sub.toUpperCase(), w / 2, (432 + lines.length * 70 + 4) * s);
    } else {
      ctx.font = `600 ${210 * s}px "Sofia Sans"`; ctx.textBaseline = "middle";
      ctx.fillText(suit, w / 2, h / 2 + 10 * s);
    }
  }

  const cardMat = (map) => new THREE.MeshPhysicalMaterial({ map, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.3 });
  const backMat = cardMat(backTex);

  function makeCard(face) {
    const g = new THREE.Group();
    const inner = new THREE.Group();                     // built in XY, laid flat with face up (+Y)
    inner.rotation.x = -Math.PI / 2;
    const body = new THREE.Mesh(bodyGeo, edgeMat);
    const front = new THREE.Mesh(faceGeo, cardMat(canvasTex(512, 716, (c, w, h) => drawFace(c, w, h, face))));
    front.position.z = CT / 2 + 0.0013;
    const back = new THREE.Mesh(faceGeo, backMat);
    back.position.z = -CT / 2 - 0.0013; back.rotation.y = Math.PI;
    for (const m of [body, front, back]) { m.castShadow = true; m.receiveShadow = true; }
    inner.add(body, front, back);
    g.add(inner);
    g.userData.inner = inner;
    return g;
  }

  await nextTask();
  const handCards = [
    makeCard({ rank: "J", suit: "♦", title: "Moodle Task\nFetcher", sub: "Node.js CLI" }),
    makeCard({ rank: "Q", suit: "♣", title: "Simple\nExcuseList", sub: "Vue + WebUntis" }),
    makeCard({ rank: "K", suit: "♠", title: "Blazers + Jets\nTracker", sub: "React + ESPN data" }),
    makeCard({ rank: "A", suit: "♥", title: "Bustatro", sub: "React + Express" }),
  ];
  handCards.forEach((c) => scene.add(c));

  await nextTask();
  // the parent's signature on SimpleExcuseList, written while you scroll
  const sigCurve = new THREE.CatmullRomCurve3(
    Array.from({ length: 64 }, (_, i) => {
      const u = i / 63;
      const x = -0.2 + 0.4 * u + 0.018 * Math.cos(u * 30);
      const y = -0.33 + 0.022 * Math.sin(u * 30) + 0.016 * Math.sin(u * 7) + 0.02 * u;
      return new THREE.Vector3(x, y, CT / 2 + 0.0026);
    }),
  );
  const sigGeo = new THREE.TubeGeometry(sigCurve, 240, 0.0028, 5, false);
  const sigCount = sigGeo.index.count;
  sigGeo.setDrawRange(0, 0);
  const signature = new THREE.Mesh(sigGeo, new THREE.MeshStandardMaterial({ color: col("#1f3d8a"), roughness: 0.35 }));
  handCards[1].userData.inner.add(signature);

  // ---------- the dealer's deck and the 52 cards that burst out of it ----------
  const deckH = 0.15;
  const stripeTex = canvasTex(4, 64, (ctx, w, h) => {
    ctx.fillStyle = "#efe6d2"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(90,70,40,.35)";
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  });
  stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping;
  stripeTex.repeat.set(1, 12);
  const deckGeo = new THREE.ExtrudeGeometry(cardShape, { depth: deckH, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 8 });
  const deck = new THREE.Group();
  const deckBody = new THREE.Mesh(deckGeo, [new THREE.MeshPhysicalMaterial({ color: col("#efe6d2"), roughness: 0.6 }), new THREE.MeshPhysicalMaterial({ map: stripeTex, roughness: 0.7 })]);
  deckBody.rotation.x = -Math.PI / 2;
  const deckTop = new THREE.Mesh(faceGeo, backMat);
  deckTop.rotation.x = -Math.PI / 2;
  deckTop.position.y = deckH + 0.0035;
  deckBody.castShadow = deckBody.receiveShadow = deckTop.receiveShadow = true;
  deck.add(deckBody, deckTop);
  deck.position.set(DECK[0], 0, DECK[1]);
  deck.rotation.y = DECK[2];
  scene.add(deck);

  await nextTask();
  const N = phoneQuery.matches ? 24 : 52;
  const atlas = canvasTex(1024, 1432, (ctx) => {
    const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "7", "K"];
    const suits = ["♠", "♥", "♦", "♣"];
    ranks.forEach((r, i) => {
      ctx.save();
      ctx.translate((i % 4) * 256, Math.floor(i / 4) * 358);
      drawFace(ctx, 256, 358, { rank: r, suit: suits[(i * 3) % 4] });
      ctx.restore();
    });
  });
  const cellAttr = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2);
  for (let i = 0; i < N; i++) {
    const cell = i % 16;
    cellAttr.setXY(i, (cell % 4) * 0.25, 0.75 - Math.floor(cell / 4) * 0.25);
  }
  const atlasMat = cardMat(atlas);
  atlasMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aCell;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vMapUv * 0.25 + aCell;\n#endif");
  };
  const flyFront = faceGeo.clone();
  flyFront.translate(0, 0, CT / 2 + 0.0013);
  flyFront.setAttribute("aCell", cellAttr);
  const flyBack = faceGeo.clone();
  flyBack.rotateY(Math.PI);
  flyBack.translate(0, 0, -CT / 2 - 0.0013);
  const flyMeshes = [
    new THREE.InstancedMesh(bodyGeo, edgeMat, N),
    new THREE.InstancedMesh(flyFront, atlasMat, N),
    new THREE.InstancedMesh(flyBack, backMat, N),
  ];
  flyMeshes.forEach((m) => { m.castShadow = true; m.frustumCulled = false; m.visible = false; scene.add(m); });
  const fly = Array.from({ length: N }, (_, i) => {
    const golden = i * 2.39996;
    const r = 0.55 + rand() * 1.0;
    const land = new THREE.Vector3((rand() - 0.5) * 6.6, 0, -2.0 + rand() * 1.45);    // dealer's half: hand and cash-out box stay clear
    if (land.x < -1.6 && rand() < 0.6) land.z += 1.2 + rand() * 1.0;                    // a few slide to the left end
    return {
      angle: golden, r, rise: 0.25 + rand() * 1.7, spin: (rand() - 0.5) * 9, tilt: (rand() - 0.5) * 8,
      land, landYaw: rand() * Math.PI * 2, landFlip: rand() < 0.55 ? 0 : Math.PI, delay: rand() * 0.25,
    };
  });

  await nextTask();
  // ---------- chips: the skills ----------
  const chipR = 0.195, chipT = 0.034;
  const chipProfile = [
    [0, 0], [chipR - 0.012, 0], [chipR - 0.003, 0.003], [chipR, 0.009], [chipR, chipT - 0.009], [chipR - 0.003, chipT - 0.003],
    [chipR - 0.012, chipT], [chipR - 0.03, chipT], [chipR - 0.034, chipT - 0.0025], [0, chipT - 0.0025],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const chipGeo = new THREE.LatheGeometry(chipProfile, 40);
  chipGeo.computeVertexNormals();
  const chipTex = (base) => canvasTex(512, 256, (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    // lathe uv: u around the chip, v along the profile (0 centre bottom → 1 centre top)
    ctx.fillStyle = "#f3ecdc";
    for (let k = 0; k < 6; k++) {
      const x = (k / 6) * w;
      ctx.fillRect(x, h * 0.3, w / 26, h * 0.32);                // edge inserts on the side wall
      ctx.fillRect(x + w / 60, h * 0.69, w / 40, h * 0.05);       // dashes on the face ring
    }
    ctx.fillStyle = "rgba(232,184,74,.9)"; ctx.fillRect(0, h * 0.775, w, h * 0.02);
  });
  const chipMats = [
    new THREE.MeshPhysicalMaterial({ map: chipTex(C.red), roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.35 }),
    new THREE.MeshPhysicalMaterial({ map: chipTex("#1a1612"), roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.35 }),
  ];
  const PER = 7;
  const stacks = [
    ...Array.from({ length: 6 }, (_, i) => ({ mat: 0, x: 1.55 + i * 0.42, z: -0.32 })),   // programming languages
    ...Array.from({ length: 5 }, (_, i) => ({ mat: 1, x: 1.76 + i * 0.42, z: 0.2 })),     // tools
  ];
  const chipMeshes = chipMats.map((m, k) => {
    const count = stacks.filter((s) => s.mat === k).length * PER;
    const mesh = new THREE.InstancedMesh(chipGeo, m, count);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;                          // instances move; a cached bounding sphere would cull them
    scene.add(mesh);
    return mesh;
  });
  const chipJitter = stacks.map(() => Array.from({ length: PER }, () => [(rand() - 0.5) * 0.012, (rand() - 0.5) * 0.012, rand() * Math.PI * 2]));
  const cashTarget = stacks.map((_, i) => [0.45 + (i % 6) * 0.4 + (i >= 6 ? 0.2 : 0), 1.42 + (i >= 6 ? 0.2 : -0.14)]);

  await nextTask();
  // ---------- the dealer's HP plaque ----------
  const plaque = new THREE.Group();
  const plaqueBody = new THREE.Mesh(new RoundedBoxGeometry(1.36, 0.44, 0.08, 4, 0.025), new THREE.MeshPhysicalMaterial({ color: col("#b8893a"), metalness: 1, roughness: 0.32, clearcoat: 0.2 }));
  plaqueBody.position.y = 0.22;
  plaqueBody.castShadow = true;
  const ledCanvas = document.createElement("canvas");
  ledCanvas.width = 512; ledCanvas.height = 140;
  const ledTex = new THREE.CanvasTexture(ledCanvas);
  ledTex.colorSpace = THREE.SRGBColorSpace;
  const ledMat = new THREE.MeshBasicMaterial({ map: ledTex });
  const led = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 0.3), ledMat);
  led.position.set(0, 0.22, 0.041);
  plaque.add(plaqueBody, led);
  const plaquePivot = new THREE.Group();
  plaquePivot.position.set(PLAQUE[0], 0, PLAQUE[1]);
  plaquePivot.add(plaque);
  scene.add(plaquePivot);
  let ledState = "";
  function drawLed(hp, neon) {
    const key = hp + (neon ? "n" : "w");
    if (key === ledState) return;
    ledState = key;
    const ctx = ledCanvas.getContext("2d");
    ctx.fillStyle = "#0c0708"; ctx.fillRect(0, 0, 512, 140);
    ctx.fillStyle = neon ? C.magenta : "#ffb347";
    ctx.font = '900 92px "Doto"'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(hp > 0 ? `${hp} HP` : "BUST", 256, 74);
    ledTex.needsUpdate = true;
  }

  // ---------- light ----------
  const lamp = new THREE.SpotLight(col("#ffdcb4"), 90, 0, 0.62, 0.65, 2);
  lamp.position.set(0.2, 5.4, 1.2);
  lamp.target.position.set(0.2, 0, -0.1);
  lamp.castShadow = true;
  lamp.shadow.mapSize.setScalar(coarse ? 1024 : 2048);
  lamp.shadow.camera.near = 2; lamp.shadow.camera.far = 9;
  lamp.shadow.bias = -0.0004; lamp.shadow.normalBias = 0.01; lamp.shadow.radius = 4;
  scene.add(lamp, lamp.target);
  const rake = new THREE.DirectionalLight(col("#ffd9a8"), 0);          // raking light over the chips
  rake.position.set(-2, 1.2, 1.5); rake.target.position.set(2.6, 0, 0);
  scene.add(rake, rake.target);
  const cyanLight = new THREE.PointLight(col(C.cyan), 0, 0, 2);
  cyanLight.position.set(-3.2, 1.6, 1.2);
  const magentaLight = new THREE.PointLight(col(C.magenta), 0, 0, 2);
  magentaLight.position.set(3.4, 1.4, -0.4);
  const house = new THREE.HemisphereLight(col("#ffe4c4"), col("#1a120c"), 0);
  scene.add(cyanLight, magentaLight, house);

  // ---------- shots: one per scene, framed by numbers ----------
  // look: aim point · r: radius of what must be in frame · dir: where the camera looks from
  // fill: share of the screen width the subject covers · shift: where it sits, away from the type
  const SHOTS = [
    { look: [-0.55, 0.12, -0.5], r: 1.6, dir: [0.12, 0.78, 1], fill: 0.5, shift: [0.22, 0.04] },    // 0 table, type left
    { look: [-1.15, 0.02, 0.32], r: 0.6, dir: [-0.4, 0.55, 1], fill: 0.5, shift: [-0.22, 0.03] },    // 1 small blind, type right
    { look: [-0.81, 0.02, 0.33], r: 0.82, dir: [0.42, 1.2, 0.85], fill: 0.48, shift: [0.26, 0.04] },  // 2 big blind, type left
    { look: [-0.47, 0.02, 0.33], r: 1.1, dir: [-0.25, 0.85, 1], fill: 0.52, shift: [-0.22, 0.04] },   // 3 casino 2, type right
    { look: [2.52, 0.12, -0.06], r: 1.2, dir: [0.35, 0.62, 1], fill: 0.6, shift: [0.04, -0.17] },    // 4 cheats, type in a lower band
    { look: [-0.13, 0.02, 0.36], r: 1.3, dir: [0.05, 0.42, 1], fill: 0.85, shift: [0, 0.2] },        // 5 boss blind close-up, one line on top
    { look: [-0.13, 0.55, 0.3], r: 2.15, dir: [-1, 0.6, -0.5], fill: 0.48, shift: [-0.24, 0.02] },    // 6 bustatro, orbited 120°, type right
    { look: [0.1, 0.2, 0.1], r: 2.4, dir: [-0.4, 1.5, 0.6], fill: 0.45, shift: [0, 0] },              // 7 bonus round (covered by the game)
    { look: [0.9, 0, 0.75], r: 1.85, dir: [0.1, 1, 0.34], fill: 0.42, shift: [0.25, 0.05] },         // 8 cash out, type left
  ];
  const PHONE = { fill: 0.78, shift: [0, -0.24] };
  const sphA = new THREE.Spherical(), sphB = new THREE.Spherical(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const look = new THREE.Vector3(), dir = new THREE.Vector3();

  const distanceFor = (r, fill) => {
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return Math.max(r / (fill * t * camera.aspect), r / (0.9 * t));
  };

  // ---------- story state ----------
  const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
  const span = (s, a, b) => clamp01((s - a) / (b - a));
  const smooth = (x) => x * x * (3 - 2 * x);
  const easeOut = (x) => 1 - (1 - x) ** 3;
  const easeIn = (x) => x * x;
  const mix = THREE.MathUtils.lerp;

  const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), e = new THREE.Euler(), m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3(), scl = new THREE.Vector3(1, 1, 1);
  const deckTopY = deckH + 0.006;

  function placeHandCard(card, i, p) {
    const [hx, hz, yaw] = HAND[i];
    const k = smooth(p);
    const sx = DECK[0], sz = DECK[1];
    card.position.set(mix(sx, hx, k), mix(deckTopY + (3 - i) * 0.007, 0.004, k) + Math.sin(Math.PI * k) * 0.32, mix(sz, hz, k));
    e.set(0, mix(DECK[2], yaw, k), mix(Math.PI, 0, easeOut(p)) + Math.sin(Math.PI * k) * 0.25, "YXZ");
    card.quaternion.setFromEuler(e);
  }

  let update = function (s) {
    const phone = phoneQuery.matches;
    // light: warm lamp → flicker → neon → fades → house lights
    let lampK = 1, neon = 0;
    if (s > 4.42 && s < 4.58) {
      const f = Math.floor((s - 4.42) * 160);
      lampK = reduced.matches ? 1 - span(s, 4.42, 4.58) : [1, 0.2, 1, 0.9, 0.05, 0.7, 0, 0.4, 0, 0, 0.15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][f] ?? 0;
    } else if (s >= 4.58) lampK = 0;
    if (s >= 4.6) neon = easeOut(span(s, 4.6, 4.68));
    neon *= 1 - smooth(span(s, 6.6, 7.6));
    const houseK = smooth(span(s, 7.2, 8));
    lampK = Math.max(lampK, houseK);

    lamp.intensity = 90 * lampK;
    rake.intensity = 1.6 * Math.sin(Math.PI * span(s, 3.3, 4.6)) * lampK;
    house.intensity = 0.35 * houseK + 0.06;
    scene.environmentIntensity = 0.12 + 0.06 * neon + 0.12 * houseK;
    cyanLight.intensity = 9 * neon;
    magentaLight.intensity = 11 * neon;
    uNeon.value = neon;
    feltMat.emissiveIntensity = 0.55 * neon;
    neonStrip.material.opacity = neon;
    neonHalo.material.opacity = 0.35 * neon;
    scene.background.copy(BG.warm).lerp(BG.neon, neon).lerp(BG.house, houseK);
    scene.fog.color.copy(scene.background);

    // hand: J♦ at 0.35–0.9, Q♣ at 1.35–1.9, A♥ at 3.55–3.95
    placeHandCard(handCards[0], 0, span(s, 0.35, 0.9));
    placeHandCard(handCards[1], 1, span(s, 1.35, 1.9));
    placeHandCard(handCards[2], 2, span(s, 2.35, 2.9));
    placeHandCard(handCards[3], 3, span(s, 4.6, 4.95));
    const sig = Math.floor(sigCount * span(s, 1.75, 2.2) / 3) * 3;
    sigGeo.setDrawRange(0, sig);

    // HP plaque: counts down, then falls over when the boss is beaten
    const hp = story.hpAt(s);
    drawLed(hp, neon > 0.5);
    plaquePivot.rotation.x = mix(-0.22, -Math.PI / 2 + 0.04, easeIn(span(s, 4.98, 5.2)));

    // the burst: the deck explodes into a vortex around the hand, then the cards rain onto the felt
    const burst = span(s, 5.0, 5.6), settle = smooth(span(s, 6.05, 6.85));
    const show = burst > 0;
    flyMeshes.forEach((m) => { m.visible = show; });
    deck.scale.y = 1 - 0.85 * smooth(span(s, 5.0, 5.25));
    if (show) {
      const centre = v2.set(-0.13, 0, 0.3);
      for (let i = 0; i < N; i++) {
        const f = fly[i];
        const b = easeOut(clamp01((burst - f.delay * 0.5) / (1 - f.delay * 0.5)));
        const swirl = f.angle + b * 2.4 + span(s, 5.6, 6.05) * 0.8;
        const air = v1.set(centre.x + Math.cos(swirl) * f.r * b, 0.15 + f.rise * b, centre.z + Math.sin(swirl) * f.r * b * 0.75);
        const start = pos.set(DECK[0], deckTopY - i * 0.002, DECK[1]);
        pos.lerpVectors(start, air, b);
        pos.lerp(v1.set(f.land.x, 0.003 + i * 0.0009, f.land.z), settle);
        e.set(mix(f.tilt * b, 0, settle), mix(f.spin * b, f.landYaw, settle), mix(Math.PI + f.tilt * 0.5 * b, f.landFlip, settle), "YXZ");
        qA.setFromEuler(e);
        qB.setFromAxisAngle(v1.set(1, 0, 0), -Math.PI / 2);
        qA.multiply(qB);
        m4.compose(pos, qA, scl);
        flyMeshes.forEach((m) => m.setMatrixAt(i, m4));
      }
      flyMeshes.forEach((m) => { m.instanceMatrix.needsUpdate = true; });
    }

    // chips: stacked as skills, then pushed into the cash-out box
    const cash = smooth(span(s, 7.3, 8));
    const counters = [0, 0];
    stacks.forEach((st, si) => {
      const [tx, tz] = cashTarget[si];
      const x = mix(st.x, tx, cash), z = mix(st.z, tz, cash);
      for (let k = 0; k < PER; k++) {
        const [jx, jz, ry] = chipJitter[si][k];
        const drop = easeIn(1 - span(s, 3.25 + si * 0.035 + k * 0.012, 3.45 + si * 0.035 + k * 0.012));   // stacked chip by chip
        e.set(0, ry + drop * 2, 0);
        qA.setFromEuler(e);
        pos.set(x + jx, k * (chipT + 0.0004) + drop * 2.5, z + jz);
        m4.compose(pos, qA, scl);
        chipMeshes[st.mat].setMatrixAt(counters[st.mat]++, m4);
      }
    });
    chipMeshes.forEach((m) => { m.instanceMatrix.needsUpdate = true; m.visible = s > 3.2; });

    // camera: between shots it holds near each one and moves quickly between them
    const fIdx = Math.min(Math.floor(s), SHOTS.length - 2);
    const k = smooth(smooth(s - fIdx));
    const A = SHOTS[fIdx], B = SHOTS[fIdx + 1];
    look.set(mix(A.look[0], B.look[0], k), mix(A.look[1], B.look[1], k), mix(A.look[2], B.look[2], k));
    sphA.setFromVector3(v1.fromArray(A.dir)); sphB.setFromVector3(v2.fromArray(B.dir));
    let dTheta = sphB.theta - sphA.theta;
    if (dTheta > Math.PI) dTheta -= Math.PI * 2;
    if (dTheta < -Math.PI) dTheta += Math.PI * 2;
    dir.setFromSphericalCoords(1, mix(sphA.phi, sphB.phi, k), sphA.theta + dTheta * k);
    const r = mix(A.r, B.r, k) * (phone ? 0.72 : 1);   // phones: closer, the subject carries the upper half
    const fill = phone ? Math.min(PHONE.fill, mix(A.fill, B.fill, k)) : mix(A.fill, B.fill, k);
    const fov = phone ? 42 : 32;
    if (camera.fov !== fov) camera.fov = fov;
    const dist = distanceFor(r, fill);
    camera.position.copy(look).addScaledVector(dir, dist);
    scene.fog.near = dist + 1.5;                         // fog falls off beyond the subject, at any distance
    scene.fog.far = dist + 9;
    camera.lookAt(look);
    const sx = phone ? PHONE.shift[0] : mix(A.shift[0], B.shift[0], k);
    const sy = phone ? PHONE.shift[1] : mix(A.shift[1], B.shift[1], k);
    const w = renderer.domElement.width, h = renderer.domElement.height;
    camera.setViewOffset(w, h, -sx * w, -sy * h, w, h);
    camera.updateProjectionMatrix();
  };

  // ---------- loop: render on demand, pause when hidden or covered ----------
  let target = story.progress(), current = target, dirty = true, visible = true, firstFrame = false;
  const gameSection = document.getElementById("play");
  const covered = () => {
    const r = gameSection.getBoundingClientRect();
    return r.top <= -innerHeight * 0.1 && r.bottom >= innerHeight * 1.1;
  };
  const onScroll = () => {
    target = story.progress();
    if (reduced.matches) target = Math.round(target);
    dirty = true;
  };
  addEventListener("scroll", onScroll, { passive: true });
  reduced.addEventListener("change", onScroll);

  new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    story.measure();
    onScroll();
    current = target;
  }).observe(canvas);
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; dirty = true; });

  // frame-rate guard: lower the pixel ratio, then fall back to the HTML version
  const frameTimes = [];
  let last = 0, downgrades = 0;
  function guard(now) {
    if (last) frameTimes.push(now - last);
    last = now;
    if (frameTimes.length < 90) return;
    const sorted = frameTimes.sort((a, b) => a - b), median = sorted[45];
    frameTimes.length = 0;
    if (median < 40) return;
    if (downgrades++ === 0 && pixelRatio > 1) {
      pixelRatio = 1;
      renderer.setPixelRatio(1);
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    } else {
      dispose();
      root.classList.remove("gl", "scene-ready");
      root.classList.add("no-gl");
    }
  }

  update(current);
  await renderer.compileAsync(scene, camera);
  await nextTask();
  let prev = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - prev) / 1000, 0.1);
    prev = now;
    if (!visible) return;
    const diff = target - current;
    if (Math.abs(diff) > 0.0004) { current += diff * (1 - Math.exp(-dt * 7)); dirty = true; }
    else if (current !== target) { current = target; dirty = true; }
    if (!dirty) { last = 0; return; }
    dirty = false;
    if (firstFrame && covered()) return;
    update(current);
    renderer.render(scene, camera);
    if (!firstFrame) { firstFrame = true; root.classList.add("scene-ready"); }
    else guard(now);
  });

  canvas.addEventListener("webglcontextlost", (ev) => { ev.preventDefault(); renderer.setAnimationLoop(null); });
  canvas.addEventListener("webglcontextrestored", () => location.reload());

  if (debug) {
    // scene-checks.js measures `subject`: an invisible box around whatever the current shot frames
    const subject = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }));
    scene.add(subject);
    const box = new THREE.Box3(), tmp = new THREE.Box3(), size = new THREE.Vector3();
    const focus = (s) => {
      const i = Math.round(s), hand = handCards.filter((_, k) => k < (s < 1.5 ? 1 : s < 2.5 ? 2 : s < 4.5 ? 3 : 4));
      return i === 0 ? [deck, plaque, ...handCards] : i === 4 ? chipMeshes : i === 8 ? [...chipMeshes, ...handCards] : i === 7 ? [] : hand;
    };
    const baseUpdate = update;
    update = (s) => {
      baseUpdate(s);
      box.makeEmpty();
      focus(s).forEach((o) => box.union(tmp.setFromObject(o)));
      if (box.isEmpty()) subject.scale.setScalar(1e-6);
      else { box.getCenter(subject.position); box.getSize(size); subject.scale.copy(size).max(new THREE.Vector3(1e-6, 1e-6, 1e-6)); }
      subject.updateMatrixWorld();
    };
    window.__three = { THREE, renderer, scene, camera, subject, story, render: (s) => { update(s); renderer.render(scene, camera); } };
  }

  function dispose() {
    renderer.setAnimationLoop(null);
    removeEventListener("scroll", onScroll);
    scene.traverse((o) => {
      o.geometry?.dispose();
      [].concat(o.material || []).forEach((m) => { Object.values(m).forEach((v) => v?.isTexture && v.dispose()); m.dispose(); });
    });
    scene.environment?.dispose();
    renderer.dispose();
  }
}

// ---------- helpers ----------
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function roundedRectShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
// ShapeGeometry with uvs spanning 0..1 over the card, so a whole canvas maps onto one face
function normalizedShapeGeometry(shape, w, h) {
  const g = new THREE.ShapeGeometry(shape, 10);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  return g;
}
function roundedRectCurve(hx, hz, r, y) {
  const pts = [];
  const corner = (cx, cz, a0) => { for (let k = 0; k <= 8; k++) { const a = a0 + (k / 8) * (Math.PI / 2); pts.push(new THREE.Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r)); } };
  corner(hx - r, hz - r, 0);
  corner(-hx + r, hz - r, Math.PI / 2);
  corner(-hx + r, -hz + r, Math.PI);
  corner(hx - r, -hz + r, Math.PI * 1.5);
  return new THREE.CatmullRomCurve3(pts, true, "centripetal");
}
