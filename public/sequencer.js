(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QLSeq = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createTimeline(steps) {
    const sorted = [...steps].sort((a, b) => a.at - b.at);
    return { steps: sorted, i: 0, frame: 0, done: sorted.length === 0 };
  }

  // Returns the steps due this frame, then advances the frame counter.
  function advance(tl) {
    if (tl.done) return [];
    const due = [];
    while (tl.i < tl.steps.length && tl.steps[tl.i].at <= tl.frame) due.push(tl.steps[tl.i++]);
    tl.frame++;
    if (tl.i >= tl.steps.length) tl.done = true;
    return due;
  }

  // Photosensitivity cap: at most maxPerSec flashes, enforced as a minimum
  // frame gap. allow(frame) returns whether a flash may fire now.
  function createGovernor(maxPerSec, fps) {
    const minGap = Math.ceil((fps || 60) / (maxPerSec || 3));
    let last = -Infinity;
    return {
      allow(frame) {
        if (frame - last < minGap) return false;
        last = frame;
        return true;
      },
    };
  }

  return { createTimeline, advance, createGovernor };
}));
