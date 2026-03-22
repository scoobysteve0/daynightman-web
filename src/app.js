// === CONTROL MAPPING DOCUMENTATION ===
// pitch: Pitch offset in semitones (-24 to +24)
// bite: (Dayman) Aggression, filter brightness, harmonic content
// heat: (Dayman) Saturation, drive intensity
// edge: (Dayman) LFO speed, rhythmic movement, delay mix
// pulse: Wave modulation speed (Dayman: fast/sync, Nightman: slow/ambient)
// haze: (Nightman) Filter softness, blur amount
// drift: (Nightman) Filter movement, LFO depth
// space: (Nightman) Wet/dry, delay time, reverb width
// output: Master volume in dB
// shade: Momentary gesture - hold to darken (works in both modes)
// === END CONTROL MAPPING ===

const defaults = {
  power: false,
  mode: 'day',
  shade: false,
  pitch: 0,
  bite: 62,
  heat: 58,
  edge: 45,
  pulse: 40,
  haze: 48,
  drift: 36,
  space: 28,
  output: -9,
  preset: 'Prototype Default'
};

const presets = {
  Daybreak: { power: true, mode: 'day', pitch: 0, bite: 66, heat: 60, edge: 51, pulse: 45, haze: 18, drift: 24, space: 19, output: -10, preset: 'Daybreak' },
  Nightfog: { power: true, mode: 'night', pitch: -12, bite: 22, heat: 34, edge: 18, pulse: 25, haze: 74, drift: 56, space: 63, output: -11, preset: 'Nightfog' },
  Streetlamp: { power: true, mode: 'night', pitch: 7, bite: 40, heat: 48, edge: 22, pulse: 30, haze: 62, drift: 49, space: 54, output: -8, preset: 'Streetlamp' },
  Spotlight: { power: true, mode: 'day', pitch: 12, bite: 82, heat: 70, edge: 72, pulse: 60, haze: 12, drift: 15, space: 12, output: -7, preset: 'Spotlight' }
};

const state = loadState();
let engine = null;

const valueIds = ['pitch', 'bite', 'heat', 'edge', 'pulse', 'haze', 'drift', 'space', 'output'];
const els = {
  startButton: document.getElementById('startButton'),
  statusText: document.getElementById('statusText'),
  copyLinkButton: document.getElementById('copyLinkButton'),
  powerButton: document.getElementById('powerButton'),
  modeButton: document.getElementById('modeButton'),
  shadeButton: document.getElementById('shadeButton'),
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

  // Power/mode buttons get touch handling for faster mobile response.
  ['powerButton', 'modeButton'].forEach(id => {
    const btn = els[id];
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      btn.click();
    }, { passive: false });
  });

  // Shade is a real hold control. Use pointer events so mouse/touch/pen all behave the same.
  let shadePressed = false;
  const setShade = (pressed) => {
    if (shadePressed === pressed) return;
    shadePressed = pressed;
    state.shade = pressed;
    if (engine) engine.update(state);
    syncAndRender();
  };

  els.shadeButton.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    els.shadeButton.setPointerCapture?.(e.pointerId);
    setShade(true);
  });
  els.shadeButton.addEventListener('pointerup', (e) => {
    e.preventDefault();
    setShade(false);
  });
  els.shadeButton.addEventListener('pointercancel', () => setShade(false));
  els.shadeButton.addEventListener('lostpointercapture', () => setShade(false));
  els.shadeButton.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && (e.buttons & 1) !== 1) setShade(false);
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
  els.pulseValue.textContent = `${state.pulse}%`;
  els.hazeValue.textContent = `${state.haze}%`;
  els.driftValue.textContent = `${state.drift}%`;
  els.spaceValue.textContent = `${state.space}%`;
  els.outputValue.textContent = `${state.output} dB`;

  els.powerButton.textContent = state.power ? 'On' : 'Off';
  els.modeButton.textContent = state.mode === 'day' ? 'Dayman' : 'Nightman';
  els.powerButton.classList.toggle('active', state.power);
  els.modeButton.classList.toggle('active', state.mode === 'night');
  els.shadeButton.classList.toggle('active', state.shade);
  els.shadeButton.classList.toggle('shade-active', state.shade);
  els.shadeButton.textContent = state.shade ? 'Active' : 'Hold';

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
    const shadeNote = state.shade ? ' [Shade active]' : '';
    els.statusText.textContent = `${state.mode === 'day' ? 'Dayman' : 'Nightman'} running. Preset: ${state.preset}.${shadeNote}`;
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

