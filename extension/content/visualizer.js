/*
 * Listen Mode for YouTube: audio visualizer.
 * Runs in the same isolated world as content.js, which loads after it.
 *
 * Draws the playing audio onto a canvas that content.js puts in the
 * episode header, as one of:
 *   spectrogram   frequency over time, scrolling right to left
 *   oscilloscope  the waveform
 *   analyzer      frequency bars
 *   combined      all three: oscilloscope on top, spectrogram bottom left,
 *                 analyzer bottom right
 *
 * The audio is read through a Web Audio AnalyserNode. Tapping a media
 * element reroutes its sound through our AudioContext for good, so nothing
 * is touched until a visualizer is actually switched on, and the element is
 * only tapped once the context is running (a suspended context would mean
 * silence).
 *
 * It exposes a single global: YLMVisualizer.
 */
(() => {
  'use strict';

  if (globalThis.YLMVisualizer) return;

  const FFT_SIZE = 4096;
  const MIN_HZ = 40;
  const MAX_HZ = 16000;
  const BAR_COUNT = 56;
  const PANE_GAP = 14; // CSS px between the panes of the combined view

  let audio = null;      // AudioContext, created on first use
  let analyser = null;   // smoothed: oscilloscope and analyzer bars
  let quick = null;      // barely smoothed, so the spectrogram stays sharp in time
  let attached = null;   // the <video> currently feeding the analyser
  let freq = null;
  let wave = null;
  const sources = new WeakMap(); // <video> → MediaElementAudioSourceNode

  const view = {
    canvas: null,
    g: null,
    mode: 'none',
    raf: 0,
    frame: 0,
    w: 0,
    h: 0,
    colorKey: '',
    colors: null,
    lut: null,     // spectrogram colour map, 256 × RGBA
    panes: [],     // what to draw where: { draw, x, y, w, h }
    rows: null,    // spectrogram: pixel row → frequency bin
    column: null,  // spectrogram: the ImageData strip drawn each frame
    bars: null,    // analyzer: bar → first frequency bin (BAR_COUNT + 1 edges)
  };

  /* ------------------------------------------------------------------ *
   * Audio                                                               *
   * ------------------------------------------------------------------ */
  function ensureAudio() {
    if (audio) return true;
    const AudioContextClass = globalThis.AudioContext;
    if (!AudioContextClass) return false;
    audio = new AudioContextClass({ latencyHint: 'playback' });
    const makeAnalyser = (smoothing) => {
      const node = audio.createAnalyser();
      node.fftSize = FFT_SIZE;
      node.minDecibels = -90;
      node.maxDecibels = -20;
      node.smoothingTimeConstant = smoothing;
      return node;
    };
    analyser = makeAnalyser(0.8);
    quick = makeAnalyser(0.3);
    freq = new Uint8Array(analyser.frequencyBinCount);
    wave = new Uint8Array(analyser.fftSize);
    // Tapped videos only make sound while the context runs; never leave it suspended.
    audio.addEventListener('statechange', () => {
      if (audio.state !== 'running' && audio.state !== 'closed') audio.resume().catch(() => {});
    });
    return true;
  }

  /** Feed the analyser from this video. Returns false while that isn't possible yet. */
  function attach(video) {
    if (!video || !ensureAudio()) return false;
    if (audio.state !== 'running') {
      audio.resume().catch(() => {});
      return false;
    }
    if (attached === video) return true;
    let source = sources.get(video);
    if (!source) {
      try {
        source = audio.createMediaElementSource(video);
      } catch (_) {
        return false;
      }
      source.connect(audio.destination);
      sources.set(video, source);
    }
    if (attached) {
      for (const node of [analyser, quick]) {
        try { sources.get(attached).disconnect(node); } catch (_) { /* not connected */ }
      }
    }
    source.connect(analyser); // taps: the analysers themselves go nowhere
    source.connect(quick);
    attached = video;
    return true;
  }

  function binFor(hz) {
    const bin = Math.round((hz / (audio.sampleRate / 2)) * freq.length);
    return Math.min(freq.length - 1, Math.max(0, bin));
  }

  /* ------------------------------------------------------------------ *
   * Canvas set-up                                                       *
   * ------------------------------------------------------------------ */
  function toRgb(color) {
    view.g.fillStyle = '#808080';
    view.g.fillStyle = color; // the canvas normalises valid colours to #rrggbb
    const hex = /^#([0-9a-f]{6})$/i.exec(view.g.fillStyle);
    const n = hex ? parseInt(hex[1], 16) : 0x808080;
    return [n >> 16, (n >> 8) & 255, n & 255];
  }

  /** Pick up the theme tokens content.css defines (they differ in dark mode). */
  function readColors() {
    const style = getComputedStyle(view.canvas);
    const token = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
    const colors = {
      bg: token('--ylm-bg', '#ffffff'),
      fg: token('--ylm-fg', '#0f0f0f'),
      line: token('--ylm-line', 'rgba(128, 128, 128, 0.3)'),
      accent: token('--ylm-accent', '#17706b'),
    };
    const key = `${colors.bg}|${colors.fg}|${colors.accent}`;
    if (key === view.colorKey) return;
    view.colorKey = key;
    view.colors = colors;

    // Spectrogram colour map: background (quiet) → accent → text colour (loud).
    const stops = [toRgb(colors.bg), toRgb(colors.accent), toRgb(colors.fg)];
    view.lut = new Uint8ClampedArray(256 * 4);
    for (let i = 0; i < 256; i += 1) {
      const t = (i / 255) * 1.6; // the accent sits at 62% loudness
      const [from, to, k] = t < 1 ? [stops[0], stops[1], t] : [stops[1], stops[2], (t - 1) / 0.6];
      for (let c = 0; c < 3; c += 1) view.lut[i * 4 + c] = from[c] + (to[c] - from[c]) * k;
      view.lut[i * 4 + 3] = 255;
    }
    view.w = 0; // repaint from scratch in the new colours
  }

  /** Match the canvas bitmap to its on-screen size. Returns false while it has none. */
  function layout() {
    const dpr = globalThis.devicePixelRatio || 1;
    const w = Math.round(view.canvas.clientWidth * dpr);
    const h = Math.round(view.canvas.clientHeight * dpr);
    if (!w || !h) return false;
    if (w === view.w && h === view.h) return true;
    view.w = w;
    view.h = h;
    view.canvas.width = w;  // also clears it
    view.canvas.height = h;

    const top = Math.min(MAX_HZ, audio.sampleRate / 2);
    const logHz = (fraction) => MIN_HZ * (top / MIN_HZ) ** fraction;

    view.panes = panesFor(view.mode, w, h, Math.round(PANE_GAP * dpr));

    const rows = (view.panes.find((pane) => pane.draw === drawSpectrogram) || { h }).h;
    view.rows = new Uint16Array(rows);
    for (let y = 0; y < rows; y += 1) view.rows[y] = binFor(logHz(1 - y / Math.max(1, rows - 1)));
    view.column = view.g.createImageData(Math.max(1, Math.round(dpr)), rows);

    view.bars = new Uint16Array(BAR_COUNT + 1);
    for (let i = 0; i <= BAR_COUNT; i += 1) {
      const bin = binFor(logHz(i / BAR_COUNT));
      view.bars[i] = i ? Math.max(view.bars[i - 1] + 1, bin) : bin; // at least one bin per bar
    }
    return true;
  }

  /** Split the canvas (w × h bitmap pixels) into the panes a mode shows. */
  function panesFor(mode, w, h, gap) {
    if (mode !== 'combined') return [{ draw: DRAW[mode], x: 0, y: 0, w, h }];
    const top = Math.floor((h - gap) / 2);
    const left = Math.floor((w - gap) / 2);
    const bottom = { y: top + gap, h: h - top - gap };
    return [
      { draw: drawOscilloscope, x: 0, y: 0, w, h: top },
      { draw: drawSpectrogram, x: 0, w: left, ...bottom },
      { draw: drawAnalyzer, x: left + gap, w: w - left - gap, ...bottom },
    ];
  }

  /* ------------------------------------------------------------------ *
   * The three views. Each draws inside the pane it is given.           *
   * ------------------------------------------------------------------ */
  function drawSpectrogram({ x, y, w, h }) {
    const { g, canvas, column, rows, lut } = view;
    quick.getByteFrequencyData(freq);
    const step = column.width;
    // Scroll what's there to the left.
    if (w > step) g.drawImage(canvas, x + step, y, w - step, h, x, y, w - step, h);
    const data = column.data;
    for (let row = 0; row < h; row += 1) {
      const from = freq[rows[row]] * 4;
      for (let col = 0; col < step; col += 1) {
        const to = (row * step + col) * 4;
        data[to] = lut[from];
        data[to + 1] = lut[from + 1];
        data[to + 2] = lut[from + 2];
        data[to + 3] = 255;
      }
    }
    g.putImageData(column, x + w - step, y);
  }

  function drawOscilloscope({ x, y, w, h }) {
    const { g, colors } = view;
    const dpr = globalThis.devicePixelRatio || 1;
    analyser.getByteTimeDomainData(wave);

    // Start at a rising zero crossing so a steady tone stands still.
    const span = wave.length / 4; // about 23 ms on screen
    let start = 0;
    for (let i = 1; i < wave.length - span; i += 1) {
      if (wave[i - 1] < 128 && wave[i] >= 128) { start = i; break; }
    }

    const mid = y + h / 2;
    g.clearRect(x, y, w, h);
    g.fillStyle = colors.line;
    g.fillRect(x, Math.round(mid), w, Math.max(1, Math.round(dpr)));

    const points = Math.min(span, w);
    g.beginPath();
    for (let k = 0; k < points; k += 1) {
      const t = k / (points - 1);
      const sample = wave[start + Math.floor(t * (span - 1))];
      const py = mid - ((sample - 128) / 128) * h * 0.46;
      if (k) g.lineTo(x + t * w, py);
      else g.moveTo(x, py);
    }
    g.lineWidth = 2 * dpr;
    g.lineJoin = 'round';
    g.strokeStyle = colors.accent;
    g.stroke();
  }

  function drawAnalyzer({ x, y, w, h }) {
    const { g, colors, bars } = view;
    const dpr = globalThis.devicePixelRatio || 1;
    analyser.getByteFrequencyData(freq);

    g.clearRect(x, y, w, h);
    g.fillStyle = colors.accent;
    const slot = w / BAR_COUNT;
    const barWidth = Math.max(1, slot * 0.7);
    const floor = 2 * dpr; // silent bars stay visible as a baseline
    g.beginPath();
    for (let i = 0; i < BAR_COUNT; i += 1) {
      let peak = 0;
      for (let bin = bars[i]; bin < bars[i + 1]; bin += 1) peak = Math.max(peak, freq[bin]);
      const barHeight = Math.max(floor, (peak / 255) * h * 0.94);
      g.roundRect(x + i * slot + (slot - barWidth) / 2, y + h - barHeight, barWidth, barHeight,
        Math.min(barWidth / 2, 3 * dpr));
    }
    g.fill();
  }

  const DRAW = { spectrogram: drawSpectrogram, oscilloscope: drawOscilloscope, analyzer: drawAnalyzer };
  const MODES = new Set([...Object.keys(DRAW), 'combined']);

  function loop() {
    view.raf = requestAnimationFrame(loop);
    view.frame += 1;
    if (view.frame % 30 === 1) readColors();
    if (!layout()) return;
    for (const pane of view.panes) pane.draw(pane);
  }

  function stop() {
    if (view.raf) cancelAnimationFrame(view.raf);
    view.raf = 0;
  }

  /**
   * Called by content.js whenever anything changes; cheap and idempotent.
   * Draws while `playing`; when paused the last picture stays on screen.
   */
  function sync(canvas, video, mode, playing) {
    if (!MODES.has(mode) || !canvas || !canvas.isConnected) {
      stop();
      view.mode = 'none';
      return;
    }
    if (view.canvas !== canvas) {
      view.canvas = canvas;
      view.g = canvas.getContext('2d');
      view.colorKey = '';
    }
    if (view.mode !== mode) {
      view.mode = mode;
      view.w = 0; // clear the previous view
    }
    const live = attach(video) && playing;
    if (!live) {
      stop();
      return;
    }
    if (!view.raf) {
      view.frame = 0;
      loop();
    }
  }

  globalThis.YLMVisualizer = Object.freeze({ sync, stop });
})();
