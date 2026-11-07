// Pure, testable helpers shared by the browser UI and test.js (Node).
// No DOM, no network, no secrets. ESM so both environments can import it.

export function countWords(text) {
  const t = String(text || "");
  const words = t.trim() ? t.trim().split(/\s+/).length : 0;
  const chars = t.length;
  const charsNoSpaces = t.replace(/\s/g, "").length;
  const sentences = t.trim() ? (t.match(/[^.!?]+[.!?]+/g) || []).length || (t.trim() ? 1 : 0) : 0;
  const paragraphs = t.trim() ? t.split(/\n\s*\n/).filter((p) => p.trim()).length : 0;
  return { words, chars, charsNoSpaces, sentences, paragraphs, readingMinutes: readingTime(words) };
}

export function readingTime(words) {
  // 200 words per minute, minimum 0, rounded to 1 decimal for display by caller.
  return words === 0 ? 0 : Math.max(0.1, Math.round((words / 200) * 10) / 10);
}

export function convertCase(text, mode) {
  const t = String(text || "");
  const words = t.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/\s+/).filter(Boolean);
  switch (mode) {
    case "upper": return t.toUpperCase();
    case "lower": return t.toLowerCase();
    case "title": return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    case "sentence": {
      const lower = t.toLowerCase();
      return lower.replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, (m) => m.toUpperCase());
    }
    case "camel": return words.map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
    case "snake": return words.map((w) => w.toLowerCase()).join("_");
    case "kebab": return words.map((w) => w.toLowerCase()).join("-");
    default: return t;
  }
}

export function slugify(text) {
  return String(text || "").toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function validateJson(text) {
  try {
    const parsed = JSON.parse(String(text || ""));
    return { ok: true, parsed, formatted: JSON.stringify(parsed, null, 2), minified: JSON.stringify(parsed) };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export function urlEncode(text) { return encodeURIComponent(String(text || "")); }
export function urlDecode(text) {
  try { return { ok: true, value: decodeURIComponent(String(text || "")) }; }
  catch (e) { return { ok: false, error: "Invalid percent-encoding: " + String(e.message || e) }; }
}

export function percentageCalc(mode, a, b) {
  const x = Number(a), y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, error: "Enter valid numbers." };
  if (mode === "percent-of") return { ok: true, result: (x / 100) * y, label: `${x}% of ${y}` };
  if (mode === "is-what-percent") {
    if (y === 0) return { ok: false, error: "The second number cannot be 0 for this calculation." };
    return { ok: true, result: (x / y) * 100, label: `${x} is what % of ${y}` };
  }
  if (mode === "change") {
    if (x === 0) return { ok: false, error: "The starting value cannot be 0 for percentage change." };
    return { ok: true, result: ((y - x) / Math.abs(x)) * 100, label: `Change from ${x} to ${y}` };
  }
  return { ok: false, error: "Unknown percentage mode." };
}

export function discountCalc(price, discountPct, taxPct) {
  const p = Number(price), d = Number(discountPct || 0), t = Number(taxPct || 0);
  if (!Number.isFinite(p) || p < 0) return { ok: false, error: "Price must be 0 or more." };
  if (d < 0 || d > 100) return { ok: false, error: "Discount must be between 0 and 100." };
  if (t < 0 || t > 100) return { ok: false, error: "Tax must be between 0 and 100." };
  const savings = p * (d / 100);
  const afterDiscount = p - savings;
  const tax = afterDiscount * (t / 100);
  return { ok: true, savings, afterDiscount, tax, final: afterDiscount + tax };
}

export function trimMeta(text, max = 160) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 3);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut) + "...";
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || "").trim());
}

export function base64Encode(text) {
  const bytes = new TextEncoder().encode(String(text || ""));
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let bin = ""; bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}
export function base64Decode(text) {
  try {
    let bytes;
    if (typeof Buffer !== "undefined") bytes = new Uint8Array(Buffer.from(String(text || "").trim(), "base64"));
    else {
      const bin = atob(String(text || "").trim());
      bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    }
    return { ok: true, value: new TextDecoder().decode(bytes) };
  } catch (e) { return { ok: false, error: "Invalid Base64 input." }; }
}

