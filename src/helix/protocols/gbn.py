"""Go-Back-N — Phase 4. A diff on stop-and-wait once that works.

Key state and behavior (yours to implement):
  * base, nextseqnum, window size N
  * a SINGLE timer for the oldest unacked packet
  * sender may transmit while nextseqnum < base + N; emit WINDOW_UPDATE
    whenever base or nextseqnum moves
  * receiver is trivial: accept only the in-order expected seq, discard
    everything else, and send a CUMULATIVE ACK for the last in-order seq
  * on timeout: retransmit EVERYTHING from base to nextseqnum-1
  * on cumulative ACK: slide base forward; restart timer if packets remain

Because the driver hands you all messages up front, throttle sends against the
window rather than blasting them — override _drive() or gate inside app_send.
"""

from __future__ import annotations

from typing import Any

from .base import Packet, Protocol


class GoBackN(Protocol):
    name = "gbn"

    def _setup(self) -> None:
        raise NotImplementedError("Implement Go-Back-N — this is Phase 4.")

    def app_send(self, seq: int, payload: Any) -> None:
        raise NotImplementedError

    def recv_data(self, pkt: Packet) -> None:
        raise NotImplementedError

    def recv_ack(self, pkt: Packet) -> None:
        raise NotImplementedError
