from dataclasses import dataclass

from bookrats.store import Snapshot

DEFAULT_GAP = 1800


@dataclass
class Session:
    start_pct: float
    end_pct: float
    started_at: int
    ended_at: int


def group_sessions(snaps: list[Snapshot], gap: int = DEFAULT_GAP) -> list[Session]:
    """Group snapshots (ordered by ts) into reading sessions, oldest first.

    A new session starts when two consecutive snapshots are more than `gap`
    seconds apart. A session's start_pct is the previous session's end_pct
    (what the reader had before sitting down), or the first snapshot's
    percentage for the very first session. end_pct is the latest snapshot's
    percentage, not the maximum.
    """
    if len(snaps) == 0:
        return []
    sessions: list[Session] = []
    first: Snapshot = snaps[0]
    last: Snapshot = snaps[0]
    prev_end: float = snaps[0].percentage

    for snap in snaps[1:]:
        if snap.ts - last.ts > gap:
            sn: Session = Session(
                start_pct=prev_end,
                end_pct=last.percentage,
                started_at=first.ts,
                ended_at=last.ts,
            )
            prev_end = last.percentage
            first = snap
            sessions.append(sn)
        last = snap

    sessions.append(
        Session(
            start_pct=prev_end,
            end_pct=last.percentage,
            started_at=first.ts,
            ended_at=last.ts,
        )
    )
    return sessions
