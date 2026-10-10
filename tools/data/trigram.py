"""Word trigram counts of this song's own lyrics (data/lyrics.json): the n-gram model verse2 counts with.

  tools/.venv/bin/python tools/data/trigram.py      -> app/public/data/trigram.json

Tokens are the sung words, lower-cased, surrounding punctuation stripped ("problem’s" -> "problem's"). Counts run
over the song as one stream (an n-gram LM's view); the in-line-only counts are computed too and must agree for the
three engraved probabilities (asserted).

Consumers: verse2 60.995-63.29 (3-cell window gantry over COUNTING WORDS, A WINDOW THREE TOKENS WIDE; drum counters;
62.75 "three" -> c = 1), gantry beam engraving `P(art | of the) = 5/9 · COUNTED ON THIS SONG`.
Ledger (B.4): P(art | of the) = 5/9, P(baseline | just a) = 6/6, P(guaranteed | the abstract) = 4/4.
"""
from collections import Counter
from fractions import Fraction

from _common import lyric_words, lyrics, save_json


def counts(stream):
    tri, bi = Counter(), Counter()
    for i in range(len(stream) - 1):
        bi[stream[i], stream[i + 1]] += 1
    for i in range(len(stream) - 2):
        tri[stream[i], stream[i + 1], stream[i + 2]] += 1
    return tri, bi


def main():
    W = lyric_words()
    stream = [w[3] for w in W]
    tri, bi = counts(stream)
    # in-line only
    tri_l, bi_l = Counter(), Counter()
    for L in lyrics()['lines']:
        t, b = counts([w[3] for w in W if w[0] == L['i']])
        tri_l.update(t)
        bi_l.update(b)

    def prob(ctx, nxt):
        c, n = tri[(*ctx, nxt)], bi[ctx]
        cl, nl = tri_l[(*ctx, nxt)], bi_l[ctx]
        assert (c, n) == (cl, nl), (ctx, nxt, c, n, cl, nl)
        lines = sorted({W[i][0] for i in range(len(W) - 2) if (stream[i], stream[i + 1]) == ctx})
        follow = Counter(stream[i + 2] for i in range(len(W) - 2) if (stream[i], stream[i + 1]) == ctx)
        return {'context': list(ctx), 'next': nxt, 'count': c, 'context_count': n, 'p': c / n,
                'text': f'P({nxt} | {" ".join(ctx)}) = {c}/{n}', 'lines': lines, 'continuations': dict(follow)}

    head = [prob(('of', 'the'), 'art'), prob(('just', 'a'), 'baseline'), prob(('the', 'abstract'), 'guaranteed')]
    for h in head:
        print('  ', h['text'], 'lines', h['lines'], h['continuations'])
    assert [(h['count'], h['context_count']) for h in head] == [(5, 9), (6, 6), (4, 4)], 'ledger B.4 trigram facts'

    # the verse2 window: L16 words entering a 3-token window one by one
    l16 = [w for w in W if w[0] == 16]
    win = []
    for k, w in enumerate(l16):
        idx = W.index(w)
        g = tuple(stream[max(0, idx - 2):idx + 1])
        c = tri[g] if len(g) == 3 else None
        n = bi[g[:2]] if len(g) == 3 else None
        win.append({'word': k, 'text': w[2], 'start': w[4], 'end': w[5], 'window': list(g),
                    'count': c, 'context_count': n, 'p': (c / n) if c else None,
                    'p_frac': str(Fraction(c, n)) if c else None})
    for r in win:
        print('   window', r['window'], 'c =', r['count'], '/', r['context_count'])
    top = sorted(tri.items(), key=lambda kv: (-kv[1], kv[0]))[:40]
    save_json('trigram.json', {
        'what': 'word trigram counts over the lyrics of this song (one stream, lower-cased, punctuation stripped)',
        'tokens': len(stream), 'types': len(set(stream)), 'trigram_types': len(tri), 'bigram_types': len(bi),
        'headline': head,
        'engraving': 'P(art | of the) = 5/9 · COUNTED ON THIS SONG',
        'window_L16': win,
        'top_trigrams': [{'g': list(g), 'c': c} for g, c in top],
        'singletons': sum(1 for c in tri.values() if c == 1),
    })


if __name__ == '__main__':
    main()
