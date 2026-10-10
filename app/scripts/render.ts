#!/usr/bin/env bun
// Offline renderer. Drives the app in headless Chrome (?export=1) and either
//   stills:  bun scripts/render.ts stills --t 1.5,23,40.2 [--only id1,id2] [--out dir]
//   sheet:   bun scripts/render.ts sheet --from 20 --to 35 [--n 12] [--cols 4] [--tw 480] [--only ids] [--out file.png]   (or --times a,b,c | --cuts)
//   plates:  bun scripts/render.ts plates   (renders one representative JPEG per plate into public/plates/ (used by the outro's rewind), times from plates.json or entry midpoints)
//   perf:    bun scripts/render.ts perf --from 20 --to 25 [--only ids] [--samples 1] [--shutter 0.5]   (avg ms per frame incl. GPU sync and the export's pixel readback)
//            perf --engine-only --from t: the engine's own cost at t (post pass with the v3 grade vs the Phase 0 tone, GPU-synced; the cut-aware shutter's CPU)
//   video:   bun scripts/render.ts video [--from 0] [--to 156.65] [--fps 60] [--crf 16] [--x264 aq-mode=3] [--samples 1] [--shutter 0.5] [--out ../out/baseline.mp4] [--noaudio]
//            [--workers 2] [--chunk 8] [--mem-gb 1] [--spool-gb 20]
//            --samples N averages N sub-frames per frame over shutter×(1/fps): motion blur + temporal AA;
//            --samples auto picks the count per 32x32 tile (12, 36, 108 or 324, see Engine.render; --refine frame: per frame)
//            --workers N headless Chromes render chunks of --chunk frames into one ffmpeg, in order (see video())
//   lyricqa: bun scripts/render.ts lyricqa --from 45.8 --to 61 [--step 0.0833] [--out dir] [--label name] [--no-sheet]
//            (or --scene file alone: the range is the registered carriers' windows; --scene with --from/--to clips it
//            to that range, e.g. to keep a test scene's edge carriers from pulling in neighbouring lines). Samples every word of
//            data/lyrics.json whose window [start − 0.10, end + 0.25] overlaps the range and runs src/engine/lyricqa.ts
//            in-page (TREATMENT §7.4/§7.5): table + JSON + an annotated sheet in --out (default out/qa). Exit 1 on fails.
//   seam:    bun scripts/render.ts seam --cut H02 [--t 45.812] [--out dir]: frames t_cut − 1/60 | t_cut + 0.001 of the
//            registered seam objects (lyricReg.handoff) → screen-rect delta at the cut instant (< 2 px; each frame moved
//            to t_cut by its own screen velocity), screen velocity on both sides, rects vs the record's out/in rigs;
//            kind 'exit-enter' passes on opposite edges + equal screen speed; the delta to the _handoff.ts record rect,
//            and a side-by-side image (OUT | IN | 50/50). Exit 1 unless it passes.
//   colorstat: bun scripts/render.ts colorstat --from 45.8 --to 61 [--n 12 | --step 0.5 | --times a,b] [--out dir]
//            (or --dir <stills dir> without rendering; or --video <mp4> --vt0 <song time of its frame 0> [--vfps 60]:
//            the frames of an encoded video at those times, decoded BT.709): stills + scripts/colorstat.py (magenta /
//            bone coverage, pink haze, and the p1v3 display targets: mean display luma per shot ≥ 0.20 and per section
//            0.24–0.34, p2 ≤ 0.02, p99 ≥ 0.85, grey-veil murk ≤ 20 %, magenta in ≥ 60 % of the frames with the SOTA machine
//            on screen). The manifest gets each frame's shot (entry@last cut, from the plates' reported cuts) and `sota`
//            (a lamp that holds the SOTA at t, visible and projected inside the frame ± 15 %). Exit 1 on a gate.
//   cutqa:   bun scripts/render.ts cutqa --from 38.9 --to 61 [--fps 60] [--shutter 0.5] [--samples auto] [--ab] [--relearn]
//            [--out dir]: every hard cut in the range (timeline boundaries, Scene.cutTimes, cuts the plates report) and
//            the frames whose shutter would reach across it: each frame B (multi-sample) is compared with single-sample
//            frames of its own shot S (at t) and of the other shot O (just across the cut); ghost α = least-squares
//            weight of O − S in B − S (0 = clean, 0.5 = a half-and-half double image). --ab also renders the old
//            symmetric shutter. Sheet O | B(old) | B | S per frame. Exit 1 unless every frame's sampled shutter lies on
//            its own side of the cut and every frame the old shutter reached across has α < 0.05. --relearn makes the
//            engine forget the reported cuts before each frame (it must learn the cut while sampling and re-sample).
//   lint | assets.lint: bun scripts/render.ts lint [--json f]  (= bun scripts/lint.ts: R1/R2/R3 sources reachable from
//            the timeline)
//   gates:   bun scripts/render.ts gates --from 53.5 --to 57 | --shots C3[,C4] [--fast] [--out dir] [--samples N|auto]
//            [--no-cutqa] [--no-seam] [--no-perf] | --video <mp4> --vt0 <song t of frame 0>: the p1v4 GATE RUNNER (KITS §22),
//            the director's measurements in one command. Renders every frame of the window (60 fps; --fast 30 fps and
//            half-res analysis), streams the pixels + the page's per-frame lyric geometry (lyricqa rules, lyricqa.gateFrame:
//            faces with their sung state, labels, depth bands) into scripts/gates.py: LIGHT (luma, p2, murk, top-5 % share,
//            Canny edges, a*/b* of neutrals, repeated light pools, key pool, readable labels, pink haze, magenta), FLIGHT
//            (DIS optical flow as flow.py: chorus median, ≥ 0.6 share, a whip per bar, static runs, foreground wipes),
//            LYRICS (lyricqa, word speed, cap at onset, earlier lines ash + soft, unsung unreadable), IMPACTS (camera peak,
//            surge / brownout, white-out, flat white flecks), CUTS (handoff rhyme, cutqa, seams), PERF (+ zz_look2 ratio).
//            Table per shot + gates.json + gates_worst.png (worst frames) + gates_impacts.png. Exit 1 unless all pass.
//            Default out: out/wip/p1v4/gates/<label>. Thresholds: scripts/gates.json.
//   --scene file [--sp '{"n":1}'] (all modes): play only scenes/<file>.ts over the whole song (kit tests, plates off the edit)
//   --post '{"grade":0}' (all modes): post overrides over everything (Engine.postOverride), e.g. the Phase 0 tone for an A/B
//   --no-cut-aware (all modes): the old symmetric shutter across cuts (A/B only)
//   --scale N (all modes): render at N× the 1920x1080 layout (--scale 2 = true 3840x2160); stills are then saved
//            full-res from the pixel buffer, videos are encoded at the physical size.
// Uses the Vite dev server at --url (default http://localhost:5173); starts a private one if unreachable.
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const mode = argv[0] ?? 'stills';
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k: string) => argv.includes(`--${k}`);
const APP = path.resolve(import.meta.dir, '..');
const SCALE = Math.max(1, Math.round(+opt('scale', '1')!));
const OW = 1920 * SCALE, OH = 1080 * SCALE; // output size
// --samples N (fixed) or --samples auto [--min-samples 4] [--max-samples 324] [--tol 3] [--refine tiles|frame]
// (adaptive, see Engine.render)
const SAMPLES = opt('samples', '1') === 'auto'
  ? { min: +opt('min-samples', '4')!, max: +opt('max-samples', '324')!, tol: +opt('tol', '3')!, refine: opt('refine', 'tiles') as 'tiles' | 'frame' }
  : +opt('samples', '1')!;
const hist = (h: Record<string, number>) => Object.entries(h).sort((a, b) => +a[0] - +b[0]).map(([k, v]) => `${k}:${v}`).join(' ');
const ROOT = path.resolve(APP, '..');

async function reachable(url: string) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; }
}

async function ensureServer(): Promise<{ url: string; stop: () => void }> {
  const url = opt('url', 'http://localhost:5173')!;
  if (await reachable(url)) return { url, stop: () => {} };
  const port = 5300 + Math.floor(Math.random() * 500);
  // no live reload: a file saved mid-render must not reload the page
  const proc = Bun.spawn(['bunx', 'vite', '--port', String(port), '--strictPort'], { cwd: APP, stdout: 'ignore', stderr: 'ignore', env: { ...process.env, MV_NO_HMR: '1' } });
  const u = `http://localhost:${port}`;
  for (let i = 0; i < 100 && !(await reachable(u)); i++) await Bun.sleep(100);
  return { url: u, stop: () => proc.kill() };
}

async function openPage(url: string, over: { scene?: string | null; sp?: string | null; only?: string | null } = {}) {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: !flag('headed'),
    args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const logs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  // (gates: a second page for the zz_look2 perf reference passes its own scene; undefined = the command line's)
  const pick = (k: 'scene' | 'sp' | 'only') => (over[k] !== undefined ? over[k] ?? undefined : opt(k));
  const only = pick('only'), solo = pick('scene'), sp = pick('sp');
  await page.goto(`${url}/?export=1${only ? `&only=${only}` : ''}${solo ? `&scene=${encodeURIComponent(solo)}` : ''}${sp ? `&sp=${encodeURIComponent(sp)}` : ''}${SCALE !== 1 ? `&scale=${SCALE}` : ''}`);
  await page.waitForFunction(() => (window as any).__mv?.ready || (window as any).__mv?.error, null, { timeout: 120000 });
  const err = await page.evaluate(() => (window as any).__mv.error);
  if (err) throw new Error(`app failed to boot:\n${err}\n${logs.join('\n')}`);
  const size: [number, number] = await page.evaluate(() => [(window as any).__mv.width ?? 1920, (window as any).__mv.height ?? 1080]);
  if (size[0] !== OW || size[1] !== OH) throw new Error(`app renders ${size[0]}x${size[1]}, expected ${OW}x${OH} (--scale ${SCALE})`);
  const post = opt('post');
  if (post || flag('no-cut-aware')) await page.evaluate(([p, ca]) => { const e = (window as any).__mv.engine; if (p) e.postOverride = JSON.parse(p); e.cutAware = ca; }, [post ?? '', !flag('no-cut-aware')] as const);
  const sceneErrors: string[] = await page.evaluate(() => (window as any).__mv.errors);
  if (sceneErrors.length) console.error('SCENE ERRORS:\n' + sceneErrors.join('\n'));
  return { browser, page, logs };
}