const LOREM = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.",
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.",
  "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia."
];
export function loremGenerator(paragraphs) {
  const n = Math.max(1, Math.min(10, Number(paragraphs) || 3));
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = [];
    for (let j = 0; j < 3; j++) s.push(LOREM[(i + j) % LOREM.length]);
    out.push(s.join(" "));
  }
  return out.join("\n\n");
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(hex || "").trim());
  if (!m) return { ok: false, error: "Enter a valid hex colour, e.g. #2563eb." };
  let h = m[1]; if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return { ok: true, r, g, b, rgb: `rgb(${r}, ${g}, ${b})` };
}
export function rgbToHex(r, g, b) {
  const vals = [r, g, b].map(Number);
  if (vals.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) return { ok: false, error: "RGB values must be integers 0–255." };
  return { ok: true, hex: "#" + vals.map((v) => v.toString(16).padStart(2, "0")).join("") };
}

export function robotsGenerator(allowAll, sitemapUrl) {
  let out = allowAll ? "User-agent: *\nAllow: /\n" : "User-agent: *\nDisallow: /\n";
  if (sitemapUrl && sitemapUrl.trim()) out += `\nSitemap: ${sitemapUrl.trim()}\n`;
  return out;
}
export function sitemapGenerator(urls) {
  const list = String(urls || "").split(/\n/).map((u) => u.trim()).filter(Boolean);
  const body = list.map((u) => `  <url><loc>${u.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// Minimal hand-rolled PDF builder: one JPEG image per page.
// images: [{width, height, data: Uint8Array (JPEG bytes)}]
// Returns a Uint8Array whose first bytes are %PDF- and which contains /Type /Page.
export function buildPdf(images) {
  if (!images || images.length === 0) throw new Error("No images supplied.");
  const enc = new TextEncoder();
  const parts = []; // Uint8Array chunks
  let offset = 0;
  const offsets = [0];
  function push(bytes) { parts.push(bytes); offset += bytes.length; }
  function pushStr(s) { push(enc.encode(s)); }
  pushStr("%PDF-1.4\n");
  // Object numbering: 1 = Catalog, 2 = Pages, then per image: Page, Image XObject.
  const nImages = images.length;
  const totalObjects = 2 + nImages * 2;
  const pageKids = [];
  for (let i = 0; i < nImages; i++) pageKids.push(`${3 + i * 2} 0 R`);
  offsets[1] = offset;
  pushStr(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  offsets[2] = offset;
  pushStr(`2 0 obj\n<< /Type /Pages /Kids [${pageKids.join(" ")}] /Count ${nImages} >>\nendobj\n`);
  images.forEach((img, i) => {
    const pageObj = 3 + i * 2, imgObj = 4 + i * 2;
    const w = Math.max(1, Math.round(img.width)), h = Math.max(1, Math.round(img.height));
    // Fit within A4-ish page (595 x 842 pt) preserving aspect.
    const scale = Math.min(595 / w, 842 / h, 1);
    const dw = Math.round(w * scale), dh = Math.round(h * scale);
    const content = `q ${dw} 0 0 ${dh} 0 0 cm /Im${i} Do Q`;
    const contentObj = totalObjects + 1 + i; // content streams appended after image objects
    offsets[pageObj] = offset;
    pushStr(`${pageObj} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im${i} ${imgObj} 0 R >> >> /Contents ${contentObj} 0 R >>\nendobj\n`);
    offsets[imgObj] = offset;
    pushStr(`${imgObj} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.data.length} >>\nstream\n`);
    push(img.data);
    pushStr("\nendstream\nendobj\n");
  });
  const contentStart = totalObjects + 1;
  images.forEach((img, i) => {
    const content = `q ${Math.round(Math.min(595 / Math.max(1, img.width), 842 / Math.max(1, img.height), 1) * img.width)} 0 0 ${Math.round(Math.min(595 / Math.max(1, img.width), 842 / Math.max(1, img.height), 1) * img.height)} 0 0 cm /Im${i} Do Q`;
    offsets[contentStart + i] = offset;
    pushStr(`${contentStart + i} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
  });
  const xrefPos = offset;
  const total = contentStart + nImages - 1; // highest object number
  let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let o = 1; o <= total; o++) xref += `${String(offsets[o] || 0).padStart(10, "0")} 00000 n \n`;
  pushStr(xref);
  pushStr(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);
  const out = new Uint8Array(offset);
  let p = 0; for (const chunk of parts) { out.set(chunk, p); p += chunk.length; }
  return out;
}

