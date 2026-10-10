#!/usr/bin/env bun
// assets.lint (TREATMENT §0 R1/R2/R3, §D.1 0.9). Owner: tooling.
//
//   bun scripts/lint.ts [--json out.json] [--verbose] [--all]      (also: bun scripts/render.ts lint)
//   (--all: every scene file, not only the timeline's; --verbose: one row per hit with its source line)
//   exit 1 if anything banned can reach the edit.
//
// What reaches the edit: the scene files named by src/timeline.ts (E('id', 'file', …) entries and the 'sketch'
// fallback) and everything they import, transitively (static and dynamic imports; `import type` loads nothing).
// Engine files (src/engine/*) are always loaded but only drawn through by scenes: banned tokens there are warnings.
// Checks, per reachable scene/kit file (comments are ignored; a `// lint-ok` comment on the line whitelists it):
//   timeline-scene   a banned scene file on the timeline (paper, field, _world, _disc, abstract, leaderboard)
//   banned-import    a reachable file imports a banned module (paper, field, _world, _disc …)
//   banned-token     R1 record imagery / R2 academia in code or strings: Fig., et al, AoE, SUBMISSION, Cormorant
//                    (incl. F.serif), typst, tonearm, _disc, _world, stamp, paper_cloth, paper.ts, field.ts
//   banned-asset     a loaded asset path that is banned (tonearm.glb, stamp.glb, paper_cloth.glb, typst/, Cormorant)
//   glb-whitelist    a .glb that is not one of the film's models (names in TREATMENT.md / KITS.md / tools/blender/*.py)
//   hud-text         R3: text drawn into a Layer2D that the scene composites onto the frame (screen-space text)
//   camera-attached  R3: objects placed by or parented to the camera: cam.add(…), quaternion.copy(cam.quaternion),
//                    lookAt(cam.position) (billboards), cam.position.clone().addScaledVector(…) (camera-locked caption)
//   engine-hud       R3: plate captions on the timeline (`caption:`) or the P(doom) HUD readout (`pdoom:` overrides)
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Scene files that must never be on the timeline (R1/R2). tower.ts is reference-only until it becomes stack.ts. */
export const BANNED_SCENES = ['paper', 'field', '_world', '_disc', 'abstract', 'leaderboard'] as const;
/** Assets and fonts that must never be loaded by anything on the timeline. */
export const BANNED_ASSETS = ['tonearm.glb', 'stamp.glb', 'paper_cloth.glb', 'typst/', 'Cormorant'] as const;
/** Source tokens that mean paper / academia imagery (R2) or record imagery (R1). */
export const BANNED_TOKENS = ['Fig.', 'et al', 'AoE', 'SUBMISSION', 'Cormorant', 'typst', 'tonearm', '_disc', '_world', 'paper_cloth', 'stamp', 'paper.ts', 'field.ts'] as const;