async function stills(page: Page, times: number[], outDir: string) {
  mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  for (const t of times) {
    const k: number = await page.evaluate(([t, s, sh]) => (window as any).__mv.still(t, s, sh), [t, SAMPLES, +opt('shutter', '0.5')!] as const);
    const f = path.join(outDir, `f_${t.toFixed(2).padStart(7, '0')}.png`);
    if (typeof SAMPLES !== 'number') console.log(`t=${t}: ${k} sub-frames`);
    // at scale > 1 the canvas is shown downscaled on the page: save the full-res pixel buffer instead
    if (SCALE !== 1) await Bun.write(f, Buffer.from(await page.evaluate(() => (window as any).__mv.png()), 'base64'));
    else await page.screenshot({ path: f, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    files.push(f);
  }
  return files;
}

async function sheet(page: Page, times: number[], cols: number, out: string, tw = 480) {
  const dataUrl: string = await page.evaluate(async ({ times, cols, tw }) => {
    const P = (window as any).__mv;
    const cw = tw, ch = Math.round(tw * 9 / 16), pad = 4, lab = 18;
    const rows = Math.ceil(times.length / cols);
    const cv = document.createElement('canvas');
    cv.width = cols * (cw + pad) + pad; cv.height = rows * (ch + lab + pad) + pad;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#222'; c.fillRect(0, 0, cv.width, cv.height);
    const src = document.getElementById('c') as HTMLCanvasElement;
    times.forEach((t: number, i: number) => {
      P.still(t);
      const x = pad + (i % cols) * (cw + pad), y = pad + Math.floor(i / cols) * (ch + lab + pad);
      c.drawImage(src, x, y + lab, cw, ch);
      c.fillStyle = '#ddd'; c.font = '13px monospace'; c.fillText(`${t.toFixed(2)}s`, x + 2, y + 13);
    });
    return cv.toDataURL('image/png');
  }, { times, cols, tw });
  mkdirSync(path.dirname(out), { recursive: true });
  await Bun.write(out, Buffer.from(dataUrl.split(',')[1]!, 'base64'));
}

/**
 * Render [from, to) into one encoder. `--workers N` headless Chromes (default 2; each its own GPU process)
 * take chunks of `--chunk` frames in order; the server puts their frames back in order and writes them to a
 * single ffmpeg, so the file is the same as with one worker. A frame is acknowledged once it is written or
 * waiting in a bounded reorder buffer, and each page keeps at most a few frames unacknowledged, so memory stays
 * bounded at 4K. One worker already keeps the GPU busy in the heavy scenes; a second one fills the gaps in the
 * light ones (2D drawing, readback, transfer).
 */
async function video(url: string, from: number, to: number, fps: number, out: string) {
  mkdirSync(path.dirname(out), { recursive: true });
  const crf = opt('crf', '16')!;
  const audio = path.join(ROOT, 'audio/baseline.wav');
  // (frames come as rgb24: the same YUV out of the scaler as from rgba, a quarter fewer bytes to move)
  const args = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${OW}x${OH}`, '-r', String(fps), '-i', 'pipe:0'];
  if (!flag('noaudio')) args.push('-ss', String(from), '-t', String(to - from), '-i', audio);
  // Frames are sRGB (toSRGB in the final pass): convert with the BT.709 matrix and tag the stream,
  // otherwise ffmpeg converts with BT.601 while players and YouTube decode untagged HD as BT.709.
  // scale tags the range only (ffmpeg 4.4 leaves the matrix 'unknown'); primaries, transfer AND the matrix need setparams
  // (the -color_* output flags don't reach the stream). (slice v3 final render: colorspace=bt709 added; pixels unchanged)
  args.push('-vf', 'vflip,scale=out_color_matrix=bt709,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709', '-c:v', 'libx264', '-preset', opt('preset', 'slow')!, '-crf', crf, '-pix_fmt', 'yuv420p', '-tune', 'grain', '-x264-params', opt('x264', 'aq-mode=3')!);
  if (!flag('noaudio')) args.push('-c:a', 'aac', '-b:a', '320k', '-shortest');
  args.push('-movflags', '+faststart', out);
  const ff = Bun.spawn(args, { stdin: 'pipe', stdout: 'inherit', stderr: 'inherit' });

  const f0 = Math.round(from * fps), f1 = Math.round(to * fps), total = f1 - f0;
  const chunk = Math.max(1, +opt('chunk', '8')!);
  const workers = Math.max(1, Math.min(+opt('workers', '2')!, Math.ceil(total / chunk)));
  // reorder buffer: frames waiting for an earlier one or for the encoder, acknowledged while under ~1 GB in
  // memory; past that they go to a spool on disk (up to --spool-gb, default 20), so the renderers never wait
  // for x264 in the light scenes and x264 catches up in the heavy ones, where the CPU is free
  const frameBytes = OW * OH * 3;
  const cap = Math.max(4, Math.floor((+opt('mem-gb', '1')! * 1e9) / frameBytes));
  const spoolCap = Math.floor((+opt('spool-gb', '20')! * 1e9) / frameBytes);
  const spoolDir = path.join(tmpdir(), `baseline-spool-${process.pid}`);
  mkdirSync(spoolDir, { recursive: true });
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { ff.kill(9); rmSync(spoolDir, { recursive: true, force: true }); process.exit(130); });
  const spooled = new Set<number>();
  let spoolPeak = 0;
  const spoolFile = (n: number) => path.join(spoolDir, `${n}.rgb`);
  const toSpool = (n: number, buf: Uint8Array) => {
    // (written synchronously: the frame must be on disk before drain() looks for it)
    writeFileSync(spoolFile(n), buf);
    spooled.add(n);
    spoolPeak = Math.max(spoolPeak, spooled.size);
  };
  const waiting = new Map<number, Uint8Array>();
  const owed = new Map<number, number>(); // frames in memory over the cap, not yet acknowledged -> their worker
  const queue: number[][] = Array.from({ length: workers }, () => []); // frame numbers each worker will send, in order
  const sockets: any[] = [];
  const ackCount = new Array(workers).fill(0);
  const ack = (k: number) => { ackCount[k]++; sockets[k]?.send(String(ackCount[k])); };
  let next = f0, written = 0, cursor = f0, ending = false;

  // any failure stops the render: closing the sockets makes every page's stream() throw
  let failure: Error | null = null, rejectFailed!: (e: Error) => void, resolveWritten!: () => void;
  const failed = new Promise<never>((_, rej) => { rejectFailed = rej; });
  failed.catch(() => {});
  const allWritten = new Promise<void>((res) => { resolveWritten = res; });
  const fail = (e: unknown) => {
    if (failure) return;
    failure = e instanceof Error ? e : new Error(String(e));
    for (const ws of sockets) ws?.close();
    rejectFailed(failure);
  };
  void ff.exited.then((code) => { if (!ending) fail(new Error(`ffmpeg exited early (code ${code})`)); });

  const t0 = performance.now();
  let draining = false;
  const drain = async () => {
    if (draining || failure) return;
    draining = true;
    try {
      while (!failure && (waiting.has(next) || spooled.has(next))) {
        let buf = waiting.get(next);
        if (buf) waiting.delete(next);
        else {
          buf = await Bun.file(spoolFile(next)).bytes();
          spooled.delete(next);
          rmSync(spoolFile(next));
        }
        ff.stdin.write(buf);
        await ff.stdin.flush();
        // a frame written is acknowledged if it was not yet; then the oldest owed while there is room
        const k = owed.get(next);
        if (k !== undefined) { owed.delete(next); ack(k); }
        next++; written++;
        for (const [m, kk] of owed) {
          if (waiting.size > cap) {
            if (spooled.size >= spoolCap) break;
            toSpool(m, waiting.get(m)!);
            waiting.delete(m);
          }
          owed.delete(m);
          ack(kk);
        }
        if (written % 60 === 0 || written === total) {
          const el = (performance.now() - t0) / 1000;
          process.stdout.write(`\r${written}/${total} frames  ${(written / el).toFixed(1)} fps  eta ${((total - written) / (written / el)).toFixed(0)}s   `);
        }
        if (written === total) resolveWritten();
      }
    } catch (e) { fail(e); } finally { draining = false; }
  };
  const server = Bun.serve<{ k: number }>({
    port: 0,
    fetch(req, srv) { return srv.upgrade(req, { data: { k: +(new URL(req.url).searchParams.get('w') ?? 0) } }) ? undefined : new Response('ws only', { status: 400 }); },
    websocket: {
      maxPayloadLength: Math.max(64 * 1024 * 1024, OW * OH * 3 + 1024),
      open(ws) { sockets[ws.data.k] = ws; if (failure) ws.close(); },
      message(ws, msg) {
        if (failure) return;
        try {
          const k = ws.data.k, n = queue[k]!.shift(), buf = msg as Uint8Array;
          if (n === undefined) throw new Error(`worker ${k} sent a frame it was not given`);
          if (buf.length !== frameBytes) throw new Error(`worker ${k} sent ${buf.length} bytes for frame ${n}`);
          if (waiting.size < cap || n === next) { waiting.set(n, buf); ack(k); }
          else if (spooled.size < spoolCap) { toSpool(n, buf); ack(k); }
          else { waiting.set(n, buf); owed.set(n, k); }
          void drain();
        } catch (e) { fail(e); }
      },
    },
  });
  // chunks in order from a shared cursor
  const take = () => { if (cursor >= f1) return null; const a = cursor; cursor = Math.min(f1, a + chunk); return [a, cursor] as const; };
  const pages: Awaited<ReturnType<typeof openPage>>[] = [];
  const used: Record<string, number> = {};
  const closePages = async () => {
    for (const p of pages.splice(0)) {
      if (p.logs.length) console.error('BROWSER LOG:\n' + p.logs.slice(0, 40).join('\n'));
      await p.browser.close().catch(() => {});
    }
  };
  let ok = false;
  try {
    const opened = await Promise.allSettled(Array.from({ length: workers }, () => openPage(url)));
    for (const o of opened) if (o.status === 'fulfilled') pages.push(o.value);
    for (const o of opened) if (o.status === 'rejected') throw o.reason;
    const rendering = Promise.all(pages.map(async ({ page }, k) => {
      for (let r = take(); r && !failure; r = take()) {
        for (let n = r[0]; n < r[1]; n++) queue[k]!.push(n);
        const h: Record<string, number> = await page.evaluate((o) => (window as any).__mv.stream(o), {
          from: r[0] / fps, to: r[1] / fps, fps, ws: `ws://localhost:${server.port}/?w=${k}`, samples: SAMPLES, shutter: +opt('shutter', '0.5')!, inflight: 4,
        });
        for (const [c, m] of Object.entries(h)) used[c] = (used[c] ?? 0) + m;
      }
    }));
    rendering.catch(() => {});
    // (a page error stops the render; a failure on this side stops waiting for the pages)
    await Promise.race([rendering, failed]).catch((e) => { fail(e); throw failure; });
    await Promise.race([allWritten, failed]);
    await closePages();
    ending = true;
    ff.stdin.end();
    const code = await ff.exited;
    if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
    ok = true;
  } finally {
    ending = true;
    // (killed, ffmpeg leaves an unplayable file rather than a finished-looking truncated one)
    if (!ok) ff.kill(9);
    await closePages();
    server.stop(true);
    rmSync(spoolDir, { recursive: true, force: true });
  }
  console.log(`\nwrote ${out} (${written} frames in ${((performance.now() - t0) / 1000).toFixed(1)}s, ${workers} workers${spoolPeak ? `, up to ${spoolPeak} frames spooled to disk` : ''})`);
  console.log(`sub-frames per frame (count:frames): ${hist(used)}`);
}

// ================================================================ QA modes (TREATMENT §D.1 0.9): lyricqa, seam, colorstat

const QA_OUT = path.join(ROOT, 'out/qa');
const PY = path.join(ROOT, 'tools/.venv/bin/python');
/**
 * The edit's sections (TREATMENT §12) and their p1v3 display-luma targets (mean Y' of the sRGB frame per section; they
 * replace the §5.6 linear APL table): [0.24, 0.34] everywhere, pre4 the brightest (§5.6 keeps it the film's peak) and
 * the blackout sections `dark` (intro's first lamp, the stop, the tail: exempt from the shot and frame gates).
 */
const LUMA: [number, number] = [0.24, 0.34];
const SECTIONS: { name: string; start: number; end: number; luma: [number, number]; dark?: boolean }[] = [
  { name: 'intro', start: 0, end: 9.405, luma: [0.02, 0.2], dark: true }, { name: 'verse1', start: 9.405, end: 38.908, luma: LUMA },
  { name: 'pre1', start: 38.908, end: 45.812, luma: LUMA }, { name: 'chorus1', start: 45.812, end: 60.995, luma: LUMA },
  { name: 'verse2', start: 60.995, end: 90.371, luma: LUMA }, { name: 'pre2', start: 90.371, end: 97.239, luma: LUMA },
  { name: 'chorus2', start: 97.239, end: 112.335, luma: LUMA }, { name: 'drop1', start: 112.335, end: 119.641, luma: LUMA },
  { name: 'verse3', start: 119.641, end: 148.316, luma: LUMA }, { name: 'pre3', start: 148.316, end: 155.577, luma: LUMA },
  { name: 'chorus3', start: 155.577, end: 170.521, luma: LUMA }, { name: 'bridge', start: 170.521, end: 198.978, luma: LUMA },
  { name: 'pre4', start: 198.978, end: 206.182, luma: [0.3, 0.45] }, { name: 'chorus4', start: 206.182, end: 221.032, luma: LUMA },
  { name: 'stop', start: 221.032, end: 228.228, luma: [0.0, 0.2], dark: true }, { name: 'drop2', start: 228.228, end: 242.606, luma: LUMA },
  { name: 'tail', start: 242.606, end: 247.2, luma: [0.0, 0.2], dark: true },
];
const sectionAt = (t: number) => SECTIONS.find((s) => t >= s.start && t < s.end) ?? SECTIONS[SECTIONS.length - 1]!;
const LYRICQA_URL = '/src/engine/lyricqa.ts';
const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const fx = (x: number | null | undefined, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(d));

/** Import lyricqa into the page (same module graph as the app) and hook screen-space text. */
async function loadQA(page: Page) {
  await page.evaluate(async (u) => {
    await import(/* @vite-ignore */ u);
    const Q = (window as any).__lyricqa;
    Q.instrument();
    Q.reset();
  }, LYRICQA_URL);
}

interface QaFailJ { t: number; id: string; text: string; rule: string; value: number; limit: number; msg: string; scene?: string }
interface Span { t0: number; t1: number; n: number; id: string; text: string; rule: string; worst: number; limit: number; msg: string; scene?: string }
/** Rules whose bad direction is "too small" (worst = min). */
const MIN_RULES = new Set(['size', 'contrast', 'margin']);
function spansOf(fails: QaFailJ[], gap: number): Span[] {
  const open = new Map<string, Span>(), out: Span[] = [];
  for (const f of [...fails].sort((a, b) => a.t - b.t)) {
    const k = `${f.id}|${f.rule}|${f.text}`;
    const s = open.get(k);
    if (s && f.t - s.t1 <= gap) {
      s.t1 = f.t; s.n++;
      const worse = MIN_RULES.has(f.rule) ? f.value < s.worst : f.value > s.worst;
      if (worse) { s.worst = f.value; s.msg = f.msg; }
    } else {
      const ns: Span = { t0: f.t, t1: f.t, n: 1, id: f.id, text: f.text, rule: f.rule, worst: f.value, limit: f.limit, msg: f.msg, scene: f.scene };
      open.set(k, ns); out.push(ns);
    }
  }
  return out.sort((a, b) => a.t0 - b.t0 || a.rule.localeCompare(b.rule));
}