// Enhanced DSP engine - Lyra-8 inspired Dayman + Audra-2 inspired Nightman
async function createDayNightManEngine(initialState) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const now = ctx.currentTime;

  // === LYRA-8 INSPIRED DAYMAN VOICE ===
  // Multiple detuned sines for drone cluster, subtle noise, phase variation
  const dayOscs = [];
  const dayOscGains = [];
  const dayDetuneBase = [0, 3, 7, 10, 14, 17, 21, 24]; // spread intervals
  for (let i = 0; i < 4; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.detune.value = dayDetuneBase[i] + (Math.random() - 0.5) * 4;
    const gain = ctx.createGain();
    gain.gain.value = 0.25 - i * 0.03;
    dayOscs.push(osc);
    dayOscGains.push(gain);
  }

  // Sub for grounding
  const subOsc = ctx.createOscillator();
  subOsc.type = 'sine';
  const subGain = ctx.createGain();

  // Dayman noise layer (subtle texture)
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) {
    noiseData[i] = (Math.random() * 2 - 1) * 0.02;
  }
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  noiseSource.loop = true;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 3000;
  noiseFilter.Q.value = 0.5;

  // === NIGHTMAN VOICE (Audra-2 inspired dark ambient) ===
  const nightOsc1 = ctx.createOscillator();
  const nightOsc2 = ctx.createOscillator();
  nightOsc1.type = 'sine';
  nightOsc2.type = 'triangle';
  const nightGain1 = ctx.createGain();
  const nightGain2 = ctx.createGain();

  // === SHARED SIGNAL PATH ===
  const preMix = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const shaper = ctx.createWaveShaper();
  const postFilterGain = ctx.createGain();

  // === SPACE SECTION ===
  // Delay
  const delay = ctx.createDelay(2.5);
  const delayFeedback = ctx.createGain();
  const delayWet = ctx.createGain();
  const delayFilter = ctx.createBiquadFilter();
  delayFilter.type = 'lowpass';
  delayFilter.frequency.value = 4000;

  // Subtle reverb using delay network (no convolver for performance)
  const reverbDelay1 = ctx.createDelay(0.1);
  const reverbDelay2 = ctx.createDelay(0.15);
  const reverbDelay3 = ctx.createDelay(0.2);
  const reverbFeedback = ctx.createGain();
  const reverbWet = ctx.createGain();
  reverbDelay1.delayTime.value = 0.07;
  reverbDelay2.delayTime.value = 0.11;
  reverbDelay3.delayTime.value = 0.16;
  reverbFeedback.gain.value = 0.25;

  const dryGain = ctx.createGain();
  const outputGain = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();

  // === LFO SECTION ===
  const lfo = ctx.createOscillator();
  const lfoDepth = ctx.createGain();
  const lfoBias = ctx.createConstantSource();
  lfo.type = 'sine';
  lfoBias.offset.value = 0.5;

  // Modulation targets
  const filterMod = ctx.createGain();
  const pitchMod = ctx.createGain();
  const phaseMod = ctx.createGain(); // for subtle drift

  // Random instability generator
  let instabilitySeed = 0;
  const updateInstability = () => {
    instabilitySeed += 0.001;
    return Math.sin(instabilitySeed * 12345.6789) * 2;
  };

  // === WIRING ===
  // Day oscillators → preMix
  dayOscs.forEach((osc, i) => osc.connect(dayOscGains[i]).connect(preMix));
  subOsc.connect(subGain).connect(preMix);
  noiseSource.connect(noiseFilter).connect(noiseGain).connect(preMix);

  // Night oscillators → preMix (switched)
  nightOsc1.connect(nightGain1).connect(preMix);
  nightOsc2.connect(nightGain2).connect(preMix);

  // Shared path
  preMix.connect(filter);
  filter.connect(postFilterGain);
  postFilterGain.connect(shaper);
  shaper.connect(dryGain);
  shaper.connect(delay);

  // Delay network
  delay.connect(delayFilter).connect(delayWet);
  delay.connect(delayFeedback).connect(delay);
  delayFeedback.gain.value = 0.3;

  // Reverb network (subtle)
  shaper.connect(reverbDelay1);
  shaper.connect(reverbDelay2);
  shaper.connect(reverbDelay3);
  reverbDelay1.connect(reverbWet);
  reverbDelay2.connect(reverbWet);
  reverbDelay3.connect(reverbWet);
  reverbDelay1.connect(reverbFeedback).connect(reverbDelay2);
  reverbDelay2.connect(reverbFeedback).connect(reverbDelay3);
  reverbDelay3.connect(reverbFeedback).connect(reverbDelay1);
  reverbFeedback.gain.value = 0.2;

  // To output
  dryGain.connect(outputGain);
  delayWet.connect(outputGain);
  reverbWet.connect(outputGain);
  outputGain.connect(compressor);
  compressor.connect(ctx.destination);

  // LFO modulation
  lfo.connect(lfoDepth).connect(filterMod.gain);
  lfoBias.connect(filterMod.gain);
  lfoDepth.connect(pitchMod.gain);
  filterMod.connect(filter.detune);
  pitchMod.connect(dayOscs[0].detune);

  // Start oscillators
  dayOscs.forEach(osc => osc.start());
  subOsc.start();
  noiseSource.start();
  nightOsc1.start();
  nightOsc2.start();
  lfo.start();
  lfoBias.start();

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
      const pulse = next.pulse / 100;
      const haze = next.haze / 100;
      const drift = next.drift / 100;
      const space = next.space / 100;
      const night = next.mode === 'night';
      const shade = next.shade || false;

      const baseNote = 48 + next.pitch;
      const baseHz = midiToHz(baseNote);

      // Add subtle instability
      const instability = updateInstability();

      // === SHADE GESTURE - dampen like hand over strings ===
      // Smooth attack/release for musical feel, not clicky
      // While held: tuck live level, darken filter, reduce wet/delay sends but keep tails
      const shadeAttack = shade ? 0.12 : 0.25; // smooth transitions
      const shadeLevelDb = shade ? -9 : 0; // noticeable tuck, not hard kill
      const shadeFilterFreq = shade ? 0.35 : 1.0; // darken filter
      const shadeWet = shade ? 0.55 : 1.0; // reduce wet sends, keep tails

      if (night) {
        // === NIGHTMAN (Audra-2 inspired) ===
        // Keep mostly intact, preserve dark ambient
        nightGain1.gain.setTargetAtTime(0.35, ctx.currentTime, 0.05);
        nightGain2.gain.setTargetAtTime(0.25 + haze * 0.2, ctx.currentTime, 0.05);

        nightOsc1.frequency.setTargetAtTime(baseHz * 0.998 + instability, ctx.currentTime, 0.05);
        nightOsc2.frequency.setTargetAtTime(baseHz * (1.002 + haze * 0.02), ctx.currentTime, 0.05);

        filter.type = 'lowpass';
        const nightBaseFilter = mapRange(haze, 200, 1800);
        const nightShadeFilter = nightBaseFilter * shadeFilterFreq;
        filter.frequency.setTargetAtTime(clamp(nightShadeFilter, 120, 1800), ctx.currentTime, shadeAttack);
        filter.Q.setTargetAtTime(mapRange(space, 0.5, 6) * (shade ? 0.7 : 1), ctx.currentTime, shadeAttack);

        // Night LFO - slow, ambient
        const nightPulse = mapRange(pulse, 0.02, 0.3);
        lfo.frequency.setTargetAtTime(nightPulse, ctx.currentTime, 0.05);
        lfoDepth.gain.setTargetAtTime(mapRange(drift, 0.1, 0.35), ctx.currentTime, 0.05);
        filterMod.gain.setTargetAtTime(drift * 180, ctx.currentTime, 0.05);

        // Night delay/reverb - wider, reduce wet on shade
        const nightSpace = mapRange(space, 0.15, 0.7) * shadeWet;
        delayWet.gain.setTargetAtTime(nightSpace * 0.7, ctx.currentTime, shadeAttack);
        dryGain.gain.setTargetAtTime(1 - nightSpace * 0.5, ctx.currentTime, shadeAttack);
        delay.delayTime.setTargetAtTime(mapRange(space, 0.25, 0.9), ctx.currentTime, shadeAttack);
        delayFeedback.gain.setTargetAtTime(mapRange(space, 0.15, 0.55) * (shade ? 0.65 : 1), ctx.currentTime, shadeAttack);

        // Subtle reverb for night - reduce but keep tails
        reverbWet.gain.setTargetAtTime(space * 0.12 * shadeWet, ctx.currentTime, shadeAttack);

        // Night drive - soft
        shaper.curve = makeDriveCurve((1 + haze * 0.6) * 10 * (shade ? 0.75 : 1));

        // Disable day oscs
        dayOscGains.forEach(g => g.gain.setTargetAtTime(0, ctx.currentTime, shadeAttack));
        noiseGain.gain.setTargetAtTime(0, ctx.currentTime, shadeAttack);
        subGain.gain.setTargetAtTime((0.3 + haze * 0.15) * (shade ? 0.8 : 1), ctx.currentTime, shadeAttack);

      } else {
        // === DAYMAN (Lyra-8 inspired) ===
        // Airy, droney, tactile, unstable, alive

        // Enable day oscs with spread
        dayOscGains.forEach((g, i) => {
          g.gain.setTargetAtTime((0.22 - i * 0.03) * (shade ? 0.8 : 1), ctx.currentTime, 0.05);
        });

        // More detune spread
        const detuneSpread = bite * 25;
        dayOscs.forEach((osc, i) => {
          const baseDetune = dayDetuneBase[i] * detuneSpread / 20;
          osc.detune.setTargetAtTime(baseDetune + instability * 3, ctx.currentTime, 0.05);
        });
        dayOscs[0].frequency.setTargetAtTime(baseHz, ctx.currentTime, 0.05);
        dayOscs[1].frequency.setTargetAtTime(baseHz * 1.003 + instability, ctx.currentTime, 0.05);
        dayOscs[2].frequency.setTargetAtTime(baseHz * 1.007, ctx.currentTime, 0.05);
        dayOscs[3].frequency.setTargetAtTime(baseHz * 1.012, ctx.currentTime, 0.05);

        // Subtle noise layer for air - reduce while shaded
        noiseGain.gain.setTargetAtTime(bite * 0.015 * (shade ? 0.5 : 1), ctx.currentTime, shadeAttack);
        noiseFilter.frequency.setTargetAtTime(2000 + bite * 2000, ctx.currentTime, shadeAttack);

        // Filter - airy, not harsh, darken on shade
        filter.type = 'bandpass';
        const dayBaseFilter = mapRange(bite, 400, 2500);
        const dayShadeFilter = dayBaseFilter * shadeFilterFreq;
        filter.frequency.setTargetAtTime(clamp(dayShadeFilter, 180, 2500), ctx.currentTime, shadeAttack);
        filter.Q.setTargetAtTime((0.8 + heat * 1.5) * (shade ? 0.85 : 1), ctx.currentTime, shadeAttack);

        // Pulse controls LFO rate
        const dayPulse = mapRange(pulse, 0.08, 1.5);
        lfo.frequency.setTargetAtTime(dayPulse, ctx.currentTime, shadeAttack);
        lfoDepth.gain.setTargetAtTime(0.15 + edge * 0.35, ctx.currentTime, shadeAttack);
        filterMod.gain.setTargetAtTime(edge * 60 + drift * 30, ctx.currentTime, shadeAttack);

        // Day delay - interacts with tone, reduce wet on shade
        const daySpace = mapRange(space, 0.05, 0.4) * shadeWet;
        delayWet.gain.setTargetAtTime(daySpace * 0.5, ctx.currentTime, shadeAttack);
        dryGain.gain.setTargetAtTime(1 - daySpace * 0.3, ctx.currentTime, shadeAttack);
        delay.delayTime.setTargetAtTime(mapRange(edge, 0.08, 0.25), ctx.currentTime, shadeAttack);
        delayFeedback.gain.setTargetAtTime(mapRange(edge, 0.08, 0.35) * (shade ? 0.6 : 1), ctx.currentTime, shadeAttack);

        // Subtle reverb for day - reduce but keep tails
        reverbWet.gain.setTargetAtTime(space * 0.06 * shadeWet, ctx.currentTime, shadeAttack);

        // Day drive - warm, not harsh, reduce on shade
        const dayDrive = 1 + heat * 1.8;
        shaper.curve = makeDriveCurve(dayDrive * 8 * (shade ? 0.7 : 1));

        // Sub in day
        subGain.gain.setTargetAtTime((0.1 + bite * 0.08) * (shade ? 0.75 : 1), ctx.currentTime, shadeAttack);
        subOsc.frequency.setTargetAtTime(baseHz * 0.5, ctx.currentTime, shadeAttack);

        // Disable night oscs
        nightGain1.gain.setTargetAtTime(0, ctx.currentTime, shadeAttack);
        nightGain2.gain.setTargetAtTime(0, ctx.currentTime, shadeAttack);
      }

      // Output with shade - smooth level tuck
      outputGain.gain.setTargetAtTime(dbToGain(next.output + shadeLevelDb) * power * 0.25, ctx.currentTime, shadeAttack);
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
