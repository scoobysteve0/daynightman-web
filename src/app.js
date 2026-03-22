// === CONTROL MAPPING DOCUMENTATION ===
// pitch: Pitch offset in semitones (-24 to +24)
// bite: (Dayman) Aggression, filter brightness, harmonic content
// heat: (Dayman) Saturation, drive intensity
// edge: (Dayman) LFO speed, rhythmic movement, delay mix
// haze: (Nightman) Filter softness, blur amount
// drift: (Nightman) Filter movement, LFO depth
// space: (Nightman) Wet/dry, delay time, reverb width
// output: Master volume in dB
// === END CONTROL MAPPING ===

const defaults = {
  power: false,
  mode: 'day',
  pitch: 0,
  bite: 62,
  heat: 58,
  edge: 45,
  haze: 48,
  drift: 36,
  space: 28,
  output: -9,
  preset: 'Prototype Default'
};

const presets = {
  Daybreak: { power: true, mode: 'day', pitch: 0, bite: 66, heat: 60, edge: 51, haze: 18, drift: 24, space: 19, output: -10, preset: 'Daybreak' },
  Nightfog: { power: true, mode: 'night', pitch: -12, bite: 22, heat: 34, edge: 18, haze: 74, drift: 56, space: 63, output: -11, preset: 'Nightfog' },
  Streetlamp: { power: true, mode: 'night', pitch: 7, bite: 40, heat: 48, edge: 22, haze: 62, drift: 49, space: 54, output: -8, preset: 'Streetlamp' },
  Spotlight: { power: true, mode: 'day', pitch: 12, bite: 82, heat: 70, edge: 72, haze: 12, drift: 15, space: 12, output: -7, preset: 'Spotlight' }
};

const state = loadState();
let engine = null;

const valueIds = ['pitch', 'bite', 'heat', 'edge', 'haze', 'drift', 'space', 'output'];
const els = {
  startButton: document.getElementById('startButton'),
  statusText: document.getElementById('statusText'),
  copyLinkButton: document.getElementById('copyLinkButton'),
  powerButton: document.getElementById('powerButton'),
  modeButton: document.getElementById('modeButton'),
  presetList: document.getElementById('presetList')
};

for (const id of valueIds) {
  els[id] = document.getElementById(id);
  els[`${id}Value`] = document.getElementById(`${id}Value`);
}

hydrateControls();
renderPresetButtons();
bindEvents();
render();

function loadState() {
  const url = new URL(window.location.href);
  const encoded = url.searchParams.get('state');
  if (!encoded) return { ...defaults };
  try {
    return { ...defaults, ...JSON.parse(atob(encoded)) };
  } catch {
    return { ...defaults };
  }
}

function saveState() {
  const url = new URL(window.location.href);
  url.searchParams.set('state', btoa(JSON.stringify(state)));
  window.history.replaceState({}, '', url);
}

function hydrateControls() {
  for (const id of valueIds) els[id].value = state[id];
}

function bindEvents() {
  // Tap-to-start: ensure AudioContext is running (required for mobile)
  const initAudio = async () => {
    if (!engine) engine = await createDayNightManEngine(state);
    await engine.start();
    // Auto-enable power on first tap for cleaner mobile UX
    if (!state.power) {
      state.power = true;
      state.preset = 'Custom';
    }
    engine.update(state);
    render();
  };

  // Haptic feedback helper for mobile
  const triggerHaptic = (type = 'light') => {
    if (navigator.vibrate) {
      const duration = type === 'medium' ? 30 : 10;
      navigator.vibrate(duration);
    }
  };

  // Use touchstart for faster mobile response + click fallback
  const startHandler = async (e) => {
    e.preventDefault();
    try {
      triggerHaptic('medium');
      await initAudio();
    } catch (error) {
      els.statusText.textContent = `Could not start audio: ${error.message}`;
    }
  };
  els.startButton.addEventListener('touchstart', startHandler, { passive: false });
  els.startButton.addEventListener('click', startHandler);

  // Power/mode buttons also get touch handling
  ['powerButton', 'modeButton'].forEach(id => {
    const btn = els[id];
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      btn.click();
    }, { passive: false });
  });

  els.copyLinkButton.addEventListener('click', async () => {
    saveState();
    await navigator.clipboard.writeText(window.location.href);
    els.statusText.textContent = 'Share link copied.';
  });

  els.powerButton.addEventListener('click', async () => {
    state.power = !state.power;
    state.preset = 'Custom';
    await ensureEngine();
    engine.update(state);
    syncAndRender();
  });

  els.modeButton.addEventListener('click', async () => {
    state.mode = state.mode === 'day' ? 'night' : 'day';
    state.preset = 'Custom';
    await ensureEngine();
    engine.update(state);
    syncAndRender();
  });

  valueIds.forEach((id) => {
    els[id].addEventListener('input', async (event) => {
      state[id] = Number(event.target.value);
      state.preset = 'Custom';
      await ensureEngine();
      engine.update(state);
      syncAndRender();
    });
  });
}

