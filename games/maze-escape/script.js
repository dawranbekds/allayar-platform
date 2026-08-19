'use strict';
// ═══════════════════════════════════════════════════════════
//  MAZE ESCAPE  —  script.js
//  Levels 1-2: maze  |  Level 3: boss fight
// ═══════════════════════════════════════════════════════════

// ── DOM ────────────────────────────────────────────────────
const screens = {
  intro:    document.getElementById('intro-screen'),
  start:    document.getElementById('start-screen'),
  game:     document.getElementById('game-screen'),
  banner:   document.getElementById('level-banner'),
  pause:    document.getElementById('pause-screen'),
  gameover: document.getElementById('gameover-screen'),
  win:      document.getElementById('win-screen'),
};
const canvas        = document.getElementById('game-canvas');
const ctx           = canvas.getContext('2d');
const keyCountEl    = document.getElementById('key-count');
const gemCountEl    = document.getElementById('gem-count');
const keyStatusEl   = document.getElementById('key-status');
const invKeySlot    = document.getElementById('inv-key');
const playerHeartsEl= document.getElementById('player-hearts');
const levelNumEl    = document.getElementById('level-num');
const bossHPContainer = document.getElementById('boss-hp-container');
const bossHPFill    = document.getElementById('boss-hp-fill');
const hitFlash      = document.getElementById('hit-flash');
const gameoverReason= document.getElementById('gameover-reason');

function showScreen(name) {
  Object.values(screens).forEach(s => { s.classList.remove('active'); s.style.display = 'none'; });
  const s = screens[name];
  if (s) { s.style.display = 'flex'; requestAnimationFrame(() => s.classList.add('active')); }
}

