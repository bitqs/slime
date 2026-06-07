'use strict';
/* Minion rail: renders snap.todos as mini slimes. Pure DOM consumer.
   Style pick comes from t.form (node-side hash) — deterministic.
   Slime designs live here as window.QLSlimes — the arena reuses them so
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
  };
  /** mirror a half-mask into a full symmetric matrix */
  function mirror(half) {
    return half.map((row) => row.concat([...row].reverse()));
  }
  // feature stamps: [x, y] pixels drawn in body color on the FULL matrix
  function withFeature(mat, feat) {
    const m = mat.map((r) => [...r]);
    const w = m[0].length;
    if (feat === 'horns') { m[0][1] = 1; m[1][2] = 1; m[0][w - 2] = 1; m[1][w - 3] = 1; }
    if (feat === 'crown') { m[0][Math.floor(w / 2) - 2] = 2; m[0][Math.floor(w / 2)] = 2; m[0][Math.floor(w / 2) + 1] = 2; }
    if (feat === 'drips') { const h = m.length; m[h - 1][2] = 1; m[h - 1][w - 3] = 1; }
    if (feat === 'spikes') { m[1][0] = 2; m[3][0] = 2; m[1][w - 1] = 2; m[3][w - 1] = 2; }
    return m;
  }
  const PALETTES = [
    ['', '#6abe30', '#4a8a20', '#1a1d24', '#a8e070'], // green
    ['', '#7fa8c0', '#50708a', '#1a1d24', '#b8d4e4'], // steel
    ['', '#f0b541', '#b07820', '#1a1d24', '#f8d890'], // gold
    ['', '#c83737', '#8a2020', '#1a1d24', '#e88080'], // red
    ['', '#b070d0', '#7a40a0', '#1a1d24', '#d8b0e8'], // violet
    ['', '#e8e0d0', '#a8a090', '#1a1d24', '#ffffff'], // bone
  ];
  // 6 curated designs — distinct shape × palette × feature per form index
  const DESIGNS = [
    { mat: withFeature(mirror(HALF.round), null),    pal: 0 }, // green classic
    { mat: withFeature(mirror(HALF.tall),  'horns'), pal: 1 }, // steel horned
    { mat: withFeature(mirror(HALF.wide),  'drips'), pal: 2 }, // gold dripper
    { mat: withFeature(mirror(HALF.round), 'spikes'),pal: 3 }, // red spiky
    { mat: withFeature(mirror(HALF.tall),  'crown'), pal: 4 }, // violet king
    { mat: withFeature(mirror(HALF.wide),  null),    pal: 5 }, // bone puddle
  ];
  const DEAD_COLOR = '#3a4050';

  function designFor(form) { return DESIGNS[((form | 0) % DESIGNS.length + DESIGNS.length) % DESIGNS.length]; }

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
  window.QLSlimes = { designFor, PALETTES, DESIGNS, drawSlime };

  const railEl = () => document.getElementById('minion-rail');
  let lastKey = '';

  function render(todos) {
    const rail = railEl();
    if (!rail) return;
    const list = Array.isArray(todos) ? todos : [];
    const key = JSON.stringify(list.map((t) => [t.label, t.status]));
    if (key === lastKey) return; // no churn on identical polls
    lastKey = key;
    rail.textContent = '';
    for (const t of list) {
      const card = document.createElement('div');
      card.className = `minion ${t.status}`;
      card.dataset.label = t.label || '';
      card.dataset.form = String(t.form || 0);
      const cv = document.createElement('canvas');
      cv.width = 8; cv.height = 8;
      cv.className = 'minion-sprite';
      drawSlime(cv, t.form || 0, t.status === 'completed');
      const hp = document.createElement('div');
      hp.className = 'minion-hp';
      const fill = document.createElement('div');
      fill.className = 'minion-hp-fill';
      fill.style.width = t.status === 'completed' ? '0%' : '100%';
      hp.appendChild(fill);
      const name = document.createElement('div');
      name.className = 'minion-name';
      // in_progress shows what's being done (next-step hint); others show the mob label
      name.textContent = t.status === 'in_progress' ? (t.activeForm || t.label || '') : (t.label || '');
      name.title = t.content || '';
      card.append(cv, hp, name);
      if (t.status === 'completed') {
        const grave = document.createElement('div');
        grave.className = 'minion-grave';
        grave.textContent = '🪦';
        card.appendChild(grave);
      }
      rail.appendChild(card);
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

  window.QLMinions = { render, kill };
})();
