// === DayNightMan - Modular Morph UI ===
// Controls map to sound: morph (0=day/1=night) drives visual + DSP simultaneously

const defaults = {
  power: false,
  morph: 0, // 0 = day, 1 = night
  pitch: 0,
  bite: 62,   // Day: brightness
  heat: 58,   // Day: drive
  edge: 45,   // Day: LFO rate
  pulse: 40,  // shared
  haze: 48,   // Night: filter softness
  drift: 36,  // Night: filter movement
  space: 28,  // Night: wet/dry
  output: -9,
  preset: 'Prototype Default'
};

const presets = {
  Daybreak: { morph: 0, pitch: 0, bite: 66, heat: 60, edge: 51, pulse: 45, haze: 18, drift: 24, space: 19, output: -10, preset: 'Daybreak' },
  Nightfog: { morph: 1, pitch: -12, bite: 22, heat: 34, edge: 18, pulse: 25, haze: 74, drift: 56, space: 63, output: -11, preset: 'Nightfog' },
  Streetlamp: { morph: 1, pitch: 7, bite: 40, heat: 48, edge: 22, pulse: 30, haze: 62, drift: 49, space: 54, output: -8, preset: 'Streetlamp' },
  Spotlight: { morph: 0, pitch: 12, bite: 82, heat: 70, edge: 72, pulse: 60, haze: 12, drift: 15, space: 12, output: -7, preset: 'Spotlight' }
};

const state = loadState();
let engine = null;

// Parameter definitions for knobs
const params = ['bite', 'heat', 'edge', 'pulse', 'haze', 'drift', 'space', 'output'];

const els = {
  startButton: document.getElementById('startButton'),
  statusText: document.getElementById('statusText'),
  presetList: document.getElementById('presetList'),
  morphThumb: document.getElementById('morphThumb'),
  morphFill: document.getElementById('morphFill'),
  pitchWheel: document.getElementById('pitchWheel')
};

// Get knob elements
document.querySelectorAll('[data-knob]').forEach(knob => {
  const param = knob.dataset.knob;
  els[param] = knob;
  els[`${param}Value`] = document.getElementById(`${param}Value`);
});

hydrateControls();
renderPresetButtons();
bindEvents();
render();

// Initial UI sync
updateMorphUI();
updatePitchUI();

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
  // Sync knob visuals
  params.forEach(param => {
    const value = state[param];
    updateKnobVisual(param, value);
  });
}

// Update a knob's visual rotation based on value
function updateKnobVisual(param, value) {
  const knob = els[param];
  if (!knob) return;
  
  const line = knob.querySelector('.knob-line');
  if (!line) return;
  
  // Map 0-100 to -135° to +135° (270° range)
  const percent = value / 100;
  const angle = -135 + (percent * 270);
  
  // Calculate line endpoint using trigonometry
  const radians = (angle - 90) * (Math.PI / 180);
  const radius = 26;
  const x2 = 40 + radius * Math.cos(radians);
  const y2 = 40 + radius * Math.sin(radians);
  
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
}

