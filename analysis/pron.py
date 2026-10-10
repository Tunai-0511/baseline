"""Display token -> pronunciation spelling used for CTC alignment.

Each display token (lyric line split on spaces) maps to one or more
pronunciation sub-words made of plain letters (and internal apostrophes).
"""
import re

PRON = {
    "XOR": "ex oh are",
    "ReLU": "ray loo",
    "SVM,": "ess vee em",
    "SIFT": "sift",
    "HOG,": "hog",
    "N-gram": "en gram",
    "RNN": "are en en",
    "LSTM": "el ess tee em", "LSTM,": "el ess tee em",
    "Seq2seq": "seek to seek",
    "GANs": "gans",
    "RoPE’s": "ropes",
    "LayerNorm": "layer norm",
    "RMS,": "are em ess",
    "SwiGLU": "swee glue",
    "32": "thirty two",
    "4": "four",
    "LoRA,": "lora",
    "BERT,": "bert",
    "RLHF": "are el aitch eff",
    "DPO": "dee pee oh",
    "FlashAttention": "flash attention",
    "SRAM,": "ess ram",
    "HBM,": "aitch bee em",
    "2K,": "two kay",
}

# alternative pronunciations to test (scored by alignment likelihood)
ALT = {}


def pron(token: str) -> list[str]:
    if token in PRON:
        return PRON[token].split()
    w = token.lower()
    w = w.replace("’", "'")
    w = re.sub(r"[^a-z' ]", " ", w)
    w = w.strip("' ")
    return [p.strip("'") for p in w.split() if p.strip("'")]


if __name__ == "__main__":
    import common
    for _, _, t in common.load_lyrics_src():
        print(t, "->", " | ".join(" ".join(pron(w)) for w in t.split(" ")))
