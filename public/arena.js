'use strict';
/* Slime Arena on PixiJS. Read-only viewer: SSE events + /state polling.
   Cutscene steps are data; FX primitives interpret them (Task 9 adds scenes). */
(async function () {
  const CALM = new URLSearchParams(location.search).has('calm')
    || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (CALM) document.body.classList.add('calm');

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
  try { await app.init({ width: W, height: H, background: P.bg, antialias: false }); }
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

  const floorBar = new PIXI.Graphics().rect(0, FLOOR_Y, W, 3).fill(P.floor);
  world.addChild(floorBar);

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

  let bossHpTier = null; // 'hi' | 'mid' | 'lo'
  let lastBossPct = 100; // cached for tentacle tinting
  const bossTex = { hi: null, mid: null, lo: null };
  function bossTexFor(pct) {
    const tier = pct > 60 ? 'hi' : pct > 30 ? 'mid' : 'lo';
    if (!bossTex[tier]) bossTex[tier] = texFromMatrix(BOSS, bossColors(pct));
    return { tier, tex: bossTex[tier] };
  }
  const boss = new PIXI.Sprite(bossTexFor(100).tex);
  boss.x = 220; boss.y = FLOOR_Y - 14;
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
  // map the seed onto the threat-tier range so size/form/tier vary by identity, not tokens
  function bossAppearanceEst() { return bossSeed % 320000; }

  // ── on-stage HP bars (boss + every live mob) + a player HUD above the knight ──
  const hpBars = new PIXI.Graphics();
  const playerHud = new PIXI.Text({ text: '', style: {
    fontFamily: 'monospace', fontSize: 9, fontWeight: 'bold', fill: 0xf0b541,
    stroke: { color: 0x000000, width: 3 }, align: 'center',
  } });
  playerHud.resolution = 3;       // crisp at the canvas's pixelated upscale
  playerHud.anchor.set(0.5, 1);
  world.addChild(hpBars, playerHud);
  /** tiny HP pip above a sprite: bg track + colored fill */
  function drawBar(g, cx, topY, pct) {
    const w = 14, h = 2, x = cx - w / 2;
    const p = Math.max(0, Math.min(100, pct));
    g.rect(x, topY, w, h).fill(0x1a1d24);
    const col = p > 50 ? 0x6abe30 : p > 20 ? 0xf0b541 : 0xc83737;
    if (p > 0) g.rect(x, topY, (w * p) / 100, h).fill(col);
  }
  function drawHud() {
    hpBars.clear();
    if (boss.visible && !bossDead) drawBar(hpBars, boss.x + boss.width / 2, boss.y - 3, lastBossPct);
    packSprites.forEach((s) => { if (s.visible) drawBar(hpBars, s.x + s.width / 2, s.y - 3, s._pct != null ? s._pct : 100); });
    // re-add keeps the bars/text above pack sprites that get addChild'd later
    world.addChild(hpBars, playerHud);
    playerHud.x = knight.x + knight.width / 2;
    playerHud.y = knight.y - 3;
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
      tentacleGfx.rect(baseX - 1.5 * k, FLOOR_Y - 4 * k, 3 * k, 4 * k).fill(col);
      tentacleGfx.rect(baseX - k + sway * 0.5, FLOOR_Y - 8.5 * k, 2 * k, 4.5 * k).fill(col);
      tentacleGfx.rect(baseX - 0.5 * k + sway, FLOOR_Y - 12 * k, k, 3.5 * k).fill(col);
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
    // the boss (the quest itself) stays on stage in every form
    if (!bossDead) boss.visible = true;
    if (encForm === 'mini' || encForm === 'pack') { boss.scale.set(0.85); boss.x = 252; ground(boss); }
    // 'big'/'tentacled' keep tier scale (encounter/feeding own it)
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
    bossFalling: false, type: null, charge: null };
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
      boss.visible = true; boss.y = FLOOR_Y - 14;
      this.shake({ amp: 4, frames: 12 });
      burst(boss.x + 8, FLOOR_Y, P.dark, 14);
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
    chargebar() { fx.charge = { pct: 0 }; }, // render loop advances ~2%/frame → updateBossHpBar
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

  // ── token threat helpers ───────────────────────────────────────────────────────
  function bossTierFor(est) {
    if (est == null) return { scale: 1, color: '#e8e0d0', label: '' };
    if (est < 45000) return { scale: 1, color: '#e8e0d0', label: 'normal' };
    if (est < 120000) return { scale: 1.25, color: '#f0b541', label: 'ELITE' };
    return { scale: 1.5, color: '#c83737', label: 'RAID BOSS' };
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
  const SCENE_VICTORY = (name) => [
    { at: 0,   do: 'hitstop', frames: 8 },
    { at: 8,   do: 'slowmo', factor: 0.3, frames: 30 },
    { at: 8,   do: 'bossburst' },
    { at: 40,  do: 'flash', strength: 0.6 },
    { at: 44,  do: 'bigtext', text: '🏆 VICTORY 🏆', y: 70 },
    { at: 44,  do: 'goldrain' },
    { at: 60,  do: 'confetti' },
    { at: 200, do: 'hidetext' },
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
      { at: 44, do: 'chargebar' },
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

    // advance scenes → dispatch due steps
    if (activeScenes.length) {
      for (const tl of activeScenes) {
        for (const step of SlimeSeq.advance(tl)) {
          const fn = step.do && PRIM[step.do];
          if (fn) { try { fn.call(PRIM, step.args || step); } catch {} }
        }
      }
      activeScenes = activeScenes.filter((tl) => !tl.done);
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

    // bob every 30 (alternate knight/boss)
    if (frame % 30 === 0) {
      knight.y = FLOOR_Y - 14 - (knight.y < FLOOR_Y - 14 ? 0 : 1);
      if (!fx.bossFalling) { const baseY = FLOOR_Y - boss.height + (bossBroken ? 3 : 0); boss.y = baseY - (boss.y < baseY ? 0 : 1); }
    }

    // boss falling
    if (fx.bossFalling) {
      boss.y += 6;
      if (boss.y >= FLOOR_Y - boss.height) { ground(boss); fx.bossFalling = false; PRIM.slam(); }
    }

    // knight lunge decay
    if (fx.knightLunge > 0) fx.knightLunge = Math.max(0, fx.knightLunge - 1);
    knight.x = 40 + fx.knightLunge;

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
      ground(boss, bossBroken ? 3 : 0);
      if (Math.abs(s - bossScaleTarget) < 0.01) { boss.scale.set(bossScaleTarget); bossScaleTarget = null; }
    }

    // slime squash-stretch: feet stay planted, body breathes (CALM: off)
    if (!CALM && boss.visible && !fx.bossFalling) {
      boss.scale.y = boss.scale.x * (1 + Math.sin(frame / 9) * 0.05);
      ground(boss, bossBroken ? 3 : 0);
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

    // typewriter
    if (fx.type) {
      if (frame % 3 === 0 && fx.type.shown < fx.type.text.length) {
        fx.type.shown++;
        bigText.text = fx.type.text.slice(0, fx.type.shown);
      }
    }

    // forge hp charge 0→100%
    if (fx.charge) {
      fx.charge.pct = Math.min(100, fx.charge.pct + 2);
      updateBossHpBar(Math.round(fx.charge.pct));
      if (fx.charge.pct >= 100) fx.charge = null;
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

  // ── DOM: hp bar / log ─────────────────────────────────────────────────────────
  const hpBar = document.getElementById('hp-bar');
  (function buildHpBar() {
    hpBar.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      const seg = document.createElement('div');
      seg.className = 'hp-seg';
      seg.id = `seg${i}`;
      hpBar.appendChild(seg);
    }
  })();
  function updateBossHpBar(pct) {
    const filled = Math.round((pct / 100) * 10);
    for (let i = 0; i < 10; i++) {
      const s = document.getElementById(`seg${i}`);
      if (s) s.classList.toggle('on', i < filled);
    }
  }

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
  function applyTitles(lang) {
    const l = lang === 'zh' ? 'zh' : 'en';
    if (titlesApplied === l) return;
    titlesApplied = l;
    const T = TITLES[l];
    const set = (id, t, onParent) => {
      const el = document.getElementById(id);
      if (el) (onParent ? el.parentElement : el).title = t;
    };
    set('title', T.title); set('boss-name', T.boss); set('hp-bar', T.hp);
    set('player-token', T.token);
    set('gold', T.gold, true); set('weapon', T.weapon, true); set('atk', T.atk, true);
    set('timer', T.timer, true); set('stamina', T.stamina, true);
    set('minion-rail', T.rail); set('calm-btn', T.calm); set('help-btn', T.help);
  }

  function applyState(data) {
    if (!data) return;
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
        updateBossHpBar(pct);
        // boss keeps its species look; HP shows on the bars, not by recoloring.
        // hp still drives body size: full-HP looms huge, a battered one shrivels.
        if (scene === 'battle' && encForm !== 'pack' && encForm !== 'mini') {
          bossScaleTarget = battleScaleFor(lastEncEst, pct);
        }
      }
      if (snap.boss && typeof snap.boss.broken === 'boolean' && snap.boss.broken !== bossBroken) setBroken(snap.boss.broken);
    } else {
      if (window.SlimeMinions) SlimeMinions.render([]);
      showOverlay('waiting for a session…');
      boss.visible = false;
      setText('boss-name', '—');
      updateBossHpBar(0);
    }

    // usage → stats panel
    const u = data.usage;
    if (u) {
      let token = null;
      if (u.fiveHour && typeof u.fiveHour.used === 'number') {
        token = Math.max(0, Math.round(100 - u.fiveHour.used));
      }
      stats.token = token;
      // resetsAt rides along (epoch seconds) → show time left in the window
      let tokenLeft = '';
      if (u.fiveHour && u.fiveHour.resetsAt) {
        const h = (u.fiveHour.resetsAt * 1000 - Date.now()) / 3600000;
        if (h > 0) tokenLeft = h < 1 ? ` · ${Math.max(1, Math.round(h * 60))}m` : ` · ${(Math.round(h * 10) / 10)}h`;
      }
      setText('player-token', token != null ? `⚡Token ${token}%${tokenLeft}` : '⚡Token —');

      if (u.sevenDay && typeof u.sevenDay.used === 'number') {
        let weekLeft = '';
        if (u.sevenDay.resetsAt) {
          const d = (u.sevenDay.resetsAt * 1000 - Date.now()) / 86400000;
          if (d > 0) weekLeft = d < 1 ? ` · ${Math.max(1, Math.round(d * 24))}h` : ` · ${Math.ceil(d)}d`;
        }
        setText('stamina', `${Math.max(0, Math.round(100 - u.sevenDay.used))}%${weekLeft}`);
      }

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

      // player HUD above the knight: today's token (5h) · week · context size
      {
        const tk = token != null ? `⚡${token}%` : '';
        const wk = (u.sevenDay && typeof u.sevenDay.used === 'number') ? ` 🗓${Math.max(0, Math.round(100 - u.sevenDay.used))}%` : '';
        const cx = typeof u.contextPct === 'number' ? ` ▣${Math.round(u.contextPct)}%` : '';
        playerHud.text = `${tk}${wk}${cx}`.trim();
      }

      // grayscale when out of tokens + a one-shot Zzz on the zero transition
      if (token === 0) {
        app.canvas.classList.add('gray');
        if (!wasZero) { floater('💤', knight.x + 6, knight.y - 8, P.steel, 14, true); wasZero = true; }
      } else {
        app.canvas.classList.remove('gray');
        wasZero = false;
      }
    }
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
      if (typeof d.dmg === 'number' && d.dmg > 0) {
        floater(`-${d.dmg}`, 230, 110, P.gold);
        PRIM.shake({ amp: 3, frames: 6 });
        if (d.combo && d.combo > 1) floater(`×${d.combo}`, 250, 100, P.ember, 9, true);
        onCombo(d.combo || 0, d.dmg);
      }
      if (d.kill) { burst(238, 125, P.bone, 8); PRIM.flash({ strength: 0.4 }); }
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
  let bossScaleTarget = null; // feeding growth tween target
  let lastFedEst = null;
  /** battle size: tier × hp, exaggerated — a full-HP RAID towers past the canvas top */
  function battleScaleFor(est, pct) {
    const tier = bossTierFor(est);
    const hp = pct == null ? 100 : Math.max(0, Math.min(100, pct));
    const growth = tier.label === 'RAID BOSS' ? 6.5 : tier.label === 'ELITE' ? 1.8 : 0.9;
    return Math.max(0.4, tier.scale * (0.6 + (hp / 100) * growth));
  }
  function setScene(next) {
    if (scene === next) return;
    scene = next;
    const counter = document.getElementById('feed-counter');
    if (next === 'feeding') {
      PRIM.dim({ on: true });
      // baby slime: if no engaged boss yet, show the boss sprite tiny — it IS the creature being fed
      if (!engagedBoss) { bossDead = false; boss.visible = true; boss.scale.set(0.5); boss.x = 220 + 8; ground(boss); }
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
    if (CALM) { boss.scale.set(bossScaleTarget); ground(boss); bossScaleTarget = null; return; }
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
  SlimeArena.on((d) => {
    if (d.kind === 'encounter') {
      const isNew = d.bossName && d.bossName !== engagedBoss;
      if (isNew) {
        setScene('battle');
        engagedBoss = d.bossName;
        hideOverlay();
        regenBoss(d.bossName);                 // seed the look from the boss's name
        const est = bossAppearanceEst();        // size/form/tier from identity, not tokens
        const tier = bossTierFor(est);
        bossScaleTarget = battleScaleFor(est, 100); // fresh boss arrives at full menace
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
    if (d.kind === 'boss_down') { clearSummons(); setScene('battle'); engagedBoss = null; setBroken(false); packSprites.forEach((s) => { s.visible = false; }); tentacleGfx.clear(); playScene(SCENE_VICTORY(d.boss)); if (d.text) pushLog(d.text); }
    if (d.kind === 'potion') { playScene(SCENE_POTION); if (d.text) pushLog(d.text); }
    if (d.kind === 'boss_broken') { setBroken(true); PRIM.shake({ amp: 2, frames: 8 }); if (d.text) pushLog(d.text); }
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
          burst(s.x + s.width / 2, s.y + s.height / 2, P.bone, 12);
          s.visible = false;
        } else {
          burst(boss.x + boss.width / 2, FLOOR_Y - 6, P.bone, d.count ? 18 : 8);
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
  const helpBtn = document.getElementById('help-btn');
  if (helpBtn) helpBtn.addEventListener('click', () => toggleGuide());
  if (guideEl) guideEl.addEventListener('click', () => toggleGuide(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'h') toggleGuide();
    if (e.key === 'Escape') toggleGuide(false);
  });
})();
