'use strict';
/* Slime Arena audio — self-contained WebAudio engine. Zero deps, no network.
 *
 * Two layers, both opt-in (muted by default; a user gesture unlocks the context):
 *   • SFX  — short procedural blips synthesized from oscillators + noise.
 *   • BGM  — a looping chiptune sequence.
 *
 * ElevenLabs (or any) drop-in: if `/audio/<name>.mp3` exists it is fetched once,
 * decoded, and played INSTEAD of the synth fallback (same for `/audio/bgm.mp3`).
 * No files shipped today → the synth plays. serve.js whitelists /audio/*.{mp3,ogg,wav}.
 *
 * Observer principle holds: this is the viewer (browser), never the real session.
 */
window.SlimeAudio = (function () {
  /** @type {AudioContext|null} */ let ctx = null;
  /** @type {GainNode|null} */ let master = null;
  let muted = true;
  let bgmOn = false;
  /** @type {AudioBufferSourceNode|null} */ let bgmSrc = null;
  let bgmTimer = 0;
  let loaded = false;
  /** @type {Record<string, AudioBuffer>} */ const buffers = {};

  // SFX names worth trying to load as vendored files; 'bgm' handled separately.
  const NAMES = ['hit', 'crit', 'kill', 'encounter', 'levelup', 'victory', 'choice', 'summon', 'potion', 'ui'];

  try { muted = localStorage.getItem('slimeMute') !== '0'; } catch (e) { muted = true; }

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
    g.gain.setValueAtTime(Math.max(0.0001, vol), t0);
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
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n); // decaying hiss
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
  };

  function play(name) {
    if (muted || !ctx || !master) return;
    if (buffers[name]) {
      const s = ctx.createBufferSource();
      s.buffer = buffers[name];
      s.connect(master);
      s.start();
      return;
    }
    (SFX[name] || (() => {}))();
  }

  // ── BGM: vendored loop if present, else a scheduled chiptune ───────────────
  const MELODY = [ // [freq, beats]; 0 = rest
    [392, 1], [523, 1], [659, 1], [523, 1], [440, 1], [587, 1], [698, 1], [587, 1],
    [349, 1], [523, 1], [659, 1], [784, 1], [392, 2], [0, 1],
  ];
  const BASS = [[131, 2], [165, 2], [175, 2], [196, 2]];
  const BEAT = 0.2;
  function scheduleChiptune() {
    if (!bgmOn || muted || !ctx) return;
    let t = 0;
    for (const [f, b] of MELODY) { if (f > 0) tone({ freq: f, dur: b * BEAT * 0.9, type: 'triangle', vol: 0.07, delay: t }); t += b * BEAT; }
    let bt = 0;
    for (const [f, b] of BASS) { tone({ freq: f, dur: b * BEAT * 0.95, type: 'square', vol: 0.045, delay: bt }); bt += b * BEAT; }
    bgmTimer = setTimeout(scheduleChiptune, Math.round(t * 1000));
  }
  function startBgm() {
    if (muted || !ctx || bgmOn) return;
    bgmOn = true;
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
    bgmOn = false;
    if (bgmSrc) { try { bgmSrc.stop(); } catch (e) { /* already stopped */ } bgmSrc = null; }
    if (bgmTimer) { clearTimeout(bgmTimer); bgmTimer = 0; }
  }

  async function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem('slimeMute', muted ? '1' : '0'); } catch (e) { /* private mode */ }
    if (muted) { stopBgm(); return; }
    if (!ensureCtx()) return;
    await loadVendored();
    startBgm();
  }

  return {
    play,
    startBgm,
    stopBgm,
    setMuted,
    isMuted: () => muted,
    unlock: () => { ensureCtx(); },
  };
})();
