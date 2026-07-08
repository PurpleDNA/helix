"""Stop-and-wait — rdt3.0. Your Phase 3 warmup.

This is Go-Back-N with N=1, but it exercises the *entire* loop:
send -> start timer -> (timeout -> retransmit) | (ACK -> stop timer -> advance).
Get this delivering bytes reliably end-to-end before you touch windows.

TODO (yours to implement):
  * a single alternating-bit or monotonic sequence number
  * one Timer (from helix.engine)
  * on app_send: emit PACKET_SENT, transmit over self.forward, start timer
  * on recv_data (receiver side): check corruption/expected seq, ACK it,
    deliver in order via self.delivered.append(seq) + DELIVERED_TO_APP
  * on recv_ack: if it's the ACK you're waiting for, stop timer, send next
  * on timeout: retransmit the outstanding packet

Emit events using the vocabulary in helix.engine.events so the frontend can
draw it. When this passes tests/test_protocols.py, delete the skip marker.
"""

from __future__ import annotations

from typing import Any, Callable

from .base import Packet, Protocol

from ..engine.sim import Timer
from ..engine.events import PACKET_SENT, TIMER_START, ACK_SENT,PACKET_DISCARDED, DELIVERED_TO_APP


class StopAndWait(Protocol):
    name = "stop_and_wait"

    def _setup(self) -> None:
        # TODO: init sequence number, Timer, outstanding-packet slot.
        self.waiting_no = 0
        self.expected_seq = 0
        self.timer = Timer(self.sim)
        self.outstanding: Packet | None = None

    def _drive(self, seq_no=0):
        if seq_no >= self.n_messages:
            return
        self.app_send(seq_no, payload=f"m{seq_no}")


    def app_send(self, seq: int, payload: Any = None) -> None:
        pkt = Packet(seq, payload=payload)
        self.outstanding = pkt
        self.sim.emit(PACKET_SENT, "sender", seq=seq, payload=payload)
        self.forward.transmit(
            pkt,
            self.recv_data,
        )
        self.sim.emit(TIMER_START, "sender", seq=seq, rto=self.rto)
        self.timer.start(self.rto, lambda: self.app_send(seq, payload))



    def recv_data(self, pkt: Packet, corrupted: bool) -> None:
        ack_seq = self.expected_seq
        if corrupted:
            self.sim.emit(PACKET_DISCARDED, "receiver", reason="corrupted_packet", seq=pkt.seq)
            ack_seq = self.expected_seq - 1
            if ack_seq < 0:
                return 

        elif pkt.seq == self.expected_seq:
            self.sim.emit(DELIVERED_TO_APP, "receiver", seq=pkt.seq)
            self.delivered.append(pkt.seq)
            self.expected_seq += 1
        else:
            self.sim.emit(PACKET_DISCARDED, "receiver", reason="invalid_sequence_number", seq=pkt.seq)

            ack_seq = self.expected_seq - 1

            if ack_seq < 0:
                return  # nothing valid received yet; let the sender's timer retry

        return_pkt = Packet(seq=ack_seq, ack=True)
        self.sim.emit(ACK_SENT, "receiver", seq=ack_seq)
        self.backward.transmit(
            return_pkt,
            self.recv_ack,
        )



    def recv_ack(self, pkt: Packet, corrupted: bool) -> None:
        if not corrupted and pkt.seq == self.waiting_no:
            self.timer.stop()
            self.waiting_no += 1
            self._drive(self.waiting_no)
        else:
            if corrupted:
                self.sim.emit(PACKET_DISCARDED,"sender", reason="corrupt_packet", seq=pkt.seq)
            else:
                self.sim.emit(PACKET_DISCARDED,"sender", reason="invalid_sequence_number", seq=pkt.seq)
    

