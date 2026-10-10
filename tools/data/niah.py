"""The haystack: the song's own BPE stream repeated to 2²⁰ tokens, laid as a square helix on the shaft walls, with
the needle (token 0, 'P') at its start, and the 9 context-window doublings 2K -> 1M.

  tools/.venv/bin/python tools/data/niah.py      -> app/public/data/niah.json

Tape: token i = bpe.tokens[i mod 1065] (data/bpe.json), i = 0 … 1,048,575; 1 cm per token (real scale) -> 10,485.76 m.
Index 0 ('P', the first token of the song) is at the BOTTOM next to K1; the newest token (i = 2²⁰ − 1) leaves the crown
I/O. The window always ends at the newest token; a window of 2^k tokens covers i ≥ 2²⁰ − 2^k, so the needle is inside
only when k = 20 (asserted). Default helix (world agent may re-fit): centred on the maintenance-ring grating, inset
1.2 m from the inner walls (x, z = ±78.8 m, perimeter 630.4 m), climbing 12 m per lap (one ring per lap) from y = 0;
s metres along the tape -> lap = floor(s / P), side/offset from s mod P (N wall, E, S, W in that order, clockwise from
the NW corner), y = 12 · s / P. `helix_top_y` = where index 2²⁰ − 1 ends.

Consumers: bridge B3 184.539-191.17 (window clamp frames, odometer 2,048 -> 1,048,576 at 186.78; the haystack shader
field; the needle 'P' pulled out at 189.42); B4 uses the same tape.
"""
import numpy as np

from _common import bpe_tokens, save_json

N = 1 << 20
CM = 0.01
INSET = 78.8
PITCH = 12.0


def main():
    toks, ids, vocab = bpe_tokens()
    L = len(toks)
    assert toks[0] == 'P'
    P = 8 * INSET
    length = N * CM
    laps = length / P
    windows = []
    for k in range(11, 21):
        n = 1 << k
        first = N - n
        windows.append({'k': k, 'tokens': n, 'label': f'{n:,}', 'length_m': n * CM, 'first_index': first,
                        'contains_needle': first <= 0, 'doubling': k - 11})
    assert [w['contains_needle'] for w in windows] == [False] * 9 + [True]
    assert len(windows) - 1 == 9

    def place(s):
        lap = int(s // P)
        u = s - lap * P
        side = int(u // (2 * INSET))
        t = u - side * 2 * INSET - INSET
        x, z = [(t, -INSET), (INSET, t), (-t, INSET), (-INSET, -t)][side]
        return [x, PITCH * s / P, z]
    save_json('niah.json', {
        'what': 'needle-in-a-haystack tape: the song BPE stream repeated to 2^20 tokens; context windows 2^11..2^20',
        'tokens': N, 'song_tokens': L, 'repeats': N / L, 'needle': {'index': 0, 'token': 'P', 'song_position': 0},
        'cm_per_token': 1, 'length_m': length,
        'windows': windows, 'doublings': 9, 'context_2k_note': '2,048 = the 175B decoder-only context length',
        'helix': {'inset_half': INSET, 'perimeter_m': P, 'pitch_m': PITCH, 'laps': laps, 'helix_top_y': PITCH * laps,
                  'order': 'N wall (z = -inset, x -> +), E (x = +inset, z -> +), S (z = +inset, x -> -), W (x = -inset, z -> -)',
                  'start': place(0.0), 'end': place(length - CM)},
        'token_of_index': 'bpe.tokens[i % 1065]',
    })
    print(f'  {N:,} tokens = {N / L:.2f} songs, {length:,.2f} m, {laps:.2f} laps, top y {PITCH * laps:.1f} m')


if __name__ == '__main__':
    main()