// ── AUDIO ──────────────────────────────────────────────────
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playTone(freq, type, dur, vol, startDelay = 0) {
  if (!audioCtx) return;
  const t   = audioCtx.currentTime + startDelay;
  const osc = audioCtx.createOscillator();
  const g   = audioCtx.createGain();
  osc.connect(g); g.connect(audioCtx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.start(t); osc.stop(t + dur + 0.01);
}

function playNoise(dur, vol, startDelay = 0) {
  if (!audioCtx) return;
  const t    = audioCtx.currentTime + startDelay;
  const size = Math.ceil(audioCtx.sampleRate * dur);
  const buf  = audioCtx.createBuffer(1, size, audioCtx.sampleRate);
  const d    = buf.getChannelData(0);
  for (let i = 0; i < size; i++) d[i] = Math.random() * 2 - 1;
  const src  = audioCtx.createBufferSource();
  src.buffer = buf;
  const g    = audioCtx.createGain();
  src.connect(g); g.connect(audioCtx.destination);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.start(t); src.stop(t + dur + 0.01);
}

const SFX = {
  step()      { playNoise(0.04, 0.04); },
  pickupKey() {
    [330,440,550,660].forEach((f,i) => playTone(f,'square',0.12,0.18, i*0.06));
  },
  pickupGem() { playTone(880,'sine',0.18,0.14); playTone(1100,'sine',0.12,0.1,0.1); },
  detect()    { playTone(100,'sawtooth',0.4,0.3); playTone(150,'sawtooth',0.3,0.2,0.2); },
  playerHit() { playNoise(0.15,0.4); playTone(120,'sawtooth',0.2,0.3,0.05); },
  bossHit()   { playNoise(0.08,0.3); playTone(220,'square',0.15,0.25); },
  attack()    { playNoise(0.06,0.25); playTone(300,'square',0.08,0.2); },
  fireball()  { playTone(180,'sawtooth',0.22,0.2); },
  win()       {
    [262,330,392,523,659,784].forEach((f,i) => playTone(f,'square',0.2,0.25, i*0.1));
  },
  death()     {
    [400,300,200,100].forEach((f,i) => playTone(f,'sawtooth',0.18,0.3, i*0.12));
  },
  levelUp()   {
    [330,440,550,440,660].forEach((f,i) => playTone(f,'square',0.15,0.2, i*0.08));
  },
  bossRoar()  {
    [80,60,40].forEach((f,i) => playTone(f,'sawtooth',0.35,0.4, i*0.1));
    playNoise(0.4, 0.3, 0.1);
  },
};

// ── TILES ──────────────────────────────────────────────────
const T         = 40;
const WALL      = 1;
const FLOOR     = 0;
const KEY       = 2;
const EXIT      = 3;
const GEM       = 4;
const BOSS_SPAWN= 5;

// ── MAPS ───────────────────────────────────────────────────
// 0=floor 1=wall 2=key 3=exit 4=gem 5=boss_spawn
// Player always starts tile (1,1)

const MAP1 = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,1,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,1],
  [1,0,1,0,1,0,1,1,0,1,1,0,1,0,1,0,1,1,0,1,1],
  [1,0,1,0,0,0,0,1,0,0,1,4,1,0,0,0,0,1,0,0,1],
  [1,0,1,1,1,1,0,1,1,0,1,0,1,1,1,0,1,1,1,0,1],
  [1,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,1],
  [1,1,1,0,1,1,1,1,0,1,1,1,1,0,1,1,0,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,1],
  [1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,0,1,1,1,0,1],
  [1,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,0,1],
  [1,0,1,0,1,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,1],
  [1,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,2,1],
  [1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1],
  [1,0,0,0,1,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,1],
  [1,0,1,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1,1],
  [1,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

const MAP2 = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,0,1,0,1,1,1,0,1,0,1,1,1,1,0,1,1],
  [1,0,1,4,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,0,1,1,1,1,1,0,1,0,1,1,1,1,1,1,1,0,1],
  [1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1],
  [1,1,1,0,1,0,1,1,1,1,1,1,1,0,1,1,0,0,1,0,1],
  [1,4,0,0,0,0,1,0,0,0,0,0,1,0,1,0,0,1,1,0,1],
  [1,0,1,1,1,0,1,0,1,1,1,0,1,0,0,0,1,0,0,0,1],
  [1,0,0,0,1,0,0,0,1,0,0,0,0,0,1,0,1,0,1,0,1],
  [1,1,1,0,1,1,1,0,1,0,1,1,1,1,1,0,1,0,1,0,1],
  [1,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,1,2,1],
  [1,0,1,1,1,0,1,1,1,0,1,0,1,0,1,1,1,0,1,0,1],
  [1,0,1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1],
  [1,0,1,0,1,1,1,1,1,0,1,1,1,0,1,1,1,1,1,0,1],
  [1,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

// Boss arena — programmatic (open room with pillars)
function buildArena() {
  const COLS = 23, ROWS = 15;
  const m = Array.from({length:ROWS}, () => Array(COLS).fill(FLOOR));
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (r===0||r===ROWS-1||c===0||c===COLS-1) m[r][c] = WALL;
  // pillars
  [[3,4],[3,10],[3,18],[6,7],[6,15],[10,4],[10,10],[10,18]].forEach(([r,c])=>{
    m[r][c]=WALL; m[r][c+1]=WALL; m[r+1][c]=WALL; m[r+1][c+1]=WALL;
  });
  return { map:m, COLS, ROWS };
}

// ── LEVEL DEFINITIONS ──────────────────────────────────────
const LEVELS = [
  { type:'maze', rawMap:MAP1, bossSpeed:1.25, visionTiles:5,
    title:'DUNGEON LVL 1', sub:'Find the key — avoid the shadow!' },
  { type:'maze', rawMap:MAP2, bossSpeed:1.75, visionTiles:6,
    title:'DUNGEON LVL 2', sub:'Faster. Darker. More dangerous.' },
  { type:'boss',
    title:'BOSS FIGHT',    sub:'Defeat the Demon Lord!' },
];

// ── GLOBAL STATE ───────────────────────────────────────────
let currentLevel = 0;
let state        = null;
let animId       = null;
let inputKeys    = {};
let mobile       = { up:false,down:false,left:false,right:false,attack:false };
let particles    = [];
let lastTime     = 0;
let stepTimer    = 0;

// ── INPUT ──────────────────────────────────────────────────
window.addEventListener('keydown', e => {
  inputKeys[e.key] = true;
  if ((e.key===' '||e.key==='z'||e.key==='Z') && state && !state.paused)
    tryPlayerAttack();
});
window.addEventListener('keyup', e => { inputKeys[e.key] = false; });

function isPressed(dir) {
  switch(dir) {
    case 'up':    return inputKeys['ArrowUp']   ||inputKeys['w']||inputKeys['W']||mobile.up;
    case 'down':  return inputKeys['ArrowDown'] ||inputKeys['s']||inputKeys['S']||mobile.down;
    case 'left':  return inputKeys['ArrowLeft'] ||inputKeys['a']||inputKeys['A']||mobile.left;
    case 'right': return inputKeys['ArrowRight']||inputKeys['d']||inputKeys['D']||mobile.right;
  }
  return false;
}

function setupMobileButtons() {
  const dirs = {
    'btn-up':'up','btn-down':'down','btn-left':'left','btn-right':'right',
  };
  Object.entries(dirs).forEach(([id,dir]) => {
    const btn = document.getElementById(id);
    ['touchstart','mousedown'].forEach(ev => btn.addEventListener(ev, e=>{
      e.preventDefault(); mobile[dir]=true;
    },{passive:false}));
    ['touchend','mouseup','mouseleave'].forEach(ev => btn.addEventListener(ev, ()=>{
      mobile[dir]=false;
    }));
  });
  const atk = document.getElementById('btn-attack');
  ['touchstart','mousedown'].forEach(ev => atk.addEventListener(ev, e=>{
    e.preventDefault(); ensureAudio(); tryPlayerAttack();
  },{passive:false}));
}

// ── COLLISION ──────────────────────────────────────────────
const PHALF = 13;

function isWall(map, COLS, ROWS, px, py) {
  const c = Math.floor(px/T), r = Math.floor(py/T);
  if (r<0||r>=ROWS||c<0||c>=COLS) return true;
  const t = map[r][c];
  if (t === WALL) return true;
  if (t === EXIT && state && !state.exitOpen) return true;
  return false;
}

function tryMove(ent, dx, dy, map, COLS, ROWS) {
  const nx = ent.x+dx, ny = ent.y+dy;
  const wallFn = (px,py) => isWall(map,COLS,ROWS,px,py);
  const xOk = !([ny-PHALF,ny+PHALF].some(cy => wallFn(nx-PHALF,cy)||wallFn(nx+PHALF,cy)));
  const yOk = !([nx-PHALF,nx+PHALF].some(cx => wallFn(cx,ny-PHALF)||wallFn(cx,ny+PHALF)));
  if (xOk) ent.x=nx;
  if (yOk) ent.y=ny;
}

// ── PARTICLES ──────────────────────────────────────────────
function spawnParticles(x,y,color,count,speed=3) {
  for (let i=0;i<count;i++) {
    const ang = Math.random()*Math.PI*2;
    const spd = speed*(0.5+Math.random());
    particles.push({
      x,y,
      vx: Math.cos(ang)*spd, vy: Math.sin(ang)*spd,
      life:1, color, size: 3+Math.random()*4,
    });
  }
}

function updateParticles(dt) {
  const s = dt/16;
  particles = particles.filter(p => {
    p.x += p.vx*s; p.y += p.vy*s;
    p.vy += 0.08*s;
    p.life -= 0.025*s;
    return p.life > 0;
  });
}

function drawParticles(camX,camY) {
  particles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle   = p.color;
    ctx.fillRect(Math.round(p.x-camX-p.size/2), Math.round(p.y-camY-p.size/2), p.size, p.size);
  });
  ctx.globalAlpha = 1;
}

