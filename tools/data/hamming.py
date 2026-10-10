"""SECDED on the MEMORY blade: the 64 ASCII bits of "MEMORY'S" protected by an extended Hamming (72, 64) code — the
standard ECC word of a memory module.

  tools/.venv/bin/python tools/data/hamming.py      -> app/public/data/hamming.json

Layout: positions 1..71 of a Hamming(71, 64) code (check bits at 1, 2, 4, 8, 16, 32, 64; data bits fill the other 64
positions in order), plus an overall parity bit p0 over all 71 -> 72 bits. Decoding: syndrome s = XOR of the positions
of the 1-bits (7 bits), overall parity P.  s = 0, P ok: clean.  P bad: single error at position s (s = 0: p0 itself),
corrected.  s ≠ 0, P ok: double error, detected, not correctable. -> corrects 1 bit, detects 2 (ledger B.4).

The register shows ASCII, so the sung apostrophe ’ (U+2019, not ASCII) is stored as ' (0x27).
The full syndrome of a (72, 64) word is 8 bits (7 Hamming + overall parity): clean = 00 hex / 00000000.

Consumers: pre2 90.34-91.29 (register writes one character per 16th note: its real ASCII bits in an 8-row grid),
94.90 ECC panel `SECDED · SYNDROME …`, plate `CORRECTS 1 BIT · DETECTS 2`.
"""
import numpy as np

from _common import save_json

TEXT = "MEMORY'S"
CHECK = [1, 2, 4, 8, 16, 32, 64]


def encode(bits64):
    word = [0] * 72                      # index 0 = overall parity p0, 1..71 Hamming positions
    data_pos = [p for p in range(1, 72) if p not in CHECK]
    assert len(data_pos) == 64
    for p, b in zip(data_pos, bits64):
        word[p] = b
    for c in CHECK:
        word[c] = sum(word[p] for p in range(1, 72) if p & c and p != c) % 2
    word[0] = sum(word[1:]) % 2
    return word, data_pos


def decode(word):
    s = 0
    for p in range(1, 72):
        if word[p]:
            s ^= p
    P = sum(word) % 2                    # 0 when overall parity holds
    if s == 0 and P == 0:
        status, fixed = 'clean', None
    elif P == 1:
        status, fixed = 'corrected', s
    else:
        status, fixed = 'double-error-detected', None
    return {'syndrome': s, 'syndrome8': (s << 1) | P, 'parity_ok': P == 0, 'status': status, 'corrected_position': fixed,
            'syndrome_bits': f'{s:07b}', 'display': f'{((s << 1) | P):02X}'}


def main():
    bits, rows = [], []
    for ch in TEXT:
        code = ord(ch)
        assert code < 128
        r = [int(c) for c in f'{code:08b}']
        rows.append({'char': ch, 'ascii': code, 'hex': f'{code:02X}', 'bits': r})
        bits += r
    word, data_pos = encode(bits)
    clean = decode(word)
    one = list(word)
    one[37] ^= 1
    d1 = decode(one)
    two = list(word)
    two[37] ^= 1
    two[11] ^= 1
    d2 = decode(two)
    print('  clean', clean['status'], clean['display'], ' 1-bit', d1['status'], d1['corrected_position'], ' 2-bit', d2['status'])
    assert clean['status'] == 'clean' and d1['status'] == 'corrected' and d1['corrected_position'] == 37
    assert d2['status'] == 'double-error-detected'
    # exhaustive check: every single flip corrected, every double flip detected
    for i in range(72):
        w = list(word); w[i] ^= 1
        r = decode(w)
        assert r['status'] == 'corrected' and (r['corrected_position'] or 0) == i
    for i in range(72):
        for j in range(i + 1, 72):
            w = list(word); w[i] ^= 1; w[j] ^= 1
            assert decode(w)['status'] == 'double-error-detected'
    save_json('hamming.json', {
        'what': '(72, 64) SECDED code (single-error-correcting, double-error-detecting) over the ASCII of the register text',
        'text': TEXT, 'register': rows,
        'codeword': word, 'check_positions': CHECK, 'data_positions': data_pos,
        'check_bits': [word[c] for c in CHECK], 'overall_parity': word[0],
        'clean': clean, 'single_error_demo': {'flipped': 37, **d1}, 'double_error_demo': {'flipped': [11, 37], **d2},
        'verified': 'all 72 single flips corrected, all 2,556 double flips detected',
        'panel': f'SECDED · SYNDROME {clean["display"]}', 'plate': 'CORRECTS 1 BIT · DETECTS 2',
        'note': 'syndrome of a (72,64) word is 8 bits (7 check + overall parity): show 00 (hex) or 00000000; "000" fits a 3-bit (8,4) code',
    })


if __name__ == '__main__':
    main()
