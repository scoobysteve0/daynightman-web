# DSP Integration TODO

## Current state

The web harness is now shaped around the actual DayNightMan plugin's current parameter/control model and rough signal flow.

Current browser implementation includes approximations of:
- dual oscillator voice
- day vs night personality split
- filter behavior
- LFO-based movement
- delay/space behavior
- saturation/output staging

## Why this is still loose

Steve explicitly does **not** want a hard frozen parity port yet because the plugin itself still needs lots of tweaks.

So the web version should optimize for:
- fast listening tests on iPhone
- easy retuning as the plugin evolves
- recognizably matching vibe and controls
- low-friction deployment

## Later parity path

When the plugin stabilizes more, replace the browser synth engine with a tighter shared DSP layer.

### Preferred architecture

Create a shared engine boundary like this:

- `src/dsp/engine-interface.js`
- `src/dsp/daynightman-engine.js`
- `src/dsp/web-preview-engine.js`

Then the UI talks only to:
- `start()`
- `update(params)`
- optional `loadPreset(preset)`

## Practical routes

### Route 1: shared C++ DSP -> WASM
Best if the JUCE plugin DSP can be isolated cleanly from wrapper/UI code.

### Route 2: JS/TS DSP port
Best if the synth remains compact and fluid.

### Route 3: keep web preview as a tunable companion
Best if the VST keeps moving fast and the web build only needs to stay close enough for public listening tests.

## Source reference used for this pass

Current plugin repo:
- `day-night-man/Source/PluginProcessor.cpp`
- `day-night-man/Source/PluginProcessor.h`

## Next meaningful improvement

The next pass should compare:
- browser output renders
- plugin demo renders
- subjective notes from Steve

Then retune curves/ranges by ear rather than prematurely locking architecture.
