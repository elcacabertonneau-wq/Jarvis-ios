// Tableaux récapitulatifs : données structurées, 4 dispositions, tri, mise en évidence,
// colonnes masquées. S'affichent en grand et se modifient à la voix.
import * as ui from './ui.js';
import { inline } from './markdown.js';

const { el } = ui;

export const LAYOUTS = { table: 'Tableau', cards: 'Cartes', list: 'Liste', compare: 'Comparer' };
const MAX_COLS = 10;
const MAX_ROWS = 80;

let current = null;   // { data, card, body, seg, sub }
let lastData = null;  // dernier tableau affiché (pour « réaffiche le tableau »)

const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Nombre contenu dans une cellule (« 139 820 km » → 139820), sinon NaN.
function num(v) {
  const m = String(v ?? '').replace(/\s| | /g, '').replace(/(\d),(\d)/g, '$1.$2').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
}
// Colonne numérique : chaque cellule est un nombre, éventuellement suivi d'une courte unité.
const NUM_CELL = /^[~≈<>+\-−–$€£]?\s?\d[\d\s.,\u202f\u00a0]*\s?[%a-zA-Zéû€$£°²³/.]{0,8}$/;
const isNumericCol = (rows, i) => {
  const vals = rows.map((r) => String(r[i] ?? '').trim()).filter(Boolean);
  return vals.length > 0 && vals.every((v) => NUM_CELL.test(v));
};

// Nettoie les données reçues de l'IA ou d'un tableau Markdown.
export function normalize(raw = {}) {
  let columns = (Array.isArray(raw.columns) ? raw.columns : []).map((c) => String(c ?? '').trim()).slice(0, MAX_COLS);
  let rows = Array.isArray(raw.rows) ? raw.rows : [];
  rows = rows.slice(0, MAX_ROWS).map((r) => {
    if (Array.isArray(r)) return r;
    if (r && typeof r === 'object') return columns.length ? columns.map((c) => r[c]) : Object.values(r);
    return [r];
  });
  if (!columns.length && rows.length && raw.rows[0] && typeof raw.rows[0] === 'object' && !Array.isArray(raw.rows[0])) {
    columns = Object.keys(raw.rows[0]).slice(0, MAX_COLS);
  }
  const width = Math.max(columns.length, ...rows.map((r) => r.length), 1);
  while (columns.length < width) columns.push('');
  rows = rows.map((r) => Array.from({ length: width }, (_, i) => String(r[i] ?? '').trim()));
  return {
    title: String(raw.title || 'Récapitulatif').slice(0, 120),
    columns,
    rows,
    note: String(raw.note || '').slice(0, 400),
    layout: LAYOUTS[raw.layout] ? raw.layout : 'table',
    sort: null,        // { col, dir: 1 | -1 }
    highlight: null,   // { type: 'col' | 'row', index }
    hidden: [],        // index des colonnes masquées
  };
}

// Trouve la colonne (ou la ligne) dont le nom ressemble le plus à la demande.
export function findColumn(data, name) {
  const q = fold(name).replace(/^(la |le |les |l )?(colonne )?/, '');
  if (!q) return -1;
  const cols = data.columns.map(fold);
  let i = cols.findIndex((c) => c === q);
  if (i < 0) i = cols.findIndex((c) => c && (c.startsWith(q) || q.startsWith(c)));
  if (i < 0) i = cols.findIndex((c) => c && (c.includes(q) || q.includes(c)));
  if (i < 0) {
    const words = q.split(' ').filter((w) => w.length > 2);
    i = cols.findIndex((c) => words.some((w) => c.includes(w)));
  }
  return i;
}
function findRow(data, name) {
  const q = fold(name).replace(/^(la |le |les |l )?(ligne )?/, '');
  if (!q) return -1;
  const firsts = data.rows.map((r) => fold(r[0]));
  let i = firsts.findIndex((c) => c === q);
  if (i < 0) i = firsts.findIndex((c) => c && (c.includes(q) || q.includes(c)));
  return i;
}

function sortedRows(data) {
  const rows = data.rows.map((r, i) => ({ r, i }));
  if (!data.sort) return rows;
  const { col, dir } = data.sort;
  const numeric = isNumericCol(data.rows, col);
  return rows.sort((a, b) => {
    const x = a.r[col]; const y = b.r[col];
    const d = numeric ? num(x) - num(y) : String(x).localeCompare(String(y), 'fr', { numeric: true, sensitivity: 'base' });
    return d * dir || a.i - b.i;
  });
}

const cell = (v) => el('span', { html: inline(String(v ?? '')) || '<span class="muted">—</span>' });

