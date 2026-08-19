/**
 * Star Catcher – Game Logic  (v3 – Animations + Music)
 * ============================================================
 * Sections:
 *  1.  Canvas Setup
 *  2.  State & Constants
 *  3.  Web Audio (music + SFX)
 *  4.  Entity & FX Variables
 *  5.  Level Configuration
 *  6.  Input Handling
 *  7.  Canvas Resize
 *  8.  Game Initialisation
 *  9.  Entity Spawning
 *  10. Collision Detection
 *  11. HUD Update
 *  12. Score Handler
 *  13. Visual FX  (trail, particles, shake, popups, starfield, pulse)
 *  14. Game Update
 *  15. Drawing
 *  16. Game Loop
 *  17. State Transitions
 *  18. Story & Victory
 *  19. UI Event Wiring
 *  20. Bootstrap
 * ============================================================
 */

/* ============================================================
   1. CANVAS SETUP
   ============================================================ */
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

/* ============================================================
   2. STATE & CONSTANTS
   ============================================================ */
const State = Object.freeze({
  START:    'start',
  STORY:    'story',
  PLAYING:  'playing',
  PAUSED:   'paused',
  GAMEOVER: 'gameover',
  VICTORY:  'victory',
});

const MAX_LEVEL      = 5;
const BULLET_SPEED   = 480;
const SHOOT_COOLDOWN = 0.28;

let gameState   = State.START;
let score       = 0;
let level       = 1;
let lastTime    = 0;
let animFrameId = null;

/* ============================================================
   3. WEB AUDIO  (chiptune music + SFX)
   ============================================================ */
let audioCtx    = null;
let masterGain  = null;
let musicActive = false;
let musicTimer  = null;
let nextNoteTime = 0;
let muted        = false;

// ── Chiptune note frequencies (C-major) ──
const N = {
  C3:130.81, G3:196.00,
  C4:261.63, D4:293.66, E4:329.63, F4:349.23,
  G4:392.00, A4:440.00, B4:493.88,
  C5:523.25, D5:587.33, E5:659.25, F5:698.46,
  G5:783.99, A5:880.00, B5:987.77, C6:1046.50,
};

// 16-note melody pattern (loops)
const MELODY = [
  N.C5, N.E5, N.G5, N.E5,   N.C5, N.G4, N.E5, N.C5,
  N.A4, N.C5, N.E5, N.A5,   N.G5, N.E5, N.D5, N.B4,
];
// Bass notes (play every 4 melody notes)
const BASS = [N.C3, N.C3, N.A3|N.A4, N.G3];  // rough bass line

const NOTE_DUR  = 0.11;   // seconds
const NOTE_STEP = 0.135;  // step between notes

/** Create or resume the AudioContext (must be called from user gesture). */
function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : 0.14;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

/** Play a single oscillator note. */
function playNote(freq, startT, dur = NOTE_DUR, vol = 0.15, type = 'square') {
  if (!audioCtx || muted) return;
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, startT);
  gain.gain.exponentialRampToValueAtTime(0.0001, startT + dur * 0.85);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(startT);
  osc.stop(startT + dur);
}

/** Schedule one full cycle of the melody, return its duration (s). */
function scheduleMelody(start) {
  MELODY.forEach((freq, i) => {
    playNote(freq, start + i * NOTE_STEP, NOTE_DUR, 0.10, 'square');
    // Light harmony a fifth up on every 4th note
    if (i % 4 === 0) {
      playNote(freq * 1.5, start + i * NOTE_STEP, NOTE_DUR * 0.8, 0.04, 'triangle');
    }
  });
  // Bass pulse every 4 steps
  for (let i = 0; i < 4; i++) {
    playNote(N.C3 * (i === 2 ? 1.5 : 1), start + i * NOTE_STEP * 4, NOTE_STEP * 3.6, 0.07, 'triangle');
  }
  return MELODY.length * NOTE_STEP;
}

function loopMusic() {
  if (!musicActive || !audioCtx) return;
  const dur = scheduleMelody(nextNoteTime);
  nextNoteTime += dur;
  const msLeft = (nextNoteTime - audioCtx.currentTime - 0.15) * 1000;
  musicTimer = setTimeout(loopMusic, Math.max(0, msLeft));
}

function startMusic() {
  ensureAudio();
  if (musicActive) return;
  musicActive  = true;
  nextNoteTime = audioCtx.currentTime + 0.05;
  loopMusic();
}

function stopMusic() {
  musicActive = false;
  if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
}