// ---- Phase 3 pure helpers (DOM-free, unit-testable) ----

export function profitMargin(cost, price) {
  const c = Number(cost), p = Number(price);
  if (!Number.isFinite(c) || !Number.isFinite(p) || c < 0 || p <= 0) return { ok: false, error: "Enter a cost of 0 or more and a selling price above 0." };
  const profit = p - c;
  return { ok: true, profit, marginPct: (profit / p) * 100, markupPct: c === 0 ? (profit > 0 ? Infinity : 0) : (profit / c) * 100 };
}

export function salesTax(price, rate) {
  const p = Number(price), r = Number(rate);
  if (!Number.isFinite(p) || p < 0) return { ok: false, error: "Price must be 0 or more." };
  if (!Number.isFinite(r) || r < 0 || r > 100) return { ok: false, error: "Tax rate must be between 0 and 100." };
  const tax = p * (r / 100);
  return { ok: true, tax, total: p + tax };
}

export function budgetCalc(income, expenses) {
  const inc = Number(income);
  if (!Number.isFinite(inc) || inc < 0) return { ok: false, error: "Income must be 0 or more." };
  const list = Array.isArray(expenses) ? expenses : [];
  for (const e of list) if (!Number.isFinite(Number(e)) || Number(e) < 0) return { ok: false, error: "Expense amounts must be 0 or more." };
  const totalExpenses = list.reduce((a, e) => a + Number(e), 0);
  return { ok: true, income: inc, totalExpenses, remaining: inc - totalExpenses };
}

export function headingChecker(html) {
  const src = String(html || "");
  const headings = [];
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    headings.push({ level: Number(m[1]), text: m[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 200) });
  }
  const missingH1 = !headings.some((h) => h.level === 1);
  const skippedLevels = [];
  let prev = 0;
  for (const h of headings) {
    if (prev && h.level > prev + 1) skippedLevels.push(`Jump from H${prev} to H${h.level}`);
    prev = h.level;
  }
  const seen = new Map(), duplicates = [];
  for (const h of headings) {
    if (!h.text) continue;
    const key = h.text.toLowerCase();
    if (seen.has(key) && !duplicates.includes(h.text)) duplicates.push(h.text);
    seen.set(key, true);
  }
  return { headings, missingH1, skippedLevels, duplicates, count: headings.length };
}

export function keywordIdeas(seed) {
  const s = String(seed || "").trim().slice(0, 100);
  if (!s) return [];
  const prefixes = ["best", "top", "cheap", "free", "easy", "how to choose"];
  const suffixes = ["near me", "guide", "tips", "price", "for beginners", "examples", "checklist"];
  const questions = [`what is ${s}`, `how to ${s}`, `why ${s} matters`, `${s} vs alternatives`, `how much does ${s} cost`];
  const ideas = [...prefixes.map((p) => `${p} ${s}`), ...suffixes.map((x) => `${s} ${x}`), ...questions];
  return [...new Set(ideas)];
}

