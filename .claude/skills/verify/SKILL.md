# Verify Helix changes

## Backend (FastAPI sim engine)
- Usually already running at `127.0.0.1:8000` (check `curl -s 127.0.0.1:8000/health`).
  If not: `uvicorn helix.api.main:app --reload` from repo root (uv project).
- Drive the RDT websocket directly with `uv run --with websockets python` —
  connect to `ws://127.0.0.1:8000/ws/rdt-protocols/?protocol=gbn&n_messages=20&loss=0.2&corrupt=0.1&window=5&rto=12&seed=7`
  and read `timeline_start` → `event`* → `timeline_end`.

## Frontend (Vite + React, `frontend/`)
- `cd frontend && npm run dev` (port 5173). Vite proxies `/ws` to the backend, so
  pages talk to `ws://localhost:5173/ws/...` — backend must be up for /rdt.
- Browser driving: playwright is NOT a project dep. Install it in the session
  scratchpad (`npm i playwright && npx playwright install chromium`) and point
  scripts at `http://localhost:5173`. Headless chromium works fine in this WSL2 env.
- /rdt specifics: the stage auto-runs on mount; wait for
  `.stage-frame:not([data-loading])`. Readout buttons are `.readouts .btn`
  (0=play/pause, 1=speed, 2=restart). Playback is slow by design
  (3.6 s per sim tick at 1×) — click speed to 4× before sampling, and expect
  long quiet stretches at high loss (channel legitimately empty while RTO drains).
- Kill the dev server when done (`pkill -f vite`) — but never kill uvicorn;
  the user usually owns that process.

## Gotchas
- `git status` first: the user sometimes commits parts of the session's work
  themselves mid-conversation.
- Sim is deterministic per seed; the /rdt page sends a random seed per run,
  so pass an explicit seed when you need reproducible websocket output.