/** One-shot sound effects. */
function playSfx(type) {
  if (!audioCtx || muted) return;
  const t = audioCtx.currentTime;
  switch (type) {

    case 'collect':   // rising golden chime
      [N.C5, N.E5, N.G5, N.C6].forEach((f, i) =>
        playNote(f, t + i * 0.055, 0.18, 0.14, 'triangle'));
      break;

    case 'shoot':     // quick "pew"
      playNote(880,  t,        0.04, 0.10, 'square');
      playNote(440,  t + 0.04, 0.07, 0.08, 'square');
      break;

    case 'enemyhit':  // low crunch
      playNote(180,  t,        0.06, 0.14, 'sawtooth');
      playNote(120,  t + 0.05, 0.08, 0.10, 'sawtooth');
      break;

    case 'levelup':   // ascending fanfare
      [N.C4, N.E4, N.G4, N.C5, N.E5, N.G5].forEach((f, i) =>
        playNote(f, t + i * 0.09, 0.2, 0.16, 'triangle'));
      break;

    case 'gameover':  // sad descending
      [N.G4, N.F4, N.E4, N.D4, N.C4].forEach((f, i) =>
        playNote(f, t + i * 0.16, 0.28, 0.16, 'sawtooth'));
      break;

    case 'victory':   // triumphant fanfare
      [N.C4,N.E4,N.G4,N.C5,N.E5,N.G5,N.C6].forEach((f, i) =>
        playNote(f, t + i * 0.11, 0.32, 0.18, 'triangle'));
      setTimeout(() =>
        [N.C5,N.G5,N.C6,N.G5,N.C6].forEach((f, i) =>
          playNote(f, audioCtx.currentTime + i * 0.1, 0.35, 0.15, 'square')
        ), 900);
      break;
  }
}

/* ============================================================
   4. ENTITY & FX VARIABLES
   ============================================================ */

/** Player ball */
const ball = {
  x: 0, y: 0,
  radius: 18,
  speed: 230,
};

let stars   = [];
let enemies = [];
let bullets = [];

// Spawn timers
let starSpawnTimer  = 0;
let enemySpawnTimer = 0;

// Shooting
let shootCooldown  = 0;
let lastShootAngle = -Math.PI / 2;

// ── Visual FX ──
const ballTrail = [];           // last N ball positions for motion trail
const TRAIL_LEN = 12;

let fxParticles  = [];          // collect/hit burst particles
let scorePopups  = [];          // "+1" floating text
let shakeX = 0, shakeY = 0;    // current canvas shake offset
let shakeTimer = 0, shakeMag = 0;

let ballPulseR     = 0;         // expanding ring radius
let ballPulseAlpha = 0;
let ballPulseTimer = 0;
const PULSE_INTERVAL = 1.8;    // seconds between pulses

let gameStarField  = null;      // animated background stars
let fireworkTimer  = 0;
let bgStars        = null;      // victory screen background stars
let particles      = [];        // firework particles (victory)
let levelUpTimer   = 0;

// Story data
const LEVEL_STORIES = [
  null,
  { chapter:'Chapter 1', title:'A Lost Traveler',     emoji:'🌌',
    text:'A tiny ball of light drifts alone through the dark galaxy...\nCollect the golden stars to bring light back!\nWatch out — shadow monsters want to stop you!' },
  { chapter:'Chapter 2', title:'The Shadows Awaken',  emoji:'👾',
    text:'The shadow monsters have called for backup!\nThey are faster now and there are more of them...\nBut you have star power — shoot them down! 🔥' },
  { chapter:'Chapter 3', title:'Into the Void',       emoji:'🚀',
    text:'Our brave hero ventures deep into the unknown galaxy.\nThe shadows grow relentless — dodge, collect, fight!\nThe galaxy is counting on you!' },
  { chapter:'Chapter 4', title:'The Shadow King Rises', emoji:'⚡',
    text:'The Shadow King himself sent his elite warriors!\nThey are fast. They are fierce.\nBut nothing stops a true Star Champion! 💪' },
  { chapter:'Chapter 5 — FINAL', title:'The Last Stand', emoji:'🌟',
    text:'THIS IS IT! The fate of the galaxy rests in your hands!\nCollect the last stars and destroy the shadow army!\nYou are the LAST HOPE. GO, CHAMPION! 🏆' },
];

/* ============================================================
   5. LEVEL CONFIGURATION
   ============================================================ */
function getLevelConfig(lvl) {
  const n = lvl - 1;
  return {
    enemyBaseSpeed:     90  + n * 28,
    maxEnemies:         2   + n,
    enemySpawnInterval: Math.max(2.2 - n * 0.18, 0.6),
    maxStars:           3,
    starSpawnInterval:  1.8,
  };
}

/* ============================================================
   6. INPUT HANDLING
   ============================================================ */
const keys   = { up:false, down:false, left:false, right:false };
const KEY_MAP = {
  ArrowUp:'up', w:'up', W:'up',
  ArrowDown:'down', s:'down', S:'down',
  ArrowLeft:'left', a:'left', A:'left',
  ArrowRight:'right', d:'right', D:'right',
};

document.addEventListener('keydown', (e) => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))
    e.preventDefault();
  if (KEY_MAP[e.key]) keys[KEY_MAP[e.key]] = true;
  if (e.key === ' ' && gameState === State.PLAYING) shootBullet();
  if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') &&
      (gameState === State.PLAYING || gameState === State.PAUSED)) togglePause();
});

document.addEventListener('keyup', (e) => {
  if (KEY_MAP[e.key]) keys[KEY_MAP[e.key]] = false;
});

// Click canvas → shoot toward cursor
canvas.addEventListener('click', (e) => {
  if (gameState !== State.PLAYING) return;
  const r  = canvas.getBoundingClientRect();
  shootBulletToward(e.clientX - r.left, e.clientY - r.top);
});

