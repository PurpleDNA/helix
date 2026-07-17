from __future__ import annotations

from typing import Any

from .base import Packet, Protocol

from ..engine.sim import Timer
from ..engine.events import PACKET_SENT, TIMER_START, TIMER_TIMEOUT, ACK_SENT,PACKET_DISCARDED, DELIVERED_TO_APP, ACK_RECEIVED


class StopAndWait(Protocol):
    name = "stop_and_wait"

    def _setup(self) -> None:
        # TODO: init sequence number, Timer, outstanding-packet slot.
        self.waiting_no = 0
        self.expected_seq = 0
        self.timer = Timer(self.sim)
        # self.outstanding: Packet | None = None

    # -- sender ----------------------------------------------------------

    def _drive(self, seq_no=0):
        if seq_no >= self.n_messages:
            return
        self.app_send(seq_no, payload=f"Application Data: {seq_no}")


    def app_send(self, seq: int, payload: Any = None) -> None:
        pkt = Packet(seq, payload=payload)
        # self.outstanding = pkt
        self.sim.emit(PACKET_SENT, "sender", seq=seq, payload=payload)
        self.forward.transmit(
            pkt,
            self.recv_data,
        )
        self.sim.emit(TIMER_START, "sender", seq=seq, rto=self.rto)

        def _on_timeout() -> None:
            self.sim.emit(TIMER_TIMEOUT, "sender", seq=seq)
            self.app_send(seq, payload)

        self.timer.start(self.rto, _on_timeout)

    def recv_ack(self, pkt: Packet, corrupted: bool) -> None:
        if not corrupted and pkt.seq == self.waiting_no:
            self.sim.emit(ACK_RECEIVED, "sender", seq=pkt.seq)
            self.timer.stop()
            self.waiting_no += 1
            self._drive(self.waiting_no)
        else:
            reason = "CORRUPTED PACKET" if corrupted else "INVALID SEQUENCE NUMBER"
            self.sim.emit(PACKET_DISCARDED, "sender", reason=reason, seq=pkt.seq)


    # -- receiver ----------------------------------------------------------

    def recv_data(self, pkt: Packet, corrupted: bool) -> None:
        if not corrupted and pkt.seq == self.expected_seq:
            self.sim.emit(DELIVERED_TO_APP, "receiver", seq=pkt.seq)
            self.delivered.append(pkt.seq)
            ack_seq = self.expected_seq
            self.expected_seq += 1
        else:
            reason = "CORRUPTED PACKET" if corrupted else "INVALID SEQUENCE NUMBER"
            self.sim.emit(PACKET_DISCARDED, "receiver", reason=reason, seq=pkt.seq)
            ack_seq = self.expected_seq - 1
            if ack_seq < 0:
                return  # nothing valid received yet; let the sender's timer retry

        return_pkt = Packet(seq=ack_seq, ack=True)
        self.sim.emit(ACK_SENT, "receiver", seq=ack_seq)
        self.backward.transmit(return_pkt, self.recv_ack)