// ── SCREEN SHAKE ───────────────────────────────────────────
function shakeScreen() {
  canvas.classList.remove('shaking');
  void canvas.offsetWidth; // reflow
  canvas.classList.add('shaking');
  canvas.addEventListener('animationend', ()=>canvas.classList.remove('shaking'),{once:true});
}

function flashHit() {
  hitFlash.classList.add('active');
  setTimeout(()=>hitFlash.classList.remove('active'), 180);
}

// ── HUD ────────────────────────────────────────────────────
function updateHUD() {
  if (!state) return;
  // Level
  levelNumEl.textContent = currentLevel+1;

  // Inventory (maze)
  if (state.mode === 'maze') {
    keyCountEl.textContent = state.keyCollected ? '1':'0';
    gemCountEl.textContent = state.gemCount;
    invKeySlot.classList.toggle('collected', state.keyCollected);
    if (state.keyCollected) {
      keyStatusEl.textContent = '🗝 Key found! Reach the exit!';
      keyStatusEl.classList.add('found');
    } else {
      keyStatusEl.textContent = '🗝 Find the key!';
      keyStatusEl.classList.remove('found');
    }
    bossHPContainer.style.display = 'none';
  }

  // Boss fight
  if (state.mode === 'bossfight') {
    keyStatusEl.textContent = '⚔ Defeat the Demon Lord!';
    keyStatusEl.classList.remove('found');
    bossHPContainer.style.display = 'flex';
    const pct = Math.max(0, state.bossHP / state.bossMaxHP * 100);
    bossHPFill.style.width = pct+'%';
    bossHPFill.style.background = pct>50
      ? 'linear-gradient(90deg,#8b0000,#e03030)'
      : pct>25
        ? 'linear-gradient(90deg,#8b4000,#e08030)'
        : 'linear-gradient(90deg,#4b0000,#e00000)';
  }

  // Player HP
  const hp = state ? state.playerHP : 3;
  playerHeartsEl.textContent = '❤️'.repeat(Math.max(0,hp)) + '🖤'.repeat(Math.max(0,3-hp));
}

// ══════════════════════════════════════════════════════════
//  MAZE MODE
// ══════════════════════════════════════════════════════════
function initMaze(lvlIdx) {
  const lvl = LEVELS[lvlIdx];
  const rawMap = lvl.rawMap;
  const ROWS = rawMap.length, COLS = rawMap[0].length;
  const map = rawMap.map(r=>[...r]);

  let keyPos=null, exitPos=null, bossPos=null;
  const gems=[];
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
    switch(map[r][c]) {
      case KEY:        keyPos={r,c};              break;
      case EXIT:       exitPos={r,c};             break;
      case BOSS_SPAWN: bossPos={r,c}; map[r][c]=FLOOR; break;
      case GEM:        gems.push({r,c,collected:false}); break;
    }
  }

  state = {
    mode:'maze', ROWS, COLS, map,
    keyPos, exitPos, gems,
    keyCollected:false, gemCount:0, exitOpen:false,
    paused:false, over:false, won:false,
    playerHP: 3,
    camX:0, camY:0,

    player: {
      x:(1.5)*T, y:(1.5)*T,
      speed:2.3, dir:'down',
      frame:0, frameTick:0, moving:false,
      hitCooldown:0,
    },

    boss: {
      x: bossPos ? (bossPos.c+0.5)*T : (COLS-2.5)*T,
      y: bossPos ? (bossPos.r+0.5)*T : (ROWS-2.5)*T,
      speed: lvl.bossSpeed,
      dir:'left', frame:0, frameTick:0, moving:false,
      mode:'patrol',
      patrolTimer:0, patrolDx:-1, patrolDy:0,
      visionRange: lvl.visionTiles*T,
      wasChasing:false,
    },
  };
  particles = [];
}

function updateMaze(dt) {
  const s = dt/16;
  updatePlayerMaze(s);
  updateBossMaze(s);
  updateCamera();
}

function updatePlayerMaze(s) {
  const p = state.player;
  if (p.hitCooldown>0) p.hitCooldown -= s;
  let dx=0,dy=0;
  if (isPressed('left'))  { dx=-p.speed; p.dir='left'; }
  if (isPressed('right')) { dx= p.speed; p.dir='right'; }
  if (isPressed('up'))    { dy=-p.speed; p.dir='up'; }
  if (isPressed('down'))  { dy= p.speed; p.dir='down'; }
  if (dx&&dy) { dx*=0.707; dy*=0.707; }
  p.moving = !!(dx||dy);
  if (p.moving) {
    tryMove(p, dx, dy, state.map, state.COLS, state.ROWS);
    // footstep
    stepTimer -= s;
    if (stepTimer<=0) { SFX.step(); stepTimer=18; }
  }
  // walk animation
  if (p.moving) { p.frameTick++; if(p.frameTick>=8){p.frameTick=0;p.frame=(p.frame+1)%4;} }
  else { p.frame=0; p.frameTick=0; }

  // pickups
  const pc=Math.floor(p.x/T), pr=Math.floor(p.y/T);
  if (!state.keyCollected && state.keyPos && pr===state.keyPos.r && pc===state.keyPos.c) {
    state.keyCollected=true; state.exitOpen=true;
    state.map[state.keyPos.r][state.keyPos.c]=FLOOR;
    SFX.pickupKey();
    spawnParticles(p.x,p.y,'#e0b830',20,4);
    updateHUD();
  }
  state.gems.forEach(g=>{
    if (!g.collected && pr===g.r && pc===g.c) {
      g.collected=true; state.gemCount++;
      state.map[g.r][g.c]=FLOOR;
      SFX.pickupGem();
      spawnParticles(p.x,p.y,'#88aaff',12,3);
      updateHUD();
    }
  });
  if (state.exitOpen && state.exitPos && pr===state.exitPos.r && pc===state.exitPos.c) {
    SFX.levelUp();
    nextLevel();
  }
}

