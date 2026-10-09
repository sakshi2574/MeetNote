"""Rule-based meeting intelligence extracted from transcript text.

This is not a generative language model. Every summary sentence, key point,
action item, and decision is a sentence that appears in the transcript. They
are chosen by word frequency and fixed phrase patterns, then lightly cleaned
(leading filler words removed). Assignees and deadlines are filled in only when
the sentence or its speaker label states them; otherwise they stay empty.
"""

import calendar
import hashlib
import math
import re
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta

MAX_SUMMARY_SENTENCES = 3
MAX_KEY_POINTS = 5
MAX_ITEMS = 20
SUMMARY_SENTENCE_CHARS = 240
KEY_POINT_CHARS = 180
ITEM_CHARS = 300
# Fewer content words than this across the transcript is too little to summarize.
MIN_SUMMARY_CONTENT_WORDS = 6

UNKNOWN_SPEAKER = "Unknown"

STOPWORDS = frozenset(
    """
    a about above after again against all also am an and any are aren't as at be because been before
    being below between both but by can can't cannot could couldn't did didn't do does doesn't doing
    don't down during each few for from further get got gonna had hadn't has hasn't have haven't having
    he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in
    into is isn't it it's its itself just know let let's like me more most mustn't my myself no nor not
    now of off ok okay on once one only or other ought our ours ourselves out over own really right same
    say said see shan't she she'd she'll she's should shouldn't so some such than that that's the their
    theirs them themselves then there there's these they they'd they'll they're they've thing things
    think this those through to too um uh under until up us very want was wasn't way we we'd we'll we're
    we've well were weren't what what's when when's where where's which while who who's whom why why's
    will with won't would wouldn't yeah yes you you'd you'll you're you've your yours yourself
    yourselves going go gone actually basically maybe just kind sort lot lots
    """.split()
)

# Whisper output that appears on silence or music rather than real speech.
NOISE_SENTENCES = frozenset(
    {
        "thank you",
        "thanks",
        "thank you so much",
        "thanks for watching",
        "thank you for watching",
        "please subscribe",
        "subscribe to my channel",
        "like and subscribe",
        "you",
        "bye",
        "okay",
        "ok",
    }
)

_FILLER_PREFIX = re.compile(
    r"^(?:(?:so|okay|ok|and|um+|uh+|well|right|yeah|alright|all right|now)\b[,.\s]*)+",
    re.IGNORECASE,
)
_SENTENCE_BREAK = re.compile(r"(?<=[.!?])\s+")
_WORD = re.compile(r"[a-z][a-z']*")

_PURPOSE = re.compile(
    r"\b(?:today we|today i|this meeting|the purpose|the goal|the agenda|our agenda|we are here to|"
    r"we're here to|we are going to (?:discuss|talk|review|test|look)|we're going to (?:discuss|talk|review|test|look)|"
    r"let's discuss|let's talk about|let's review|we will (?:discuss|review|test)|we'll (?:discuss|review|test)|"
    r"we are (?:currently )?testing|we're (?:currently )?testing)\b",
    re.IGNORECASE,
)

_HEDGE = re.compile(
    r"\b(?:maybe|perhaps|possibly|probably|might|not sure|what if|should we|shall we|"
    r"i suggest|we suggest|suggestion|i propose|we propose|proposal|whether)\b",
    re.IGNORECASE,
)

_DECISION = re.compile(
    r"\b(?:we(?:'ve| have)? decided|(?:it's|it is|it was|it has been) decided|decided to|decided that|"
    r"the decision is|our decision is|final decision|we(?:'ve| have)? agreed|agreed to|agreed that|"
    r"we(?:'re| are) going with|we(?:'ll| will) go with|let's go with|we(?:'ve| have)? settled on|"
    r"we chose|we(?:'ve| have)? chosen|we(?:'re| are) going ahead with|(?:is|are|was|were|has been|have been) approved)\b",
    re.IGNORECASE,
)
_DECISION_BLOCK = re.compile(
    r"(?:\b(?:not|never|yet to|need to|needs to|have to|has to|will|should|could|can|must|going to|"
    r"want to|try to)|n't)\s+(?:\w+\s+)?(?:decide|agree|approve)|\bundecided\b|\bno decision\b|"
    r"\bnot (?:been |yet )?(?:decided|agreed|approved)|\bcould\b",
    re.IGNORECASE,
)

