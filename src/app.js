const defaults = {
  power: false,
  morph: 0,
  pitch: 0,
  bite: 62,
  heat: 58,
  edge: 45,
  pulse: 40,
  haze: 48,
  drift: 36,
  space: 28,
  output: -9,
  shade: false,
  preset: 'Prototype Default'
};

const presets = {
  Daybreak: { morph: 0, pitch: 0, bite: 66, heat: 60, edge: 51, pulse: 45, haze: 18, drift: 24, space: 19, output: -10, preset: 'Daybreak' },
  Nightfog: { morph: 1, pitch: -12, bite: 22, heat: 34, edge: 18, pulse: 25, haze: 74, drift: 56, space: 63, output: -11, preset: 'Nightfog' },
  Streetlamp: { morph: 0.74, pitch: 7, bite: 40, heat: 48, edge: 22, pulse: 30, haze: 62, drift: 49, space: 54, output: -8, preset: 'Streetlamp' },
  Spotlight: { morph: 0.12, pitch: 12, bite: 82, heat: 70, edge: 72, pulse: 60, haze: 12, drift: 15, space: 12, output: -7, preset: 'Spotlight' }
};

const state = loadState();
let engine = null;
let audioInitialized = false;
let audioInitPromise = null;
let boundVisibilityRecovery = false;
let eventsBound = false;
let kickFlashTimeout = null;
let morphUpdateFrame = 0;
let shadePressed = false;
let shadeLevel = 0;
let shadeFrame = 0;
const SHADE_RAMP_TIME = 5.0;

const params = ['bite', 'heat', 'edge', 'pulse', 'haze', 'drift', 'space', 'output'];
const valueRanges = {
  bite: { min: 0, max: 100, format: (value) => `${value}%` },
  heat: { min: 0, max: 100, format: (value) => `${value}%` },
  edge: { min: 0, max: 100, format: (value) => `${value}%` },
  pulse: { min: 0, max: 100, format: (value) => `${value}%` },
  haze: { min: 0, max: 100, format: (value) => `${value}%` },
  drift: { min: 0, max: 100, format: (value) => `${value}%` },
  space: { min: 0, max: 100, format: (value) => `${value}%` },
  output: { min: -24, max: 0, format: (value) => `${value}dB` }
};

const els = {
  body: document.body,
  startButton: document.getElementById('startButton'),
  powerLamp: document.getElementById('powerLamp'),
  statusText: document.getElementById('statusText'),
  presetList: document.getElementById('presetList'),
  morphTrack: document.getElementById('morphTrack'),
  morphThumb: document.getElementById('morphThumb'),
  morphFill: document.getElementById('morphFill'),
  morphMode: document.getElementById('morphMode'),
  pitchWheel: document.getElementById('pitchWheel'),
  pitchValue: document.getElementById('pitchValue'),
  kickButton: document.getElementById('kickButton'),
  shadeButton: document.getElementById('shadeButton')
};

const inputSensitivity = {
  knobMouse: 0.45,
  knobTouch: 0.28,
  pitchMouse: 24,
  pitchTouch: 16
};

const pointerState = {
  knob: null,
  morph: null,
  pitch: null
};

document.querySelectorAll('[data-knob]').forEach((knob) => {
  const param = knob.dataset.knob;
  els[param] = knob;
  els[`${param}Value`] = document.getElementById(`${param}Value`);
});

hydrateControls();
renderPresetButtons();
bindEvents();
render();
updateMorphUI();
updatePitchUI();

