// Generates presentation.pptx from presentation.md (slide outline).
// Run: node gen_presentation.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import PptxGenJS from 'pptxgenjs';

const SRC = 'presentation.md';
const OUT = 'presentation.pptx';

const INDIGO = '4F46E5';
const INDIGO_DARK = '312E81';
const INK = '1F2937';
const MUTED = '6B7280';
const BG = 'FFFFFF';
const PANEL = 'EEF2FF';

const md = readFileSync(SRC, 'utf8').split(/\r?\n/);

// ---------- parse ----------
/** @type {{kind:'title'|'section'|'slide', title:string, body:string[]}[]} */
const deck = [];
let h1 = '';
let tagline = '';
let cur = null;

const push = () => { if (cur) deck.push(cur); cur = null; };

for (const raw of md) {
  const line = raw.trimEnd();
  if (!cur) {
    if (line.startsWith('# ') && !line.startsWith('##')) { h1 = line.slice(2).trim(); continue; }
    if (line.startsWith('>')) { tagline = line.replace(/^>\s*/, '').trim(); continue; }
  }
  const h2slide = line.match(/^##\s+Slide\s+\d+\s+—\s+(.+)$/);
  const h3slide = line.match(/^###\s+Slide\s+\d+\s+—\s+(.+)$/);
  const section = line.match(/^##\s+\d+\.\s+(.+)$/);
  if (h2slide || h3slide) {
    push();
    cur = { kind: 'slide', title: (h2slide ?? h3slide)[1].trim(), body: [] };
    continue;
  }
  if (section) {
    push();
    cur = { kind: 'section', title: section[1].trim(), body: [] };
    continue;
  }
  if (cur) cur.body.push(line);
}
push();

// ---------- body line → pptx text runs ----------
function clean(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim();
}

/** Convert markdown-ish body lines into pptxgenjs text objects. */
function bodyToText(lines) {
  const runs = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim() || l.trim() === '---') { i++; continue; }
    if (l.startsWith('|')) {
      // table row → single bullet "cell — cell — cell"; skip separator rows
      const cells = l.split('|').slice(1, -1).map((c) => clean(c)).filter(Boolean);
      if (cells.length && !cells.every((c) => /^:?-{2,}:?$/.test(c))) {
        runs.push({ text: '•  ' + cells.join('  —  '), options: { bullet: false, breakLine: true } });
      }
      i++; continue;
    }
    if (l.startsWith('### ')) {
      runs.push({ text: clean(l.slice(4)), options: { bold: true, color: INDIGO_DARK, fontSize: 15, breakLine: true, paraSpaceBefore: 10 } });
      i++; continue;
    }
    if (/^\[(DIAGRAM|LINK|PLACEHOLDER)/i.test(l.trim())) {
      runs.push({
        text: '▣ ' + clean(l),
        options: { italic: true, color: MUTED, fontSize: 12, breakLine: true, paraSpaceBefore: 6, paraSpaceAfter: 6, fill: { color: PANEL }, margin: 4 },
      });
      i++; continue;
    }
    const bullet = l.match(/^\s*(?:[-*+]|\d+\.)\s+(.*)$/);
    if (bullet) {
      runs.push({ text: '•  ' + clean(bullet[1]), options: { bullet: false, breakLine: true, paraSpaceAfter: 3 } });
    } else if (l.startsWith('>')) {
      runs.push({ text: clean(l.slice(1)), options: { italic: true, color: MUTED, breakLine: true } });
    } else {
      runs.push({ text: clean(l), options: { breakLine: true, paraSpaceAfter: 3 } });
    }
    i++;
  }
  return runs;
}

// ---------- build ----------
const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_16x9';
pptx.author = 'MEEMORY';
pptx.title = 'MEEMORY — Presentation';
pptx.theme = { headFontFace: 'Segoe UI', bodyFontFace: 'Segoe UI' };

const W = 10, H = 5.625;

// Title slide
{
  const s = pptx.addSlide();
  s.background = { color: INDIGO_DARK };
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: H, fill: { color: INDIGO_DARK } });
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: H - 0.9, w: W, h: 0.9, fill: { color: INDIGO } });
  s.addText(h1.replace(/^MEEMORY\s*—\s*/, 'MEEMORY'), {
    x: 0.8, y: 1.7, w: 8.4, h: 1.0, fontSize: 44, bold: true, color: 'FFFFFF', align: 'center',
  });
  s.addText(tagline || 'Your AI conversations finally remember each other.', {
    x: 0.8, y: 2.8, w: 8.4, h: 0.6, fontSize: 20, color: 'C7D2FE', align: 'center', italic: true,
  });
  s.addText('A local-first Manifest V3 browser extension for cross-AI project memory', {
    x: 0.8, y: 4.35, w: 8.4, h: 0.5, fontSize: 14, color: 'E0E7FF', align: 'center',
  });
}

let slideNo = 1;
for (const item of deck) {
  slideNo++;
  if (item.kind === 'section') {
    const s = pptx.addSlide();
    s.background = { color: INDIGO };
    s.addText(item.title, {
      x: 0.8, y: 2.3, w: 8.4, h: 1.0, fontSize: 32, bold: true, color: 'FFFFFF', align: 'center',
    });
    s.addText(`Section ${slideNo - 1}`, {
      x: 0.8, y: 1.7, w: 8.4, h: 0.5, fontSize: 14, color: 'C7D2FE', align: 'center',
    });
    continue;
  }

  const s = pptx.addSlide();
  s.background = { color: BG };
  // accent bar + title
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: 0.12, fill: { color: INDIGO } });
  s.addText(item.title, {
    x: 0.5, y: 0.35, w: 9.0, h: 0.7, fontSize: 26, bold: true, color: INK, valign: 'middle',
  });
  s.addShape(pptx.shapes.LINE, { x: 0.5, y: 1.15, w: 9.0, h: 0, line: { color: 'E5E7EB', width: 1 } });

  const runs = bodyToText(item.body);
  if (runs.length) {
    // split into chunks so long slides paginate instead of overflowing
    const chunkSize = 12;
    for (let start = 0; start < runs.length; start += chunkSize) {
      let target = s;
      if (start > 0) {
        target = pptx.addSlide();
        target.background = { color: BG };
        target.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: 0.12, fill: { color: INDIGO } });
        target.addText(item.title + ' (cont.)', {
          x: 0.5, y: 0.35, w: 9.0, h: 0.7, fontSize: 22, bold: true, color: INK, valign: 'middle',
        });
        target.addShape(pptx.shapes.LINE, { x: 0.5, y: 1.15, w: 9.0, h: 0, line: { color: 'E5E7EB', width: 1 } });
      }
      target.addText(runs.slice(start, start + chunkSize), {
        x: 0.6, y: 1.35, w: 8.8, h: 3.9, fontSize: 14, color: INK, valign: 'top',
      });
    }
  } else {
    s.addText('(content from presentation.md)', { x: 0.6, y: 1.5, w: 8.8, h: 1, fontSize: 14, color: MUTED, italic: true });
  }

  // footer
  s.addText('MEEMORY', { x: 0.5, y: 5.25, w: 2, h: 0.3, fontSize: 10, color: MUTED });
  s.addText(String(slideNo), { x: 9.0, y: 5.25, w: 0.7, h: 0.3, fontSize: 10, color: MUTED, align: 'right' });
}

await pptx.writeFile({ fileName: OUT });
console.log(`wrote ${OUT} (${slideNo + 1} slides)`);
