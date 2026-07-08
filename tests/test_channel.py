"""The channel is the source of all unreliability — pin down its statistics."""

from helix.engine import Sim, UnreliableChannel


def test_no_loss_delivers_everything():
    sim = Sim(seed=1)
    ch = UnreliableChannel(sim, loss=0.0, base_delay=1.0)
    delivered: list[int] = []
    for i in range(100):
        ch.transmit(i, lambda payload, corrupted: delivered.append(payload))
    sim.run()
    assert sorted(delivered) == list(range(100))


def test_empirical_loss_rate_is_close():
    sim = Sim(seed=42)
    ch = UnreliableChannel(sim, loss=0.1, base_delay=1.0)
    delivered = 0
    n = 10_000

    def on_deliver(payload, corrupted):
        nonlocal delivered
        delivered += 1

    for i in range(n):
        ch.transmit(i, on_deliver)
    sim.run()

    empirical_loss = 1 - delivered / n
    assert abs(empirical_loss - 0.1) < 0.02  # within 2 percentage points


def test_same_seed_is_reproducible():
    def run() -> int:
        sim = Sim(seed=7)
        ch = UnreliableChannel(sim, loss=0.3, base_delay=1.0)
        count = 0

        def on_deliver(payload, corrupted):
            nonlocal count
            count += 1

        for i in range(500):
            ch.transmit(i, on_deliver)
        sim.run()
        return count

    assert run() == run()  # identical seed -> identical outcome


def test_jitter_can_reorder():
    # With jitter, later sends can arrive before earlier ones.
    sim = Sim(seed=3)
    ch = UnreliableChannel(sim, loss=0.0, base_delay=1.0, jitter=10.0)
    arrivals: list[int] = []
    for i in range(50):
        ch.transmit(i, lambda payload, corrupted: arrivals.append(payload))
    sim.run()
    assert sorted(arrivals) == list(range(50))       # all arrive
    assert arrivals != list(range(50))               # but not in send order
