# 怎麼做的：流程與架構

整部片沒有用任何影片剪輯軟體，也沒有一個關鍵影格是手動擺的。它是一個用 TypeScript 寫的即時算圖程式：給它歌曲裡的任何一個時間點，它就算出那一格畫面。成片是把 0 到 247.2 秒每 1/60 秒算一次，交給 ffmpeg 編碼。

```
  歌詞 ─┐                              tools/data/*.py ── 真實的數字 ──┐
 Suno ──┴─ audio/baseline.wav                                          │
            │                                                          ▼
            ├─ analysis/ ── 逐字時間 data/lyrics.json ─────►  app/（引擎 + 25 個場景）── render.ts ── ffmpeg ── Baseline-4K.mp4
            │              節拍/段落 data/audio.json  ─────►      ▲         ▲
            │                                                     │         │
  app/eq.json ── scripts/eq.ts（MathJax）── public/eq/*.svg ───────┘   QA：textqa · lyricvis · sheet
```

---

## 1. 歌

- 歌詞經過四版：v1 是「AI 的夏天與寒冬」，v2 加強術語與押韻，v4 改成現在的分手歌（hook：「You were state of the art, now you're just a baseline / Top of the leaderboard, until the next deadline」），預副歌是四次「X is all you need, the abstract guaranteed」。定稿在 `lyrics/suno-v4.txt`。
- 用 Suno（Pro 方案，可商用）生成，曲風是壓低的真人女聲、暗黑電子流行、副歌後接 drop。選定的版本長 4:07，存成 `audio/baseline.wav`。

## 2. 聽歌：逐字時間與節拍（`analysis/`）

畫面要卡在每一個字、每一拍上，所以先把歌拆開：

1. **分軌**：Demucs 把人聲、鼓、貝斯、其他分開（`analysis/stems/`，可重建，不進 git）。
2. **逐字對齊**（`align.py`）：兩個 CTC 聲學模型（torchaudio 的 MMS_FA 與 wav2vec2 LV60K）各自算出每 20 ms 的字元機率（`ctc_emissions.py`），融合後對整首歌的歌詞做一次全域 Viterbi 強制對齊（`ctcalign.py`，行與行之間有吸收和聲/即興的「垃圾」token）；mlx-whisper large-v3-turbo 的逐字時間做交叉檢查（`whisper_run.py`）；再用人聲的音量、音高、起音與高頻能量（`vocal_feats.py`）微調字的邊界，少數幾個字手動修正。結果：70 行、477 個字的開始與結束時間 → `data/lyrics.json`。
3. **節拍與段落**（`analyze.py`）：從鼓的起音擬合逐拍網格（這首歌會越唱越快：開頭 130.0 BPM、結尾 133.8 BPM，共 541 拍、136 小節），從小鼓與和弦變化找出小節線，再切出 17 個段落（intro、verse1、pre1、chorus1 … drop2、tail）；另外輸出 100 fps 的各頻段包絡、大鼓／小鼓／hi-hat 的起音。→ `data/audio.json`。

分析環境用 uv 管理（`analysis/pyproject.toml`、`uv.lock`），模型下載到 `analysis/.cache/`（可重建，不進 git）。

## 3. 真實的數字（`tools/data/`）

畫面上每個數字都來自一支有固定亂數種子的腳本，輸出到 `app/public/data/`：