_SELF_COMMIT = re.compile(
    r"\b(?:i'll|i will|i'm going to|i am going to|i can take care of|i'll take care of)\s+(?:also\s+|then\s+|just\s+)?([a-z]+)",
    re.IGNORECASE,
)
_GROUP_COMMIT = re.compile(
    r"\b(?:we|you|they)\s+(?:need to|have to|must|will need to|'ll need to|will|'ll)\s+(?:also\s+|then\s+)?([a-z]+)|"
    r"\b(?:we'll|you'll|they'll)\s+(?:also\s+|then\s+)?([a-z]+)|"
    r"\b(?:need to|needs to)\s+([a-z]+)",
    re.IGNORECASE,
)
_REQUEST = re.compile(
    r"^(?:([A-Z][a-z]+),\s*)?(?:can you|could you|would you|will you|please)\s+([a-z]+)",
    re.IGNORECASE,
)
_EXPLICIT_ACTION = re.compile(r"\b(?:action item|to-do|todo|follow up on|follow-up on)\b", re.IGNORECASE)
_ASSIGNED_TO = re.compile(r"\b(?:assigned to|owner is|owned by)\s+([A-Z][a-z]+)\b")
_NAMED_COMMIT = re.compile(r"\b([A-Z][a-z]+)\s+(?:will|is going to|needs to|has to)\s+([a-z]+)")
_ACTION_BLOCK = re.compile(
    r"\b(?:won't|will not|wouldn't|don't need to|doesn't need to|no need to|not going to|"
    r"already|yesterday|last week|now)\b|^if\b",
    re.IGNORECASE,
)
# Verbs after "I'll" or "we'll" that describe speech or opinion, not a task.
_NON_TASK_VERBS = frozenset(
    {
        "be", "think", "guess", "see", "say", "admit", "assume", "bet", "mention", "hear", "wait",
        "go", "start", "stop", "continue", "talk", "discuss", "explain", "show", "know",
    }
)
_IN_MEETING_REQUESTS = re.compile(
    r"\b(?:hear me|see me|see my|see the screen|see it|repeat|mute|unmute|share your screen|share my screen)\b",
    re.IGNORECASE,
)
_GENERIC_SPEAKER = re.compile(r"^(?:unknown|speaker\s+\d+)$", re.IGNORECASE)

_WEEKDAYS = {name.lower(): index for index, name in enumerate(calendar.day_name)}
_MONTHS = {name.lower(): index for index, name in enumerate(calendar.month_name) if name}
_MONTHS.update({name.lower(): index for index, name in enumerate(calendar.month_abbr) if name})
_MONTH_PATTERN = "|".join(sorted(_MONTHS, key=len, reverse=True))
_DAY_WORDS = re.compile(r"\b(today|tonight|end of (?:the )?day|eod|tomorrow)\b", re.IGNORECASE)
_WEEKDAY = re.compile(
    r"\b(next\s+|this\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
    re.IGNORECASE,
)
_MONTH_DAY = re.compile(rf"\b({_MONTH_PATTERN})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?\b", re.IGNORECASE)
_DAY_MONTH = re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+(?:of\s+)?({_MONTH_PATTERN})\b", re.IGNORECASE)
_ISO_DATE = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")


@dataclass(frozen=True)
class TranscriptLine:
    text: str
    start: float
    speaker: str | None = None


@dataclass(frozen=True)
class KeyPoint:
    text: str
    timestamp: float


@dataclass(frozen=True)
class ActionCandidate:
    task: str
    assignee: str | None
    due_date: date | None
    timestamp: float
    origin_key: str


@dataclass(frozen=True)
class DecisionCandidate:
    decision: str
    timestamp: float
    context: str | None
    origin_key: str


@dataclass(frozen=True)
class MeetingIntelligence:
    summary: str | None
    key_points: tuple[KeyPoint, ...] = ()
    action_items: tuple[ActionCandidate, ...] = ()
    decisions: tuple[DecisionCandidate, ...] = ()


@dataclass(frozen=True)
class _Sentence:
    text: str
    start: float
    speaker: str | None
    line_text: str
    index: int
    words: tuple[str, ...] = field(default=())


def extract_meeting_intelligence(
    lines: Sequence[TranscriptLine],
    meeting_date: date | None = None,
) -> MeetingIntelligence:
    sentences = _meaningful_sentences(lines)
    if not sentences:
        return MeetingIntelligence(summary=None)

    summary_sentences = _summary_sentences(sentences)
    summary = " ".join(_clip(item.text, SUMMARY_SENTENCE_CHARS) for item in summary_sentences) or None
    key_points = _key_points(sentences, summary_sentences)
    known_names = _known_names(lines, sentences)
    return MeetingIntelligence(
        summary=summary,
        key_points=key_points,
        action_items=_action_items(sentences, known_names, meeting_date),
        decisions=_decisions(sentences),
    )


