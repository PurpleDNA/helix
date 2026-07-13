"""Go-Back-N — Phase 4. A diff on stop-and-wait once that works.

Key state and behavior:
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
from ..engine.sim import Timer
from ..engine.events import (
    ACK_RECEIVED,
    ACK_SENT,
    DELIVERED_TO_APP,
    PACKET_DISCARDED,
    PACKET_SENT,
    TIMER_START,
    TIMER_STOP,
    TIMER_TIMEOUT,
    WINDOW_FULL,
    WINDOW_UPDATE,
)


class GoBackN(Protocol):
    name = "gbn"

    def _setup(self) -> None:
        self.base = 0
        self.next_seq_num = 0
        self.expected_seq_no = 0
        self.timer = Timer(self.sim)

    @property
    def least_unusable_seq_num(self) -> int:
        return self.base + self.window

    # -- sender ----------------------------------------------------------
    def _drive(self) -> None:
        if self.next_seq_num >= self.least_unusable_seq_num:
            self.sim.emit(
                WINDOW_FULL,
                "sender",
                base=self.base,
                nextseqnum=self.next_seq_num,
                size=self.window,
            )
            return


        limit = min(self.least_unusable_seq_num, self.n_messages)
        for num in range(self.next_seq_num, limit):
            self.app_send(num, payload=f"Application Data: {num}")

    def _retransmit(self) -> None:
        for num in range(self.base, self.next_seq_num):
            self.app_send(num, payload=f"Application Data: {num}")

    def _on_timeout(self) -> None:
        self.sim.emit(TIMER_TIMEOUT, "sender", seq=self.base)
        self._retransmit()

    def _start_timer(self, seq: int) -> None:
        self.sim.emit(TIMER_START, "sender", seq=seq, rto=self.rto)
        self.timer.start(self.rto, self._on_timeout)

    def _emit_window(self) -> None:
        self.sim.emit(
            WINDOW_UPDATE,
            "sender",
            base=self.base,
            nextseqnum=self.next_seq_num,
            size=self.window,
        )

    def app_send(self, seq: int, payload: Any) -> None:
        pkt = Packet(seq, payload=payload)
        self.sim.emit(PACKET_SENT, "sender", seq=seq, payload=payload)
        self.forward.transmit(pkt, self.recv_data)


        if seq + 1 > self.next_seq_num:
            self.next_seq_num = seq + 1
            self._emit_window()

        
        if seq == self.base:
            self._start_timer(seq)

    def recv_ack(self, pkt: Packet, corrupted: bool) -> None:
        if corrupted or pkt.seq < self.base:
            reason = "CORRUPTED ACK" if corrupted else "DUPLICATE ACK"
            self.sim.emit(PACKET_DISCARDED, "sender", reason=reason, seq=pkt.seq)
            return

        self.sim.emit(ACK_RECEIVED, "sender", seq=pkt.seq)
        self.base = pkt.seq + 1
        self._emit_window()

        if self.base == self.next_seq_num:
            self.timer.stop()
            self.sim.emit(TIMER_STOP, "sender", seq=pkt.seq)
        else:
            self._start_timer(self.base)

        self._drive()

    # -- receiver --------------------------------------------------------
    def recv_data(self, pkt: Packet, corrupted: bool) -> None:
        if corrupted or pkt.seq != self.expected_seq_no:
            reason = "CORRUPTED PACKET" if corrupted else "OUT OF ORDER PACKET"
            self.sim.emit(PACKET_DISCARDED, "receiver", seq=pkt.seq, reason=reason)
            if self.expected_seq_no > 0:
                self._send_ack(self.expected_seq_no - 1)
            return

        self.sim.emit(DELIVERED_TO_APP, "receiver", seq=pkt.seq)
        self.delivered.append(pkt.seq)
        self.expected_seq_no += 1

        self._send_ack(pkt.seq)

    def _send_ack(self, seq: int) -> None:
        self.sim.emit(ACK_SENT, "receiver", seq=seq)
        self.backward.transmit(Packet(seq=seq, ack=True), self.recv_ack)