/** lyricqa: every sung word in the range, every sample; TREATMENT §7.4/§7.5 in-page; table + JSON + sheet. */
async function lyricqaMode(page: Page): Promise<number> {
  await loadQA(page);
  const info: { words: { key: string; w: string; start: number; end: number }[]; carriers: { id: string; scene: string; text: string; window: [number, number] }[]; timeline: { id: string; start: number; end: number }[] } =
    await page.evaluate(() => {
      const mv = (window as any).__mv, Q = (window as any).__lyricqa;
      return {
        words: mv.engine.lyrics.words.map((w: any) => ({ key: `${w.line}:${w.index}`, w: w.w, start: w.start, end: w.end })),
        carriers: Q.registered(),
        timeline: mv.timeline,
      };
    });
  const solo = opt('scene');
  let from = opt('from') !== undefined ? +opt('from')! : NaN, to = opt('to') !== undefined ? +opt('to')! : NaN;
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    if (!solo || !info.carriers.length) throw new Error('lyricqa: give --from and --to (or --scene <file> of a scene that registers carriers)');
    from = Math.min(...info.carriers.map((c) => c.window[0])); to = Math.max(...info.carriers.map((c) => c.window[1]));
  }
  const step = +opt('step', String(1 / 12))!;
  const ts = new Set<number>();
  const add = (t: number) => { if (t >= 1 / 60) ts.add(Math.round(t * 1e4) / 1e4); };
  const inRange = info.words.filter((w) => w.end + 0.25 >= from && w.start - 0.1 <= to);
  for (const w of inRange) {
    const a = Math.max(from, w.start - 0.1), b = Math.min(to, w.end + 0.25);
    for (let k = Math.ceil(a / step - 1e-9); k * step <= b + 1e-9; k++) add(k * step);
    add(a); add(b);
    for (const x of [w.start + 0.02, (w.start + w.end) / 2, w.end - 0.02]) if (x >= a && x <= b) add(x);
  }
  const times = [...ts].sort((a, b) => a - b);
  const label = opt('label') ?? `${solo ?? 'timeline'}_${from.toFixed(2)}-${to.toFixed(2)}`;
  const out = path.resolve(opt('out', QA_OUT)!);
  mkdirSync(out, { recursive: true });
  console.log(`lyricqa ${label}: ${inRange.length} words, ${times.length} samples (step ${step.toFixed(3)} s), ${info.carriers.length} carriers registered`);

  const fails: QaFailJ[] = [];
  const faces: any[] = [];
  const hud = new Map<string, any>(), loose = new Map<string, any>();
  const t0 = performance.now();
  let lastT = -1;
  for (let i = 0; i < times.length; i++) {
    const t = times[i]!;
    const probeNeeded = !(Math.abs(t - 1 / 60 - lastT) < 1e-4);
    const r = await page.evaluate(({ t, probeNeeded }) => {
      const mv = (window as any).__mv, Q = (window as any).__lyricqa;
      if (probeNeeded) { mv.still(t - 1 / 60); Q.probe(t - 1 / 60); }
      mv.still(t);
      return Q.lyricqa(t);
    }, { t, probeNeeded });
    lastT = t;
    fails.push(...r.fails);
    for (const m of r.faces) faces.push({ t: m.t, id: m.id, part: m.part, text: m.text, onScreen: m.onScreen, cursor: +m.cursor.toFixed(3), cap: +m.cap.toFixed(1), contrast: m.contrast === null ? null : +m.contrast.toFixed(2), coc: m.coc === null ? null : +m.coc.toFixed(2), margin: +m.margin.toFixed(0), angle: +m.angle.toFixed(1), roll: m.roll === undefined ? null : +m.roll.toFixed(1), speed: m.speed === null ? null : +m.speed.toFixed(3), occl: m.occl === null ? null : +m.occl.toFixed(3), inBand: m.inBand, rel: m.rel === null ? null : +m.rel.toExponential(2), par: m.par === null ? null : +m.par.toExponential(2), rect: m.rect && { x: Math.round(m.rect.x), y: Math.round(m.rect.y), w: Math.round(m.rect.w), h: Math.round(m.rect.h) }, fails: m.fails });
    for (const h of r.hud) { const k = `${h.scene}|${h.text}`; const e = hud.get(k); if (e) e.t1 = t; else hud.set(k, { ...h, t0: t, t1: t }); }
    for (const L of r.loose) if (L.camlock || L.billboard || L.lyric) { const k = `${L.scene}|${L.kind}|${L.text}`; const e = loose.get(k); if (e) { e.t1 = t; e.camlock ||= L.camlock; } else loose.set(k, { ...L, t0: t, t1: t }); }
    if ((i + 1) % 25 === 0 || i === times.length - 1) process.stdout.write(`\r  ${i + 1}/${times.length} samples, ${fails.length} fails  ${((performance.now() - t0) / 1000).toFixed(0)}s   `);
  }
  process.stdout.write('\n');
  fails.push(...(await page.evaluate(() => (window as any).__lyricqa.finish())));
  const spans = spansOf(fails, 2 * step + 2e-3);
  const byRule: Record<string, number> = {};
  for (const s of spans) byRule[s.rule] = (byRule[s.rule] ?? 0) + 1;

  // table
  const head = `lyricqa ${label}   range ${from.toFixed(3)}–${to.toFixed(3)} s   step ${step.toFixed(3)} s   samples ${times.length}   words ${inRange.length}   carriers ${info.carriers.length}`;
  const verdict = fails.length ? `RESULT: FAIL — ${fails.length} failing checks in ${spans.length} spans; spans by rule: ${Object.entries(byRule).map(([k, v]) => `${k} ${v}`).join(', ')}` : 'RESULT: PASS — every sampled word passed every rule';
  const rows = spans.map((s) => `${pad(s.t0.toFixed(2), 7)} ${pad(s.t1.toFixed(2), 7)} ${pad(s.text.slice(0, 22), 22)} ${pad(s.rule, 12)} ${pad(fx(s.worst), 8)} ${pad(fx(s.limit), 6)} ${pad(String(s.n), 4)} ${s.msg}`);
  const table = [head, verdict, '', `${pad('t0', 7)} ${pad('t1', 7)} ${pad('word / text', 22)} ${pad('rule', 12)} ${pad('worst', 8)} ${pad('limit', 6)} ${pad('n', 4)} detail`, ...rows].join('\n');
  writeFileSync(path.join(out, `lyricqa_${label}.txt`), table + '\n');
  // per-word summary: carried / measured / passed
  const carrierWord = new Map(info.carriers.map((c: any) => [c.id, c.word as string]));
  const words = inRange.map((w) => {
    const wf = fails.filter((f) => f.id === `word/${w.key}` || carrierWord.get(f.id) === w.key);
    return { key: w.key, word: w.w, start: w.start, end: w.end, carriers: info.carriers.filter((c: any) => c.word === w.key).map((c) => c.id), fails: [...new Set(wf.map((f) => f.rule))] };
  });
  const json = { mode: 'lyricqa', label, scene: solo ?? null, range: [from, to], step, samples: times.length, verdict: fails.length ? 'FAIL' : 'PASS', byRule, spans, words, hud: [...hud.values()], loose: [...loose.values()], fails, faces, carriers: info.carriers };
  writeFileSync(path.join(out, `lyricqa_${label}.json`), JSON.stringify(json, null, 1));
  console.log(table.split('\n').slice(0, 4 + Math.min(rows.length, Number(opt('rows', '60')))).join('\n'));
  if (rows.length > Number(opt('rows', '60'))) console.log(`… ${rows.length - Number(opt('rows', '60'))} more rows in lyricqa_${label}.txt`);

  // annotated sheet: the first sample of the most important failing spans (or an even spread when all pass)
  if (!flag('no-sheet')) {
    const order = ['subtitle', 'hud', 'camlock', 'r2text', 'unregistered', 'anchor', 'billboard', 'size', 'contrast', 'dof', 'margin', 'angle', 'roll', 'speed', 'occlusion', 'overlap', 'view', 'hidden', 'traits'];
    const pick: number[] = [];
    const near = (x: number) => times.reduce((b, t) => (Math.abs(t - x) < Math.abs(b - x) ? t : b), times[0]!);
    for (const rule of order) {
      // the two longest spans of the rule with different kinds of evidence (message without the quoted text)
      const kinds = new Set<string>();
      for (const s of spans.filter((x) => x.rule === rule).sort((a, b) => b.n - a.n)) {
        const kind = s.msg.replace(/"[^"]*"/g, '').replace(/[\d.]+/g, '');
        if (kinds.has(kind) || kinds.size >= 2 || pick.length >= 9) continue;
        kinds.add(kind);
        pick.push(near((s.t0 + s.t1) / 2));
      }
    }
    const want = fails.length ? 9 : 12;
    for (let n = want; new Set(pick).size < want && n <= 4 * want; n++) {
      // fill with an even spread of the range (more candidates until enough distinct samples)
      for (let k = 0; k < n && new Set(pick).size < want; k++) pick.push(near(from + ((to - from) * (k + 0.5)) / n));
    }
    const sel = [...new Set(pick)].sort((a, b) => a - b).slice(0, want);
    const png: string = await page.evaluate(({ sel }) => {
      const mv = (window as any).__mv, Q = (window as any).__lyricqa;
      const cols = 3, cw = 640, ch = 360, padp = 6;
      const rows = Math.ceil(sel.length / cols);
      const cv = document.createElement('canvas');
      cv.width = cols * (cw + padp) + padp; cv.height = rows * (ch + padp) + padp;
      const c = cv.getContext('2d')!;
      c.fillStyle = '#1a1a1a'; c.fillRect(0, 0, cv.width, cv.height);
      const src = document.getElementById('c') as HTMLCanvasElement;
      sel.forEach((t: number, i: number) => {
        mv.still(t - 1 / 60); Q.probe(t - 1 / 60); mv.still(t);
        const r = Q.lyricqa(t, undefined, { record: false });
        const x = padp + (i % cols) * (cw + padp), y = padp + Math.floor(i / cols) * (ch + padp);
        c.drawImage(src, x, y, cw, ch);
        Q.drawOverlay(c, r, cw / 1920, x, y);
      });
      return cv.toDataURL('image/png');
    }, { sel });
    const f = path.join(out, `lyricqa_${label}_sheet.png`);
    await Bun.write(f, Buffer.from(png.split(',')[1]!, 'base64'));
    console.log(f);
  }
  console.log(path.join(out, `lyricqa_${label}.txt`));
  console.log(path.join(out, `lyricqa_${label}.json`));
  return fails.length ? 1 : 0;
}

/** seam --cut <id>: the registered seam object either side of the cut, measured and shown side by side. */
async function seamMode(page: Page): Promise<number> {
  const cut = opt('cut');
  if (!cut) throw new Error('seam: --cut <id> (H00…H13, or a test seam registered with a time)');
  const res = await seamRun(page, cut, { t: opt('t') !== undefined ? +opt('t')! : undefined, out: path.resolve(opt('out', QA_OUT)!) });
  return res.pass ? 0 : 1;
}

