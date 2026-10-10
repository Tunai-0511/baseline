# 分鏡表（每個鏡頭）

全片 4:07.20、60 fps、14,832 格。25 個場景（plate）、118 個鏡頭（camera shot）、14 個場景間轉場（seam）。
時間取自引擎本身（`bun scripts/render.ts dump` → `docs/data/structure.json`），由 `python3 docs/make_shotlist.py` 產生這份文件；
每格畫面都是歌曲時間的純函數，所以下表的時間就是成片的時間。每秒一格的縮圖在 [`docs/frames/`](frames/)。

欄位：**時間**＝鏡頭開始到下一個鏡頭（或場景結束）；**鏡頭**＝程式裡 Rig 的鏡頭名；**唱到的字**＝這段時間裡開始唱的字。
「snap」是從上一個鏡頭平滑接過來的秒數（0 = 硬切）。

## 目錄

- [0:00.00 intro · THE LINE](#intro)
- [0:16.05 v1sig · SQUASH](#v1sig)
- [0:23.45 v1feat · CARVED / LEARNED](#v1feat)
- [0:31.08 v1svm · MARGIN](#v1svm)
- [0:38.91 pre1 · THE CLAIM · DEPTH](#pre1)
- [0:45.81 chorus1 · THE BOARD · ILSVRC](#chorus1)
- [0:53.64 chorus1b · COLD STORAGE](#chorus1b)
- [1:00.53 verse2a · NIGHT LINE](#verse2a)
- [1:15.06 verse2b · NIGHT LINE · LAST STOP](#verse2b)
- [1:30.37 pre2 · THE CLAIM · MEMORY](#pre2)
- [1:37.24 chorus2 · THE BOARD · WMT14](#chorus2)
- [1:45.02 chorus2b · GONE](#chorus2b)
- [1:59.64 verse3a · THE LAB · GENERATIVE](#verse3a)
- [2:13.72 verse3b · THE LAB · EFFICIENCY](#verse3b)
- [2:28.32 pre3 · THE CLAIM · ATTENTION](#pre3)
- [2:35.58 chorus3 · THE BOARD · LAMBADA](#chorus3)
- [2:43.28 chorus3b · BOTH WAYS](#chorus3b)
- [2:50.52 bridgeA · THE PLANT](#bridgea)
- [3:04.54 bridgeB · THE TAPE](#bridgeb)
- [3:18.98 pre4 · THE CLAIM · SCALE](#pre4)
- [3:26.18 chorus4 · THE BOARD · PARAMETERS](#chorus4)
- [3:33.84 chorus4b · PRESSURE](#chorus4b)
- [3:40.58 stop · FOOTNOTE](#stop)
- [3:48.23 drop2 · THE FALL](#drop2)
- [4:01.71 tail · ONE MORE TIME](#tail)

## intro

**THE LINE** · `v_intro.ts` · 0:00.00–0:16.05（16.05 秒）

一台繪圖機在黑暗裡畫下全片第一條線：y = 0，也就是 baseline。感知器在 XOR 上失敗，疊一層隱藏層才解開。

背景城市的公式：`perc_out`、`perc_rule`、`mlp`、`xor`、`backprop`、`chainrule`（定義在 `app/eq.json`）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 0:00.00–0:02.02 | `pen` | 0 |  | 貼著繪圖筆的低角度特寫：筆尖從左到右畫出 y = 0，BASELINE 一個字母一個字母在線前方亮起。 |
| 0:02.02–0:03.87 | `pullback` | 0 |  | 鏡頭拉開，筆畫出第二條軸 x₂，座標平面成形；左上角是圖框「THE LINE · DWG 00」。 |
| 0:03.87–0:07.56 | `square` | 0 |  | 俯看單位正方形：四個布林輸入點落下，AND 與 OR 各被一筆切開；背牆浮現感知器的線路圖 x₁, x₂ → Σ → step → ŷ。 |
| 0:07.56–0:09.40 | `diagram` | 0.5 | Perceptron | 推向背牆的感知器圖，更新規則 w ← w + η(y − ŷ)x 寫在下方（排版公式）。 |
| 0:09.40–0:10.38 | `drew` | 0.35 | drew a line, but | DREW A LINE, BUT 沿著第一次嘗試的線寫在地上，筆一次又一次重畫。 |
| 0:10.38–0:12.39 | `xor` | 0.3 | XOR stayed unresolved, | 高空俯看：巨大的 XOR 躺在方塊後面顫抖，STAYED UNRESOLVED 與 EPOCH／ERRORS 計數印在前面。 |
| 0:12.39–0:14.54 | `stack` | 0.4 | stack another hidden layer | 第二層平面升起，圖長出 h₁ = OR、h₂ = NAND；STACK ANOTHER / HIDDEN LAYER 寫在隱藏層的前緣。 |
| 0:14.54–0:16.05 | `solve` | 0.45 | and the problem’s solved | 每個點被抬到 (h₁, h₂)，隱藏層上一刀分開；SOLVED ✓ 蓋章，XOR 帶在下層平面上著色。 |

鏡頭撞擊（hits，秒／強度）：8.68/0.5、10.38/0.9、12.39/0.7、15.48/1.0

## v1sig

**SQUASH** · `v_sig.ts` · 0:16.05–0:23.45（7.39 秒）

示波器工作台：sigmoid 把訊號壓扁，梯度往回穿過六層時每層乘上 ¼ 直到歸零；ReLU 一刀切掉負半邊，梯度原封不動地傳回來。

背景城市的公式：`sigmoid`、`dsigmoid`、`vanish`、`relu`、`backprop`、`chainrule`（定義在 `app/eq.json`）

進場轉場：`zoom`（切點前 0.22 秒、切點後 0.32 秒）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 0:16.05–0:16.66 | `curve` | 0 | Sigmoid | 轉移示波器正面：SIGMOID 在上方，σ(x) 曲線、工作點在曲線上滑動。 |
| 0:16.66–0:17.56 | `bench` | 0.35 | squashed the signal, | 拉開看整個工作台：CH1 大正弦、σ 轉換、CH2 被壓進 (0, 1) 的窄帶；SQUASHED 被字面上壓扁。 |
| 0:17.56–0:18.61 | `chain` | 0.45 | gradients fading | 沿著六層 sigmoid 鏈往左移動：梯度光球從 LOSS 往回跑，每過一層乘 ¼，∂L/∂x 從 1 掉到 0.00098；GRADIENTS / FADING 寫在光球經過處。 |
| 0:18.61–0:19.98 | `zero` | 0.3 | down to zero, | 停在輸入端：DOWN TO 之後巨大的紅色 ZERO 砸下，× ¼ 標在每個單元上。 |
| 0:19.98–0:20.42 | `relu` | 0.25 | ReLU | 轉移曲線變成 max(0, x)：RELU 在上方，負半邊被一刀切掉。 |
| 0:20.42–0:21.58 | `clip` | 0.3 | clipped the negatives | 剪下的負半波碎片掉落；CLIPPED THE NEGATIVES 寫在螢幕下緣，刀線切過 NEGATIVES 的下半部。 |
| 0:21.58–0:22.66 | `hero-run` | 0.4 | and came in as the | 同一條鏈，這次每層 × 1：梯度以全強度跑回來，AND CAME IN AS THE 寫在路上。 |
| 0:22.66–0:23.45 | `hero` | 0.25 | hero | 光球抵達輸入端炸開放射線，HERO 巨字砸下。 |

鏡頭撞擊（hits，秒／強度）：16.66/0.8、18.96/0.7、19.98/0.8、20.42/1.2、22.66/1.6

## v1feat

**CARVED / LEARNED** · `v_feat.ts` · 0:23.45–0:31.08（7.63 秒）

銅版：手工雕出 HOG 行人與 SIFT 描述子；接著卷積核滑過版面，一面牆上 96 個 conv1 濾波器從雜訊中長出來，沒有人設計過它們。

背景城市的公式：`hog`、`sift`、`conv`、`convlayer`、`sgd`、`relu`（定義在 `app/eq.json`）

進場轉場：`whip`（切點前 0.18 秒、切點後 0.3 秒）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 0:23.45–0:24.09 | `head` | 0 | Hand-tuned | 銅版上方：HAND-TUNED 先刻外框再填銅色，雕刻刀從行人的頭開始刻每個 8 × 8 格的方向直方圖。 |
| 0:24.09–0:24.60 | `sift` | 0.3 | SIFT and | 移到左邊的 SIFT 描述子面板（4 × 4 × 8 = 128 維）：SIFT 與 AND 寫在面板上方。 |
| 0:24.60–0:27.31 | `plate` | 0.35 | HOG, every feature carved by hand, | 拉回看整塊銅版：HOG 在右，EVERY FEATURE / CARVED BY HAND 寫在版下的銘牌上，手調的常數卡在一旁。 |
| 0:27.31–0:28.15 | `conv` | 0.45 | convolution | 冷光接手：11 × 11 的卷積核在版面上滑動，前方的特徵圖逐列填滿；CONVOLUTION 寫在圖上，(I * K)(i, j) 的公式在下。 |
| 0:28.15–0:29.44 | `wall` | 0.5 | learned the filters that | 轉向濾波器牆：真實訓練過程的 45 個快照，96 個 conv1 濾波器從雜訊長成邊緣與色塊（洋紅雙色調）；LEARNED THE FILTERS 在牆頂。 |
| 0:29.44–0:31.08 | `nobody` | 0.3 | nobody planned | 推近牆面（牆變暗讓字浮出）：THAT / NOBODY / PLANNED；底下是 STEP、EPOCH 與 TEST ACC 88.3%。 |

鏡頭撞擊（hits，秒／強度）：24.09/0.6、24.60/0.8、27.36/1.0、29.44/0.9

## v1svm

**MARGIN** · `v_svm.ts` · 0:31.08–0:38.91（7.83 秒）

一片繪圖紙般的院子：真的 SVM 擬合，決策邊界的街道撐到 2/‖w‖ = 3.29；核技巧把圓環抬進碗裡一刀切開；ImageNet 錯誤率長條被深度網路逐年壓下去。

背景城市的公式：`svm_primal`、`svm_dual`、`rbf`、`margin`、`kerneltrick`、`convlayer`（定義在 `app/eq.json`）

進場轉場：`slice`（切點前 0.1 秒、切點後 0.3 秒）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 0:31.08–0:31.79 | `yard` | 0 | SVM, the | 院子俯視：32 個真實樣本、背後圍籬上巨大的 SVM 與 hard-margin 的最佳化式。 |
| 0:31.79–0:32.81 | `street` | 0.45 | widest margin, | 沿著決策邊界的街道：兩側圍籬向外撐開直到碰到三個支持向量，THE WIDEST MARGIN 寫在街上，2/‖w‖ 讀數在街口。 |
| 0:32.81–0:34.45 | `bowl` | 0.55 | kernel trick and all, | 繞著隔壁的碗：圓環被 φ(x) = (x₁, x₂, x₁² + x₂²) 抬起，一個水平面切開；KERNEL TRICK / AND ALL 與 φ、k(x, y) 的式子掛在碗上方。 |
| 0:34.45–0:36.13 | `chart` | 0.5 | deep nets ate the benchmarks | ImageNet top-5 錯誤率長條圖正面、靜止：DEEP NETS / ATE THE BENCHMARKS 在上方，2012–2015 的長條在 ATE、THE、BENCH-、-MARKS 上一根根被壓下去，底下標 ALEXNET、ZFNET、GOOGLENET、RESNET。 |
| 0:36.13–0:38.91 | `fall` | 0.45 | and the margins had to fall Depth | 回到院子：AND THE MARGINS HAD TO，圍籬倒下揚起塵土，巨大的紅色 FALL 字母一個個翻落；最後院子打開成方形豎井，鏡頭轉向往下看。 |

鏡頭撞擊（hits，秒／強度）：31.08/0.5、32.86/0.6、34.50/1.2、35.29/0.6、35.59/0.6、35.79/0.6、36.09/0.6、37.57/1.8

## pre1

**THE CLAIM · DEPTH** · `v_pre.ts` · {"key": "depth"} · 0:38.91–0:45.81（6.90 秒）

152 層的方形豎井，DEPTH 從井口往下擠出；鏡頭穿過寫著 IS · ALL · YOU 的樓層，NEED 在第 152 層等著；黑玻璃石碑砸下，雷射刻出 GUARANTEED ∎。

背景城市的公式：`resnet`、`batchnorm`、`convlayer`、`backprop`（定義在 `app/eq.json`）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 0:38.91–0:39.58 | `mouth` | 0 |  | 從井口往下看：DEPTH 的外框沿著井壁往下擠出 28 層，牆上標著 8 / 19 / 22 / 152 層與年份。 |
| 0:39.58–0:43.33 | `dive` | 0 | is all you need, the abstract | 俯衝穿過豎井：樓層地板上寫著 IS、ALL、YOU，鏡頭一層層穿過。 |
| 0:43.33–0:45.81 | `floor` | 0 | guaranteed | 第 152 層的井底：NEED 巨字、THE ABSTRACT，黑玻璃石碑砸下，雷射逐字刻出 GUARANTEED，洋紅 ∎ 砸上；鏡頭最後推進 ∎ 直到整個畫面變成洋紅。 |

鏡頭撞擊（hits，秒／強度）：38.88/0.8、39.88/0.4、40.46/0.4、40.74/0.6、42.66/0.3、43.48/1.8

## chorus1

**THE BOARD · ILSVRC** · `v_lb.ts` · {"n": 1} · 0:45.81–0:53.64（7.82 秒）

排行榜高塔：冠軍板上巨字 STATE OF THE ART；挑戰者砸上塔頂，舊冠軍名牌一路摔到底，地板被洋紅淹沒寫著 BASELINE；鏡頭火箭般升回榜首，倒數歸零 DEADLINE。

背景城市的公式：`top5`、`convlayer`、`relu`、`sgd`（定義在 `app/eq.json`）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 0:45.81–0:47.82 | `state` | 0 | You were state of the art, | 從洋紅的 ∎ 拉開：冠軍板的 LED 面，YOU WERE（墨色）→ STATE OF THE ART 巨字；王冠在板頂。 |
| 0:47.82–0:48.97 | `dive` | 0.14 | now you’re just a | 挑戰者砸上塔頂、冠軍板碎裂；名牌往下掉，每唱一個字（NOW · YOU'RE · JUST · A）就頓一下，鏡頭跟著俯衝。 |
| 0:48.97–0:49.89 | `floor` | 0 | baseline | 名牌撞地：洋紅從撞擊點淹過地板，BASELINE 寫在上面（y = 0）。 |
| 0:49.89–0:51.59 | `crane` | 0 | Top of the leaderboard, | 鏡頭火箭般升回塔頂：TOP OF THE 跟著上升，停進榜首的標題板；LEADERBOARD 砸下，新冠軍在下面發光。 |
| 0:51.59–0:53.64 | `clock` | 0.3 | until the next deadline Kernel | 標題板變成倒數計時，在 DEADLINE 上歸零 00:00.00；UNTIL THE NEXT / DEADLINE 巨字。 |

鏡頭撞擊（hits，秒／強度）：47.88/2.4、48.30/0.7、48.53/0.7、48.84/0.7、49.00/2.0、52.68/1.3

## chorus1b

**COLD STORAGE** · `v_shelf.ts` · 0:53.64–1:00.53（6.90 秒）

冷藏櫃：核方法與手工特徵各封在一格冰裡；FROZEN 結霜；王冠飛向旁邊的網路，鏡頭穿過它自己學到的 EDGES / TEXTURES / PARTS / CLASS。

背景城市的公式：`kerneltrick`、`rbf`、`hog`、`convlayer`、`backprop`、`sgd`（定義在 `app/eq.json`）

進場轉場：`push`（切點前 0.06 秒、切點後 0.4 秒）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 0:53.64–0:55.35 | `dolly` | 0 | tricks and hand-made features | 冷藏櫃正面：十格冰塊裡封著 RBF、多項式核、SIFT、HOG、Haar、Gabor、LBP、詞袋、色彩直方圖、SURF；KERNEL TRICKS AND / HAND-MADE FEATURES 掛在兩排之間。 |
| 0:55.35–0:57.03 | `frost` | 0.5 | frozen on the shelf, | FROZEN 從玻璃上結霜蔓延，標籤跟著結霜消失；ON THE SHELF。 |
| 0:57.03–0:58.65 | `crown` | 0.6 | the network took the crown and | 王冠從櫃頂升起飛向右邊的網路；THE NETWORK TOOK THE CROWN 在網路上方。 |
| 0:58.65–0:59.55 | `layers` | 0.45 | learned the features | 沿著網路的層往深處移動：第一層是真實的 conv1 濾波器（EDGES）、紋理、零件、類別；AND LEARNED、THE FEATURES 一組組寫在層上。 |
| 0:59.55–1:00.53 | `itself` | 0.4 | by itself | BY ITSELF 砸在網路上方，各層名稱淡出。 |

鏡頭撞擊（hits，秒／強度）：55.40/0.6、58.14/0.8、59.60/1.0

## verse2a

**NIGHT LINE** · `v_seq1.ts` · 1:00.53–1:15.06（14.53 秒）

這首歌本身是一列夜車，每個唱到的字是一節車廂。n-gram 的框、RNN 的吊車、BPTT 的分岔（消失／爆炸）、LSTM 沿路的閘門，全部用真的模型數值。

背景城市的公式：`ngram`、`rnn`、`bptt`、`lstm_f`、`lstm_i`、`lstm_c`、`lstm_h`（定義在 `app/eq.json`）

進場轉場：`whip`（切點前 0.2 秒、切點後 0.34 秒）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 1:00.53–1:03.94 | `window` | 0 | N-gram counting words, a window three tokens wide, | 夜車：每節車廂是一個唱到的字，唱到就亮；三節寬的 n-gram 龍門架沿著車滑動，上面是那三個字與它在這首歌裡的計數；N-GRAM COUNTING WORDS 在上空。 |
| 1:03.94–1:07.79 | `crane` | 0.5 | RNN kept a hidden state and carried it inside | RNN 吊車沿高架軌道移動，停在每節車廂上方讀它；吊車面板上 8 顆 LED 是真實 tanh RNN 的 hidden state；RNN KEPT A HIDDEN STATE / AND CARRIED IT INSIDE。 |
| 1:07.79–1:12.00 | `fork` | 0.6 | Backprop through time, the gradients vanish or explode, | 軌道在吊車後面分岔：一條上梯度範數一路掉到 10⁻²⁰（VANISH），另一條爬到 10⁶（EXPLODE，抖動）；OR 站在中間。 |
| 1:12.00–1:15.06 | `gates` | 0.55 | LSTM put gates along the road | 每節車廂旁立起 F / I / O 三支柵欄，由真實 LSTM 閘門值決定開合；cell state 是一條筆直的電線；LSTM 招牌與其下的 c_t 公式，PUT GATES ALONG THE ROAD。 |

鏡頭撞擊（hits，秒／強度）：63.99/0.6、67.84/0.8、70.16/0.5、70.86/1.6、72.05/0.8

## verse2b

**NIGHT LINE · LAST STOP** · `v_seq2.ts` · 1:15.06–1:30.37（15.31 秒）

真的 seq2seq 把這句歌詞壓過瓶頸再倒著吐出；注意力的光束回頭看；遞迴一個一個過閘門；Transformer 一次全部並行，鏡頭升空把夜車留在下面。

背景城市的公式：`seq2seq`、`bahdanau_e`、`bahdanau_a`、`attention`、`multihead`、`lstm_c`（定義在 `app/eq.json`）

進場轉場：`whip`（切點前 0.16 秒、切點後 0.3 秒）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 1:15.06–1:17.40 | `enc` | 0 | Seq2seq would squeeze a sentence through a | 這句歌詞的 12 節車廂開進漏斗（encoder）。 |
| 1:17.40–1:18.60 | `neck` | 0.45 | bottleneck, | 漏斗頸：整句被壓成一個發光的向量 c ∈ ℝ⁶⁴，BOTTLENECK 被字面上掐細。 |
| 1:18.60–1:20.41 | `beams` | 0.55 | attention let the decoder | 解碼端倒著卸下車廂；從每節解碼車廂射回 encoder 的光束（真實 α 權重）；ATTENTION / LET THE DECODER。 |
| 1:20.41–1:21.16 | `look` | 0.3 | look back and | 側面看光束：LOOK BACK 掛在光束上。 |
| 1:21.16–1:22.31 | `map` | 0.4 | double-check | 俯看地上的注意力熱圖，反對角線（倒序翻譯）清楚可見；AND DOUBLE-CHECK 寫在熱圖旁。 |
| 1:22.31–1:25.93 | `march` | 0.5 | Recurrence marched in order, one step at a time, | 遞迴：車廂一拍一節通過旋轉門，招牌顯示 t = 1, 2, 3 …；RECURRENCE MARCHED IN ORDER / ONE STEP AT A TIME。 |
| 1:25.93–1:30.37 | `parallel` | 0.35 | transformers ran in parallel and left it all behind Memory’s | Transformer：所有車廂同時出現，兩兩之間連上弧線；TRANSFORMERS / RAN IN PARALLEL / AND LEFT IT ALL BEHIND；鏡頭升空把夜車留在下面。 |

鏡頭撞擊（hits，秒／強度）：77.50/0.9、78.65/0.6、80.46/1.0、82.36/0.5、85.98/1.4、88.04/0.8

## pre2

**THE CLAIM · MEMORY** · `v_pre.ts` · {"key": "memory"} · 1:30.37–1:37.24（6.87 秒）

一排 LSTM 細胞，每格 5 × 7 點陣寫一個字母：MEMORY'S ALL YOU NEED，cell state 像鐵軌從上面劃過；石碑砸下刻 GUARANTEED。

背景城市的公式：`lstm_c`、`lstm_h`、`lstm_f`、`lstm_i`、`bptt`（定義在 `app/eq.json`）

進場轉場：`zoom`（切點前 0.2 秒、切點後 0.32 秒）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 1:30.37–1:33.73 | `words` | 0 | all you need, | LSTM 細胞排成一列，點陣逐字寫出 MEMORY'S（整個字在畫面中），唱到 ALL 時鏡頭滑到 ALL YOU NEED；cell state 的軌道與光點在上方。 |
| 1:33.73–1:34.85 | `pull` | 0.6 | the abstract | 拉開看整排細胞與末端的石碑，THE ABSTRACT 在上方。 |
| 1:34.85–1:37.24 | `seal` | 0.25 | guaranteed | 石碑砸下、雷射刻 GUARANTEED、∎ 砸上；鏡頭推進 ∎ 接副歌。 |

鏡頭撞擊（hits，秒／強度）：90.34/0.8、91.29/0.4、91.97/0.4、92.18/0.6、94.18/0.3、94.90/1.8

## chorus2

**THE BOARD · WMT14** · `v_lb.ts` · {"n": 2} · 1:37.24–1:45.02（7.78 秒）

同一座排行榜，換成機器翻譯 BLEU，砸得更重。

背景城市的公式：`bleu`、`attention`、`multihead`、`seq2seq`（定義在 `app/eq.json`）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 1:37.24–1:39.22 | `state` | 0 | You were state of the art, | 同 chorus 1，排行榜換成 WMT14 EN→DE · BLEU。 |
| 1:39.22–1:40.39 | `dive` | 0.14 | now you’re just a | 同 chorus 1，撞擊加重。 |
| 1:40.39–1:41.31 | `floor` | 0 | baseline | 同 chorus 1：BASELINE 洪水。 |
| 1:41.31–1:42.99 | `crane` | 0 | Top of the leaderboard, | 同 chorus 1：升回榜首，新冠軍 TRANSFORMER (BIG) 28.4。 |
| 1:42.99–1:45.02 | `clock` | 0.3 | until the next deadline | 同 chorus 1：倒數歸零。 |

鏡頭撞擊（hits，秒／強度）：99.28/3.2、99.70/0.7、99.96/0.7、100.24/0.7、100.42/2.7、104.06/1.8

## chorus2b

**GONE** · `v_gone.ts` · 1:45.02–1:59.64（14.62 秒）

LSTM 細胞的圖一路展開到地平線，記憶沿著 cell state 跑了很久；一層注意力像玻璃板砸下，遞迴的迴圈一個個斷掉，細胞崩散：GONE。drop：鏡頭俯衝穿過六層注意力。

背景城市的公式：`attention`、`multihead`、`posenc`、`head`、`ffn`、`layernorm`、`lstm_c`、`bptt`（定義在 `app/eq.json`）

進場轉場：`slice`（切點前 0.1 秒、切點後 0.3 秒）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 1:45.02–1:46.77 | `cell` | 0 | LSTM, you held the | LSTM 細胞圖正面：上方 cell state 高速公路（× 遺忘、+ 輸入），下方 σ σ tanh σ 閘門；LSTM, / YOU HELD THE MEMORY。 |
| 1:46.77–1:48.62 | `horizon` | 0.5 | memory for so long, | 鏡頭轉向地平線：細胞展開成一長串，一個記憶光點沿著公路一格格跑；FOR SO LONG 拉長排在公路上方。 |
| 1:48.62–1:51.33 | `slab` | 0.45 | one attention layer and the whole recurrence | 一層注意力像玻璃板砸在細胞上，板上刻著 Attention(Q, K, V) = softmax(QKᵀ/√dₖ)V；ONE ATTENTION LAYER / AND THE WHOLE RECURRENCE。 |
| 1:51.33–1:52.31 | `gone` | 0.3 | gone | 遞迴的迴圈一個個斷開、細胞崩散，GONE 巨字字母緩緩漂開。 |
| 1:52.31–1:59.64 | `dive` | 0 |  | drop：玻璃板亮成一層注意力（token、所有配對的弧線、八個 head 隨鼓點閃），鏡頭往下俯衝穿過六層；地板上依序寫著 GONE、ALL PAIRS AT ONCE、NO RECURRENCE。 |

鏡頭撞擊（hits，秒／強度）：105.02/0.5、108.67/0.6、109.53/2.4、110.78/1.0、111.38/1.4、112.33/0.9、112.79/0.3、113.25/0.3、113.71/0.3、114.16/0.9、114.62/0.3、115.08/0.3、115.53/0.3、115.99/0.9、116.45/0.3、116.90/0.3、117.36/0.3、117.82/0.9、118.27/0.3、118.73/0.3、119.18/0.3

## verse3a

**THE LAB · GENERATIVE** · `v_gen2.ts` · 1:59.64–2:13.72（14.08 秒）

GAN 的球場（25 個模態、生成分布的洋紅地形、崩成一根尖峰）、diffusion 從雜訊凝成字、RoPE 的指針隧道、LayerNorm/RMSNorm 的柱子與 ReLU→SwiGLU 的光管。

背景城市的公式：`gan`、`ddpm_fwd`、`ddpm_loss`、`rope`、`rope_rot`、`rmsnorm`、`swiglu`（定義在 `app/eq.json`）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 1:59.64–2:02.58 | `court` | 0 | GANs played a two-player game until the modes | GAN 的球場：25 個目標模態是地上的光井，生成分布是洋紅地形，G 與 D 是兩端的紀念碑，後牆巨大的 MODES n/25；GANS PLAYED A / TWO-PLAYER GAME / UNTIL THE MODES。 |
| 2:02.58–2:03.43 | `spike` | 0.22 | collapsed, | 地形折疊成一根尖峰，其他光井熄滅：COLLAPSED 砸下，震波環擴散。 |
| 2:03.43–2:05.49 | `noise` | 0.5 | diffusion learned to denoise in a | 每個字從一團有深度的雜訊凝聚成形（真實 DDPM 軌跡）：DIFFUSION、LEARNED、TO、DENOISE、IN、A；下方的 t 從 1000 數到 0。 |
| 2:05.49–2:07.02 | `corridor` | 0.3 | thousand tiny steps | 鏡頭飛進中間步驟組成的走廊（t = 1000 … 0 的每一格）：THOUSAND / TINY / STEPS 掛在前方。 |
| 2:07.02–2:08.01 | `wall` | 0.45 | Sinusoids | 正弦位置編碼的光牆（40 個位置 × 16 維），SINUSOIDS 在牆頂，PE 公式在下。 |
| 2:08.01–2:10.05 | `tunnel` | 0.3 | gave way to RoPE’s rotation, | 光牆倒下變成指針隧道：每一圈是一個位置 m，八組頻率的指針轉 m·θᵢ；GAVE WAY TO / ROPE'S ROTATION 掛在隧道裡。 |
| 2:10.05–2:11.65 | `columns` | 0.45 | LayerNorm to RMS, | 16 個殘差值是一排柱子：LayerNorm 把它們置中並縮放，RMSNorm 只縮放；LAYERNORM TO RMS。 |
| 2:11.65–2:13.72 | `curve` | 0.3 | ReLU to SwiGLU activation | 活化函數是一條發光的管子：ReLU 彎成 Swish（最低 −0.278 在 x = −1.278）；RELU TO SWIGLU ACTIVATION。 |

鏡頭撞擊（hits，秒／強度）：119.64/0.6、122.62/1.6、123.48/0.6、125.54/0.5、127.07/0.6、128.06/0.7、130.10/0.6、131.70/0.6

## verse3b

**THE LAB · EFFICIENCY** · `v_eff2.ts` · 2:13.72–2:28.32（14.60 秒）

MoE 八座專家塔只醒兩座、INT4 位元牆在鼓點上剝落、LoRA 讓 W 結霜只補一片低秩、in-context 的提示緞帶與凍住的 θ，梯度掉進地板沒人接住。

背景城市的公式：`moe`、`quant`、`lora`、`icl`、`swiglu`、`compute`（定義在 `app/eq.json`）

進場轉場：`push`（切點前 0.06 秒、切點後 0.25 秒）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 2:13.72–2:15.02 | `dense` | 0 | Dense became a | 512 顆光點的稠密方塊全部亮著：DENSE FFN · EVERY WEIGHT, EVERY TOKEN；DENSE BECAME。 |
| 2:15.02–2:17.13 | `experts` | 0.3 | mixture, only some experts awake, | 方塊裂成弧形排列的八座專家塔，每唱一個字由真實的 top-2 router 選兩座點亮，其他六座 z z z；A MIXTURE / ONLY SOME / EXPERTS AWAKE。 |
| 2:17.13–2:19.49 | `bits` | 0.45 | 32 bits down to 4 for the | 位元牆（24 個權重 × 32 位元，第一列是真實 conv 權重的 fp32 符號／指數／尾數）：在兩個鼓點上低位元斷落 32 → 18 → 4；32 BITS / DOWN TO 4。 |
| 2:19.49–2:20.84 | `gauge` | 0.25 | throughput’s sake | 記憶體條縮小 ×8，巨大的吞吐量儀表指針擺過去；FOR THE / THROUGHPUT'S SAKE 在儀表上方。 |
| 2:20.84–2:22.33 | `W` | 0.45 | Full fine-tune to | W 是一面 24 × 24 的學習中格子牆：FULL FINE-TUNE / TO LORA，在 LORA 上結霜鎖住。 |
| 2:22.33–2:24.61 | `patch` | 0.3 | LoRA, a low-rank little patch, | B 與 A 兩片細長發光板滑入，乘積 ΔW（這句歌詞字形的 rank-8 重建）疊在 W 上；A LOW-RANK / LITTLE PATCH。 |
| 2:24.61–2:26.67 | `context` | 0.45 | then just prompt it in context, | 地上的 few-shot 提示緞帶（STATE OF THE ART → BASELINE …，最後一列 ATTENTION → ? 被補成 BASELINE），右邊是凍住的 θ 方塊；THEN JUST PROMPT IT / IN CONTEXT。 |
| 2:26.67–2:28.32 | `grad` | 0.3 | no gradient to catch | ∇θ L 從上方掉下、穿過地板，方塊上寫 NOT COMPUTED；NO GRADIENT / TO CATCH 掛在方塊上方；最後鏡頭跟著往下鑽。 |

鏡頭撞擊（hits，秒／強度）：133.72/0.6、135.06/1.0、137.18/0.6、137.86/1.4、138.32/1.4、139.54/0.7、140.88/0.6、142.38/1.0、144.66/0.6、146.72/0.6

## pre3

**THE CLAIM · ATTENTION** · `v_pre.ts` · {"key": "attention"} · 2:28.32–2:35.58（7.26 秒）

四塊磚 ATTENTION'S · ALL · YOU · NEED，磚之間的注意力弧線是用這首歌訓練的單層模型算出來的；石碑砸下。

背景城市的公式：`attention`、`multihead`、`head`、`posenc`（定義在 `app/eq.json`）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 2:28.32–2:33.21 | `bricks` | 0 | Attention’s all you need, the abstract | 四塊磚依序升起：ATTENTION'S · ALL · YOU · NEED；ATTENTION'S 內字母之間的注意力弧、磚與磚之間的因果注意力（用這首歌訓練的單層模型的權重），地上 4 × 4 注意力圖。 |
| 2:33.21–2:35.58 | `seal` | 0.3 | guaranteed | THE ABSTRACT，石碑砸下刻 GUARANTEED ∎，推進 ∎ 接副歌。 |

鏡頭撞擊（hits，秒／強度）：148.62/0.8、149.72/0.4、150.12/0.4、150.58/0.6、152.43/0.3、153.26/1.8

## chorus3

**THE BOARD · LAMBADA** · `v_lb.ts` · {"n": 3} · 2:35.58–2:43.28（7.70 秒）

冷的一輪：沒有碎片、沒有洪水，名牌被輕輕放下。

背景城市的公式：`lambada`、`clm`、`scaling`、`causal`（定義在 `app/eq.json`）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 2:35.58–2:37.54 | `state` | 0 | You were state of the art, | 同 chorus 1，排行榜換成 LAMBADA · ACCURACY，冷的一輪。 |
| 2:37.54–2:38.67 | `dive` | 0.14 | now you’re just a | 名牌下降但沒有碎片。 |
| 2:38.67–2:39.61 | `floor` | 0 | baseline | 名牌被輕輕放在地上，沒有洪水。 |
| 2:39.61–2:41.29 | `crane` | 0 | Top of the leaderboard, | 升回榜首：175B DECODER · FEW-SHOT 86.4。 |
| 2:41.29–2:43.28 | `clock` | 0.3 | until the next deadline BERT, | 倒數歸零 DEADLINE。 |

鏡頭撞擊（hits，秒／強度）：157.60/0.4、158.70/0.3

## chorus3b

**BOTH WAYS** · `v_bert.ts` · 2:43.28–2:50.52（7.25 秒）

BERT：一排玻璃 token，兩道光從兩端讀到 [MASK] 填上 STATE；注意力方陣；decoder-only 只看過去，三角形一路放大到 175B；BERT 縮成一個勾選框：OPTIONAL。

背景城市的公式：`mlm`、`clm`、`causal`、`scaling`、`params`、`compute`（定義在 `app/eq.json`）

進場轉場：`slice`（切點前 0.1 秒、切點後 0.3 秒）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 2:43.28–2:44.57 | `row` | 0 | you read both ways, | 一排玻璃 token：YOU WERE [MASK] OF THE ART；BERT 方塊在左，兩道光從兩端讀到中間把 [MASK] 填成 STATE；YOU READ BOTH WAYS 在上方。 |
| 2:44.57–2:47.60 | `square` | 0.4 | masked and bidirectional, decoder-only | 俯看 token 下方的注意力方陣（每個 token 看所有 token）：MASKED AND BIDIRECTIONAL 寫在地上；接著上三角熄滅（只看過去），DECODER-ONLY 砸下。 |
| 2:47.60–2:48.47 | `scale` | 0.4 | scaled up | 鏡頭高空後退：因果三角形一步步放大（117M → 1.5B → 175B 參數）鋪滿地面；SCALED UP。 |
| 2:48.47–2:50.52 | `optional` | 0.35 | and made you optional | BERT 的方塊縮成勾選框：[ ] BERT (OPTIONAL)；AND MADE YOU。 |

鏡頭撞擊（hits，秒／強度）：163.28/0.3、166.64/0.4、167.65/0.3

## bridgeA

**THE PLANT** · `v_align.ts` · 2:50.52–3:04.54（14.02 秒）

RLHF 的獎勵模型掃描四個答案並排序；DPO 用吊車把中間人吊走，Z(x) 在兩邊相消；FlashAttention 的晶片把 S 分塊搬進 SRAM；通往 HBM 的路從紅色塞車變成綠色暢通。

背景城市的公式：`bt`、`rlhf`、`dpo`、`flash_m`、`flash_l`、`flash_io`（定義在 `app/eq.json`）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 2:50.52–2:52.97 | `line` | 0 | RLHF trained a reward model to | 輸送帶上四個答案 A B C D 經過 REWARD MODEL 掃描器，各被蓋上擬合的 Bradley–Terry 分數（1.66、1.13、−0.41、−2.39）；RLHF / TRAINED A REWARD MODEL。 |
| 2:52.97–2:53.39 | `rank` | 0.4 | rank, | 答案依分數排序疊起：C ≻ A ≻ B ≻ D；TO RANK。 |
| 2:53.39–2:55.75 | `crane` | 0.5 | DPO skipped the middleman | 吊車把獎勵模型直直吊離輸送帶（中間人）；DPO / SKIPPED THE MIDDLEMAN；偏好對直接接進策略 π_θ。 |
| 2:55.75–2:57.17 | `bank` | 0.35 | and took it to the bank | 金庫門與櫃台：r_w − r_l 的式子裡 β log Z(x) 兩邊相消被劃掉，Z(x) CANCELS；AND TOOK IT TO THE BANK。 |
| 2:57.17–3:00.63 | `die` | 0.6 | FlashAttention tiles it all inside the SRAM, | 俯看晶片：一個真實 attention head 的 64 × 64 分數矩陣切成 16 × 16 的塊，一塊塊搬進 SRAM，線上 softmax 的 (m, ℓ) 累積；S 從不寫回 HBM；FLASHATTENTION / TILES IT ALL / INSIDE THE SRAM。 |
| 3:00.63–3:04.54 | `road` | 0.45 | no more round trips to the HBM, no traffic jam | 通往 HBM 記憶體堆疊的路：標準注意力 4,325,376 次存取的紅色塞車，換成 FlashAttention 335,544 次（少 ×12.9）的綠色暢通；NO MORE ROUND TRIPS TO THE HBM / NO TRAFFIC JAM。 |

鏡頭撞擊（hits，秒／強度）：170.52/0.6、173.02/0.6、175.00/1.2、175.94/0.8、177.22/0.8、180.68/0.6、183.56/0.9

## bridgeB

**THE TAPE** · `v_ctx.ts` · 3:04.54–3:18.98（14.44 秒）

這首歌自己的 token 鋪成一條磁帶，上下文視窗從 2K 翻倍到一百萬；乾草堆裡的針是第 0 個 token：PERCEPTRON；四塊宣言墓碑刻上日期；紀錄的樓梯一階比一階高，被超越的就成了虛線的 baseline。

背景城市的公式：`ppl`、`rope`、`alibi`、`posinterp`、`attention`、`clm`（定義在 `app/eq.json`）

進場轉場：`zoom`（切點前 0.2 秒、切點後 0.32 秒）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 3:04.54–3:08.13 | `tape` | 0 | Context window: 2K, then a million tokens long, | 這首歌自己的 BPE token 鋪成一條磁帶，視窗框從 2,048 翻倍九次到 1,048,576，鏡頭一路升高；CONTEXT WINDOW: 2K、THEN A MILLION TOKENS LONG。 |
| 3:08.13–3:09.85 | `needle` | 0.3 | needle in a haystack, | 磁帶最遠端的乾草堆裡有一根針：token 0，PERCEPTRON 的 P（這部片唱的第一個字）；一道光從現在回到它；NEEDLE IN A HAYSTACK。 |
| 3:09.85–3:11.85 | `map` | 0.3 | it remembers every song | 檢索地圖（上下文長度 × 針的深度）全部綠色；IT REMEMBERS EVERY SONG。 |
| 3:11.85–3:15.45 | `stones` | 0 | Every “all you need” is a paper with a date, | 四句宣言是一排黑玻璃墓碑，每塊刻著宣言與 GUARANTEED ∎，在 DATE 上刻出日期（1997-11-15、2015-12-10、2017-06-12、2020-01-23）；EVERY "ALL YOU NEED" / IS A PAPER / WITH A DATE 掛在碑上方。 |
| 3:15.45–3:18.98 | `late` | 0.25 | every breakthrough’s just a baseline running late | 時間軸上的紀錄樓梯（橫軸是真實年份，每個宣言立在它代表論文的發表日；高度只表示一階比一階高）：NOW 往右掃，每唱一個字就有一個宣言升起（MEMORY 1997 → DEPTH 2015 → ATTENTION 2017 → SCALE 2020）；被超越的變灰，頂端延伸成虛線的 BASELINE；唱到 RUNNING 時 NOW 停在 2026（現在），x 軸往右延伸成虛線的未來，三根未命名的 ? 一根比一根高地升起，SCALE 也成了 baseline；時鐘在 NOW 頂端快轉。 |

鏡頭撞擊（hits，秒／強度）：185.60/0.6、186.78/1.2、188.18/0.6、194.88/1.4、195.50/0.6

## pre4

**THE CLAIM · SCALE** · `v_pre.ts` · {"key": "scale"} · 3:18.98–3:26.18（7.20 秒）

對數座標上的冪律 loss ∝ C^−0.050，每唱一個字鏡頭就退後十倍，SCALE 一個字母比一個字母大十倍；超出資料的部分變成虛線：EXTRAPOLATED。

背景城市的公式：`scaling`、`chinchilla`、`compute`、`params`（定義在 `app/eq.json`）

進場轉場：`whip`（切點前 0.18 秒、切點後 0.32 秒）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 3:18.98–3:26.18 | `stairs` | 0 | Scale is all you need, the abstract guaranteed You | 對數—對數平面上的冪律線，每唱一個字鏡頭退後一個數量級，SCALE 的每個字母都比上一個大十倍；超出資料的部分畫成虛線 EXTRAPOLATED；石碑與 ∎。 |

鏡頭撞擊（hits，秒／強度）：199.20/0.8、200.39/0.4、200.74/0.4、201.20/0.6、203.18/0.3、203.88/1.8

## chorus4

**THE BOARD · PARAMETERS** · `v_lb.ts` · {"n": 4} · 3:26.18–3:33.84（7.66 秒）

參數量的排行榜，過載的一輪。

背景城市的公式：`compute`、`chinchilla`、`params`、`scaling`（定義在 `app/eq.json`）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 3:26.18–3:28.16 | `state` | 0 | were state of the art, | 同 chorus 1，排行榜換成參數量（BIGGER IS BETTER?），過載的一輪。 |
| 3:28.16–3:29.29 | `dive` | 0.14 | now you’re just a | 最重的一次砸落。 |
| 3:29.29–3:30.17 | `floor` | 0 | baseline | BASELINE 洪水。 |
| 3:30.17–3:31.85 | `crane` | 0 | Top of the leaderboard, | 升回榜首：540B DENSE DECODER。 |
| 3:31.85–3:33.84 | `clock` | 0.3 | until the next deadline | 倒數歸零 DEADLINE。 |

鏡頭撞擊（hits，秒／強度）：208.22/3.2、208.60/0.7、208.83/0.7、209.13/0.7、209.32/2.7、212.90/1.8

## chorus4b

**PRESSURE** · `v_quad.ts` · 3:33.84–3:40.58（6.75 秒）

注意力矩陣在地上是一個方陣，每一拍 n 翻倍、面積翻四倍，直到衝出畫面；旁邊一個掃描頭以固定速度跑過一條線：O(n) 的繼任者還在訓練。

背景城市的公式：`quad`、`attention`、`linattn`、`ssm`、`causal`、`flash_io`（定義在 `app/eq.json`）

進場轉場：`zoom`（切點前 0.12 秒、切點後 0.3 秒）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 3:33.84–3:37.19 | `square` | 0 | And you, attention, quadratic in the length, | 地上的注意力方陣：每一拍 n 翻倍、n² 翻四倍（1,048,576 → 4,194,304 → 16,777,216 …），方陣衝出畫面；AND YOU, / ATTENTION, / QUADRATIC / IN THE LENGTH，左下角是 n 與 n² 的計數。 |
| 3:37.19–3:40.58 | `line` | 0.5 | a linear-time successor’s training up its strength | 旁邊一個掃描頭以固定速度沿一條細線跑：O(n)、固定大小的狀態，訓練 loss 下降、STRENGTH 條填滿；A LINEAR-TIME SUCCESSOR'S / TRAINING UP ITS STRENGTH。 |

鏡頭撞擊（hits，秒／強度）：215.64/1.0、216.09/1.0、216.54/1.0、216.99/1.0、217.24/0.4、218.72/0.3

## stop

**FOOTNOTE** · `v_stop.ts` · 3:40.58–3:48.23（7.64 秒）

音樂停下。四句宣言在黑暗中縮成上標，掉到底部變成註腳；一面長牆上，這部片唱過的每個名字像紀念碑一樣一塊塊亮起。

背景城市的公式：`perc_rule`、`svm_primal`、`lstm_c`、`attention`、`gan`、`ddpm_loss`、`resnet`、`dpo`、`scaling`（定義在 `app/eq.json`）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 3:40.58–3:44.07 | `dark` | 0 | Every “all you need” becomes a footnote in the end, | 音樂停：四句宣言在黑暗中短暫放大，接著縮成上標記號掉到畫面底部成為註腳；這句歌詞小小地寫在頂端。 |
| 3:44.07–3:48.23 | `wall` | 0.9 | cite me in related work, remember me, my friend | 一面長長的暗牆，這部片唱過的每個名字（PERCEPTRON 到 FLASHATTENTION）一塊塊像紀念碑亮起；CITE ME IN RELATED WORK / REMEMBER ME, MY FRIEND；最新的 ATTENTION · 2017 最後亮，游標在它後面閃。 |

## drop2

**THE FALL** · `v_fall.ts` · 3:48.23–4:01.71（13.48 秒）

最後一次排行榜，整部片的歷史疊成一座塔：PERCEPTRON 1958 在最底，SELF-ATTENTION · TRANSFORMER 2017 戴著王冠在最頂；一個空白的 ? ? ? 砸上塔頂，歌者的名牌掉下整段歷史，平躺在 BASELINE 上。

背景城市的公式：`attention`、`resnet`、`lstm_c`、`gan`、`convlayer`、`svm_primal`、`perc_rule`、`relu`（定義在 `app/eq.json`）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 3:48.23–3:53.40 | `climb` | 0 |  | drop：整部片的冠軍疊成一座塔（PERCEPTRON 1958 在底），鏡頭每一拍爬升一列，經過的列閃一下。 |
| 3:53.40–3:57.51 | `crown` | 0.6 | I was state of the art, | 塔頂：SELF-ATTENTION · TRANSFORMER 2017 戴著王冠、洋紅；I WAS / STATE OF THE ART。 |
| 3:57.51–3:59.23 | `fall` | 0.25 | now I’m just a baseline | 一個空白的 ? ? ? 砸上塔頂，歌者的名牌翻出塔外，掉過它曾經超越的每一列，鏡頭跟著墜落；NOW I'M JUST A。 |
| 3:59.23–4:01.71 | `land` | 0.3 |  | 名牌平躺在 BASELINE 上、PERCEPTRON 旁邊，洋紅從撞擊點擴散。 |

鏡頭撞擊（hits，秒／強度）：228.23/0.6、228.68/0.6、229.13/0.6、229.58/0.6、230.03/0.6、230.47/0.6、230.92/0.6、231.37/0.6、231.82/0.6、237.55/2.4、239.18/2.0

## tail

**ONE MORE TIME** · `v_tail.ts` · 4:01.71–4:07.20（5.49 秒）

名牌躺在 baseline 上，地面變回第一個鏡頭的藍圖；名字被印進標題欄的 RELATED WORK；繪圖機回來，在舊線旁邊畫一條新的，寫下 ONE MORE TIME。最後一格就是第一格。

背景城市的公式：`perc_rule`、`attention`、`scaling`、`clm`（定義在 `app/eq.json`）

進場轉場：`luma`（切點前 0.08 秒、切點後 0.6 秒）

| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |
| --- | --- | --- | --- | --- |
| 4:01.71–4:05.22 | `sheet` | 0 | Cite me in related work | 地面變回第一個鏡頭的藍圖網格，名牌被印進標題欄，鏡頭降下：CITE ME IN / RELATED WORK 寫在圖紙上。 |
| 4:05.22–4:07.20 | `pen` | 0.5 | one more time | 繪圖機回來，筆在舊線旁畫出一條新線，邊畫邊寫 ONE MORE TIME（整句在畫面中）；最後拉開淡出：一支筆、一條線、黑暗——和第一格一樣。 |

## 轉場（seams）

| 切點 | 從 → 到 | 種類 | 前 / 後（秒） |
| --- | --- | --- | --- |
| 0:16.05 | intro → v1sig | `zoom` | 0.22 / 0.32 |
| 0:23.45 | v1sig → v1feat | `whip` | 0.18 / 0.3 |
| 0:31.08 | v1feat → v1svm | `slice` | 0.1 / 0.3 |
| 0:53.64 | chorus1 → chorus1b | `push` | 0.06 / 0.4 |
| 1:00.53 | chorus1b → verse2a | `whip` | 0.2 / 0.34 |
| 1:15.06 | verse2a → verse2b | `whip` | 0.16 / 0.3 |
| 1:30.37 | verse2b → pre2 | `zoom` | 0.2 / 0.32 |
| 1:45.02 | chorus2 → chorus2b | `slice` | 0.1 / 0.3 |
| 2:13.72 | verse3a → verse3b | `push` | 0.06 / 0.25 |
| 2:43.28 | chorus3 → chorus3b | `slice` | 0.1 / 0.3 |
| 3:04.54 | bridgeA → bridgeB | `zoom` | 0.2 / 0.32 |
| 3:18.98 | bridgeB → pre4 | `whip` | 0.18 / 0.32 |
| 3:33.84 | chorus4 → chorus4b | `zoom` | 0.12 / 0.3 |
| 4:01.71 | drop2 → tail | `luma` | 0.08 / 0.6 |

其餘場景之間是設計好的「物件接力」硬切：SVM 的院子裂成 DEPTH 的豎井、預副歌結尾推進洋紅 ∎ 接副歌、drop 推進接 GAN、∇θ L 掉進地板接注意力磚、BERT 的勾選框接 RLHF。

## 全片的鏡頭撞擊（film camera）

除了各場景自己的 hits，全片還有一層相機：每個副歌的 BASELINE、HERO、GONE、COLLAPSED、FALL、EXPLODE 上的縮放撞擊與震波，副歌與 drop 每個大鼓上的 0.7% 縮放脈衝。共 172 個。