const STOPWORDS = new Set("a,an,the,and,or,but,of,to,in,on,for,with,by,at,from,as,is,are,was,were,be,been,being,it,its,this,that,these,those,i,you,he,she,we,they,my,your,his,her,our,their,not,no,do,does,did,can,could,will,would,should,have,has,had,am,an".split(","));
export function textAnalyzer(text) {
  const t = String(text || "");
  const base = countWords(t);
  const words = t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  const topKeywords = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([word, count]) => ({ word, count }));
  const sentences = base.sentences || 1;
  const avgSentenceLen = base.words / sentences;
  const readingLevel = avgSentenceLen <= 12 ? "Easy" : avgSentenceLen <= 20 ? "Medium" : "Hard";
  return { ...base, topKeywords, avgSentenceLength: Math.round(avgSentenceLen * 10) / 10, readingLevel, readingLevelNote: "Approximate level from average sentence length only — not a formal readability score." };
}

export function extractiveNotes(text, maxSentences = 5) {
  const t = String(text || "").trim();
  if (!t) return [];
  const sentences = (t.match(/[^.!?]+[.!?]+/g) || [t]).map((s) => s.trim()).filter(Boolean);
  const freq = new Map();
  for (const w of t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w))) freq.set(w, (freq.get(w) || 0) + 1);
  const scored = sentences.map((s, i) => {
    let score = 0;
    for (const w of s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) score += freq.get(w) || 0;
    return { s, score, i };
  });
  const n = Math.max(1, Math.min(10, Number(maxSentences) || 5));
  return scored.sort((a, b) => b.score - a.score).slice(0, n).sort((a, b) => a.i - b.i).map((x) => x.s);
}

export function parseFlashcards(text) {
  const lines = String(text || "").split(/\n/).map((l) => l.trim()).filter(Boolean);
  const cards = []; let skipped = 0;
  for (const line of lines) {
    const parts = line.split("|");
    if (parts.length < 2 || !parts[0].trim() || !parts[1].trim()) { skipped++; continue; }
    cards.push({ question: parts[0].trim().slice(0, 500), answer: parts.slice(1).join("|").trim().slice(0, 1000) });
  }
  return { cards, skipped };
}

export function quizBlanks(text) {
  const t = String(text || "").trim();
  if (!t) return [];
  const sentences = (t.match(/[^.!?]+[.!?]+/g) || [t]).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const s of sentences) {
    const words = s.split(/\s+/);
    let bestIdx = -1, bestLen = 0;
    words.forEach((w, i) => {
      const clean = w.replace(/[^A-Za-z]/g, "");
      if (clean.length > 4 && clean.length > bestLen) { bestLen = clean.length; bestIdx = i; }
    });
    if (bestIdx < 0) continue;
    const answer = words[bestIdx].replace(/[^A-Za-z]/g, "");
    const qWords = [...words]; qWords[bestIdx] = "________";
    out.push({ question: qWords.join(" "), answer });
  }
  return out;
}