/** The seam measurement of `seam --cut` (also run by `gates` for the seams in its window); returns the JSON it writes. */
async function seamRun(page: Page, cut: string, o: { t?: number; out: string }): Promise<any> {
  await loadQA(page);
  const rec: any = await page.evaluate(async ({ u, cut }) => { const m = await import(/* @vite-ignore */ u); return m.HANDOFFS?.[cut] ?? null; }, { u: '/src/scenes/_handoff.ts', cut });
  let tc = o.t !== undefined ? o.t : rec?.t;
  if (!Number.isFinite(tc)) tc = await page.evaluate((cut) => { const R = (globalThis as any).__lyricreg; return R.handoffOf(cut, 'out')?.t ?? R.handoffOf(cut, 'in')?.t ?? null; }, cut);
  if (!Number.isFinite(tc)) throw new Error(`seam ${cut}: no cut time (not in _handoff.ts HANDOFFS, no registered t, no --t)`);
  const dt = 1 / 60;
  const r: any = await page.evaluate(({ cut, tc, dt, target }) => {
    const mv = (window as any).__mv, Q = (window as any).__lyricqa;
    const src = document.getElementById('c') as HTMLCanvasElement;
    const shot = () => { const cv = document.createElement('canvas'); cv.width = 1920; cv.height = 1080; cv.getContext('2d')!.drawImage(src, 0, 0, 1920, 1080); return cv; };
    mv.still(tc - 2 * dt); const o2 = Q.seamInfo(cut, 'out');
    mv.still(tc - dt); const o1 = Q.seamInfo(cut, 'out'); const imOut = shot(); const actOut = Q.activeAt(tc - dt);
    mv.still(tc + 0.001); const i1 = Q.seamInfo(cut, 'in'); const imIn = shot(); const actIn = Q.activeAt(tc + 0.001);
    mv.still(tc + 0.001 + dt); const i2 = Q.seamInfo(cut, 'in');
    const W2 = 960, H2 = 540, lab = 44;
    const cv = document.createElement('canvas'); cv.width = W2 * 3 + 8; cv.height = H2 + lab;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#151515'; c.fillRect(0, 0, cv.width, cv.height);
    c.drawImage(imOut, 0, lab, W2, H2); c.drawImage(imIn, W2 + 4, lab, W2, H2);
    c.drawImage(imOut, 2 * W2 + 8, lab, W2, H2); c.globalAlpha = 0.5; c.drawImage(imIn, 2 * W2 + 8, lab, W2, H2); c.globalAlpha = 1;
    const box = (rr: any, ox: number, col: string, dash: number[]) => {
      if (!rr) return;
      const R = Array.isArray(rr) ? { x: rr[0], y: rr[1], w: rr[2], h: rr[3] } : rr;
      c.save(); c.beginPath(); c.rect(ox, lab, W2, H2); c.clip();
      c.strokeStyle = col; c.lineWidth = 2; c.setLineDash(dash); c.strokeRect(ox + R.x / 2, lab + R.y / 2, R.w / 2, R.h / 2); c.restore();
    };
    for (const [ox, which] of [[0, 'o'], [W2 + 4, 'i'], [2 * W2 + 8, 'b']] as [number, string][]) {
      if (target) box(target, ox, 'rgba(255,255,255,0.8)', [3, 5]);
      if (which !== 'i') box(o1.rect, ox, '#36d6ff', []);
      if (which !== 'o') box(i1.rect, ox, '#ffd636', which === 'b' ? [8, 4] : []);
    }
    c.font = '20px monospace'; c.fillStyle = '#ddd';
    c.fillText(`OUT  t=${(tc - dt).toFixed(3)}  [${actOut.join(',')}]${o1.registered ? '' : '  (no seam object registered)'}`, 8, 28);
    c.fillText(`IN  t=${(tc + 0.001).toFixed(3)}  [${actIn.join(',')}]${i1.registered ? '' : '  (no seam object registered)'}`, W2 + 12, 28);
    c.fillText(`50/50   cyan out · yellow in · dotted = record`, 2 * W2 + 16, 28);
    return { o1, o2, i1, i2, actOut, actIn, png: cv.toDataURL('image/png'), out: imOut.toDataURL('image/png'), in: imIn.toDataURL('image/png') };
  }, { cut, tc, dt, target: rec?.rect ?? null });
  // the record's exact rigs (Handoff.out / .in, placeRig'd) projected onto its world box: the target each plate builds to
  const rigRects: { out: number[] | null; in: number[] | null } = await page.evaluate(async ({ u, cut }) => {
    const m = await import(/* @vite-ignore */ u); const h = m.HANDOFFS?.[cut];
    const ok = (g: any) => g && g.pos?.every((x: number) => Number.isFinite(x));
    return h?.box ? { out: ok(h.out) ? m.rigRect(h.out, h.box) : null, in: ok(h.in) ? m.rigRect(h.in, h.box) : null } : { out: null, in: null };
  }, { u: '/src/scenes/_handoff.ts', cut });
  const edges = (a: any, b: any) => (a && b ? Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.x + a.w - b.x - b.w), Math.abs(a.y + a.h - b.y - b.h)) : null);
  const ctr = (a: any) => (a ? [a.x + a.w / 2, a.y + a.h / 2] : null);
  const vel = (a: any, b: any, d: number) => { const p = ctr(a), q = ctr(b); return p && q ? [(q[0]! - p[0]!) / d, (q[1]! - p[1]!) / d] : null; };
  const asR = (x: number[] | null) => (x ? { x: x[0]!, y: x[1]!, w: x[2]!, h: x[3]! } : null);
  const tgt = asR(rec?.rect ?? null);
  const vOut = vel(r.o2.rect, r.o1.rect, dt), vIn = vel(r.i1.rect, r.i2.rect, dt);
  // motion-compensated comparison AT the cut instant: the out frame (tc − 1/60) moved forward by its own screen
  // velocity, the in frame (tc + 0.001) moved back by its own (record vel as fallback). A fast seam (H02: ~95 px
  // between the two frames) is continuous when both land on the same rect at tc, not when the raw frames coincide.
  const recVel: number[] | null = rec?.vel ?? null;
  const shift = (a: any, v: number[] | null, d: number) => (a && v ? { ...a, x: a.x + v[0]! * d, y: a.y + v[1]! * d } : a);
  const outAt = shift(r.o1.rect, vOut ?? recVel, dt), inAt = shift(r.i1.rect, vIn ?? recVel, -0.001);
  const rawDelta = edges(r.o1.rect, r.i1.rect);
  const velocityDelta = vOut && vIn ? Math.hypot(vOut[0]! - vIn[0]!, vOut[1]! - vIn[1]!) : null;
  let delta = edges(outAt, inAt), pass = delta !== null && delta < 2, exitEnter: any = null;
  if (rec?.kind === 'exit-enter') {
    // the object leaves through one frame edge and enters through the opposite one at the same screen speed
    const crossing = (a: any) => (!a ? null : a.x < 0 ? 'L' : a.x + a.w > 1920 ? 'R' : a.y < 0 ? 'T' : a.y + a.h > 1080 ? 'B' : null);
    const opp: Record<string, string> = { L: 'R', R: 'L', T: 'B', B: 'T' };
    const eOut = crossing(outAt), eIn = crossing(inAt);
    const speed = vOut ? Math.hypot(vOut[0]!, vOut[1]!) : 0;
    const vOk = velocityDelta !== null && velocityDelta <= Math.max(30, 0.1 * speed);
    exitEnter = { exitEdge: eOut, entryEdge: eIn, speed, velocityOk: vOk };
    pass = !!eOut && !!eIn && opp[eOut] === eIn && vOk;
    delta = velocityDelta;
  }
  const res = {
    cut, t: tc, record: rec, kind: rec?.kind ?? null, out: { t: tc - dt, scenes: r.actOut, ...r.o1, velocity: vOut, atCut: outAt }, in: { t: tc + 0.001, scenes: r.actIn, ...r.i1, velocity: vIn, atCut: inAt },
    delta, rawDelta, pass, exitEnter,
    vsRecord: { out: edges(r.o1.rect, tgt), in: edges(r.i1.rect, tgt) },
    vsRig: { out: edges(r.o1.rect, asR(rigRects.out)), in: edges(r.i1.rect, asR(rigRects.in)), outRig: rigRects.out, inRig: rigRects.in },
    velocityDelta,
  };
  const out = o.out;
  mkdirSync(out, { recursive: true });
  const base = path.join(out, `seam_${cut}`);
  await Bun.write(`${base}.png`, Buffer.from(r.png.split(',')[1]!, 'base64'));
  await Bun.write(`${base}_out.png`, Buffer.from(r.out.split(',')[1]!, 'base64'));
  await Bun.write(`${base}_in.png`, Buffer.from(r.in.split(',')[1]!, 'base64'));
  writeFileSync(`${base}.json`, JSON.stringify(res, null, 1));
  const R = (x: any) => (x ? `[${Math.round(x.x)}, ${Math.round(x.y)}, ${Math.round(x.w)}, ${Math.round(x.h)}]` : '—');
  console.log(`seam ${cut} at ${tc.toFixed(3)}  ${rec ? `(${rec.from} → ${rec.to}, ${rec.status ?? 'record'})` : '(registered test seam)'}`);
  console.log(`  out ${(tc - dt).toFixed(3)} [${r.actOut.join(',')}]: ${r.o1.registered ? `rect ${R(r.o1.rect)}  v ${vOut ? vOut.map((x) => x.toFixed(0)).join(', ') : '—'} px/s` : 'NOT REGISTERED (lyricReg.handoff side out)'}`);
  console.log(`  in  ${(tc + 0.001).toFixed(3)} [${r.actIn.join(',')}]: ${r.i1.registered ? `rect ${R(r.i1.rect)}  v ${vIn ? vIn.map((x) => x.toFixed(0)).join(', ') : '—'} px/s` : 'NOT REGISTERED (lyricReg.handoff side in)'}`);
  if (tgt) console.log(`  record rect ${R(tgt)}: out off by ${fx(res.vsRecord.out, 1)} px, in off by ${fx(res.vsRecord.in, 1)} px`);
  if (rigRects.out || rigRects.in) console.log(`  record rigs (Handoff.out/.in on its box): out off by ${fx(res.vsRig.out, 1)} px, in off by ${fx(res.vsRig.in, 1)} px`);
  if (exitEnter) console.log(`  exit-enter: exits ${exitEnter.exitEdge ?? '—'} → enters ${exitEnter.entryEdge ?? '—'}  speed ${exitEnter.speed.toFixed(0)} px/s  velocity delta ${fx(velocityDelta, 0)} px/s → ${res.pass ? 'PASS' : 'FAIL'}`);
  else console.log(`  delta at the cut ${fx(delta, 2)} px (limit < 2; raw frames ${fx(rawDelta, 1)} px, motion-compensated by each side's screen velocity)  velocity delta ${fx(res.velocityDelta, 0)} px/s  → ${res.pass ? 'PASS' : 'FAIL'}`);
  console.log(`${base}.png\n${base}.json`);
  return res;
}

/** Run scripts/colorstat.py over a stills dir (manifest: per-file t, section, luma target, shot, sota, hook word sung). */
function runColorstat(dir: string, out: string, manifest?: string, video = false): number {
  mkdirSync(out, { recursive: true });
  const args = [PY, path.join(APP, 'scripts/colorstat.py'), dir, '--json', path.join(out, 'colorstat.json')];
  if (manifest) args.push('--manifest', manifest);
  if (video) args.push('--video');
  const p = Bun.spawnSync(args, { stdout: 'inherit', stderr: 'inherit' });
  console.log(path.join(out, 'colorstat.json'));
  return p.exitCode ?? 1;
}

/**
 * In-page probe at t (renders t single-sample first): the shot of each active entry (`entry@last cut`, the cut the
 * plate reports through lyricReg.view, else the entry start) and whether the SOTA machine is on screen: a scene-graph
 * object named `lamp_<id>` whose lamp holds the SOTA at t (_lamp.lampLook), visible with all its ancestors, projected
 * inside the frame ± 15 % by the camera the plate reported.
 */
async function probeFrames(page: Page, times: number[]): Promise<{ shot: string; entry: string; sota: boolean }[]> {
  return page.evaluate(async ({ times, u }) => {
    const mv = (window as any).__mv, R = (globalThis as any).__lyricreg;
    const lamp = await import(/* @vite-ignore */ u);
    return times.map((t: number) => {
      mv.still(t);
      const act = mv.engine.timeline.filter((e: any) => t >= e.start && t < e.end);
      const e = act[act.length - 1];
      if (!e) return { shot: 'none', entry: 'none', sota: false };
      const v = R?.views.get(e.id);
      const cut = v && v.t !== undefined && Math.abs(v.t - t) < 1e-9 && Number.isFinite(v.cut) && v.cut > e.start ? v.cut : e.start;
      let sota = false;
      for (const a of act) {
        const va = R?.views.get(a.id);
        if (!va?.cam) continue;
        const roots = new Set<any>();
        const sc = mv.engine.loaded.get(a.id)?.scene;
        if (sc) for (const k of Object.keys(sc)) { const o = sc[k]; if (o && o.isObject3D) { let r = o; while (r.parent) r = r.parent; roots.add(r); } }
        for (const c of R.forScene(a.id)) { let r = c.obj; while (r.parent) r = r.parent; roots.add(r); }
        for (const root of roots) root.traverse((o: any) => {
          if (sota || typeof o.name !== 'string' || !o.name.startsWith('lamp_')) return;
          if (!lamp.lampLook(t, o.name.slice(5)).holds) return;
          let vis = o.visible; o.traverseAncestors((x: any) => { if (!x.visible) vis = false; });
          if (!vis) return;
          const p = o.getWorldPosition(o.position.clone()).project(va.cam);
          if (p.z > -1 && p.z < 1 && Math.abs(p.x) < 1.15 && Math.abs(p.y) < 1.15) sota = true;
        });
      }
      return { shot: `${e.id}@${cut.toFixed(3)}`, entry: e.id, sota };
    });
  }, { times, u: '/src/scenes/_lamp.ts' });
}

