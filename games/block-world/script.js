'use strict';

// ============================================================
//  SCENE SETUP
// ============================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 40, 90);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.05,
  200
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('game-canvas').appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
//  LIGHTING
// ============================================================
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(60, 120, 50);
scene.add(sun);

scene.add(new THREE.HemisphereLight(0x87CEEB, 0x444444, 0.25));

// ============================================================
//  BLOCK TYPES
// ============================================================
const BLOCK_TYPES = ['GRASS', 'DIRT', 'STONE'];
let selectedBlockIndex = 0;

// Top / side / bottom colour per block type
const BLOCK_DATA = {
  GRASS: { top: 0x5a9e3a, side: 0x7a5225, bottom: 0x7a5225 },
  DIRT:  { top: 0x7a5225, side: 0x7a5225, bottom: 0x7a5225 },
  STONE: { top: 0x888888, side: 0x888888, bottom: 0x888888 },
};

// Shared geometry (all blocks are unit cubes)
const blockGeo = new THREE.BoxGeometry(1, 1, 1);

// Cache materials per type (array of 6 face materials)
const matCache = {};
function getBlockMats(type) {
  if (!matCache[type]) {
    const d = BLOCK_DATA[type];
    matCache[type] = [
      new THREE.MeshLambertMaterial({ color: d.side }),   // +x
      new THREE.MeshLambertMaterial({ color: d.side }),   // -x
      new THREE.MeshLambertMaterial({ color: d.top }),    // +y
      new THREE.MeshLambertMaterial({ color: d.bottom }), // -y
      new THREE.MeshLambertMaterial({ color: d.side }),   // +z
      new THREE.MeshLambertMaterial({ color: d.side }),   // -z
    ];
  }
  return matCache[type];
}

// ============================================================
//  BLOCK WORLD
// ============================================================
const blockMap  = new Map();  // key -> mesh
const meshList  = [];         // all active block meshes (for raycasting)

function bKey(x, y, z) {
  return `${x},${y},${z}`;
}

function addBlock(x, y, z, type) {
  const key = bKey(x, y, z);
  if (blockMap.has(key)) return null;
  const mesh = new THREE.Mesh(blockGeo, getBlockMats(type));
  mesh.position.set(x, y, z);
  mesh.userData = { key, type, bx: x, by: y, bz: z };
  scene.add(mesh);
  blockMap.set(key, mesh);
  meshList.push(mesh);
  return mesh;
}

function removeBlock(key) {
  const mesh = blockMap.get(key);
  if (!mesh) return;
  scene.remove(mesh);
  blockMap.delete(key);
  const i = meshList.indexOf(mesh);
  if (i >= 0) meshList.splice(i, 1);
}

// ============================================================
//  WORLD GENERATION  (20 × 20, 5 layers deep)
// ============================================================
function generateWorld(size) {
  const h = Math.floor(size / 2);
  for (let x = -h; x < h; x++) {
    for (let z = -h; z < h; z++) {
      addBlock(x,  0, z, 'GRASS');
      addBlock(x, -1, z, 'DIRT');
      addBlock(x, -2, z, 'DIRT');
      addBlock(x, -3, z, 'STONE');
      addBlock(x, -4, z, 'STONE');
    }
  }
}

generateWorld(24);

// ============================================================
//  PLAYER
// ============================================================
const PLAYER_H = 1.7;   // eye height above feet
const SPEED    = 5.0;
const JUMP_VEL = 8.0;
const GRAVITY  = -22.0;

// Camera = eye. Feet = camera.position.y - PLAYER_H
camera.position.set(0, 3.5, 0);  // will fall to ground on first frame
camera.rotation.order = 'YXZ';

let velY      = 0;
let onGround  = false;
let flyMode   = false;

// ============================================================
//  PLAYER COLLISION
// ============================================================
// Returns true if the given eye-position overlaps any block.
function playerCollides(pos) {
  const hw  = 0.28;                    // half-width of player AABB
  const fy  = pos.y - PLAYER_H;       // feet Y
  // Sample three heights: just above feet, mid, just below eyes
  const yChecks = [fy + 0.05, fy + PLAYER_H * 0.55, pos.y - 0.05];
  const xChecks = [pos.x - hw, pos.x + hw];
  const zChecks = [pos.z - hw, pos.z + hw];

  for (const cx of xChecks) {
    for (const cz of zChecks) {
      for (const cy of yChecks) {
        if (blockMap.has(bKey(Math.round(cx), Math.round(cy), Math.round(cz)))) {
          return true;
        }
      }
    }
  }
  return false;
}

