"""Shared protocol scaffolding: the packet shape and the sender/receiver roles.

The three RDT protocols (stop-and-wait, Go-Back-N, Selective Repeat) all speak
in :class:`Packet` and all plug into the same :class:`Sim` + channel. Keeping a
common base means the FastAPI layer and the tests treat every protocol
identically — construct it, run it, read ``sim.trace``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from helix.engine import Sim, UnreliableChannel


@dataclass
class Packet:
    """A unit on the wire. ``ack=True`` marks it as an acknowledgement.

    ``corrupted`` is set by the channel on delivery, not by the sender. Real
    protocols detect this via a checksum; here it's a flag your receiver FSM
    checks before accepting.
    """

    seq: int = 0
    ack: bool = False
    payload: Any = None
    corrupted: bool = False
    sack: list[int] = field(default_factory=list)  # Selective-ACK blocks (SR/TCP)


class Protocol:
    """Base class wiring a sender+receiver to a shared sim and two channels.

    Subclasses implement the FSMs. This base just holds the plumbing and the
    application-level driver (``deliver_stream``) that feeds N messages in and
    lets the simulation run to completion.

    Subclass contract — implement:
        app_send(self, seq, payload)   # sender: application hands down data
        recv_data(self, pkt)           # receiver: a data packet arrives
        recv_ack(self, pkt)            # sender: an ACK arrives

    Emit events through ``self.sim.emit(...)`` using the vocabulary in
    ``helix.engine.events`` so the frontend can render your protocol.
    """

    name: str = "base"

    def __init__(
        self,
        n_messages: int,
        window: int = 1,
        loss: float = 0.2,
        corrupt: float = 0.0,
        rto: float = 20.0,
        seed: int = 0,
        base_delay: float = 1.0,
        jitter: float = 0.0,
    ) -> None:
        self.sim = Sim(seed=seed)
        self.n_messages = n_messages
        self.window = window
        self.rto = rto
        # Two directions so data and ACKs can be lost independently.
        self.forward = UnreliableChannel(
            self.sim, loss=loss, corrupt=corrupt, base_delay=base_delay, jitter=jitter
        )
        self.backward = UnreliableChannel(
            self.sim, loss=loss, corrupt=corrupt, base_delay=base_delay, jitter=jitter
        )
        # What the receiver has delivered up to the application, in order.
        # The correctness invariant checks this equals the sent stream.
        self.delivered: list[int] = []
        self._setup()

    # -- lifecycle you may override --------------------------------------
    def _setup(self) -> None:
        """Hook for subclasses to init window state, timers, buffers, etc."""

    def run(self) -> list[dict]:
        """Kick off the app-level send loop and drain the simulation."""
        self._drive()
        return self.sim.run(until=self.rto * self.n_messages * 100)  # safety cap

    def _drive(self) -> None:
        """Feed the application stream into the sender.

        The simplest driver: hand every message to the sender at t=0 and let
        the window logic throttle. Subclasses with flow control can override
        to pace sends behind window availability.
        """
        for seq in range(self.n_messages):
            self.app_send(seq, payload=f"m{seq}")

    # -- to be implemented by each protocol ------------------------------
    def app_send(self, seq: int, payload: Any) -> None:  # pragma: no cover
        raise NotImplementedError

    def recv_data(self, pkt: Packet) -> None:  # pragma: no cover
        raise NotImplementedError

    def recv_ack(self, pkt: Packet) -> None:  # pragma: no cover
        raise NotImplementedError