/** How each banned token is matched (word boundaries, so 'timestamp' is not 'stamp'). */
const TOKEN_RE: Record<(typeof BANNED_TOKENS)[number], RegExp> = {
  'Fig.': /\bFig\./, 'et al': /\bet al\b/, AoE: /\bAoE\b/, SUBMISSION: /\bSUBMISSION\b|\bsubmission deadline\b/i, Cormorant: /Cormorant/,
  typst: /\btypst\b/i, tonearm: /tonearm/i, _disc: /(^|[^\w$])_disc\b/, _world: /(^|[^\w$])_world\b/, paper_cloth: /paper_cloth/,
  stamp: /\bstamps?\b|\bstamp(?=[A-Z_.(])/i, 'paper.ts': /\bpaper\.ts\b/, 'field.ts': /\bfield\.ts\b/,
};
const R_OF: Record<string, 'R1' | 'R2'> = { 'Fig.': 'R2', 'et al': 'R2', AoE: 'R2', SUBMISSION: 'R2', Cormorant: 'R2', typst: 'R2', 'paper.ts': 'R2', 'field.ts': 'R2', tonearm: 'R1', _disc: 'R1', _world: 'R1', paper_cloth: 'R1', stamp: 'R1' };

export interface Finding { file: string; line: number; rule: string; severity: 'fail' | 'warn'; msg: string; src: string }

const APP = path.resolve(import.meta.dir, '..');
const ROOT = path.resolve(APP, '..');
const SRC = path.join(APP, 'src');
const rel = (f: string) => path.relative(APP, f);

/** Code with comments blanked (strings, template literals and GLSL inside them kept), same line numbers. */
export function stripComments(src: string): string {
  let out = '', i = 0, mode: 'code' | 'line' | 'block' | "'" | '"' | '`' = 'code';
  const tpl: number[] = []; // brace depth inside each open template ${…}
  let depth = 0;
  while (i < src.length) {
    const c = src[i]!, n = src[i + 1];
    if (mode === 'line') { if (c === '\n') { mode = 'code'; out += c; } else out += ' '; i++; continue; }
    if (mode === 'block') { if (c === '*' && n === '/') { mode = 'code'; out += '  '; i += 2; } else { out += c === '\n' ? c : ' '; i++; } continue; }
    if (mode === "'" || mode === '"') { out += c; if (c === '\\') { out += n ?? ''; i += 2; continue; } if (c === mode || c === '\n') mode = 'code'; i++; continue; }
    if (mode === '`') {
      out += c;
      if (c === '\\') { out += n ?? ''; i += 2; continue; }
      if (c === '`') mode = 'code';
      else if (c === '$' && n === '{') { out += n; i += 2; tpl.push(depth); depth = 0; mode = 'code'; continue; }
      i++; continue;
    }
    // code
    if (c === '/' && n === '/') { mode = 'line'; out += '  '; i += 2; continue; }
    if (c === '/' && n === '*') { mode = 'block'; out += '  '; i += 2; continue; }
    if (c === "'" || c === '"' || c === '`') { mode = c; out += c; i++; continue; }
    if (c === '{') depth++;
    if (c === '}') { if (depth === 0 && tpl.length) { depth = tpl.pop()!; mode = '`'; out += c; i++; continue; } depth--; }
    out += c; i++;
  }
  return out;
}

/** Static + dynamic imports of a source file that load code (not `import type`), resolved to files under src/. */
function importsOf(file: string, code: string): { spec: string; resolved: string | null; line: number }[] {
  const out: { spec: string; resolved: string | null; line: number }[] = [];
  const res = (spec: string) => {
    if (!spec.startsWith('.') && !spec.startsWith('/src/')) return null;
    const base = spec.startsWith('/src/') ? path.join(APP, spec) : path.resolve(path.dirname(file), spec);
    for (const f of [base, `${base}.ts`, path.join(base, 'index.ts')]) if (existsSync(f) && f.endsWith('.ts')) return f;
    return null;
  };
  const lineAt = (i: number) => code.slice(0, i).split('\n').length;
  for (const m of code.matchAll(/\bimport\s+(type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"]+)['"]/g)) if (!m[1]) out.push({ spec: m[2]!, resolved: res(m[2]!), line: lineAt(m.index!) });
  for (const m of code.matchAll(/\bexport\s+(type\s+)?[\w*{}\s,$]*?\s+from\s+['"]([^'"]+)['"]/g)) if (!m[1]) out.push({ spec: m[2]!, resolved: res(m[2]!), line: lineAt(m.index!) });
  for (const m of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push({ spec: m[1]!, resolved: res(m[1]!), line: lineAt(m.index!) });
  return out;
}

/** The film's model names: every *.glb named in TREATMENT.md / KITS.md, plus the Blender scripts' outputs; minus the banned. */
function glbWhitelist(): Set<string> {
  const names = new Set<string>();
  for (const f of [path.join(ROOT, 'TREATMENT.md'), path.join(SRC, 'scenes/KITS.md')]) {
    if (!existsSync(f)) continue;
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/([a-z0-9_]+)\.glb/g)) names.add(m[1]!);
    // KITS §12 table rows: | `well.glb` | … (names also written without the extension in prose)
  }
  const bl = path.join(ROOT, 'tools/blender');
  if (existsSync(bl)) for (const f of readdirSync(bl)) if (f.endsWith('.py') && !f.startsWith('_')) names.add(f.replace(/\.py$/, ''));
  for (const b of BANNED_ASSETS) names.delete(b.replace(/\.glb$/, ''));
  return names;
}