// Touch canvas → shoot toward tap
canvas.addEventListener('touchend', (e) => {
  if (gameState !== State.PLAYING) return;
  e.preventDefault();
  const r     = canvas.getBoundingClientRect();
  const touch = e.changedTouches[0];
  shootBulletToward(touch.clientX - r.left, touch.clientY - r.top);
}, { passive: false });

function bindDpadButton(id, dir) {
  const btn = document.getElementById(id);
  if (!btn) return;
  const press   = (e) => { e.preventDefault(); keys[dir] = true;  btn.classList.add('active'); };
  const release = (e) => { e.preventDefault(); keys[dir] = false; btn.classList.remove('active'); };
  btn.addEventListener('touchstart',  press,   { passive:false });
  btn.addEventListener('touchend',    release, { passive:false });
  btn.addEventListener('touchcancel', release, { passive:false });
  btn.addEventListener('mousedown',   press);
  btn.addEventListener('mouseup',     release);
  btn.addEventListener('mouseleave',  release);
}
bindDpadButton('btn-up',    'up');
bindDpadButton('btn-down',  'down');
bindDpadButton('btn-left',  'left');
bindDpadButton('btn-right', 'right');

// Fire button
(function wireFireButton() {
  const btn = document.getElementById('btn-fire');
  if (!btn) return;
  const fire    = (e) => { e.preventDefault(); btn.classList.add('active');
                            if (gameState === State.PLAYING) shootBullet(); };
  const release = (e) => { e.preventDefault(); btn.classList.remove('active'); };
  btn.addEventListener('touchstart',  fire,    { passive:false });
  btn.addEventListener('touchend',    release, { passive:false });
  btn.addEventListener('touchcancel', release, { passive:false });
  btn.addEventListener('mousedown',   fire);
  btn.addEventListener('mouseup',     release);
  btn.addEventListener('mouseleave',  release);
})();

/* ============================================================
   6b. SHOOT HELPERS
   ============================================================ */
function shootBullet() {
  if (shootCooldown > 0) return;
  let dx = 0, dy = 0;
  if (keys.left)  dx -= 1;
  if (keys.right) dx += 1;
  if (keys.up)    dy -= 1;
  if (keys.down)  dy += 1;
  const angle = (dx || dy) ? Math.atan2(dy, dx) : lastShootAngle;
  lastShootAngle = angle;
  spawnBullet(angle);
  playSfx('shoot');
}

function shootBulletToward(tx, ty) {
  if (shootCooldown > 0) return;
  const angle = Math.atan2(ty - ball.y, tx - ball.x);
  lastShootAngle = angle;
  spawnBullet(angle);
  playSfx('shoot');
}

function spawnBullet(angle) {
  shootCooldown = SHOOT_COOLDOWN;
  bullets.push({
    x:  ball.x + Math.cos(angle) * (ball.radius + 4),
    y:  ball.y + Math.sin(angle) * (ball.radius + 4),
    radius: 6,
    vx: Math.cos(angle) * BULLET_SPEED,
    vy: Math.sin(angle) * BULLET_SPEED,
  });
}

/* ============================================================
   7. CANVAS RESIZE
   ============================================================ */
function resizeCanvas() {
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  gameStarField = null; // regenerate on next draw
}

window.addEventListener('resize', () => {
  resizeCanvas();
  ball.x = Math.min(ball.x, canvas.width  - ball.radius);
  ball.y = Math.min(ball.y, canvas.height - ball.radius);
});

/* ============================================================
   8. GAME INITIALISATION
   ============================================================ */
function initGame() {
  score = 0; level = 1;
  stars = []; enemies = []; bullets = [];
  fxParticles = []; scorePopups = []; particles = [];
  ballTrail.length = 0;
  starSpawnTimer  = 0; enemySpawnTimer = 0;
  shootCooldown   = 0; levelUpTimer    = 0;
  shakeTimer = 0; shakeX = 0; shakeY = 0;
  ballPulseR = 0; ballPulseAlpha = 0; ballPulseTimer = 0;
  fireworkTimer = 0; bgStars = null; gameStarField = null;
  Object.keys(keys).forEach(k => keys[k] = false);
  ball.x = canvas.width  / 2;
  ball.y = canvas.height / 2;
  updateHUD();
}

/* ============================================================
   9. ENTITY SPAWNING
   ============================================================ */
function spawnStar() {
  const r = 14, m = 50;
  stars.push({
    x: m + Math.random() * (canvas.width  - m * 2),
    y: m + Math.random() * (canvas.height - m * 2),
    radius: r,
    angle:  Math.random() * Math.PI * 2,
    glowPhase: Math.random() * Math.PI * 2,  // for pulsing glow
  });
}

