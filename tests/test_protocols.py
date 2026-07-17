"""The correctness invariant of the whole enterprise.

RDT, expressed as an assertion: for any seed and any loss < 1.0, the receiver
delivers exactly the sent stream, in order. If this ever fails, your protocol
is wrong — not your visualization.

These are SKIPPED until you implement the corresponding FSM. As you finish each
protocol (Phase 3, 4, 5), delete its skip marker and watch it go green.
"""

import pytest

from helix.protocols import GoBackN, SelectiveRepeat, StopAndWait

SEEDS = [0, 1, 2, 7, 42, 1234]
EXPECTED = list(range(20))  # driver sends messages 0..19


def _assert_reliable(protocol):
    """Run a protocol to completion; delivered stream must equal 0..N-1."""
    protocol.run()
    assert protocol.delivered == EXPECTED


@pytest.mark.parametrize("seed", SEEDS)
@pytest.mark.parametrize("loss", [0.0, 0.1, 0.3, 0.5])
def test_stop_and_wait_is_reliable(seed, loss):
    _assert_reliable(StopAndWait(n_messages=20, loss=loss, seed=seed))


@pytest.mark.parametrize("seed", SEEDS)
@pytest.mark.parametrize("loss", [0.0, 0.1, 0.3, 0.5])
def test_gbn_is_reliable(seed, loss):
    _assert_reliable(GoBackN(n_messages=20, window=4, loss=loss, seed=seed))


# @pytest.mark.skip(reason="Implement SelectiveRepeat (Phase 5), then remove this skip.")
@pytest.mark.parametrize("seed", SEEDS)
@pytest.mark.parametrize("loss", [0.0, 0.1, 0.3, 0.5])
def test_selective_repeat_is_reliable(seed, loss):
    _assert_reliable(SelectiveRepeat(n_messages=20, window=4, loss=loss, seed=seed))
