from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from helix.engine import Sim, UnreliableChannel


@dataclass
class Packet:
    seq: int = 0
    ack: bool = False
    payload: Any = None
    corrupted: bool = False
    sack: list[int] = field(default_factory=list)  # Selective-ACK blocks (SR/TCP)


class Protocol:
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
        raise NotImplementedError

    def run(self) -> list[dict]:
        self._drive()
        return self.sim.run(until=self.rto * self.n_messages * 100)  # safety cap

    def _drive(self) -> None:
        for seq in range(self.n_messages):
            self.app_send(seq, payload=f"m{seq}")

    # -- to be implemented by each protocol ------------------------------
    def app_send(self, seq: int, payload: Any) -> None:  # pragma: no cover
        raise NotImplementedError

    def recv_data(self, pkt: Packet) -> None:  # pragma: no cover
        raise NotImplementedError

    def recv_ack(self, pkt: Packet) -> None:  # pragma: no cover
        raise NotImplementedError