// ============================================================
//  CONTROLS
// ============================================================
const keys = {};
let yaw     = 0;
let pitch   = 0;
let locked  = false;
let paused  = false;

const canvas = renderer.domElement;

// --- Pointer lock ---
canvas.addEventListener('click', () => {
  if (!paused && document.getElementById('start-overlay').style.display === 'none') {
    canvas.requestPointerLock();
  }
});

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
});

document.addEventListener('mousemove', (e) => {
  if (!locked || paused) return;
  const s = 0.002;
  yaw   = yaw - e.movementX * s;
  pitch = Math.max(-1.55, Math.min(1.55, pitch - e.movementY * s));
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
});

// --- Keyboard ---
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;

  // Jump (walking mode)
  if (e.code === 'Space') {
    e.preventDefault();
    if (!flyMode && onGround) {
      velY     = JUMP_VEL;
      onGround = false;
    }
  }

  // Fly toggle
  if (e.code === 'KeyF') {
    flyMode = !flyMode;
    velY    = 0;
    document.getElementById('fly-label').textContent = flyMode ? '✈ FLY ON' : '';
  }

  // Block type hotkeys
  if (e.code === 'Digit1') selectBlock(0);
  if (e.code === 'Digit2') selectBlock(1);
  if (e.code === 'Digit3') selectBlock(2);

  // Pause
  if (e.code === 'Escape') togglePause();
});

document.addEventListener('keyup', (e) => { keys[e.code] = false; });

// Scroll to cycle blocks
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  selectedBlockIndex =
    (selectedBlockIndex + (e.deltaY > 0 ? 1 : -1) + BLOCK_TYPES.length) %
    BLOCK_TYPES.length;
  updateHUD();
}, { passive: false });

// Mouse buttons
canvas.addEventListener('mousedown', (e) => {
  if (!locked || paused) return;
  if (e.button === 0) doBreak();
  if (e.button === 2) doPlace();
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ============================================================
//  PLAYER UPDATE
// ============================================================
const _hDir    = new THREE.Vector3();
const _flyDir  = new THREE.Vector3();
const _euler   = new THREE.Euler(0, 0, 0, 'YXZ');

function updatePlayer(dt) {
  if (paused) return;

  // Build movement intent from keyboard
  const mx = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  const mz = (keys['KeyS'] ? 1 : 0) - (keys['KeyW'] ? 1 : 0);

  // ---------- FLY MODE ----------
  if (flyMode) {
    const my = (keys['Space'] ? 1 : 0) - (keys['ShiftLeft'] || keys['ShiftRight'] ? 1 : 0);
    _flyDir.set(mx, 0, mz);
    if (_flyDir.length() > 0) _flyDir.normalize();
    _euler.set(0, yaw, 0);
    _flyDir.applyEuler(_euler);
    _flyDir.y = my;

    const spd = SPEED * 1.6 * dt;
    camera.position.addScaledVector(_flyDir, spd);
    return;
  }

  // ---------- WALKING MODE ----------
  // Gravity
  velY += GRAVITY * dt;

  // Horizontal movement (per-axis collision)
  if (mx !== 0 || mz !== 0) {
    _hDir.set(mx, 0, mz).normalize();
    _euler.set(0, yaw, 0);
    _hDir.applyEuler(_euler);

    camera.position.x += _hDir.x * SPEED * dt;
    if (playerCollides(camera.position)) {
      camera.position.x -= _hDir.x * SPEED * dt;
    }

    camera.position.z += _hDir.z * SPEED * dt;
    if (playerCollides(camera.position)) {
      camera.position.z -= _hDir.z * SPEED * dt;
    }
  }

  // Vertical movement
  camera.position.y += velY * dt;

  if (playerCollides(camera.position)) {
    if (velY < 0) {
      // Landing — push up until clear
      onGround = true;
      let itr = 0;
      while (playerCollides(camera.position) && itr++ < 60) {
        camera.position.y += 0.02;
      }
    } else {
      // Ceiling — push down until clear
      let itr = 0;
      while (playerCollides(camera.position) && itr++ < 60) {
        camera.position.y -= 0.02;
      }
    }
    velY = 0;
  } else {
    onGround = false;
  }

  // Void fall reset
  if (camera.position.y < -20) {
    camera.position.set(0, 3.5, 0);
    velY = 0;
  }
}

// ============================================================
//  RAYCASTING
// ============================================================
const ray = new THREE.Raycaster();
ray.far = 6;

function getHit() {
  ray.setFromCamera({ x: 0, y: 0 }, camera);
  const hits = ray.intersectObjects(meshList);
  return hits.length > 0 ? hits[0] : null;
}

// ============================================================
//  BLOCK HIGHLIGHT
// ============================================================
const hlMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1.025, 1.025, 1.025),
  new THREE.MeshBasicMaterial({
    color: 0x000000,
    wireframe: true,
    transparent: true,
    opacity: 0.55,
  })
);
hlMesh.visible = false;
scene.add(hlMesh);

