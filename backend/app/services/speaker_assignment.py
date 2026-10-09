"""Match diarization turns to transcript cues by timestamp overlap."""

from collections.abc import Sequence
from dataclasses import dataclass

UNKNOWN_SPEAKER = "Unknown"
# A cue needs this much of its duration covered before a speaker is accepted.
MIN_OVERLAP_RATIO = 0.3
# A second speaker this close to the best overlap means the cue is mixed speech.
AMBIGUITY_RATIO = 0.8


@dataclass(frozen=True)
class SpeakerTurn:
    start: float
    end: float
    speaker: int


def speakers_for_cues(
    cues: Sequence[tuple[float, float]],
    turns: Sequence[SpeakerTurn],
) -> tuple[str, ...]:
    """Return one label per cue.

    Labels follow the order each voice is first assigned to a cue: Speaker 1,
    Speaker 2, and so on. A voice that never wins a cue gets no number, so the
    transcript has no gaps. These numbers identify clusters in this recording.
    They are not the participants' names, and a later diarization pass may
    number the same voice differently.
    """
    valid = [turn for turn in turns if turn.end > turn.start]
    winners = [_speaker_for_cue(start, end, valid) for start, end in sorted(cues)]
    labels: dict[int, str] = {}
    for speaker in winners:
        if speaker is not None and speaker not in labels:
            labels[speaker] = f"Speaker {len(labels) + 1}"
    return tuple(
        labels.get(_speaker_for_cue(start, end, valid), UNKNOWN_SPEAKER) for start, end in cues
    )


def _speaker_for_cue(start: float, end: float, turns: Sequence[SpeakerTurn]) -> int | None:
    duration = end - start
    if duration <= 0 or not turns:
        return None

    overlap_by_speaker: dict[int, float] = {}
    for turn in turns:
        overlap = _overlap(start, end, turn.start, turn.end)
        if overlap <= 0:
            continue
        overlap_by_speaker[turn.speaker] = overlap_by_speaker.get(turn.speaker, 0.0) + overlap

    if not overlap_by_speaker:
        return None

    ranked = sorted(overlap_by_speaker.items(), key=lambda item: item[1], reverse=True)
    best_speaker, best_overlap = ranked[0]
    if best_overlap / duration < MIN_OVERLAP_RATIO:
        return None
    if len(ranked) > 1 and ranked[1][1] >= best_overlap * AMBIGUITY_RATIO:
        return None
    return best_speaker


def _overlap(start: float, end: float, turn_start: float, turn_end: float) -> float:
    return max(0.0, min(end, turn_end) - max(start, turn_start))
