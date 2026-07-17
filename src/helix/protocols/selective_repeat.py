from __future__ import annotations

from typing import Any, Dict

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
    PACKET_BUFFERING
)


class SelectiveRepeat(Protocol):
    name = "selective_repeat"

    def _setup(self) -> None:
        if self.window > (self.n_messages / 2): raise ValueError("Selective Repeat Window must be less than or equal to half of the sample space.")
        self.sender_base,self.receiver_base = 0,0
        self.next_seq_num = 0
        self.timer_dict:Dict[int, Timer] = {}
        self.receiver_buffer:list[int]= []
        self.received_ACKs: list[int] =[]

    @property
    def least_unusable_seq_num(self) -> int:
        return self.sender_base + self.window
    
    def _emit_window(self,actor) -> None:
        self.sim.emit(
        WINDOW_UPDATE,
        actor,
        nextseqnum=self.next_seq_num,
        size=self.window,
    )

    # -- sender ----------------------------------------------------------
    
    def _drive(self):
        if self.next_seq_num >= self.least_unusable_seq_num:
            self.sim.emit(
                WINDOW_FULL,
                "sender",
                base=self.sender_base,
                nextseqnum=self.next_seq_num,
                size=self.window,
            )
            return


        limit = min(self.least_unusable_seq_num, self.n_messages)
        for num in range(self.next_seq_num, limit):
            self.app_send(num, payload=f"Application Data: {num}")

    def _retransmit(self,seq_no) -> None:
        self.app_send(seq_no, payload=f"Application Data: {seq_no}")

    def _on_timeout(self,seq) -> None:
        self.sim.emit(TIMER_TIMEOUT, "sender", seq=seq)
        self._retransmit(seq)

    def _start_timer(self, seq: int) -> None:
        self.sim.emit(TIMER_START, "sender", seq=seq, rto=self.rto)
        if seq not in self.timer_dict:
            self.timer_dict[seq] = Timer(self.sim)
        self.timer_dict[seq].start(self.rto, lambda: self._on_timeout(seq))

    def _advance_sender_window(self) -> None:
        new_base = self.sender_base + self.window
        for num in range(self.sender_base, self.sender_base + self.window):
            if num == self.sender_base or num in self.received_ACKs:
                if num != self.sender_base:
                    self.received_ACKs.remove(num)
            else:
                new_base = num
                break
        self.sender_base = new_base
        for seq in [s for s in self.timer_dict if s < self.sender_base]:
            self.timer_dict[seq].stop()
            del self.timer_dict[seq]

    def app_send(self, seq: int, payload: Any) -> None:
        pkt = Packet(seq, payload=payload)
        self.sim.emit(PACKET_SENT, "sender", seq=seq, payload=payload)
        self.forward.transmit(pkt, self.recv_data)
        self._start_timer(seq)

        if seq + 1 > self.next_seq_num:
            self.next_seq_num = seq + 1
            self._emit_window("sender")

     
    def recv_ack(self, pkt: Packet, corrupted: bool) -> None:
        if corrupted or pkt.seq not in range(self.sender_base, self.least_unusable_seq_num):
            reason = "CORRUPTED ACK" if corrupted else "DUPLICAE ACK"
            self.sim.emit(PACKET_DISCARDED, "sender", reason=reason, seq=pkt.seq)
            return

        self.sim.emit(ACK_RECEIVED, "sender", seq=pkt.seq)
        self.sim.emit(TIMER_STOP, "sender", seq=pkt.seq)
        self.timer_dict[pkt.seq].stop()
        if pkt.seq != self.sender_base:
            self.received_ACKs.append(pkt.seq)
            return
        self._advance_sender_window()
        self._drive()
    
    # -- receiver ----------------------------------------------------------
    def recv_data(self, pkt: Packet, corrupted: bool) -> None:
        if corrupted or pkt.seq not in range (self.receiver_base - self.window, self.receiver_base + self.window):
            reason = "CORRUPTED PACKET" if corrupted else "OUT OF WINDOW(S) PACKET"
            self.sim.emit(PACKET_DISCARDED, "receiver", seq=pkt.seq, reason=reason)
            return
        if pkt.seq in range (self.receiver_base - self.window,self.receiver_base):
            self._send_ack(pkt.seq)
            return
        
        if pkt.seq != self.receiver_base:
            self.sim.emit(PACKET_BUFFERING, "receiver", seq=pkt.seq)
            self.receiver_buffer.append(pkt.seq)
            self._send_ack(pkt.seq)
            return
        
        self._send_ack(pkt.seq)
        self._drain_buffer()
        self._emit_window("receiver")


    def _send_ack(self, seq: int) -> None:
        self.sim.emit(ACK_SENT, "receiver", seq=seq)
        self.backward.transmit(Packet(seq=seq, ack=True), self.recv_ack)

    def _drain_buffer(self) -> None:
        new_base = self.receiver_base + self.window
        for num in range(self.receiver_base, self.receiver_base + self.window):
            if num == self.receiver_base or num in self.receiver_buffer:
                self.sim.emit(DELIVERED_TO_APP, "receiver", seq=num)
                self.delivered.append(num)
                if num != self.receiver_base:
                    self.receiver_buffer.remove(num)
            else:
                new_base = num
                break
        self.receiver_base = new_base
        self.receiver_buffer = [s for s in self.receiver_buffer if s >= self.receiver_base]
        
        

