"""The unreliable channel.

A payload-agnostic pipe with tunable loss, corruption, and per-packet delay.
Because each packet draws an *independent* random propagation delay, reordering
falls out for free — no special-casing needed.

The channel deliberately knows nothing about sequence numbers or ACKs. It
carries opaque payloads and reports corruption via a flag; the protocol layer
decides what any of it means. This keeps the engine free of protocol details.
"""

from __future__ import annotations

from typing import Any, Callable

from .events import PACKET_DROPPED, PACKET_CORRUPTED
from .sim import Sim


class UnreliableChannel:
    def __init__(
        self,
        sim: Sim,
        loss: float = 0.0,
        corrupt: float = 0.0,
        base_delay: float = 1.0,
        jitter: float = 0.0,
    ) -> None:
        if not (0.0 <= loss < 1.0):
            raise ValueError("loss must be in [0, 1)")
        if not (0.0 <= corrupt <= 1.0):
            raise ValueError("corrupt must be in [0, 1]")
        self.sim = sim
        self.loss = loss
        self.corrupt = corrupt
        self.base_delay = base_delay
        self.jitter = jitter

    def transmit(
        self,
        payload: Any,
        on_deliver: Callable[[Any, bool], None],
        label: str = "",
    ) -> None:
        """Attempt to deliver ``payload``.

        ``on_deliver(payload, corrupted)`` is scheduled at the arrival time if
        the packet survives. Dropped packets emit ``PACKET_DROPPED`` and never
        arrive. Uses ``sim.rng`` so every run is reproducible under a seed.
        """
        rng = self.sim.rng
        if rng.random() < self.loss:
            self.sim.emit(PACKET_DROPPED, "channel", label=label, reason="loss")
            return

        corrupted = rng.random() < self.corrupt
        if corrupted:
            self.sim.emit(PACKET_CORRUPTED, "channel", label=label, reason="corruption")
        delay = self.base_delay + rng.random() * self.jitter
        self.sim.schedule(delay, lambda: on_deliver(payload, corrupted))
