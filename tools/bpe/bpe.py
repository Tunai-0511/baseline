#!/usr/bin/env python3
"""A byte-pair-encoding tokenizer trained on the song itself (no product tokenizer, no download).

  python3 tools/bpe/bpe.py            -> data/bpe.json

GPT-2-style pre-tokenisation (a word keeps its leading space, shown as 'Ġ'; a line break is 'Ċ'), then the
classic BPE loop: count adjacent symbol pairs over the corpus, merge the most frequent, repeat. The corpus is
the 70 lyric lines of "Baseline" (data/lyrics.json), so the merges learn this song's own vocabulary
('Ġbase', 'line', 'Ġall', 'Ġyou', 'Ġneed'...). The output is the song tokenized with those merges: the
token stream the context window holds ("it remembers every song": the stream is the song, again and again).
"""
import json, re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
N_MERGES = 320
PRE = re.compile(r"""'s|'t|'re|'ve|'m|'ll|'d|’s|’t|’re|’ve|’m|’ll|’d| ?[A-Za-z]+| ?[0-9]| ?[^\sA-Za-z0-9]+|\n""")


def pretok(text: str):
    out = []
    for m in PRE.finditer(text):
        w = m.group(0).replace(" ", "Ġ").replace("\n", "Ċ")
        out.append(w)
    return out


def train(words: list[str], n: int):
    vocab = Counter(tuple(w) for w in words)
    merges = []
    for _ in range(n):
        pairs = Counter()
        for sym, c in vocab.items():
            for a, b in zip(sym, sym[1:]):
                pairs[(a, b)] += c
        if not pairs:
            break
        # most frequent pair; ties broken by the pair's text so the result never depends on dict order
        best = max(pairs.items(), key=lambda kv: (kv[1], -len(kv[0][0] + kv[0][1]), kv[0]))[0]
        if pairs[best] < 2:
            break
        merges.append(best)
        nv = Counter()
        for sym, c in vocab.items():
            s, i, o = list(sym), 0, []
            while i < len(s):
                if i + 1 < len(s) and (s[i], s[i + 1]) == best:
                    o.append(s[i] + s[i + 1]); i += 2
                else:
                    o.append(s[i]); i += 1
            nv[tuple(o)] += c
        vocab = nv
    return merges


def encode(word: str, ranks: dict):
    s = list(word)
    while len(s) > 1:
        cand = [(ranks.get((a, b), 1e9), i) for i, (a, b) in enumerate(zip(s, s[1:]))]
        r, i = min(cand)
        if r >= 1e9:
            break
        s = s[:i] + [s[i] + s[i + 1]] + s[i + 2:]
    return s


def main():
    L = json.loads((ROOT / "data/lyrics.json").read_text())
    text = "\n".join(l["text"] for l in L["lines"]) + "\n"
    words = pretok(text)
    merges = train(words, N_MERGES)
    ranks = {p: i for i, p in enumerate(merges)}
    toks = [t for w in words for t in encode(w, ranks)]
    vocab = sorted(set(toks))
    out = {
        "about": "BPE trained on the lyrics of this song (tools/bpe/bpe.py); 'Ġ' = leading space, 'Ċ' = line break",
        "merges": len(merges), "vocab": len(vocab), "tokens": toks,
        "chars": sum(len(t) for t in toks),
    }
    p = ROOT / "data/bpe.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(out, ensure_ascii=False))
    print(f"{len(merges)} merges, vocab {len(vocab)}, {len(toks)} tokens, {out['chars']} chars, "
          f"{out['chars'] / len(toks):.2f} chars/token -> {p}")
    print(" | ".join(toks[:60]))
    i = toks.index("Ġneedle") if "Ġneedle" in toks else -1
    print("needle at", i, toks[i - 6:i + 8])


if __name__ == "__main__":
    main()