function updateBossMaze(s) {
  const b = state.boss, p = state.player;
  const dx = p.x-b.x, dy = p.y-b.y;
  const dist = Math.sqrt(dx*dx+dy*dy);

  if (dist < b.visionRange)    b.mode='chase';
  else if (dist > b.visionRange*1.6) b.mode='patrol';

  if (!b.wasChasing && b.mode==='chase') { SFX.detect(); b.wasChasing=true; }
  if (b.mode==='patrol') b.wasChasing=false;

  let mx=0,my=0;
  if (b.mode==='chase') {
    if (dist>1) { mx=(dx/dist)*b.speed; my=(dy/dist)*b.speed; }
    b.dir = Math.abs(dx)>Math.abs(dy) ? (dx>0?'right':'left') : (dy>0?'down':'up');
  } else {
    b.patrolTimer+=s;
    if (b.patrolTimer>130) {
      b.patrolTimer=0;
      const dirs=[{x:-1,y:0},{x:1,y:0},{x:0,y:-1},{x:0,y:1}];
      const d=dirs[Math.floor(Math.random()*dirs.length)];
      b.patrolDx=d.x; b.patrolDy=d.y;
    }
    mx=b.patrolDx*b.speed; my=b.patrolDy*b.speed;
    b.dir=mx>0?'right':mx<0?'left':my>0?'down':'up';
  }

  const prevX=b.x, prevY=b.y;
  tryMove(b,mx,my,state.map,state.COLS,state.ROWS);
  if (b.mode==='patrol' && b.x===prevX && b.y===prevY) b.patrolTimer=9999;

  b.moving=!!(mx||my);
  if (b.moving) { b.frameTick+=s; if(b.frameTick>=10){b.frameTick=0;b.frame=(b.frame+1)%4;} }

  // catch
  if (dist < T*0.72 && state.player.hitCooldown<=0) {
    state.playerHP--;
    state.player.hitCooldown=80;
    flashHit(); shakeScreen(); SFX.playerHit();
    updateHUD();
    if (state.playerHP<=0) triggerGameOver('The darkness consumed you...');
  }
}

// ── MAZE DRAWING ───────────────────────────────────────────
function drawMaze() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const {camX,camY,COLS,ROWS} = state;
  const sc=Math.max(0,Math.floor(camX/T));
  const ec=Math.min(COLS-1,Math.ceil((camX+canvas.width)/T));
  const sr=Math.max(0,Math.floor(camY/T));
  const er=Math.min(ROWS-1,Math.ceil((camY+canvas.height)/T));

  for (let r=sr;r<=er;r++) for (let c=sc;c<=ec;c++) drawTile(r,c);
  drawCharSprite(state.boss, false, camX, camY);
  drawCharSprite(state.player, true, camX, camY);
  drawParticles(camX,camY);
  drawFog(state.player.x-camX, state.player.y-camY, 185);
}

function drawTile(r,c) {
  const t = state.map[r][c];
  const x = c*T-state.camX, y = r*T-state.camY;
  if (t===WALL) {
    ctx.fillStyle='#1a1a2e'; ctx.fillRect(x,y,T,T);
    ctx.fillStyle='#12122a'; ctx.fillRect(x+2,y+2,T-4,T-4);
    ctx.fillStyle='#2a2a55'; ctx.fillRect(x,y,T,2); ctx.fillRect(x,y,2,T);
  } else {
    ctx.fillStyle=(r+c)%2===0?'#1c1c1c':'#181818';
    ctx.fillRect(x,y,T,T);
    if (t===KEY) {
      // glow
      ctx.save();
      ctx.shadowColor='#e0b830'; ctx.shadowBlur=12;
      ctx.font='22px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('🗝',x+T/2,y+T/2);
      ctx.restore();
    } else if (t===EXIT) {
      const open=state.exitOpen;
      ctx.fillStyle=open?'#103018':'#2a2a2a'; ctx.fillRect(x+2,y+2,T-4,T-4);
      ctx.save();
      if (open) { ctx.shadowColor='#30e060'; ctx.shadowBlur=16; }
      ctx.font='18px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(open?'🚪':'🔒',x+T/2,y+T/2);
      ctx.restore();
    } else if (t===GEM) {
      ctx.save();
      ctx.shadowColor='#88aaff'; ctx.shadowBlur=10;
      ctx.font='20px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('💎',x+T/2,y+T/2);
      ctx.restore();
    }
  }
}

// ══════════════════════════════════════════════════════════
//  BOSS FIGHT MODE
// ══════════════════════════════════════════════════════════
function initBossFight() {
  const {map, COLS, ROWS} = buildArena();
  const cx = Math.floor(COLS/2), cy = Math.floor(ROWS/2);

  state = {
    mode:'bossfight', map, COLS, ROWS,
    paused:false, over:false, won:false,
    playerHP:3,
    bossHP:6, bossMaxHP:6,
    bossPhase:1,
    camX:0, camY:0,

    player: {
      x:(cx)*T, y:(ROWS-3)*T,
      speed:2.5, dir:'up',
      frame:0, frameTick:0, moving:false,
      hitCooldown:0,
      attackCooldown:0,
      attacking:false, attackFrame:0,
    },

    boss: {
      x:cx*T, y:2.5*T,
      speed:1.2, dir:'down',
      frame:0, frameTick:0, moving:true,
      hitCooldown:0,
      actionTimer:80, action:'walk',
      phase:1,
    },

    projectiles: [],   // {x,y,vx,vy,life}
    slashFx: null,     // {x,y,dx,dy,timer}
    bossDeathTimer: -1,
  };

  bossHPContainer.style.display='flex';
  particles=[];
  SFX.bossRoar();
}