| 腳本 | 算什麼 | 用在 |
| --- | --- | --- |
| `hog_sift.py` | 行人圖的 HOG 直方圖（16 × 8 格 × 9 方向）、SIFT 128 維描述子 | 銅版（CARVED） |
| `conv1_seq.py` + `tools/conv1/` | 在 CIFAR-10 上訓練 AlexNet 式網路（測試正確率 88.3%），conv1 的 96 個 11 × 11 濾波器的 45 個快照 | 濾波器牆、BY ITSELF 的網路第一層 |
| `svm_fit.py` | 32 點的 hard-margin SVM（2/‖w‖ = 3.29、三個支持向量）、核 SVM 的切面 | MARGIN |
| `trigram.py` | 這首歌的三元組計數 | n-gram 龍門架 |
| `rnn_bptt.py` | tanh RNN 在這首歌上的 8 維 hidden state、BPTT 的梯度範數（消失到 10⁻²⁰、爆炸到 10⁶） | RNN 吊車、分岔的軌道 |
| `lstm_gates.py` | LSTM 在這句歌詞上的 f / i / o 閘門值 | LSTM 柵欄 |
| `seq2seq_attn.py` | 訓練來倒轉 12 個字的 encoder–decoder 與注意力 α（反對角線） | 漏斗、光束、熱圖 |
| `gan25.py` | 25 個高斯的 GAN 訓練與模式崩塌（91 個快照） | GAN 球場 |
| `diffusion_glyph.py` | 這句歌詞每個字形的去噪軌跡 | diffusion 粒子字、走廊 |
| `rope.py` | RoPE 的頻率與角度 | 指針隧道 |
| `norms.py` | 16 個殘差值的 LayerNorm / RMSNorm、Swish 的最低點 | 柱子與光管 |
| `moe_router.py` | 每個字的 top-2 專家與閘值 | 專家塔 |
| `quant.py` | fp32 權重的符號／指數／尾數、INT4 量化 | 位元牆 |
| `lora_svd.py` | rank-8 低秩重建（`lora_rank8.png`） | LoRA 的 ΔW |
| `bt_reward.py` | Bradley–Terry 獎勵模型分數（1.66、1.13、−0.41、−2.39）、DPO 的 Z(x) 相消 | RLHF 輸送帶、金庫 |
| `attn_lyrics.py` | 用這首歌訓練的單層 Transformer 的注意力 | ATTENTION'S ALL YOU NEED 的磚 |
| `flash_tiles.py` | 64 × 64 注意力的分塊、線上 softmax 的 m 與 ℓ、HBM 存取次數（×12.9） | FlashAttention 晶片與道路 |
| `niah.py` | 這首歌的 BPE token 串、視窗的九次翻倍、針的位置 | 磁帶與針 |
| `add_syl.py`、`export_pitch.py` | 音節切分、每個字的音高曲線 | 字的動態 |

`xor_mlp.py`、`sigmoid_chain.py`、`tiny_tf.py`、`hamming.py`、`scaling.py`、`ibp.py` 是早期版本用的，資料還在但成片沒有讀取（片頭的 XOR、sigmoid 鏈的 ×¼、SCALE 的冪律是在場景裡直接算的）。
`tools/data/README.md` 有每支腳本的輸出欄位。

## 4. 公式（`app/eq.json` → `app/scripts/eq.ts`）

71 條公式以 TeX 寫在 `app/eq.json`（感知器、反向傳播、sigmoid 與梯度消失、HOG、SIFT、卷積、SVM 原始／對偶、RBF、ResNet、BatchNorm、n-gram、RNN、BPTT、LSTM 四式、seq2seq、Bahdanau、Attention、多頭、位置編碼、FFN、LayerNorm、GAN、DDPM、RoPE、RMSNorm、SwiGLU、MoE、量化、LoRA、ICL、MLM、因果 LM、因果遮罩、scaling law、Chinchilla、C ≈ 6ND、Bradley–Terry、RLHF、DPO、FlashAttention 的線上 softmax 與 I/O、困惑度、ALiBi、位置內插、線性注意力、SSM、top-5、BLEU、LAMBADA）。`bun scripts/eq.ts` 用 MathJax 在 bun 裡排成 SVG（不需要裝 TeX），開機時 `_eq.ts` 把每條公式點陣化一次，之後任何顏色都是從這張白色點陣同步上色，所以畫格不會因為載入時間而不同。

## 5. 引擎（`app/src/`）