// ---------- Rendu des 4 dispositions ----------
function renderTable(data) {
  const visible = data.columns.map((_, i) => i).filter((i) => !data.hidden.includes(i));
  const numeric = visible.map((i) => isNumericCol(data.rows, i));
  const hl = data.highlight;
  const head = el('tr', {}, visible.map((i, k) => {
    const sorted = data.sort?.col === i;
    return el('th', {
      class: [numeric[k] ? 'num' : '', hl?.type === 'col' && hl.index === i ? 'hl' : '', sorted ? 'sorted' : ''].join(' ').trim() || null,
      scope: 'col',
      'aria-sort': sorted ? (data.sort.dir > 0 ? 'ascending' : 'descending') : null,
    }, el('button', { type: 'button', class: 'th-btn', title: 'Trier', onclick: () => update({ sort: { col: i, toggle: true } }) },
      data.columns[i] || '', el('span', { class: 'sort-ind', 'aria-hidden': 'true' }, sorted ? (data.sort.dir > 0 ? '▲' : '▼') : '')));
  }));
  const body = sortedRows(data).map(({ r, i: ri }) => el('tr', { class: hl?.type === 'row' && hl.index === ri ? 'hl' : null },
    visible.map((i, k) => el(k === 0 ? 'th' : 'td', {
      scope: k === 0 ? 'row' : null,
      class: [numeric[k] ? 'num' : '', hl?.type === 'col' && hl.index === i ? 'hl' : ''].join(' ').trim() || null,
    }, cell(r[i])))));
  return el('div', { class: 'tbl-wrap' }, el('table', { class: 'rtable' }, el('thead', {}, head), el('tbody', {}, body)));
}

function renderCards(data) {
  const visible = data.columns.map((_, i) => i).filter((i) => i > 0 && !data.hidden.includes(i));
  const hl = data.highlight;
  return el('div', { class: 'rcards' }, sortedRows(data).map(({ r, i: ri }, n) => el('article', {
    class: `rcard${hl?.type === 'row' && hl.index === ri ? ' hl' : ''}`, style: `--i:${Math.min(n, 7)}`,
  },
  el('h4', {}, cell(r[0])),
  el('dl', {}, visible.flatMap((i) => [
    el('dt', { class: hl?.type === 'col' && hl.index === i ? 'hl' : null }, data.columns[i]),
    el('dd', { class: hl?.type === 'col' && hl.index === i ? 'hl' : null }, cell(r[i])),
  ])))));
}

function renderList(data) {
  const visible = data.columns.map((_, i) => i).filter((i) => i > 0 && !data.hidden.includes(i));
  const hl = data.highlight;
  return el('ol', { class: 'rlist' }, sortedRows(data).map(({ r, i: ri }, n) => el('li', {
    class: hl?.type === 'row' && hl.index === ri ? 'hl' : null, style: `--i:${Math.min(n, 7)}`,
  },
  el('span', { class: 'rl-idx' }, String(n + 1)),
  el('div', { class: 'rl-main' },
    el('strong', {}, cell(r[0])),
    el('div', { class: 'rl-meta' }, visible.filter((i) => r[i]).map((i) => el('span', { class: hl?.type === 'col' && hl.index === i ? 'hl' : null },
      el('small', {}, data.columns[i]), cell(r[i]))))))));
}

// Comparaison : chaque ligne devient une colonne (vue « côte à côte »).
function renderCompare(data) {
  const visible = data.columns.map((_, i) => i).filter((i) => i > 0 && !data.hidden.includes(i));
  const rows = sortedRows(data);
  const hl = data.highlight;
  return el('div', { class: 'tbl-wrap' }, el('table', { class: 'rtable compare' },
    el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, data.columns[0] || ''),
      rows.map(({ r, i: ri }) => el('th', { scope: 'col', class: hl?.type === 'row' && hl.index === ri ? 'hl' : null }, cell(r[0]))))),
    el('tbody', {}, visible.map((i) => el('tr', { class: hl?.type === 'col' && hl.index === i ? 'hl' : null },
      el('th', { scope: 'row' }, data.columns[i]),
      rows.map(({ r, i: ri }) => el('td', { class: hl?.type === 'row' && hl.index === ri ? 'hl' : null }, cell(r[i]))))))));
}

const RENDER = { table: renderTable, cards: renderCards, list: renderList, compare: renderCompare };

