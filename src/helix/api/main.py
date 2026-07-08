"""FastAPI surface for Helix.

Phase 0 (now): the ``/ws`` endpoint streams a HARDCODED 3-event timeline. The
only goal is to prove the pipe end-to-end — Python -> WebSocket -> browser —
so nothing about the transport surprises you when you plug the real engine in.

Phase 6 (later): swap the hardcoded list for `REGISTRY[protocol](**params).run()`
and stream that. Two modes will live here:
  * run-to-completion: precompute the whole timeline, stream it, let the
    frontend own playback (recommended — playback speed is a frontend concern);
  * interactive: accept step/pause/inject-loss messages from the client.

Run it:  uvicorn helix.api.main:app --reload
Then open web/index.html (or visit http://127.0.0.1:8000/ for a pointer).
"""

from __future__ import annotations


from fastapi import FastAPI
from fastapi.responses import HTMLResponse

from .rdt_protocols import router as rdt_protocols_router

app = FastAPI(title="Helix", version="0.1.0")
app.include_router(rdt_protocols_router)


# A stand-in timeline in the exact shape helix.engine.Sim.emit produces.
# When you reach Phase 6, delete this and stream real `sim.trace` output.
_DEMO_TIMELINE = [
    {"t": 0.0, "type": "PACKET_SENT", "actor": "sender", "data": {"seq": 0}},
    {"t": 1.0, "type": "PACKET_RECEIVED", "actor": "receiver", "data": {"seq": 0, "corrupted": False}},
    {"t": 2.0, "type": "ACK_RECEIVED", "actor": "sender", "data": {"acknum": 0}},
]


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
async def index() -> str:
    return (
        "<h1>Helix backend is running.</h1>"
        "<p>WebSocket timeline at <code>/ws</code>. "
        "Open <code>web/index.html</code> to see it render.</p>"
    )