function bindEvents() {
  let audioInitialized = false;
  let audioInitPromise = null;

  // === AUDIO START ===
  const initAudio = async () => {
    if (audioInitPromise) return audioInitPromise;

    audioInitPromise = (async () => {
      try {
        els.statusText.textContent = 'Starting...';
        if (!engine) engine = await createDayNightManEngine(state);
        await engine.start();
        state.power = true;
        state.preset = 'Custom';
        engine.update(state);
        audioInitialized = true;
        render();
        els.statusText.textContent = 'Tap play';
      } catch (error) {
        console.error('Audio init failed:', error);
        els.statusText.textContent = `Error: ${error.message}`;
        audioInitialized = false;
        audioInitPromise = null;
      }
    })();
    return audioInitPromise;
  };

  const startHandler = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    triggerHaptic('medium');
    
    if (audioInitialized) {
      state.power = !state.power;
      state.preset = 'Custom';
      if (engine) engine.update(state);
      saveState();
      render();
      return;
    }
    
    try {
      await initAudio();
    } catch (error) {
      els.statusText.textContent = `Could not start: ${error.message}`;
    }
  };

  els.startButton.addEventListener('click', startHandler);

  // === KNOB CONTROLS ===
  params.forEach(param => {
    const knob = els[param];
    if (!knob) return;
    
    let knobValue = state[param];
    let isDragging = false;
    let startY = 0;
    let startValue = 0;
    
    const onPointerDown = (e) => {
      e.preventDefault();
      isDragging = true;
      startY = e.clientY;
      startValue = knobValue;
      knob.setPointerCapture?.(e.pointerId);
      triggerHaptic('light');
    };
    
    const onPointerMove = (e) => {
      if (!isDragging) return;
      const delta = startY - e.clientY;
      const sensitivity = 0.8;
      let newValue = startValue + delta * sensitivity;
      newValue = Math.max(0, Math.min(100, newValue));
      knobValue = Math.round(newValue);
      state[param] = knobValue;
      state.preset = 'Custom';
      updateKnobVisual(param, knobValue);
      
      const valueEl = els[`${param}Value`];
      if (valueEl) {
        if (param === 'output') {
          valueEl.textContent = `${knobValue - 24}dB`; // -24 to 0
        } else {
          valueEl.textContent = `${knobValue}%`;
        }
      }
    };
    
    const onPointerUp = async () => {
      if (!isDragging) return;
      isDragging = false;
      await ensureEngine();
      engine.update(state);
      saveState();
    };
    
    knob.addEventListener('pointerdown', onPointerDown);
    knob.addEventListener('pointermove', onPointerMove);
    knob.addEventListener('pointerup', onPointerUp);
    knob.addEventListener('pointercancel', onPointerUp);
    knob.addEventListener('lostpointercapture', onPointerUp);
  });

  // === MORPH SLIDER ===
  const morphTrack = document.querySelector('.morph-track');
  let morphDragging = false;
  
  const updateMorphFromEvent = (clientY) => {
    const rect = morphTrack.getBoundingClientRect();
    let percent = 1 - (clientY - rect.top) / rect.height;
    percent = Math.max(0, Math.min(1, percent));
    state.morph = percent;
    state.preset = 'Custom';
    updateMorphUI();
    return percent;
  };
  
  const onMorphPointerDown = (e) => {
    e.preventDefault();
    morphDragging = true;
    const percent = updateMorphFromEvent(e.clientY);
    els.morphThumb.setPointerCapture?.(e.pointerId);
    triggerHaptic('light');
    ensureEngine().then(() => {
      engine.update(state);
      saveState();
    });
  };
  
  const onMorphPointerMove = (e) => {
    if (!morphDragging) return;
    updateMorphFromEvent(e.clientY);
    ensureEngine().then(() => {
      engine.update(state);
      saveState();
    });
  };
  
  const onMorphPointerUp = () => {
    morphDragging = false;
    saveState();
  };
  
  els.morphThumb.addEventListener('pointerdown', onMorphPointerDown);
  els.morphThumb.addEventListener('pointermove', onMorphPointerMove);
  els.morphThumb.addEventListener('pointerup', onMorphPointerUp);
  els.morphThumb.addEventListener('pointercancel', onMorphPointerUp);
  els.morphThumb.addEventListener('lostpointercapture', onMorphPointerUp);

  // === PITCH WHEEL ===
  let pitchDragging = false;
  let pitchStartAngle = 0;
  let pitchStartValue = 0;
  
  const getAngle = (cx, cy, x, y) => {
    return Math.atan2(y - cy, x - cx) * (180 / Math.PI);
  };
  
  const onPitchPointerDown = (e) => {
    e.preventDefault();
    pitchDragging = true;
    const rect = els.pitchWheel.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    pitchStartAngle = getAngle(cx, cy, e.clientX, e.clientY);
    pitchStartValue = state.pitch;
    els.pitchWheel.setPointerCapture?.(e.pointerId);
    triggerHaptic('light');
  };
  
  const onPitchPointerMove = async (e) => {
    if (!pitchDragging) return;
    const rect = els.pitchWheel.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const currentAngle = getAngle(cx, cy, e.clientX, e.clientY);
    let delta = currentAngle - pitchStartAngle;
    
    // Wrap delta to -180 to 180
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    
    // Convert angle to semitones (full rotation = 24 semitones)
    const semitones = Math.round((delta / 360) * 24);
    let newPitch = pitchStartValue + semitones;
    newPitch = Math.max(-24, Math.min(24, newPitch));
    
    state.pitch = newPitch;
    state.preset = 'Custom';
    updatePitchUI();
    
    await ensureEngine();
    engine.update(state);
    saveState();
  };
  
  const onPitchPointerUp = () => {
    pitchDragging = false;
    saveState();
  };
  
  els.pitchWheel.addEventListener('pointerdown', onPitchPointerDown);
  els.pitchWheel.addEventListener('pointermove', onPitchPointerMove);
  els.pitchWheel.addEventListener('pointerup', onPitchPointerUp);
  els.pitchWheel.addEventListener('pointercancel', onPitchPointerUp);
  els.pitchWheel.addEventListener('lostpointercapture', onPitchPointerUp);
}