```
src/
  main.ts            開機、預覽播放器、匯出 API（window.__mv：still / stream / png）
  timeline.ts        25 個場景各自的起訖時間（切點落在第一個字之前的那一拍）
  direction.ts       場景之間的 14 個轉場、全片相機的撞擊與鼓點脈衝
  engine/
    engine.ts        時間軸、場景載入、每格的合成、自適應動態模糊、轉場與相機
    seams.ts         轉場（zoom / whip / slice / push / luma / burn / swirl / flash）與相機 pass
    post.ts          bloom、halation、色差、顆粒、暗角、色彩統一、sRGB
    gl.ts            WebGL2 renderer、2D 圖層、輸出尺寸（--scale）
    lyrics.ts / audio.ts / lyricreg.ts   歌詞、節拍、側資料
    type.ts / stroke.ts                  字型載入、單筆畫字型
  scenes/
    _d2.ts           Canvas2D 場景基底（節拍工具、圖層上傳）
    _wire.ts         相機：Key、Rig（鏡頭、snap、hits）、向量工具
    _v.ts            VScene：針孔投影、線/面/字/圖片/點/公式、卡拉 OK、片語、巨字、鏡面地板、塵埃、公式城市
    _eq.ts           公式點陣化與上色快取
    v_*.ts           19 個場景檔（預副歌與副歌各一個檔、用參數切換四次）
    cover.ts         封面
```

**一格是怎麼算出來的**

1. 找出時間 t 上的場景（轉場期間是兩個）。
2. 每個場景的 Rig 給出相機；VScene 先畫公式城市，再畫自己的場景，全部是 Canvas2D 的針孔投影：線段、多邊形、逐字母透視的字、仿射網格貼圖、點雲、公式。鏡面地板是用反射的相機再畫一次到半解析度圖層，模糊後疊在地平線以下。
3. 2D 圖層上傳成材質，交給 WebGL：轉場混接、全片相機（撞擊、震波折射）、後製。
4. 動態模糊：同一格在快門區間內取 4、12、36、108 個子畫格（每一層都均勻分布在快門內），直到估計的殘餘誤差小於門檻；靜止畫面很快停下，甩鏡會一直加到拖影連續。4K 成片的 14,832 格裡，7% 用 12 個、55% 用 36 個、38% 用 108 個子畫格。
5. 一切都是 t 的純函數：沒有 `Math.random`、沒有 `Date`、沒有上一格的狀態；任何一格都能單獨、平行地重算。

## 6. 算圖（`app/scripts/render.ts`）

```bash
cd app
bun scripts/render.ts video --scale 2 --fps 60 --samples auto --min-samples 4 --max-samples 108 --crf 17 --out ../out/Baseline-4K-master.mp4
```

- 開兩個 headless Chrome（Playwright）各自算一段段的畫格，經 WebSocket 傳回 bun 的伺服器；伺服器依序重排（暫存在記憶體與磁碟），寫進同一個 ffmpeg。
- ffmpeg：libx264（slow、crf 17、`-tune grain`、aq-mode 3），像素以 BT.709 標記；音訊 AAC 320 kbps。
- `--scale 2` 是真的 3840 × 2160：版面一樣，線條、字、點陣都用兩倍解析度重算，不是放大。
- 一台 Apple Silicon 的 Mac 上，1080p60 約 70 分鐘；4K60 約 2 小時 4 分（7,467 秒，每秒約 2 格）。
- 這樣算出來的母帶很大（4K、crf 17 加上顆粒，約 17 GB、平均 550 Mbps），所以再壓一次給上傳用，限制位元率在 85 Mbps：

```bash
ffmpeg -i out/Baseline-4K-master.mp4 -map 0:v:0 -map 0:a:0 -c:v libx264 -preset slow -crf 17 -maxrate 85M -bufsize 170M \
  -pix_fmt yuv420p -x264-params aq-mode=3 \
  -vf "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv" \
  -c:a copy -movflags +faststart out/Baseline-4K.mp4
```

- 改一小段時不必整片重算。每一格只跟時間有關，所以只重算受影響的那幾秒（從前一個 IDR 關鍵影格算到後一個），用和母帶完全相同的 x264 參數編碼，再在這兩個 IDR 處接回母帶，其他部分不重新編碼：