function loadState() {
  const url = new URL(window.location.href);
  const encoded = url.searchParams.get('state');
  if (!encoded) return { ...defaults };

  try {
    const parsed = JSON.parse(atob(encoded));
    return {
      ...defaults,
      ...parsed,
      output: clamp(parsed.output ?? defaults.output, -24, 0)
    };
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
  params.forEach((param) => {
    const value = normalizeParamValue(param, state[param]);
    state[param] = value;
    updateKnobVisual(param, value);
    updateKnobLabel(param, value);
  });
}

function normalizeParamValue(param, rawValue) {
  const range = valueRanges[param];
  return clamp(Math.round(rawValue), range.min, range.max);
}

function percentFromValue(param, value) {
  const range = valueRanges[param];
  return (value - range.min) / (range.max - range.min);
}

function updateKnobVisual(param, value) {
  const knob = els[param];
  if (!knob) return;

  const line = knob.querySelector('.knob-line');
  if (!line) return;

  const percent = percentFromValue(param, value);
  const angle = -135 + percent * 270;
  const radians = (angle - 90) * (Math.PI / 180);
  const radius = 28;
  const x2 = 40 + radius * Math.cos(radians);
  const y2 = 40 + radius * Math.sin(radians);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
}

function updateKnobLabel(param, value) {
  const valueEl = els[`${param}Value`];
  if (!valueEl) return;
  valueEl.textContent = valueRanges[param].format(value);
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  const startHandler = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    triggerHaptic('medium');

    if (!audioInitialized) {
      try {
        await initAudioFromGesture();
      } catch (error) {
        console.error('Audio start failed', error);
        els.statusText.textContent = 'Start failed • tap again';
      }
      return;
    }

    state.power = !state.power;
    state.preset = 'Custom';
    await recoverAudioContext('toggle');
    engine?.update(state);
    saveState();
    render();
  };

  els.startButton.addEventListener('click', startHandler, { passive: false });
  els.powerLamp.addEventListener('click', startHandler, { passive: false });

  params.forEach((param) => {
    const knob = els[param];
    if (!knob) return;

    knob.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      pointerState.knob = {
        param,
        pointerId: event.pointerId,
        inputType: event.pointerType || 'mouse',
        startY: event.clientY,
        startValue: state[param]
      };
      knob.setPointerCapture?.(event.pointerId);
      triggerHaptic('light');
    });

    knob.addEventListener('pointermove', (event) => {
      const active = pointerState.knob;
      if (!active || active.pointerId !== event.pointerId || active.param !== param) return;
      event.preventDefault();

      const delta = active.startY - event.clientY;
      const sensitivity = active.inputType === 'touch' ? inputSensitivity.knobTouch : inputSensitivity.knobMouse;
      const range = valueRanges[param];
      const nextValue = clamp(Math.round(active.startValue + delta * sensitivity), range.min, range.max);

      state[param] = nextValue;
      state.preset = 'Custom';
      updateKnobVisual(param, nextValue);
      updateKnobLabel(param, nextValue);
      renderStatus();
    });

    const finishKnob = async (event) => {
      const active = pointerState.knob;
      if (!active || active.pointerId !== event.pointerId || active.param !== param) return;
      pointerState.knob = null;
      await updateEngineFromGesture();
    };

    knob.addEventListener('pointerup', finishKnob);
    knob.addEventListener('pointercancel', finishKnob);
    knob.addEventListener('lostpointercapture', finishKnob);
  });

  els.morphTrack.addEventListener('pointerdown', async (event) => {
    event.preventDefault();
    pointerState.morph = {
      pointerId: event.pointerId,
      inputType: event.pointerType || 'mouse'
    };
    els.morphTrack.setPointerCapture?.(event.pointerId);
    setMorphFromPointer(event);
    triggerHaptic('light');
    await updateEngineFromGesture();
  });

  els.morphTrack.addEventListener('pointermove', (event) => {
    const active = pointerState.morph;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    setMorphFromPointer(event);
    queueMorphPreviewUpdate();
    renderStatus();
  });

  const finishMorph = async (event) => {
    const active = pointerState.morph;
    if (!active || active.pointerId !== event.pointerId) return;
    pointerState.morph = null;
    await updateEngineFromGesture();
  };

  els.morphTrack.addEventListener('pointerup', finishMorph);
  els.morphTrack.addEventListener('pointercancel', finishMorph);
  els.morphTrack.addEventListener('lostpointercapture', finishMorph);

  els.pitchWheel.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const rect = els.pitchWheel.getBoundingClientRect();
    pointerState.pitch = {
      pointerId: event.pointerId,
      inputType: event.pointerType || 'mouse',
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      startAngle: getAngle(rect.left + rect.width / 2, rect.top + rect.height / 2, event.clientX, event.clientY),
      startValue: state.pitch
    };
    els.pitchWheel.setPointerCapture?.(event.pointerId);
    triggerHaptic('light');
  });

  els.pitchWheel.addEventListener('pointermove', (event) => {
    const active = pointerState.pitch;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();

    const currentAngle = getAngle(active.centerX, active.centerY, event.clientX, event.clientY);
    let delta = currentAngle - active.startAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    const fullScale = active.inputType === 'touch' ? inputSensitivity.pitchTouch : inputSensitivity.pitchMouse;
    const semitoneDelta = Math.round((delta / 360) * fullScale);
    state.pitch = clamp(active.startValue + semitoneDelta, -24, 24);
    state.preset = 'Custom';
    updatePitchUI();
    renderStatus();
  });

  const finishPitch = async (event) => {
    const active = pointerState.pitch;
    if (!active || active.pointerId !== event.pointerId) return;
    pointerState.pitch = null;
    await updateEngineFromGesture();
  };

  els.pitchWheel.addEventListener('pointerup', finishPitch);
  els.pitchWheel.addEventListener('pointercancel', finishPitch);
  els.pitchWheel.addEventListener('lostpointercapture', finishPitch);

  const kickHandler = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === 'click' && els.kickButton.dataset.pointerKick === '1') {
      els.kickButton.dataset.pointerKick = '0';
      return;
    }
    if (event.type === 'pointerdown') {
      els.kickButton.dataset.pointerKick = '1';
    }
    triggerHaptic('medium');

    if (!audioInitialized) {
      try {
        await initAudioFromGesture();
      } catch (error) {
        console.error('Kick start failed', error);
        els.statusText.textContent = 'Start failed • tap again';
        return;
      }
    }

    const running = await recoverAudioContext('kick');
    if (!running || !engine) {
      render();
      return;
    }

    if (!state.power) {
      state.power = true;
      engine.update(state);
      saveState();
      render();
    }

    engine.triggerKick(state);
    flashKickButton();
    renderStatus('Kick fired');
  };

  els.kickButton.addEventListener('click', kickHandler, { passive: false });
  els.kickButton.addEventListener('pointerdown', kickHandler, { passive: false });

  const setShade = (pressed) => {
    shadePressed = pressed;
    state.shade = pressed;
    if (!shadeFrame) shadeFrame = window.requestAnimationFrame(shadeLoop);
  };

  const shadeDown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    els.shadeButton.setPointerCapture?.(event.pointerId);
    setShade(true);
  };

  const shadeUp = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setShade(false);
  };

  els.shadeButton.addEventListener('pointerdown', shadeDown, { passive: false });
  els.shadeButton.addEventListener('pointerup', shadeUp, { passive: false });
  els.shadeButton.addEventListener('pointercancel', shadeUp, { passive: false });
  els.shadeButton.addEventListener('lostpointercapture', () => setShade(false));
}


