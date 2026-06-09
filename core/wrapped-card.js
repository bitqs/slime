'use strict';
/* Weekly Wrapped → a shareable SVG "battle card". Pure string, zero deps,
   renders anywhere (browser, GitHub README <img>, convert to PNG for socials).
   Night-theme palette matched to the arena. */

const P = {
  bg0: '#1a1d24', bg1: '#232733', border: '#f0b541', ink: '#e8e0d0',
  label: '#cfa54a', gold: '#f0b541', green: '#6abe30', red: '#c83737', dim: '#7a8090',
};

// a small cute slime, mirrored-feel matrix: 1=body 2=shade 3=eye
const SLIME = [
  [0,0,0,1,1,1,1,1,1,0,0,0],
  [0,0,1,1,1,1,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,1,1,1,1,0],
  [1,1,1,1,1,1,1,1,1,1,1,1],
  [1,1,3,3,1,1,1,1,3,3,1,1],
  [1,1,3,3,1,1,1,1,3,3,1,1],
  [1,1,1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1,1,1],
  [1,1,2,1,1,1,1,1,1,2,1,1],
  [0,1,1,1,1,1,1,1,1,1,1,0],
  [0,0,1,1,1,1,1,1,1,1,0,0],
  [0,0,0,1,1,0,0,1,1,0,0,0],
];
const SLIME_PAL = ['', P.green, '#4e9426', '#11141b'];

/** @param {unknown} s @returns {string} */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** matrix → <rect> pixels at (ox,oy) with pixel size `s`
 * @param {number[][]} mat @param {string[]} pal @param {number} ox @param {number} oy @param {number} s @returns {string} */
function sprite(mat, pal, ox, oy, s) {
  let out = '';
  for (let r = 0; r < mat.length; r++) {
    for (let x = 0; x < mat[r].length; x++) {
      const v = mat[r][x];
      if (!v) continue;
      out += `<rect x="${ox + x * s}" y="${oy + r * s}" width="${s}" height="${s}" fill="${pal[v]}"/>`;
    }
  }
  return out;
}

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
/** @param {number} now @param {string} [lang] @returns {string} */
function range(now, lang) {
  const a = new Date(now - 7 * 24 * 3600 * 1000), b = new Date(now);
  /** @param {number} n */
  const p = (n) => String(n).padStart(2, '0');
  if (lang === 'zh') return `${a.getFullYear()}.${p(a.getMonth() + 1)}.${p(a.getDate())} – ${p(b.getMonth() + 1)}.${p(b.getDate())}`;
  return `${MON[a.getMonth()]} ${a.getDate()} – ${MON[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`;
}

/**
 * @param {{dmg:number,kills:number,turns:number,activeDays:number,maxCombo?:number,milestones?:unknown[],topGear?:[string,number][]}} data
 * @param {(key:string)=>string} T  localized label lookup
 * @param {{lang?:string, now?:number}} [opts]
 * @returns {string} SVG document
 */
function svg(data, T, opts) {
  const o = opts || {};
  const now = o.now != null ? o.now : Date.now();
  const W = 800, H = 420;
  const bosses = (data.milestones && data.milestones.length) || 0;
  const combo = data.maxCombo || 0;

  // 3×2 stat grid
  const cells = [
    [String(data.dmg || 0), T('wrapped.dmg'), P.gold],
    [String(data.kills || 0), T('wrapped.kills'), P.green],
    [String(data.turns || 0), T('wrapped.turns'), P.ink],
    [String(data.activeDays || 0), T('wrapped.days'), P.ink],
    [String(bosses), T('wrapped.bosses'), P.red],
    ['×' + combo, T('wrapped.combo'), P.gold],
  ];
  const colX = [70, 320, 565];
  const rowY = [212, 312];
  let grid = '';
  cells.forEach((c, i) => {
    const x = colX[i % 3], y = rowY[Math.floor(i / 3)];
    grid += `<text x="${x}" y="${y}" font-size="40" font-weight="700" fill="${c[2]}" font-family="ui-monospace,'SF Mono',Menlo,monospace">${esc(c[0])}</text>`;
    grid += `<text x="${x + 2}" y="${y + 22}" font-size="13" letter-spacing="1.5" fill="${P.label}" font-family="ui-monospace,'SF Mono',Menlo,monospace">${esc(String(c[1]).toUpperCase())}</text>`;
  });

  // gear chips (truncate to fit one line)
  let gearLine = '';
  if (data.topGear && data.topGear.length) {
    let s = data.topGear.map(([k, v]) => `${k}×${v}`).join('   ·   ');
    if (s.length > 62) s = s.slice(0, 61) + '…';
    gearLine = `<text x="70" y="372" font-size="14" fill="${P.dim}" font-family="ui-monospace,'SF Mono',Menlo,monospace">`
      + `<tspan fill="${P.label}" letter-spacing="1.5">${esc(T('wrapped.gear').toUpperCase())}  </tspan>${esc(s)}</text>`;
  }

  // a few starfield dots (deterministic, no RNG)
  let stars = '';
  const sx = [40, 140, 250, 470, 600, 690, 760, 90, 540, 730];
  const sy = [60, 150, 70, 55, 90, 150, 70, 300, 360, 330];
  for (let i = 0; i < sx.length; i++) stars += `<rect x="${sx[i]}" y="${sy[i]}" width="2" height="2" fill="#ffffff" opacity="0.25"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-monospace,'SF Mono',Menlo,monospace">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.bg0}"/><stop offset="1" stop-color="${P.bg1}"/></linearGradient></defs>
<rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="14" fill="url(#bg)" stroke="${P.border}" stroke-width="2"/>
${stars}
${sprite(SLIME, SLIME_PAL, 44, 40, 7)}
<text x="150" y="74" font-size="34" font-weight="700" fill="${P.gold}" letter-spacing="2">SLIME · WRAPPED</text>
<text x="152" y="98" font-size="15" fill="${P.label}" letter-spacing="1">${esc(range(now, o.lang))}</text>
<line x1="44" y1="132" x2="${W - 44}" y2="132" stroke="${P.border}" stroke-width="1" opacity="0.35"/>
${grid}
${gearLine}
<line x1="44" y1="388" x2="${W - 44}" y2="388" stroke="${P.border}" stroke-width="1" opacity="0.2"/>
<text x="70" y="406" font-size="13" fill="${P.dim}">github.com/bitqs/slime</text>
<text x="${W - 70}" y="406" font-size="13" fill="${P.label}" text-anchor="end" font-style="italic">Already addicted? Get more addicted.</text>
</svg>`;
}

module.exports = { svg };