```bash
cd app && bun scripts/render.ts video --scale 2 --fps 60 --samples auto --min-samples 4 --max-samples 108 --crf 17 \
  --from 194.33333333333334 --to 199.88333333333333 --noaudio --out ../out/seg.mp4      # 第 11660–11992 格
cd .. && sh tools/video/splice.sh out/Baseline-4K-master.mp4 out/seg.mp4 11660 11993 out/new-master.mp4 work/
python3 tools/video/check_splice.py out/Baseline-4K-master.mp4 out/new-master.mp4 11660 11993 work/ out/seg.mp4
```

  接點有三個陷阱：先把母帶切成幾個檔再接，ffmpeg 會把時間戳平移 B 幀的延遲（2 格），聲音和畫面就差 2 格；concat 預設會把 SPS/PPS 塞進每個關鍵影格（`-auto_convert 0` 關掉）；音軌的封包會提早觸發切點，所以只拿影像軌來接，聲音最後整條放回。`check_splice.py` 檢查總格數、時間戳逐格連續、切點以外的封包和原母帶逐一相同、切點前後與接進來那段的頭尾各 30 格解碼後逐位元相同。

## 7. 品質檢查

每個工具都是 `render.ts` 的一個模式：

| 模式 | 檢查什麼 |
| --- | --- |
| `textqa` | 全片每 0.1 秒，所有字的每個字母在畫面上的方框，找出互相重疊的字，以及字超出它所在框線的地方 |
| `lyricvis` | 每個正在唱的字：有沒有在畫面上、夠不夠大（≥ 22 px）、有沒有被畫框切掉 |
| `lyricqa` | 歌詞的載體與時間是否符合規則 |
| `sheet` / `stills` | 指定時間的聯絡表／單張截圖 |
| `cutqa`、`colorstat`、`gates` | 切點的動態模糊、色彩統計、量測門檻 |
| `dump` | 把時間軸、鏡頭、轉場、歌詞輸出成 `docs/data/structure.json`（分鏡表就是從這裡產生的） |

## 8. 做的過程

這部片改了很多版，每一版都是被否決之後重來：

1. **唱片世界**：整部片走在一張 2.4 公里的黑膠唱片上。→ 不要唱片、不要字幕條、不要出現論文，只講技術。
2. **THE SHAFT（3D）**：160 公尺的機井裡一台不斷重建自己的機器。→ 太暗、鏡頭太靜，3D 建模的品質不到位。
3. **純 2D 卡片**：每段一種設計風格。→ 「太執著純 2D」。
4. **從 p(doom) MV 的原始碼改**：→ 「變成抄襲」。p(doom) 只借手法（2D 模擬 3D、運鏡、字長在物件上），引擎沿用它 MIT 授權的部分。
5. **原創 v3**：每句歌詞就是那個技術最直接的畫面。
6. **v4 統一風格**：一套顏色（墨黑、骨白、洋紅）、巨字砸下、一格一個主角。
7. **v9 打磨**：GUARANTEED 從「廉價的金色貼紙」改成黑玻璃石碑雷射刻字；鏡面地板、場景間轉場、全片相機；主歌三重做；全片文字重疊檢查。
8. **v10**：公式城市與 71 條論文公式、光暈減半、∎ 推進接副歌、字要讀得到（lyricvis，看不清的字從 95 個降到 11 個，剩下的都是 0.1–0.3 秒的短字）、紀錄的樓梯。
9. **4K 之後的修正**：紀錄樓梯的長條比 DEPTH 到 ATTENTION 的一年半還寬，兩根疊在一起；NOW 停在 2025，下一個紀錄還放在過去。改成長條約一年寬、NOW 停在 2026、x 軸延伸到未來、三根「?」。只重算受影響的 333 格，接回母帶（見第 6 節）。

學到的事：
- 字太近、太快、被切掉，觀眾就看不懂；鏡頭要讓整個字在畫面裡，片語要放在鏡頭正在看的地方。
- 畫面上的每個東西都要有意義；飄過去的方塊再好看也是雜訊。
- 會重疊、會出框的字一定會被看到；與其靠眼睛找，不如寫一支逐格檢查的程式。
- 紀錄只會被超越，不會自己掉下來——圖表的語意要對；用了真實年份，長條的寬度也要跟著真實的間隔。

## 9. 授權

程式碼、場景、工具、資料與文件 © 2026 Tunai，採 MIT 授權（`LICENSE`）；歌曲本身（錄音與歌詞）保留權利（`LICENSE-SONG.md`）。引擎與分析工具的一部分改寫自 [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video)（MIT），字型是 SIL OFL 1.1，詳見 `THIRD_PARTY_NOTICES.md`。
