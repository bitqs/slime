'use strict';
/* Minion rail: renders snap.todos as mini slimes. Pure DOM consumer.
   Style pick comes from t.form (node-side hash) — deterministic. */
(function () {
  // 6 mini slime variants, 8×7: 0=transparent,1=body,2=accent,3=eye
  const SLIME = [
    [0,0,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,0],
    [1,1,3,1,1,3,1,1],
    [1,1,1,1,1,1,1,1],
    [1,2,1,1,1,1,2,1],
    [1,1,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,0],
  ];
  const HORNS = [[2,0],[5,0]];
  const DRIPS = [[1,6],[6,6]];
  const PALETTES = [
    ['', '#6abe30', '#4a8a20', '#1a1d24'], // green
    ['', '#7fa8c0', '#50708a', '#1a1d24'], // steel
    ['', '#f0b541', '#b07820', '#1a1d24'], // gold
    ['', '#c83737', '#8a2020', '#1a1d24'], // red
    ['', '#b070d0', '#7a40a0', '#1a1d24'], // violet
    ['', '#e8e0d0', '#a8a090', '#1a1d24'], // bone
  ];

  function drawSlime(cv, form, dead) {
    const c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    const pal = PALETTES[form % PALETTES.length];
    for (let r = 0; r < SLIME.length; r++) {
      for (let x = 0; x < SLIME[r].length; x++) {
        const v = SLIME[r][x];
        if (!v) continue;
        c.fillStyle = dead ? '#3a4050' : pal[v];
        c.fillRect(x, r + 1, 1, 1);
      }
    }
    const extra = form % 3 === 1 ? HORNS : form % 3 === 2 ? DRIPS : [];
    for (const [x, y] of extra) {
      c.fillStyle = dead ? '#3a4050' : pal[1];
      c.fillRect(x, y, 1, 1);
    }
  }

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
      if (cv) drawSlime(cv, 0, true);
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
