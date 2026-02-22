# Vibbit managed backend

Reference backend for managed mode.

## Endpoints

- `GET /healthz`
- `POST /vibbit/generate`

## Request/response contract

### `POST /vibbit/generate` request body

```json
{
  "target": "microbit",
  "request": "Create a simple blinking LED pattern",
  "currentCode": "optional existing JS"
}
```

### Success response

```json
{
  "code": "basic.showIcon(IconNames.Heart)",
  "feedback": ["At least one feedback line is always returned"]
}
```

### Error response

```json
{
  "error": "Human-readable error message"
}
```

## Quick start

```bash
cd apps/backend
cp .env.example .env
# set VIBBIT_PROVIDER and a matching API key
npm start
```

Server defaults:

- URL: `http://localhost:8787`
- Provider: `openai`

## Environment variables

- `PORT` (default `8787`)
- `VIBBIT_ALLOW_ORIGIN` (default `*`)
- `VIBBIT_REQUEST_TIMEOUT_MS` (default `60000`)
- `SERVER_APP_TOKEN` (optional bearer token)
- `VIBBIT_PROVIDER` (`openai` | `gemini` | `openrouter`)
- `VIBBIT_MODEL` fallback model
- `VIBBIT_API_KEY` fallback key
- Provider-specific overrides:
  - `VIBBIT_OPENAI_API_KEY`, `VIBBIT_OPENAI_MODEL`
  - `VIBBIT_GEMINI_API_KEY`, `VIBBIT_GEMINI_MODEL`
  - `VIBBIT_OPENROUTER_API_KEY`, `VIBBIT_OPENROUTER_MODEL`