function shadeLoop(now) {
  const previous = shadeLoop.lastTime || now;
  const deltaTime = Math.min((now - previous) / 1000, 0.05);
  shadeLoop.lastTime = now;

  const target = shadePressed ? 1 : 0;
  const step = deltaTime / SHADE_RAMP_TIME;
  if (shadeLevel < target) shadeLevel = Math.min(target, shadeLevel + step);
  if (shadeLevel > target) shadeLevel = Math.max(target, shadeLevel - step);

  els.shadeButton.style.setProperty('--shade-intensity', shadeLevel.toFixed(4));
  els.shadeButton.classList.toggle('shade-active', shadeLevel > 0.02);
  const label = shadeLevel > 0.95 ? 'SHADE ACTIVE' : shadeLevel > 0.08 ? `HOLDING ${Math.round(shadeLevel * 5)}S` : 'HOLD 5S SHADE';
  const labelEl = els.shadeButton.querySelector('.shade-label');
  if (labelEl) labelEl.textContent = label;

  if (engine?.updateShade) engine.updateShade(shadeLevel);

  if (shadePressed || shadeLevel > 0.001) {
    shadeFrame = window.requestAnimationFrame(shadeLoop);
  } else {
    shadeFrame = 0;
    shadeLoop.lastTime = 0;
  }
}