def _meaningful_sentences(lines: Sequence[TranscriptLine]) -> list[_Sentence]:
    seen: set[str] = set()
    sentences: list[_Sentence] = []
    for line in sorted(lines, key=lambda item: item.start):
        line_text = " ".join(str(line.text or "").replace("\u2019", "'").split())
        if not line_text:
            continue
        for raw in _SENTENCE_BREAK.split(line_text):
            text = _clean_sentence(raw)
            normalized = normalize_text(text)
            if not normalized or normalized in NOISE_SENTENCES or normalized in seen:
                continue
            words = tuple(_WORD.findall(text.lower()))
            content = [word for word in words if word not in STOPWORDS and len(word) > 2]
            if len(words) < 3 or not content:
                continue
            seen.add(normalized)
            sentences.append(
                _Sentence(
                    text=text,
                    start=max(0.0, float(line.start)),
                    speaker=line.speaker,
                    line_text=line_text,
                    index=len(sentences),
                    words=tuple(content),
                )
            )
    return sentences


def _summary_sentences(sentences: list[_Sentence]) -> list[_Sentence]:
    total_content = sum(len(item.words) for item in sentences)
    if total_content < MIN_SUMMARY_CONTENT_WORDS:
        return []

    if len(sentences) <= 3:
        count = 1
    elif len(sentences) <= 8:
        count = 2
    else:
        count = MAX_SUMMARY_SENTENCES

    scores = _scores(sentences)
    chosen: list[_Sentence] = []
    early = sentences[: max(1, math.ceil(len(sentences) * 0.4))]
    purpose = next((item for item in early if _PURPOSE.search(item.text)), None)
    if purpose is not None:
        chosen.append(purpose)
    for item in sorted(sentences, key=lambda entry: (-scores[entry.index], entry.index)):
        if len(chosen) >= count:
            break
        if item in chosen or any(_similar(item, other) for other in chosen):
            continue
        chosen.append(item)
    return sorted(chosen, key=lambda item: item.index)


