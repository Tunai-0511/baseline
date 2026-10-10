"""Shared helpers for the tools/data/*.py scripts (data agent).

Every script is deterministic: a fixed seed, no wall-clock, no network. Outputs go to app/public/data/<name>.json as
compact JSON with floats rounded to float32 precision (7 significant digits), so a scene can feed them straight to
Float32Array without losing anything that was really there.

  from _common import ROOT, PUB, WIP, save_json, f32, lyric_words, bpe_tokens
"""
from __future__ import annotations

import base64
import json
import math
import os
import re
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]          # one-more-summer/
DATA = ROOT / 'data'                                 # repo-level data (read-only): lyrics.json, audio.json, bpe.json
TDATA = ROOT / 'tools' / 'data'                      # checkpoints, npz, intermediate files
PUB = ROOT / 'app' / 'public' / 'data'               # outputs the app loads (fetchData('<name>.json'))
WIP = ROOT / 'out' / 'wip' / 'p0' / 'data'           # QA previews
PUB.mkdir(parents=True, exist_ok=True)
WIP.mkdir(parents=True, exist_ok=True)


def f32(x, sig: int = 7):
    """Round floats (scalars, lists, numpy arrays, nested dicts) to float32 precision for compact JSON."""
    if isinstance(x, dict):
        return {k: f32(v, sig) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [f32(v, sig) for v in x]
    if isinstance(x, np.ndarray):
        if x.dtype.kind in 'iub':
            return x.tolist()
        return f32(x.astype(np.float64).tolist(), sig)
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, (np.bool_,)):
        return bool(x)
    if isinstance(x, (float, np.floating)):
        v = float(np.float32(x))
        if not math.isfinite(v):
            return None if math.isnan(v) else (3.4e38 if v > 0 else -3.4e38)
        if v == 0.0:
            return 0
        r = float(f'{v:.{sig}g}')
        return int(r) if r.is_integer() and abs(r) < 1e15 else r
    return x


def save_json(name: str, obj: dict, sig: int = 7) -> Path:
    """Write app/public/data/<name> (compact, float32-rounded). Returns the path."""
    p = PUB / name
    p.parent.mkdir(parents=True, exist_ok=True)
    s = json.dumps(f32(obj, sig), separators=(',', ':'), ensure_ascii=False, allow_nan=False)
    p.write_text(s)
    print(f'  wrote {p.relative_to(ROOT)}  ({len(s) / 1024:.1f} KB)')
    return p


def b64(a: np.ndarray, dtype) -> str:
    """Little-endian base64 of an array cast to dtype (float16 / uint8 / int8 ...)."""
    return base64.b64encode(np.ascontiguousarray(a, dtype=np.dtype(dtype).newbyteorder('<')).tobytes()).decode('ascii')


def load_json(p):
    return json.loads(Path(p).read_text())


def lyrics() -> dict:
    return load_json(DATA / 'lyrics.json')


_APOS = str.maketrans({'’': "'", '‘': "'", '“': '"', '”': '"'})


def norm_word(w: str) -> str:
    """Lower-case word with the surrounding punctuation stripped ("problem’s" -> "problem's", "line," -> "line")."""
    w = w.translate(_APOS).lower()
    return re.sub(r"^[^a-z0-9']+|[^a-z0-9']+$", '', w)


def lyric_words():
    """[(line, word, raw, normalised, start, end)] for every sung word, in song order."""
    out = []
    for L in lyrics()['lines']:
        for j, w in enumerate(L['words']):
            out.append((L['i'], j, w['w'], norm_word(w['w']), w['start'], w['end']))
    return out


def bpe_tokens():
    """(tokens: list[str], ids: np.ndarray, vocab: list[str]) — ids index vocab in order of first appearance."""
    toks = load_json(DATA / 'bpe.json')['tokens']
    vocab, idx = [], {}
    for t in toks:
        if t not in idx:
            idx[t] = len(vocab)
            vocab.append(t)
    return toks, np.array([idx[t] for t in toks], np.int64), vocab


def tok_text(t: str) -> str:
    return t.replace('Ġ', ' ').replace('Ċ', '\n')


def find_token_span(toks, text: str, occurrence: int = 0):
    """Token indices [a, b) whose concatenated text covers the first char..last char of `text` (case-sensitive,
    searched in the decoded song). Raises if not found."""
    s = ''.join(tok_text(t) for t in toks)
    i = -1
    for _ in range(occurrence + 1):
        i = s.find(text, i + 1)
        if i < 0:
            raise KeyError(text)
    j = i + len(text)
    pos, a, b = 0, None, None
    for k, t in enumerate(toks):
        n = len(tok_text(t))
        if a is None and pos + n > i:
            a = k
        if pos < j:
            b = k + 1
        pos += n
    return a, b


def torch_seed(seed: int, threads: int = 4):
    """Seed python/numpy/torch and pin the CPU thread count (a fixed count keeps CPU reductions reproducible)."""
    import random
    import torch
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.use_deterministic_algorithms(True, warn_only=True)
    torch.set_num_threads(threads)


def fmt_sig(x: float, n: int = 4) -> str:
    return f'{x:.{n}g}'
