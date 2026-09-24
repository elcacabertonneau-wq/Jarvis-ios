// Fichiers : Jarvis crée des fichiers de tout type directement sur l'appareil (PDF, Word, Excel, PowerPoint,
// CSV, texte, Markdown, HTML, JSON, code, agenda .ics, contact .vcf, SVG, image, ZIP, modèle 3D .glb)
// et les envoie avec le menu de partage du téléphone (Mail, Messages, WhatsApp, AirDrop, Fichiers…).
// Les bibliothèques de génération ne sont chargées qu'au premier fichier de ce type.
import * as ui from './ui.js';
import { renderMarkdown } from './markdown.js';

const { el } = ui;
const CDN = 'https://cdn.jsdelivr.net/npm';

const CODE = { py: 'Python', js: 'JavaScript', ts: 'TypeScript', css: 'CSS', sql: 'SQL', sh: 'Shell', java: 'Java', c: 'C', cpp: 'C++', cs: 'C#', swift: 'Swift', kt: 'Kotlin', go: 'Go', rs: 'Rust', php: 'PHP', rb: 'Ruby', xml: 'XML', yaml: 'YAML', ino: 'Arduino' };
export const FORMATS = {
  pdf: { label: 'PDF', mime: 'application/pdf', icon: '📕' },
  docx: { label: 'Word', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', icon: '📘' },
  xlsx: { label: 'Excel', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', icon: '📗' },
  pptx: { label: 'PowerPoint', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', icon: '📙' },
  csv: { label: 'CSV', mime: 'text/csv', icon: '🧾' },
  txt: { label: 'Texte', mime: 'text/plain', icon: '📄' },
  md: { label: 'Markdown', mime: 'text/markdown', icon: '📝' },
  html: { label: 'Page web', mime: 'text/html', icon: '🌐' },
  json: { label: 'JSON', mime: 'application/json', icon: '🧩' },
  ics: { label: 'Agenda', mime: 'text/calendar', icon: '📅' },
  vcf: { label: 'Contact', mime: 'text/vcard', icon: '👤' },
  svg: { label: 'Image vectorielle', mime: 'image/svg+xml', icon: '🎨' },
  png: { label: 'Image', mime: 'image/png', icon: '🖼️' },
  zip: { label: 'Archive ZIP', mime: 'application/zip', icon: '🗜️' },
  glb: { label: 'Modèle 3D', mime: 'model/gltf-binary', icon: '🧊' },
  ...Object.fromEntries(Object.entries(CODE).map(([ext, label]) => [ext, { label, mime: 'text/plain', icon: '💻', code: true }])),
};

// Format désigné dans une phrase (« en PDF », « un fichier Excel », « une présentation »…).
export function formatFrom(text = '') {
  const t = String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const rules = [
    [/\bpdf\b/, 'pdf'], [/\b(word|docx|\.doc\b)/, 'docx'], [/\b(excel|xlsx|tableur|feuille de calcul)\b/, 'xlsx'],
    [/\b(powerpoint|pptx|diaporama|slides?|presentation)\b/, 'pptx'], [/\bcsv\b/, 'csv'], [/\bmarkdown\b|\.md\b/, 'md'],
    [/\b(html|page web|site web|site internet|page internet)\b/, 'html'], [/\bjson\b/, 'json'],
    [/\b(ics|calendrier|agenda|evenement|rendez[- ]vous|invitation)\b/, 'ics'], [/\b(vcard|vcf|fiche contact|carte de visite|contact)\b/, 'vcf'],
    [/\b(svg|vectoriel(le)?|logo)\b/, 'svg'], [/\b(zip|archive)\b/, 'zip'], [/\b(glb|gltf|modele 3d|fichier 3d|objet 3d)\b/, 'glb'],
    [/\bpython\b|\.py\b/, 'py'], [/\bjavascript\b|\.js\b/, 'js'], [/\btypescript\b/, 'ts'], [/\bcss\b/, 'css'], [/\bsql\b/, 'sql'],
    [/\b(bash|shell|script sh)\b/, 'sh'], [/\bjava\b/, 'java'], [/\bc\+\+|cpp\b/, 'cpp'], [/\bc#|csharp\b/, 'cs'], [/\bswift\b/, 'swift'],
    [/\bkotlin\b/, 'kt'], [/\bgolang\b|\bgo\b(?= code| script)/, 'go'], [/\brust\b/, 'rs'], [/\bphp\b/, 'php'], [/\bruby\b/, 'rb'],
    [/\bxml\b/, 'xml'], [/\byaml\b|\byml\b/, 'yaml'], [/\barduino\b/, 'ino'], [/\bpng\b|\bimage\b/, 'png'],
    [/\b(txt|fichier texte|texte brut|bloc[- ]notes)\b/, 'txt'],
  ];
  for (const [re, f] of rules) if (re.test(t)) return f;
  return '';
}

const safeName = (s, fallback = 'document') => (String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || fallback);

const scripts = new Map();
function loadScript(src) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      const s = el('script', { src, async: '' });
      s.onload = resolve;
      s.onerror = () => { scripts.delete(src); s.remove(); reject(new Error(`Chargement impossible : ${src}`)); };
      document.head.append(s);
    }));
  }
  return scripts.get(src);
}