export function lint(o: { all?: boolean } = {}): Finding[] {
  const out: Finding[] = [];
  const add = (file: string, line: number, rule: string, msg: string, src: string, severity: 'fail' | 'warn' = 'fail') => out.push({ file: rel(file), line, rule, severity, msg, src: src.trim().slice(0, 160) });

  // ---- the timeline
  const tlFile = path.join(SRC, 'timeline.ts');
  const tlRaw = readFileSync(tlFile, 'utf8'), tl = stripComments(tlRaw), tlLines = tlRaw.split('\n');
  const onTimeline = new Map<string, number>(); // scene file -> line
  for (const m of tl.matchAll(/\bE\(\s*(?:['"`][^'"`]*['"`]|[^,]+)\s*,\s*['"`]([\w-]+)['"`]/g)) {
    const line = tl.slice(0, m.index!).split('\n').length;
    if (/lint-ok/.test(tlLines[line - 1] ?? '')) continue;
    onTimeline.set(m[1]!, line);
  }
  for (const [f, line] of onTimeline) if ((BANNED_SCENES as readonly string[]).includes(f)) add(tlFile, line, 'timeline-scene', `banned scene '${f}' is on the timeline`, tlLines[line - 1]!);
  for (const m of tl.matchAll(/\bcaption\s*:/g)) {
    const line = tl.slice(0, m.index!).split('\n').length;
    if (!/lint-ok/.test(tlLines[line - 1] ?? '')) add(tlFile, line, 'engine-hud', 'R3: a plate caption on the timeline is drawn by the engine HUD in screen space', tlLines[line - 1]!);
  }

  // ---- everything the timeline's scenes load
  const start = [...onTimeline.keys()].map((f) => path.join(SRC, 'scenes', `${f}.ts`)).filter((f) => existsSync(f));
  if (o.all) for (const f of readdirSync(path.join(SRC, 'scenes'))) if (f.endsWith('.ts') && !f.startsWith('zz_')) start.push(path.join(SRC, 'scenes', f));
  const reach = new Map<string, string>(); // file -> who imported it first
  const queue: [string, string][] = start.map((f) => [f, 'timeline']);
  for (let q = queue.shift(); q; q = queue.shift()) {
    const [f, by] = q;
    if (reach.has(f)) continue;
    reach.set(f, by);
    const raw = readFileSync(f, 'utf8'), code = stripComments(raw), lines = raw.split('\n');
    for (const im of importsOf(f, code)) {
      const base = path.basename(im.spec).replace(/\.ts$/, '');
      if ((BANNED_SCENES as readonly string[]).includes(base) && !/lint-ok/.test(lines[im.line - 1] ?? '')) add(f, im.line, 'banned-import', `imports banned module '${im.spec}'`, lines[im.line - 1]!);
      if (im.resolved && !reach.has(im.resolved)) queue.push([im.resolved, rel(f)]);
    }
  }

  const whitelist = glbWhitelist();
  for (const [f] of reach) {
    const engine = f.startsWith(path.join(SRC, 'engine'));
    const raw = readFileSync(f, 'utf8'), code = stripComments(raw);
    const lines = raw.split('\n'), clines = code.split('\n');
    const ok = (i: number) => /lint-ok/.test(lines[i] ?? '');
    // banned tokens (in code and strings; comments never reach the screen)
    clines.forEach((l, i) => {
      if (ok(i)) return;
      for (const tok of BANNED_TOKENS) if (TOKEN_RE[tok].test(l)) add(f, i + 1, 'banned-token', `${R_OF[tok]}: '${tok}'${engine ? ' (engine file: loaded by every plate)' : ''}`, lines[i]!, engine ? 'warn' : 'fail');
      if (!engine && /\bF\.serif\(/.test(l)) add(f, i + 1, 'banned-token', "R2: 'Cormorant' (F.serif)", lines[i]!);
    });
    if (engine) continue;
    // asset paths
    clines.forEach((l, i) => {
      if (ok(i)) return;
      for (const m of l.matchAll(/['"`]([^'"`]*\.(?:glb|gltf|png|jpe?g|webp|svg|json|ttf|otf|woff2?))['"`]/g)) {
        const p = m[1]!;
        for (const b of BANNED_ASSETS) if (p.includes(b)) add(f, i + 1, 'banned-asset', `loads banned asset '${p}'`, lines[i]!);
        const g = /([\w-]+)\.glb$/.exec(p);
        if (g && !p.includes('${') && !whitelist.has(g[1]!)) add(f, i + 1, 'glb-whitelist', `'${g[1]}.glb' is not one of the film's models (TREATMENT/KITS/tools/blender)`, lines[i]!);
        if (/\.glb$/.test(p) && p.includes('${')) add(f, i + 1, 'glb-whitelist', `templated model path '${p}': the whitelist cannot check it`, lines[i]!, 'warn');
      }
    });
    // R3: screen-space text through a Layer2D the scene composites onto its frame
    const layers = [...code.matchAll(/(?:this\.)?(\w+)\s*(?::\s*Layer2D\s*)?=\s*new\s+Layer2D\b/g)].map((m) => m[1]!);
    if (layers.length) {
      const composited = layers.filter((n) => new RegExp(`\\.draw\\([^;]*\\b${n}\\s*\\.\\s*(?:upload\\(\\)|texture)`).test(code));
      if (composited.length) {
        clines.forEach((l, i) => {
          if (!ok(i) && /\.(fillText|strokeText)\s*\(/.test(l)) add(f, i + 1, 'hud-text', `R3: text drawn into Layer2D '${composited.join("', '")}' composited onto the frame (screen-space text)`, lines[i]!);
        });
      }
    }
    // R3: camera-attached / camera-locked objects
    const camRe: [RegExp, string][] = [
      [/\b(?:this\.)?\w*cam(?:era)?\w*\.add\(/i, 'object parented to the camera'],
      [/\.quaternion\.copy\(\s*(?:this\.)?\w*cam(?:era)?\w*\.quaternion\s*\)/i, 'billboard: copies the camera orientation'],
      [/\.lookAt\(\s*(?:this\.)?\w*cam(?:era)?\w*\.position\b/i, 'billboard: turns to the camera'],
      [/\b(?:this\.)?\w*cam(?:era)?\w*\.position\.clone\(\)\.add(?:ScaledVector)?\(/i, 'placed relative to the camera (camera-locked caption)'],
    ];
    clines.forEach((l, i) => {
      if (ok(i)) return;
      for (const [re, what] of camRe) if (re.test(l)) add(f, i + 1, 'camera-attached', `R3: ${what}`, lines[i]!);
    });
    // R3: the engine's P(doom) HUD readout switched on by a plate
    clines.forEach((l, i) => { if (!ok(i) && /\bpdoom(?:Text)?\s*:\s*(?!0\b|undefined\b)/.test(l)) add(f, i + 1, 'engine-hud', 'R3: turns on the engine HUD P(doom) readout (screen-space text)', lines[i]!); });
  }
  return out;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const found = lint({ all: argv.includes('--all') });
  const fails = found.filter((x) => x.severity === 'fail'), warns = found.filter((x) => x.severity === 'warn');
  const byFile = new Map<string, Finding[]>();
  for (const x of found) (byFile.get(x.file) ?? byFile.set(x.file, []).get(x.file)!).push(x);
  const verbose = argv.includes('--verbose');
  for (const [file, xs] of byFile) {
    console.log(`\n${file}`);
    if (verbose) {
      for (const x of xs.sort((a, b) => a.line - b.line)) console.log(`  ${x.severity === 'fail' ? 'FAIL' : 'warn'} ${String(x.line).padStart(4)}  ${x.rule.padEnd(15)} ${x.msg}\n${' '.repeat(29)}${x.src}`);
      continue;
    }
    // grouped: one row per (severity, rule, message), its lines, and the first source line
    const groups = new Map<string, Finding[]>();
    for (const x of xs.sort((a, b) => a.line - b.line)) { const k = `${x.severity}|${x.rule}|${x.msg}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(x); }
    for (const [, g] of groups) {
      const x = g[0]!, ls = g.map((y) => y.line);
      console.log(`  ${x.severity === 'fail' ? 'FAIL' : 'warn'} ${x.rule.padEnd(15)} ${x.msg}  — line${ls.length > 1 ? 's' : ''} ${ls.length > 8 ? `${ls.slice(0, 8).join(', ')} … (${ls.length})` : ls.join(', ')}\n${' '.repeat(23)}${x.src}`);
    }
  }
  const ji = argv.indexOf('--json');
  if (ji >= 0 && argv[ji + 1]) writeFileSync(argv[ji + 1]!, JSON.stringify({ fails: fails.length, warns: warns.length, findings: found }, null, 1));
  const rules: Record<string, number> = {};
  for (const x of fails) rules[x.rule] = (rules[x.rule] ?? 0) + 1;
  console.log(`\nlint: ${fails.length ? `FAIL — ${fails.length} problems (${Object.entries(rules).map(([k, v]) => `${k} ${v}`).join(', ')})` : 'ok'}${warns.length ? `, ${warns.length} warnings` : ''}`);
  process.exit(fails.length ? 1 : 0);
}
