"""The engine core must be rock-solid before any protocol rides on it."""

from helix.engine import Sim, Timer


def test_events_fire_in_time_order():
    sim = Sim()
    fired: list[str] = []
    # Schedule out of order; they must fire by time.
    sim.schedule(3.0, lambda: fired.append("c"))
    sim.schedule(1.0, lambda: fired.append("a"))
    sim.schedule(2.0, lambda: fired.append("b"))
    sim.run()
    assert fired == ["a", "b", "c"]


def test_clock_advances_to_event_time():
    sim = Sim()
    seen: list[float] = []
    sim.schedule(5.0, lambda: seen.append(sim.now))
    sim.run()
    assert seen == [5.0]
    assert sim.now == 5.0


def test_same_time_events_dont_compare_callbacks():
    # Two events at the SAME virtual time. Without the counter tiebreaker,
    # the heap would try to compare the two lambdas and raise TypeError.
    sim = Sim()
    order: list[int] = []
    sim.schedule(1.0, lambda: order.append(1))
    sim.schedule(1.0, lambda: order.append(2))
    sim.run()  # must not raise
    assert order == [1, 2]  # FIFO among equal-time events


def test_timer_restart_cancels_old_timeout():
    # Restarting a running timer must make the earlier timeout a silent no-op.
    sim = Sim()
    fires: list[str] = []
    timer = Timer(sim)
    timer.start(10.0, lambda: fires.append("first"))
    # At t=0, restart before the first fires. Only the second should count.
    timer.start(20.0, lambda: fires.append("second"))
    sim.run()
    assert fires == ["second"]


def test_timer_stop_prevents_timeout():
    sim = Sim()
    fires: list[str] = []
    timer = Timer(sim)
    timer.start(10.0, lambda: fires.append("boom"))
    sim.schedule(5.0, timer.stop)  # stop before it fires
    sim.run()
    assert fires == []
