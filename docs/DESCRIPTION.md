# 影片簡介

上傳用的文字。中文、英文各一份，章節時間可以直接貼進 YouTube（第一個必須是 0:00）。

---

## 標題

**Baseline — 每一個 state of the art，最後都變成 baseline｜AI 架構的分手歌**

English: **Baseline — every state of the art becomes a baseline (an AI architecture breakup song)**

---

## 中文簡介

你曾經是 state of the art，現在只是 baseline。

從 1958 年的感知器畫下第一條線，到 sigmoid、卷積、SVM、LSTM、注意力、GAN、diffusion、MoE、LoRA、RLHF、FlashAttention、百萬 token 的上下文——每一個技術都曾經登上排行榜的第一名，然後被下一個擠下來，變成論文裡的一條 baseline。這首歌把它們一個一個唱過去，影片把每一句歌詞裡的技術，用它最直接的畫面演出來。

畫面裡的東西都是真的：濾波器是真的在 CIFAR-10 上訓練出來的，SVM 的邊界、RNN 的梯度、LSTM 的閘門、注意力的權重、MoE 的路由、INT4 的位元、Bradley–Terry 的分數、FlashAttention 的存取次數，全部用程式真的算過；背景城市牆上的 71 條公式都取自原始論文。

整部片沒有用剪輯軟體，也沒有手擺一個關鍵影格：它是一個用 TypeScript 寫的算圖程式，給它歌曲裡的任何一個時間點，它就算出那一格。4K、60 fps、14,832 格。

原始碼、分鏡表與製作說明：https://github.com/Tunai-0511/baseline

## English description

You were state of the art. Now you're just a baseline.

From the perceptron drawing its first line in 1958 to sigmoid, convolution, SVMs, LSTMs, attention, GANs, diffusion, mixture-of-experts, LoRA, RLHF, FlashAttention and million-token context windows — every one of them made it to the top of the leaderboard, and every one of them was pushed off by the next, ending up as a baseline in somebody else's paper. This song sings through them one by one, and the video shows each line as the most direct picture of the technique it names.

Everything on screen is real: the filters were actually trained on CIFAR-10; the SVM margin, the RNN gradients, the LSTM gates, the attention weights, the MoE routing, the INT4 bits, the Bradley–Terry scores and FlashAttention's memory traffic were all computed; the 71 equations on the walls of the city are typeset from the original papers.

No editing software and no hand-placed keyframes: the film is a program written in TypeScript that renders any moment of the song on demand. 4K, 60 fps, 14,832 frames.

Source code, shot list and making-of: https://github.com/Tunai-0511/baseline

---

## 章節 Chapters

```
0:00 The Line — Perceptron, XOR
0:16 Sigmoid → ReLU
0:23 Hand-tuned features → Convolution
0:31 SVM → Deep nets
0:38 Depth is all you need
0:45 Chorus — ILSVRC
0:53 Frozen on the shelf
1:00 N-gram, RNN, LSTM
1:15 Seq2seq, Attention, Transformers
1:30 Memory's all you need
1:37 Chorus — WMT14
1:45 One attention layer: GONE
1:59 GAN, Diffusion, RoPE, Norms
2:13 MoE, INT4, LoRA, In-context
2:28 Attention's all you need
2:35 Chorus — LAMBADA
2:43 BERT → Decoder-only
2:50 RLHF, DPO, FlashAttention
3:04 Context window, Needle, Dates
3:18 Scale is all you need
3:26 Chorus — Parameters
3:33 Quadratic attention
3:40 Footnote
3:48 The fall
4:01 One more time
```

---

## 歌詞 Lyrics

```
Perceptron drew a line, but XOR stayed unresolved,
stack another hidden layer and the problem's solved
Sigmoid squashed the signal, gradients fading down to zero,
ReLU clipped the negatives and came in as the hero
Hand-tuned SIFT and HOG, every feature carved by hand,
convolution learned the filters that nobody planned
SVM, the widest margin, kernel trick and all,
deep nets ate the benchmarks and the margins had to fall

Depth is all you need,
the abstract guaranteed

You were state of the art,
now you're just a baseline
Top of the leaderboard,
until the next deadline
Kernel tricks and hand-made features frozen on the shelf,
the network took the crown and learned the features by itself

N-gram counting words, a window three tokens wide,
RNN kept a hidden state and carried it inside
Backprop through time, the gradients vanish or explode,
LSTM put gates along the road
Seq2seq would squeeze a sentence through a bottleneck,
attention let the decoder look back and double-check
Recurrence marched in order, one step at a time,
transformers ran in parallel and left it all behind

Memory's all you need,
the abstract guaranteed

You were state of the art,
now you're just a baseline
Top of the leaderboard,
until the next deadline
LSTM, you held the memory for so long,
one attention layer and the whole recurrence gone

GANs played a two-player game until the modes collapsed,
diffusion learned to denoise in a thousand tiny steps
Sinusoids gave way to RoPE's rotation,
LayerNorm to RMS, ReLU to SwiGLU activation
Dense became a mixture, only some experts awake,
32 bits down to 4 for the throughput's sake
Full fine-tune to LoRA, a low-rank little patch,
then just prompt it in context, no gradient to catch

Attention's all you need,
the abstract guaranteed

You were state of the art,
now you're just a baseline
Top of the leaderboard,
until the next deadline
BERT, you read both ways, masked and bidirectional,
decoder-only scaled up and made you optional

RLHF trained a reward model to rank,
DPO skipped the middleman and took it to the bank
FlashAttention tiles it all inside the SRAM,
no more round trips to the HBM, no traffic jam
Context window: 2K, then a million tokens long,
needle in a haystack, it remembers every song
Every "all you need" is a paper with a date,
every breakthrough's just a baseline running late

Scale is all you need,
the abstract guaranteed

You were state of the art,
now you're just a baseline
Top of the leaderboard,
until the next deadline
And you, attention, quadratic in the length,
a linear-time successor's training up its strength

Every "all you need" becomes a footnote in the end,
cite me in related work, remember me, my friend

I was state of the art,
now I'm just a baseline
Cite me in related work
one more time
```

---

## 製作 Credits

- 詞 Lyrics：Tunai × Claude
- 音樂與演唱 Music & vocals：以 Suno 生成（Pro 方案）
- 影像 Visuals：全程式算圖（TypeScript · three.js · Canvas2D · MathJax），與 Claude Code 協作
- 引擎部分改寫自 mexicat/pdoom-video（MIT）；字型 Archivo、IBM Plex Mono、Cormorant Garamond（SIL OFL 1.1）

© 2026 Tunai. All rights reserved.

## 標籤 Tags

`#AI` `#MachineLearning` `#DeepLearning` `#Transformer` `#Attention` `#MusicVideo` `#CreativeCoding` `#Baseline`

關鍵字：perceptron, XOR, sigmoid, ReLU, SIFT, HOG, convolution, AlexNet, SVM, kernel trick, ResNet, n-gram, RNN, BPTT, LSTM, seq2seq, attention, transformer, GAN, diffusion, RoPE, RMSNorm, SwiGLU, mixture of experts, INT4 quantization, LoRA, in-context learning, BERT, GPT, RLHF, DPO, FlashAttention, context window, needle in a haystack, scaling laws