// ---------- Markdown → blocs (titres, paragraphes, listes, tableaux, code) ----------
function blocks(md = '') {
  const out = [];
  const lines = String(md).replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^```/.test(l)) {
      const code = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]);
      out.push({ t: 'code', text: code.join('\n') });
    } else if (/^#{1,4}\s/.test(l)) out.push({ t: 'h', level: l.match(/^#+/)[0].length, text: l.replace(/^#+\s*/, '') });
    else if (/^\s*[-*•]\s+/.test(l)) {
      const items = [];
      for (; i < lines.length && /^\s*[-*•]\s+/.test(lines[i]); i++) items.push(lines[i].replace(/^\s*[-*•]\s+/, ''));
      i--;
      out.push({ t: 'ul', items });
    } else if (/^\s*\d+[.)]\s+/.test(l)) {
      const items = [];
      for (; i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i]); i++) items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
      i--;
      out.push({ t: 'ol', items });
    } else if (/^\s*\|/.test(l)) {
      const rows = [];
      for (; i < lines.length && /^\s*\|/.test(lines[i]); i++) if (!/^\s*\|?\s*:?-{2,}/.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      i--;
      if (rows.length) out.push({ t: 'table', rows });
    } else if (/^\s*>\s?/.test(l)) out.push({ t: 'quote', text: l.replace(/^\s*>\s?/, '') });
    else if (/^\s*(---|\*\*\*)\s*$/.test(l)) out.push({ t: 'hr' });
    else if (l.trim()) {
      const para = [l.trim()];
      while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#|```|\s*[-*•]\s|\s*\d+[.)]\s|\s*\||\s*>)/.test(lines[i + 1])) para.push(lines[++i].trim());
      out.push({ t: 'p', text: para.join(' ') });
    }
  }
  return out;
}
// « texte **gras** et *italique* » → segments.
function runs(text = '') {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    const s = m[0];
    if (s.startsWith('**')) out.push({ text: s.slice(2, -2), bold: true });
    else if (s.startsWith('`')) out.push({ text: s.slice(1, -1), code: true });
    else if (s.startsWith('[')) { const mm = s.match(/\[([^\]]+)\]\(([^)]+)\)/); out.push({ text: mm[1], link: mm[2] }); }
    else out.push({ text: s.slice(1, -1), italics: true });
    last = m.index + s.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.length ? out : [{ text }];
}
const plain = (s) => runs(s).map((r) => r.text).join('');