async function ensureEngine() {
  if (!engine) engine = await createDayNightManEngine(state);
}

function syncAndRender() {
  saveState();
  render();
}

function render() {
  els.pitchValue.textContent = `${state.pitch > 0 ? '+' : ''}${state.pitch} st`;
  els.biteValue.textContent = `${state.bite}%`;
  els.heatValue.textContent = `${state.heat}%`;
  els.edgeValue.textContent = `${state.edge}%`;
  els.hazeValue.textContent = `${state.haze}%`;
  els.driftValue.textContent = `${state.drift}%`;
  els.spaceValue.textContent = `${state.space}%`;
  els.outputValue.textContent = `${state.output} dB`;

  els.powerButton.textContent = state.power ? 'On' : 'Off';
  els.modeButton.textContent = state.mode === 'day' ? 'Dayman' : 'Nightman';
  els.powerButton.classList.toggle('active', state.power);
  els.modeButton.classList.toggle('active', state.mode === 'night');

  // Visual feedback: start button shows audio state
  if (engine?.started) {
    els.startButton.classList.add('audio-active');
    els.startButton.textContent = state.power ? '🔊 Playing' : '⏸ Paused';
  } else {
    els.startButton.classList.remove('audio-active');
    els.startButton.textContent = 'Tap to start audio';
  }

  if (!engine?.started) {
    els.statusText.textContent = 'Audio is stopped. On iPhone, tap the start button first.';
  } else if (!state.power) {
    els.statusText.textContent = 'Audio engine is live, but Power is off.';
  } else {
    els.statusText.textContent = `${state.mode === 'day' ? 'Dayman' : 'Nightman'} running. Preset: ${state.preset}.`;
  }

  renderPresetButtons();
}

function renderPresetButtons() {
  els.presetList.innerHTML = '';
  for (const [name, preset] of Object.entries(presets)) {
    const button = document.createElement('button');
    button.className = 'preset-button';
    button.textContent = name;
    button.addEventListener('click', async () => {
      Object.assign(state, preset);
      hydrateControls();
      await ensureEngine();
      engine.update(state);
      syncAndRender();
    });
    els.presetList.appendChild(button);
  }
}

