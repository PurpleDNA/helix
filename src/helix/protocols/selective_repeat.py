"""Selective Repeat — Phase 5. Another diff, now with per-packet state.

Key differences from GBN (yours to implement):
  * a PER-PACKET timer — a dict keyed by seqnum, not one shared timer
  * receiver BUFFERS out-of-order-but-in-window packets (emit BUFFERED) and
    sends an INDIVIDUAL ACK for each correctly received packet
  * receiver delivers upward only when a contiguous run completes
    (emit DELIVERED_TO_APP as the receive-base slides)
  * sender marks individual packets acked; slides send-base over the
    contiguous acked prefix
  * on a per-packet timeout: retransmit ONLY that packet

Remember the constraint you already know: window size must be <= 2^(k-1) for a
k-bit sequence space, or old retransmissions alias with new packets. With the
unbounded ints used here you won't hit it, but wire the check in when you add
finite sequence numbers — it's a great thing to surface in the frontend.
"""

from __future__ import annotations

from typing import Any

from .base import Packet, Protocol


class SelectiveRepeat(Protocol):
    name = "selective_repeat"

    def _setup(self) -> None:
        raise NotImplementedError("Implement Selective Repeat — this is Phase 5.")

    def app_send(self, seq: int, payload: Any) -> None:
        raise NotImplementedError

    def recv_data(self, pkt: Packet) -> None:
        raise NotImplementedError

    def recv_ack(self, pkt: Packet) -> None:
        raise NotImplementedError