function subtitle(data) {
  const parts = [`${data.rows.length} ligne${data.rows.length > 1 ? 's' : ''}`, `${data.columns.length - data.hidden.length} colonne${data.columns.length - data.hidden.length > 1 ? 's' : ''}`];
  if (data.sort) parts.push(`trié par ${data.columns[data.sort.col] || '—'} ${data.sort.dir > 0 ? '↑' : '↓'}`);
  if (data.hidden.length) parts.push(`${data.hidden.length} masquée${data.hidden.length > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

// Remplace le contenu avec un court fondu (transition « text swap »).
function paint({ swap = true } = {}) {
  if (!current) return;
  const { data, body, seg, sub } = current;
  const view = el('div', { class: `tview layout-${data.layout}` }, RENDER[data.layout](data));
  if (data.note) view.append(el('p', { class: 'sources' }, data.note));
  body.replaceChildren(view);
  if (swap) view.classList.add('swap-in');
  sub.textContent = subtitle(data);
  seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layout === data.layout)));
}

// ---------- API ----------
export function hasTable() { return !!current?.card?.isConnected; }
export function canRestore() { return !hasTable() && !!lastData; }

export function show(raw, { expand = true } = {}) {
  const data = raw.columns && raw.hidden ? raw : normalize(raw);
  if (!data.rows.length) return null;
  if (hasTable()) ui.removeCard(current.card);
  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Disposition' },
    Object.entries(LAYOUTS).map(([k, label]) => el('button', { type: 'button', 'data-layout': k, 'aria-pressed': 'false', onclick: () => update({ layout: k }) }, label)));
  const sub = el('p', { class: 'tsub' });
  const body = el('div', { class: 'tbody' });
  const wrap = el('div', { class: 'tcontent' }, el('div', { class: 'tbar' }, sub, seg), body);
  const card = ui.card(data.title, wrap, { icon: '📊' });
  card.classList.add('table-card');
  current = { data, card, body, seg, sub };
  lastData = data;
  paint({ swap: false });
  if (expand) ui.expandCard(card);
  return data;
}

export function restore() {
  if (!lastData) return null;
  return show(lastData, { expand: true });
}

// Applique une modification de disposition ; renvoie une phrase courte (ou '' si rien).
export function update(u = {}) {
  if (!hasTable()) {
    if (u.restore && lastData) { restore(); return 'Voici le dernier tableau.'; }
    return '';
  }
  const { data, card } = current;
  const said = [];
  if (u.close) { ui.removeCard(card, true); return 'Tableau fermé.'; }
  if (u.layout && LAYOUTS[u.layout]) { data.layout = u.layout; said.push(`Disposition ${LAYOUTS[u.layout].toLowerCase()}.`); }
  if (u.transpose) { data.layout = data.layout === 'compare' ? 'table' : 'compare'; said.push('Lignes et colonnes inversées.'); }
  if (u.sort) {
    let col = typeof u.sort.col === 'number' ? u.sort.col : (u.sort.column ? findColumn(data, u.sort.column) : data.sort?.col ?? -1);
    if (col < 0 && u.sort.column) return `Je ne trouve pas la colonne « ${u.sort.column} ».`;
    if (col < 0) col = 0;
    let dir = u.sort.order === 'desc' ? -1 : u.sort.order === 'asc' ? 1 : null;
    if (dir === null) dir = u.sort.toggle && data.sort?.col === col ? -data.sort.dir : (u.sort.reverse ? -(data.sort?.dir || 1) : (isNumericCol(data.rows, col) ? -1 : 1));
    data.sort = { col, dir };
    said.push(`Trié par ${data.columns[col]}.`);
  }
  if (u.highlight) {
    const c = findColumn(data, u.highlight);
    const r = c < 0 ? findRow(data, u.highlight) : -1;
    if (c >= 0) data.highlight = { type: 'col', index: c };
    else if (r >= 0) data.highlight = { type: 'row', index: r };
    else return `Je ne trouve pas « ${u.highlight} » dans le tableau.`;
    said.push('Mis en évidence.');
  }
  if (u.clearHighlight) data.highlight = null;
  if (u.hide) {
    const names = Array.isArray(u.hide) ? u.hide : [u.hide];
    names.forEach((n) => { const c = findColumn(data, n); if (c > 0 && !data.hidden.includes(c)) data.hidden.push(c); });
    said.push('Colonne masquée.');
  }
  if (u.showAll) { data.hidden = []; said.push('Toutes les colonnes sont affichées.'); }
  paint();
  if (u.expand === true) ui.expandCard(card);
  if (u.expand === false) ui.collapseCard();
  return said.join(' ');
}

// Résumé compact pour l'IA (pour qu'elle puisse modifier le tableau affiché).
export function describe() {
  if (!hasTable()) return '';
  const { data } = current;
  const json = JSON.stringify({ title: data.title, columns: data.columns, rows: data.rows.slice(0, 30), layout: data.layout });
  return json.length > 3500 ? `${json.slice(0, 3500)}…` : json;
}
