# Baseline

一支 4 分 07 秒的音樂影片，主題是 AI 架構怎麼登上 state of the art、又怎麼被下一代擠成 baseline：
感知器、SVM、卷積、RNN／LSTM、注意力、GAN、diffusion、MoE、量化、LoRA、RLHF／DPO、FlashAttention、長上下文……

> You were state of the art, now you're just a baseline.

每一格畫面都由歌曲時間算出（Canvas2D 針孔相機的 2D 模擬 3D，加 WebGL 後製），歌詞長在場景裡的物件上，不用字幕。
畫面上的數字都來自真的計算：用 CIFAR-10 訓練的 conv1 濾波器、SVM 擬合、BPTT 梯度、LSTM 閘門、GAN 模式崩塌、
MoE 路由、INT4 量化、LoRA rank-8、Bradley–Terry 獎勵、FlashAttention 分塊、needle-in-a-haystack 等。

## 目錄

| 路徑 | 內容 |
| --- | --- |
| `app/src/engine/` | 引擎：時間軸、動態模糊、後製、轉場、歌詞與節拍資料 |
| `app/src/scenes/` | 場景：`_v.ts` 是共用的相機與排字工具，`v_*.ts` 是各段畫面 |
| `app/src/timeline.ts`、`direction.ts` | 各段落用哪個場景，以及鏡頭撞擊與轉場 |
| `app/scripts/render.ts` | 算圖、截圖、聯絡表、文字重疊檢查 |
| `app/public/data/` | 畫面用的計算結果（由 `tools/data/` 的腳本產生） |
| `analysis/` | 逐字對齊與節拍分析 → `data/lyrics.json`、`data/audio.json` |
| `tools/` | 資料產生腳本：conv1 訓練、BPE 等 |
| `audio/baseline.wav` | 歌曲 |
| `lyrics/suno-v4.txt` | 歌詞 |
| `STORYBOARD-v3.md` | 分鏡 |

## 執行

需要 [Bun](https://bun.sh) 與 ffmpeg。

```bash
cd app
bun install
bunx vite                                   # 在瀏覽器即時預覽
bun scripts/render.ts video --fps 60 --samples auto --max-samples 108 --crf 17 --out ../out/Baseline.mp4
```

其他模式：`stills --t 18.9,19.2`（單張截圖）、`sheet --from 20 --to 35 --cols 4`（聯絡表）、
`textqa --from 0 --to 247.2`（逐字形檢查全片文字有沒有重疊）。

## 版權

© 2026 Tunai，保留一切權利。程式碼、場景、資料、歌詞、錄音與影像皆受著作權保護，未經書面同意不得重製、改作、散布或公開使用，詳見 `LICENSE`。
歌曲〈Baseline〉以 Suno 付費方案生成。

部分引擎與分析工具改寫自 [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video)（MIT），字型採 SIL Open Font License 1.1，詳見 `THIRD_PARTY_NOTICES.md`。