async function initAudioFromGesture() {
  if (audioInitPromise) return audioInitPromise;

  audioInitPromise = (async () => {
    els.statusText.textContent = 'Waking audio…';
    if (!engine) engine = await createDayNightManEngine(state);

    await recoverAudioContext('start');
    await engine.start();

    if (engine.context.state !== 'running') {
      throw new Error('Audio still suspended');
    }

    audioInitialized = true;
    state.power = true;
    state.preset = 'Custom';
    engine.update(state);
    saveState();
    bindRecoveryHooks();
    render();
  })().catch((error) => {
    audioInitialized = false;
    audioInitPromise = null;
    throw error;
  });

  return audioInitPromise;
}

async function recoverAudioContext(reason = 'resume') {
  if (!engine) return false;

  try {
    if (engine.context.state === 'suspended') {
      els.statusText.textContent = reason === 'visibility' ? 'Audio sleeping • tap play' : 'Resuming audio…';
      await engine.context.resume();
    }
  } catch (error) {
    console.warn('AudioContext resume failed', error);
  }

  const running = engine.context.state === 'running';
  if (!running) {
    state.power = false;
  }

  return running;
}

function bindRecoveryHooks() {
  if (boundVisibilityRecovery) return;
  boundVisibilityRecovery = true;

  const attemptRecovery = async () => {
    if (!audioInitialized || !engine) return;
    const running = await recoverAudioContext('visibility');
    if (running && state.power) {
      engine.update(state);
      renderStatus();
    } else if (!running) {
      render();
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) attemptRecovery();
  });
  window.addEventListener('focus', attemptRecovery);
  window.addEventListener('pageshow', attemptRecovery);
}

async function updateEngineFromGesture() {
  saveState();
  if (!audioInitialized) {
    render();
    return;
  }

  const running = await recoverAudioContext('gesture');
  if (!running) {
    render();
    return;
  }

  engine.update(state);
  render();
}

function setMorphFromPointer(event) {
  const rect = els.morphTrack.getBoundingClientRect();
  const horizontal = window.matchMedia('(max-width: 560px)').matches;

  let percent;
  if (horizontal) {
    percent = (event.clientX - rect.left) / rect.width;
  } else {
    percent = 1 - (event.clientY - rect.top) / rect.height;
  }

  state.morph = clamp(percent, 0, 1);
  state.preset = 'Custom';
  updateMorphUI();
}

function queueMorphPreviewUpdate() {
  if (morphUpdateFrame) return;
  morphUpdateFrame = window.requestAnimationFrame(async () => {
    morphUpdateFrame = 0;
    saveState();
    if (!audioInitialized || !engine) return;
    const running = await recoverAudioContext('gesture');
    if (!running) {
      render();
      return;
    }
    engine.update(state);
  });
}