function updateHighlight() {
  const hit = getHit();
  if (hit && !paused) {
    hlMesh.visible = true;
    hlMesh.position.copy(hit.object.position);
  } else {
    hlMesh.visible = false;
  }
}

// ============================================================
//  BREAK BLOCK
// ============================================================
const breakAnims = [];  // { mesh, t, dur }

function doBreak() {
  const hit = getHit();
  if (!hit) return;
  const mesh = hit.object;

  // Remove from world immediately (so ray can't hit it again)
  blockMap.delete(mesh.userData.key);
  const i = meshList.indexOf(mesh);
  if (i >= 0) meshList.splice(i, 1);

  // Animate shrink + slight drop
  breakAnims.push({ mesh, t: 0, dur: 0.18 });
}

function updateBreakAnims(dt) {
  for (let i = breakAnims.length - 1; i >= 0; i--) {
    const a = breakAnims[i];
    a.t += dt;
    const p = a.t / a.dur;
    if (p >= 1) {
      scene.remove(a.mesh);
      breakAnims.splice(i, 1);
    } else {
      const s = 1 - p;
      a.mesh.scale.setScalar(s);
      // Drift slightly downward
      a.mesh.position.y = a.mesh.userData.by - p * 0.3;
    }
  }
}

// ============================================================
//  PLACE BLOCK
// ============================================================
function doPlace() {
  const hit = getHit();
  if (!hit) return;

  // Face normal → adjacent block position
  const norm = hit.face.normal.clone();
  norm.transformDirection(hit.object.matrixWorld);

  const bx = hit.object.userData.bx + Math.round(norm.x);
  const by = hit.object.userData.by + Math.round(norm.y);
  const bz = hit.object.userData.bz + Math.round(norm.z);

  // Prevent placing inside the player
  const px  = camera.position.x;
  const py  = camera.position.y;
  const pz  = camera.position.z;
  const fy  = py - PLAYER_H;
  if (
    Math.abs(bx - px) < 0.8 &&
    Math.abs(bz - pz) < 0.8 &&
    by + 0.5 >= fy &&
    by - 0.5 <= py
  ) return;

  addBlock(bx, by, bz, BLOCK_TYPES[selectedBlockIndex]);
}

// ============================================================
//  UI
// ============================================================
function selectBlock(idx) {
  selectedBlockIndex = idx;
  updateHUD();
}

function updateHUD() {
  document.querySelectorAll('.inv-slot').forEach((el, i) => {
    el.classList.toggle('active', i === selectedBlockIndex);
  });
}

// Inventory click
document.querySelectorAll('.inv-slot').forEach((el, i) => {
  el.addEventListener('click', () => selectBlock(i));
});

// ============================================================
//  PAUSE
// ============================================================
function togglePause() {
  paused = !paused;
  const menu = document.getElementById('pause-menu');
  menu.style.display = paused ? 'flex' : 'none';
  if (paused) document.exitPointerLock();
}

document.getElementById('pause-btn').addEventListener('click', togglePause);

document.getElementById('resume-btn').addEventListener('click', () => {
  paused = false;
  document.getElementById('pause-menu').style.display = 'none';
  canvas.requestPointerLock();
});

// ============================================================
//  START OVERLAY
// ============================================================
const startOverlay = document.getElementById('start-overlay');
startOverlay.addEventListener('click', () => {
  startOverlay.style.display = 'none';
  canvas.requestPointerLock();
});

// ============================================================
//  GAME LOOP
// ============================================================
let lastTime = performance.now();

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  updatePlayer(dt);
  updateBreakAnims(dt);
  updateHighlight();

  renderer.render(scene, camera);
}

updateHUD();
requestAnimationFrame(loop);