function updateMorphUI() {
  const m = state.morph;
  const thumb = els.morphThumb;
  const fill = els.morphFill;
  
  // Position thumb (0 = bottom, 1 = top)
  const bottom = 0;
  const top = 156; // 180 - 24 (thumb height)
  const pos = bottom + m * (top - bottom);
  thumb.style.bottom = `${pos}px`;
  
  // Fill height
  fill.style.height = `${m * 100}%`;
  
  // Body class for theming
  if (m > 0.5) {
    document.body.classList.add('night-mode');
  } else {
    document.body.classList.remove('night-mode');
  }
  
  // Update status text
  const modeName = m < 0.3 ? 'Day' : m > 0.7 ? 'Night' : 'Hybrid';
  if (engine?.started && state.power) {
    els.statusText.textContent = `${modeName} mode • ${state.pitch > 0 ? '+' : ''}${state.pitch} st`;
  }
}

function updatePitchUI() {
  const pitchEl = document.getElementById('pitchValue');
  if (pitchEl) {
    const p = state.pitch;
    pitchEl.textContent = p === 0 ? '0' : (p > 0 ? `+${p}` : `${p}`);
  }
}

async function ensureEngine() {
  if (!engine) engine = await createDayNightManEngine(state);
}

function syncAndRender() {
  saveState();
  render();
}

function render() {
  // Start button state
  if (engine?.started) {
    els.startButton.classList.add('audio-active');
    els.startButton.textContent = state.power ? 'Play' : 'Paused';
  } else {
    els.startButton.classList.remove('audio-active');
    els.startButton.textContent = 'Tap to start';
  }

  // Status
  if (!engine?.started) {
    els.statusText.textContent = 'Tap start to play';
  } else if (!state.power) {
    els.statusText.textContent = 'Tap to play';
  }

  renderPresetButtons();
}

function renderPresetButtons() {
  els.presetList.innerHTML = '';
  for (const [name, preset] of Object.entries(presets)) {
    const button = document.createElement('button');
    button.className = 'preset-button' + (state.preset === name ? ' active' : '');
    button.textContent = name;
    button.addEventListener('click', async () => {
      Object.assign(state, preset);
      hydrateControls();
      updateMorphUI();
      updatePitchUI();
      await ensureEngine();
      engine.update(state);
      syncAndRender();
    });
    els.presetList.appendChild(button);
  }
}