function spawnEnemy() {
  const cfg = getLevelConfig(level);
  const r   = 16;
  const side = Math.floor(Math.random() * 4);
  let ex, ey;
  switch (side) {
    case 0: ex = Math.random() * canvas.width;  ey = -r;                 break;
    case 1: ex = canvas.width + r;              ey = Math.random() * canvas.height; break;
    case 2: ex = Math.random() * canvas.width;  ey = canvas.height + r;  break;
    case 3: ex = -r;                            ey = Math.random() * canvas.height; break;
  }
  const dx = ball.x - ex, dy = ball.y - ey;
  const ang = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.4;
  const spd = cfg.enemyBaseSpeed * (0.85 + Math.random() * 0.3);
  enemies.push({
    x: ex, y: ey,
    radius: r,
    vx: Math.cos(ang) * spd,
    vy: Math.sin(ang) * spd,
    hue:         Math.floor(Math.random() * 30),
    wobble:      0,
    wobbleSpeed: 3 + Math.random() * 2,
    wobbleAmp:   0.10 + Math.random() * 0.06,
    scale:       0.05,   // starts tiny, grows to 1 (spawn-in animation)
  });
}

/* ============================================================
   10. COLLISION DETECTION
   ============================================================ */
function circlesOverlap(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius - 2;
}

/* ============================================================
   11. HUD UPDATE
   ============================================================ */
function updateHUD() {
  document.getElementById('score-display').textContent = `Score: ${score}`;
  document.getElementById('level-display').textContent = `Level ${level}`;
  // Briefly animate the score display
  const el = document.getElementById('score-display');
  el.classList.remove('score-pop');
  void el.offsetWidth;          // force reflow to restart animation
  el.classList.add('score-pop');
}

/* ============================================================
   12. SCORE HANDLER
   ============================================================ */
function handleScorePoint(sx, sy) {
  score++;
  updateHUD();
  playSfx('collect');
  if (sx !== undefined) spawnCollectFx(sx, sy);  // burst particles + popup

  if (score % 10 !== 0) return;

  if (level >= MAX_LEVEL) {
    triggerVictory();
  } else {
    level++;
    updateHUD();
    playSfx('levelup');
    triggerLevelUpEffect();
    showStoryForLevel(level);
  }
}

/* ============================================================
   13. VISUAL FX
   ============================================================ */

// ── Animated gameplay starfield ──
function initGameStarField() {
  gameStarField = Array.from({ length: 70 }, () => ({
    x:     Math.random() * canvas.width,
    y:     Math.random() * canvas.height,
    r:     0.5 + Math.random() * 1.8,
    speedX: -(3 + Math.random() * 15),   // drift left
    speedY:  (Math.random() - 0.5) * 4,
    alpha:  0.12 + Math.random() * 0.55,
    twinkle: Math.random() * Math.PI * 2,
    twinkleSpeed: 1.2 + Math.random() * 3,
  }));
}

function updateGameStarField(dt) {
  if (!gameStarField) initGameStarField();
  for (const s of gameStarField) {
    s.x += s.speedX * dt;
    s.y += s.speedY * dt;
    s.twinkle += s.twinkleSpeed * dt;
    if (s.x < -4) { s.x = canvas.width + 4; s.y = Math.random() * canvas.height; }
    if (s.y < -4)  s.y = canvas.height + 4;
    if (s.y > canvas.height + 4) s.y = -4;
  }
}

