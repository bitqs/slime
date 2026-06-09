'use strict';
/* Minion rail: renders snap.todos as mini slimes. Pure DOM consumer.
   Style pick comes from t.form (node-side hash) — deterministic.
   Slime designs live here as window.SlimeDesigns — the arena reuses them so
   on-stage mobs match the rail (half-mask + mirror technique, à la
   zfedoran/pixel-sprite-generator, but with curated masks). */
(function () {
  // Half-masks (left half incl. center column) — mirrored at build time.
  // cell: 0 empty, 1 body, 2 accent, 3 eye, 4 highlight
  const HALF = {
    round: [          // classic dome, 10 wide × 8 tall
      [0,0,0,1,4],
      [0,0,1,1,1],
      [0,1,1,4,1],
      [0,1,3,1,1],
      [1,1,1,1,1],
      [1,2,1,1,1],
      [1,1,1,1,1],
      [0,1,1,1,1],
    ],
    tall: [           // upright blob, 8 wide × 10 tall
      [0,0,1,1],
      [0,1,1,4],
      [0,1,1,1],
      [0,1,3,1],
      [1,1,1,1],
      [1,1,1,1],
      [1,2,1,1],
      [1,1,1,1],
      [1,1,1,1],
      [0,1,1,1],
    ],
    wide: [           // puddle hunk, 12 wide × 7 tall
      [0,0,0,0,1,1],
      [0,0,1,1,1,4],
      [0,1,1,3,1,1],
      [0,1,1,1,1,1],
      [1,1,2,1,1,1],
      [1,1,1,1,1,1],
      [0,1,1,1,1,1],
    ],
    blob: [           // compact bean, 8 wide × 6 tall
      [0,0,1,4],
      [0,1,1,1],
      [1,1,3,1],
      [1,2,1,1],
      [1,1,1,1],
      [0,1,1,1],
    ],
    spire: [          // tall spike, 6 wide × 11 tall
      [0,0,1],
      [0,1,1],
      [0,1,4],
      [0,1,1],
      [1,3,1],
      [1,1,1],
      [1,1,1],
      [1,2,1],
      [1,1,1],
      [1,1,1],
      [0,1,1],
    ],
  };
  /** mirror a half-mask into a full symmetric matrix */
  function mirror(half) {
    return half.map((row) => row.concat([...row].reverse()));
  }
  // feature stamps: [x, y] pixels drawn in body color on the FULL matrix
  function withFeature(mat, feat) {
    const m = mat.map((r) => [...r]);
    const w = m[0].length;
    const cx = Math.floor(w / 2), h = m.length;
    if (feat === 'horns') { m[0][1] = 1; m[1][2] = 1; m[0][w - 2] = 1; m[1][w - 3] = 1; }
    if (feat === 'crown') { m[0][cx - 2] = 2; m[0][cx] = 2; m[0][cx + 1] = 2; }
    if (feat === 'drips') { m[h - 1][2] = 1; m[h - 1][w - 3] = 1; }
    if (feat === 'spikes') { m[1][0] = 2; m[3][0] = 2; m[1][w - 1] = 2; m[3][w - 1] = 2; }
    if (feat === 'antenna') { m[0][2] = 2; m[0][w - 3] = 2; }
    if (feat === 'fangs') { const r = Math.max(0, h - 3); m[r][cx - 1] = 4; m[r][cx] = 4; }
    return m;
  }
  const PALETTES = [
    ['', '#6abe30', '#4a8a20', '#1a1d24', '#a8e070'], // green
    ['', '#7fa8c0', '#50708a', '#1a1d24', '#b8d4e4'], // steel
    ['', '#f0b541', '#b07820', '#1a1d24', '#f8d890'], // gold
    ['', '#c83737', '#8a2020', '#1a1d24', '#e88080'], // red
    ['', '#b070d0', '#7a40a0', '#1a1d24', '#d8b0e8'], // violet
    ['', '#e8e0d0', '#a8a090', '#1a1d24', '#ffffff'], // bone
    ['', '#3fc8c0', '#208a86', '#1a1d24', '#90f0ec'], // cyan
    ['', '#e8842c', '#a85510', '#1a1d24', '#f8b870'], // orange
    ['', '#e070a8', '#a04070', '#1a1d24', '#f8b0d4'], // pink
    ['', '#8890a0', '#565e6e', '#1a1d24', '#c0c8d8'], // slate
    ['', '#b8d030', '#88a020', '#1a1d24', '#e8f880'], // lime
    ['', '#9050b0', '#603080', '#1a1d24', '#c890e0'], // plum
  ];
  const SHAPES = [HALF.round, HALF.tall, HALF.wide, HALF.blob, HALF.spire];
  const FEATS = ['horns', 'crown', 'drips', 'spikes', 'antenna', 'fangs'];
  const SIZES = [0.8, 1.0, 1.0, 1.15, 1.3];
  const DEAD_COLOR = '#3a4050';

  /** Procedurally decode a seed into a slime: shape × palette × decorations ×
   *  size × level. Pure + deterministic — same seed → same creature, so a given
   *  todo/boss is stable across polls, but distinct seeds look wildly different.
   *  Decoupled from any project metric (est/tokens): variety is intrinsic. */
  const _cache = {};
  function designFor(seed) {
    const s = ((seed | 0) >>> 0) || 1;
    if (_cache[s]) return _cache[s];
    const shape = SHAPES[s % SHAPES.length];
    const pal = (s >>> 3) % PALETTES.length;          // >>> (unsigned): seeds exceed 2^31
    const level = ((s >>> 7) % 5) + 1;                // 1..5 — higher wears more
    const scale = SIZES[(s >>> 10) % SIZES.length];
    let mat = mirror(shape);
    // only the lowliest (level 1, ~20%) go bare; most slimes wear 1-2 decorations
    const featCount = level >= 4 ? 2 : level >= 2 ? 1 : 0;
    for (let k = 0; k < featCount; k++) {
      mat = withFeature(mat, FEATS[(s >>> (12 + k * 3)) % FEATS.length]);
    }
    return (_cache[s] = { mat, pal, scale, level });
  }

  function drawSlime(cv, form, dead) {
    const d = designFor(form);
    const mat = d.mat, pal = PALETTES[d.pal];
    cv.width = mat[0].length; cv.height = mat.length;
    const c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    for (let r = 0; r < mat.length; r++) {
      for (let x = 0; x < mat[r].length; x++) {
        const v = mat[r][x];
        if (!v) continue;
        c.fillStyle = dead ? DEAD_COLOR : pal[v];
        c.fillRect(x, r, 1, 1);
      }
    }
  }

  // shared with the arena (loaded before arena.js) — stage mobs match the rail
  window.SlimeDesigns = { designFor, PALETTES, drawSlime };

  const railEl = () => document.getElementById('minion-rail');
  let lastKey = '';

  // Boss look is seeded from its NAME (FNV-1a) — same hash the arena uses, so the
  // rail card matches the on-stage boss sprite.
  function seedFromName(name) {
    let h = 2166136261; const s = String(name || '');
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0) || 1;
  }

  /** one rail card. form=seed, dead=tombstone look, opts.cls extra classes,
   *  opts.hpPct fill width + color, opts.marker a corner glyph (👑 for the boss). */
  function makeCard(form, label, status, opts) {
    const o = opts || {};
    const card = document.createElement('div');
    card.className = `minion ${status}${o.cls ? ' ' + o.cls : ''}`;
    card.dataset.label = label || '';
    card.dataset.form = String(form || 0);
    const cv = document.createElement('canvas');
    cv.width = 8; cv.height = 8;
    cv.className = 'minion-sprite';
    drawSlime(cv, form || 0, status === 'completed');
    const hp = document.createElement('div');
    hp.className = 'minion-hp';
    const fill = document.createElement('div');
    fill.className = 'minion-hp-fill';
    const pct = o.hpPct != null ? Math.max(0, Math.min(100, o.hpPct)) : (status === 'completed' ? 0 : 100);
    fill.style.width = pct + '%';
    if (o.hpColor) fill.style.background = o.hpColor;
    hp.appendChild(fill);
    const name = document.createElement('div');
    name.className = 'minion-name';
    name.textContent = label || '';
    name.title = o.title || '';
    card.append(cv, hp, name);
    if (o.marker) {
      const m = document.createElement('div');
      m.className = 'minion-marker';
      m.textContent = o.marker;
      card.appendChild(m);
    }
    if (status === 'completed') {
      const grave = document.createElement('div');
      grave.className = 'minion-grave';
      grave.textContent = '🪦';
      card.appendChild(grave);
    }
    return card;
  }

  // three faint silhouettes that hold the rail's shape when there's no session yet.
  const PLACEHOLDER_SEEDS = [7, 42, 99];

  function render(todos, boss) {
    const rail = railEl();
    if (!rail) return;
    const list = Array.isArray(todos) ? todos : [];
    // key includes the boss (name/hp/broken) so its card refreshes between polls
    const bkey = boss && boss.name ? [boss.name, boss.hp, boss.broken] : null;
    const key = JSON.stringify([bkey, list.map((t) => [t.label, t.status])]);
    if (key === lastKey) return; // no churn on identical polls
    lastKey = key;
    rail.textContent = '';

    // the boss (the quest itself) leads the rail — bigger, gold-framed, crowned.
    if (boss && boss.name) {
      const hpPct = typeof boss.hp === 'number' ? boss.hp : 100;
      const hpColor = boss.broken ? '#777' : hpPct > 50 ? '#6abe30' : hpPct > 20 ? '#f0b541' : '#c83737';
      // always 'in_progress' (a live foe, never a tombstone); 'broken' greys it without killing it
      rail.appendChild(makeCard(seedFromName(boss.name), boss.name, 'in_progress',
        { cls: boss.broken ? 'boss broken' : 'boss', hpPct, hpColor, marker: '👑', title: boss.name }));
    }

    for (const t of list) {
      // in_progress shows what's being done (next-step hint); others show the mob label
      const label = t.status === 'in_progress' ? (t.activeForm || t.label || '') : (t.label || '');
      rail.appendChild(makeCard(t.form || 0, label, t.status, { title: t.content || '' }));
    }

    // the rail always carries content — fall back to faint placeholders when idle
    if (!rail.children.length) {
      for (const seed of PLACEHOLDER_SEEDS) {
        rail.appendChild(makeCard(seed, '—', 'pending', { cls: 'placeholder' }));
      }
    }
  }

  /** HP-drain death: bar animates to 0, then card flips to tombstone. */
  function kill(label, calm) {
    const rail = railEl();
    if (!rail) return;
    const card = [...rail.querySelectorAll('.minion')].find((el) => el.dataset.label === label);
    if (!card) return;
    const fill = card.querySelector('.minion-hp-fill');
    if (fill) fill.style.width = '0%';
    const after = () => {
      card.classList.add('completed');
      const cv = card.querySelector('canvas');
      if (cv) drawSlime(cv, Number(card.dataset.form) || 0, true);
      if (!card.querySelector('.minion-grave')) {
        const grave = document.createElement('div');
        grave.className = 'minion-grave';
        grave.textContent = '🪦';
        card.appendChild(grave);
      }
    };
    if (calm) after(); else setTimeout(after, 450);
  }

  window.SlimeMinions = { render, kill };
})();