// ---------- Constructeurs par format ----------
async function buildPDF(spec) {
  await loadScript(`${CDN}/pdfmake@0.2.20/build/pdfmake.min.js`);
  await loadScript(`${CDN}/pdfmake@0.2.20/build/vfs_fonts.js`);
  const inl = (s) => runs(s).map((r) => ({ text: r.text, bold: r.bold, italics: r.italics, link: r.link, color: r.link ? '#0a66c2' : undefined, decoration: r.link ? 'underline' : undefined, background: r.code ? '#eef1f5' : undefined }));
  const content = [];
  if (spec.title) content.push({ text: spec.title, style: 'title' });
  for (const b of blocks(spec.markdown || spec.content || '')) {
    if (b.t === 'h') content.push({ text: inl(b.text), style: `h${Math.min(b.level, 3)}` });
    else if (b.t === 'p') content.push({ text: inl(b.text), margin: [0, 0, 0, 8] });
    else if (b.t === 'ul') content.push({ ul: b.items.map(inl), margin: [0, 0, 0, 8] });
    else if (b.t === 'ol') content.push({ ol: b.items.map(inl), margin: [0, 0, 0, 8] });
    else if (b.t === 'quote') content.push({ text: inl(b.text), italics: true, color: '#555', margin: [12, 0, 0, 8] });
    else if (b.t === 'code') content.push({ table: { widths: ['*'], body: [[{ text: b.text, fontSize: 9, color: '#1f2937' }]] }, layout: { fillColor: '#f3f4f6', hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 8, paddingTop: () => 6, paddingBottom: () => 6 }, margin: [0, 0, 0, 8] });
    else if (b.t === 'hr') content.push({ canvas: [{ type: 'line', x1: 0, y1: 4, x2: 515, y2: 4, lineColor: '#d0d7de' }], margin: [0, 4, 0, 10] });
    else if (b.t === 'table') {
      const n = Math.max(...b.rows.map((r) => r.length));
      const body = b.rows.map((r, i) => Array.from({ length: n }, (_, j) => ({ text: plain(r[j] || ''), bold: i === 0, fillColor: i === 0 ? '#e8f4fb' : undefined, fontSize: 10 })));
      content.push({ table: { headerRows: 1, widths: Array(n).fill('*'), body }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 10] });
    }
  }
  const doc = {
    info: { title: spec.title || spec.name },
    content,
    defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.25 },
    styles: {
      title: { fontSize: 22, bold: true, color: '#0b3d5c', margin: [0, 0, 0, 14] },
      h1: { fontSize: 17, bold: true, color: '#0b3d5c', margin: [0, 12, 0, 6] },
      h2: { fontSize: 14, bold: true, color: '#135d86', margin: [0, 10, 0, 5] },
      h3: { fontSize: 12, bold: true, color: '#1f2937', margin: [0, 8, 0, 4] },
    },
    footer: (page, count) => ({ text: `${page} / ${count}`, alignment: 'center', fontSize: 8, color: '#888', margin: [0, 10, 0, 0] }),
    pageMargins: [40, 40, 40, 50],
  };
  return new Promise((resolve) => window.pdfMake.createPdf(doc).getBlob(resolve));
}