export function htmlEscape(text) {
  return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function cssMinify(css) {
  let out = String(css || "").replace(/\/\*[\s\S]*?\*\//g, "");
  out = out.replace(/\s+/g, " ").replace(/\s*([{}:;,>+~])\s*/g, "$1").replace(/;}/g, "}").trim();
  return out;
}

function base64UrlDecode(str) {
  const s = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  if (typeof Buffer !== "undefined") return new TextDecoder().decode(new Uint8Array(Buffer.from(padded, "base64")));
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
export function jwtDecode(token) {
  const warning = "Decoding is NOT verification: this only reads the token's contents. It does NOT check the signature, expiry trust, or issuer — never accept a token as valid just because it decodes.";
  try {
    const parts = String(token || "").trim().split(".");
    if (parts.length !== 3) return { ok: false, warning, error: "A JWT has 3 dot-separated parts (header.payload.signature)." };
    const header = JSON.parse(base64UrlDecode(parts[0]));
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    return { ok: true, warning, header, payload };
  } catch {
    return { ok: false, warning, error: "Could not decode that token as a JWT." };
  }
}

export function regexTest(pattern, flags, testString) {
  const p = String(pattern || ""), t = String(testString || "");
  if (p.length > 500) return { ok: false, error: "Pattern is too long (max 500 characters)." };
  if (t.length > 10000) return { ok: false, error: "Test string is too long (max 10000 characters)." };
  const f = String(flags || "");
  if (!/^[gimsuy]*$/.test(f)) return { ok: false, error: "Flags may only contain g, i, m, s, u, y." };
  try {
    const re = new RegExp(p, f);
    const matches = [];
    if (f.includes("g") || f.includes("y")) {
      let m; re.lastIndex = 0;
      while ((m = re.exec(t)) !== null && matches.length < 100) {
        matches.push({ match: m[0], index: m.index });
        if (m[0] === "") re.lastIndex++;
      }
    } else {
      const m = re.exec(t);
      if (m) matches.push({ match: m[0], index: m.index });
    }
    return { ok: true, matches, count: matches.length };
  } catch (e) {
    return { ok: false, error: "Invalid pattern: " + String(e.message || e) };
  }
}

export function pdfPageCount(text) {
  const src = String(text || "");
  if (!src.startsWith("%PDF-")) return { ok: false, error: "This does not look like a PDF file (missing %PDF- header). The file may be damaged or not a PDF." };
  if (/\/Encrypt\b/.test(src)) return { ok: false, error: "This PDF appears to be encrypted, so its pages cannot be counted here." };
  const pageMatches = src.match(/\/Type\s*\/Page(?!s)/g) || [];
  if (pageMatches.length > 0) return { ok: true, pages: pageMatches.length, method: "Counted /Type /Page objects." };
  const countMatch = /\/Count\s+(\d+)/.exec(src);
  if (countMatch) return { ok: true, pages: Number(countMatch[1]), method: "Used the document /Count value (no individual page objects found)." };
  return { ok: false, error: "No page markers (/Type /Page or /Count) were found in this PDF." };
}

function pdfLiteralString(src, field) {
  const re = new RegExp("/" + field + "\\s*\\((?:\\\\.|[^()\\\\])*\\)");
  const m = re.exec(src);
  if (!m) return null;
  const inner = m[0].replace(new RegExp("^/" + field + "\\s*\\("), "").replace(/\)$/, "");
  return inner.replace(/\\([()\\])/g, "$1");
}
function pdfHexString(src, field) {
  const re = new RegExp("/" + field + "\\s*<([0-9A-Fa-f\\s]+)>");
  const m = re.exec(src);
  if (!m) return null;
  try {
    const hex = m[1].replace(/\s/g, "");
    if (typeof Buffer !== "undefined") return Buffer.from(hex, "hex").toString("utf8");
    return hex;
  } catch { return null; }
}
export function pdfMetadata(text) {
  const src = String(text || "");
  if (!src.startsWith("%PDF-")) return { ok: false, error: "This does not look like a PDF file (missing %PDF- header)." };
  if (/\/Encrypt\b/.test(src)) return { ok: false, error: "This PDF appears to be encrypted, so its metadata cannot be read here." };
  const get = (f) => pdfLiteralString(src, f) ?? pdfHexString(src, f) ?? null;
  return { ok: true, title: get("Title"), author: get("Author"), creator: get("Creator"), creationDate: get("CreationDate"), note: "Fields shown only when present in the file; missing fields are shown as not present." };
}

export function metaTitleCheck(title) {
  const t = String(title || "").trim();
  let pixels = 0;
  for (const ch of t) {
    if ("il1.,;:|'!".includes(ch)) pixels += 5;
    else if ("WMm".includes(ch)) pixels += 12;
    else pixels += 8.5;
  }
  const pixelEstimate = Math.round(pixels);
  return { title: t, length: t.length, pixelEstimate, fits: pixelEstimate <= 600 && t.length <= 60, note: "Pixel width is an estimate only — Google truncates around 600px and may rewrite titles." };
}