def _key_points(sentences: list[_Sentence], summary: list[_Sentence]) -> tuple[KeyPoint, ...]:
    limit = min(MAX_KEY_POINTS, len(sentences) // 3)
    if limit <= 0:
        return ()
    scores = _scores(sentences)
    chosen: list[_Sentence] = []
    for item in sorted(sentences, key=lambda entry: (-scores[entry.index], entry.index)):
        if len(chosen) >= limit:
            break
        if item in summary or any(_similar(item, other) for other in [*summary, *chosen]):
            continue
        chosen.append(item)
    return tuple(
        KeyPoint(text=_clip(item.text, KEY_POINT_CHARS), timestamp=item.start)
        for item in sorted(chosen, key=lambda entry: entry.index)
    )


def _action_items(
    sentences: list[_Sentence],
    known_names: set[str],
    meeting_date: date | None,
) -> tuple[ActionCandidate, ...]:
    items: list[ActionCandidate] = []
    seen: set[str] = set()
    for item in sentences:
        assignee = _action_assignee(item, known_names)
        if assignee is _NOT_ACTION:
            continue
        normalized = normalize_text(item.text)
        if normalized in seen:
            continue
        seen.add(normalized)
        items.append(
            ActionCandidate(
                task=_clip(item.text, ITEM_CHARS),
                assignee=assignee,
                due_date=parse_deadline(item.text, meeting_date) if meeting_date else None,
                timestamp=item.start,
                origin_key=_origin_key("action", item),
            )
        )
        if len(items) >= MAX_ITEMS:
            break
    return tuple(items)


_NOT_ACTION = object()


def _action_assignee(item: _Sentence, known_names: set[str]):
    """Return the assignee (or None) for an action sentence, or _NOT_ACTION."""
    text = item.text
    if _ACTION_BLOCK.search(text) or _HEDGE.search(text):
        return _NOT_ACTION

    request = _REQUEST.search(text)
    if request:
        if _IN_MEETING_REQUESTS.search(text):
            return _NOT_ACTION
        name = request.group(1)
        return name if name and _is_name(name) else None

    if text.endswith("?"):
        return _NOT_ACTION

    explicit = _ASSIGNED_TO.search(text)
    if explicit and _is_name(explicit.group(1)):
        return explicit.group(1)

    named = _NAMED_COMMIT.search(text)
    if named and named.group(1) in known_names and named.group(2).lower() not in _NON_TASK_VERBS:
        return named.group(1)

    self_commit = _SELF_COMMIT.search(text)
    if self_commit and self_commit.group(1).lower() not in _NON_TASK_VERBS:
        return _speaker_name(item.speaker)

    group = _GROUP_COMMIT.search(text)
    if group:
        verb = next((value for value in group.groups() if value), "").lower()
        if verb and verb not in _NON_TASK_VERBS:
            return None

    if _EXPLICIT_ACTION.search(text):
        return None
    return _NOT_ACTION


def _decisions(sentences: list[_Sentence]) -> tuple[DecisionCandidate, ...]:
    decisions: list[DecisionCandidate] = []
    seen: set[str] = set()
    for item in sentences:
        text = item.text
        if text.endswith("?") or text.lower().startswith("if "):
            continue
        if not _DECISION.search(text) or _DECISION_BLOCK.search(text) or _HEDGE.search(text):
            continue
        normalized = normalize_text(text)
        if normalized in seen:
            continue
        seen.add(normalized)
        context = item.line_text if normalize_text(item.line_text) != normalized else None
        decisions.append(
            DecisionCandidate(
                decision=_clip(text, ITEM_CHARS),
                timestamp=item.start,
                context=_clip(context, ITEM_CHARS * 2) if context else None,
                origin_key=_origin_key("decision", item),
            )
        )
        if len(decisions) >= MAX_ITEMS:
            break
    return tuple(decisions)


def parse_deadline(text: str, meeting_date: date) -> date | None:
    """Return a deadline stated in ``text``, relative to the meeting date.

    Only explicit dates are returned: today, tomorrow, a weekday name, a month
    and day, or an ISO date. Vague phrases such as "next week" and "next
    Friday" return None.
    """
    iso = _ISO_DATE.search(text)
    if iso:
        return _safe_date(int(iso.group(1)), int(iso.group(2)), int(iso.group(3)))

    month_day = _MONTH_DAY.search(text)
    if month_day:
        return _upcoming(meeting_date, _MONTHS[month_day.group(1).lower()], int(month_day.group(2)))
    day_month = _DAY_MONTH.search(text)
    if day_month:
        return _upcoming(meeting_date, _MONTHS[day_month.group(2).lower()], int(day_month.group(1)))

    day_word = _DAY_WORDS.search(text)
    if day_word:
        word = day_word.group(1).lower()
        return meeting_date + timedelta(days=1) if word == "tomorrow" else meeting_date

    weekday = _WEEKDAY.search(text)
    if weekday:
        if weekday.group(1) and weekday.group(1).strip().lower() == "next":
            return None
        target = _WEEKDAYS[weekday.group(2).lower()]
        ahead = (target - meeting_date.weekday()) % 7 or 7
        return meeting_date + timedelta(days=ahead)
    return None


def _upcoming(meeting_date: date, month: int, day: int) -> date | None:
    candidate = _safe_date(meeting_date.year, month, day)
    if candidate is None:
        return None
    if candidate < meeting_date:
        return _safe_date(meeting_date.year + 1, month, day)
    return candidate


def _safe_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _known_names(lines: Sequence[TranscriptLine], sentences: list[_Sentence]) -> set[str]:
    names = {name for line in lines if (name := _speaker_name(line.speaker))}
    for item in sentences:
        request = _REQUEST.search(item.text)
        if request and request.group(1) and _is_name(request.group(1)):
            names.add(request.group(1))
    return {name for name in names if " " not in name}


def _speaker_name(speaker: str | None) -> str | None:
    if not isinstance(speaker, str):
        return None
    cleaned = " ".join(speaker.split())
    if not cleaned or cleaned.lower() == UNKNOWN_SPEAKER.lower():
        return None
    return cleaned


def _is_name(token: str) -> bool:
    lowered = token.lower()
    return (
        lowered not in STOPWORDS
        and lowered not in _WEEKDAYS
        and lowered not in _MONTHS
        and lowered not in {"everyone", "everybody", "someone", "somebody", "team", "guys", "folks", "please"}
    )


def _scores(sentences: list[_Sentence]) -> dict[int, float]:
    frequency = Counter(word for item in sentences for word in set(item.words))
    scores: dict[int, float] = {}
    for item in sentences:
        unique = set(item.words)
        base = sum(frequency[word] for word in unique) / math.sqrt(len(unique))
        if _DECISION.search(item.text):
            base *= 1.3
        scores[item.index] = base
    return scores


def _similar(left: _Sentence, right: _Sentence) -> bool:
    a, b = set(left.words), set(right.words)
    if not a or not b:
        return False
    return len(a & b) / len(a | b) >= 0.6


def _clean_sentence(raw: str) -> str:
    text = _FILLER_PREFIX.sub("", raw.strip()).strip(" ,;:-")
    if not text:
        return ""
    return text[0].upper() + text[1:]


def normalize_text(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9']+", text.lower())).replace("'", "")


def _clip(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    cut = text[: limit - 1].rsplit(" ", 1)[0].rstrip(" ,;:")
    return f"{cut}…"


def _origin_key(kind: str, item: _Sentence) -> str:
    digest = hashlib.sha1(f"{kind}|{item.start:.2f}|{normalize_text(item.text)}".encode()).hexdigest()
    return digest[:32]