/** colorstat over a time range: render stills (or take an encoded video's frames), write the manifest, run colorstat.py. */
async function colorstatMode(page: Page): Promise<number> {
  let times: number[];
  if (opt('times')) times = opt('times')!.split(',').map(Number);
  else {
    const from = +opt('from', '0')!, to = +opt('to', String(from + 10))!;
    if (opt('step')) { const st = +opt('step')!; times = []; for (let t = from; t <= to + 1e-9; t += st) times.push(+t.toFixed(4)); }
    else { const n = +opt('n', '12')!; times = Array.from({ length: n }, (_, i) => from + ((to - from) * i) / Math.max(1, n - 1)); }
  }
  const out = path.resolve(opt('out', path.join(QA_OUT, 'colorstat'))!);
  const frames = path.join(out, 'frames');
  rmSync(frames, { recursive: true, force: true });
  let files: string[];
  const video = opt('video');
  if (video) {
    // an encoded video: frame k of the file is song time vt0 + k / vfps; take the frame nearest each time
    const vt0 = +opt('vt0', '0')!, vfps = +opt('vfps', '60')!;
    mkdirSync(frames, { recursive: true });
    const idx = times.map((t) => Math.round((t - vt0) * vfps));
    times = idx.map((k) => vt0 + k / vfps);
    const sel = idx.map((k) => `eq(n\\,${k})`).join('+');
    const tmp = path.join(frames, 'tmp_%05d.png');
    const p = Bun.spawnSync(['ffmpeg', '-v', 'error', '-y', '-i', path.resolve(video), '-vf', `select='${sel}',scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb24`, '-vsync', '0', '-start_number', '0', tmp], { stdout: 'inherit', stderr: 'inherit' });
    if (p.exitCode) throw new Error('colorstat --video: ffmpeg failed');
    // (select keeps file order, so the k-th output is the k-th smallest index)
    const order = idx.map((k, i) => [k, i] as const).sort((a, b) => a[0] - b[0]);
    files = times.map(() => '');
    order.forEach(([, i], j) => {
      const src = path.join(frames, `tmp_${String(j).padStart(5, '0')}.png`), dst = path.join(frames, `f_${times[i]!.toFixed(3).padStart(7, '0')}.png`);
      Bun.spawnSync(['mv', src, dst]);
      files[i] = dst;
    });
  } else files = await stills(page, times, frames);
  const sung: { sung: string[]; hook: boolean }[] = await page.evaluate(async ({ u, times }) => {
    const m = await import(/* @vite-ignore */ u);
    const L = (window as any).__mv.engine.lyrics;
    return times.map((t: number) => {
      const s = L.words.filter((w: any) => t >= w.start && t <= w.end).map((w: any) => m.fabText(w.w));
      return { sung: s, hook: s.some((x: string) => m.HOOK_WORDS.has(x)) };
    });
  }, { u: '/src/engine/lyricreg.ts', times });
  const probe = await probeFrames(page, times);
  const man: Record<string, unknown> = {};
  // §5.2.5: in the HOOK sections (the choruses) the main word being sung covers ≥ 10 % of the frame in bone
  files.forEach((f, i) => {
    const t = times[i]!, s = sectionAt(t);
    man[path.basename(f)] = { t, section: s.name, luma: s.luma, dark: !!s.dark, hook: sung[i]!.hook && s.name.startsWith('chorus'), sung: sung[i]!.sung, ...probe[i] };
  });
  const mf = path.join(out, 'manifest.json');
  writeFileSync(mf, JSON.stringify(man, null, 1));
  return runColorstat(frames, out, mf, !!video);
}

/** cutqa: no frame blends two shots (see the header). */
async function cutqaMode(page: Page): Promise<number> {
  const from = +opt('from', '0')!, to = +opt('to', String(from + 10))!;
  const r = await cutqaRun(page, {
    from, to, fps: +opt('fps', '60')!, shutter: +opt('shutter', '0.5')!, ab: flag('ab'), relearn: flag('relearn'), learn: true,
    samples: opt('samples') ? SAMPLES : { min: 4, max: 324, tol: 3, refine: 'tiles' as const }, out: path.resolve(opt('out', path.join(QA_OUT, 'cutqa'))!),
  });
  return r.verdict === 'PASS' ? 0 : 1;
}

/** The cutqa measurement (also run by `gates` over its window: `learn` false there, its frame loop taught the cuts). */
async function cutqaRun(page: Page, o: { from: number; to: number; fps: number; shutter: number; ab: boolean; relearn: boolean; learn: boolean; samples: typeof SAMPLES; out: string }) {
  const { from, to, fps, shutter, ab, samples } = o;
  const dt = 1 / fps;
  // find the cuts the plates report (one single-sample render per 1/30 s teaches the engine)
  if (o.learn) await page.evaluate(({ from, to }) => { const mv = (window as any).__mv; for (let t = from; t < to; t += 1 / 30) mv.still(t); }, { from, to });
  const relearn = o.relearn;
  const cuts: { t: number; id: string; src: string }[] = await page.evaluate(({ from, to }) => (window as any).__mv.engine.cutsIn(from - 1e-9, to), { from, to });
  // frames around each cut: those within a frame of it (the old symmetric shutter reached across when |t − c| < w/2)
  const w = dt * shutter;
  const jobs: { t: number; c: number; src: string; id: string; straddle: boolean; other: number }[] = [];
  for (const c of cuts) {
    for (let n = Math.ceil((c.t - dt) * fps - 1e-9); n / fps <= c.t + dt + 1e-9; n++) {
      const t = n / fps;
      const straddle = c.t <= t ? t - c.t < w / 2 : c.t - t <= w / 2;
      jobs.push({ t, c: c.t, src: c.src, id: c.id, straddle, other: c.t <= t ? c.t - 0.002 : c.t + 0.002 });
    }
  }
  const out = o.out;
  mkdirSync(out, { recursive: true });
  console.log(`cutqa ${from}–${to}: ${cuts.length} cuts (${cuts.map((c) => `${c.t.toFixed(3)}${c.src === 'timeline' ? 'T' : c.src === 'declared' ? 'D' : 'R'}`).join(' ')}), ${jobs.length} frames, ${jobs.filter((j) => j.straddle).length} reached across by the old shutter`);
  const rows: any[] = [];
  const tiles = 4, tw = 384, th = 216, lab = 20;
  const sheetRows: string[] = [];
  for (const j of jobs) {
    const r: any = await page.evaluate(({ j, dt, samples, shutter, ab, tw, th, relearn }) => {
      const mv = (window as any).__mv, E = mv.engine, src = document.getElementById('c') as HTMLCanvasElement;
      const G = 8, gw = Math.floor(E.renderer.domElement.width / G), gh = Math.floor(E.renderer.domElement.height / G);
      const grid = () => {
        const px: Uint8Array = E.readPixels(), W = E.renderer.domElement.width, out = new Float32Array(gw * gh);
        for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
          let s = 0;
          for (let yy = 0; yy < G; yy++) { const row = (y * G + yy) * W; for (let xx = 0; xx < G; xx++) { const i = (row + x * G + xx) * 4; s += 0.2126 * px[i]! + 0.7152 * px[i + 1]! + 0.0722 * px[i + 2]!; } }
          out[y * gw + x] = s / (G * G * 255);
        }
        return out;
      };
      const snap = () => { const cv = document.createElement('canvas'); cv.width = tw; cv.height = th; cv.getContext('2d')!.drawImage(src, 0, 0, tw, th); return cv.toDataURL('image/jpeg', 0.85); };
      const res: any = { };
      let S: Float32Array, O: Float32Array;
      const one = (aware: boolean) => {
        E.cutAware = aware;
        const n = E.render(j.t, dt, true, samples, shutter);
        const B = grid(), img = snap();
        let num = 0, den = 0, rs = 0;
        for (let i = 0; i < B.length; i++) { const d = O[i]! - S[i]!, b = B[i]! - S[i]!; num += b * d; den += d * d; }
        const a = den > 1e-9 ? num / den : 0;
        for (let i = 0; i < B.length; i++) { const e = B[i]! - S[i]! - a * (O[i]! - S[i]!); rs += e * e; }
        return { n, span: [...E.lastSpan], redo: E.lastRedo, alpha: a, sep: Math.sqrt(den / B.length), resid: Math.sqrt(rs / B.length), img };
      };
      // --relearn: the engine forgets the reported cuts, so this frame has to learn its cut while sampling (and re-sample)
      if (relearn) E.learned.clear();
      E.cutAware = true;
      const n0 = E.render(j.t, dt, true, samples, shutter), B1 = grid(), img1 = snap(), span1 = [...E.lastSpan], redo1 = E.lastRedo;
      // references: each shot at one instant (4 sub-frames over 2 % of a frame: crisp, and the accumulator drops the
      // stray non-finite pixels a single-sample frame would bloom into a white blot)
      E.render(j.t, dt, true, 4, 0.02); S = grid(); const iS = snap();
      E.render(j.other, dt, true, 4, 0.02); O = grid(); const iO = snap();
      const fit = (B: Float32Array) => {
        let num = 0, den = 0, rs = 0;
        for (let i = 0; i < B.length; i++) { const d = O[i]! - S[i]!, b = B[i]! - S[i]!; num += b * d; den += d * d; }
        const a = den > 1e-9 ? num / den : 0;
        for (let i = 0; i < B.length; i++) { const e = B[i]! - S[i]! - a * (O[i]! - S[i]!); rs += e * e; }
        return { alpha: a, sep: Math.sqrt(den / B.length), resid: Math.sqrt(rs / B.length) };
      };
      res.new = { n: n0, span: span1, redo: redo1, img: img1, ...fit(B1) };
      if (ab) res.old = one(false);
      E.cutAware = true;
      return { ...res, iS, iO };
    }, { j, dt, samples, shutter, ab, tw, th, relearn });
    // one side: the sampled shutter lies wholly on the side of the cut that t is on (t at the cut = the shot after it)
    const side = j.t >= j.c ? r.new.span[0] >= j.c - 1e-9 : r.new.span[1] < j.c;
    const row = { t: +j.t.toFixed(4), cut: j.c, src: j.src, id: j.id, straddle: j.straddle, side, other: j.other, sep: r.new.sep, alpha: r.new.alpha, resid: r.new.resid, span: r.new.span, n: r.new.n, redo: r.new.redo, alphaOld: r.old?.alpha ?? null, spanOld: r.old?.span ?? null };
    rows.push(row);
    console.log(`  cut ${j.c.toFixed(3)} ${pad(j.src, 8)} t ${j.t.toFixed(4)} ${j.straddle ? 'straddled' : '         '} ${side ? 'one side' : 'BOTH SIDES'}  shutter [${r.new.span.map((x: number) => (x - j.c).toFixed(4)).join(', ')}] rel. cut  ${r.new.n} sub-frames${r.new.redo ? ` (${r.new.redo} re-sampled)` : ''}  α ${fx(r.new.alpha, 3)}${ab ? `  (old shutter α ${fx(r.old.alpha, 3)})` : ''}  shot difference ${fx(r.new.sep, 3)}`);
    if (j.straddle || ab) sheetRows.push(JSON.stringify({ lab: `t ${j.t.toFixed(4)}  cut ${j.c.toFixed(3)}  α ${fx(r.new.alpha, 3)}${ab ? ` (old ${fx(r.old.alpha, 3)})` : ''}`, imgs: [r.iO, ab ? r.old.img : null, r.new.img, r.iS] }));
  }
  // gate: every sampled shutter on one side of its cut, and no measurable ghost in the frames the old shutter
  // reached across (the others render exactly as before: their α measures the references, e.g. motion blur vs a
  // crisp instant, not a second shot)
  const bad = rows.filter((x) => !x.side || (x.straddle && x.sep > 0.01 && Math.abs(x.alpha) >= 0.05));
  const json = { mode: 'cutqa', range: [from, to], fps, shutter, cuts, rows, verdict: bad.length ? 'FAIL' : 'PASS' };
  writeFileSync(path.join(out, 'cutqa.json'), JSON.stringify(json, null, 1));
  // sheet: O (other shot) | B old shutter | B cut-aware | S (own shot)
  if (sheetRows.length) {
    const png: string = await page.evaluate(async ({ rows, tiles, tw, th, lab }) => {
      const cv = document.createElement('canvas'); cv.width = tiles * (tw + 4) + 4; cv.height = rows.length * (th + lab + 4) + 28;
      const c = cv.getContext('2d')!; c.fillStyle = '#161616'; c.fillRect(0, 0, cv.width, cv.height);
      c.font = '15px monospace'; c.fillStyle = '#ddd';
      ['O: other shot (1 sample)', 'B: old symmetric shutter', 'B: cut-aware shutter', 'S: own shot (1 sample)'].forEach((s, i) => c.fillText(s, 4 + i * (tw + 4), 18));
      for (let k = 0; k < rows.length; k++) {
        const r = JSON.parse(rows[k]); const y = 28 + k * (th + lab + 4);
        c.fillStyle = '#ddd'; c.fillText(r.lab, 4, y + 15);
        for (let i = 0; i < r.imgs.length; i++) {
          if (!r.imgs[i]) continue;
          const im = new Image(); im.src = r.imgs[i]; await im.decode();
          c.drawImage(im, 4 + i * (tw + 4), y + lab);
        }
      }
      return cv.toDataURL('image/png');
    }, { rows: sheetRows, tiles, tw, th, lab });
    await Bun.write(path.join(out, 'cutqa_sheet.png'), Buffer.from(png.split(',')[1]!, 'base64'));
    console.log(path.join(out, 'cutqa_sheet.png'));
  }
  const st = rows.filter((x) => x.straddle && x.sep > 0.01);
  const worst = st.reduce((m, x) => Math.max(m, Math.abs(x.alpha)), 0);
  const worstOld = ab ? st.reduce((m, x) => Math.max(m, Math.abs(x.alphaOld)), 0) : null;
  const sides = rows.filter((x) => x.side).length;
  console.log(`RESULT: ${bad.length ? 'FAIL' : 'PASS'} — ${sides}/${rows.length} frames sample one side of their cut; the ${st.length} frames the old shutter reached across: worst ghost α ${worst.toFixed(3)} (limit 0.05)${ab ? `, old shutter worst α ${worstOld!.toFixed(3)}` : ''}; ${rows.reduce((k, x) => k + x.redo, 0)} frames re-sampled for a cut learned while sampling`);
  console.log(path.join(out, 'cutqa.json'));
  return { cuts, rows, verdict: bad.length ? 'FAIL' : 'PASS', worst, note: `${sides}/${rows.length} frames on one side, worst ghost α ${worst.toFixed(3)}` };
}

