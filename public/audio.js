'use strict';
/* Slime Arena audio — self-contained WebAudio engine. Zero deps, no network.
 *
 * Two INDEPENDENT layers, each opt-in (off by default; a user gesture unlocks
 * the context):
 *   • SFX   — short procedural blips synthesized from oscillators + noise.
 *   • Music — a long, stately, looping chiptune (Age-of-Exploration flavour).
 *
 * Vendored drop-in: if `/audio/<name>.mp3` exists it is fetched once, decoded,
 * and played INSTEAD of the synth fallback (and `/audio/bgm.mp3` for music).
 * No files shipped today → the synth plays. serve.js whitelists the audio files.
 *
 * Observer principle holds: this is the viewer (browser), never the real session.
 */
window.SlimeAudio = (function () {
  /** @type {AudioContext|null} */ let ctx = null;
  /** @type {GainNode|null} */ let master = null;
  let sfxOn = false;
  let musicOn = false;
  let bgmPlaying = false;
  /** @type {AudioBufferSourceNode|null} */ let bgmSrc = null;
  let bgmTimer = 0;
  let loaded = false;
  /** @type {Record<string, AudioBuffer>} */ const buffers = {};

  const NAMES = ['hit', 'crit', 'kill', 'encounter', 'levelup', 'victory', 'choice', 'summon', 'potion', 'ui', 'badge', 'quest', 'ultimate', 'loot'];

  try {
    sfxOn = localStorage.getItem('slimeSfx') === '1';
    musicOn = localStorage.getItem('slimeMusic') === '1';
  } catch (e) { sfxOn = musicOn = false; }

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  async function loadVendored() {
    if (loaded || !ctx) return;
    loaded = true;
    const tryOne = async (name) => {
      try {
        const r = await fetch('/audio/' + name + '.mp3', { cache: 'force-cache' });
        if (!r.ok) return;
        buffers[name] = await ctx.decodeAudioData(await r.arrayBuffer());
      } catch (e) { /* absent → synth fallback */ }
    };
    await Promise.all(NAMES.concat('bgm').map(tryOne));
  }

  // ── synth primitives ──────────────────────────────────────────────────────
  /** @param {{freq?:number,dur?:number,type?:OscillatorType,vol?:number,slideTo?:number|null,delay?:number}} o */
  function tone(o) {
    if (!ctx || !master) return;
    const { freq = 440, dur = 0.12, type = 'square', vol = 0.25, slideTo = null, delay = 0 } = o;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + Math.min(0.03, dur / 2)); // soft attack
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }
  /** @param {{dur?:number,vol?:number,delay?:number}} o */
  function noise(o) {
    if (!ctx || !master) return;
    const { dur = 0.1, vol = 0.1, delay = 0 } = o;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = vol;
    s.connect(g).connect(master);
    s.start(ctx.currentTime + delay);
  }

  const SFX = {
    hit: () => tone({ freq: 220, dur: 0.07, type: 'square', vol: 0.18, slideTo: 150 }),
    crit: () => { tone({ freq: 330, dur: 0.1, type: 'square', vol: 0.22, slideTo: 540 }); noise({ dur: 0.08, vol: 0.09 }); },
    kill: () => { tone({ freq: 170, dur: 0.18, type: 'sawtooth', vol: 0.2, slideTo: 55 }); noise({ dur: 0.12, vol: 0.08 }); },
    encounter: () => [262, 330, 392].forEach((f, i) => tone({ freq: f, dur: 0.16, type: 'triangle', vol: 0.2, delay: i * 0.09 })),
    levelup: () => [392, 523, 659, 784].forEach((f, i) => tone({ freq: f, dur: 0.14, type: 'square', vol: 0.16, delay: i * 0.08 })),
    victory: () => [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'square', vol: 0.18, delay: i * 0.1 })),
    choice: () => tone({ freq: 660, dur: 0.06, type: 'triangle', vol: 0.14 }),
    summon: () => tone({ freq: 180, dur: 0.14, type: 'sawtooth', vol: 0.15, slideTo: 320 }),
    potion: () => tone({ freq: 500, dur: 0.12, type: 'sine', vol: 0.14, slideTo: 920 }),
    ui: () => tone({ freq: 880, dur: 0.04, type: 'square', vol: 0.1 }),
    // distinct progression cues so level / badge / quest don't all sound alike
    badge: () => { tone({ freq: 784, dur: 0.12, type: 'triangle', vol: 0.18, slideTo: 1175 }); tone({ freq: 1047, dur: 0.18, type: 'sine', vol: 0.12, delay: 0.09 }); },
    quest: () => [659, 880, 1047, 1319].forEach((f, i) => tone({ freq: f, dur: 0.16, type: 'triangle', vol: 0.15, delay: i * 0.07 })),
    ultimate: () => { tone({ freq: 110, dur: 0.32, type: 'sawtooth', vol: 0.22, slideTo: 55 }); noise({ dur: 0.26, vol: 0.12 }); tone({ freq: 440, dur: 0.22, type: 'square', vol: 0.13, slideTo: 880, delay: 0.05 }); },
    loot: () => { tone({ freq: 988, dur: 0.07, type: 'square', vol: 0.14, slideTo: 1319 }); tone({ freq: 1319, dur: 0.12, type: 'sine', vol: 0.1, slideTo: 1760, delay: 0.06 }); },
  };

  function play(name) {
    if (!sfxOn || !ctx || !master) return;
    if (buffers[name]) {
      const s = ctx.createBufferSource();
      s.buffer = buffers[name];
      s.connect(master);
      s.start();
      return;
    }
    (SFX[name] || (() => {}))();
  }

  // ── Music: a long, looping, stately A-minor voyage theme ───────────────────
  // melody [freq, beats] · 0 = rest. ~64 beats → a ~20s loop at this tempo.
  const BEAT = 0.32;
  const MEL = [
    [440, 2], [523, 1], [587, 1], [659, 2], [587, 1], [523, 1], [494, 2], [0, 1], [392, 1],
    [440, 2], [494, 1], [523, 1], [587, 2], [659, 1], [587, 1], [523, 3], [0, 1],
    [659, 1], [587, 1], [523, 1], [494, 1], [440, 2], [392, 1], [349, 1], [330, 2], [349, 1], [392, 1],
    [440, 2], [392, 1], [349, 1], [294, 3], [0, 1], [330, 1], [349, 1],
    [440, 4], [0, 2],
  ];
  // walking bass (root of the implied chord) [freq, beats]
  const BASS = [
    [110, 4], [87, 4], [131, 4], [98, 4],
    [110, 4], [87, 4], [147, 4], [165, 4],
    [110, 4], [87, 4], [131, 4], [98, 4],
    [147, 4], [165, 4], [110, 4], [110, 4],
  ];
  function scheduleChiptune() {
    if (!bgmPlaying || !musicOn || !ctx) return;
    let mt = 0;
    for (const [f, b] of MEL) { if (f > 0) tone({ freq: f, dur: b * BEAT * 0.92, type: 'triangle', vol: 0.06, delay: mt }); mt += b * BEAT; }
    let bt = 0;
    for (const [f, b] of BASS) {
      tone({ freq: f, dur: b * BEAT * 0.96, type: 'square', vol: 0.05, delay: bt });        // bass
      tone({ freq: f * 1.5, dur: b * BEAT * 0.85, type: 'sine', vol: 0.022, delay: bt });   // soft fifth pad
      bt += b * BEAT;
    }
    bgmTimer = setTimeout(scheduleChiptune, Math.round(Math.max(mt, bt) * 1000));
  }
  function startBgm() {
    if (!musicOn || !ctx || bgmPlaying) return;
    bgmPlaying = true;
    if (buffers.bgm) {
      bgmSrc = ctx.createBufferSource();
      bgmSrc.buffer = buffers.bgm;
      bgmSrc.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0.22;
      bgmSrc.connect(g).connect(master);
      bgmSrc.start();
      return;
    }
    scheduleChiptune();
  }
  function stopBgm() {
    bgmPlaying = false;
    if (bgmSrc) { try { bgmSrc.stop(); } catch (e) { /* already stopped */ } bgmSrc = null; }
    if (bgmTimer) { clearTimeout(bgmTimer); bgmTimer = 0; }
  }

  async function setSfx(on) {
    sfxOn = !!on;
    try { localStorage.setItem('slimeSfx', sfxOn ? '1' : '0'); } catch (e) { /* private mode */ }
    if (sfxOn && ensureCtx()) await loadVendored();
  }
  async function setMusic(on) {
    musicOn = !!on;
    try { localStorage.setItem('slimeMusic', musicOn ? '1' : '0'); } catch (e) { /* private mode */ }
    if (!musicOn) { stopBgm(); return; }
    if (!ensureCtx()) return;
    await loadVendored();
    startBgm();
  }

  return {
    play,
    startBgm,
    stopBgm,
    setSfx,
    setMusic,
    isSfxOn: () => sfxOn,
    isMusicOn: () => musicOn,
    unlock: () => { ensureCtx(); },
  };
})();