// Enhanced DSP engine with stronger Dayman vs Nightman contrast
async function createDayNightManEngine(initialState) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();

  // Main oscillators
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const osc1Gain = ctx.createGain();
  const osc2Gain = ctx.createGain();

  // Sub oscillator for depth
  const subOsc = ctx.createOscillator();
  const subGain = ctx.createGain();

  // Pre-processing mix
  const preMix = ctx.createGain();
  const preFilterGain = ctx.createGain();

  // Filter stage - key for timbral shaping
  const filter = ctx.createBiquadFilter();

  // Waveshaper for saturation/drive
  const shaper = ctx.createWaveShaper();

  // Delay/reverb section for space
  const wetGain = ctx.createGain();
  const dryGain = ctx.createGain();
  const feedbackGain = ctx.createGain();
  const delay = ctx.createDelay(2.0);
  const delayFilter = ctx.createBiquadFilter();

  // LFO for movement
  const lfo = ctx.createOscillator();
  const lfoDepth = ctx.createGain();
  const lfoBias = ctx.createConstantSource();
  const edgeGain = ctx.createGain();
  const driftGain = ctx.createGain();
  const motionSum = ctx.createGain();

  // Master output
  const outputGain = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();

  // Initial routing
  osc1.type = 'sine';
  osc2.type = 'sawtooth';
  subOsc.type = 'sine';
  subOsc.frequency.value = 0.5; // octave below

  osc1Gain.gain.value = 0.5;
  osc2Gain.gain.value = 0.35;
  subGain.gain.value = 0.15;

  preMix.gain.value = 1;
  preFilterGain.gain.value = 1;

  filter.type = 'highpass';
  filter.Q.value = 1;

  wetGain.gain.value = 0.15;
  dryGain.gain.value = 0.85;
  feedbackGain.gain.value = 0.25;
  delay.delayTime.value = 0.3;
  delayFilter.type = 'lowpass';
  delayFilter.frequency.value = 3000;

  lfo.type = 'sine';
  lfo.frequency.value = 0.5;
  lfoDepth.gain.value = 0.2;
  lfoBias.offset.value = 0.5;

  outputGain.gain.value = 0;
  compressor.threshold.value = -12;
  compressor.knee.value = 10;
  compressor.ratio.value = 4;

  // Connect audio graph
  osc1.connect(osc1Gain).connect(preMix);
  osc2.connect(osc2Gain).connect(preMix);
  subOsc.connect(subGain).connect(preMix);

  preMix.connect(preFilterGain);
  preFilterGain.connect(filter);
  preFilterGain.connect(dryGain);

  filter.connect(shaper);
  shaper.connect(wetGain);
  shaper.connect(delay);
  delay.connect(delayFilter).connect(wetGain);
  delay.connect(feedbackGain).connect(delay);

  dryGain.connect(outputGain);
  wetGain.connect(outputGain);
  outputGain.connect(compressor);
  compressor.connect(ctx.destination);

  // LFO modulation routing
  lfo.connect(lfoDepth).connect(motionSum);
  lfoBias.connect(motionSum);
  motionSum.connect(edgeGain.gain);
  motionSum.connect(driftGain.gain);
  lfo.start();
  lfoBias.start();

  edgeGain.connect(osc2.detune);
  driftGain.connect(filter.detune);

  osc1.start();
  osc2.start();
  subOsc.start();

  const api = {
    started: false,
    async start() {
      if (ctx.state === 'suspended') await ctx.resume();
      this.started = true;
    },
    update(next) {
      const power = next.power ? 1 : 0;
      const bite = next.bite / 100;      // Day: aggression, grit
      const heat = next.heat / 100;      // Saturation, drive
      const edge = next.edge / 100;       // Day: harmonic content
      const haze = next.haze / 100;      // Night: softness, blur
      const drift = next.drift / 100;    // Filter movement amount
      const space = next.space / 100;    // Wet/dry, width
      const night = next.mode === 'night';

      // Base pitch
      const baseNote = 48 + next.pitch;
      const baseHz = midiToHz(baseNote);

      // === DAYMAN vs NIGHTMAN TIMBRE CONTRAST ===
      if (night) {
        // NIGHTMAN: darker, wider, hazier, ambient
        osc2.type = 'triangle';
        filter.type = 'lowpass';

        // Filter opens with haze (darker base, opens up with more haze)
        const nightFilterFreq = mapRange(haze, 150, 2200);
        filter.frequency.setTargetAtTime(nightFilterFreq, ctx.currentTime, 0.05);
        filter.Q.setTargetAtTime(mapRange(space, 0.5, 8), ctx.currentTime, 0.05);

        // Sub oscillator prominent in night
        subGain.gain.setTargetAtTime(0.25 + haze * 0.2, ctx.currentTime, 0.05);
        osc2.frequency.setTargetAtTime(baseHz * 1.002, ctx.currentTime, 0.05);
        osc1.frequency.setTargetAtTime(baseHz, ctx.currentTime, 0.05);

        // LFO slower, more ambient in night
        lfo.frequency.setTargetAtTime(mapRange(drift, 0.03, 0.25), ctx.currentTime, 0.05);
        lfoDepth.gain.setTargetAtTime(0.15 + drift * 0.3, ctx.currentTime, 0.05);
        driftGain.gain.setTargetAtTime(drift * 150, ctx.currentTime, 0.05);
        edgeGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05); // no edge in night

        // More space/wet in night
        const nightWet = mapRange(space, 0.1, 0.65);
        wetGain.gain.setTargetAtTime(nightWet, ctx.currentTime, 0.05);
        dryGain.gain.setTargetAtTime(1 - nightWet, ctx.currentTime, 0.05);
        delay.delayTime.setTargetAtTime(mapRange(space, 0.2, 0.8), ctx.currentTime, 0.05);
        feedbackGain.gain.setTargetAtTime(mapRange(space, 0.1, 0.6), ctx.currentTime, 0.05);

        // Softer drive in night
        const nightDrive = 1 + haze * 0.8;
        shaper.curve = makeDriveCurve(nightDrive * 12);
        preFilterGain.gain.setTargetAtTime(0.7 + drift * 0.15, ctx.currentTime, 0.05);

      } else {
        // DAYMAN: brighter, tighter, more aggressive
        osc2.type = 'sawtooth';
        filter.type = 'highpass';

        // Filter opens with bite (brighter base, more responsive)
        const dayFilterFreq = mapRange(bite, 800, 7500);
        filter.frequency.setTargetAtTime(dayFilterFreq, ctx.currentTime, 0.05);
        filter.Q.setTargetAtTime(mapRange(heat, 1, 9), ctx.currentTime, 0.05);

        // Sub less prominent in day
        subGain.gain.setTargetAtTime(0.08 + bite * 0.1, ctx.currentTime, 0.05);
        osc2.frequency.setTargetAtTime(baseHz * (1.5 + bite * 1.0), ctx.currentTime, 0.05);
        osc1.frequency.setTargetAtTime(baseHz, ctx.currentTime, 0.05);

        // LFO faster, more rhythmic in day
        lfo.frequency.setTargetAtTime(mapRange(edge, 0.15, 1.8), ctx.currentTime, 0.05);
        lfoDepth.gain.setTargetAtTime(0.2 + edge * 0.4, ctx.currentTime, 0.05);
        edgeGain.gain.setTargetAtTime(edge * 120, ctx.currentTime, 0.05);
        driftGain.gain.setTargetAtTime(drift * 40, ctx.currentTime, 0.05);

        // Less space/wet in day (tighter)
        const dayWet = mapRange(space, 0.05, 0.35);
        wetGain.gain.setTargetAtTime(dayWet, ctx.currentTime, 0.05);
        dryGain.gain.setTargetAtTime(1 - dayWet, ctx.currentTime, 0.05);
        delay.delayTime.setTargetAtTime(mapRange(edge, 0.06, 0.2), ctx.currentTime, 0.05);
        feedbackGain.gain.setTargetAtTime(mapRange(edge, 0.05, 0.3), ctx.currentTime, 0.05);

        // Stronger drive in day
        const dayDrive = 1 + heat * 2.5;
        shaper.curve = makeDriveCurve(dayDrive * 22);
        preFilterGain.gain.setTargetAtTime(0.75 + heat * 0.2, ctx.currentTime, 0.05);
      }

      // Output level with soft knee
      outputGain.gain.setTargetAtTime(dbToGain(next.output) * power * 0.28, ctx.currentTime, 0.05);
    }
  };

  api.update(initialState);
  return api;
}

function midiToHz(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}
function dbToGain(db) {
  return Math.pow(10, db / 20);
}
function mapRange(v, min, max) {
  return min + (max - min) * v;
}
function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
function makeDriveCurve(amount) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(x * amount);
  }
  return curve;
}
