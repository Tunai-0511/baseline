# Baseline

[![Baseline：觀看 4K 影片](cover/cover-1280x720.jpg)](https://youtu.be/Qy3_4oXoS6c)

**▶ 觀看 4K 影片：https://youtu.be/Qy3_4oXoS6c**

一支 4 分 07 秒的音樂影片，主題是 AI 架構怎麼登上 state of the art、又怎麼被下一代擠成 baseline：
感知器、SVM、卷積、RNN／LSTM、注意力、GAN、diffusion、MoE、量化、LoRA、RLHF／DPO、FlashAttention、長上下文……

> You were state of the art, now you're just a baseline.
> Top of the leaderboard, until the next deadline.

## 歌裡提到的技術

這首歌照時間順序點名了三十多個技術。每一個都曾經是 state of the art，也都在幾年內成了下一個的 baseline。以下依歌曲段落整理：它是什麼、何時由誰提出、後來被什麼取代。

### 主歌一：從一條線開始（0:00–0:38）

- **感知器 Perceptron**（Rosenblatt，1958）：把輸入加權相加、過一道門檻，輸出 0 或 1。學習規則是 w ← w + η(y − ŷ)x。它只能用一條直線（超平面）把資料分開。
- **XOR**：兩個輸入不同時才輸出 1。這四個點沒辦法用一條直線分開，所以單層感知器學不會。Minsky 與 Papert 在《Perceptrons》（1969）指出了這個限制。
- **隱藏層與反向傳播**（Rumelhart、Hinton、Williams，1986）：多疊一層非線性的隱藏層，就能表示 XOR；反向傳播讓多層網路訓練得起來。
- **Sigmoid**：σ(x) = 1/(1+e⁻ˣ)，把訊號壓進 0 到 1 之間。它的導數最大只有 ¼，梯度每往回傳一層就再乘一次。網路一深，梯度很快縮到零，這就是「梯度消失」。
- **ReLU**（2010–2012）：max(0, x)，負的剪掉、正的原樣通過，梯度是 1，深的網路因此訓練得動。AlexNet 用的就是它。
- **SIFT**（Lowe，1999）與 **HOG**（Dalal & Triggs，2005）：人手設計的影像特徵，用來描述局部的梯度方向。
- **卷積神經網路**（LeCun，1989；AlexNet，2012）：讓網路自己學濾波器。第一層學出來的是邊緣、顏色與紋理，沒有人設計過它們。
- **SVM**（Cortes & Vapnik，1995）：找出間隔最寬的分界線，間隔寬度是 2/‖w‖。
- **核技巧**（Boser、Guyon、Vapnik，1992）：用核函數隱含地把資料映射到高維空間，原本切不開的資料，在那裡用一個平面就能切開。
- **深度網路吃掉基準**：2012 年 AlexNet 在 ILSVRC 的 top-5 錯誤率是 15.3%，前一年的冠軍是 25.8%。

### 預副歌：X is all you need, the abstract guaranteed

四次預副歌各宣告一個成分，每一句都對應一篇有日期的論文：

- **Depth**：ResNet（He 等，2015-12-10）用殘差連接把網路加深到 152 層，拿下 ILSVRC 2015（top-5 錯誤率 3.57%）。
- **Memory**：LSTM（Hochreiter & Schmidhuber，1997-11-15）。
- **Attention**：〈Attention Is All You Need〉（Vaswani 等，2017-06-12），也就是 Transformer。
- **Scale**：Scaling Laws（Kaplan 等，2020-01-23）：loss 隨算力、參數量、資料量呈冪律下降，例如 L ∝ C^−0.050。

「X is all you need」是論文標題的經典句型；「the abstract guaranteed」的 abstract 指論文摘要，摘要裡總是保證自己最好。

### 副歌：排行榜

「Top of the leaderboard, until the next deadline」，deadline 指的是下一次的投稿截止日。四次副歌各用一個真實的排行榜：

- **ILSVRC**（ImageNet 大規模視覺辨識挑戰賽，2010–2017）：top-5 錯誤率從 25.8% 降到 15.3%（AlexNet，2012）。
- **WMT14 英德翻譯**：BLEU 從 24.6（GNMT）升到 28.4（Transformer，2017）。
- **LAMBADA**（Paperno 等，2016）：讀完一段文字，猜出最後一個字，需要長距離的理解。正確率從 68.0% 升到 86.4%（GPT-3 少樣本，2020）。
- **參數量**：175B（GPT-3）、280B（Gopher）、530B（MT-NLG）、540B（PaLM）。

副歌一的後半唱的是表徵學習：核方法和手工特徵被束之高閣，網路自己學會了特徵。

### 主歌二：序列模型（1:00–1:30）

- **n-gram 語言模型**：靠計數，用前面 n−1 個字預測下一個字。trigram 的視窗只有三個字寬。
- **RNN**（Elman，1990）：把隱藏狀態一步一步帶下去，理論上能記住整段序列。
- **時間反向傳播 BPTT**（Werbos，1990）：把 RNN 沿時間展開再做反向傳播。序列一長，梯度不是消失就是爆炸。
- **LSTM**（1997）：用閘門控制一條 cell state，讓資訊能傳得很遠（遺忘閘門是 2000 年才加上的）。
- **seq2seq**（Sutskever 等，2014）：編碼器把整句話壓成一個固定長度的向量，解碼器再把它展開成另一種語言。那個向量就是瓶頸。
- **注意力**（Bahdanau 等，2014）：解碼每個字時，回頭看編碼器的所有位置，按權重加總，不再只靠那一個向量。
- **Transformer**（Vaswani 等，2017）：拿掉遞迴，只用自注意力，所有位置一次平行計算。

副歌二的後半是「one attention layer and the whole recurrence gone」：在機器翻譯和語言模型上，遞迴網路被 Transformer 取代。

### 主歌三：生成與效率（1:59–2:28）

- **GAN**（Goodfellow 等，2014）：生成器和判別器的雙人賽局。常見的失敗是模式崩塌（mode collapse）：生成器只會產生少數幾種樣本。
- **擴散模型**（Sohl-Dickstein 等，2015；DDPM，Ho 等，2020）：學會一步一步把雜訊去掉，DDPM 用 1,000 步。
- **正弦位置編碼 → RoPE**（Su 等，2021）：把 query 和 key 依位置旋轉一個角度，讓相對位置直接反映在內積裡。
- **LayerNorm → RMSNorm**（Zhang & Sennrich，2019）：不減平均，只除以均方根，算起來更便宜。
- **ReLU → SwiGLU**（Shazeer，2020）：帶閘門的啟動函數，PaLM、LLaMA 都用它。
- **專家混合 MoE**（Shazeer 等，2017）：路由器把每個 token 只送給少數幾個專家。參數很多，每次只算其中一小部分。
- **量化**：把 32 位元浮點數壓到 4 位元整數（INT4，例如 GPTQ，2022），換取記憶體和吞吐量。
- **LoRA**（Hu 等，2021）：凍結原本的權重，只訓練一個低秩的更新 ΔW = BA。
- **上下文學習**（GPT-3，Brown 等，2020）：不更新任何權重，只在提示裡給幾個例子。

### 副歌三之後：BERT 與 decoder-only（2:43–2:50）

- **BERT**（Devlin 等，2018）：雙向的編碼器，用遮罩語言模型預訓練：把字換成 [MASK]，再從左右兩邊猜回來。
- **decoder-only**（GPT 系列；GPT-3 有 175B 參數，2020）：只從左往右看的語言模型。一路放大之後，很多原本要靠 BERT 的工作變得可有可無。

### 橋段：對齊、效率、長上下文（2:50–3:19）

- **RLHF**（Christiano 等，2017；InstructGPT，2022）：讓人替模型的答案排序，訓練一個獎勵模型（Bradley–Terry 模型），再用強化學習（PPO）調整語言模型。
- **DPO**（Rafailov 等，2023）：直接用偏好資料訓練，不必另外訓練獎勵模型這個「中間人」。推導時配分函數 Z(x) 會在式子裡相消。
- **FlashAttention**（Dao 等，2022）：把注意力分塊，放進 GPU 晶片上的 SRAM 計算，不把 n×n 的矩陣寫回 HBM 顯存。結果和原本完全一樣，但快很多、省很多記憶體。
- **上下文視窗**：GPT-3 是 2,048 個 token（2K），Gemini 1.5（2024）做到一百萬。
- **大海撈針**（needle in a haystack）：把一句話藏進很長的文件裡，看模型找不找得到。這是 2023 年開始流行的長上下文測試。
- **「Every "all you need" is a paper with a date」**：四句宣言都有真實的論文日期，見上面的預副歌。

### 最後：平方的注意力（3:33–4:07）

- **注意力是平方複雜度**：自注意力的計算量和記憶體，都隨序列長度 n 以 O(n²) 成長。
- **線性時間的繼任者**：線性注意力、狀態空間模型（S4，2021；Mamba，2023）、RWKV 等，計算量隨長度線性成長。歌裡說它「還在訓練」。
- **footnote 與 related work**：被超越的方法，最後都留在別人論文的註腳和「相關研究」那一節。

## 畫面是怎麼做出來的

**每一格都是歌曲時間的純函數。** Canvas2D 上的針孔相機用 2D 畫出 3D，再交給 WebGL 做後製。沒有用剪輯軟體，也沒有手擺的關鍵影格。

**歌詞是場景裡的物件。** 它們刻在石碑上、寫在車廂側面、鋪在地板上，全片沒有字幕條。

**畫面上的數字都是真的計算結果：**
- 用 CIFAR-10 訓練的 conv1 濾波器
- SVM 擬合、BPTT 梯度、LSTM 閘門
- GAN 模式崩塌、MoE 路由、INT4 量化、LoRA rank-8
- Bradley–Terry 獎勵、FlashAttention 分塊、needle-in-a-haystack

**背景是公式城市。** 城市牆上的 71 條公式取自原始論文。

## 文件

| 文件 | 內容 |
| --- | --- |
| [docs/DESIGN.md](docs/DESIGN.md) | 設計：原則、色彩、字、鏡頭、公式城市、四種重複結構、封面 |
| [docs/SHOTLIST.md](docs/SHOTLIST.md) | 分鏡表：25 個場景、118 個鏡頭，每個鏡頭的時間、唱到的字與畫面；[docs/frames/](docs/frames/) 是每秒一格的縮圖 |
| [docs/MAKING.md](docs/MAKING.md) | 怎麼做的：歌、逐字對齊、真實資料、公式、引擎架構、算圖、品質檢查、改版歷程 |
| [docs/DESCRIPTION.md](docs/DESCRIPTION.md) | 影片簡介（中英）、章節、歌詞、製作名單、標籤 |

## 目錄

| 路徑 | 內容 |
| --- | --- |
| `app/src/engine/` | 引擎：時間軸、動態模糊、後製、轉場、歌詞與節拍資料 |
| `app/src/scenes/` | 場景：`_v.ts` 是共用的相機與排字工具，`v_*.ts` 是各段畫面 |
| `app/src/timeline.ts`、`direction.ts` | 各段落用哪個場景，以及鏡頭撞擊與轉場 |
| `app/scripts/render.ts` | 算圖、截圖、聯絡表、文字重疊檢查 |
| `app/public/data/` | 畫面用的計算結果（由 `tools/data/` 的腳本產生） |
| `app/eq.json` | 畫面上的 71 條公式（TeX，取自各篇原始論文）；`bun scripts/eq.ts` 用 MathJax 排版成 `public/eq/` |
| `analysis/` | 逐字對齊與節拍分析 → `data/lyrics.json`、`data/audio.json` |
| `tools/` | 資料產生腳本：conv1 訓練、BPE 等（環境：`tools/requirements.txt`）；`tools/video/` 把重算的一小段無損接回 4K 母帶 |
| `cover/` | 封面（3840 × 2160 PNG、1280 × 720 JPG），由 `app/src/scenes/cover.ts` 算出 |
| `docs/` | 設計、分鏡、製作說明、影片簡介 |
| `audio/baseline.wav` | 歌曲（不在 MIT 範圍內，見下方授權） |
| `lyrics/suno-v4.txt` | 歌詞（不在 MIT 範圍內） |

## 執行

需要 [Bun](https://bun.sh) 與 ffmpeg。

```bash
cd app
bun install
bunx vite                                   # 在瀏覽器即時預覽
bun scripts/render.ts video --fps 60 --samples auto --max-samples 108 --crf 17 --out ../out/Baseline.mp4
```

加 `--scale 2` 就是真 4K（3840×2160，版面不變、只是解析度加倍）；成片就是這樣算的（4K60：母帶約 17 GB、上傳版約 2.6 GB，太大所以不放進 repo，`out/` 在 .gitignore 裡）。
其他模式：`stills --t 18.9,19.2`（單張截圖）、`sheet --from 20 --to 35 --cols 4`（聯絡表）、
`textqa --from 0 --to 247.2`（逐字形檢查全片文字有沒有重疊）。

## 授權

**程式碼、場景、工具、資料與文件：** 採 [MIT 授權](LICENSE)，歡迎拿去學、改、用。

**歌曲〈Baseline〉本身不在 MIT 範圍內。** 這包括錄音 `audio/baseline.wav` 與歌詞 `lyrics/`，© 2026 Tunai，保留權利，詳見 [LICENSE-SONG.md](LICENSE-SONG.md)。歌曲以 Suno 付費方案生成。

**第三方元件：**
- 部分引擎與分析工具改寫自 [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video)（MIT，原授權保留在 `licenses/pdoom-video-MIT.txt`）。
- 字型採 SIL Open Font License 1.1。

以上詳見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