function drawGameBackground() {
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, '#0d0b20');
  bg.addColorStop(1, '#1c1a38');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!gameStarField) initGameStarField();
  for (const s of gameStarField) {
    const a = s.alpha * (0.65 + 0.35 * Math.sin(s.twinkle));
    ctx.save();
    ctx.globalAlpha = a;
    // Larger stars get a small glow
    if (s.r > 1.2) { ctx.shadowBlur = 4; ctx.shadowColor = '#fff'; }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ── Ball trail ──
function updateBallTrail() {
  ballTrail.unshift({ x: ball.x, y: ball.y });
  if (ballTrail.length > TRAIL_LEN) ballTrail.pop();
}

function drawBallTrail() {
  for (let i = 1; i < ballTrail.length; i++) {
    const t = ballTrail[i];
    const alpha = (1 - i / TRAIL_LEN) * 0.35;
    const r     = ball.radius * (1 - i / TRAIL_LEN * 0.65);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowBlur  = 10;
    ctx.shadowColor = '#4FC3F7';
    ctx.fillStyle   = '#29B6F6';
    ctx.beginPath();
    ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ── Ball pulse ring ──
function updateBallPulse(dt) {
  ballPulseTimer += dt;
  if (ballPulseTimer >= PULSE_INTERVAL) {
    ballPulseTimer = 0;
    ballPulseR     = ball.radius;
    ballPulseAlpha = 0.75;
  }
  if (ballPulseAlpha > 0) {
    ballPulseR     += 75 * dt;
    ballPulseAlpha -= 1.6 * dt;
    if (ballPulseAlpha < 0) ballPulseAlpha = 0;
  }
}

function drawBallPulse() {
  if (ballPulseAlpha <= 0) return;
  ctx.save();
  ctx.globalAlpha  = ballPulseAlpha;
  ctx.strokeStyle  = '#4FC3F7';
  ctx.lineWidth    = 2.5;
  ctx.shadowBlur   = 12;
  ctx.shadowColor  = '#4FC3F7';
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ballPulseR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ── Collect burst (gold particles + popup) ──
function spawnCollectFx(x, y) {
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2;
    const spd   = 55 + Math.random() * 85;
    fxParticles.push({
      x, y,
      vx:    Math.cos(angle) * spd,
      vy:    Math.sin(angle) * spd,
      life:  1.0,
      decay: 2.0 + Math.random() * 0.5,
      r:     2.5 + Math.random() * 3,
      hue:   38 + Math.floor(Math.random() * 22),
    });
  }
  scorePopups.push({ x, y: y - ball.radius - 8, life: 1.0, vy: -75 });
}

// ── Enemy death burst (orange particles) ──
function spawnHitFx(x, y) {
  for (let i = 0; i < 11; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd   = 60 + Math.random() * 110;
    fxParticles.push({
      x, y,
      vx:    Math.cos(angle) * spd,
      vy:    Math.sin(angle) * spd,
      life:  1.0,
      decay: 2.2 + Math.random() * 0.6,
      r:     3 + Math.random() * 4,
      hue:   Math.floor(Math.random() * 30),  // red-orange
    });
  }
  scorePopups.push({ x, y: y - 18, life: 1.0, vy: -70 });
}

// ── Update all FX every frame ──
function updateFx(dt) {
  // Particles
  for (const p of fxParticles) {
    p.x    += p.vx * dt;
    p.y    += p.vy * dt;
    p.vy   += 50 * dt;    // gravity
    p.vx   *= 0.97;
    p.life -= p.decay * dt;
  }
  fxParticles = fxParticles.filter(p => p.life > 0);

  // Score popups
  for (const p of scorePopups) {
    p.y    += p.vy * dt;
    p.life -= 1.4 * dt;
  }
  scorePopups = scorePopups.filter(p => p.life > 0);

  // Screen shake
  if (shakeTimer > 0) {
    shakeTimer -= dt;
    const intensity = Math.min(1, shakeTimer / 0.15) * shakeMag;
    shakeX = (Math.random() - 0.5) * intensity * 2;
    shakeY = (Math.random() - 0.5) * intensity * 2;
  } else {
    shakeX = 0; shakeY = 0;
  }
}

function triggerShake(dur = 0.45, mag = 12) {
  shakeTimer = dur;
  shakeMag   = mag;
}

// ── Draw all FX on top of scene ──
function drawFx() {
  // Burst particles
  for (const p of fxParticles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.shadowBlur  = 7;
    ctx.shadowColor = `hsl(${p.hue}, 90%, 60%)`;
    ctx.fillStyle   = `hsl(${p.hue}, 90%, 60%)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // "+1" score popups
  ctx.save();
  ctx.font         = 'bold 20px Comic Sans MS, cursive';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur   = 8;
  ctx.shadowColor  = '#FFD700';
  for (const p of scorePopups) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle   = '#FFD700';
    ctx.fillText('+1', p.x, p.y);
  }
  ctx.restore();
}

// ── Level-up flash text ──
function triggerLevelUpEffect() { levelUpTimer = 2.2; }

function drawLevelUpEffect() {
  if (levelUpTimer <= 0) return;
  const alpha = Math.min(1, levelUpTimer / 0.5);
  ctx.save();
  ctx.globalAlpha  = alpha;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.font  = `bold ${Math.floor(canvas.width * 0.09)}px Comic Sans MS, cursive`;
  ctx.shadowBlur  = 30;
  ctx.shadowColor = '#FFD700';
  ctx.fillStyle   = '#FFD700';
  ctx.fillText(`Level ${level}! 🎉`, canvas.width / 2, canvas.height * 0.38);
  ctx.restore();
}

// ── Fireworks for victory ──
function spawnFireworkAt(x, y) {
  const count = 18 + Math.floor(Math.random() * 10);
  const hue   = Math.floor(Math.random() * 360);
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const spd = 70 + Math.random() * 160;
    particles.push({
      x, y,
      vx:    Math.cos(ang) * spd,
      vy:    Math.sin(ang) * spd - 20,
      life:  1.0,
      decay: 0.55 + Math.random() * 0.35,
      r:     2.5 + Math.random() * 3,
      hue:   hue + Math.floor(Math.random() * 40) - 20,
    });
  }
}

function updateParticles(dt) {
  fireworkTimer -= dt;
  if (fireworkTimer <= 0) {
    fireworkTimer = 0.5 + Math.random() * 0.55;
    spawnFireworkAt(
      50 + Math.random() * (canvas.width  - 100),
      30 + Math.random() * (canvas.height * 0.65)
    );
  }
  for (const p of particles) {
    p.x  += p.vx * dt;
    p.y  += p.vy * dt;
    p.vy += 85 * dt;
    p.vx *= 0.985;
    p.life -= p.decay * dt;
  }
  particles = particles.filter(p => p.life > 0);
}

function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.shadowBlur  = 8;
    ctx.shadowColor = `hsl(${p.hue},85%,60%)`;
    ctx.fillStyle   = `hsl(${p.hue},85%,60%)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawVictoryBackground(dt) {
  if (!bgStars) {
    bgStars = Array.from({ length: 80 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      r: 0.5 + Math.random() * 1.5,
      speed: 8 + Math.random() * 18,
      alpha: 0.3 + Math.random() * 0.6,
    }));
  }
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, '#0d0b1e');
  bg.addColorStop(1, '#1a0a2e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const s of bgStars) {
    s.y -= s.speed * dt;
    if (s.y < -4) s.y = canvas.height + 4;
    ctx.save();
    ctx.globalAlpha = s.alpha;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/* ============================================================
   14. GAME UPDATE
   ============================================================ */
function update(dt) {
  const cfg = getLevelConfig(level);

  // ── Ball movement ──
  let vx = 0, vy = 0;
  if (keys.left)  vx -= 1;
  if (keys.right) vx += 1;
  if (keys.up)    vy -= 1;
  if (keys.down)  vy += 1;
  if (vx && vy) { vx *= 0.7071; vy *= 0.7071; }

  ball.x += vx * ball.speed * dt;
  ball.y += vy * ball.speed * dt;
  ball.x  = Math.max(ball.radius, Math.min(canvas.width  - ball.radius, ball.x));
  ball.y  = Math.max(ball.radius, Math.min(canvas.height - ball.radius, ball.y));

  // ── Cooldowns & timers ──
  if (shootCooldown > 0) shootCooldown -= dt;
  if (levelUpTimer  > 0) levelUpTimer  -= dt;

  // ── Bullet movement ──
  for (const b of bullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
  bullets = bullets.filter(b =>
    b.x > -20 && b.x < canvas.width + 20 && b.y > -20 && b.y < canvas.height + 20
  );

  // ── Star spawning ──
  starSpawnTimer += dt;
  if (stars.length < cfg.maxStars && starSpawnTimer >= cfg.starSpawnInterval) {
    starSpawnTimer = 0; spawnStar();
  }

  // ── Enemy spawning ──
  enemySpawnTimer += dt;
  if (enemies.length < cfg.maxEnemies && enemySpawnTimer >= cfg.enemySpawnInterval) {
    enemySpawnTimer = 0; spawnEnemy();
  }

  // ── Update entities ──
  for (const s of stars) {
    s.angle      += dt * 1.8;
    s.glowPhase  += dt * 2.5;
  }
  for (const e of enemies) {
    e.x      += e.vx * dt;
    e.y      += e.vy * dt;
    e.wobble += e.wobbleSpeed * dt;
    e.scale   = Math.min(1, e.scale + dt * 3);  // scale-in spawn animation
  }
  enemies = enemies.filter(e =>
    e.x > -120 && e.x < canvas.width + 120 && e.y > -120 && e.y < canvas.height + 120
  );

  // ── Bullet ↔ Enemy collision ──
  const hitIds = new Set();
  bullets = bullets.filter(b => {
    for (let i = 0; i < enemies.length; i++) {
      if (!hitIds.has(i) && circlesOverlap(b, enemies[i])) {
        hitIds.add(i); return false;
      }
    }
    return true;
  });
  if (hitIds.size > 0) {
    enemies = enemies.filter((e, i) => {
      if (hitIds.has(i)) {
        playSfx('enemyhit');
        spawnHitFx(e.x, e.y);
        handleScorePoint(e.x, e.y);
        return false;
      }
      return true;
    });
    if (gameState === State.VICTORY) return;
  }

  // ── Ball ↔ Star collision ──
  stars = stars.filter(s => {
    if (circlesOverlap(ball, s)) {
      handleScorePoint(s.x, s.y);
      return false;
    }
    return true;
  });
  if (gameState === State.VICTORY) return;

  // ── Ball ↔ Enemy collision → game over ──
  for (const e of enemies) {
    if (circlesOverlap(ball, e)) {
      triggerGameOver(); return;
    }
  }

  // ── FX updates ──
  updateGameStarField(dt);
  updateBallTrail();
  updateBallPulse(dt);
  updateFx(dt);
}

/* ============================================================
   15. DRAWING
   ============================================================ */
function draw() {
  // Apply screen shake
  ctx.save();
  ctx.translate(shakeX, shakeY);

  drawGameBackground();

  for (const b of bullets)  drawBullet(b);
  for (const s of stars)    drawStar(s);
  for (const e of enemies)  drawEnemy(e);

  drawBallPulse();
  drawBallTrail();
  drawBall();
  drawFx();
  drawLevelUpEffect();

  ctx.restore();
}

function drawBall() {
  ctx.save();
  ctx.shadowBlur  = 24;
  ctx.shadowColor = '#4FC3F7';
  const g = ctx.createRadialGradient(
    ball.x - ball.radius * 0.3, ball.y - ball.radius * 0.35, 2,
    ball.x, ball.y, ball.radius
  );
  g.addColorStop(0,   '#E1F5FE');
  g.addColorStop(0.5, '#29B6F6');
  g.addColorStop(1,   '#0277BD');
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

function drawBullet(b) {
  ctx.save();
  ctx.shadowBlur  = 16;
  ctx.shadowColor = '#00FFFF';
  const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius);
  g.addColorStop(0,   '#FFFFFF');
  g.addColorStop(0.4, '#00E5FF');
  g.addColorStop(1,   '#006064');
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

function drawStar(s) {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.angle);
  // Pulsing glow
  const glow = 14 + 8 * Math.sin(s.glowPhase);
  ctx.shadowBlur  = glow;
  ctx.shadowColor = '#FFD700';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = (i * Math.PI) / 5 - Math.PI / 2;
    const r   = i % 2 === 0 ? s.radius : s.radius * 0.42;
    if (i === 0) ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
    else         ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
  }
  ctx.closePath();
  ctx.fillStyle   = '#FFD700';
  ctx.fill();
  ctx.strokeStyle = '#FFF9C4';
  ctx.lineWidth   = 1.2;
  ctx.stroke();
  ctx.restore();
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.scale(e.scale, e.scale);                          // spawn-in animation
  ctx.rotate(Math.sin(e.wobble) * e.wobbleAmp);         // wobble

  const color = `hsl(${e.hue},90%,52%)`;
  ctx.shadowBlur  = 14;
  ctx.shadowColor = color;

  const g = ctx.createRadialGradient(-e.radius * 0.3, -e.radius * 0.3, 2, 0, 0, e.radius);
  g.addColorStop(0, `hsl(${e.hue},70%,75%)`);
  g.addColorStop(1, color);
  ctx.beginPath();
  ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.shadowBlur = 0;
  // Eyes
  ctx.fillStyle = 'white';
  ctx.beginPath(); ctx.arc(-5, -4, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc( 5, -4, 4.5, 0, Math.PI * 2); ctx.fill();
  // Pupils
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(-4, -4, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc( 6, -4, 2.2, 0, Math.PI * 2); ctx.fill();
  // Frown
  ctx.strokeStyle = '#222'; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(0, 4, 5, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();

  ctx.restore();
}

/* ============================================================
   16. GAME LOOP
   ============================================================ */
function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  if (gameState === State.PLAYING) {
    update(dt);
    draw();
  }

  if (gameState === State.VICTORY) {
    updateParticles(dt);
    drawVictoryBackground(dt);
    drawParticles();
  }

  animFrameId = requestAnimationFrame(gameLoop);
}

/* ============================================================
   17. STATE TRANSITIONS
   ============================================================ */
function startGame() {
  ensureAudio();
  hideAllOverlays();
  resizeCanvas();
  initGame();
  lastTime = performance.now();
  if (!animFrameId) animFrameId = requestAnimationFrame(gameLoop);
  showStoryForLevel(1);
}

function restartGame() {
  ensureAudio();
  stopMusic();
  hideAllOverlays();
  resizeCanvas();
  initGame();
  lastTime = performance.now();
  showStoryForLevel(1);
}

function togglePause() {
  if (gameState === State.PLAYING) {
    gameState = State.PAUSED;
    stopMusic();
    document.getElementById('pause-screen').classList.remove('hidden');
    document.getElementById('pause-btn').textContent = '▶';
  } else if (gameState === State.PAUSED) {
    resumeGame();
  }
}

function resumeGame() {
  document.getElementById('pause-screen').classList.add('hidden');
  document.getElementById('pause-btn').textContent = '⏸';
  gameState = State.PLAYING;
  lastTime  = performance.now();
  startMusic();
}

function triggerGameOver() {
  gameState = State.GAMEOVER;
  stopMusic();
  triggerShake(0.5, 14);
  playSfx('gameover');
  document.getElementById('final-score').textContent = `Your Score: ${score}`;
  document.getElementById('gameover-screen').classList.remove('hidden');
}

function hideAllOverlays() {
  ['start-screen','story-screen','pause-screen','gameover-screen','victory-screen']
    .forEach(id => document.getElementById(id).classList.add('hidden'));
  document.getElementById('pause-btn').textContent = '⏸';
}

/* ============================================================
   18. STORY & VICTORY
   ============================================================ */
function showStoryForLevel(lvl) {
  const data = LEVEL_STORIES[lvl];
  if (!data) { continueFromStory(); return; }

  document.getElementById('story-emoji').textContent   = data.emoji;
  document.getElementById('story-chapter').textContent = data.chapter;
  document.getElementById('story-title').textContent   = data.title;
  document.getElementById('story-text').innerHTML      = data.text.replace(/\n/g,'<br>');
  document.getElementById('story-screen').classList.remove('hidden');
  gameState = State.STORY;
  stopMusic();
}

function continueFromStory() {
  if (gameState !== State.STORY) return;
  document.getElementById('story-screen').classList.add('hidden');
  if (stars.length === 0 && enemies.length === 0) { spawnStar(); spawnStar(); spawnEnemy(); }
  gameState = State.PLAYING;
  lastTime  = performance.now();
  startMusic();
}

function triggerVictory() {
  gameState = State.VICTORY;
  stopMusic();
  playSfx('victory');
  fireworkTimer = 0;
  for (let i = 0; i < 6; i++)
    spawnFireworkAt(Math.random() * canvas.width, Math.random() * canvas.height * 0.8);
  document.getElementById('victory-score').textContent = `Final Score: ${score}`;
  document.getElementById('victory-screen').classList.remove('hidden');
}

/* ============================================================
   19. UI EVENT WIRING
   ============================================================ */
document.getElementById('play-btn')              .addEventListener('click', startGame);
document.getElementById('restart-btn')           .addEventListener('click', restartGame);
document.getElementById('restart-from-pause-btn').addEventListener('click', restartGame);
document.getElementById('resume-btn')            .addEventListener('click', resumeGame);
document.getElementById('pause-btn')             .addEventListener('click', togglePause);
document.getElementById('story-continue-btn')    .addEventListener('click', continueFromStory);
document.getElementById('story-screen')          .addEventListener('click', continueFromStory);
document.getElementById('victory-play-again-btn').addEventListener('click', restartGame);

// Mute button
document.getElementById('mute-btn').addEventListener('click', () => {
  muted = !muted;
  if (masterGain) masterGain.gain.value = muted ? 0 : 0.14;
  document.getElementById('mute-btn').textContent = muted ? '🔇' : '🔊';
});

// Resume audio on tab-back (browsers suspend AudioContext on blur)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && audioCtx?.state === 'suspended') audioCtx.resume();
});

/* ============================================================
   20. CHAT SYSTEM  (localStorage + BroadcastChannel)
   ============================================================ */
const CHAT_STORAGE_KEY  = 'starcatcher_chat_v1';
const CHAT_USER_KEY     = 'starcatcher_username_v1';
const CHAT_MAX_MESSAGES = 100;

let chatChannel    = null;
let chatOpen       = false;
let chatWasPlaying = false;

// Generate or load persistent username
let chatUsername = localStorage.getItem(CHAT_USER_KEY);
if (!chatUsername) {
  const adj  = ['Yulduz','Qahramonli','Botir','Nurli','Zafar','Jasur','Bahodir'];
  const noun  = ['Pilot','Champion','Jangchi','Qahramon','Ovchi','Yulduzchi'];
  chatUsername = adj[Math.floor(Math.random() * adj.length)] +
                 noun[Math.floor(Math.random() * noun.length)] +
                 Math.floor(Math.random() * 90 + 10);
  localStorage.setItem(CHAT_USER_KEY, chatUsername);
}

function chatGetMessages() {
  try { return JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function chatSaveMessages(msgs) {
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(msgs.slice(-CHAT_MAX_MESSAGES)));
}

function chatEscape(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function chatFormatTime(ts) {
  const d = new Date(ts);
  return d.getHours().toString().padStart(2,'0') + ':' +
         d.getMinutes().toString().padStart(2,'0');
}

function chatRender() {
  const msgs = chatGetMessages();
  const box  = document.getElementById('chat-messages');
  if (msgs.length === 0) {
    box.innerHTML = '<div class="chat-empty">Hali xabar yoʻq. Birinchi boʻlib yozing! 🌟</div>';
    return;
  }
  box.innerHTML = msgs.map(m => {
    const own = m.user === chatUsername;
    return `<div class="chat-message${own ? ' own-message' : ''}">` +
      `<span class="msg-user">${chatEscape(m.user)}:</span>` +
      `<span class="msg-text">${chatEscape(m.text)}</span>` +
      `<span class="msg-time">${chatFormatTime(m.time)}</span>` +
      `</div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

function chatSend() {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text) return;
  input.value = '';

  const msgs = chatGetMessages();
  msgs.push({ user: chatUsername, text, time: Date.now() });
  chatSaveMessages(msgs);
  chatRender();

  if (chatChannel) chatChannel.postMessage({ type: 'msg' });
}

function chatToggle(open) {
  const panel  = document.getElementById('chat-panel');
  const chatBtn = document.getElementById('chat-btn');
  chatOpen = open;

  if (open) {
    panel.classList.remove('hidden');
    chatBtn.classList.add('chat-open');
    chatRender();
    // Pause game while chatting
    if (gameState === State.PLAYING) {
      chatWasPlaying = true;
      togglePause();
    } else {
      chatWasPlaying = false;
    }
    setTimeout(() => {
      const input = document.getElementById('chat-input');
      if (input) input.focus();
    }, 100);
  } else {
    panel.classList.add('hidden');
    chatBtn.classList.remove('chat-open');
    if (chatWasPlaying && gameState === State.PAUSED) {
      resumeGame();
    }
    chatWasPlaying = false;
  }
}

function initChat() {
  // Show username in header
  document.getElementById('chat-username-display').textContent = '👤 ' + chatUsername;

  // BroadcastChannel for cross-tab real-time sync
  if (typeof BroadcastChannel !== 'undefined') {
    chatChannel = new BroadcastChannel('star-catcher-chat');
    chatChannel.onmessage = () => { if (chatOpen) chatRender(); };
  }

  document.getElementById('chat-btn').addEventListener('click', () => chatToggle(true));
  document.getElementById('chat-close-btn').addEventListener('click', () => chatToggle(false));
  document.getElementById('chat-send-btn').addEventListener('click', chatSend);
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); chatSend(); }
  });
}

/* ============================================================
   21. BOOTSTRAP
   ============================================================ */
resizeCanvas();
initChat();
animFrameId = requestAnimationFrame(gameLoop);
