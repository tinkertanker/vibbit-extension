# MakeCode AI for Schools

This repository provides a MakeCode AI panel that supports both deployment models in one version:

- `Managed` mode: your school uses your hosted backend (`/mcai/generate`)
- `BYOK` mode: a school enters its own provider/model/key in the panel

## Supported keys and endpoints

### Managed mode

- Optional app token: `APP_TOKEN` (sent as `Authorization: Bearer <token>`)
- Endpoint used by the client:
  - `POST {BACKEND}/mcai/generate`
- Request payload:
  - `target`: `microbit | arcade | maker`
  - `request`: natural-language prompt
  - `currentCode`: optional current editor code

### BYOK mode

- Provider keys:
  - OpenAI API key (Bearer auth)
  - Gemini API key (Google Generative Language API key)
  - OpenRouter API key (Bearer auth)
- Provider endpoints:
  - OpenAI: `https://api.openai.com/v1/chat/completions`
  - Gemini: `https://generativelanguage.googleapis.com/v1/models/{model}:generateContent`
  - OpenRouter: `https://openrouter.ai/api/v1/chat/completions`

## Files

- `work.js`: primary runtime script (bookmarklet and extension source)
- `client.js`: earlier userscript variant kept in repo
- `extension/manifest.json`: Chrome extension manifest template
- `scripts/build.mjs`: builds `dist/` extension files from `work.js`
- `scripts/package.mjs`: zips `dist/` into `artifacts/makecode-ai-extension.zip`

## Runtime modes

### Managed mode

- Uses `BACKEND` + optional `APP_TOKEN`
- Sends `target`, `request`, and optional `currentCode` to `/mcai/generate`
- Best for centrally managed school roll-outs

### BYOK mode

- School chooses provider (`OpenAI`, `Gemini`, `OpenRouter`)
- School supplies model + API key in the panel
- Key is stored in browser local storage for convenience
- Useful for schools that prefer to use their own billing and policy setup

## Configure defaults

In `work.js`:

```js
const BACKEND = "https://mcai.dev.tk.sg";
const APP_TOKEN = "";
```

Set `APP_TOKEN` only if your backend enforces bearer auth.

## Build extension

```bash
npm run build
```

Outputs:

- `dist/content-script.js`
- `dist/manifest.json`

Optional build-time backend overrides:

```bash
MCAI_BACKEND="https://your-server.example" MCAI_APP_TOKEN="optional-token" npm run build
```

## Package extension zip

```bash
npm run package
```

This builds first, then creates:

- `artifacts/makecode-ai-extension.zip`

## Install in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this repo's `dist/` directory
5. Click **Reload** after each rebuild (`npm run build`) to test the latest code

## Browser testing quickstart

1. Build a fresh bundle:
   - `npm run package`
2. Confirm artefacts exist:
   - `dist/content-script.js`
   - `dist/manifest.json`
   - `artifacts/makecode-ai-extension.zip`
3. Load unpacked extension from `dist/` in Chrome.
4. Open one MakeCode editor page, for example:
   - `https://makecode.microbit.org/`
5. Managed smoke test:
   - choose `Managed (school account)`
   - enter a simple prompt
   - confirm code is generated and pasted, then test `Revert`
6. BYOK smoke test:
   - switch to `Bring your own key`
   - select provider + model, enter key
   - confirm generation and paste both work
7. If updating config values (`MCAI_BACKEND` or `MCAI_APP_TOKEN`), rebuild and reload the extension.

## Bookmarklet usage

You can also run `work.js` as a bookmarklet payload. The same panel supports both `Managed` and `BYOK` modes.

## Troubleshooting

- `Request failed: Unauthorized`: verify `APP_TOKEN` and server settings.
- `No code returned`: try a clearer prompt or switch model in BYOK mode.
- `Monaco not found`: open an actual MakeCode project first (not the landing page).
- `CORS/network errors`: ensure backend origins are allowed; for BYOK, check provider key and API availability.