function tryPlayerAttack() {
  if (!state || state.mode!=='bossfight' || state.over || state.won) return;
  const p = state.player;
  if (p.attackCooldown>0) return;
  p.attackCooldown = 28;
  p.attacking = true; p.attackFrame = 0;
  SFX.attack();

  // slash direction
  const dirMap={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
  const [ddx,ddy]=dirMap[p.dir]||[0,1];
  state.slashFx={x:p.x+ddx*36,y:p.y+ddy*36,dx:ddx,dy:ddy,timer:14};

  // hit check
  const b=state.boss;
  const sx=p.x+ddx*38, sy=p.y+ddy*38;
  const dist=Math.sqrt((b.x-sx)**2+(b.y-sy)**2);
  if (dist<58 && b.hitCooldown<=0) {
    b.hitCooldown=30;
    state.bossHP--;
    SFX.bossHit();
    spawnParticles(b.x,b.y,'#ff4444',14,5);
    shakeScreen();
    // phase transition
    if (state.bossHP<=4 && b.phase===1) { b.phase=2; b.speed=1.8; SFX.bossRoar(); spawnParticles(b.x,b.y,'#ff0000',30,7); }
    if (state.bossHP<=2 && b.phase===2) { b.phase=3; b.speed=2.5; SFX.bossRoar(); spawnParticles(b.x,b.y,'#ff8800',30,8); }
    if (state.bossHP<=0) {
      state.bossDeathTimer=90;
      spawnParticles(b.x,b.y,'#ff4400',50,9);
      spawnParticles(b.x,b.y,'#ffaa00',30,6);
      SFX.death();
    }
    updateHUD();
  }
}

function updateBossFight(dt) {
  const s=dt/16;
  const p=state.player, b=state.boss;

  // death animation
  if (state.bossDeathTimer>=0) {
    state.bossDeathTimer-=s;
    spawnParticles(b.x+Math.random()*60-30, b.y+Math.random()*60-30,'#ff4400',3,4);
    if (state.bossDeathTimer<0) { SFX.win(); triggerWin(); }
    updateParticles(dt);
    updateCamera();
    return;
  }

  // Player movement
  if (p.hitCooldown>0) p.hitCooldown-=s;
  if (p.attackCooldown>0) p.attackCooldown-=s;
  if (p.attacking) { p.attackFrame+=s; if(p.attackFrame>14) p.attacking=false; }

  let dx=0,dy=0;
  if (isPressed('left'))  { dx=-p.speed; p.dir='left'; }
  if (isPressed('right')) { dx= p.speed; p.dir='right'; }
  if (isPressed('up'))    { dy=-p.speed; p.dir='up'; }
  if (isPressed('down'))  { dy= p.speed; p.dir='down'; }
  if (dx&&dy){dx*=0.707;dy*=0.707;}
  p.moving=!!(dx||dy);
  if (p.moving) {
    tryMove(p,dx,dy,state.map,state.COLS,state.ROWS);
    stepTimer-=s;
    if (stepTimer<=0){SFX.step();stepTimer=20;}
  }
  if (p.moving){p.frameTick+=s;if(p.frameTick>=8){p.frameTick=0;p.frame=(p.frame+1)%4;}}
  else{p.frame=0;p.frameTick=0;}

  // Boss AI
  if (b.hitCooldown>0) b.hitCooldown-=s;
  b.actionTimer-=s;

  if (b.actionTimer<=0) {
    const phase=b.phase;
    if (phase===1) {
      b.action=Math.random()<0.3?'shoot':'walk';
      b.actionTimer=80+Math.random()*40;
    } else if (phase===2) {
      b.action=Math.random()<0.5?'shoot':'walk';
      b.actionTimer=55+Math.random()*30;
    } else {
      b.action=Math.random()<0.6?'shoot':'charge';
      b.actionTimer=38+Math.random()*20;
    }

    if (b.action==='shoot') {
      shootFireballs(b,p,b.phase);
    }
  }

  // Boss movement
  const distX=p.x-b.x, distY=p.y-b.y, dist=Math.sqrt(distX*distX+distY*distY);
  if (b.action!=='shoot' && dist>T*0.8) {
    const speed = b.action==='charge' ? b.speed*2 : b.speed;
    const bdx=(distX/dist)*speed, bdy=(distY/dist)*speed;
    b.dir=Math.abs(distX)>Math.abs(distY)?(distX>0?'right':'left'):(distY>0?'down':'up');
    tryMove(b,bdx,bdy,state.map,state.COLS,state.ROWS);
  }
  b.frameTick+=s; if(b.frameTick>=9){b.frameTick=0;b.frame=(b.frame+1)%4;}

  // Projectiles
  state.projectiles = state.projectiles.filter(proj => {
    proj.x+=proj.vx*s; proj.y+=proj.vy*s; proj.life-=s;
    if (proj.life<=0) return false;
    if (isWall(state.map,state.COLS,state.ROWS,proj.x,proj.y)) return false;
    // hit player
    const ddist=Math.sqrt((p.x-proj.x)**2+(p.y-proj.y)**2);
    if (ddist<22 && p.hitCooldown<=0) {
      p.hitCooldown=60; state.playerHP--;
      flashHit(); shakeScreen(); SFX.playerHit();
      spawnParticles(p.x,p.y,'#ff4444',8,3);
      updateHUD();
      if (state.playerHP<=0) triggerGameOver('The Demon Lord destroyed you...');
      return false;
    }
    return true;
  });

  // Boss touch damage
  if (dist<T*0.75 && p.hitCooldown<=0) {
    p.hitCooldown=70; state.playerHP--;
    flashHit(); shakeScreen(); SFX.playerHit();
    updateHUD();
    if (state.playerHP<=0) triggerGameOver('The Demon Lord destroyed you...');
  }

  updateParticles(dt);
  updateCamera();
  updateHUD();
}

function shootFireballs(boss, player, phase) {
  const dx=player.x-boss.x, dy=player.y-boss.y;
  const len=Math.sqrt(dx*dx+dy*dy)||1;
  const spd=3.2+phase*0.4;
  SFX.fireball();

  if (phase===1) {
    state.projectiles.push({x:boss.x,y:boss.y,vx:(dx/len)*spd,vy:(dy/len)*spd,life:120});
  } else if (phase===2) {
    [-0.25,0,0.25].forEach(angle=>{
      const ca=Math.cos(angle),sa=Math.sin(angle);
      state.projectiles.push({
        x:boss.x,y:boss.y,
        vx:(dx/len*ca - dy/len*sa)*spd,
        vy:(dx/len*sa + dy/len*ca)*spd,
        life:120,
      });
    });
  } else {
    [-0.35,-0.15,0,0.15,0.35].forEach(angle=>{
      const ca=Math.cos(angle),sa=Math.sin(angle);
      state.projectiles.push({
        x:boss.x,y:boss.y,
        vx:(dx/len*ca - dy/len*sa)*spd,
        vy:(dx/len*sa + dy/len*ca)*spd,
        life:100,
      });
    });
  }
}

// ── BOSS FIGHT DRAWING ─────────────────────────────────────
function drawBossFight() {
  const {camX,camY,COLS,ROWS} = state;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // Arena floor
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) drawArenaCell(r,c);

  // Projectiles
  state.projectiles.forEach(proj=>{
    const px=Math.round(proj.x-camX), py=Math.round(proj.y-camY);
    ctx.save();
    ctx.shadowColor='#ff6600'; ctx.shadowBlur=14;
    ctx.fillStyle='#ff8800';
    ctx.beginPath(); ctx.arc(px,py,7,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#ffcc00';
    ctx.beginPath(); ctx.arc(px,py,3,0,Math.PI*2); ctx.fill();
    ctx.restore();
  });

  // Slash FX
  if (state.slashFx) {
    const f=state.slashFx;
    f.timer--;
    const sx=Math.round(f.x-camX), sy=Math.round(f.y-camY);
    ctx.save();
    ctx.globalAlpha=f.timer/14;
    ctx.strokeStyle='#ffffff'; ctx.lineWidth=4;
    ctx.shadowColor='#88aaff'; ctx.shadowBlur=18;
    ctx.beginPath();
    const perp={x:-f.dy,y:f.dx};
    ctx.moveTo(sx+perp.x*22-f.dx*10, sy+perp.y*22-f.dy*10);
    ctx.lineTo(sx-perp.x*22+f.dx*24, sy-perp.y*22+f.dy*24);
    ctx.stroke();
    ctx.restore();
    if (f.timer<=0) state.slashFx=null;
  }

  // Boss (draw bigger for boss fight)
  drawBossSprite(state.boss, camX, camY);
  drawCharSprite(state.player, true, camX, camY);
  drawParticles(camX,camY);

  // Light glow around player
  drawFog(state.player.x-camX, state.player.y-camY, 240);

  // Death overlay
  if (state.bossDeathTimer>0) {
    ctx.globalAlpha=Math.min(1,(90-state.bossDeathTimer)/90)*0.5;
    ctx.fillStyle='#ff4400';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.globalAlpha=1;
  }
}

function drawArenaCell(r,c) {
  const t=state.map[r][c];
  const x=c*T-state.camX, y=r*T-state.camY;
  if (t===WALL) {
    ctx.fillStyle='#2a1a3e'; ctx.fillRect(x,y,T,T);
    ctx.fillStyle='#1e1228'; ctx.fillRect(x+2,y+2,T-4,T-4);
    ctx.fillStyle='#3a2a5e'; ctx.fillRect(x,y,T,2); ctx.fillRect(x,y,2,T);
  } else {
    ctx.fillStyle=(r+c)%2===0?'#1a1020':'#160e1c';
    ctx.fillRect(x,y,T,T);
    // subtle rune pattern on floor center tiles
    if (r>0&&c>0&&r<state.ROWS-1&&c<state.COLS-1&&(r*7+c*13)%17===0) {
      ctx.strokeStyle='rgba(150,50,200,0.18)';
      ctx.lineWidth=1;
      ctx.strokeRect(x+8,y+8,T-16,T-16);
    }
  }
}

function drawBossSprite(b, camX, camY) {
  const sx=Math.round(b.x-camX), sy=Math.round(b.y-camY);
  const f=b.frame;
  const bob=b.moving?[0,4,0,-4][f]:0;
  const flash = b.hitCooldown>0 && Math.floor(b.hitCooldown)%4<2;

  ctx.save();
  ctx.translate(sx,sy);

  const alpha = state.bossDeathTimer>=0 ? Math.max(0,state.bossDeathTimer/90) : 1;
  ctx.globalAlpha = flash ? 0.5 : alpha;

  const phase=b.phase||1;
  // Aura glow based on phase
  const auraColors=['','#ff0000','#ff6600','#ff00ff'];
  ctx.shadowColor=auraColors[phase]||'#ff0000';
  ctx.shadowBlur=18+phase*6;

  // Cloak / body
  ctx.fillStyle=phase===3?'#4a0060':'#3a0000';
  ctx.fillRect(-16,-20+bob,32,24);
  // Cloak bottom spikes
  for(let i=0;i<4;i++){
    ctx.fillRect(-14+i*8, 4+bob, 6, 6+(i%2)*4);
  }
  // Torso
  ctx.fillStyle=phase===3?'#6a0090':phase===2?'#aa0000':'#8b0000';
  ctx.fillRect(-12,-20+bob,24,20);
  // Head
  ctx.fillStyle=phase===3?'#7a00aa':phase===2?'#cc0000':'#c00';
  ctx.fillRect(-11,-34+bob,22,16);
  // Horns (bigger in later phases)
  const hornH=6+phase*3;
  ctx.fillStyle='#ff4444';
  ctx.fillRect(-14,-34-hornH+bob,5,hornH+2);
  ctx.fillRect(9,-34-hornH+bob,5,hornH+2);
  // Horn tips
  ctx.fillStyle='#ffaaaa';
  ctx.fillRect(-13,-34-hornH+bob,3,2);
  ctx.fillRect(10,-34-hornH+bob,3,2);
  // Eyes
  ctx.fillStyle=phase===3?'#ff00ff':phase===2?'#ff8800':'#ffff00';
  ctx.shadowColor=ctx.fillStyle; ctx.shadowBlur=10;
  ctx.fillRect(-7,-28+bob,5,5);
  ctx.fillRect(2,-28+bob,5,5);
  ctx.shadowBlur=0;
  // Mouth (grin)
  ctx.fillStyle='#000';
  ctx.fillRect(-6,-20+bob,12,3);
  ctx.fillStyle=phase===3?'#ff00ff':'#cc0000';
  for(let i=0;i<4;i++) ctx.fillRect(-5+i*3,-20+bob,2,3);
  // Arms
  const armSwing=[3,-3,3,-3][f];
  ctx.fillStyle=phase===3?'#4a0060':'#5a0000';
  ctx.fillRect(-22,-18+armSwing+bob,10,12);
  ctx.fillRect(12,-18-armSwing+bob,10,12);
  // Claws
  ctx.fillStyle='#aaaaaa';
  ctx.fillRect(-23,-7+armSwing+bob,3,6); ctx.fillRect(-20,-7+armSwing+bob,3,6);
  ctx.fillRect(20,-7-armSwing+bob,3,6);  ctx.fillRect(23,-7-armSwing+bob,3,6);
  // Legs
  ctx.fillStyle='#2a0000';
  const lleg=f%2===0?8:12, rleg=f%2===0?12:8;
  ctx.fillRect(-12, 4+bob,9,lleg);
  ctx.fillRect(3,   4+bob,9,rleg);
  // HP number
  ctx.shadowBlur=0; ctx.globalAlpha=1;
  ctx.fillStyle='#fff';
  ctx.font='bold 11px monospace';
  ctx.textAlign='center'; ctx.textBaseline='bottom';
  ctx.fillText('♥'.repeat(Math.max(0,state.bossHP)), 0, -38+bob);

  ctx.restore();
}

// ── SHARED DRAW HELPERS ────────────────────────────────────
function drawCharSprite(ent, isPlayer, camX, camY) {
  const sx=Math.round(ent.x-camX), sy=Math.round(ent.y-camY);
  const f=ent.frame;
  const bob=ent.moving?[0,2,0,-2][f]:0;
  const flash=ent.hitCooldown>0&&Math.floor(ent.hitCooldown)%6<3;

  ctx.save();
  ctx.translate(sx,sy);
  if (flash && isPlayer) ctx.globalAlpha=0.45;

  if (isPlayer) {
    // Shadow
    ctx.fillStyle='rgba(0,0,0,0.3)';
    ctx.ellipse(0,12,10,3,0,0,Math.PI*2); ctx.fill();

    // Shoes
    ctx.fillStyle='#2a1a10';
    const la=f%2===0,lbob=[0,3,0,-3][f];
    ctx.fillRect(-8,8+lbob,8,5);
    ctx.fillRect(1,8+(la?-3:3),8,5);

    // Legs
    ctx.fillStyle='#2a2a6a';
    ctx.fillRect(-7,0+bob,6,10);
    ctx.fillRect(1,0+bob,6,10);

    // Body
    ctx.fillStyle='#3a7bd5';
    ctx.fillRect(-9,-12+bob,18,14);
    // Belt
    ctx.fillStyle='#8b5e2a';
    ctx.fillRect(-9,0+bob,18,3);

    // Arms
    const aSwing=ent.attacking?-8:ent.moving?[3,-3,3,-3][f]:0;
    ctx.fillStyle='#3a7bd5';
    ctx.fillRect(-15,-11+aSwing+bob,6,10);
    ctx.fillRect(9,-11-aSwing+bob,6,10);
    if (ent.attacking) {
      // Sword
      ctx.fillStyle='#cccccc';
      ctx.shadowColor='#88ccff'; ctx.shadowBlur=8;
      ctx.fillRect(14,-26+bob,4,28);
      ctx.fillStyle='#888';
      ctx.fillRect(10,-10+bob,12,4);
      ctx.shadowBlur=0;
    }

    // Head
    ctx.fillStyle='#f5c5a0';
    ctx.fillRect(-8,-24+bob,16,13);
    // Hair
    ctx.fillStyle='#5c3d1e';
    ctx.fillRect(-8,-24+bob,16,5);
    // Eyes
    ctx.fillStyle='#1a1a1a';
    if (ent.dir==='right'||ent.dir==='down') ctx.fillRect(1,-18+bob,4,3);
    else                                      ctx.fillRect(-6,-18+bob,4,3);
    // Ear
    ctx.fillStyle='#e0a888';
    ctx.fillRect(ent.dir==='right'?-10:-10,-20+bob,3,5);
  } else {
    // Maze boss (small version - reuse simplified drawBossSprite logic)
    const mazeBob=[0,3,0,-3][f];
    ctx.fillStyle='#8b0000'; ctx.fillRect(-10,-14+mazeBob,20,14);
    ctx.fillStyle='#c00';    ctx.fillRect(-9,-26+mazeBob,18,14);
    ctx.fillStyle='#ff4444'; ctx.fillRect(-9,-32+mazeBob,4,8); ctx.fillRect(5,-32+mazeBob,4,8);
    ctx.fillStyle='#ffff00';
    ctx.shadowColor='#ffff00'; ctx.shadowBlur=6;
    ctx.fillRect(-5,-22+mazeBob,4,4); ctx.fillRect(1,-22+mazeBob,4,4);
    ctx.shadowBlur=0;
    ctx.fillStyle='#5a0000';
    ctx.fillRect(-9,0+mazeBob,7,10); ctx.fillRect(2,0+mazeBob,7,10);
  }

  ctx.restore();
}

function drawFog(cx,cy,radius) {
  const grad=ctx.createRadialGradient(cx,cy,radius*0.12,cx,cy,radius);
  grad.addColorStop(0,'rgba(0,0,0,0)');
  grad.addColorStop(0.55,'rgba(0,0,0,0.12)');
  grad.addColorStop(1,'rgba(0,0,0,0.92)');
  ctx.fillStyle=grad;
  ctx.fillRect(0,0,canvas.width,canvas.height);
}

// ── CAMERA ─────────────────────────────────────────────────
function updateCamera() {
  const p=state.player;
  const {COLS,ROWS} = state;
  const tx=p.x-canvas.width/2, ty=p.y-canvas.height/2;
  state.camX=Math.max(0,Math.min(COLS*T-canvas.width, tx));
  state.camY=Math.max(0,Math.min(ROWS*T-canvas.height,ty));
}

// ── CANVAS RESIZE ──────────────────────────────────────────
function resizeCanvas() {
  canvas.width=window.innerWidth;
  canvas.height=window.innerHeight-48;
  ctx.imageSmoothingEnabled=false;
}

// ── LEVEL FLOW ─────────────────────────────────────────────
function showLevelBanner(cb) {
  const lvl=LEVELS[currentLevel];
  document.getElementById('banner-stage').textContent =
    currentLevel<2 ? `— LEVEL ${currentLevel+1} —` : '— FINAL STAGE —';
  document.getElementById('banner-title').textContent = lvl.title;
  document.getElementById('banner-sub').textContent   = lvl.sub;
  showScreen('banner');
  setTimeout(()=>{
    screens.banner.classList.remove('active');
    screens.banner.style.display='none';
    screens.game.style.display='flex';
    screens.game.classList.add('active');
    cb();
  }, 2700);
}

function startLevel(lvlIdx) {
  cancelAnimationFrame(animId);
  resizeCanvas();
  if (LEVELS[lvlIdx].type==='maze') initMaze(lvlIdx);
  else                               initBossFight();
  updateHUD();
  lastTime=performance.now();
  animId=requestAnimationFrame(loop);
}

function nextLevel() {
  cancelAnimationFrame(animId);
  currentLevel++;
  if (currentLevel>=LEVELS.length) { triggerWin(); return; }
  showLevelBanner(()=>startLevel(currentLevel));
}

function triggerGameOver(reason) {
  if (state.over||state.won) return;
  state.over=true;
  cancelAnimationFrame(animId);
  SFX.death();
  gameoverReason.textContent=reason||'You were defeated...';
  showScreen('gameover');
}

function triggerWin() {
  if (state.over||state.won) return;
  state.won=true;
  cancelAnimationFrame(animId);
  SFX.win();
  showScreen('win');
}

// ── MAIN LOOP ──────────────────────────────────────────────
function loop(ts) {
  if (!state||state.paused||state.over||state.won) return;
  const dt=Math.min(ts-lastTime,80); // cap delta to 80ms
  lastTime=ts;

  if (state.mode==='maze')      { updateMaze(dt);      drawMaze();      }
  else if (state.mode==='bossfight') { updateBossFight(dt); drawBossFight(); }

  animId=requestAnimationFrame(loop);
}

// ── BUTTON WIRING ──────────────────────────────────────────
document.getElementById('play-btn').addEventListener('click', ()=>{
  ensureAudio();
  currentLevel=0;
  showLevelBanner(()=>startLevel(0));
});

document.getElementById('pause-btn').addEventListener('click', ()=>{
  if (!state||state.over||state.won) return;
  state.paused=true;
  showScreen('pause');
});

document.getElementById('resume-btn').addEventListener('click', ()=>{
  if (!state) return;
  state.paused=false;
  screens.pause.classList.remove('active'); screens.pause.style.display='none';
  screens.game.style.display='flex'; screens.game.classList.add('active');
  lastTime=performance.now();
  animId=requestAnimationFrame(loop);
});

function fullRestart() {
  cancelAnimationFrame(animId);
  currentLevel=0;
  ensureAudio();
  showLevelBanner(()=>startLevel(0));
}
document.getElementById('restart-btn').addEventListener('click',       fullRestart);
document.getElementById('restart-pause-btn').addEventListener('click', fullRestart);
document.getElementById('next-btn').addEventListener('click',          fullRestart);

window.addEventListener('keydown',e=>{
  if(e.key==='Escape'||e.key==='p'||e.key==='P'){
    if(!state||state.over||state.won) return;
    if(state.paused) document.getElementById('resume-btn').click();
    else             document.getElementById('pause-btn').click();
  }
});

window.addEventListener('resize',()=>{ if(screens.game.classList.contains('active')) resizeCanvas(); });

// ── BOOT ───────────────────────────────────────────────────
(function boot(){
  showScreen('intro');
  setTimeout(()=>showScreen('start'), 3400);
  setupMobileButtons();
})();
