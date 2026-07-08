from .base import Packet, Protocol
from .gbn import GoBackN
from .selective_repeat import SelectiveRepeat
from .stop_and_wait import StopAndWait

# Handy lookup for the API layer: /ws?protocol=gbn
REGISTRY: dict[str, type[Protocol]] = {
    StopAndWait.name: StopAndWait,
    GoBackN.name: GoBackN,
    SelectiveRepeat.name: SelectiveRepeat,
}

__all__ = [
    "Packet",
    "Protocol",
    "StopAndWait",
    "GoBackN",
    "SelectiveRepeat",
    "REGISTRY",
]
