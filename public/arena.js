'use strict';
/* Slime Arena on PixiJS. Read-only viewer: SSE events + /state polling.
   Cutscene steps are data; FX primitives interpret them (Task 9 adds scenes). */
(async function () {
  const CALM = new URLSearchParams(location.search).has('calm')
    || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (CALM) document.body.classList.add('calm');
  // Day (light) / night (dark) theme. The page sets body.day from localStorage
  // before paint; the arena reads it to render a daytime sky vs the night starfield.
  const DAY = document.body.classList.contains('day');

  const P = { bg:'#1a1d24', bg2:'#232733', gold:'#f0b541', ember:'#e8842c', red:'#c83737',
    bone:'#e8e0d0', steel:'#7fa8c0', dark:'#2e3547', floor:'#2e3547', green:'#6abe30' };

  // Knight 12×14: 0=transparent,1=steel,2=gold,3=bone,4=dark
  const KNIGHT = [
    [0,0,0,2,2,2,2,2,0,0,0,0],
    [0,0,2,3,3,3,3,3,2,0,0,0],
    [0,0,2,3,1,3,1,3,2,0,0,0],
    [0,0,2,3,3,3,3,3,2,0,0,0],
    [0,2,2,2,2,2,2,2,2,2,0,0],
    [0,1,1,2,1,1,1,2,1,1,0,0],
    [0,1,2,2,2,2,2,2,2,1,0,0],
    [0,1,2,1,2,2,2,1,2,1,0,0],
    [0,2,2,1,2,2,2,1,2,2,0,0],
    [0,0,1,1,2,2,2,1,1,0,0,0],
    [0,0,1,1,4,4,4,1,1,0,0,0],
    [0,0,1,4,4,4,4,4,1,0,0,0],
    [0,2,1,4,0,0,0,4,1,2,0,0],
    [0,2,2,0,0,0,0,0,2,2,0,0],
  ];
  const KNIGHT_COLORS = ['', P.steel, P.gold, P.bone, P.dark];
  // Boss blob 16×14: 0=transparent,1=main,2=dark accent,3=light mouth
  const BOSS = [
    [0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,1,1,2,1,1,2,1,1,2,1,1,2,1,1,0],
    [0,1,1,2,2,1,2,2,1,2,2,1,2,2,1,0],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,2,1,1,1,1,1,1,1,1,1,1,2,1,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [0,1,1,1,3,1,1,1,1,1,1,3,1,1,1,0],
    [0,1,1,1,3,3,3,3,3,3,3,3,1,1,1,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0],
  ];
  function bossColors(hpPct) {
    const c1 = hpPct > 60 ? P.green : hpPct > 30 ? P.ember : P.red;
    const c2 = hpPct > 60 ? '#4a8a20' : hpPct > 30 ? '#b05820' : '#8a2020';
    return ['', c1, c2, P.bone];
  }

  const W = 320, H = 180, FLOOR_Y = 145;
  // The boss stands on the ground (a low stone dais step), facing the knight —
  // big and planted, not floating. BOSS_FLOOR is the boss's feet line; just a few
  // px above FLOOR_Y so the dais riser reads while the boss stays grounded.
  const BOSS_FLOOR = FLOOR_Y - 4;
  // Boss slime renders at least this many times the knight's size. KNIGHT and
  // BOSS matrices share a 14px height, so scale maps 1:1 to "× the knight".
  const SLIME_MIN_SCALE = 3;

  function showOverlay(msg) {
    const ov = document.getElementById('overlay');
    if (!ov) return;
    if (msg != null) ov.textContent = msg;
    ov.style.display = 'flex';
  }
  function hideOverlay() {
    const ov = document.getElementById('overlay');
    if (ov) ov.style.display = 'none';
  }

  if (typeof PIXI === 'undefined') return showOverlay('arena needs WebGL — PIXI failed to load');
  PIXI.TextureSource.defaultOptions.scaleMode = 'nearest';
  const app = new PIXI.Application();
  try { await app.init({ width: W, height: H, background: DAY ? '#add2ef' : P.bg, antialias: false }); }
  catch (e) { return showOverlay('arena needs WebGL — ' + e.message); }
  app.canvas.style.width = '100%';
  document.getElementById('canvas-wrap').prepend(app.canvas);

  const world = new PIXI.Container();
  const fxLayer = new PIXI.Container();
  const uiLayer = new PIXI.Container();
  app.stage.addChild(world, fxLayer, uiLayer);

  // ── matrix → texture ──────────────────────────────────────────────────────
  function texFromMatrix(mat, colors) {
    const rows = mat.length, cols = mat[0].length;
    const cv = document.createElement('canvas');
    cv.width = cols; cv.height = rows;
    const c = cv.getContext('2d');
    for (let r = 0; r < rows; r++) {
      for (let x = 0; x < cols; x++) {
        const v = mat[r][x];
        if (!v) continue;
        c.fillStyle = colors[v];
        c.fillRect(x, r, 1, 1);
      }
    }
    return PIXI.Texture.from(cv);
  }

  // ── background: stars, floor, torches ──────────────────────────────────────
  function starLayer(n, alpha) {
    const g = new PIXI.Graphics();
    for (let i = 0; i < n; i++) {
      const x = Math.random() * W * 2, y = Math.random() * (FLOOR_Y - 10);
      g.rect(x, y, 1, 1).fill({ color: 0xffffff, alpha });
    }
    return g;
  }
  const bgFar = starLayer(40, 0.35);
  const bgNear = starLayer(28, 0.6);
  world.addChild(bgFar, bgNear);
  // Day theme: hide the night stars, paint a sun + drifting clouds behind the floor.
  if (DAY) {
    bgFar.visible = bgNear.visible = false;
    const sky = new PIXI.Graphics();
    // vertical gradient: deeper blue up top fading to pale at the horizon
    const SKY_BANDS = [0x8cc0ec, 0xa0cdef, 0xb6daf3, 0xcde7f6, 0xdceef8];
    const bh = Math.ceil(FLOOR_Y / SKY_BANDS.length);
    SKY_BANDS.forEach((c, i) => sky.rect(0, i * bh, W, bh + 1).fill(c));
    // layered rolling hills for depth
    sky.ellipse(60, FLOOR_Y + 6, 95, 30).fill({ color: 0x9ec98c, alpha: 0.5 });
    sky.ellipse(230, FLOOR_Y + 8, 120, 34).fill({ color: 0x86bd80, alpha: 0.6 });
    sky.ellipse(150, FLOOR_Y + 12, 150, 30).fill({ color: 0x74ad72, alpha: 0.7 });
    // sun with soft glow
    sky.circle(50, 30, 22).fill({ color: 0xfff0a8, alpha: 0.22 });
    sky.circle(50, 30, 16).fill({ color: 0xffe680, alpha: 0.32 });
    sky.circle(50, 30, 12).fill(0xfff4c2);
    const cloud = (cx, cy, s) => {
      sky.ellipse(cx, cy, 13 * s, 5 * s).fill({ color: 0xffffff, alpha: 0.9 });
      sky.ellipse(cx + 9 * s, cy + 1, 9 * s, 4 * s).fill({ color: 0xffffff, alpha: 0.9 });
      sky.ellipse(cx - 9 * s, cy + 1, 8 * s, 4 * s).fill({ color: 0xeef6ff, alpha: 0.85 });
      sky.ellipse(cx, cy - 2, 8 * s, 4 * s).fill({ color: 0xffffff, alpha: 0.9 });
    };
    cloud(120, 26, 1); cloud(232, 18, 1.3); cloud(180, 46, 0.8);
    world.addChildAt(sky, 0);
  }

  // Re-randomize the night starfield (the "new area" wipe after a victory walk).
  // Day's sky is static, so it's a no-op there.
  function repaintBackdrop() {
    bgFar.clear(); bgNear.clear();
    if (DAY) return;
    const paint = (g, n, alpha) => {
      for (let i = 0; i < n; i++) g.rect(Math.random() * W * 2, Math.random() * (FLOOR_Y - 10), 1, 1).fill({ color: 0xffffff, alpha });
    };
    paint(bgFar, 40, 0.35); paint(bgNear, 28, 0.6);
  }

  // ── sky decor: sci-fi / AI things that drift across the starfield ──────────────
  // Pixel sprites + text ribbons + the odd meteor. Pure ambience: lives behind the
  // floor and all combat sprites, never touches game state. Gentle, slow, sparse.
  const skyLayer = new PIXI.Container();
  world.addChild(skyLayer);
  const SKY = {
    rocket: { colors: ['', P.steel, P.red, '#4aa3c0', P.red, P.gold], mat: [
      [0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,5,0,1,1,1,1,1,1,2,0,0],
      [0,5,5,1,1,1,3,1,1,1,2,2,0],
      [5,5,5,1,1,1,3,1,1,1,2,2,2],
      [0,5,5,1,1,1,3,1,1,1,2,2,0],
      [0,0,5,0,1,1,1,1,1,4,2,0,0],
      [0,0,0,0,0,0,0,0,4,4,0,0,0]] },
    dino: { colors: ['', P.green, '#1a1d24'], mat: [
      [0,0,0,0,0,0,0,1,1,1,0],
      [0,0,0,0,0,0,0,1,1,1,1],
      [0,0,0,0,0,0,0,1,2,1,1],
      [0,0,0,0,0,0,0,1,1,1,1],
      [1,0,0,0,0,0,1,1,1,1,0],
      [1,1,0,0,1,1,1,1,1,0,0],
      [1,1,1,1,1,1,1,1,1,0,0],
      [0,1,1,1,1,1,1,1,1,0,0],
      [0,0,1,1,1,1,1,1,0,0,0],
      [0,0,1,1,0,1,1,0,0,0,0],
      [0,0,1,0,0,0,1,0,0,0,0]] },
    duck: { colors: ['', P.gold, P.ember, '#1a1d24'], mat: [
      [0,0,0,1,1,0,0,0,0],
      [0,0,1,1,1,1,0,0,0],
      [0,0,1,3,1,1,2,2,0],
      [0,0,1,1,1,1,0,0,0],
      [0,1,1,1,1,1,0,0,0],
      [1,1,1,1,1,1,1,0,0],
      [1,1,1,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,0,0]] },
    coin: { colors: ['', P.gold, '#b8860b', '#1a1d24'], mat: [
      [0,0,1,1,1,0,0],
      [0,1,1,3,1,1,0],
      [1,1,3,3,3,1,1],
      [1,1,3,1,3,1,1],
      [1,1,3,3,3,1,1],
      [1,1,3,1,3,1,1],
      [1,1,3,3,3,1,1],
      [0,1,1,1,1,1,0],
      [0,0,1,1,1,0,0]] },
    invader: { colors: ['', '#7fd97f'], mat: [
      [0,0,1,0,0,0,0,0,1,0,0],
      [0,0,0,1,0,0,0,1,0,0,0],
      [0,0,1,1,1,1,1,1,1,0,0],
      [0,1,1,0,1,1,1,0,1,1,0],
      [1,1,1,1,1,1,1,1,1,1,1],
      [1,0,1,1,1,1,1,1,1,0,1],
      [1,0,1,0,0,0,0,0,1,0,1],
      [0,0,0,1,1,0,1,1,0,0,0]] },
    coffee: { colors: ['', '#d8d0c0', '#7a4a2a', '#9aa0ac'], mat: [
      [0,0,3,0,3,0,0,0,0],
      [0,0,0,3,0,3,0,0,0],
      [0,1,1,1,1,1,1,0,0],
      [0,1,2,2,2,2,1,1,0],
      [0,1,2,2,2,2,1,0,1],
      [0,1,1,1,1,1,1,0,1],
      [0,0,1,1,1,1,1,1,0],
      [0,0,0,1,1,1,0,0,0]] },
    gpu: { colors: ['', '#3a8f4a', '#2e3547', P.steel, '#b8c0cc', '', P.gold], mat: [
      [4,1,1,1,1,1,1,1,1,1,1,1,0],
      [4,1,2,2,2,1,1,2,2,2,1,1,0],
      [4,1,2,3,2,1,1,2,3,2,1,1,0],
      [4,1,2,2,2,1,1,2,2,2,1,1,0],
      [4,1,1,1,1,1,1,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,1,1,1,1,0,0],
      [0,0,6,6,0,0,6,6,0,0,0,0,0]] },
    tesla: { colors: ['', '#c2c8d2', '', '#11141b', '#2e3547'], mat: [
      [0,0,0,0,1,1,1,1,0,0,0,0,0,0],
      [0,0,1,1,1,3,3,3,3,1,1,1,0,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,1,0],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [0,0,4,4,0,0,0,0,0,0,4,4,0,0],
      [0,0,4,4,0,0,0,0,0,0,4,4,0,0]] },
    chip: { colors: ['', '#3a4254', P.gold, P.green], mat: [
      [0,0,2,0,2,0,2,0,0],
      [0,0,0,0,0,0,0,0,0],
      [2,0,1,1,1,1,1,0,2],
      [0,0,1,3,3,3,1,0,0],
      [2,0,1,3,1,3,1,0,2],
      [0,0,1,3,3,3,1,0,0],
      [2,0,1,1,1,1,1,0,2],
      [0,0,0,0,0,0,0,0,0],
      [0,0,2,0,2,0,2,0,0]] },
  };
  const skyTexCache = {};
  function skyTexFor(key) {
    if (!skyTexCache[key]) skyTexCache[key] = texFromMatrix(SKY[key].mat, SKY[key].colors);
    return skyTexCache[key];
  }
  const RIBBONS = ['AGI 2027?', 'GPT-∞', 'ship it 🚀', 'to the moon', 'H100 go brrr',
    'attention is all you need', 'localhost:4117', '42', 'more layers', 'train loss → 0',
    '🤖 beep boop', 'quantum when?', 'vibe coding', '∂L/∂w', 'it compiles!', 'token go brrr',
    'hello, world', 'rm -rf doubt', 'GPU poor', 'just one more epoch'];
  const SPRITE_KEYS = ['rocket', 'tesla', 'gpu', 'chip', 'dino', 'duck', 'coin', 'invader', 'coffee'];
  const DIRECTIONAL = { rocket: 1, tesla: 1, dino: 1, duck: 1 }; // these have a facing → fly right
  const drifters = [];
  let nextDrift = 360, nextMeteor = 500;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  function spawnSprite() {
    const key = pick(SPRITE_KEYS);
    const sp = new PIXI.Sprite(skyTexFor(key));
    const sc = key === 'planet' ? rnd(1.6, 2.6) : rnd(1, 1.9);
    sp.scale.set(sc);
    const w = sp.texture.width * sc;
    const dir = DIRECTIONAL[key] || (Math.random() < 0.5 ? 1 : -1);
    const y = rnd(8, FLOOR_Y - 36);
    sp.x = dir > 0 ? -w - 4 : W + 4;
    sp.y = y;
    sp.alpha = rnd(0.4, 0.78);
    skyLayer.addChild(sp);
    drifters.push({ node: sp, vx: dir * rnd(0.12, 0.45), baseY: y, amp: rnd(1, 4), phase: rnd(0, 100), w });
  }
  function spawnRibbon() {
    const t = new PIXI.Text({ text: pick(RIBBONS), style: { fontFamily: 'monospace',
      fontSize: rnd(7, 10) | 0, fontWeight: 'bold', fill: colorNum(pick([P.gold, P.steel, P.green, P.bone])) } });
    t.resolution = 2;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const y = rnd(8, FLOOR_Y - 30);
    t.x = dir > 0 ? -t.width - 4 : W + 4;
    t.y = y;
    t.alpha = rnd(0.3, 0.6);
    skyLayer.addChild(t);
    drifters.push({ node: t, vx: dir * rnd(0.18, 0.5), baseY: y, amp: rnd(1, 3), phase: rnd(0, 100), w: t.width });
  }
  function spawnMeteor() {
    const g = new PIXI.Graphics();
    const len = rnd(9, 18) | 0;
    for (let i = 0; i < len; i++) g.rect(i, -i * 0.6, 1, 1).fill({ color: 0xffffff, alpha: 1 - i / len });
    g.rect(0, 0, 2, 2).fill(0xfff2c0);
    g.x = rnd(W * 0.3, W); g.y = rnd(4, FLOOR_Y * 0.45);
    g.alpha = 0.9;
    skyLayer.addChild(g);
    drifters.push({ node: g, vx: -rnd(3, 5), vy: rnd(1.4, 2.4), meteor: true, life: rnd(40, 75), age: 0 });
  }
  function updateSky() {
    if (--nextDrift <= 0) {
      nextDrift = rnd(800, 1700) | 0; // occasional — one drifts by every ~13–28s
      if (drifters.filter((d) => !d.meteor).length < 2) (Math.random() < 0.4 ? spawnRibbon : spawnSprite)();
    }
    if (!CALM && --nextMeteor <= 0) { nextMeteor = rnd(700, 1500) | 0; spawnMeteor(); } // honor reduced-motion
    for (let i = drifters.length - 1; i >= 0; i--) {
      const d = drifters[i], n = d.node;
      if (d.meteor) {
        n.x += d.vx; n.y += d.vy; d.age++;
        n.alpha = Math.max(0, 0.9 * (1 - d.age / d.life));
        if (d.age >= d.life || n.x < -20 || n.y > FLOOR_Y) { skyLayer.removeChild(n); n.destroy(); drifters.splice(i, 1); }
        continue;
      }
      n.x += d.vx;
      n.y = d.baseY + (CALM ? 0 : Math.sin((frame + d.phase) / 45) * d.amp);
      if ((d.vx > 0 && n.x > W + 6) || (d.vx < 0 && n.x < -d.w - 6)) { skyLayer.removeChild(n); n.destroy(); drifters.splice(i, 1); }
    }
  }

  const floorBar = new PIXI.Graphics();
  if (DAY) {
    floorBar.rect(0, FLOOR_Y + 3, W, 4).fill(0x6b5a44);                  // dirt recess below lip
    floorBar.rect(0, FLOOR_Y, W, 3).fill(0xb6a98c);                       // warm sunlit stone body
    floorBar.rect(0, FLOOR_Y, W, 1).fill({ color: 0xe6dcc2, alpha: 0.95 }); // bright lit top edge
    for (let tx = 0; tx < W; tx += 8) floorBar.rect(tx, FLOOR_Y + 1, 1, 2).fill({ color: 0x7a6c52, alpha: 0.55 }); // tile seams
  } else {
    floorBar.rect(0, FLOOR_Y + 3, W, 3).fill(0x141821);                 // recess shadow below lip
    floorBar.rect(0, FLOOR_Y, W, 3).fill(P.floor);                       // floor body
    floorBar.rect(0, FLOOR_Y, W, 1).fill({ color: 0x4a5570, alpha: 0.9 }); // lit top edge
    for (let tx = 0; tx < W; tx += 8) floorBar.rect(tx, FLOOR_Y + 1, 1, 2).fill({ color: 0x12151d, alpha: 0.6 }); // tile seams
  }
  world.addChild(floorBar);

  // ground shadows + boss target ring (drawn each frame, behind the units)
  const groundFx = new PIXI.Graphics();
  world.addChild(groundFx);

  const torches = [];
  for (const tx of [20, 280]) {
    const g = new PIXI.Graphics();
    g._tx = tx;
    world.addChild(g);
    torches.push(g);
  }
  function drawTorch(g, hot) {
    const tx = g._tx;
    g.clear();
    if (DAY) {
      // daylight: an unlit post — a lit flame in bright sun reads as a mistake
      g.rect(tx, FLOOR_Y - 18, 3, 18).fill(0x6b5036);          // wooden post
      g.rect(tx - 1, FLOOR_Y - 22, 5, 4).fill(0x4a4038);       // cold, unlit head
      return;
    }
    // soft glow halo around the flame
    g.circle(tx + 1, FLOOR_Y - 22, 11).fill({ color: hot ? 0xf0b541 : 0xe8842c, alpha: 0.06 });
    g.circle(tx + 1, FLOOR_Y - 22, 6).fill({ color: 0xf0b541, alpha: 0.1 });
    g.rect(tx, FLOOR_Y - 18, 3, 18).fill(0x5a3010);
    g.rect(tx - 1, FLOOR_Y - 22, 5, 4).fill(hot ? P.gold : P.ember);
    g.rect(tx, FLOOR_Y - 25, 3, 3).fill(P.gold);
  }
  torches.forEach((g) => drawTorch(g, true));

  // ── sprites ─────────────────────────────────────────────────────────────────
  const knightTex = texFromMatrix(KNIGHT, KNIGHT_COLORS);
  const knight = new PIXI.Sprite(knightTex);
  knight.x = 40; knight.y = FLOOR_Y - 14;
  world.addChild(knight);

  // ── summons (subagent battles) ────────────────────────────────────────────────
  const summons = []; // { sprite, born }
  function spawnSummon() {
    if (summons.length >= 4) return;
    const s = new PIXI.Sprite(knightTex);
    s.scale.set(0.6);
    s.tint = 0x7fa8c0;
    s.x = 60 + summons.length * 14; s.y = FLOOR_Y - 9;
    world.addChild(s);
    summons.push({ sprite: s, born: frame });
    if (!CALM) burst(s.x + 4, s.y + 4, P.steel, 6);
  }
  function clearSummons() {
    for (const su of summons) {
      if (!CALM) burst(su.sprite.x + 4, su.sprite.y + 4, P.steel, 4);
      world.removeChild(su.sprite); su.sprite.destroy();
    }
    summons.length = 0;
  }

  let lastBossPct = 100; // cached for tentacle tinting
  const bossTex = { hi: null, mid: null, lo: null };
  function bossTexFor(pct) {
    const tier = pct > 60 ? 'hi' : pct > 30 ? 'mid' : 'lo';
    if (!bossTex[tier]) bossTex[tier] = texFromMatrix(BOSS, bossColors(pct));
    return { tier, tex: bossTex[tier] };
  }
  const boss = new PIXI.Sprite(bossTexFor(100).tex);
  boss.x = 220; boss.y = BOSS_FLOOR - 14;
  boss.visible = false;
  world.addChild(boss);

  // Boss appearance is seeded by its NAME — intrinsic, decoupled from project est.
  // (Combat HP/damage still come from the real session; only the look is seeded.)
  let bossSeed = 1;
  function seedFromName(name) {
    let h = 2166136261; const s = String(name || '');
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0) || 1;
  }
  function regenBoss(name) {
    bossSeed = seedFromName(name);
    if (window.SlimeDesigns) {
      const d = SlimeDesigns.designFor(bossSeed);
      boss.texture = texFromMatrix(d.mat, SlimeDesigns.PALETTES[d.pal]);
    }
  }
  // map the seed onto the threat-tier range so size/form/tier vary by identity,
  // not tokens. Weighted so most bosses are normal, some elite, raids stay rare
  // (≈50/35/15) — a towering raid should feel special, not be every boss.
  function bossAppearanceEst() {
    const r = bossSeed % 100;
    if (r < 50) return bossSeed % 45000;             // normal
    if (r < 85) return 45000 + (bossSeed % 75000);   // ELITE  (45k–120k)
    return 120000 + (bossSeed % 180000);             // RAID BOSS (≥120k)
  }

  // ── on-stage HP bars (boss + every live mob) ──
  // Player stats (token/week/context, name) live only in the top status window;
  // no overhead text above the knight — it was illegible against the sprites.
  const hpBars = new PIXI.Graphics();
  world.addChild(hpBars);
  /** LoL-style HP bar above a sprite: shadow + dark track + gradient fill +
   *  top highlight + segment ticks + bronze frame. `big` = the boss bar. */
  function drawBar(g, cx, topY, pct, big) {
    const w = big ? 26 : 15, h = big ? 4 : 3, x = Math.round(cx - w / 2), y = Math.round(topY);
    const p = Math.max(0, Math.min(100, pct));
    g.rect(x - 1, y - 1, w + 2, h + 2).fill({ color: 0x000000, alpha: 0.5 });   // drop shadow
    g.rect(x, y, w, h).fill(0x0b0d12);                                            // track
    const col = p > 50 ? 0x6abe30 : p > 20 ? 0xf0b541 : 0xc83737;
    const fw = Math.round((w * p) / 100);
    if (fw > 0) {
      g.rect(x, y, fw, h).fill(col);                                             // fill
      g.rect(x, y, fw, 1).fill({ color: 0xffffff, alpha: 0.45 });                // top highlight
      g.rect(x, y + h - 1, fw, 1).fill({ color: 0x000000, alpha: 0.3 });         // bottom shade
    }
    for (let sx = x + (big ? 6 : 5); sx < x + w - 1; sx += big ? 6 : 5) {
      g.rect(sx, y, 1, h).fill({ color: 0x000000, alpha: 0.45 });                // segment ticks
    }
    g.rect(x - 1, y - 1, w + 2, 1).fill(0x6b5a2e);                                // bronze frame
    g.rect(x - 1, y + h, w + 2, 1).fill(0x6b5a2e);
    g.rect(x - 1, y - 1, 1, h + 2).fill(0x6b5a2e);
    g.rect(x + w, y - 1, 1, h + 2).fill(0x6b5a2e);
  }
  function drawHud() {
    hpBars.clear();
    groundFx.clear();
    // dais platforms first (behind shadows + units): hero wide/low, foe small/high
    drawDais(groundFx, knight.x + knight.width / 2, FLOOR_Y, 20, 7);
    const shadow = (cx, w, a, fy) => groundFx.ellipse(Math.round(cx), (fy == null ? FLOOR_Y : fy) + 1, Math.max(4, w / 2), 2).fill({ color: 0x000000, alpha: a });
    shadow(knight.x + knight.width / 2, knight.width * 0.85, 0.35);
    summons.forEach((su) => shadow(su.sprite.x + su.sprite.width / 2, su.sprite.width * 0.7, 0.25));
    packSprites.forEach((s) => { if (s.visible) shadow(s.x + s.width / 2, s.width * 0.7, 0.3); });
    if (boss.visible && !bossDead) {
      const cx = boss.x + boss.width / 2;
      drawDais(groundFx, cx, BOSS_FLOOR, Math.max(16, boss.width * 0.6), 9);
      shadow(cx, boss.width * 0.85, 0.42, BOSS_FLOOR);
      const pulse = CALM ? 1 : 1 + Math.sin(frame / 20) * 0.12; // glowing target ring at the boss's feet
      groundFx.ellipse(Math.round(cx), BOSS_FLOOR + 1, boss.width * 0.5 * pulse, 3.2 * pulse).stroke({ color: 0xf0b541, width: 1, alpha: 0.5 });
    }
    if (boss.visible && !bossDead) drawBar(hpBars, boss.x + boss.width / 2, boss.y - 4, lastBossPct, true);
    packSprites.forEach((s) => { if (s.visible) drawBar(hpBars, s.x + s.width / 2, s.y - 3, s._pct != null ? s._pct : 100); });
    // re-add keeps the bars above pack sprites that get addChild'd later
    world.addChild(hpBars);
  }

  // slime textures shared with the rail (minions.js defines window.SlimeDesigns)
  const slimeTex = {};
  function slimeTexFor(form) {
    const f = ((form | 0) >>> 0) || 1; // full seed — variety is intrinsic, not %6
    if (!slimeTex[f] && window.SlimeDesigns) {
      const d = SlimeDesigns.designFor(f);
      slimeTex[f] = texFromMatrix(d.mat, SlimeDesigns.PALETTES[d.pal]);
    }
    return slimeTex[f] || bossTexFor(100).tex;
  }
  /** plant a sprite's feet on the floor (scaled height aware) */
  function ground(s, slump) { s.y = FLOOR_Y - s.height + (slump || 0); }
  /** plant the boss's feet on its raised dais (the up-stage diagonal position) */
  function groundBoss(slump) { boss.y = BOSS_FLOOR - boss.height + (slump || 0); }
  /** a faked stone dome (3 stacked ellipses) the duelists stand on — Pokemon's
   *  platform read, KOEI's muted stone palette. Drawn into groundFx behind units. */
  const DAIS = DAY
    ? { shadow: 0x6b5a44, base: 0x8a7c64, mid: 0xa89a7e, top: 0xc8bc9c }   // sunlit stone
    : { shadow: 0x1d222c, base: 0x1d222c, mid: 0x2e3547, top: 0x3a4456 };  // night stone
  function drawDais(g, cx, fy, rx, ry) {
    const x = Math.round(cx), y = Math.round(fy);
    g.ellipse(x, y + 2, rx, ry).fill({ color: DAIS.shadow, alpha: 0.55 });      // cast shadow
    g.ellipse(x, y, rx, ry).fill(DAIS.base);                                    // base
    g.ellipse(x, y - 1, rx * 0.9, ry * 0.78).fill(DAIS.mid);                    // mid
    g.ellipse(x, y - 2, rx * 0.74, ry * 0.5).fill({ color: DAIS.top, alpha: 0.9 }); // top crescent
  }

  // ── encounter forms ──────────────────────────────────────────────────────────
  let encForm = 'big';          // 'mini' | 'big' | 'pack' | 'tentacled'
  let lastEncEst = null;        // est used for form decisions (locked at encounter/approval)
  let lastTodos = [];           // latest rail data (from snapshot polls)
  const packSprites = [];       // PIXI sprites, one per todo (cap 5)
  const PACK_X = [150, 172, 194, 216, 238];
  const tentacleGfx = new PIXI.Graphics();
  world.addChild(tentacleGfx);

  function encounterFormFor(est, todoCount) {
    const tier = bossTierFor(est);
    const big = tier.label === 'ELITE' || tier.label === 'RAID BOSS';
    // todos are the most common honest "big quest" signal and re-evaluate on
    // every state poll, so a session visibly escalates as its checklist grows.
    if (todoCount >= 4 || tier.label === 'RAID BOSS') return 'tentacled';
    if (todoCount >= 2) return 'pack';
    return big ? 'big' : 'mini';
  }

  function drawTentacles(aliveCount) {
    tentacleGfx.clear();
    if (encForm !== 'tentacled' || bossDead || !boss.visible || bossBroken) return;
    const n = Math.min(6, aliveCount);
    if (!n) return;
    const k = Math.max(0.6, Math.min(2.5, boss.scale.x)); // tentacles track body size
    // tentacles splay OUTWARD from the body onto the floor — alternating
    // left/right so they read as reaching arms, not get hidden behind the sprite
    const col = colorNum(bossColors(lastBossPct)[1]); // tentacles match the body color
    const cx = boss.x + boss.width / 2;
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? -1 : 1;                 // alternate left/right
      const reach = (8 + Math.floor(i / 2) * 9) * k;     // spread scales with body
      const baseX = cx + side * (boss.width / 2 + reach);
      const sway = CALM ? 0 : Math.sin(frame / 12 + i * 1.7) * 2 * k;
      // 3 stacked segments tapering to a swaying tip — reads as a reaching arm
      tentacleGfx.rect(baseX - 1.5 * k, BOSS_FLOOR - 4 * k, 3 * k, 4 * k).fill(col);
      tentacleGfx.rect(baseX - k + sway * 0.5, BOSS_FLOOR - 8.5 * k, 2 * k, 4.5 * k).fill(col);
      tentacleGfx.rect(baseX - 0.5 * k + sway, BOSS_FLOOR - 12 * k, k, 3.5 * k).fill(col);
    }
  }

  function applyForm(todos, est) {
    const list = Array.isArray(todos) ? todos : [];
    lastTodos = list;
    if (est != null) lastEncEst = est;
    encForm = encounterFormFor(lastEncEst, list.length);
    const alive = list.filter((t) => t.status !== 'completed');
    // 1:1 stage mobs — every rail card has its slime on the field (cap 5),
    // same design (t.form), alive ones standing, killed ones gone
    while (packSprites.length < Math.min(5, list.length)) {
      const s = new PIXI.Sprite(slimeTexFor(packSprites.length));
      s.scale.set(1.5); // rail-matched designs, stage-sized
      s.x = PACK_X[packSprites.length];
      ground(s);
      world.addChild(s);
      packSprites.push(s);
    }
    packSprites.forEach((s, i) => {
      const live = i < list.length && list[i].status !== 'completed';
      s.visible = live;
      if (live) {
        const f = list[i].form || 0;
        if (s._form !== f) { s._form = f; s.texture = slimeTexFor(f); }
        // size is a slime's own attribute (from its seed), not a project metric
        const sc = (window.SlimeDesigns ? SlimeDesigns.designFor(f).scale : 1) || 1;
        s.scale.set(sc * 1.4); // stage-sized
        s._pct = list[i].status === 'in_progress' ? 55 : 100; // pending full, active half-felled
        ground(s);
      }
    });
    // the boss (the quest itself) stays on stage in every form — and stays BIG.
    // It looms up-stage on its dais in every form; the todos are the smaller
    // front-line mobs (Pokemon read). Never shrink the foe just because there
    // are pack mobs — the boss is the threat.
    if (!bossDead) boss.visible = true;
    groundBoss();
    // scale/x are owned by encounter + feeding (tier scale, centered up-stage)
    drawTentacles(alive.length);
  }

  // particle graphics (redrawn each frame)
  const particleGfx = new PIXI.Graphics();
  fxLayer.addChild(particleGfx);

  // ── uiLayer chrome ───────────────────────────────────────────────────────────
  const flashRect = new PIXI.Graphics().rect(0, 0, W, H).fill(0xffffff);
  flashRect.alpha = 0;
  function makeRadial(r, g, b, edgeAlpha) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const grad = ctx.createRadialGradient(160, 90, 60, 160, 90, 185);
    grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},${edgeAlpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    return new PIXI.Sprite(PIXI.Texture.from(cv));
  }
  const vignette = makeRadial(200, 55, 55, 0.55);   // danger (low token)
  const vignetteEdge = makeRadial(232, 132, 44, 0.6); // combo edge flame
  vignette.alpha = 0; vignetteEdge.alpha = 0;
  const letterTop = new PIXI.Graphics().rect(0, 0, W, 24).fill(0x000000);
  const letterBot = new PIXI.Graphics().rect(0, 0, W, 24).fill(0x000000);
  letterTop.y = -24; letterBot.y = H;
  let letterboxOn = false;
  const bigText = new PIXI.Text({ text: '', style: { fontFamily: 'monospace', fontSize: 12,
    fontWeight: 'bold', fill: colorNum(P.gold), align: 'center' } });
  bigText.anchor.set(0.5);
  bigText.x = W / 2; bigText.y = H / 2; bigText.visible = false;
  uiLayer.addChild(flashRect, vignette, vignetteEdge, letterTop, letterBot, bigText);

  let bossBroken = false;
  let lockedTierColor = '#e8e0d0';
  const finishText = new PIXI.Text({ text: '⚔ FINISH ⚔', style: { fontFamily: 'monospace',
    fontSize: 10, fontWeight: 'bold', fill: 0xc83737, align: 'center' } });
  finishText.anchor.set(0.5);
  finishText.x = 238; finishText.y = 100; finishText.visible = false;
  uiLayer.addChild(finishText);
  function setBroken(on) {
    bossBroken = on;
    boss.tint = on ? 0x777777 : 0xffffff;
    packSprites.forEach((s) => { s.tint = on ? 0x777777 : 0xffffff; });
    finishText.visible = on;
    const nameEl = document.getElementById('boss-name');
    if (nameEl) nameEl.style.color = on ? '#777777' : lockedTierColor;
  }

  function colorNum(c) {
    if (typeof c === 'number') return c;
    return parseInt(String(c).replace('#', ''), 16);
  }

  // ── fx state + governor ───────────────────────────────────────────────────────
  let bossDead = false;
  let lastPolledBoss = null; // last boss name seen by applyState — detects a fresh boss in real sessions
  let wasZero = false;       // tracks token===0 transitions for the Zzz floater
  const fx = { shake: 0, shakeAmp: 4, knightLunge: 0, speed: 1, hitstop: 0, particles: [],
    floaters: [], chromaFrames: 0, edgeFlame: 0, slowmoLeft: null, zoom: 1, zoomLeft: null,
    bossFalling: false, type: null };
  const governor = SlimeSeq.createGovernor(3, 60);
  let activeScenes = [];
  let frame = 0;
  let slowmoAcc = 0;

  // ── particles / floaters ──────────────────────────────────────────────────────
  function burst(x, y, color, n) {
    const col = colorNum(color);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      fx.particles.push({ x, y,
        vx: Math.cos(a) * (1 + Math.random()),
        vy: Math.sin(a) * (1 + Math.random()) - 1,
        age: 0, maxAge: 34, color: col });
    }
  }

  function floater(text, x, y, color, size, pop) {
    const t = new PIXI.Text({ text: String(text), style: { fontFamily: 'monospace',
      fontSize: size || 8, fontWeight: 'bold', fill: colorNum(color || P.gold) } });
    if (pop) t.anchor.set(0.5);
    t.x = x; t.y = y;
    fxLayer.addChild(t);
    fx.floaters.push({ node: t, age: 0, maxAge: 48, pop: !!pop });
  }

  // ── FX primitives ─────────────────────────────────────────────────────────────
  const PRIM = {
    flash({ color = '#ffffff', strength = 0.5 } = {}) {
      if (!governor.allow(frame)) return;
      flashRect.tint = colorNum(color);
      flashRect.alpha = CALM ? Math.min(0.25, strength) : strength;
    },
    shake({ amp = 4, frames = 10 } = {}) { if (!CALM) { fx.shake = frames; fx.shakeAmp = amp; } },
    hitstop({ frames: f = 8 } = {}) { if (!CALM) fx.hitstop = f; },
    slowmo({ factor = 0.3, frames: f = 40 } = {}) { fx.speed = factor; fx.slowmoLeft = f; },
    letterbox({ on } = {}) { letterboxOn = !!on; },
    typewriter({ text, y = 60 } = {}) {
      fx.type = { text: String(text || ''), shown: 0 };
      bigText.text = '';
      bigText.y = y; bigText.visible = true;
    },
    bigtext({ text, y = 60 } = {}) {
      fx.type = null;
      bigText.text = String(text || '');
      bigText.y = y; bigText.visible = true;
    },
    hidetext() { bigText.visible = false; bigText.text = ''; fx.type = null; },
    chroma({ frames: f = 20 } = {}) { if (!CALM) fx.chromaFrames = f; },
    zoom({ scale = 1.12, frames: f = 8 } = {}) { if (!CALM) { fx.zoom = scale; fx.zoomLeft = f; } },
    slam() {
      bossDead = false;
      boss.visible = true; groundBoss();
      this.shake({ amp: 4, frames: 12 });
      burst(boss.x + 8, BOSS_FLOOR, P.dark, 14);
    },
    bossdrop() { bossDead = false; boss.visible = true; boss.y = -20; fx.bossFalling = true; },
    bossburst() { bossDead = true; burst(boss.x + boss.width / 2, boss.y + boss.height / 2, P.bone, 26); boss.visible = false; },
    goldrain() {
      for (let i = 0; i < 40; i++) {
        fx.particles.push({ x: Math.random() * W, y: -Math.random() * 20,
          vx: 0, vy: 0.8 + Math.random(), age: 0, maxAge: 160,
          color: colorNum(P.gold), noGravity: true });
      }
    },
    confetti() {
      const cols = [P.gold, P.ember, P.steel, P.green].map(colorNum);
      for (let i = 0; i < 30; i++) {
        fx.particles.push({ x: W / 2 + (Math.random() * 80 - 40), y: 40,
          vx: Math.random() * 2 - 1, vy: -(1 + Math.random() * 1.5),
          age: 0, maxAge: 90, color: cols[i % cols.length] });
      }
    },
    bubbles() {
      for (let i = 0; i < 12; i++) {
        fx.particles.push({ x: 46 + (Math.random() * 8 - 4), y: FLOOR_Y - 10,
          vx: Math.random() * 0.4 - 0.2, vy: -(0.4 + Math.random() * 0.6),
          age: 0, maxAge: 80, color: colorNum(P.green), noGravity: true });
      }
    },
    dim({ on } = {}) { world.alpha = on ? 0.3 : 1; },
    walkforward() { if (CALM) { repaintBackdrop(); dropNextFoe(); return; } fx.walk = { phase: 'out', to: W + 20 }; },
    forgeparticles() { // particles converge on the boss anchor
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        fx.particles.push({ x: 238 + Math.cos(a) * 70, y: 110 + Math.sin(a) * 50,
          vx: -Math.cos(a) * 1.6, vy: -Math.sin(a) * 1.1, age: 0, maxAge: 44, noGravity: true,
          color: colorNum(P.gold) });
      }
    },
  };

  function playScene(steps) { activeScenes.push(SlimeSeq.createTimeline(steps)); }

  // After the victory walk reaches the fresh arena, the next foe drops in — a new
  // look (re-seeded), full HP, falling from the top to slam onto its dais.
  function dropNextFoe() {
    regenBoss('foe-' + frame);
    boss.scale.set(SLIME_MIN_SCALE);
    boss.x = 220 - (SLIME_MIN_SCALE - 1) * 8;
    lastBossPct = 100;
    PRIM.bossdrop();
  }

  // ── token threat helpers ───────────────────────────────────────────────────────
  function bossTierFor(est) {
    if (est == null) return { scale: SLIME_MIN_SCALE, color: '#e8e0d0', label: '' };
    if (est < 45000) return { scale: SLIME_MIN_SCALE, color: '#e8e0d0', label: 'normal' };
    if (est < 120000) return { scale: 3.6, color: '#f0b541', label: 'ELITE' };
    return { scale: 4.4, color: '#c83737', label: 'RAID BOSS' };
  }
  // mirror of scripts/lib/estimate.js fmtTokens (browser has no require)
  function fmtTokensJs(n) { return `≈${Math.round(n / 10000) * 10}k`; }

  // ── cutscene builders ─────────────────────────────────────────────────────────
  function SCENE_BOSS_INTRO(name) {
    return [
      { at: 0,   do: 'letterbox', on: true },
      { at: 0,   do: 'dim', on: true },
      { at: 6,   do: 'typewriter', text: name, y: 60 },
      { at: 50,  do: 'flash', strength: 0.5 },
      { at: 58,  do: 'flash', strength: 0.5 },          // 8 frames after the first: governor drops it (photosensitivity cap) — kept as data intent
      { at: 66,  do: 'dim', on: false },
      { at: 66,  do: 'bossdrop' },                       // falls, slams, shakes, dust
      { at: 110, do: 'hidetext' },
      { at: 110, do: 'letterbox', on: false },
    ];
  }
  const SCENE_VICTORY = () => [
    { at: 0,   do: 'hitstop', frames: 8 },
    { at: 8,   do: 'slowmo', factor: 0.3, frames: 30 },
    { at: 8,   do: 'bossburst' },
    { at: 40,  do: 'flash', strength: 0.6 },
    { at: 44,  do: 'bigtext', text: '🏆 VICTORY 🏆', y: 70 },
    { at: 44,  do: 'goldrain' },
    { at: 60,  do: 'confetti' },
    { at: 200, do: 'hidetext' },
    { at: 206, do: 'walkforward' },   // knight strides on; the area refreshes
  ];
  const SCENE_POTION = [
    { at: 0,  do: 'flash', color: '#6abe30', strength: 0.35 },
    { at: 2,  do: 'bubbles' },
    { at: 10, do: 'bigtext', text: '🧪 mana restored', y: 50 },
    { at: 70, do: 'hidetext' },
  ];
  function SCENE_FORGE(est) {
    const tier = bossTierFor(est);
    return [
      { at: 0,  do: 'dim', on: true },
      { at: 0,  do: 'bigtext', text: '⚒️ FORGING…', y: 50 },
      { at: 4,  do: 'forgeparticles' },
      { at: 40, do: 'flash', strength: 0.4 },
      { at: 40, do: 'bigtext', text: `${fmtTokensJs(est)} tokens · ${tier.label || 'boss'}`, y: 50 },
      { at: 44, do: 'bossdrop' },
      { at: 100, do: 'hidetext' },
      { at: 100, do: 'dim', on: false },
    ];
  }

  // ── render loop ───────────────────────────────────────────────────────────────
  app.ticker.add(() => {
    frame++;
    drawHud();

    // hitstop: freeze world, count down
    if (fx.hitstop > 0) { fx.hitstop--; return; }

    // slow-mo: skip frames per accumulator
    if (fx.slowmoLeft != null) {
      fx.slowmoLeft--;
      if (fx.slowmoLeft <= 0) { fx.slowmoLeft = null; fx.speed = 1; }
      slowmoAcc += fx.speed;
      if (slowmoAcc < 1) return;
      slowmoAcc -= 1;
    }

    // advance scenes as a QUEUE: only the front timeline plays; when it finishes
    // the next begins (it has its own frame counter, so it starts from the top).
    // One cutscene at a time → no overlapping flashes/text.
    if (activeScenes.length) {
      const tl = activeScenes[0];
      for (const step of SlimeSeq.advance(tl)) {
        const fn = step.do && PRIM[step.do];
        if (fn) { try { fn.call(PRIM, step.args || step); } catch {} }
      }
      if (tl.done) activeScenes.shift();
    }

    // flash decay
    if (flashRect.alpha > 0) {
      flashRect.alpha = Math.max(0, flashRect.alpha - (CALM ? 0.03 : 0.08));
    }

    // shake
    if (fx.shake > 0) {
      fx.shake--;
      world.x = (Math.random() * 2 - 1) * fx.shakeAmp;
      world.y = (Math.random() * 2 - 1) * fx.shakeAmp;
    } else { world.x = 0; world.y = 0; }

    // zoom punch (scale whole stage around centre)
    if (fx.zoomLeft != null) {
      fx.zoomLeft--;
      app.stage.pivot.set(W / 2, H / 2);
      app.stage.position.set(W / 2, H / 2);
      app.stage.scale.set(fx.zoom);
      if (fx.zoomLeft <= 0) { fx.zoomLeft = null; fx.zoom = 1; }
    } else {
      app.stage.pivot.set(0, 0);
      app.stage.position.set(0, 0);
      app.stage.scale.set(1);
    }

    // chroma class toggle
    if (fx.chromaFrames > 0) {
      fx.chromaFrames--;
      app.canvas.classList.add('chroma');
    } else {
      app.canvas.classList.remove('chroma');
    }

    // letterbox bars lerp toward target
    const topTarget = letterboxOn ? 0 : -24;
    const botTarget = letterboxOn ? H - 24 : H;
    letterTop.y += (topTarget - letterTop.y) * 0.2;
    letterBot.y += (botTarget - letterBot.y) * 0.2;

    // torch flicker every 8
    if (frame % 8 === 0) torches.forEach((g) => drawTorch(g, (frame / 8) % 2 === 0));

    if (encForm === 'tentacled' && frame % 4 === 0) {
      drawTentacles(lastTodos.filter((t) => t.status !== 'completed').length);
    }

    // knight bob every 30 (boss stays planted — grounded every frame below)
    if (!fx.walk && frame % 30 === 0) {
      knight.y = FLOOR_Y - 14 - (knight.y < FLOOR_Y - 14 ? 0 : 1);
    }

    // boss falling
    if (fx.bossFalling) {
      boss.y += 6;
      if (boss.y >= BOSS_FLOOR - boss.height) { groundBoss(); fx.bossFalling = false; PRIM.slam(); }
    }

    // knight lunge decay
    if (fx.knightLunge > 0) fx.knightLunge = Math.max(0, fx.knightLunge - 1);
    if (fx.walk) {
      // post-victory march: knight strides off the right, the area refreshes,
      // then the knight walks back in from the left — "on to the next quest".
      knight.x += 1.8;
      knight.y = FLOOR_Y - 14 - ((Math.floor(frame / 5) % 2) ? 1 : 0);   // walk bob
      if (fx.walk.phase === 'out' && knight.x >= fx.walk.to) {
        repaintBackdrop();
        knight.x = -16; fx.walk.phase = 'in'; fx.walk.to = 40;
        if (!CALM) PRIM.flash({ color: '#e8e0d0', strength: 0.3 });
      } else if (fx.walk.phase === 'in' && knight.x >= fx.walk.to) {
        knight.x = 40; knight.y = FLOOR_Y - 14; fx.walk = null;
        dropNextFoe();   // the next slime boss drops into the new scene
      }
    } else {
      knight.x = 40 + fx.knightLunge;
    }

    if (!CALM && summons.length && frame % 45 === 0) {
      const su = summons[(frame / 45) % summons.length | 0];
      if (su) su.sprite.x += 8; // lunge
    }
    summons.forEach((su, i) => { const home = 60 + i * 14; if (su.sprite.x > home) su.sprite.x -= 1; }); // settle back

    // feeding scale tween
    if (bossScaleTarget != null) {
      const s = boss.scale.x + (bossScaleTarget - boss.scale.x) * 0.06;
      boss.scale.set(s);
      boss.x = 220 - (s - 1) * 8;
      groundBoss(bossBroken ? 3 : 0);
      if (Math.abs(s - bossScaleTarget) < 0.01) { boss.scale.set(bossScaleTarget); bossScaleTarget = null; }
    }

    // slime squash-stretch: feet stay planted, body breathes (CALM: no breathe).
    // Grounded EVERY frame in every state (except the intro fall) so the slime is
    // always standing on the floor.
    if (boss.visible && !fx.bossFalling) {
      boss.scale.y = CALM ? boss.scale.x : boss.scale.x * (1 + Math.sin(frame / 9) * 0.05);
      groundBoss(bossBroken ? 3 : 0);
    }
    if (!CALM) {
      for (let i = 0; i < packSprites.length; i++) {
        const s = packSprites[i];
        if (!s.visible) continue;
        s.scale.y = s.scale.x * (1 + Math.sin(frame / 9 + i * 1.3) * 0.06);
        ground(s);
      }
    }

    // parallax
    bgNear.x = (bgNear.x - 0.05) % W;
    bgFar.x = (bgFar.x - 0.02) % W;

    // sci-fi / AI things drifting across the sky
    updateSky();

    // typewriter
    if (fx.type) {
      if (frame % 3 === 0 && fx.type.shown < fx.type.text.length) {
        fx.type.shown++;
        bigText.text = fx.type.text.slice(0, fx.type.shown);
      }
    }


    // particles
    particleGfx.clear();
    fx.particles = fx.particles.filter((p) => {
      p.age++;
      p.x += p.vx;
      p.y += p.vy;
      if (!p.noGravity) p.vy += 0.15;
      const alpha = Math.max(0, 1 - p.age / p.maxAge);
      particleGfx.rect(Math.round(p.x), Math.round(p.y), 2, 2).fill({ color: p.color, alpha });
      return p.age < p.maxAge && p.y < H + 10;
    });

    // floaters
    fx.floaters = fx.floaters.filter((f) => {
      f.age++;
      f.node.y -= 0.4;
      f.node.alpha = Math.max(0, 1 - f.age / f.maxAge);
      if (f.pop) {
        const s = f.age < 0.2 * f.maxAge
          ? (f.age / (0.2 * f.maxAge)) * 1.3
          : 1 + 0.3 * (1 - f.age / f.maxAge);
        f.node.scale.set(s);
      }
      if (f.age >= f.maxAge) { fxLayer.removeChild(f.node); f.node.destroy(); return false; }
      return true;
    });

    // edge flame (combo)
    vignetteEdge.alpha = fx.edgeFlame ? 0.25 + Math.sin(frame / 10) * 0.15 : 0;

    if (finishText.visible) {
      finishText.alpha = CALM ? 1 : 0.6 + Math.sin(frame / 8) * 0.4;
      finishText.x = boss.x + boss.width / 2;
      finishText.y = Math.max(10, boss.y - 10);
    }

    // danger pulse (low token)
    if (stats.token != null && stats.token > 0 && stats.token < 30) {
      const amp = CALM ? 0.05 : 0.25;
      vignette.alpha = 0.2 + Math.sin(frame / 12) * amp;
      if (frame % 40 === 0) PRIM.shake({ amp: 1, frames: 4 }); // CALM-gated inside PRIM.shake
    } else {
      vignette.alpha = 0;
    }
  });

  // ── DOM: log ─────────────────────────────────────────────────────────
  // Boss HP lives only on the canvas (the pip bar over the boss sprite) and the
  // Boss Nameplate — the old title-bar pip strip was removed.

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  const logEl = document.getElementById('log');
  const logLines = [];
  function pushLog(text) {
    if (!text) return;
    logLines.push(String(text).slice(0, 120));
    if (logLines.length > 6) logLines.shift();
    logEl.innerHTML = logLines.map((l, i) => {
      const fresh = i === logLines.length - 1;
      return `<div class="log-line" style="${fresh ? '' : 'opacity:1;animation:none'}">${escHtml(l)}</div>`;
    }).join('');
  }

  // ── state polling ─────────────────────────────────────────────────────────────
  const stats = { token: null };
  let lastCost = null;
  function modelBadge(name) {
    const n = String(name || '');
    if (/opus/i.test(n)) return '⭐ ' + n;
    if (/sonnet/i.test(n)) return '🔷 ' + n;
    if (/haiku/i.test(n)) return '🗡️ ' + n;
    return n;
  }
  function fmtDuration(ms) {
    const s = Math.round(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  }
  function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
  /** one meter row: value text + a 0–100% fill bar. color drives the CSS
   *  gradient + glow via the --c custom property (LoL-style energy bar). */
  function setMeter(id, pct, valText, color) {
    setText(id, valText);
    const f = document.getElementById(id + '-fill');
    if (f) {
      f.style.width = (pct != null ? Math.max(0, Math.min(100, pct)) : 0) + '%';
      if (color) f.style.setProperty('--c', color);
    }
  }
  // top status window: numeric meters + categorical state (the actor badge).
  // Narrative action text lives in the battle log, not here.
  //   Dtk  = daily token (5h rate window) left %    · Dtk CD = minutes to reset (window 300m)
  //   Wtk  = weekly token (7-day window) left %      · Wtk CD = hours to reset (window 168h)
  //   Ctx  = context window used %
  function setUserStatus(data) {
    const usage = data && data.usage;

    const now = Date.now();
    const left = (used) => typeof used === 'number' ? Math.max(0, Math.round(100 - used)) : null;
    const fh = usage && usage.fiveHour, wk = usage && usage.sevenDay;

    // Dtk — daily (5h) token left; low is bad.
    const dtk = left(fh && fh.used);
    setMeter('us-dtk', dtk, dtk != null ? dtk + '%' : '—', dtk != null && dtk < 30 ? '#e8842c' : '#6abe30');
    // Dtk CD — minutes until the 5h window resets (bar = fraction of 300m left).
    let dtkMin = null;
    if (fh && fh.resetsAt) { const m = (fh.resetsAt * 1000 - now) / 60000; if (m > 0) dtkMin = Math.round(m); }
    setMeter('us-dtkcd', dtkMin != null ? (dtkMin / 300) * 100 : null, dtkMin != null ? dtkMin + 'm' : '—', '#46b3c9');

    // Wtk — weekly (7-day) token left; low is bad.
    const wtk = left(wk && wk.used);
    setMeter('us-wtk', wtk, wtk != null ? wtk + '%' : '—', wtk != null && wtk < 30 ? '#e8842c' : '#6abe30');
    // Wtk CD — hours until the weekly window resets (bar = fraction of 168h left).
    let wtkHr = null;
    if (wk && wk.resetsAt) { const h = (wk.resetsAt * 1000 - now) / 3600000; if (h > 0) wtkHr = Math.round(h); }
    setMeter('us-wtkcd', wtkHr != null ? (wtkHr / 168) * 100 : null, wtkHr != null ? wtkHr + 'h' : '—', '#46b3c9');

    // Ctx — context window used; high is bad.
    const ctx = usage && typeof usage.contextPct === 'number' ? Math.round(usage.contextPct) : null;
    setMeter('us-ctx', ctx, ctx != null ? ctx + '%' : '—', ctx != null && ctx > 80 ? '#e8842c' : '#7fa8c0');

    // 游戏进程 — live RPG counters from the snapshot (boss HP shows on canvas).
    const s = data && data.snapshot;
    setText('pg-turn', s ? String(s.turn || 0) : '—');
    // Pace — average wall-clock time per turn (session duration ÷ turns).
    const dur = usage && typeof usage.durationMs === 'number' ? usage.durationMs : null;
    setText('ttime', (dur != null && s && s.turn > 0) ? fmtDuration(Math.round(dur / s.turn)) : '—');
    setText('pg-combo', s ? '×' + (s.combo || 0) : '—');
    setText('pg-kills', s ? String(s.kills || 0) : '—');
    setText('pg-dmg', s ? String(s.dmg || 0) : '—');
    setText('pg-summons', s ? '×' + (s.summons || 0) : '—');
  }

  // hover titles for every chrome icon — single language, picked from /state lang
  const TITLES = {
    en: { title: 'Slime — your coding session as an RPG', boss: 'The current quest (boss)',
      hp: 'Boss HP', token: 'Token — 5h rate window left',
      gold: 'Gold — real session cost (USD)', weapon: 'Weapon — current model',
      atk: 'ATK — lines added/removed', timer: 'Session time', stamina: 'Camp — weekly quota left',
      rail: 'Minions — your todo list', calm: 'Flash / calm toggle', help: 'Game guide (h)' },
    zh: { title: 'Slime — 把写码变成 RPG', boss: '当前任务(Boss)',
      hp: 'Boss 血量', token: 'Token — 5 小时窗口余量',
      gold: '金币 — 本会话真实花费(美元)', weapon: '武器 — 当前模型',
      atk: '攻击 — 增/删行数', timer: '本会话时长', stamina: '营地 — 周配额余量',
      rail: '小怪 — 你的 todo 列表', calm: '闪烁/舒缓 开关', help: '游戏说明 (h)' },
  };
  let titlesApplied = '';
  let lastDataLang = 'en'; // current display language (from /state) — the lang button toggles it
  function applyTitles(lang) {
    const l = lang === 'zh' ? 'zh' : 'en';
    if (titlesApplied === l) return;
    titlesApplied = l;
    const T = TITLES[l];
    const set = (id, t, onParent) => {
      const el = document.getElementById(id);
      if (el) (onParent ? el.parentElement : el).title = t;
    };
    set('title', T.title); set('boss-name', T.boss);
    // stats/progress rows carry their own static title= tooltips (game name + meaning).
    set('minion-rail', T.rail); set('calm-btn', T.calm); set('help-btn', T.help);
  }

  function applyState(data) {
    if (!data) return;
    lastDataLang = data.lang || lastDataLang;
    applyTitles(data.lang);
    const snap = data.snapshot;

    // boss snapshot
    if (snap) {
      if (window.SlimeMinions) SlimeMinions.render(snap.todos);
      // a fresh boss → reseed its whole look from its NAME (revives the sprite too,
      // in case a victory cutscene hid it and no intro fired to reset bossDead)
      if (snap.boss && snap.boss.name && snap.boss.name !== lastPolledBoss) {
        lastPolledBoss = snap.boss.name;
        bossDead = false;
        regenBoss(snap.boss.name);
      }
      // form/size driven by the boss's own identity, never the token estimate
      applyForm(snap.todos, bossAppearanceEst());
      hideOverlay();
      if (!bossDead && encForm !== 'pack') boss.visible = true;
      if (snap.boss && snap.boss.name) setText('boss-name', snap.boss.name);
      let pct = null;
      if (snap.boss && typeof snap.boss.hpPct === 'number') pct = snap.boss.hpPct;
      else if (snap.boss && typeof snap.boss.hp === 'number') pct = snap.boss.hp;
      if (pct != null) {
        lastBossPct = pct;
        // boss keeps its species look AND its size; HP only shows on the bar.
      }
      if (snap.boss && typeof snap.boss.broken === 'boolean' && snap.boss.broken !== bossBroken) setBroken(snap.boss.broken);
    } else {
      if (window.SlimeMinions) SlimeMinions.render([]);
      showOverlay('waiting for a session…');
      boss.visible = false;
      setText('boss-name', '—');
    }

    // usage → stats panel
    const u = data.usage;
    if (u) {
      let token = null;
      if (u.fiveHour && typeof u.fiveHour.used === 'number') {
        token = Math.max(0, Math.round(100 - u.fiveHour.used));
      }
      stats.token = token;
      // Dtk/Wtk meters (daily+weekly token, each with a CD row) + Ctx are all
      // rendered from data.usage in setUserStatus().

      if (typeof u.cost === 'number') {
        const goldEl = document.getElementById('gold');
        if (goldEl) {
          goldEl.textContent = `$${u.cost.toFixed(2)}`;
          if (lastCost != null && u.cost > lastCost) {
            goldEl.classList.remove('gold-tick');
            void goldEl.offsetWidth; // restart animation
            goldEl.classList.add('gold-tick');
            burst(40, 30, P.gold, 6);
          }
        }
        lastCost = u.cost;
      }

      if (u.model) setText('weapon', modelBadge(u.model));
      if (u.lines) setText('atk', `+${u.lines.added || 0} / −${u.lines.removed || 0}`);
      if (typeof u.durationMs === 'number') setText('timer', fmtDuration(u.durationMs));

      // grayscale when out of tokens + a one-shot Zzz on the zero transition
      if (token === 0) {
        app.canvas.classList.add('gray');
        if (!wasZero) { floater('💤', knight.x + 6, knight.y - 8, P.steel, 14, true); wasZero = true; }
      } else {
        app.canvas.classList.remove('gray');
        wasZero = false;
      }
    }
    setUserStatus(data);
  }
  async function pollState() {
    try { const r = await fetch('/state'); if (r.ok) applyState(await r.json()); } catch {}
  }
  pollState();
  setInterval(pollState, 5000);

  // ── SSE events ────────────────────────────────────────────────────────────────
  const EXTRA_HANDLERS = [];
  window.SlimeArena = { playScene, PRIM, fx, pushLog, floater, stats, on: (fn) => EXTRA_HANDLERS.push(fn) };

  function onCombo(combo, dmg) {
    fx.edgeFlame = combo >= 5 ? 1 : 0;
    if (combo >= 10) { PRIM.chroma({ frames: 12 }); PRIM.zoom({ scale: 1.1, frames: 6 }); }
    if (dmg >= 50) burst(160, 90, P.steel, 14);
  }

  function handleEvent(ev) {
    let d; try { d = JSON.parse(ev.data); } catch { return; }
    if (!d || !d.kind) return;

    if (d.kind === 'cast') { fx.knightLunge = 6; pushLog(d.text);
      if (/\b(Agent|Task)\b/.test(d.tool || '') || /召唤|派遣|summon/i.test(d.text || '')) spawnSummon();
    }
    if (d.kind === 'resolve') {
      const bx = boss.x + boss.width / 2; // anchor hit FX to the boss, not a fixed pixel
      if (typeof d.dmg === 'number' && d.dmg > 0) {
        floater(`-${d.dmg}`, bx - 8, 110, P.gold);
        PRIM.shake({ amp: 3, frames: 6 });
        if (d.combo && d.combo > 1) floater(`×${d.combo}`, bx + 12, 100, P.ember, 9, true);
        onCombo(d.combo || 0, d.dmg);
      }
      if (d.kill) { // execution: freeze-frame punch + splat + reward sparkle
        PRIM.hitstop({ frames: 6 }); PRIM.shake({ amp: 3, frames: 7 });
        burst(bx, 125, P.red, 9); burst(bx, 125, P.bone, 9);
        PRIM.flash({ strength: 0.45 });
        floater('SLAIN', bx, 108, P.red, 9, true);
        floater('✦', bx, 96, P.gold, 10, true);
      }
      if (d.hit) { PRIM.flash({ color: '#c83737', strength: 0.35 }); onCombo(0, 0); }
      if (d.text) pushLog(d.text);
    }
    if (d.kind === 'turn_end') {
      clearSummons();
      const line = (d.text || '').split('\n')[0];
      if (line) {
        setScene('settle');
        PRIM.letterbox({ on: true });
        PRIM.bigtext({ text: line.slice(0, 40), y: H / 2 });
        setTimeout(() => { PRIM.hidetext(); PRIM.letterbox({ on: false }); setScene('battle'); }, 2000);
        pushLog(line);
      }
    }
    if (d.kind === 'loot_drop') {
      const cx = boss.x + boss.width / 2;
      floater(`+${d.xp} XP`, cx, 100, P.gold, 10, true);
      floater('✨', cx, 88, P.gold, 11, true);
      if (!CALM && d.fx === 'burst') burst(cx, 112, P.gold, 9);
      if (d.text) pushLog(d.text);
    }
    EXTRA_HANDLERS.forEach((h) => { try { h(d); } catch {} });
  }

  function connectEvents() {
    let es;
    try {
      es = new EventSource('/events');
      es.onmessage = handleEvent;
      es.onerror = () => { es.close(); setTimeout(connectEvents, 3000); };
    } catch {}
  }
  connectEvents();

  // ── scene system: 'battle' | 'feeding' | 'settle' ─────────────────────────────
  let scene = 'battle';
  let bossScaleTarget = null; // feeding growth tween target (pre-engage baby slime only)
  let lastFedEst = null;
  // Boss battle size is fixed per tier (>= SLIME_MIN_SCALE = 3× the knight), set
  // once on appear; HP no longer resizes it. The boss towers up-stage on its dais.
  function setScene(next) {
    if (scene === next) return;
    scene = next;
    const counter = document.getElementById('feed-counter');
    if (next === 'feeding') {
      PRIM.dim({ on: true });
      // baby slime: if no engaged boss yet, show the boss sprite tiny — it IS the creature being fed
      if (!engagedBoss) { bossDead = false; boss.visible = true; boss.scale.set(0.5); boss.x = 220 + 8; groundBoss(); }
      if (counter) counter.style.display = 'block';
    } else {
      PRIM.dim({ on: false });
      if (counter) counter.style.display = 'none';
      if (next === 'battle') { lastFedEst = null; }
    }
  }
  function feedBeat(est, small) {
    setScene('feeding');
    const tier = bossTierFor(est);
    bossScaleTarget = small ? Math.min((boss.scale.x || 0.5) + 0.06, tier.scale) : tier.scale;
    const delta = !small && lastFedEst != null ? est - lastFedEst : null;
    if (!small) lastFedEst = est;
    const counter = document.getElementById('feed-counter');
    if (counter && est != null) {
      counter.textContent = `≈${fmtTokensJs(est).slice(1)} tokens${tier.label && tier.label !== 'normal' ? ' · ' + tier.label : ''}`;
    }
    if (delta && delta > 0) floater(`+${fmtTokensJs(delta)}`, boss.x + 8, boss.y - 10, P.gold, 9, true);
    if (CALM) { boss.scale.set(bossScaleTarget); groundBoss(); bossScaleTarget = null; return; }
    // morsel arc: knight → slime
    const n = small ? 3 : 6;
    for (let i = 0; i < n; i++) {
      fx.particles.push({ x: knight.x + 10, y: knight.y + 4,
        vx: 2.2 + i * 0.15, vy: -2 - i * 0.1, age: 0, maxAge: 60, color: colorNum(P.gold) });
    }
    PRIM.zoom({ scale: 1.04, frames: 6 }); // munch wobble
  }

  let pendingEst = null;
  let engagedBoss = null;
  let minionStreak = 0;
  let lastMinionKill = 0;
  /** Map a battle event to a sound (no-op when muted / audio absent). */
  function audioFor(d) {
    const A = window.SlimeAudio;
    if (!A) return;                 // play()/startBgm() self-gate on the sfx/music toggles
    switch (d.kind) {
      case 'encounter': A.play('encounter'); A.startBgm(); break;
      case 'resolve': A.play(d.kill ? 'kill' : (d.combo >= 10 ? 'crit' : 'hit')); break;
      case 'minion_down': A.play('kill'); break;
      case 'boss_broken': A.play('crit'); break;
      case 'boss_down': A.play('victory'); break;
      case 'ultimate': A.play('ultimate'); break;
      case 'level_up': A.play('levelup'); break;
      case 'badge_unlocked': A.play('badge'); break;
      case 'quest_done': A.play('quest'); break;
      case 'choice_open': case 'choice_made': A.play('choice'); break;
      case 'cast': if (d.tool === 'Agent') A.play('summon'); break;
      case 'potion': A.play('potion'); break;
      case 'loot_drop': A.play('loot'); break;
      default: break;
    }
  }
  SlimeArena.on((d) => {
    audioFor(d);
    if (d.kind === 'encounter') {
      const isNew = d.bossName && d.bossName !== engagedBoss;
      if (isNew) {
        setScene('battle');
        engagedBoss = d.bossName;
        if (fx.walk) { fx.walk = null; knight.x = 40; knight.y = FLOOR_Y - 14; } // cancel any victory stroll
        hideOverlay();
        regenBoss(d.bossName);                 // seed the look from the boss's name
        const est = bossAppearanceEst();        // size/form/tier from identity, not tokens
        const tier = bossTierFor(est);
        boss.scale.set(tier.scale); boss.x = 220 - (tier.scale - 1) * 8; groundBoss(); bossScaleTarget = null; // appear at full size, then constant
        applyForm(lastTodos, est);
        lockedTierColor = tier.color;
        document.getElementById('boss-name').style.color = tier.color;
        setBroken(false);
        if (d.bossName) {
          const label = tier.label && tier.label !== 'normal' ? ` · ${tier.label}` : '';
          setText('boss-name', `${d.bossName}${label}`);
        }
        playScene(SCENE_BOSS_INTRO(d.bossName || 'A NEW FOE'));
      }
      if (d.text) pushLog(d.text);
    }
    if (d.kind === 'boss_down') { clearSummons(); setScene('battle'); engagedBoss = null; setBroken(false); packSprites.forEach((s) => { s.visible = false; }); tentacleGfx.clear(); playScene(SCENE_VICTORY()); if (d.text) pushLog(d.text); }
    if (d.kind === 'potion') { playScene(SCENE_POTION); if (d.text) pushLog(d.text); }
    if (d.kind === 'boss_broken') { setBroken(true); PRIM.shake({ amp: 2, frames: 8 }); if (d.text) pushLog(d.text); }
    // progression payoffs — each gets its own colour/word so they read as distinct
    // wins (sound is differentiated in audioFor). Floaters are flash-safe; the
    // sparkle burst is CALM-gated. Anchored to the boss so coords track the stage.
    if (d.kind === 'level_up' || d.kind === 'badge_unlocked' || d.kind === 'quest_done') {
      const cx = boss.x + boss.width / 2;
      const pop = d.kind === 'level_up' ? ['LEVEL UP!', P.gold]
        : d.kind === 'badge_unlocked' ? ['🏅 BADGE', P.steel]
        : ['🎯 QUEST!', P.ember];
      floater(pop[0], cx, 70, pop[1], 12, true);
      if (!CALM) burst(cx, 82, pop[1], 10);
      if (d.text) pushLog(d.text);
    }
    if (d.kind === 'ultimate') {
      playScene([
        { at: 0,  do: 'letterbox', on: true },
        { at: 0,  do: 'slowmo', factor: 0.3, frames: 30 },
        { at: 4,  do: 'bigtext', text: '⚡ ULTIMATE ⚡', y: 60 },
        { at: 8,  do: 'flash', strength: 0.6 },
        { at: 10, do: 'shake', amp: 6, frames: 14 },
        { at: 60, do: 'hidetext' },
        { at: 60, do: 'letterbox', on: false },
      ]);
      if (d.text) pushLog(d.text);
    }
    if (d.kind === 'minion_down') {
      if (window.SlimeMinions) SlimeMinions.kill(d.minion, CALM);
      {
        // 1:1 with the rail: pop the slime whose label matches the kill
        const idx = lastTodos.findIndex((t) => t.label === d.minion);
        const s = idx >= 0 ? packSprites[idx] : null;
        if (s && s.visible) {
          // execution: punch-freeze, slime splat + shards, and a reward sparkle
          PRIM.hitstop({ frames: 6 }); PRIM.shake({ amp: 2, frames: 6 });
          burst(s.x + s.width / 2, s.y + s.height / 2, P.red, 10);
          burst(s.x + s.width / 2, s.y + s.height / 2, P.bone, 12);
          floater(d.count ? `✦×${d.count}` : '✦', s.x + s.width / 2, s.y - 6, P.gold, 10, true);
          s.visible = false;
        } else {
          PRIM.hitstop({ frames: 5 });
          burst(boss.x + boss.width / 2, BOSS_FLOOR - 6, P.red, d.count ? 16 : 8);
          burst(boss.x + boss.width / 2, BOSS_FLOOR - 6, P.bone, d.count ? 18 : 8);
          floater(d.count ? `✦×${d.count}` : '✦', boss.x + boss.width / 2, BOSS_FLOOR - 18, P.gold, 10, true);
        }
        if (encForm === 'tentacled') drawTentacles(Math.max(0, lastTodos.filter((t) => t.status !== 'completed').length - 1));
      }
      PRIM.flash({ strength: 0.35 });
      minionStreak = (d.count || 1) + (Date.now() - lastMinionKill < 8000 ? minionStreak : 0);
      lastMinionKill = Date.now();
      if (minionStreak >= 2) {
        PRIM.bigtext({ text: `COMBO ×${minionStreak}`, y: 50 });
        setTimeout(() => PRIM.hidetext(), 1400);
      }
      if (d.text) pushLog(d.text);
    }
  });

  const choiceEl = document.getElementById('choice-overlay');
  const planEl = document.getElementById('plan-overlay');
  let planTypeTimer = null;
  let overlayCloseTimer = null;
  function openChoices(questions) {
    if (overlayCloseTimer !== null) { clearTimeout(overlayCloseTimer); overlayCloseTimer = null; }
    PRIM.dim({ on: true }); PRIM.letterbox({ on: true });
    choiceEl.innerHTML = '';
    const q = questions[0] || { q: '', opts: [] };
    const title = document.createElement('div');
    title.style.cssText = 'color:#f0b541;font-size:11px;margin-bottom:6px;text-shadow:1px 1px #000';
    title.textContent = `❓ ${q.q}`;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:center;flex-wrap:wrap';
    for (const opt of q.opts) {
      const card = document.createElement('div');
      card.className = 'skill-card';
      card.textContent = `✨ ${opt}`;
      row.appendChild(card);
    }
    choiceEl.append(title, row);
    choiceEl.style.display = 'flex';
  }
  function resolveChoices(chosen) {
    const cards = [...choiceEl.querySelectorAll('.skill-card')];
    for (const card of cards) {
      const label = card.textContent.replace(/^✨ /, '');
      if (chosen.includes(label)) card.classList.add('chosen');
      else card.classList.add('burn');
    }
    fx.knightLunge = 6; PRIM.flash({ strength: 0.4 });
    if (overlayCloseTimer !== null) { clearTimeout(overlayCloseTimer); overlayCloseTimer = null; }
    overlayCloseTimer = setTimeout(closeOverlays, 1200);
  }
  function openPlan(plan) {
    if (overlayCloseTimer !== null) { clearTimeout(overlayCloseTimer); overlayCloseTimer = null; }
    PRIM.dim({ on: true });
    planEl.innerHTML = '';
    const pre = document.createElement('pre');
    planEl.appendChild(pre); planEl.style.display = 'flex';
    let i = 0;
    planTypeTimer = setInterval(() => { pre.textContent = plan.slice(0, i += 4); if (i >= plan.length) { clearInterval(planTypeTimer); planTypeTimer = null; } }, 16);
  }
  function approvePlan() {
    const seal = document.createElement('div');
    seal.textContent = '🔴 APPROVED';
    seal.style.cssText = 'color:#c83737;font-weight:bold;font-size:13px;transform:rotate(-12deg);margin-top:-20px';
    planEl.appendChild(seal);
    PRIM.flash({ strength: 0.3 });
    if (overlayCloseTimer !== null) { clearTimeout(overlayCloseTimer); overlayCloseTimer = null; }
    overlayCloseTimer = setTimeout(closeOverlays, 1500);
  }
  function closeOverlays() {
    if (overlayCloseTimer !== null) { clearTimeout(overlayCloseTimer); overlayCloseTimer = null; }
    if (planTypeTimer !== null) { clearInterval(planTypeTimer); planTypeTimer = null; }
    choiceEl.style.display = 'none'; planEl.style.display = 'none';
    PRIM.dim({ on: false }); PRIM.letterbox({ on: false });
  }
  SlimeArena.on((d) => {
    if (d.kind === 'choice_open') { setScene('feeding'); openChoices(d.questions || []); }
    if (d.kind === 'choice_made') {
      resolveChoices(d.chosen || []);
      if (scene === 'feeding') feedBeat(lastFedEst, true); // Q&A morsel: small grow toward current target
    }
    if (d.kind === 'plan_scroll') {
      openPlan(d.plan || '');
      if (d.est != null) { pendingEst = d.est; feedBeat(d.est, false); }
    }
    if (d.kind === 'plan_approved') {
      approvePlan();
      lastFedEst = null;
      if (pendingEst != null) {
        const tier = bossTierFor(pendingEst);
        lastEncEst = pendingEst; // the approved plan re-rates the threat
        lockedTierColor = tier.color;
        const nameEl = document.getElementById('boss-name');
        if (nameEl && !bossBroken) nameEl.style.color = tier.color;
        playScene(SCENE_FORGE(pendingEst));
        pendingEst = null;
      }
      setScene('battle');
    }
  });

  // ── game guide ────────────────────────────────────────────────────────────────
  const guideEl = document.getElementById('guide-overlay');
  function toggleGuide(force) {
    if (!guideEl) return;
    const show = force != null ? force : guideEl.style.display !== 'flex';
    guideEl.style.display = show ? 'flex' : 'none';
  }
  const calmBtn = document.getElementById('calm-btn');
  if (calmBtn) {
    if (CALM) calmBtn.style.borderColor = '#f0b541';
    calmBtn.addEventListener('click', () => {
      const sp = new URLSearchParams(location.search);
      if (sp.has('calm')) sp.delete('calm'); else sp.set('calm', '1');
      location.search = sp.toString();
    });
  }
  const A = window.SlimeAudio;
  const musicBtn = document.getElementById('music-btn');
  if (musicBtn && A) {
    const sync = () => { musicBtn.style.opacity = A.isMusicOn() ? '1' : '0.5'; musicBtn.style.borderColor = A.isMusicOn() ? '#f0b541' : ''; musicBtn.title = A.isMusicOn() ? 'music on' : 'music off'; };
    sync();
    musicBtn.addEventListener('click', async () => { A.unlock(); await A.setMusic(!A.isMusicOn()); sync(); });
  }
  const sfxBtn = document.getElementById('sfx-btn');
  if (sfxBtn && A) {
    const sync = () => { sfxBtn.style.opacity = A.isSfxOn() ? '1' : '0.5'; sfxBtn.style.borderColor = A.isSfxOn() ? '#f0b541' : ''; sfxBtn.title = A.isSfxOn() ? 'sound effects on' : 'sound effects off'; };
    sync();
    sfxBtn.addEventListener('click', async () => { A.unlock(); await A.setSfx(!A.isSfxOn()); A.play('ui'); sync(); });
  }
  const dayBtn = document.getElementById('day-btn');
  if (dayBtn) {
    dayBtn.textContent = DAY ? '☀️' : '🌙';
    dayBtn.title = DAY ? 'switch to night (dark)' : 'switch to day (light)';
    dayBtn.addEventListener('click', () => {
      try { if (DAY) localStorage.removeItem('slimeDay'); else localStorage.setItem('slimeDay', '1'); } catch {}
      location.reload();
    });
  }
  const langBtn = document.getElementById('lang-btn');
  if (langBtn) langBtn.addEventListener('click', async () => {
    const next = lastDataLang === 'zh' ? 'en' : 'zh'; // global toggle via config.json
    try { await fetch('/set-lang?lang=' + next, { method: 'POST' }); } catch {}
    location.reload();
  });
  const helpBtn = document.getElementById('help-btn');
  if (helpBtn) helpBtn.addEventListener('click', () => toggleGuide());
  if (guideEl) guideEl.addEventListener('click', () => toggleGuide(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'h') toggleGuide();
    if (e.key === 'Escape') toggleGuide(false);
  });
})();