async function buildDOCX(spec) {
  const d = await import(`${CDN}/docx@9.7.2/+esm`);
  const tr = (s) => runs(s).map((r) => (r.link
    ? new d.ExternalHyperlink({ link: r.link, children: [new d.TextRun({ text: r.text, style: 'Hyperlink' })] })
    : new d.TextRun({ text: r.text, bold: r.bold, italics: r.italics, font: r.code ? 'Consolas' : undefined })));
  const children = [];
  if (spec.title) children.push(new d.Paragraph({ text: spec.title, heading: d.HeadingLevel.TITLE }));
  const H = [d.HeadingLevel.HEADING_1, d.HeadingLevel.HEADING_2, d.HeadingLevel.HEADING_3, d.HeadingLevel.HEADING_4];
  for (const b of blocks(spec.markdown || spec.content || '')) {
    if (b.t === 'h') children.push(new d.Paragraph({ children: tr(b.text), heading: H[b.level - 1] }));
    else if (b.t === 'p') children.push(new d.Paragraph({ children: tr(b.text), spacing: { after: 120 } }));
    else if (b.t === 'ul') b.items.forEach((it) => children.push(new d.Paragraph({ children: tr(it), bullet: { level: 0 } })));
    else if (b.t === 'ol') b.items.forEach((it) => children.push(new d.Paragraph({ children: tr(it), numbering: { reference: 'num', level: 0 } })));
    else if (b.t === 'quote') children.push(new d.Paragraph({ children: tr(b.text), indent: { left: 400 }, style: 'Quote' }));
    else if (b.t === 'code') b.text.split('\n').forEach((line) => children.push(new d.Paragraph({ children: [new d.TextRun({ text: line || ' ', font: 'Consolas', size: 18 })] })));
    else if (b.t === 'hr') children.push(new d.Paragraph({ text: '', border: { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: 'D0D7DE' } } }));
    else if (b.t === 'table') {
      const n = Math.max(...b.rows.map((r) => r.length));
      children.push(new d.Table({
        width: { size: 100, type: d.WidthType.PERCENTAGE },
        rows: b.rows.map((r, i) => new d.TableRow({ tableHeader: i === 0, children: Array.from({ length: n }, (_, j) => new d.TableCell({
          shading: i === 0 ? { fill: 'E8F4FB', type: d.ShadingType.CLEAR, color: 'auto' } : undefined,
          children: [new d.Paragraph({ children: [new d.TextRun({ text: plain(r[j] || ''), bold: i === 0 })] })],
        })) })),
      }));
      children.push(new d.Paragraph({ text: '' }));
    }
  }
  const doc = new d.Document({
    creator: 'Jarvis', title: spec.title || spec.name,
    numbering: { config: [{ reference: 'num', levels: [{ level: 0, format: d.LevelFormat.DECIMAL, text: '%1.', alignment: d.AlignmentType.START }] }] },
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children }],
  });
  return d.Packer.toBlob(doc);
}