// === DSP ENGINE ===
async function createDayNightManEngine(initialState) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();

  // === DAY OSCILLATORS (Lyra-8 style cluster) ===
  const dayOscs = [];
  const dayOscGains = [];
  const dayDetuneBase = [0, 3, 7, 10, 14, 17, 21, 24];
  for (let i = 0; i < 4; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.detune.value = dayDetuneBase[i] + (Math.random() - 0.5) * 4;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    dayOscs.push(osc);
    dayOscGains.push(gain);
  }

  const subOsc = ctx.createOscillator();
  subOsc.type = 'sine';
  const subGain = ctx.createGain();
  subGain.gain.value = 0;

  // Noise layer
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) {
    noiseData[i] = (Math.random() * 2 - 1) * 0.015;
  }
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  noiseSource.loop = true;
  const noiseGain = ctx.createGain();
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 2500;
  noiseFilter.Q.value = 0.8;

  // === NIGHT OSCILLATORS ===
  const nightOsc1 = ctx.createOscillator();
  const nightOsc2 = ctx.createOscillator();
  nightOsc1.type = 'sine';
  nightOsc2.type = 'triangle';
  const nightGain1 = ctx.createGain();
  const nightGain2 = ctx.createGain();

  // === SIGNAL PATH ===
  const preMix = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const shaper = ctx.createWaveShaper();
  const dryGain = ctx.createGain();
  
  // Delay
  const delay = ctx.createDelay(2.0);
  const delayFeedback = ctx.createGain();
  const delayWet = ctx.createGain();
  const delayFilter = ctx.createBiquadFilter();
  delayFilter.type = 'lowpass';
  delayFilter.frequency.value = 3500;

  // Reverb (delay network)
  const revDly1 = ctx.createDelay(0.08);
  const revDly2 = ctx.createDelay(0.13);
  const revDly3 = ctx.createDelay(0.19);
  const revFdbk = ctx.createGain();
  const reverbWet = ctx.createGain();
  revDly1.delayTime.value = 0.061;
  revDly2.delayTime.value = 0.107;
  revDly3.delayTime.value = 0.163;
  revFdbk.gain.value = 0.22;

  const outputGain = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();

  // LFO
  const lfo = ctx.createOscillator();
  const lfoDepth = ctx.createGain();
  lfo.type = 'sine';
  const filterMod = ctx.createGain();

  // Wire
  dayOscs.forEach((osc, i) => osc.connect(dayOscGains[i]).connect(preMix));
  subOsc.connect(subGain).connect(preMix);
  noiseSource.connect(noiseFilter).connect(noiseGain).connect(preMix);
  nightOsc1.connect(nightGain1).connect(preMix);
  nightOsc2.connect(nightGain2).connect(preMix);

  preMix.connect(filter);
  filter.connect(shaper);
  shaper.connect(dryGain);
  shaper.connect(delay);
  
  delay.connect(delayFilter).connect(delayWet);
  delay.connect(delayFeedback).connect(delay);
  delayFeedback.gain.value = 0.35;

  // Reverb wiring
  shaper.connect(revDly1).connect(reverbWet);
  shaper.connect(revDly2).connect(reverbWet);
  shaper.connect(revDly3).connect(reverbWet);
  revDly1.connect(revFdbk).connect(revDly2);
  revDly2.connect(revFdbk).connect(revDly3);
  revDly3.connect(revFdbk).connect(revDly1);

  dryGain.connect(outputGain);
  delayWet.connect(outputGain);
  reverbWet.connect(outputGain);
  outputGain.connect(compressor);
  compressor.connect(ctx.destination);

  // LFO modulation
  lfo.connect(lfoDepth).connect(filterMod.gain);
  filterMod.connect(filter.detune);

  // Start
  dayOscs.forEach(osc => osc.start());
  subOsc.start();
  noiseSource.start();
  nightOsc1.start();
  nightOsc2.start();
  lfo.start();

  const api = {
    started: false,
    async start() {
      if (ctx.state === 'suspended') await ctx.resume();
      this.started = true;
    },
    update(next) {
      const power = next.power ? 1 : 0;
      const morph = next.morph !== undefined ? next.morph : (next.mode === 'night' ? 1 : 0);
      const pitch = next.pitch;
      const baseNote = 48 + pitch;
      const baseHz = midiToHz(baseNote);

      // Blended parameters based on morph
      const dayWeight = 1 - morph;
      const nightWeight = morph;
      
      const bite = next.bite / 100;
      const heat = next.heat / 100;
      const edge = next.edge / 100;
      const pulse = next.pulse / 100;
      const haze = next.haze / 100;
      const drift = next.drift / 100;
      const space = next.space / 100;

      // === DAY (Lyra-8 inspired) ===
      const dayDetune = bite * 30;
      dayOscs.forEach((osc, i) => {
        const baseD = dayDetuneBase[i] * dayDetune / 20;
        osc.detune.setTargetAtTime(baseD, ctx.currentTime, 0.05);
      });
      dayOscs[0].frequency.setTargetAtTime(baseHz, ctx.currentTime, 0.05);
      dayOscs[1].frequency.setTargetAtTime(baseHz * 1.003, ctx.currentTime, 0.05);
      dayOscs[2].frequency.setTargetAtTime(baseHz * 1.007, ctx.currentTime, 0.05);
      dayOscs[3].frequency.setTargetAtTime(baseHz * 1.012, ctx.currentTime, 0.05);

      dayOscGains.forEach((g, i) => {
        g.gain.setTargetAtTime((0.22 - i * 0.03) * dayWeight * 0.8, ctx.currentTime, 0.08);
      });

      // Day noise
      noiseGain.gain.setTargetAtTime(bite * 0.012 * dayWeight, ctx.currentTime, 0.05);
      noiseFilter.frequency.setTargetAtTime(1800 + bite * 2200, ctx.currentTime, 0.05);

      // === NIGHT (Audra-2 inspired) ===
      nightOsc1.frequency.setTargetAtTime(baseHz * 0.998, ctx.currentTime, 0.05);
      nightOsc2.frequency.setTargetAtTime(baseHz * 1.002, ctx.currentTime, 0.05);
      nightGain1.gain.setTargetAtTime(0.3 * nightWeight, ctx.currentTime, 0.08);
      nightGain2.gain.setTargetAtTime((0.2 + haze * 0.2) * nightWeight, ctx.currentTime, 0.08);

      // === SHARED FILTER ===
      const dayFilterFreq = 600 + bite * 2400;
      const nightFilterFreq = 200 + haze * 1600;
      const filterFreq = dayFilterFreq * dayWeight + nightFilterFreq * nightWeight;
      
      filter.type = morph > 0.5 ? 'lowpass' : 'bandpass';
      filter.frequency.setTargetAtTime(clamp(filterFreq, 150, 2800), ctx.currentTime, 0.05);
      filter.Q.setTargetAtTime(0.6 + morph * 2 + (morph < 0.5 ? heat * 1.5 : drift * 2), ctx.currentTime, 0.05);

      // === LFO ===
      const dayPulse = 0.08 + pulse * 1.4;
      const nightPulse = 0.02 + pulse * 0.28;
      lfo.frequency.setTargetAtTime(dayPulse * dayWeight + nightPulse * nightWeight, ctx.currentTime, 0.05);
      
      const dayDepth = 0.15 + edge * 0.35;
      const nightDepth = 0.1 + drift * 0.3;
      lfoDepth.gain.setTargetAtTime(dayDepth * dayWeight + nightDepth * nightWeight, ctx.currentTime, 0.05);
      filterMod.gain.setTargetAtTime(60 * edge * dayWeight + 180 * drift * nightWeight, ctx.currentTime, 0.05);

      // === SPACE ===
      const daySpace = 0.05 + space * 0.35 * dayWeight;
      const nightSpace = 0.15 + space * 0.55 * nightWeight;
      const totalSpace = daySpace + nightSpace;
      
      delayWet.gain.setTargetAtTime(totalSpace * 0.5, ctx.currentTime, 0.05);
      dryGain.gain.setTargetAtTime(1 - totalSpace * 0.4, ctx.currentTime, 0.05);
      delay.delayTime.setTargetAtTime(0.2 + space * 0.7, ctx.currentTime, 0.05);
      delayFeedback.gain.setTargetAtTime(0.1 + space * 0.45, ctx.currentTime, 0.05);
      reverbWet.gain.setTargetAtTime(totalSpace * 0.08, ctx.currentTime, 0.05);

      // === DRIVE ===
      const dayDrive = 1 + heat * 2;
      const nightDrive = 1 + haze * 0.6;
      const totalDrive = dayDrive * dayWeight + nightDrive * nightWeight;
      shaper.curve = makeDriveCurve(totalDrive * 8);

      // === SUB ===
      subOsc.frequency.setTargetAtTime(baseHz * 0.5, ctx.currentTime, 0.05);
      subGain.gain.setTargetAtTime((0.1 + bite * 0.08) * dayWeight + (0.25 + haze * 0.15) * nightWeight, ctx.currentTime, 0.05);

      // === OUTPUT ===
      outputGain.gain.setTargetAtTime(dbToGain(next.output) * power * 0.25, ctx.currentTime, 0.05);
    }
  };

  api.update(initialState);
  return api;
}

// === UTILS ===
function midiToHz(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function dbToGain(db) {
  return Math.pow(10, db / 20);
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

const triggerHaptic = (type = 'light') => {
  if (navigator.vibrate) {
    const duration = type === 'medium' ? 25 : 10;
    navigator.vibrate(duration);
  }
};