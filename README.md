# DayNightMan Web Test Harness

Mobile-first browser test harness for iPhone listening tests.

## What this is

This is a lightweight web UI that lets Steve or a tester:
- open a link on iPhone Safari/Chrome
- tap once to start audio
- switch between Dayman and Nightman behavior
- tweak the current plugin-style controls
- copy/share the current state via URL

## Current scope

This is now shaped around the actual DayNightMan plugin's current control model:
- Power
- Mode
- Pitch
- Bite
- Heat
- Edge
- Haze
- Drift
- Space
- Output

The browser engine is a **loose port of the current synth behavior**, not a frozen exact clone.
That is intentional while the real plugin still needs lots of tweaks.

## What this is not

This is **not yet exact sonic parity** with the DayNightMan VST.

It is meant to validate:
- mobile UX
- public iPhone listening tests
- parameter feel
- quick iteration
- deployment flow

To make it track the plugin more tightly later, the real DSP should be extracted into a shared core. See `DSP_INTEGRATION_TODO.md`.

## Files

- `index.html` - app shell
- `styles.css` - mobile-first styles
- `src/app.js` - UI state + DayNightMan-style browser synth engine
- `DSP_INTEGRATION_TODO.md` - where tighter shared DSP should slot in

## Local run

From this folder:

```bash
npm run dev
```

Then open:

```text
http://localhost:4173
```

On another device on the same network, use your Mac's local IP:

```text
http://YOUR-MAC-IP:4173
```

## iPhone test notes

- iPhone requires a user gesture before audio starts, so tap **Tap to start audio** first.
- Safari is the best target for iPhone testing.
- Chrome on iPhone still uses Apple's browser engine underneath, so behavior should be similar.

## Deployment options

Because this is static, it can be hosted almost anywhere.

### GitHub Pages
- push this folder to a repo
- enable Pages
- serve from the root or `/docs`

### Netlify
- drag-drop the folder into Netlify Drop
- or connect a repo
- publish directory: `.`

### Vercel
- import the repo
- framework preset: Other
- output directory: `.`

## Suggested milestone definition

Done means:
- Steve can open a URL on iPhone
- tap to start audio
- hear a recognizably DayNightMan-style result
- change the plugin-style controls
- share a stateful link for feedback
