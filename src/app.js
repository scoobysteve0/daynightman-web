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
  els.startButton.addEventListener('click', async () => {
    try {
      if (!engine) engine = await createDayNightManEngine(state);
      await engine.start();
      engine.update(state);
      render();
    } catch (error) {
      els.statusText.textContent = `Could not start audio: ${error.message}`;
    }
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

async function createDayNightManEngine(initialState) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();

  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const osc1Gain = ctx.createGain();
  const osc2Gain = ctx.createGain();
  const preMix = ctx.createGain();
  const preFilterGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const shaper = ctx.createWaveShaper();
  const wetGain = ctx.createGain();
  const dryGain = ctx.createGain();
  const feedbackGain = ctx.createGain();
  const delay = ctx.createDelay(2.2);
  const outputGain = ctx.createGain();

  const lfo = ctx.createOscillator();
  const lfoDepth = ctx.createGain();
  const lfoBias = ctx.createConstantSource();
  const edgeGain = ctx.createGain();
  const driftGain = ctx.createGain();
  const motionSum = ctx.createGain();

  osc1.type = 'sine';
  osc2.type = 'sawtooth';
  osc1Gain.gain.value = 0.54;
  osc2Gain.gain.value = 0.46;
  preMix.gain.value = 1;
  preFilterGain.gain.value = 1;
  wetGain.gain.value = 0.2;
  dryGain.gain.value = 0.8;
  feedbackGain.gain.value = 0.2;
  outputGain.gain.value = 0;

  filter.type = 'highpass';
  lfo.type = 'sine';
  lfo.frequency.value = 0.5;
  lfoDepth.gain.value = 0.25;
  lfoBias.offset.value = 0.5;

  osc1.connect(osc1Gain).connect(preMix);
  osc2.connect(osc2Gain).connect(preMix);
  preMix.connect(preFilterGain);
  preFilterGain.connect(filter);
  preFilterGain.connect(dryGain);
  filter.connect(shaper);
  shaper.connect(wetGain);
  shaper.connect(delay);
  delay.connect(wetGain);
  delay.connect(feedbackGain).connect(delay);
  dryGain.connect(outputGain);
  wetGain.connect(outputGain);
  outputGain.connect(ctx.destination);

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

  const api = {
    started: false,
    async start() {
      if (ctx.state === 'suspended') await ctx.resume();
      this.started = true;
    },
    update(next) {
      const power = next.power ? 1 : 0;
      const bite = next.bite / 100;
      const heat = next.heat / 100;
      const edge = next.edge / 100;
      const haze = next.haze / 100;
      const drift = next.drift / 100;
      const space = next.space / 100;
      const night = next.mode === 'night';

      const baseHz = midiToHz(48 + next.pitch);
      const osc2Hz = baseHz * (night ? (1.0025 + haze * 0.025) : (1.45 + bite * 1.15));
      osc1.frequency.setTargetAtTime(baseHz, ctx.currentTime, 0.03);
      osc2.frequency.setTargetAtTime(osc2Hz, ctx.currentTime, 0.03);

      osc2.type = night ? 'triangle' : 'sawtooth';
      filter.type = night ? 'lowpass' : 'highpass';
      filter.frequency.setTargetAtTime(night ? mapRange(haze, 90, 1600) : mapRange(bite, 1000, 6800), ctx.currentTime, 0.04);
      filter.Q.setTargetAtTime(night ? mapRange(space, 2.5, 10) : mapRange(heat, 3.5, 8.5), ctx.currentTime, 0.04);

      lfo.frequency.setTargetAtTime(night ? mapRange(drift, 0.025, 0.18) : mapRange(edge, 0.12, 1.2), ctx.currentTime, 0.04);
      lfoDepth.gain.setTargetAtTime(night ? (0.18 + drift * 0.22) : (0.22 + edge * 0.32), ctx.currentTime, 0.04);
      edgeGain.gain.setTargetAtTime(night ? 0 : (20 + edge * 180), ctx.currentTime, 0.04);
      driftGain.gain.setTargetAtTime(night ? (40 + drift * 240) : (8 + edge * 24), ctx.currentTime, 0.04);

      const wet = clamp(night ? space * 0.68 : space * 0.3, 0, 0.75);
      wetGain.gain.setTargetAtTime(wet, ctx.currentTime, 0.04);
      dryGain.gain.setTargetAtTime(1 - wet, ctx.currentTime, 0.04);
      delay.delayTime.setTargetAtTime(night ? (0.32 + space * 0.22) : (0.08 + edge * 0.12), ctx.currentTime, 0.04);
      feedbackGain.gain.setTargetAtTime(night ? (0.18 + 0.52 * space) : (0.08 + 0.22 * edge), ctx.currentTime, 0.04);

      const drive = night ? (1 + haze * 1.0) : (1.7 + 2.8 * heat);
      shaper.curve = makeDriveCurve(drive * (night ? 18 : 26));
      preFilterGain.gain.setTargetAtTime(night ? (0.62 + 0.18 * drift) : (0.8 + 0.2 * heat), ctx.currentTime, 0.04);
      outputGain.gain.setTargetAtTime(dbToGain(next.output) * power * 0.32, ctx.currentTime, 0.05);
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