// ================================================================ gates: the p1v4 gate runner (KITS §22)

/** Words, beats, sections, cuts and hits of [from, to] as the page knows them (the end record scripts/gates.py reads). */
async function gatesMeta(page: Page, from: number, to: number, cfg: any): Promise<any> {
  const m: any = await page.evaluate(({ from, to }) => {
    const mv = (window as any).__mv, E = mv.engine, R = (globalThis as any).__lyricreg;
    const LV = new Set(['S', 'M', 'L', 'XL', 'XXL']);
    const fab = (w: string) => w.replace(/[“”"(),.!?;:…]+/g, '').replace(/'/g, '’').toUpperCase();
    const words = E.lyrics.words.filter((w: any) => w.end >= from - 1 && w.start <= to + 1).map((w: any) => ({
      key: `${w.line}:${w.index}`, text: fab(w.w), start: w.start, end: w.end, line: w.line, lineStart: E.lyrics.lines[w.line].start, lineEnd: E.lyrics.lines[w.line].end,
    }));
    const act = E.timeline.filter((e: any) => e.end > from - 0.5 && e.start < to);
    // hits: (a) lyricReg.hits registrations, (b) arrays of { t, level } on the scene instance (or one level down: certify keeps
    // its plate in .r) — _impact.Hit lists like HITS / WARP / CAM / FLASH
    const hits: any[] = [];
    const src = new Map<string, string>();
    for (const e of act) {
      const reg = R?.hitMarks?.get(e.id);
      if (reg?.length) { for (const h of reg) hits.push({ t: h.t, level: h.level, label: h.label ?? '', src: 'registered', scene: e.id }); src.set(e.id, 'registered'); continue; }
      const sc = E.loaded.get(e.id)?.scene;
      if (!sc) continue;
      const scan = (o: any, pre: string, depth: number) => {
        for (const k of Object.keys(o)) {
          const v = o[k];
          if (!v || typeof v !== 'object' || v.isObject3D || v.isMaterial || v.isTexture || ArrayBuffer.isView(v)) continue;
          if (Array.isArray(v)) {
            if (v.length && v.every((h: any) => h && typeof h.t === 'number' && LV.has(h.level))) {
              for (const h of v) hits.push({ t: h.t, level: h.level, label: h.label ?? h.name ?? `${pre}${k}`, src: `${e.id}.${pre}${k}`, scene: e.id, gain: h.gain ?? 1 });
              src.set(e.id, 'discovered');
            }
          } else if (depth < 1 && !(v instanceof Map) && !(v instanceof Set) && k !== 'ctx') scan(v, `${pre}${k}.`, depth + 1);
        }
      };
      scan(sc, '', 0);
    }
    return {
      words, downbeats: E.audio.downbeats.filter((b: number) => b >= from - 3 && b <= to + 3), hits, hitSrc: [...src.entries()],
      timeline: E.timeline.map((e: any) => ({ id: e.id, start: e.start, end: e.end })), active: act.map((e: any) => e.id),
      cuts: E.cutsIn(from - 1e-6, to + 1e-6),
    };
  }, { from, to });
  // merge hits within 30 ms (keep the strongest level; gain ≤ 0.05 fx-only dummies never decide the level)
  const rank: Record<string, number> = { S: 0, M: 1, L: 2, XL: 3, XXL: 4 };
  const hs = (m.hits as any[]).filter((h) => h.t >= from - 0.5 && h.t <= to).sort((a, b) => a.t - b.t);
  const merged: any[] = [];
  for (const h of hs) {
    const p = merged[merged.length - 1];
    const strong = (x: any) => (Math.abs(x.gain ?? 1) > 0.05 ? rank[x.level]! : -1);
    if (p && h.t - p.t < 0.03) { if (strong(h) > strong(p)) Object.assign(p, { level: h.level, label: h.label || p.label, src: h.src }); continue; }
    merged.push({ ...h });
  }
  let hits = merged.filter((h) => Math.abs(h.gain ?? 1) > 0.05 || rank[h.level]! >= 2);
  const slice = [38.908, 60.995];
  if (!hits.length && from < slice[1] && to > slice[0]) {
    // nothing registered or exposed: the slice's hits as director review 3 marked them (gates.json static)
    hits = (cfg.static.hits as [number, string, string][]).filter(([t]) => t >= from - 0.5 && t <= to).map(([t, level, label]) => ({ t, level, label, src: 'static (gates.json)' }));
  }
  const cuts = [...new Set([...(m.cuts as { t: number }[]).map((c) => +c.t.toFixed(4)), ...m.timeline.map((e: any) => +e.start.toFixed(4))])].filter((c) => c > from + 1e-4 && c < to - 1e-4).sort((a, b) => a - b);
  return {
    window: [from, to], cuts, hits, hitSrc: m.hitSrc, words: m.words, downbeats: m.downbeats, active: m.active,
    sections: SECTIONS.filter((s) => s.end > from && s.start < to).map((s) => ({ name: s.name, start: s.start, end: s.end })),
  };
}

/**
 * gates: ONE self-check against the v4 gates, the director's own measurements (KITS §22). Renders the window frame by
 * frame (60 fps, or --fast: 30 fps and half-res analysis), streams every frame + the page's per-frame lyric geometry
 * (lyricqa rules + lyricqa.gateFrame: faces with their sung state, labels, near-lens depth bands), the SOTA flag and the
 * post parameters into scripts/gates.py; then the window's cuts / hits / words / downbeats, cutqa, the seams in the window
 * and a perf pass go in the end record. Writes gates.txt, gates.json, gates_worst.png, gates_impacts.png. Exit 1 on a fail.
 */
async function gatesMode(page: Page, url: string): Promise<number> {
  const cfg = await Bun.file(path.join(APP, 'scripts/gates.json')).json();
  const fast = flag('fast');
  let from = opt('from') !== undefined ? +opt('from')! : NaN, to = opt('to') !== undefined ? +opt('to')! : NaN;
  const names = (opt('shots') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (names.length) {
    const sel = (cfg.shots as [string, number, number][]).filter((s) => names.includes(s[0]));
    const miss = names.filter((n) => !sel.some((s) => s[0] === n));
    if (miss.length) throw new Error(`gates --shots: unknown ${miss.join(', ')} (scripts/gates.json shots: ${cfg.shots.map((s: any) => s[0]).join(' ')})`);
    if (opt('from') === undefined) from = Math.min(...sel.map((s) => s[1]));
    if (opt('to') === undefined) to = Math.max(...sel.map((s) => s[2]));
  }
  if (!(to > from)) throw new Error('gates: --from a --to b (song s) or --shots C2,C3 [--fast]');
  const fps = +opt('fps', fast ? '30' : '60')!, half = fast || flag('half');
  const label = opt('label') ?? `${names.length ? names.join('+') : `${from.toFixed(2)}-${to.toFixed(2)}`}${fast ? '_fast' : ''}`;
  const out = path.resolve(opt('out', path.join(ROOT, 'out/wip/p1v4/gates', label))!);
  mkdirSync(out, { recursive: true });
  const t0 = performance.now();
  await loadQA(page);
  const video = opt('video');
  if (video) {
    // an encoded video: the page only supplies the window's meta (its CURRENT sources: cuts and hits may have moved since
    // the render); the lyric gates need the page's per-frame geometry and are not measured
    await page.evaluate(({ from, to }) => { const mv = (window as any).__mv; for (let t = from; t < to; t += 1 / 30) mv.still(t); }, { from, to });
    const meta = await gatesMeta(page, from, to, cfg);
    const mf = path.join(out, 'meta.json');
    writeFileSync(mf, JSON.stringify(meta, null, 1));
    const args = [PY, path.join(APP, 'scripts/gates.py'), 'video', path.resolve(video), '--vt0', opt('vt0', '0')!, '--from', String(from), '--to', String(to), '--out', out, '--meta', mf, '--label', label];
    if (opt('fps')) args.push('--fps', String(fps)); else if (fast) args.push('--fps', '30');
    if (half) args.push('--half');
    const p = Bun.spawnSync(args, { stdout: 'inherit', stderr: 'inherit' });
    return p.exitCode ?? 1;
  }
  const py = Bun.spawn([PY, path.join(APP, 'scripts/gates.py'), 'stream', '--out', out], { stdin: 'pipe', stdout: 'inherit', stderr: 'inherit' });
  let chain: Promise<unknown> = Promise.resolve(), acked = 0, pyDead = false;
  void py.exited.then(() => { pyDead = true; });
  const server = Bun.serve({
    port: 0,
    fetch(req, srv) { return srv.upgrade(req) ? undefined : new Response('ws only', { status: 400 }); },
    websocket: {
      maxPayloadLength: 256 * 1024 * 1024,
      message(ws, msg) {
        const buf = typeof msg === 'string' ? Buffer.from(msg) : (msg as Uint8Array);
        // (written in order; acknowledged once the analyzer's pipe took it: the page renders at most 2 frames ahead)
        chain = chain.then(async () => { if (pyDead) { ws.close(); return; } py.stdin.write(buf); await py.stdin.flush(); ws.send(String(++acked)); });
      },
    },
  });
  const samples = opt('samples') ? SAMPLES : 1;
  const n0 = Math.ceil(from * fps - 1e-6), n1 = Math.ceil(to * fps - 1e-6);
  const total = n1 - n0;
  console.log(`gates ${label}: ${from.toFixed(3)}–${to.toFixed(3)}, ${total} frames @ ${fps} fps${typeof samples === 'number' ? (samples === 1 ? '' : `, ${samples} sub-frames`) : ', adaptive sub-frames'}, ${half ? 'half' : 'full'}-res analysis → ${out}`);
  const loop = async (a: { n0: number; n1: number; fps: number; ws: string; samples: any; shutter: number; label: string; half: boolean; occl: boolean; warm: boolean; urls: string[] }) => {
    const Wn: any = window;
    const mv = Wn.__mv, E = mv.engine, Q = Wn.__lyricqa;
    let G = Wn.__gates;
    if (!G) {
      G = Wn.__gates = { sent: 0, acked: 0, wake: null, err: '', lamps: new Map(), boards: new Map() };
      const sock = new WebSocket(a.ws);
      sock.binaryType = 'arraybuffer';
      G.sock = sock;
      await new Promise<void>((res, rej) => { sock.onopen = () => res(); sock.onerror = () => rej(new Error('gates: websocket error')); });
      const wake = () => { const f = G.wake; G.wake = null; f?.(); };
      sock.onmessage = (ev) => { G.acked = Math.max(G.acked, +ev.data || 0); wake(); };
      sock.onclose = () => { G.err = 'gates: the analyzer closed the stream'; wake(); };
      G.shaft = await import(/* @vite-ignore */ a.urls[0]!);
      G.lamp = await import(/* @vite-ignore */ a.urls[1]!);
      G.buf = new Uint8Array(mv.width * mv.height * 3);
      Q.gateReset();
    }
    const R = (globalThis as any).__lyricreg;
    const active = (t: number) => E.timeline.filter((e: any) => t >= e.start && t < e.end);
    const rootsOf = (id: string) => {
      const roots = new Set<any>();
      const sc = E.loaded.get(id)?.scene;
      if (sc) for (const k of Object.keys(sc)) { const o = sc[k]; if (o && o.isObject3D) { let r = o; while (r.parent) r = r.parent; roots.add(r); } }
      for (const c of R.forScene(id)) { let r = c.obj; while (r.parent) r = r.parent; roots.add(r); }
      return [...roots];
    };
    const visibleUp = (o: any) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
    // the SOTA machine on screen: a lamp_<id> that holds the SOTA at t, visible, inside the frame ± 15 % (as colorstat's probe)
    const sotaAt = (t: number) => {
      for (const e of active(t)) {
        const v = R?.views.get(e.id);
        if (!v?.cam) continue;
        let lamps = G.lamps.get(e.id);
        if (!lamps) { lamps = []; for (const r of rootsOf(e.id)) r.traverse((o: any) => { if (typeof o.name === 'string' && o.name.startsWith('lamp_')) lamps.push(o); }); G.lamps.set(e.id, lamps); }
        for (const o of lamps) {
          if (!G.lamp.lampLook(t, o.name.slice(5)).holds || !visibleUp(o)) continue;
          const p = o.getWorldPosition(o.position.clone()).project(v.cam);
          if (p.z > -1 && p.z < 1 && Math.abs(p.x) < 1.15 && Math.abs(p.y) < 1.15) return true;
        }
      }
      return false;
    };
    // board designators for the plates whose board is drawn this frame (certify keeps its plate in .r)
    const silkFor = (t: number) => {
      const BS = G.shaft.BOARD_SILK as any[];
      if (!BS?.length) return [];
      const U = G.shaft.SHAFT_UNIFORMS, fv = U?.uSilkFade?.value, kv = U?.uSilkFadeK?.value;
      const outS: any[] = [];
      for (const e of active(t)) {
        const sc = E.loaded.get(e.id)?.scene, sh = sc?.shaft ?? sc?.r?.shaft;
        if (!sh?.group || !sh.boardMat) continue;
        let board = G.boards.get(e.id);
        if (board === undefined) { board = null; sh.group.traverse((o: any) => { if (!board && o.material === sh.boardMat) board = o; }); G.boards.set(e.id, board); }
        if (!board || !visibleUp(board)) continue;
        outS.push({ scene: e.id, entries: BS.map((b) => ({ text: b.designator, rect: b.rect, capH: b.capH })), fade: [fv?.x ?? 0, fv?.y ?? 60], k: typeof kv === 'number' ? kv : 0.4 });
      }
      return outS;
    };
    const dt = 1 / a.fps;
    if (a.warm) {
      // the frame before the window: stateful scenes run sequentially, speeds have a previous frame
      const t = (a.n0 - 1) * dt;
      E.render(t, dt, false, 1, a.shutter);
      Q.lyricqa(t, undefined, { pixels: false, occlusion: false, record: false });
      Q.gateFrame(t, { fps: a.fps, depth: false, labels: false });
    }
    const enc = new TextEncoder();
    for (let n = a.n0; n < a.n1; n++) {
      if (G.err) throw new Error(G.err);
      const t = n * dt;
      const c0 = performance.now();
      const k = E.render(t, dt, false, a.samples, a.shutter);
      const ms = performance.now() - c0;
      E.readStart(0);
      const qa = Q.lyricqa(t, undefined, { pixels: true, occlusion: a.occl });
      const gf = Q.gateFrame(t, { fps: a.fps, silk: silkFor(t) });
      const lp = E.lastPost ?? {};
      const meta = {
        ms: Math.round(ms * 10) / 10, sub: k, sota: sotaAt(t),
        post: { exposure: lp.exposure, flash: lp.flash, radial: lp.radial, ca: lp.ca, split: lp.split, ev: lp.ev },
        faces: gf.faces, labels: gf.labels, fg: gf.fg,
        qa: { n: qa.checked, fails: qa.fails.map((f: any) => ({ t: f.t, rule: f.rule, id: f.id, text: f.text, value: f.value, limit: f.limit, msg: f.msg })) },
      };
      await E.readFinish(0, G.buf);
      const hdr = enc.encode(JSON.stringify({ t, fps: a.fps, half: a.half, label: a.label, w: mv.width, h: mv.height, flip: true, bytes: G.buf.length, meta }));
      const rec = new Uint8Array(8 + hdr.length + G.buf.length);
      rec.set([71, 70, 48, 49], 0); // 'GF01'
      new DataView(rec.buffer).setUint32(4, hdr.length, true);
      rec.set(hdr, 8);
      rec.set(G.buf, 8 + hdr.length);
      G.sock.send(rec);
      G.sent++;
      while (!G.err && G.sent - G.acked > 2) await new Promise<void>((r) => { G.wake = r; });
    }
    return G.sent;
  };
  let ok = false;
  try {
    const chunk = 30;
    for (let a = n0; a < n1; a += chunk) {
      const b = Math.min(n1, a + chunk);
      await page.evaluate(loop, { n0: a, n1: b, fps, ws: `ws://localhost:${server.port}/`, samples, shutter: +opt('shutter', '0.5')!, label, half, occl: !fast || (a / chunk) % 2 === 0, warm: a === n0, urls: ['/src/scenes/_shaft.ts', '/src/scenes/_lamp.ts'] });
      process.stdout.write(`\r  rendered ${b - n0}/${total} frames  ${((performance.now() - t0) / 1000).toFixed(0)}s   `);
      if (pyDead) throw new Error('gates: the analyzer (scripts/gates.py) exited early');
    }
    process.stdout.write('\n');
    await chain;
    const qaFinish = await page.evaluate(() => (window as any).__lyricqa.finish());
    const meta = await gatesMeta(page, from, to, cfg);
    // cutqa over the window (the frame loop taught the engine the plates' cuts)
    let cutqa: any = null;
    if (!flag('no-cutqa') && meta.cuts.length) {
      // (the director's settings in every mode: fewer sub-frames leave noise in the blended frame that reads as ghost α)
      cutqa = await cutqaRun(page, { from, to, fps: 60, shutter: 0.5, ab: false, relearn: false, learn: false, samples: { min: 4, max: 324, tol: 3, refine: 'tiles' }, out: path.join(out, 'cutqa') });
      cutqa = { verdict: cutqa.verdict, note: cutqa.note, rows: cutqa.rows.map((r: any) => ({ t: r.t, cut: r.cut, straddle: r.straddle, side: r.side, alpha: r.alpha, sep: r.sep })) };
    }
    // the seams whose cut lies in the window (_handoff.ts records)
    const seams: any[] = [];
    if (!flag('no-seam')) {
      // _handoff.ts records with a time, and seams plates register for their own cuts (lyricReg.handoff({ …, t }))
      const recs: { id: string; t: number }[] = await page.evaluate(async (u) => {
        const m = await import(/* @vite-ignore */ u);
        const out = Object.entries(m.HANDOFFS ?? {}).map(([id, h]: [string, any]) => ({ id, t: h.t as number })).filter((h) => Number.isFinite(h.t));
        for (const h of ((globalThis as any).__lyricreg?.handoffs?.values() ?? []) as Iterable<{ cut: string; t?: number }>) {
          if (Number.isFinite(h.t) && !out.some((o) => o.id === h.cut)) out.push({ id: h.cut, t: h.t! });
        }
        return out;
      }, '/src/scenes/_handoff.ts');
      for (const r of recs.filter((h) => h.t > from && h.t < to)) {
        try {
          const s = await seamRun(page, r.id, { out: path.join(out, 'seam') });
          seams.push({ cut: r.id, t: s.t, pass: s.pass, delta: s.delta, note: s.exitEnter ? `exit-enter ${s.exitEnter.exitEdge ?? '—'}→${s.exitEnter.entryEdge ?? '—'} Δv ${fx(s.velocityDelta, 0)} px/s` : `Δ ${fx(s.delta, 1)} px at the cut, Δv ${fx(s.velocityDelta, 0)} px/s` });
        } catch (e) { seams.push({ cut: r.id, t: r.t, pass: false, note: `seam failed: ${(e as Error).message}` }); }
      }
    }
    // perf: ms per frame at 1 sub-frame (render + readback, GPU-synced) over ≤ 3 s of the window, and zz_look2's on this machine now
    let perf: any = null;
    if (!flag('no-perf')) {
      const pf = (await import('node:os')).loadavg()[0];
      const measure = (p: Page, a: number, b: number) => p.evaluate(async ({ a, b }) => {
        const P = (window as any).__mv, ms: number[] = [], buf = new Uint8Array(P.width * P.height * 4);
        P.still(a);
        for (let t = a; t < b; t += 1 / 60) { const c = performance.now(); P.engine.render(t, 1 / 60, false, 1, 0.5); await P.engine.readPixelsAsync(buf); ms.push(performance.now() - c); }
        ms.sort((x, y) => x - y);
        return { n: ms.length, avg: ms.reduce((s, x) => s + x, 0) / ms.length, p95: ms[Math.floor(ms.length * 0.95)]! };
      }, { a, b });
      const w = await measure(page, from, Math.min(to, from + (fast ? 2 : 3)));
      let ref: any = null;
      try {
        const rp = await openPage(url, { scene: 'zz_look2', sp: null, only: null });
        try { ref = await measure(rp.page, 0, fast ? 2 : 3); } finally { await rp.browser.close(); }
      } catch (e) { console.error(`gates perf: zz_look2 reference failed: ${(e as Error).message}`); }
      perf = { avg: w.avg, p95: w.p95, n: w.n, load: +pf.toFixed(2), idle: pf < 2.0, ref_p95: ref?.p95 ?? null, ref_avg: ref?.avg ?? null };
      console.log(`  perf ${w.n} frames: avg ${w.avg.toFixed(1)} ms, p95 ${w.p95.toFixed(1)} ms${ref ? ` | zz_look2 p95 ${ref.p95.toFixed(1)} ms → ratio ${(w.p95 / ref.p95).toFixed(2)}` : ''} | load ${pf.toFixed(2)}`);
    }
    const end = { end: true, ...meta, qaFinish, cutqa, seams, perf, wall_s: +((performance.now() - t0) / 1000).toFixed(1) };
    writeFileSync(path.join(out, 'meta.json'), JSON.stringify(end, null, 1));
    const hdr = Buffer.from(JSON.stringify(end));
    const rec = Buffer.alloc(8 + hdr.length);
    rec.write('GF01', 0, 'latin1'); rec.writeUInt32LE(hdr.length, 4); hdr.copy(rec, 8);
    await chain;
    py.stdin.write(rec);
    await py.stdin.flush();
    py.stdin.end();
    ok = true;
  } finally {
    if (!ok) { try { py.stdin.end(); } catch { /* closed */ } }
    server.stop(true);
  }
  const code = await py.exited;
  console.log(`gates ${label}: ${((performance.now() - t0) / 1000).toFixed(0)} s`);
  return code ?? 1;
}

// lint and colorstat over existing stills need no browser
if (mode === 'lint' || mode === 'assets.lint') {
  const p = Bun.spawnSync(['bun', path.join(APP, 'scripts/lint.ts'), ...argv.slice(1)], { stdout: 'inherit', stderr: 'inherit' });
  process.exit(p.exitCode ?? 1);
}
if (mode === 'colorstat' && opt('dir')) process.exit(runColorstat(path.resolve(opt('dir')!), path.resolve(opt('out', opt('dir'))!), opt('manifest')));

const { url, stop } = await ensureServer();
if (mode === 'video') {
  try {
    // (the duration comes from the audio analysis; read it from the file rather than opening and
    // closing a throwaway browser first, which on this machine left the render pages dead)
    const dur: number = (await Bun.file(path.join(ROOT, 'data/audio.json')).json()).duration;
    await video(url, +opt('from', '0')!, +opt('to', String(dur))!, +opt('fps', '60')!, path.resolve(opt('out', path.join(ROOT, 'out/baseline.mp4'))!));
  } finally { stop(); }
  process.exit(0);
}
const { browser, page, logs } = await openPage(url);
let exitCode = 0;
try {
  if (mode === 'gpu') {
    console.log(await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2')!;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    }));
  } else if (mode === 'stills') {
    const times = (opt('t') ?? '0').split(',').map(Number);
    const files = await stills(page, times, opt('out', path.join(ROOT, 'out/stills'))!);
    console.log(files.join('\n'));
  } else if (mode === 'sheet') {
    const from = +opt('from', '0')!, to = +opt('to', '10')!, n = +opt('n', '12')!;
    let times = Array.from({ length: n }, (_, i) => from + ((to - from) * i) / Math.max(1, n - 1));
    if (opt('times')) times = opt('times')!.split(',').map(Number);
    if (flag('cuts')) {
      // 4 frames around every timeline boundary: 2 frames before, 2 after
      const tl: { id: string; start: number }[] = await page.evaluate(() => (window as any).__mv.timeline);
      times = tl.slice(1).flatMap((e) => [e.start - 0.1, e.start - 1 / 60, e.start + 1 / 60, e.start + 0.1]);
    }
    const out = opt('out', path.join(ROOT, `out/sheets/sheet_${from}-${to}.png`))!;
    await sheet(page, times, +opt('cols', '4')!, out, +opt('tw', '480')!);
    console.log(out);
  } else if (mode === 'plates') {
    const tl: { id: string; start: number; end: number }[] = await page.evaluate(() => (window as any).__mv.timeline);
    const figs = ['open', 'loss', 'room', 'shoggoth', 'spacetime', 'ascent', 'bureau', 'leftturn', 'paperclips', 'fuse', 'stack', 'dense', 'loom', 'ilya'];
    const overrides: Record<string, number> = existsSync(path.join(APP, 'plates.json')) ? await Bun.file(path.join(APP, 'plates.json')).json() : {};
    const dir = path.join(APP, 'public/plates');
    mkdirSync(dir, { recursive: true });
    await page.evaluate(() => { (window as any).__mv.engine.hudOff = true; });
    for (let i = 0; i < figs.length; i++) {
      const e = tl.find((x) => x.id === figs[i]);
      if (!e) continue;
      const t = overrides[figs[i]!] ?? (e.start + e.end) / 2;
      await page.evaluate((t) => (window as any).__mv.still(t, 4, 0.2), t);
      const f = path.join(dir, `fig${String(i + 1).padStart(2, '0')}.jpg`);
      await page.screenshot({ path: f, type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
      console.log(f, t.toFixed(2));
    }
  } else if (mode === 'perf' && flag('engine-only')) {
    // the engine's own per-frame cost, A/B: the post pass with the v3 grade vs the Phase 0 tone (GPU-synced loops of
    // 100 passes on the frame at --from), and the CPU of the cut-aware shutter (shutterSpan per frame + cut learning per
    // sub-frame, at 324 sub-frames)
    const t = +opt('from', '50')!;
    const r = await page.evaluate(async ({ t }) => {
      const mv = (window as any).__mv, E = mv.engine, R = E.renderer, gl = R.getContext() as WebGL2RenderingContext;
      mv.still(t);
      const src = E.rts[0].texture, hudTex = E.hud.draw(t, { opacity: 0, frame: 0, readout: 0, paper: 0 });
      const px = new Uint8Array(4);
      const sync = () => { R.setRenderTarget(E.finalRT); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
      const loop = (grade: number) => {
        const p = { ...E.lastPost, grade }; sync();
        const a = performance.now();
        for (let i = 0; i < 100; i++) E.post.render(R, src, hudTex, E.finalRT, p, t);
        sync();
        return (performance.now() - a) / 100;
      };
      const g0: number[] = [], g1: number[] = [];
      for (let k = 0; k < 6; k++) { g0.push(loop(0)); g1.push(loop(1)); }
      const med = (x: number[]) => [...x].sort((a, b) => a - b)[x.length >> 1]!;
      let a = performance.now();
      for (let i = 0; i < 1000; i++) E.shutterSpan(t + i / 60000, 1 / 60, 0.5);
      const span = (performance.now() - a) / 1000;
      a = performance.now();
      for (let i = 0; i < 324 * 10; i++) E.learnCuts(t, t - 1 / 120, t + 1 / 120);
      const learn = (performance.now() - a) / 10;
      return { post0: med(g0), post1: med(g1), span, learn324: learn };
    }, { t });
    console.log(`post pass: Phase 0 tone ${r.post0.toFixed(3)} ms, v3 grade ${r.post1.toFixed(3)} ms (Δ ${(r.post1 - r.post0).toFixed(3)} ms)  |  shutterSpan ${(r.span * 1000).toFixed(1)} µs/frame  |  cut learning ${r.learn324.toFixed(3)} ms per 324-sub-frame frame`);
  } else if (mode === 'perf') {
    const from = +opt('from', '0')!, to = +opt('to', '5')!;
    const r = await page.evaluate(async ({ from, to, samples, shutter }) => {
      const P = (window as any).__mv;
      const ms: number[] = [];
      const buf = new Uint8Array(P.width * P.height * 4);
      P.still(from);
      const used: Record<number, number> = {};
      for (let t = from; t < to; t += 1 / 60) {
        const a = performance.now();
        const k = P.engine.render(t, 1 / 60, false, samples, shutter);
        used[k] = (used[k] ?? 0) + 1;
        await P.engine.readPixelsAsync(buf);
        ms.push(performance.now() - a);
      }
      ms.sort((a, b) => a - b);
      return { n: ms.length, avg: ms.reduce((a, b) => a + b, 0) / ms.length, p50: ms[ms.length >> 1], p95: ms[Math.floor(ms.length * 0.95)], max: ms[ms.length - 1], used };
    }, { from, to, samples: SAMPLES, shutter: +opt('shutter', '0.5')! });
    console.log(`frames ${r.n}  avg ${r.avg.toFixed(1)}ms  p50 ${r.p50.toFixed(1)}  p95 ${r.p95.toFixed(1)}  max ${r.max.toFixed(1)}  sub-frames ${hist(r.used)}`);
  } else if (mode === 'textqa') {
    // every frame at --step (default 0.1 s) from --from to --to: the type each plate drew, glyph by glyph, and every
    // pair of different runs (same plate) whose glyphs overlap by more than --ov (default 0.08) of the smaller run's
    // ink — glyph boxes, not run boxes: a run box around a tilted line covers the lines above and below it. Both runs
    // legible (alpha > 0.45, glyph height > --min-h px, default 16); h is the smaller run's tallest glyph.
    const from = +opt('from', '0')!, to = +opt('to', '247.2')!, step = +opt('step', '0.1')!, ov = +opt('ov', '0.08')!;
    const minH = +opt('min-h', '16')!;
    const hits: { t: number; a: string; b: string; k: number; scene: string; h: number }[] = await page.evaluate(async ({ from, to, step, ov, minH }) => {
      const P = (window as any).__mv, Q = (window as any).__textqa;
      const out: { t: number; a: string; b: string; k: number; scene: string; h: number }[] = [];
      Q.on = true;
      const gh = (g: number[]) => { let m = 0; for (let i = 0; i < g.length; i += 4) m = Math.max(m, g[i + 3]! - g[i + 1]!); return m; };
      const ga = (g: number[]) => { let s = 0; for (let i = 0; i < g.length; i += 4) s += (g[i + 2]! - g[i]!) * (g[i + 3]! - g[i + 1]!); return s; };
      // point in a convex screen quad (either winding)
      const inQ = (q: number[], x: number, y: number) => {
        let pos = 0, neg = 0;
        for (let i = 0; i < 4; i++) {
          const ax = q[2 * i]!, ay = q[2 * i + 1]!, bx = q[(2 * i + 2) % 8]!, by = q[(2 * i + 3) % 8]!;
          const cr = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
          if (cr > 0) pos++; else if (cr < 0) neg++;
        }
        return pos === 0 || neg === 0;
      };
      const qArea = (q: number[]) => { let a = 0; for (let i = 0; i < 4; i++) a += q[2 * i]! * q[(2 * i + 3) % 8]! - q[(2 * i + 2) % 8]! * q[2 * i + 1]!; return Math.abs(a) / 2; };
      const qH = (q: number[]) => Math.max(q[1]!, q[3]!, q[5]!, q[7]!) - Math.min(q[1]!, q[3]!, q[5]!, q[7]!);
      for (let t = from; t < to; t += step) {
        Q.runs.length = 0;
        Q.rects.length = 0;
        P.still(t);
        const R = Q.runs.filter((r: any) => r.a > 0.45 && r.g.length && gh(r.g) > minH && r.x1 > 0 && r.x0 < 1920 && r.y1 > 0 && r.y0 < 1080);
        // type running over the border of the outlined box it sits in: most of the run's glyph corners inside a
        // small box, some outside (big panels and type much taller than the box are lyrics passing over, not labels)
        for (const r of R) for (const b of Q.rects) {
          if (b.scene !== r.scene || qArea(b.q) > 0.08 * 1920 * 1080 || gh(r.g) > 0.7 * qH(b.q)) continue;
          let inn = 0, tot = 0;
          for (let i = 0; i < r.g.length; i += 4) for (const [x, y] of [[r.g[i], r.g[i + 1]], [r.g[i + 2], r.g[i + 1]], [r.g[i], r.g[i + 3]], [r.g[i + 2], r.g[i + 3]]]) { tot++; if (inQ(b.q, x, y)) inn++; }
          if (inn >= 0.75 * tot && inn < tot) out.push({ t: Math.round(t * 100) / 100, a: r.s, b: '[BOX BORDER]', k: Math.round((1 - inn / tot) * 100) / 100, scene: r.scene, h: Math.round(gh(r.g)) });
        }
        for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
          const A = R[i], B = R[j];
          if (A.scene !== B.scene || A.s === B.s) continue;
          if (Math.min(A.x1, B.x1) <= Math.max(A.x0, B.x0) || Math.min(A.y1, B.y1) <= Math.max(A.y0, B.y0)) continue;
          // overlapping ink: the sum over glyph pairs of their boxes' intersections
          let inter = 0;
          for (let p = 0; p < A.g.length; p += 4) for (let q = 0; q < B.g.length; q += 4) {
            const ix = Math.min(A.g[p + 2], B.g[q + 2]) - Math.max(A.g[p], B.g[q]), iy = Math.min(A.g[p + 3], B.g[q + 3]) - Math.max(A.g[p + 1], B.g[q + 1]);
            if (ix > 0 && iy > 0) inter += ix * iy;
          }
          if (inter <= 0) continue;
          const k = inter / Math.min(ga(A.g), ga(B.g));
          if (k > ov) out.push({ t: Math.round(t * 100) / 100, a: A.s, b: B.s, k: Math.round(k * 100) / 100, scene: A.scene, h: Math.round(Math.min(gh(A.g), gh(B.g))) });
        }
      }
      Q.on = false;
      return out;
    }, { from, to, step, ov, minH });
    // group runs of consecutive frames
    const key = (h: (typeof hits)[number]) => `${h.scene}|${[h.a, h.b].sort().join(' ⟂ ')}`;
    const groups = new Map<string, { t0: number; t1: number; k: number; n: number; h: number }>();
    for (const h of hits) { const g = groups.get(key(h)); if (!g) groups.set(key(h), { t0: h.t, t1: h.t, k: h.k, n: 1, h: h.h }); else { g.t1 = h.t; g.k = Math.max(g.k, h.k); g.n++; g.h = Math.max(g.h, h.h); } }
    const rows = [...groups.entries()].sort((a, b) => a[1].t0 - b[1].t0);
    for (const [k, g] of rows) console.log(`${g.t0.toFixed(2)}–${g.t1.toFixed(2)}  ×${g.n}  overlap ${g.k.toFixed(2)}  h ${g.h}px  ${k}`);
    console.log(`${rows.length} overlapping pairs`);
  } else if (mode === 'lyricvis') {
    // is the word being sung readable on screen? Every --step (default 0.05 s): each word in [start, max(end,
    // start + 0.3)) needs a type run containing it (any plate), alpha > 0.45, glyphs ≥ --min-h px tall (default
    // 22) and ≥ 85 % of its glyphs inside the frame. Words readable in < --ok of their samples (default 0.6) are
    // reported with why (missing / small / cut / faint).
    const from = +opt('from', '0')!, to = +opt('to', '247.2')!, step = +opt('step', '0.05')!, minH = +opt('min-h', '22')!, okFrac = +opt('ok', '0.6')!;
    const rep: { w: string; t0: number; t1: number; n: number; ok: number; why: Record<string, number> }[] = await page.evaluate(async ({ from, to, step, minH }) => {
      const P = (window as any).__mv, Q = (window as any).__textqa;
      const words: { w: string; start: number; end: number }[] = P.engine.lyrics.words;
      const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
      // (a word's window: its sung time, at least 0.3 s — cut short where the next word takes over within 0.05 s)
      const acc = words.map((w, i) => { const nx = words[i + 1]; const lim = nx ? nx.start + 0.05 : Infinity; return { w: w.w, t0: w.start, t1: Math.max(w.end, Math.min(w.start + 0.3, lim)), n: 0, ok: 0, why: {} as Record<string, number> }; });
      Q.on = true;
      for (let t = from; t < to; t += step) {
        const live = acc.map((a, i) => ({ a, i })).filter(({ a }) => t >= a.t0 && t < a.t1);
        if (!live.length) continue;
        Q.runs.length = 0; Q.rects.length = 0;
        P.still(t);
        const runs = Q.runs.map((r: any) => ({ ...r, ns: norm(r.s) }));
        for (const { a } of live) {
          const nw = norm(a.w);
          if (!nw) continue;
          a.n++;
          const cand = runs.filter((r: any) => r.ns.includes(nw) || (nw.includes(r.ns) && r.ns.length >= 3));
          let best = 'missing';
          for (const r of cand) {
            const g: number[] = r.g ?? [];
            if (!g.length) continue;
            let gh = 0, inside = 0;
            for (let i = 0; i < g.length; i += 4) {
              gh = Math.max(gh, g[i + 3]! - g[i + 1]!);
              if (g[i]! >= -2 && g[i + 2]! <= 1922 && g[i + 1]! >= -2 && g[i + 3]! <= 1082) inside++;
            }
            const why = r.a <= 0.45 ? 'faint' : gh < minH ? 'small' : inside < 0.85 * (g.length / 4) ? 'cut' : 'ok';
            if (why === 'ok') { best = 'ok'; break; }
            if (best === 'missing' || (best === 'faint' && why !== 'faint')) best = why;
          }
          if (best === 'ok') a.ok++; else a.why[best] = (a.why[best] ?? 0) + 1;
        }
      }
      Q.on = false;
      return acc.filter((a) => a.n > 0);
    }, { from, to, step, minH });
    let bad = 0;
    for (const a of rep) {
      if (a.ok / a.n >= okFrac) continue;
      bad++;
      const why = Object.entries(a.why).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(', ');
      console.log(`${a.t0.toFixed(2)}  ${a.w.padEnd(14)}  readable ${a.ok}/${a.n}   ${why}`);
    }
    console.log(`${bad} of ${rep.length} sung words not readable enough`);
  } else if (mode === 'lyricqa') {
    exitCode = await lyricqaMode(page);
  } else if (mode === 'seam') {
    exitCode = await seamMode(page);
  } else if (mode === 'colorstat') {
    exitCode = await colorstatMode(page);
  } else if (mode === 'cutqa') {
    exitCode = await cutqaMode(page);
  } else if (mode === 'gates') {
    exitCode = await gatesMode(page, url);
  } else if (!['gpu', 'stills', 'sheet', 'plates', 'perf', 'cutqa', 'gates'].includes(mode)) {
    console.error(`unknown mode '${mode}'`);
    exitCode = 2;
  }
  if (logs.length) console.error('BROWSER LOG:\n' + logs.slice(0, 40).join('\n'));
} finally {
  await browser.close();
  stop();
}
process.exit(exitCode);
