"""The discrete-event simulation core.

This module is the beating heart of Helix and it knows *nothing* about
networking, FastAPI, or WebSockets. It runs on a virtual clock: time only
advances when the next scheduled event fires. That means:

  * simulations are fully deterministic for a given seed,
  * there is zero `asyncio.sleep` polluting protocol logic, and
  * "playback speed" is a frontend concern, never a backend one.

You build and test everything in here with plain `pytest`, long before
FastAPI enters the picture.
"""

from __future__ import annotations

import heapq
import itertools
import random
from typing import Callable


class Sim:
    """A virtual-clock event scheduler.

    The whole engine is a loop: pop the earliest event, advance the clock to
    it, dispatch it. Handlers react by scheduling *more* events. Timers are
    just events scheduled at ``now + delay``.
    """

    def __init__(self, seed: int = 0) -> None:
        self.now: float = 0.0
        self._q: list[tuple[float, int, Callable[[], None]]] = []
        # Monotonic tiebreaker so two events at the same virtual time never
        # cause Python to try comparing the callback functions (which raises).
        self._counter = itertools.count()
        self.trace: list[dict] = []
        self.rng = random.Random(seed)

    def schedule(self, delay: float, fn: Callable[[], None]) -> None:
        """Run ``fn`` after ``delay`` virtual-time units."""
        if delay < 0:
            raise ValueError("delay must be non-negative")
        heapq.heappush(self._q, (self.now + delay, next(self._counter), fn))

    def emit(self, type: str, actor: str, **data) -> None:
        """Append one event to the timeline.

        This is the *only* output of a simulation. The event schema is the
        contract the frontend depends on — treat it as sacred:

            {"t": <virtual time>, "type": <str>, "actor": <str>, "data": {...}}
        """
        self.trace.append(
            {"t": self.now, "type": type, "actor": actor, "data": data}
        )

    def run(self, until: float | None = None) -> list[dict]:
        """Drain the event queue and return the recorded timeline.

        Pass ``until`` to stop advancing past a given virtual time (useful as a
        safety net against a buggy protocol that schedules forever).
        """
        while self._q:
            if until is not None and self._q[0][0] > until:
                break
            t, _, fn = heapq.heappop(self._q)
            self.now = t
            fn()
        return self.trace


class Timer:
    """A restartable timer built on top of :class:`Sim`.

    Restarting a running timer must make the *old* pending timeout a silent
    no-op. Rather than hunt through the heap to delete it, we bump a
    generation counter: when the scheduled callback finally fires, it checks
    whether it's still the current generation and whether the timer is still
    active. Cleaner, and O(1).
    """

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
