# --- data-plane movement ---------------------------------------------------
PACKET_SENT = "PACKET_SENT"            # data={seq, payload?}
PACKET_DROPPED = "PACKET_DROPPED"      # data={seq, kind, reason}  kind: "data"|"ack"
PACKET_CORRUPTED = "PACKET_CORRUPTED"  # data={seq, kind, reason}  kind: "data"|"ack"
PACKET_RECEIVED = "PACKET_RECEIVED" 
PACKET_DISCARDED = "PACKET_DISCARDED"   # data={seq, corrupted}
PACKET_BUFFERING = "PACKET_BUFFERING"

# --- acknowledgements ------------------------------------------------------
ACK_SENT = "ACK_SENT"                  # data={acknum, sack?}
ACK_RECEIVED = "ACK_RECEIVED"          # data={acknum}

# --- timers ----------------------------------------------------------------
TIMER_START = "TIMER_START"            # data={seq?, rto}
TIMER_STOP = "TIMER_STOP"              # data={seq?}
TIMER_TIMEOUT = "TIMER_TIMEOUT"        # data={seq?}

# --- sender/receiver bookkeeping ------------------------------------------
WINDOW_UPDATE = "WINDOW_UPDATE"        # data={base, nextseqnum, size}
BUFFERED = "BUFFERED"                  # data={seq}   (Selective Repeat receiver)
DELIVERED_TO_APP = "DELIVERED_TO_APP"  # data={seq}   (in-order delivery upward)
WINDOW_FULL = "WINDOW_FULL"