function updateMorphUI() {
  const morph = state.morph;
  const horizontal = window.matchMedia('(max-width: 560px)').matches;
  const slot = els.morphTrack.querySelector('.morph-slot');
  const thumb = els.morphThumb;
  const fill = els.morphFill;

  const slotRect = slot.getBoundingClientRect();
  const thumbSize = horizontal ? thumb.offsetWidth || 50 : thumb.offsetHeight || 50;
  const travel = Math.max((horizontal ? slotRect.width : slotRect.height) - thumbSize - 10, 0);
  const offset = 5 + morph * travel;

  if (horizontal) {
    thumb.style.left = `${offset}px`;
    thumb.style.bottom = 'auto';
    thumb.style.top = '50%';
    thumb.style.transform = 'translateY(-50%)';
    fill.style.width = `${morph * 100}%`;
    fill.style.height = 'auto';
  } else {
    thumb.style.bottom = `${offset}px`;
    thumb.style.left = '50%';
    thumb.style.top = 'auto';
    thumb.style.transform = 'translateX(-50%)';
    fill.style.height = `${morph * 100}%`;
    fill.style.width = 'auto';
  }

  const accent = mixColor([246, 168, 92], [84, 222, 232], morph);
  const bg = mixColor([16, 18, 28], [8, 11, 18], morph);
  const panel = mixColor([40, 35, 31], [23, 28, 36], morph);
  const panelHi = mixColor([112, 96, 84], [84, 104, 122], morph);

  setCssVar('--morph', morph.toFixed(4));
  setCssVar('--accent-r', accent[0]);
  setCssVar('--accent-g', accent[1]);
  setCssVar('--accent-b', accent[2]);
  setCssVar('--bg-r', bg[0]);
  setCssVar('--bg-g', bg[1]);
  setCssVar('--bg-b', bg[2]);
  setCssVar('--panel-r', panel[0]);
  setCssVar('--panel-g', panel[1]);
  setCssVar('--panel-b', panel[2]);
  setCssVar('--panel-hi-r', panelHi[0]);
  setCssVar('--panel-hi-g', panelHi[1]);
  setCssVar('--panel-hi-b', panelHi[2]);

  const modeName = morph < 0.22 ? 'DAY' : morph > 0.78 ? 'NIGHT' : 'TWILIGHT';
  els.morphMode.textContent = modeName;
  renderStatus();
}

function updatePitchUI() {
  const pitch = state.pitch;
  els.pitchValue.textContent = pitch === 0 ? '0 st' : pitch > 0 ? `+${pitch} st` : `${pitch} st`;

  const rotation = (pitch / 24) * 140;
  els.pitchWheel.style.transform = `rotate(${rotation}deg)`;
}

function render() {
  els.body.style.setProperty('--power', state.power && audioInitialized ? '1' : '0');

  if (audioInitialized) {
    els.startButton.classList.add('audio-active');
    els.startButton.textContent = state.power ? 'Pause synth' : 'Play synth';
  } else {
    els.startButton.classList.remove('audio-active');
    els.startButton.textContent = 'Tap to start';
  }

  renderStatus();
  renderPresetButtons();
}

function renderStatus(overrideText = '') {
  if (overrideText) {
    els.statusText.textContent = overrideText;
    return;
  }

  if (!audioInitialized || !engine) {
    els.statusText.textContent = 'Tap start to arm audio';
    return;
  }

  if (engine.context.state !== 'running') {
    els.statusText.textContent = 'Audio suspended • tap play again';
    return;
  }

  if (!state.power) {
    els.statusText.textContent = 'Ready • tap play';
    return;
  }

  const modeName = state.morph < 0.22 ? 'Day voice' : state.morph > 0.78 ? 'Night voice' : 'Twilight voice';
  const shadeText = shadeLevel > 0.05 ? ` • shade ${Math.round(shadeLevel * 100)}%` : '';
  els.statusText.textContent = `${modeName} • pitch ${state.pitch > 0 ? '+' : ''}${state.pitch} st${shadeText}`;
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
      state.preset = name;
      await updateEngineFromGesture();
    });
    els.presetList.appendChild(button);
  }
}

