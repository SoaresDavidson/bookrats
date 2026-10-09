from bookrats.sessions import Session, group_sessions
from bookrats.store import Snapshot


def S(p, ts):
    return Snapshot(user_id=1, percentage=p, ts=ts, source="kosync", device=None, document="h")


def test_empty():
    assert group_sessions([]) == []


def test_single_snapshot_session_from_equals_to():
    assert group_sessions([S(0.2, 0)]) == [Session(0.2, 0.2, 0, 0)]


def test_gap_splits_and_from_is_previous_end():
    out = group_sessions([S(0.10, 0), S(0.15, 600), S(0.20, 600 + 1801), S(0.25, 3000)])
    assert out == [Session(0.10, 0.15, 0, 600), Session(0.15, 0.25, 2401, 3000)]


def test_exactly_gap_stays_same_session():
    assert len(group_sessions([S(0.1, 0), S(0.2, 1800)])) == 1


def test_to_uses_latest_not_max():  # two devices disagree
    assert group_sessions([S(0.40, 0), S(0.38, 60)])[0].end_pct == 0.38


def test_three_sessions_chain_from_previous_end():
    out = group_sessions([S(0.1, 0), S(0.2, 10), S(0.3, 5000), S(0.4, 10000)])
    assert len(out) == 3
    assert out[2].start_pct == out[1].end_pct


def test_custom_gap_is_honoured():
    assert len(group_sessions([S(0.1, 0), S(0.2, 100)], gap=50)) == 2


def test_progress_backwards_across_boundary():
    out = group_sessions([S(0.5, 0), S(0.3, 5000)])
    assert out[1] == Session(0.5, 0.3, 5000, 5000)