// Cellule : nombre si c'en est un (« 1 234,5 » → 1234.5), sinon texte.
const cell = (v) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim();
  const n = s.replace(/\s/g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(n) && s.length < 16 ? +n : s;
};
function sheetsOf(spec) {
  if (Array.isArray(spec.sheets) && spec.sheets.length) return spec.sheets;
  const t = blocks(spec.markdown || '').find((b) => b.t === 'table');
  return t ? [{ name: spec.title || 'Feuille 1', columns: t.rows[0], rows: t.rows.slice(1) }] : [];
}
async function buildXLSX(spec) {
  await loadScript(`${CDN}/xlsx@0.18.5/dist/xlsx.full.min.js`);
  const X = window.XLSX;
  const wb = X.utils.book_new();
  const sheets = sheetsOf(spec);
  if (!sheets.length) throw new Error('Aucune donnée pour le tableur');
  sheets.slice(0, 10).forEach((sh, i) => {
    const aoa = [sh.columns || [], ...(sh.rows || []).map((r) => r.map(cell))];
    const ws = X.utils.aoa_to_sheet(aoa);
    ws['!cols'] = (sh.columns || []).map((c, j) => ({ wch: Math.min(40, Math.max(8, String(c).length + 2, ...(sh.rows || []).slice(0, 50).map((r) => String(r[j] ?? '').length + 1))) }));
    if (sh.columns?.length) ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: sh.columns.length - 1 } }) };
    X.utils.book_append_sheet(wb, ws, String(sh.name || `Feuille ${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  });
  const buf = X.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([buf], { type: FORMATS.xlsx.mime });
}
function buildCSV(spec) {
  const sh = sheetsOf(spec)[0];
  if (!sh) return new Blob([spec.code || spec.markdown || ''], { type: 'text/csv' });
  const esc = (v) => { const s = String(v ?? ''); return /[";\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  // Point-virgule : ouverture directe dans Excel en français.
  const text = [sh.columns || [], ...(sh.rows || [])].map((r) => r.map(esc).join(';')).join('\r\n');
  return new Blob([`\ufeff${text}`], { type: 'text/csv;charset=utf-8' });
}

async function buildPPTX(spec) {
  await loadScript(`${CDN}/pptxgenjs@3.12.0/dist/pptxgen.bundle.js`);
  const pptx = new window.PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = spec.title || spec.name;
  const BG = '0B1220';
  const ACC = '35D6FF';
  const first = pptx.addSlide();
  first.background = { color: BG };
  first.addText(spec.title || 'Présentation', { x: 0.8, y: 2.3, w: 11.7, h: 1.4, fontSize: 40, bold: true, color: 'FFFFFF', fontFace: 'Calibri' });
  if (spec.subtitle) first.addText(spec.subtitle, { x: 0.8, y: 3.7, w: 11.7, h: 0.8, fontSize: 20, color: ACC });
  first.addShape(pptx.ShapeType.rect, { x: 0.8, y: 2.1, w: 1.4, h: 0.08, fill: { color: ACC } });
  for (const s of (spec.slides || []).slice(0, 40)) {
    const sl = pptx.addSlide();
    sl.background = { color: BG };
    sl.addShape(pptx.ShapeType.rect, { x: 0.6, y: 0.55, w: 0.1, h: 0.75, fill: { color: ACC } });
    sl.addText(s.title || '', { x: 0.85, y: 0.45, w: 11.8, h: 0.95, fontSize: 30, bold: true, color: 'FFFFFF' });
    const bullets = (s.bullets || []).slice(0, 8);
    if (s.quote) sl.addText(`« ${s.quote} »`, { x: 1.2, y: 2.2, w: 10.9, h: 3, fontSize: 28, italic: true, color: ACC, align: 'center', valign: 'middle' });
    else if (bullets.length) {
      sl.addText(bullets.map((b) => ({ text: plain(b), options: { bullet: { code: '25A0' }, color: 'E6F6FF', breakLine: true } })), {
        x: 0.85, y: 1.6, w: s.image ? 7.2 : 11.8, h: 5.2, fontSize: bullets.length > 5 ? 18 : 22, valign: 'top', paraSpaceAfter: 10,
      });
    }
    if (s.image && /^https:/.test(s.image)) {
      try { sl.addImage({ path: s.image, x: 8.3, y: 1.6, w: 4.4, h: 3.3, sizing: { type: 'contain', w: 4.4, h: 3.3 } }); } catch { /* image ignorée */ }
    }
    if (s.notes) sl.addNotes(s.notes);
  }
  return pptx.write({ outputType: 'blob' });
}

const icsDate = (v, allDay) => {
  const d = new Date(v);
  if (Number.isNaN(+d)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return allDay ? `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` : `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
};
const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
function buildICS(spec) {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const ev = (spec.events || []).slice(0, 50).map((e, i) => {
    const start = icsDate(e.start, e.allDay);
    if (!start) return '';
    const end = icsDate(e.end || new Date(new Date(e.start).getTime() + (e.allDay ? 86400000 : 3600000)), e.allDay);
    return ['BEGIN:VEVENT', `UID:${Date.now()}-${i}@jarvis`, `DTSTAMP:${now}`,
      e.allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`, e.allDay ? `DTEND;VALUE=DATE:${end}` : `DTEND:${end}`,
      `SUMMARY:${icsText(e.title)}`, e.location ? `LOCATION:${icsText(e.location)}` : '', e.description ? `DESCRIPTION:${icsText(e.description)}` : '',
      e.reminder !== false && !e.allDay ? 'BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Rappel\r\nTRIGGER:-PT30M\r\nEND:VALARM' : '',
      'END:VEVENT'].filter(Boolean).join('\r\n');
  }).filter(Boolean);
  if (!ev.length) throw new Error('Aucun événement valide');
  return new Blob([['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Jarvis//FR', 'CALSCALE:GREGORIAN', ...ev, 'END:VCALENDAR'].join('\r\n')], { type: 'text/calendar' });
}
function buildVCF(spec) {
  const esc = (s) => String(s || '').replace(/[,;]/g, (c) => `\\${c}`);
  const cards = (spec.contacts || []).slice(0, 100).map((c) => {
    const [first = '', ...rest] = String(c.name || '').split(' ');
    return ['BEGIN:VCARD', 'VERSION:3.0', `FN:${esc(c.name)}`, `N:${esc(rest.join(' '))};${esc(first)};;;`,
      c.company ? `ORG:${esc(c.company)}` : '', c.title ? `TITLE:${esc(c.title)}` : '', c.phone ? `TEL;TYPE=CELL:${c.phone}` : '',
      c.email ? `EMAIL;TYPE=INTERNET:${c.email}` : '', c.address ? `ADR;TYPE=HOME:;;${esc(c.address)};;;;` : '',
      c.website ? `URL:${c.website}` : '', c.birthday ? `BDAY:${c.birthday}` : '', c.note ? `NOTE:${esc(c.note)}` : '', 'END:VCARD'].filter(Boolean).join('\r\n');
  });
  if (!cards.length) throw new Error('Aucun contact');
  return new Blob([cards.join('\r\n')], { type: 'text/vcard' });
}
function buildHTML(spec) {
  if (/<html|<body|<div|<style/i.test(spec.code || '')) return new Blob([spec.code], { type: 'text/html' });
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${(spec.title || spec.name || '').replace(/</g, '&lt;')}</title>
<style>body{font:17px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#1f2937}h1,h2,h3{color:#0b3d5c;line-height:1.25}table{border-collapse:collapse;width:100%;margin:1em 0}th,td{border:1px solid #d0d7de;padding:6px 10px;text-align:left}th{background:#e8f4fb}code,pre{background:#f3f4f6;border-radius:6px}pre{padding:12px;overflow:auto}blockquote{border-left:4px solid #35d6ff;margin:0;padding-left:14px;color:#555}</style></head>
<body>${spec.title ? `<h1>${spec.title.replace(/</g, '&lt;')}</h1>` : ''}${renderMarkdown(spec.markdown || spec.content || '')}</body></html>`;
  return new Blob([html], { type: 'text/html' });
}

// spec → { blob, name, format }. `spec.format` : clé de FORMATS ; `spec.files` pour une archive ZIP.
export async function build(spec) {
  const format = FORMATS[spec.format] ? spec.format : 'txt';
  const base = safeName(spec.name || spec.title);
  let blob;
  switch (format) {
    case 'pdf': blob = await buildPDF(spec); break;
    case 'docx': blob = await buildDOCX(spec); break;
    case 'xlsx': blob = await buildXLSX(spec); break;
    case 'pptx': blob = await buildPPTX(spec); break;
    case 'csv': blob = buildCSV(spec); break;
    case 'ics': blob = buildICS(spec); break;
    case 'vcf': blob = buildVCF(spec); break;
    case 'html': blob = buildHTML(spec); break;
    case 'json': {
      let text = spec.code || spec.markdown || '{}';
      try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* laissé tel quel */ }
      blob = new Blob([text], { type: 'application/json' });
      break;
    }
    case 'png': case 'glb': blob = spec.blob; break;
    case 'zip': {
      await loadScript(`${CDN}/jszip@3.10.1/dist/jszip.min.js`);
      const zip = new window.JSZip();
      for (const f of (spec.files || []).slice(0, 30)) {
        const built = await build(f);
        zip.file(built.name, built.blob);
      }
      blob = await zip.generateAsync({ type: 'blob' });
      break;
    }
    default: blob = new Blob([spec.code ?? spec.markdown ?? spec.content ?? ''], { type: `${FORMATS[format].mime};charset=utf-8` });
  }
  if (!blob) throw new Error('Fichier vide');
  const file = { blob, format, name: `${base}.${format}`, title: spec.title || base, spec, at: Date.now() };
  created.unshift(file);
  created.length = Math.min(created.length, 20);
  return file;
}

export const created = []; // fichiers créés pendant la session (le plus récent en premier)
export const last = () => created[0] || null;

// ---------- Envoi ----------
// Menu de partage du téléphone (doit être déclenché par un toucher) ; sinon téléchargement.
export async function share(file) {
  const f = new File([file.blob], file.name, { type: file.blob.type || FORMATS[file.format]?.mime || 'application/octet-stream' });
  if (navigator.canShare?.({ files: [f] })) {
    try { await navigator.share({ files: [f], title: file.title }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  download(file);
  return 'downloaded';
}
export function download(file) {
  const url = URL.createObjectURL(file.blob);
  const a = el('a', { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function openFile(file) {
  const url = URL.createObjectURL(file.blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

const size = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(n / 1e3))} Ko`);

// Aperçu du contenu dans la carte.
function preview(file) {
  const s = file.spec || {};
  if (file.format === 'png') return el('img', { class: 'hero-img', src: URL.createObjectURL(file.blob), alt: file.title });
  if (['pdf', 'docx', 'md', 'html', 'txt'].includes(file.format) && (s.markdown || s.content)) {
    return el('div', { class: 'md file-md', html: renderMarkdown(String(s.markdown || s.content).split('\n').slice(0, 60).join('\n')) });
  }
  if (['xlsx', 'csv'].includes(file.format)) {
    const sh = sheetsOf(s)[0];
    if (sh) return el('div', { class: 'file-table' }, el('table', {}, el('thead', {}, el('tr', {}, (sh.columns || []).map((c) => el('th', {}, String(c))))),
      el('tbody', {}, (sh.rows || []).slice(0, 8).map((r) => el('tr', {}, r.map((c) => el('td', {}, String(c ?? '')))))),
      (sh.rows || []).length > 8 ? el('caption', {}, `… ${sh.rows.length} lignes au total`) : null));
  }
  if (file.format === 'pptx') return el('ol', { class: 'file-list' }, el('li', {}, el('b', {}, s.title || 'Titre')), (s.slides || []).map((x) => el('li', {}, x.title || '')));
  if (file.format === 'ics') return el('ul', { class: 'file-list' }, (s.events || []).map((e) => el('li', {}, `${e.title} — ${new Date(e.start).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: e.allDay ? undefined : 'short' })}${e.location ? ` · ${e.location}` : ''}`)));
  if (file.format === 'vcf') return el('ul', { class: 'file-list' }, (s.contacts || []).map((c) => el('li', {}, [c.name, c.phone, c.email].filter(Boolean).join(' · '))));
  if (file.format === 'zip') return el('ul', { class: 'file-list' }, (s.files || []).map((f) => el('li', {}, `${safeName(f.name || f.title)}.${f.format}`)));
  if (s.code) return el('pre', { class: 'file-code' }, String(s.code).split('\n').slice(0, 60).join('\n'));
  return null;
}

// Carte d'un fichier : aperçu, envoi, téléchargement, ouverture.
export function card(file, { onSent } = {}) {
  const fmt = FORMATS[file.format] || FORMATS.txt;
  const sendBtn = el('button', { type: 'button', class: 'primary file-send', onclick: async () => {
    const r = await share(file);
    onSent?.(r);
  } }, '📤 Envoyer');
  const body = el('div', { class: 'file' },
    el('div', { class: 'file-head' }, el('span', { class: 'file-ico', 'aria-hidden': 'true' }, fmt.icon),
      el('div', {}, el('b', {}, file.name), el('small', {}, `${fmt.label} · ${size(file.blob.size)}`))),
    preview(file),
    el('div', { class: 'actions-row' }, sendBtn,
      ui.chip('⬇️ Télécharger', () => download(file)),
      ['pdf', 'html', 'txt', 'png', 'svg', 'json', 'md', 'csv'].includes(file.format) || fmt.code ? ui.chip('👁️ Ouvrir', () => openFile(file)) : null));
  return ui.card(`Fichier · ${file.title}`, body, { icon: fmt.icon, kind: 'file' });
}