async function createDayNightManEngine(initialState) {
  const context = new (window.AudioContext || window.webkitAudioContext)();

  const dayOscs = [];
  const dayOscGains = [];
  const dayDetuneBase = [0, 3, 7, 10, 14, 17, 21, 24];
  for (let index = 0; index < 4; index += 1) {
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.detune.value = dayDetuneBase[index] + (Math.random() - 0.5) * 4;
    const gain = context.createGain();
    gain.gain.value = 0;
    dayOscs.push(osc);
    dayOscGains.push(gain);
  }

  const subOsc = context.createOscillator();
  subOsc.type = 'sine';
  const subGain = context.createGain();
  subGain.gain.value = 0;

  const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let index = 0; index < noiseData.length; index += 1) {
    noiseData[index] = (Math.random() * 2 - 1) * 0.015;
  }
  const noiseSource = context.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  noiseSource.loop = true;
  const noiseGain = context.createGain();
  const noiseFilter = context.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 2500;
  noiseFilter.Q.value = 0.8;

  const nightOsc1 = context.createOscillator();
  const nightOsc2 = context.createOscillator();
  nightOsc1.type = 'sine';
  nightOsc2.type = 'triangle';
  const nightGain1 = context.createGain();
  const nightGain2 = context.createGain();

  const preMix = context.createGain();
  const filter = context.createBiquadFilter();
  const shaper = context.createWaveShaper();
  const dryGain = context.createGain();
  const delay = context.createDelay(2.0);
  const delayFeedback = context.createGain();
  const delayWet = context.createGain();
  const delayFilter = context.createBiquadFilter();
  delayFilter.type = 'lowpass';
  delayFilter.frequency.value = 3500;

  const revDly1 = context.createDelay(0.08);
  const revDly2 = context.createDelay(0.13);
  const revDly3 = context.createDelay(0.19);
  const revFdbk = context.createGain();
  const reverbWet = context.createGain();
  revDly1.delayTime.value = 0.061;
  revDly2.delayTime.value = 0.107;
  revDly3.delayTime.value = 0.163;
  revFdbk.gain.value = 0.22;

  const kickFilter = context.createBiquadFilter();
  kickFilter.type = 'lowpass';
  kickFilter.frequency.value = 140;
  const kickDrive = context.createWaveShaper();
  kickDrive.curve = makeDriveCurve(10);
  const kickSend = context.createGain();
  kickSend.gain.value = 0;
  const kickDirect = context.createGain();
  kickDirect.gain.value = 0.9;

  const outputGain = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const lfo = context.createOscillator();
  const lfoDepth = context.createGain();
  const filterMod = context.createGain();
  lfo.type = 'sine';

  dayOscs.forEach((osc, index) => osc.connect(dayOscGains[index]).connect(preMix));
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

  shaper.connect(revDly1).connect(reverbWet);
  shaper.connect(revDly2).connect(reverbWet);
  shaper.connect(revDly3).connect(reverbWet);

  kickFilter.connect(kickDrive);
  kickDrive.connect(kickDirect).connect(outputGain);
  kickDrive.connect(kickSend);
  kickSend.connect(revDly1);
  kickSend.connect(revDly2);
  kickSend.connect(revDly3);

  revDly1.connect(revFdbk).connect(revDly2);
  revDly2.connect(revFdbk).connect(revDly3);
  revDly3.connect(revFdbk).connect(revDly1);

  dryGain.connect(outputGain);
  delayWet.connect(outputGain);
  reverbWet.connect(outputGain);
  outputGain.connect(compressor);
  compressor.connect(context.destination);

  lfo.connect(lfoDepth).connect(filterMod.gain);
  filterMod.connect(filter.detune);

  dayOscs.forEach((osc) => osc.start());
  subOsc.start();
  noiseSource.start();
  nightOsc1.start();
  nightOsc2.start();
  lfo.start();

  const api = {
    context,
    started: false,
    async start() {
      if (context.state === 'suspended') await context.resume();
      this.started = context.state === 'running';
      return this.started;
    },
    update(next) {
      const power = next.power ? 1 : 0;
      const morph = clamp(next.morph ?? 0, 0, 1);
      const pitch = next.pitch;
      const baseNote = 48 + pitch;
      const baseHz = midiToHz(baseNote);
      const dayWeight = 1 - morph;
      const nightWeight = morph;

      const bite = next.bite / 100;
      const heat = next.heat / 100;
      const edge = next.edge / 100;
      const pulse = next.pulse / 100;
      const haze = next.haze / 100;
      const drift = next.drift / 100;
      const space = next.space / 100;

      const dayDetune = 8 + bite * 38;
      dayOscs.forEach((osc, index) => {
        const baseDetune = dayDetuneBase[index] * dayDetune / 20;
        osc.detune.setTargetAtTime(baseDetune, context.currentTime, 0.05);
      });
      dayOscs[0].frequency.setTargetAtTime(baseHz, context.currentTime, 0.05);
      dayOscs[1].frequency.setTargetAtTime(baseHz * 1.003, context.currentTime, 0.05);
      dayOscs[2].frequency.setTargetAtTime(baseHz * 1.007, context.currentTime, 0.05);
      dayOscs[3].frequency.setTargetAtTime(baseHz * 1.012, context.currentTime, 0.05);

      dayOscGains.forEach((gain, index) => {
        gain.gain.setTargetAtTime((0.22 - index * 0.03) * dayWeight * 0.82, context.currentTime, 0.08);
      });

      noiseGain.gain.setTargetAtTime((0.002 + bite * 0.014) * dayWeight, context.currentTime, 0.05);
      noiseFilter.frequency.setTargetAtTime(1600 + bite * 2800 - morph * 700, context.currentTime, 0.05);

      nightOsc1.frequency.setTargetAtTime(baseHz * (0.996 + morph * 0.003), context.currentTime, 0.05);
      nightOsc2.frequency.setTargetAtTime(baseHz * (1.004 - morph * 0.002), context.currentTime, 0.05);
      nightGain1.gain.setTargetAtTime((0.08 + 0.28 * nightWeight) * (0.8 + haze * 0.4), context.currentTime, 0.08);
      nightGain2.gain.setTargetAtTime((0.05 + 0.24 * nightWeight) * (0.6 + haze * 0.8), context.currentTime, 0.08);

      const filterFreq =
        320 +
        dayWeight * (980 + bite * 2200) +
        nightWeight * (140 + haze * 1350) +
        (1 - Math.abs(morph - 0.5) * 2) * 160;
      filter.type = morph > 0.66 ? 'lowpass' : morph < 0.34 ? 'bandpass' : 'peaking';
      filter.frequency.setTargetAtTime(clamp(filterFreq, 120, 3400), context.currentTime, 0.05);
      filter.Q.setTargetAtTime(0.7 + heat * dayWeight * 1.9 + drift * nightWeight * 2.4 + morph * 0.6, context.currentTime, 0.05);

      const lfoRate = (0.08 + pulse * 1.35) * dayWeight + (0.03 + pulse * 0.22 + drift * 0.18) * nightWeight;
      lfo.frequency.setTargetAtTime(lfoRate, context.currentTime, 0.05);
      lfoDepth.gain.setTargetAtTime(0.12 + edge * dayWeight * 0.34 + drift * nightWeight * 0.32, context.currentTime, 0.05);
      filterMod.gain.setTargetAtTime(40 * edge * dayWeight + 180 * drift * nightWeight + morph * 45, context.currentTime, 0.05);

      const spaceBlend = 0.06 + dayWeight * space * 0.28 + nightWeight * (0.12 + space * 0.48);
      delayWet.gain.setTargetAtTime(spaceBlend * 0.48, context.currentTime, 0.05);
      dryGain.gain.setTargetAtTime(1 - spaceBlend * 0.44, context.currentTime, 0.05);
      delay.delayTime.setTargetAtTime(0.14 + space * 0.62 + morph * 0.08, context.currentTime, 0.05);
      delayFeedback.gain.setTargetAtTime(0.1 + space * 0.44 + morph * 0.08, context.currentTime, 0.05);
      delayFilter.frequency.setTargetAtTime(2200 + dayWeight * 1200 + nightWeight * 400, context.currentTime, 0.05);
      reverbWet.gain.setTargetAtTime(spaceBlend * (0.05 + 0.06 * nightWeight), context.currentTime, 0.05);
      kickSend.gain.setTargetAtTime(power * (0.12 + space * 0.24 + nightWeight * 0.08), context.currentTime, 0.03);
      kickFilter.frequency.setTargetAtTime(110 + space * 190 + nightWeight * 40, context.currentTime, 0.04);
      revFdbk.gain.setTargetAtTime(0.18 + space * 0.2 + morph * 0.06, context.currentTime, 0.05);

      const drive = (1.2 + heat * 2.3) * dayWeight + (1 + haze * 0.9 + drift * 0.2) * nightWeight;
      shaper.curve = makeDriveCurve(drive * 7.5);

      subOsc.frequency.setTargetAtTime(baseHz * 0.5, context.currentTime, 0.05);
      subGain.gain.setTargetAtTime((0.09 + bite * 0.08) * dayWeight + (0.16 + haze * 0.24) * nightWeight, context.currentTime, 0.05);

      outputGain.gain.setTargetAtTime(dbToGain(next.output) * power * 0.25, context.currentTime, 0.05);
    },
    triggerKick(next) {
      const now = context.currentTime;
      const space = clamp((next.space ?? 0) / 100, 0, 1);
      const morph = clamp(next.morph ?? 0, 0, 1);
      const output = dbToGain(next.output ?? -9) * (next.power ? 1 : 0);
      const baseHz = 58 - morph * 8;
      const bodyHz = 118 - morph * 18;
      const kickLevel = Math.max(output * (1.8 + space * 1.2), 0.28);

      const osc = context.createOscillator();
      osc.type = 'sine';
      const body = context.createOscillator();
      body.type = morph > 0.55 ? 'triangle' : 'sine';
      const amp = context.createGain();
      const bodyGain = context.createGain();

      osc.connect(amp).connect(compressor);
      body.connect(bodyGain).connect(compressor);
      osc.connect(amp).connect(kickFilter);
      body.connect(bodyGain).connect(kickFilter);

      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.exponentialRampToValueAtTime(kickLevel, now + 0.004);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.34 + space * 0.3);

      bodyGain.gain.setValueAtTime(0.0001, now);
      bodyGain.gain.exponentialRampToValueAtTime(kickLevel * 0.55, now + 0.008);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18 + space * 0.1);

      osc.frequency.setValueAtTime(baseHz * 2.9, now);
      osc.frequency.exponentialRampToValueAtTime(baseHz, now + 0.07);
      osc.frequency.exponentialRampToValueAtTime(Math.max(baseHz * 0.82, 32), now + 0.24);

      body.frequency.setValueAtTime(bodyHz, now);
      body.frequency.exponentialRampToValueAtTime(Math.max(bodyHz * 0.72, 48), now + 0.16);

      osc.start(now);
      body.start(now);
      osc.stop(now + 0.8 + space * 0.35);
      body.stop(now + 0.5 + space * 0.2);
    },
    updateShade(level) {
      const shade = clamp(level, 0, 1);
      const now = context.currentTime;
      filter.frequency.setTargetAtTime(Math.max(180, filter.frequency.value * (1 - shade * 0.55)), now, 0.08);
      filter.Q.setTargetAtTime(filter.Q.value + shade * 0.35, now, 0.08);
      dryGain.gain.setTargetAtTime(Math.max(0.18, dryGain.gain.value * (1 - shade * 0.18)), now, 0.08);
      delayWet.gain.setTargetAtTime(delayWet.gain.value + shade * 0.04, now, 0.08);
    }
  };

  api.update(initialState);
  return api;
}

function flashKickButton() {
  els.kickButton.classList.add('fired');
  clearTimeout(kickFlashTimeout);
  kickFlashTimeout = window.setTimeout(() => {
    els.kickButton.classList.remove('fired');
  }, 160);
}

function mixColor(a, b, t) {
  return a.map((value, index) => Math.round(value + (b[index] - value) * t));
}

function setCssVar(name, value) {
  els.body.style.setProperty(name, `${value}`);
}

function getAngle(cx, cy, x, y) {
  return Math.atan2(y - cy, x - cx) * (180 / Math.PI);
}

function midiToHz(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function dbToGain(db) {
  return Math.pow(10, db / 20);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function makeDriveCurve(amount) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  for (let index = 0; index < samples; index += 1) {
    const x = (index * 2) / samples - 1;
    curve[index] = Math.tanh(x * amount);
  }
  return curve;
}

function triggerHaptic(type = 'light') {
  if (!navigator.vibrate) return;
  navigator.vibrate(type === 'medium' ? 22 : 10);
}
