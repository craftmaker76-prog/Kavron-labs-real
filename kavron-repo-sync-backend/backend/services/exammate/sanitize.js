// AI output sanitization + minimal markdown rendering. AI text is untrusted input.
// The model answers in markdown, so the raw text is first converted to HTML
// (headings, bold, italic, lists, code, links, tables) and the result is then
// passed through sanitize-html with a strict allowlist. Raw HTML in the model
// output is escaped before conversion, so it can never become real markup.
const sanitizeHtml = require('sanitize-html');

const ALLOWED_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'strong', 'em', 'ul', 'ol', 'li', 'code', 'pre', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'hr', 'br'];

function sanitizeAiOutput(html) {
  if (typeof html !== 'string') return '';
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['http', 'https'],
    allowedSchemesByTag: {},
    allowedSchemesAppliedToAttributes: ['href'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
  });
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Inline markdown within one already-escaped line. Code spans are pulled out
// first so nothing inside them is parsed as formatting, then restored.
function renderInline(escaped) {
  const codeSpans = [];
  let out = escaped.replace(/`([^`\n]+?)`/g, (_, code) => {
    codeSpans.push(code);
    return '\u0000' + (codeSpans.length - 1) + '\u0000';
  });
  // Images carry no <img> (not allowlisted): keep only the alt text.
  out = out.replace(/!\[([^\]]*)\]\([^)\s]+\)/g, '$1');
  // Links: only http(s) survive; anything else degrades to plain text.
  // The href value is quote-escaped so it cannot break out of the attribute.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => {
    if (/^https?:\/\//i.test(url)) return '<a href="' + url.replace(/"/g, '&quot;') + '">' + text + '</a>';
    return text;
  });
  // Bold first, then italic. Content may not contain '<', so markup can
  // never span across tags created above. Single '*'/'_' italics need a
  // word boundary on both sides, so snake_case words are never mangled.
  out = out.replace(/\*\*([^<]+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[\s(])\*([^<*\n]+?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  out = out.replace(/(^|[\s(])_([^<_\n]+?)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => '<code>' + codeSpans[Number(i)] + '</code>');
  return out;
}

function renderInlineRaw(line) {
  return renderInline(escapeHtml(line));
}

function isTableDelimiter(line) {
  const cells = line.split('|').map((c) => c.trim()).filter((c) => c !== '');
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c));
}

function splitRow(line) {
  let cells = line.split('|').map((c) => c.trim());
  if (cells.length && cells[0] === '') cells = cells.slice(1);
  if (cells.length && cells[cells.length - 1] === '') cells = cells.slice(0, -1);
  return cells;
}

function isBlockStart(trimmed) {
  return trimmed.startsWith('```')
    || /^(#{1,6})\s+/.test(trimmed)
    || /^(-{3,}|\*{3,}|_{3,})\s*$/.test(trimmed)
    || trimmed.startsWith('>')
    || /^[-*+]\s+/.test(trimmed)
    || /^\d+[.)]\s+/.test(trimmed);
}

// Block-level markdown subset: fenced code, ATX headings, horizontal rules,
// blockquotes, unordered/ordered lists, pipe tables, paragraphs.
function markdownToHtml(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    // Fenced code block (content escaped, never parsed as markdown).
    if (trimmed.startsWith('```')) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { buf.push(lines[i]); i++; }
      if (i < lines.length) i++;
      html.push('<pre><code>' + escapeHtml(buf.join('\n')) + '</code></pre>');
      continue;
    }
    // ATX heading.
    const hm = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (hm) {
      html.push('<h' + hm[1].length + '>' + renderInlineRaw(hm[2].trim()) + '</h' + hm[1].length + '>');
      i++;
      continue;
    }
    // Horizontal rule.
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(trimmed)) {
      html.push('<hr>');
      i++;
      continue;
    }
    // Pipe table: header row + delimiter row, then body rows.
    if (trimmed.includes('|') && i + 1 < lines.length && isTableDelimiter(lines[i + 1])) {
      const head = splitRow(line);
      const body = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        body.push(splitRow(lines[i]));
        i++;
      }
      let t = '<table><thead><tr>' + head.map((c) => '<th>' + renderInlineRaw(c) + '</th>').join('') + '</tr></thead>';
      if (body.length) {
        t += '<tbody>' + body.map((row) => '<tr>' + row.map((c) => '<td>' + renderInlineRaw(c) + '</td>').join('') + '</tr>').join('') + '</tbody>';
      }
      t += '</table>';
      html.push(t);
      continue;
    }
    // Blockquote group.
    if (trimmed.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        buf.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      html.push('<blockquote><p>' + buf.map((l) => renderInlineRaw(l)).join('<br>') + '</p></blockquote>');
      continue;
    }
    // List group (one type per group; a type change starts a new list).
    const lm = trimmed.match(/^[-*+]\s+(.+)$/);
    const olm = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (lm || olm) {
      const ordered = !!olm;
      const items = [];
      while (i < lines.length) {
        const t2 = lines[i].trim();
        const m2 = ordered ? t2.match(/^\d+[.)]\s+(.+)$/) : t2.match(/^[-*+]\s+(.+)$/);
        if (!m2) break;
        items.push(m2[1]);
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      html.push('<' + tag + '>' + items.map((it) => '<li>' + renderInlineRaw(it) + '</li>').join('') + '</' + tag + '>');
      continue;
    }
    // Blank line: paragraph separator.
    if (trimmed === '') {
      i++;
      continue;
    }
    // Paragraph: consecutive plain lines (stops before any new block).
    const buf = [];
    while (i < lines.length) {
      const t3 = lines[i].trim();
      if (t3 === '') break;
      if (isBlockStart(t3)) break;
      if (t3.includes('|') && i + 1 < lines.length && isTableDelimiter(lines[i + 1])) break;
      buf.push(lines[i]);
      i++;
    }
    html.push('<p>' + buf.map((l) => renderInlineRaw(l.trim())).join('<br>') + '</p>');
  }
  return html.join('\n');
}

// Convert raw AI markdown text to safe HTML for innerHTML rendering.
function aiTextToSafeHtml(text) {
  if (typeof text !== 'string' || text === '') return '';
  return sanitizeAiOutput(markdownToHtml(text));
}

module.exports = { sanitizeAiOutput, aiTextToSafeHtml };
