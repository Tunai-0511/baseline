#!/usr/bin/env python3
"""Write docs/SHOTLIST.md: every plate and every camera shot of the film with its time, the words sung in it and what
is on screen. Times come from docs/data/structure.json (`bun scripts/render.ts dump` in app/), the descriptions from
this file. Run from the repo root: python3 docs/make_shotlist.py"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = json.load(open(os.path.join(ROOT, 'docs/data/structure.json')))

FILES = {
    'intro': 'v_intro', 'v1sig': 'v_sig', 'v1feat': 'v_feat', 'v1svm': 'v_svm', 'pre1': 'v_pre', 'chorus1': 'v_lb',
    'chorus1b': 'v_shelf', 'verse2a': 'v_seq1', 'verse2b': 'v_seq2', 'pre2': 'v_pre', 'chorus2': 'v_lb', 'chorus2b': 'v_gone',
    'verse3a': 'v_gen2', 'verse3b': 'v_eff2', 'pre3': 'v_pre', 'chorus3': 'v_lb', 'chorus3b': 'v_bert', 'bridgeA': 'v_align',
    'bridgeB': 'v_ctx', 'pre4': 'v_pre', 'chorus4': 'v_lb', 'chorus4b': 'v_quad', 'stop': 'v_stop', 'drop2': 'v_fall', 'tail': 'v_tail',
}

# plate → (title, one-line concept)
PLATES = {
    'intro': ('THE LINE', '一台繪圖機在黑暗裡畫下全片第一條線：y = 0，也就是 baseline。感知器在 XOR 上失敗，疊一層隱藏層才解開。'),
    'v1sig': ('SQUASH', '示波器工作台：sigmoid 把訊號壓扁，梯度往回穿過六層時每層乘上 ¼ 直到歸零；ReLU 一刀切掉負半邊，梯度原封不動地傳回來。'),
    'v1feat': ('CARVED / LEARNED', '銅版：手工雕出 HOG 行人與 SIFT 描述子；接著卷積核滑過版面，一面牆上 96 個 conv1 濾波器從雜訊中長出來，沒有人設計過它們。'),
    'v1svm': ('MARGIN', '一片繪圖紙般的院子：真的 SVM 擬合，決策邊界的街道撐到 2/‖w‖ = 3.29；核技巧把圓環抬進碗裡一刀切開；ImageNet 錯誤率長條被深度網路逐年壓下去。'),
    'pre1': ('THE CLAIM · DEPTH', '152 層的方形豎井，DEPTH 從井口往下擠出；鏡頭穿過寫著 IS · ALL · YOU 的樓層，NEED 在第 152 層等著；黑玻璃石碑砸下，雷射刻出 GUARANTEED ∎。'),
    'chorus1': ('THE BOARD · ILSVRC', '排行榜高塔：冠軍板上巨字 STATE OF THE ART；挑戰者砸上塔頂，舊冠軍名牌一路摔到底，地板被洋紅淹沒寫著 BASELINE；鏡頭火箭般升回榜首，倒數歸零 DEADLINE。'),
    'chorus1b': ('COLD STORAGE', '冷藏櫃：核方法與手工特徵各封在一格冰裡；FROZEN 結霜；王冠飛向旁邊的網路，鏡頭穿過它自己學到的 EDGES / TEXTURES / PARTS / CLASS。'),
    'verse2a': ('NIGHT LINE', '這首歌本身是一列夜車，每個唱到的字是一節車廂。n-gram 的框、RNN 的吊車、BPTT 的分岔（消失／爆炸）、LSTM 沿路的閘門，全部用真的模型數值。'),
    'verse2b': ('NIGHT LINE · LAST STOP', '真的 seq2seq 把這句歌詞壓過瓶頸再倒著吐出；注意力的光束回頭看；遞迴一個一個過閘門；Transformer 一次全部並行，鏡頭升空把夜車留在下面。'),
    'pre2': ('THE CLAIM · MEMORY', '一排 LSTM 細胞，每格 5 × 7 點陣寫一個字母：MEMORY\'S ALL YOU NEED，cell state 像鐵軌從上面劃過；石碑砸下刻 GUARANTEED。'),
    'chorus2': ('THE BOARD · WMT14', '同一座排行榜，換成機器翻譯 BLEU，砸得更重。'),
    'chorus2b': ('GONE', 'LSTM 細胞的圖一路展開到地平線，記憶沿著 cell state 跑了很久；一層注意力像玻璃板砸下，遞迴的迴圈一個個斷掉，細胞崩散：GONE。drop：鏡頭俯衝穿過六層注意力。'),
    'verse3a': ('THE LAB · GENERATIVE', 'GAN 的球場（25 個模態、生成分布的洋紅地形、崩成一根尖峰）、diffusion 從雜訊凝成字、RoPE 的指針隧道、LayerNorm/RMSNorm 的柱子與 ReLU→SwiGLU 的光管。'),
    'verse3b': ('THE LAB · EFFICIENCY', 'MoE 八座專家塔只醒兩座、INT4 位元牆在鼓點上剝落、LoRA 讓 W 結霜只補一片低秩、in-context 的提示緞帶與凍住的 θ，梯度掉進地板沒人接住。'),
    'pre3': ('THE CLAIM · ATTENTION', '四塊磚 ATTENTION\'S · ALL · YOU · NEED，磚之間的注意力弧線是用這首歌訓練的單層模型算出來的；石碑砸下。'),
    'chorus3': ('THE BOARD · LAMBADA', '冷的一輪：沒有碎片、沒有洪水，名牌被輕輕放下。'),
    'chorus3b': ('BOTH WAYS', 'BERT：一排玻璃 token，兩道光從兩端讀到 [MASK] 填上 STATE；注意力方陣；decoder-only 只看過去，三角形一路放大到 175B；BERT 縮成一個勾選框：OPTIONAL。'),
    'bridgeA': ('THE PLANT', 'RLHF 的獎勵模型掃描四個答案並排序；DPO 用吊車把中間人吊走，Z(x) 在兩邊相消；FlashAttention 的晶片把 S 分塊搬進 SRAM；通往 HBM 的路從紅色塞車變成綠色暢通。'),
    'bridgeB': ('THE TAPE', '這首歌自己的 token 鋪成一條磁帶，上下文視窗從 2K 翻倍到一百萬；乾草堆裡的針是第 0 個 token：PERCEPTRON；四塊宣言墓碑刻上日期；紀錄的樓梯一階比一階高，被超越的就成了虛線的 baseline。'),
    'pre4': ('THE CLAIM · SCALE', '對數座標上的冪律 loss ∝ C^−0.050，每唱一個字鏡頭就退後十倍，SCALE 一個字母比一個字母大十倍；超出資料的部分變成虛線：EXTRAPOLATED。'),
    'chorus4': ('THE BOARD · PARAMETERS', '參數量的排行榜，過載的一輪。'),
    'chorus4b': ('PRESSURE', '注意力矩陣在地上是一個方陣，每一拍 n 翻倍、面積翻四倍，直到衝出畫面；旁邊一個掃描頭以固定速度跑過一條線：O(n) 的繼任者還在訓練。'),
    'stop': ('FOOTNOTE', '音樂停下。四句宣言在黑暗中縮成上標，掉到底部變成註腳；一面長牆上，這部片唱過的每個名字像紀念碑一樣一塊塊亮起。'),
    'drop2': ('THE FALL', '最後一次排行榜，整部片的歷史疊成一座塔：PERCEPTRON 1958 在最底，SELF-ATTENTION · TRANSFORMER 2017 戴著王冠在最頂；一個空白的 ? ? ? 砸上塔頂，歌者的名牌掉下整段歷史，平躺在 BASELINE 上。'),
    'tail': ('ONE MORE TIME', '名牌躺在 baseline 上，地面變回第一個鏡頭的藍圖；名字被印進標題欄的 RELATED WORK；繪圖機回來，在舊線旁邊畫一條新的，寫下 ONE MORE TIME。最後一格就是第一格。'),
}

# shot descriptions: (plate, shot name) → what is on screen
SHOTS = {
    ('intro', 'pen'): '貼著繪圖筆的低角度特寫：筆尖從左到右畫出 y = 0，BASELINE 一個字母一個字母在線前方亮起。',
    ('intro', 'pullback'): '鏡頭拉開，筆畫出第二條軸 x₂，座標平面成形；左上角是圖框「THE LINE · DWG 00」。',
    ('intro', 'square'): '俯看單位正方形：四個布林輸入點落下，AND 與 OR 各被一筆切開；背牆浮現感知器的線路圖 x₁, x₂ → Σ → step → ŷ。',
    ('intro', 'diagram'): '推向背牆的感知器圖，更新規則 w ← w + η(y − ŷ)x 寫在下方（排版公式）。',
    ('intro', 'drew'): 'DREW A LINE, BUT 沿著第一次嘗試的線寫在地上，筆一次又一次重畫。',
    ('intro', 'xor'): '高空俯看：巨大的 XOR 躺在方塊後面顫抖，STAYED UNRESOLVED 與 EPOCH／ERRORS 計數印在前面。',
    ('intro', 'stack'): '第二層平面升起，圖長出 h₁ = OR、h₂ = NAND；STACK ANOTHER / HIDDEN LAYER 寫在隱藏層的前緣。',
    ('intro', 'solve'): '每個點被抬到 (h₁, h₂)，隱藏層上一刀分開；SOLVED ✓ 蓋章，XOR 帶在下層平面上著色。',
    ('v1sig', 'curve'): '轉移示波器正面：SIGMOID 在上方，σ(x) 曲線、工作點在曲線上滑動。',
    ('v1sig', 'bench'): '拉開看整個工作台：CH1 大正弦、σ 轉換、CH2 被壓進 (0, 1) 的窄帶；SQUASHED 被字面上壓扁。',
    ('v1sig', 'chain'): '沿著六層 sigmoid 鏈往左移動：梯度光球從 LOSS 往回跑，每過一層乘 ¼，∂L/∂x 從 1 掉到 0.00098；GRADIENTS / FADING 寫在光球經過處。',
    ('v1sig', 'zero'): '停在輸入端：DOWN TO 之後巨大的紅色 ZERO 砸下，× ¼ 標在每個單元上。',
    ('v1sig', 'relu'): '轉移曲線變成 max(0, x)：RELU 在上方，負半邊被一刀切掉。',
    ('v1sig', 'clip'): '剪下的負半波碎片掉落；CLIPPED THE NEGATIVES 寫在螢幕下緣，刀線切過 NEGATIVES 的下半部。',
    ('v1sig', 'hero-run'): '同一條鏈，這次每層 × 1：梯度以全強度跑回來，AND CAME IN AS THE 寫在路上。',
    ('v1sig', 'hero'): '光球抵達輸入端炸開放射線，HERO 巨字砸下。',
    ('v1feat', 'head'): '銅版上方：HAND-TUNED 先刻外框再填銅色，雕刻刀從行人的頭開始刻每個 8 × 8 格的方向直方圖。',
    ('v1feat', 'sift'): '移到左邊的 SIFT 描述子面板（4 × 4 × 8 = 128 維）：SIFT 與 AND 寫在面板上方。',
    ('v1feat', 'plate'): '拉回看整塊銅版：HOG 在右，EVERY FEATURE / CARVED BY HAND 寫在版下的銘牌上，手調的常數卡在一旁。',
    ('v1feat', 'conv'): '冷光接手：11 × 11 的卷積核在版面上滑動，前方的特徵圖逐列填滿；CONVOLUTION 寫在圖上，(I * K)(i, j) 的公式在下。',
    ('v1feat', 'wall'): '轉向濾波器牆：真實訓練過程的 45 個快照，96 個 conv1 濾波器從雜訊長成邊緣與色塊（洋紅雙色調）；LEARNED THE FILTERS 在牆頂。',
    ('v1feat', 'nobody'): '推近牆面（牆變暗讓字浮出）：THAT / NOBODY / PLANNED；底下是 STEP、EPOCH 與 TEST ACC 88.3%。',
    ('v1svm', 'yard'): '院子俯視：32 個真實樣本、背後圍籬上巨大的 SVM 與 hard-margin 的最佳化式。',
    ('v1svm', 'street'): '沿著決策邊界的街道：兩側圍籬向外撐開直到碰到三個支持向量，THE WIDEST MARGIN 寫在街上，2/‖w‖ 讀數在街口。',
    ('v1svm', 'bowl'): '繞著隔壁的碗：圓環被 φ(x) = (x₁, x₂, x₁² + x₂²) 抬起，一個水平面切開；KERNEL TRICK / AND ALL 與 φ、k(x, y) 的式子掛在碗上方。',
    ('v1svm', 'chart'): 'ImageNet top-5 錯誤率長條圖正面、靜止：DEEP NETS / ATE THE BENCHMARKS 在上方，2012–2015 的長條在 ATE、THE、BENCH-、-MARKS 上一根根被壓下去，底下標 ALEXNET、ZFNET、GOOGLENET、RESNET。',
    ('v1svm', 'fall'): '回到院子：AND THE MARGINS HAD TO，圍籬倒下揚起塵土，巨大的紅色 FALL 字母一個個翻落；最後院子打開成方形豎井，鏡頭轉向往下看。',
    ('pre1', 'mouth'): '從井口往下看：DEPTH 的外框沿著井壁往下擠出 28 層，牆上標著 8 / 19 / 22 / 152 層與年份。',
    ('pre1', 'dive'): '俯衝穿過豎井：樓層地板上寫著 IS、ALL、YOU，鏡頭一層層穿過。',
    ('pre1', 'floor'): '第 152 層的井底：NEED 巨字、THE ABSTRACT，黑玻璃石碑砸下，雷射逐字刻出 GUARANTEED，洋紅 ∎ 砸上；鏡頭最後推進 ∎ 直到整個畫面變成洋紅。',
    ('chorus1', 'state'): '從洋紅的 ∎ 拉開：冠軍板的 LED 面，YOU WERE（墨色）→ STATE OF THE ART 巨字；王冠在板頂。',
    ('chorus1', 'dive'): '挑戰者砸上塔頂、冠軍板碎裂；名牌往下掉，每唱一個字（NOW · YOU\'RE · JUST · A）就頓一下，鏡頭跟著俯衝。',
    ('chorus1', 'floor'): '名牌撞地：洋紅從撞擊點淹過地板，BASELINE 寫在上面（y = 0）。',
    ('chorus1', 'crane'): '鏡頭火箭般升回塔頂：TOP OF THE 跟著上升，停進榜首的標題板；LEADERBOARD 砸下，新冠軍在下面發光。',
    ('chorus1', 'clock'): '標題板變成倒數計時，在 DEADLINE 上歸零 00:00.00；UNTIL THE NEXT / DEADLINE 巨字。',
    ('chorus1b', 'dolly'): '冷藏櫃正面：十格冰塊裡封著 RBF、多項式核、SIFT、HOG、Haar、Gabor、LBP、詞袋、色彩直方圖、SURF；KERNEL TRICKS AND / HAND-MADE FEATURES 掛在兩排之間。',
    ('chorus1b', 'frost'): 'FROZEN 從玻璃上結霜蔓延，標籤跟著結霜消失；ON THE SHELF。',
    ('chorus1b', 'crown'): '王冠從櫃頂升起飛向右邊的網路；THE NETWORK TOOK THE CROWN 在網路上方。',
    ('chorus1b', 'layers'): '沿著網路的層往深處移動：第一層是真實的 conv1 濾波器（EDGES）、紋理、零件、類別；AND LEARNED、THE FEATURES 一組組寫在層上。',
    ('chorus1b', 'itself'): 'BY ITSELF 砸在網路上方，各層名稱淡出。',
    ('verse2a', 'window'): '夜車：每節車廂是一個唱到的字，唱到就亮；三節寬的 n-gram 龍門架沿著車滑動，上面是那三個字與它在這首歌裡的計數；N-GRAM COUNTING WORDS 在上空。',
    ('verse2a', 'crane'): 'RNN 吊車沿高架軌道移動，停在每節車廂上方讀它；吊車面板上 8 顆 LED 是真實 tanh RNN 的 hidden state；RNN KEPT A HIDDEN STATE / AND CARRIED IT INSIDE。',
    ('verse2a', 'fork'): '軌道在吊車後面分岔：一條上梯度範數一路掉到 10⁻²⁰（VANISH），另一條爬到 10⁶（EXPLODE，抖動）；OR 站在中間。',
    ('verse2a', 'gates'): '每節車廂旁立起 F / I / O 三支柵欄，由真實 LSTM 閘門值決定開合；cell state 是一條筆直的電線；LSTM 招牌與其下的 c_t 公式，PUT GATES ALONG THE ROAD。',
    ('verse2b', 'enc'): '這句歌詞的 12 節車廂開進漏斗（encoder）。',
    ('verse2b', 'neck'): '漏斗頸：整句被壓成一個發光的向量 c ∈ ℝ⁶⁴，BOTTLENECK 被字面上掐細。',
    ('verse2b', 'beams'): '解碼端倒著卸下車廂；從每節解碼車廂射回 encoder 的光束（真實 α 權重）；ATTENTION / LET THE DECODER。',
    ('verse2b', 'look'): '側面看光束：LOOK BACK 掛在光束上。',
    ('verse2b', 'map'): '俯看地上的注意力熱圖，反對角線（倒序翻譯）清楚可見；AND DOUBLE-CHECK 寫在熱圖旁。',
    ('verse2b', 'march'): '遞迴：車廂一拍一節通過旋轉門，招牌顯示 t = 1, 2, 3 …；RECURRENCE MARCHED IN ORDER / ONE STEP AT A TIME。',
    ('verse2b', 'parallel'): 'Transformer：所有車廂同時出現，兩兩之間連上弧線；TRANSFORMERS / RAN IN PARALLEL / AND LEFT IT ALL BEHIND；鏡頭升空把夜車留在下面。',
    ('pre2', 'words'): 'LSTM 細胞排成一列，點陣逐字寫出 MEMORY\'S（整個字在畫面中），唱到 ALL 時鏡頭滑到 ALL YOU NEED；cell state 的軌道與光點在上方。',
    ('pre2', 'pull'): '拉開看整排細胞與末端的石碑，THE ABSTRACT 在上方。',
    ('pre2', 'seal'): '石碑砸下、雷射刻 GUARANTEED、∎ 砸上；鏡頭推進 ∎ 接副歌。',
    ('chorus2', 'state'): '同 chorus 1，排行榜換成 WMT14 EN→DE · BLEU。',
    ('chorus2', 'dive'): '同 chorus 1，撞擊加重。',
    ('chorus2', 'floor'): '同 chorus 1：BASELINE 洪水。',
    ('chorus2', 'crane'): '同 chorus 1：升回榜首，新冠軍 TRANSFORMER (BIG) 28.4。',
    ('chorus2', 'clock'): '同 chorus 1：倒數歸零。',
    ('chorus2b', 'cell'): 'LSTM 細胞圖正面：上方 cell state 高速公路（× 遺忘、+ 輸入），下方 σ σ tanh σ 閘門；LSTM, / YOU HELD THE MEMORY。',
    ('chorus2b', 'horizon'): '鏡頭轉向地平線：細胞展開成一長串，一個記憶光點沿著公路一格格跑；FOR SO LONG 拉長排在公路上方。',
    ('chorus2b', 'slab'): '一層注意力像玻璃板砸在細胞上，板上刻著 Attention(Q, K, V) = softmax(QKᵀ/√dₖ)V；ONE ATTENTION LAYER / AND THE WHOLE RECURRENCE。',
    ('chorus2b', 'gone'): '遞迴的迴圈一個個斷開、細胞崩散，GONE 巨字字母緩緩漂開。',
    ('chorus2b', 'dive'): 'drop：玻璃板亮成一層注意力（token、所有配對的弧線、八個 head 隨鼓點閃），鏡頭往下俯衝穿過六層；地板上依序寫著 GONE、ALL PAIRS AT ONCE、NO RECURRENCE。',
    ('verse3a', 'court'): 'GAN 的球場：25 個目標模態是地上的光井，生成分布是洋紅地形，G 與 D 是兩端的紀念碑，後牆巨大的 MODES n/25；GANS PLAYED A / TWO-PLAYER GAME / UNTIL THE MODES。',
    ('verse3a', 'spike'): '地形折疊成一根尖峰，其他光井熄滅：COLLAPSED 砸下，震波環擴散。',
    ('verse3a', 'noise'): '每個字從一團有深度的雜訊凝聚成形（真實 DDPM 軌跡）：DIFFUSION、LEARNED、TO、DENOISE、IN、A；下方的 t 從 1000 數到 0。',
    ('verse3a', 'corridor'): '鏡頭飛進中間步驟組成的走廊（t = 1000 … 0 的每一格）：THOUSAND / TINY / STEPS 掛在前方。',
    ('verse3a', 'wall'): '正弦位置編碼的光牆（40 個位置 × 16 維），SINUSOIDS 在牆頂，PE 公式在下。',
    ('verse3a', 'tunnel'): '光牆倒下變成指針隧道：每一圈是一個位置 m，八組頻率的指針轉 m·θᵢ；GAVE WAY TO / ROPE\'S ROTATION 掛在隧道裡。',
    ('verse3a', 'columns'): '16 個殘差值是一排柱子：LayerNorm 把它們置中並縮放，RMSNorm 只縮放；LAYERNORM TO RMS。',
    ('verse3a', 'curve'): '活化函數是一條發光的管子：ReLU 彎成 Swish（最低 −0.278 在 x = −1.278）；RELU TO SWIGLU ACTIVATION。',
    ('verse3b', 'dense'): '512 顆光點的稠密方塊全部亮著：DENSE FFN · EVERY WEIGHT, EVERY TOKEN；DENSE BECAME。',
    ('verse3b', 'experts'): '方塊裂成弧形排列的八座專家塔，每唱一個字由真實的 top-2 router 選兩座點亮，其他六座 z z z；A MIXTURE / ONLY SOME / EXPERTS AWAKE。',
    ('verse3b', 'bits'): '位元牆（24 個權重 × 32 位元，第一列是真實 conv 權重的 fp32 符號／指數／尾數）：在兩個鼓點上低位元斷落 32 → 18 → 4；32 BITS / DOWN TO 4。',
    ('verse3b', 'gauge'): '記憶體條縮小 ×8，巨大的吞吐量儀表指針擺過去；FOR THE / THROUGHPUT\'S SAKE 在儀表上方。',
    ('verse3b', 'W'): 'W 是一面 24 × 24 的學習中格子牆：FULL FINE-TUNE / TO LORA，在 LORA 上結霜鎖住。',
    ('verse3b', 'patch'): 'B 與 A 兩片細長發光板滑入，乘積 ΔW（這句歌詞字形的 rank-8 重建）疊在 W 上；A LOW-RANK / LITTLE PATCH。',
    ('verse3b', 'context'): '地上的 few-shot 提示緞帶（STATE OF THE ART → BASELINE …，最後一列 ATTENTION → ? 被補成 BASELINE），右邊是凍住的 θ 方塊；THEN JUST PROMPT IT / IN CONTEXT。',
    ('verse3b', 'grad'): '∇θ L 從上方掉下、穿過地板，方塊上寫 NOT COMPUTED；NO GRADIENT / TO CATCH 掛在方塊上方；最後鏡頭跟著往下鑽。',
    ('pre3', 'bricks'): '四塊磚依序升起：ATTENTION\'S · ALL · YOU · NEED；ATTENTION\'S 內字母之間的注意力弧、磚與磚之間的因果注意力（用這首歌訓練的單層模型的權重），地上 4 × 4 注意力圖。',
    ('pre3', 'seal'): 'THE ABSTRACT，石碑砸下刻 GUARANTEED ∎，推進 ∎ 接副歌。',
    ('chorus3', 'state'): '同 chorus 1，排行榜換成 LAMBADA · ACCURACY，冷的一輪。',
    ('chorus3', 'dive'): '名牌下降但沒有碎片。',
    ('chorus3', 'floor'): '名牌被輕輕放在地上，沒有洪水。',
    ('chorus3', 'crane'): '升回榜首：175B DECODER · FEW-SHOT 86.4。',
    ('chorus3', 'clock'): '倒數歸零 DEADLINE。',
    ('chorus3b', 'row'): '一排玻璃 token：YOU WERE [MASK] OF THE ART；BERT 方塊在左，兩道光從兩端讀到中間把 [MASK] 填成 STATE；YOU READ BOTH WAYS 在上方。',
    ('chorus3b', 'square'): '俯看 token 下方的注意力方陣（每個 token 看所有 token）：MASKED AND BIDIRECTIONAL 寫在地上；接著上三角熄滅（只看過去），DECODER-ONLY 砸下。',
    ('chorus3b', 'scale'): '鏡頭高空後退：因果三角形一步步放大（117M → 1.5B → 175B 參數）鋪滿地面；SCALED UP。',
    ('chorus3b', 'optional'): 'BERT 的方塊縮成勾選框：[ ] BERT (OPTIONAL)；AND MADE YOU。',
    ('bridgeA', 'line'): '輸送帶上四個答案 A B C D 經過 REWARD MODEL 掃描器，各被蓋上擬合的 Bradley–Terry 分數（1.66、1.13、−0.41、−2.39）；RLHF / TRAINED A REWARD MODEL。',
    ('bridgeA', 'rank'): '答案依分數排序疊起：C ≻ A ≻ B ≻ D；TO RANK。',
    ('bridgeA', 'crane'): '吊車把獎勵模型直直吊離輸送帶（中間人）；DPO / SKIPPED THE MIDDLEMAN；偏好對直接接進策略 π_θ。',
    ('bridgeA', 'bank'): '金庫門與櫃台：r_w − r_l 的式子裡 β log Z(x) 兩邊相消被劃掉，Z(x) CANCELS；AND TOOK IT TO THE BANK。',
    ('bridgeA', 'die'): '俯看晶片：一個真實 attention head 的 64 × 64 分數矩陣切成 16 × 16 的塊，一塊塊搬進 SRAM，線上 softmax 的 (m, ℓ) 累積；S 從不寫回 HBM；FLASHATTENTION / TILES IT ALL / INSIDE THE SRAM。',
    ('bridgeA', 'road'): '通往 HBM 記憶體堆疊的路：標準注意力 4,325,376 次存取的紅色塞車，換成 FlashAttention 335,544 次（少 ×12.9）的綠色暢通；NO MORE ROUND TRIPS TO THE HBM / NO TRAFFIC JAM。',
    ('bridgeB', 'tape'): '這首歌自己的 BPE token 鋪成一條磁帶，視窗框從 2,048 翻倍九次到 1,048,576，鏡頭一路升高；CONTEXT WINDOW: 2K、THEN A MILLION TOKENS LONG。',
    ('bridgeB', 'needle'): '磁帶最遠端的乾草堆裡有一根針：token 0，PERCEPTRON 的 P（這部片唱的第一個字）；一道光從現在回到它；NEEDLE IN A HAYSTACK。',
    ('bridgeB', 'map'): '檢索地圖（上下文長度 × 針的深度）全部綠色；IT REMEMBERS EVERY SONG。',
    ('bridgeB', 'stones'): '四句宣言是一排黑玻璃墓碑，每塊刻著宣言與 GUARANTEED ∎，在 DATE 上刻出日期（1997-11-15、2015-12-10、2017-06-12、2020-01-23）；EVERY "ALL YOU NEED" / IS A PAPER / WITH A DATE 掛在碑上方。',
    ('bridgeB', 'late'): '時間軸上的紀錄樓梯：NOW 往右掃，每唱一個字就有一個宣言升起，一階比一階高（MEMORY → DEPTH → ATTENTION → SCALE）；被超越的變灰，頂端延伸成虛線的 BASELINE；在 LATE 上一個未命名的 ? ? ? 升得比 SCALE 還高；時鐘在 NOW 頂端快轉。',
    ('pre4', 'stairs'): '對數—對數平面上的冪律線，每唱一個字鏡頭退後一個數量級，SCALE 的每個字母都比上一個大十倍；超出資料的部分畫成虛線 EXTRAPOLATED；石碑與 ∎。',
    ('chorus4', 'state'): '同 chorus 1，排行榜換成參數量（BIGGER IS BETTER?），過載的一輪。',
    ('chorus4', 'dive'): '最重的一次砸落。',
    ('chorus4', 'floor'): 'BASELINE 洪水。',
    ('chorus4', 'crane'): '升回榜首：540B DENSE DECODER。',
    ('chorus4', 'clock'): '倒數歸零 DEADLINE。',
    ('chorus4b', 'square'): '地上的注意力方陣：每一拍 n 翻倍、n² 翻四倍（1,048,576 → 4,194,304 → 16,777,216 …），方陣衝出畫面；AND YOU, / ATTENTION, / QUADRATIC / IN THE LENGTH，左下角是 n 與 n² 的計數。',
    ('chorus4b', 'line'): '旁邊一個掃描頭以固定速度沿一條細線跑：O(n)、固定大小的狀態，訓練 loss 下降、STRENGTH 條填滿；A LINEAR-TIME SUCCESSOR\'S / TRAINING UP ITS STRENGTH。',
    ('stop', 'dark'): '音樂停：四句宣言在黑暗中短暫放大，接著縮成上標記號掉到畫面底部成為註腳；這句歌詞小小地寫在頂端。',
    ('stop', 'wall'): '一面長長的暗牆，這部片唱過的每個名字（PERCEPTRON 到 FLASHATTENTION）一塊塊像紀念碑亮起；CITE ME IN RELATED WORK / REMEMBER ME, MY FRIEND；最新的 ATTENTION · 2017 最後亮，游標在它後面閃。',
    ('drop2', 'climb'): 'drop：整部片的冠軍疊成一座塔（PERCEPTRON 1958 在底），鏡頭每一拍爬升一列，經過的列閃一下。',
    ('drop2', 'crown'): '塔頂：SELF-ATTENTION · TRANSFORMER 2017 戴著王冠、洋紅；I WAS / STATE OF THE ART。',
    ('drop2', 'fall'): '一個空白的 ? ? ? 砸上塔頂，歌者的名牌翻出塔外，掉過它曾經超越的每一列，鏡頭跟著墜落；NOW I\'M JUST A。',
    ('drop2', 'land'): '名牌平躺在 BASELINE 上、PERCEPTRON 旁邊，洋紅從撞擊點擴散。',
    ('tail', 'sheet'): '地面變回第一個鏡頭的藍圖網格，名牌被印進標題欄，鏡頭降下：CITE ME IN / RELATED WORK 寫在圖紙上。',
    ('tail', 'pen'): '繪圖機回來，筆在舊線旁畫出一條新線，邊畫邊寫 ONE MORE TIME（整句在畫面中）；最後拉開淡出：一支筆、一條線、黑暗——和第一格一樣。',
}

def tc(t):
    m = int(t // 60); s = t - 60 * m
    return f'{m}:{s:05.2f}'

lines = []
P = lines.append
P('# 分鏡表（每個鏡頭）')
P('')
P('全片 4:07.20、60 fps、14,832 格。25 個場景（plate）、118 個鏡頭（camera shot）、14 個場景間轉場（seam）。')
P('時間取自引擎本身（`bun scripts/render.ts dump` → `docs/data/structure.json`），由 `python3 docs/make_shotlist.py` 產生這份文件；')
P('每格畫面都是歌曲時間的純函數，所以下表的時間就是成片的時間。每秒一格的縮圖在 [`docs/frames/`](frames/)。')
P('')
P('欄位：**時間**＝鏡頭開始到下一個鏡頭（或場景結束）；**鏡頭**＝程式裡 Rig 的鏡頭名；**唱到的字**＝這段時間裡開始唱的字。')
P('「snap」是從上一個鏡頭平滑接過來的秒數（0 = 硬切）。')
P('')
seams = {(s['a'], s['b']): s for s in D['seams']}
words = [(w[0], w[1], w[2]) for l in D['lyrics'] for w in l['words']]
P('## 目錄')
P('')
for e in D['entries']:
    title = PLATES[e['id']][0]
    P(f"- [{tc(e['start'])} {e['id']} · {title}](#{e['id'].lower()})")
P('')
ents = D['entries']
for k, e in enumerate(ents):
    title, concept = PLATES[e['id']]
    P(f"## {e['id']}")
    P('')
    P(f"**{title}** · `{FILES[e['id']]}.ts`{(' · ' + json.dumps(e['params'])) if e['params'] else ''} · {tc(e['start'])}–{tc(e['end'])}（{e['end'] - e['start']:.2f} 秒）")
    P('')
    P(concept)
    P('')
    if e['formulas']:
        P('背景城市的公式：' + '、'.join(f'`{f}`' for f in e['formulas']) + '（定義在 `app/eq.json`）')
        P('')
    if k > 0 and (ents[k - 1]['id'], e['id']) in seams:
        s = seams[(ents[k - 1]['id'], e['id'])]
        P(f"進場轉場：`{s['kind']}`（切點前 {s['pre']} 秒、切點後 {s['post']} 秒）")
        P('')
    P('| 時間 | 鏡頭 | snap | 唱到的字 | 畫面 |')
    P('| --- | --- | --- | --- | --- |')
    shots = e['shots']
    for i, s in enumerate(shots):
        t0 = s['t0']; t1 = shots[i + 1]['t0'] if i + 1 < len(shots) else e['end']
        sung = ' '.join(w for (w, a, b) in words if t0 <= a < t1)
        desc = SHOTS.get((e['id'], s['name']), '')
        P(f"| {tc(t0)}–{tc(t1)} | `{s['name']}` | {s['snap']} | {sung} | {desc} |")
    P('')
    hits = [h for h in e['hits']]
    if hits:
        P('鏡頭撞擊（hits，秒／強度）：' + '、'.join(f"{h['t']:.2f}/{h['amp']:.1f}" for h in hits))
        P('')
P('## 轉場（seams）')
P('')
P('| 切點 | 從 → 到 | 種類 | 前 / 後（秒） |')
P('| --- | --- | --- | --- |')
for s in D['seams']:
    P(f"| {tc(s['at'])} | {s['a']} → {s['b']} | `{s['kind']}` | {s['pre']} / {s['post']} |")
P('')
P('其餘場景之間是設計好的「物件接力」硬切：SVM 的院子裂成 DEPTH 的豎井、預副歌結尾推進洋紅 ∎ 接副歌、drop 推進接 GAN、∇θ L 掉進地板接注意力磚、BERT 的勾選框接 RLHF。')
P('')
P('## 全片的鏡頭撞擊（film camera）')
P('')
P('除了各場景自己的 hits，全片還有一層相機：每個副歌的 BASELINE、HERO、GONE、COLLAPSED、FALL、EXPLODE 上的縮放撞擊與震波，副歌與 drop 每個大鼓上的 0.7% 縮放脈衝。共 '
  f"{len(D['filmHits'])} 個。")
P('')
open(os.path.join(ROOT, 'docs/SHOTLIST.md'), 'w').write('\n'.join(lines) + '\n')
missing = [(e['id'], s['name']) for e in ents for s in e['shots'] if (e['id'], s['name']) not in SHOTS]
print('docs/SHOTLIST.md written;', len(missing), 'shots without description', missing[:10])
