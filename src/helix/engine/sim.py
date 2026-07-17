from __future__ import annotations

import heapq
import itertools
import random
from typing import Callable


class Sim:
    def __init__(self, seed: int = 0) -> None:
        self.now: float = 0.0
        self._q: list[tuple[float, int, Callable[[], None]]] = []
        self._counter = itertools.count()
        self.trace: list[dict] = []
        self.rng = random.Random(seed)

    def schedule(self, delay: float, fn: Callable[[], None]) -> None:
        if delay < 0:
            raise ValueError("delay must be non-negative")
        heapq.heappush(self._q, (self.now + delay, next(self._counter), fn))

    def emit(self, type: str, actor: str, **data) -> None:
        self.trace.append(
            {"t": self.now, "type": type, "actor": actor, "data": data}
        )

    def run(self, until: float | None = None) -> list[dict]: 
        while self._q:
            if until is not None and self._q[0][0] > until:
                break
            t, _, fn = heapq.heappop(self._q)
            self.now = t
            fn()
        return self.trace


class Timer:


    def __init__(self, sim: Sim) -> None:
        self.sim = sim
        self._gen = 0
        self.active = False

    def start(self, delay: float, on_timeout: Callable[[], None]) -> None:
        self._gen += 1
        self.active = True
        gen = self._gen

        def fire() -> None:
            if self.active and self._gen == gen:
                self.active = False
                on_timeout()

        self.sim.schedule(delay, fire)

    def stop(self) -> None:
        self.active = False
