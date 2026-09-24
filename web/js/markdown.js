// Mini rendu Markdown sûr (le HTML est échappé avant toute transformation).
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = esc(s)
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" style="max-width:100%;border-radius:10px">')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
}

// Certaines IA écrivent un tableau sur une seule ligne (« | A | B |---|---| 1 | 2 | 3 | 4 | ») :
// on le reconstruit ligne par ligne grâce au nombre de colonnes donné par la ligne de séparation.
export function fixTables(src = '') {
  return String(src).replace(/\r\n?/g, '\n').split('\n').map((line) => {
    if (!/\|\s*:?-{3,}:?\s*\|/.test(line)) return line;
    const tokens = line.split('|').map((t) => t.trim());
    const s = tokens.findIndex((t) => /^:?-{3,}:?$/.test(t));
    let n = 0;
    while (s + n < tokens.length && /^:?-{3,}:?$/.test(tokens[s + n])) n++;
    const before = tokens.slice(0, s).filter(Boolean);
    const after = tokens.slice(s + n).filter(Boolean);
    if (n < 2 || before.length < n || (after.length && after.length % n !== 0 && after.length < n)) return line;
    // Ligne déjà correcte (séparateur seul) : rien à faire.
    if (!before.length && !after.length) return line;
    const header = before.slice(-n);
    const prefix = before.slice(0, before.length - n).join(' | ');
    const rows = [];
    for (let i = 0; i + n <= after.length; i += n) rows.push(after.slice(i, i + n));
    const rest = after.slice(rows.length * n).join(' ');
    return [prefix, `| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`), rest].filter(Boolean).join('\n');
  }).join('\n');
}

export function renderMarkdown(src = '') {
  const lines = fixTables(src).split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${renderMarkdown(buf.join('\n'))}</blockquote>`);
      continue;
    }

    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ''))}</li>`);
        i++;
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const row = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = row(line);
      i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(row(lines[i++]));
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${
        body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }

    if (!line.trim()) { i++; continue; }

    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*>|\s*([-*+]|\d+[.)])\s+)/.test(lines[i])) buf.push(lines[i++]);
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

// Retire la mise en forme pour la synthèse vocale.
export function stripMarkdown(s = '') {
  return String(s)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>|~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extrait le premier tableau Markdown d'un texte : { columns, rows, rest } ou null.
export function extractTable(src = '') {
  const lines = fixTables(src).split('\n');
  const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!isRow(lines[i]) || !/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) continue;
    const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    let j = i + 2;
    const rows = [];
    while (j < lines.length && isRow(lines[j])) rows.push(cells(lines[j++]));
    const rest = [...lines.slice(0, i), ...lines.slice(j)].join('\n').trim();
    return { columns: cells(lines[i]), rows, rest };
  }
  return null;
}
