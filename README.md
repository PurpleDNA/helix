# Helix

Watch **real** network protocols run. A deterministic discrete-event
simulation engine written in Python streams a timeline of protocol events over
WebSockets to a thin frontend renderer. Not an animation of a protocol — the
actual FSM, executed.

First module: reliable data transfer (stop-and-wait → Go-Back-N → Selective
Repeat).

## Architecture

```
helix/
├── src/helix/
│   ├── engine/          # pure, deterministic sim core — knows nothing of the web
│   │   ├── sim.py       #   Sim (virtual clock + event queue) + Timer
│   │   ├── channel.py   #   UnreliableChannel (loss / corrupt / delay / reorder)
│   │   └── events.py    #   the event vocabulary — your contract with the frontend
│   ├── protocols/       # the FSMs you implement
│   │   ├── base.py      #   Packet + Protocol base (plumbing done for you)
│   │   ├── stop_and_wait.py   #   ← Phase 3 (stub)
│   │   ├── gbn.py             #   ← Phase 4 (stub)
│   │   └── selective_repeat.py #  ← Phase 5 (stub)
│   └── api/main.py      # FastAPI: /health + /ws (Phase 0 hardcoded timeline)
├── tests/               # green on unzip; protocol tests skipped until you fill them
└── web/index.html       # throwaway pipe-test renderer
```

The rule that governs everything: **the engine is pure and runs on a virtual
clock.** No `asyncio.sleep` in protocol logic. Playback speed is a frontend
concern. You build and test the whole simulator with `pytest` before FastAPI
matters.

## Quickstart

From this folder, inside your WSL Ubuntu shell:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

pytest                    # engine + channel + api tests pass; protocol tests skip
uvicorn helix.api.main:app --reload
```

Then open `web/index.html` in a browser and hit **connect & stream** — three
dots should march across the timeline. That's the pipe proven end-to-end.

## The plan

| Phase | What | Status |
|------:|------|--------|
| 0 | Walking skeleton: WS streams a hardcoded 3-event timeline | ✅ done |
| 1 | Discrete-event core (`Sim`, `Timer`) | ✅ done |
| 2 | Unreliable channel | ✅ done |
| 3 | Stop-and-wait (rdt3.0) — the warmup | ⬜ your turn |
| 4 | Go-Back-N | ⬜ |
| 5 | Selective Repeat | ⬜ |
| 6 | Wire the real engine into FastAPI (run-to-completion, then interactive) | ⬜ |
| 7 | Renderers: timeline player + sliding-window bar | ⬜ |

Start in `src/helix/protocols/stop_and_wait.py`. When it delivers bytes
reliably, remove the skip marker in `tests/test_protocols.py` and watch the
invariant go green.

The one invariant to never break: **for any seed and any loss < 1.0, the
receiver delivers exactly the sent stream, in order.**

## License

[MIT](LICENSE) © puprledna
