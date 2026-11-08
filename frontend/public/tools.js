// Kavron Labs tools pages (tools.html) — frontend.
// Most tools here run fully in the browser with no network call of any
// kind: no login, no saved results, no pricing. Image and PDF files are
// processed with Canvas in the browser and are never uploaded anywhere.
// The 4 AI tools are the exception: they call same-origin /api/ai/*
// endpoints, require login, and send the X-CSRF-Token from /api/auth/me
// (see the AI branch in bindTool). No other network calls exist in this
// file, and no cross-origin fetch is made anywhere.
// Loaded as an external module on purpose: the site CSP allows scripts
// only from the site itself ('self'), so no inline scripts and no inline
// event attributes are used anywhere in the pack.

import { countWords, convertCase, percentageCalc, discountCalc, loremGenerator, validateJson, urlEncode, urlDecode, trimMeta, base64Encode, base64Decode, slugify, hexToRgb, rgbToHex, robotsGenerator, sitemapGenerator, profitMargin, salesTax, budgetCalc, headingChecker, keywordIdeas, textAnalyzer, extractiveNotes, parseFlashcards, quizBlanks, htmlEscape, cssMinify, jwtDecode, regexTest, metaTitleCheck } from "./pure.js";
import { PDF_TOOLS, PDF_SECTIONS, pdfToolBySlug, statusLabel, statusClass, searchText, pdfToolFormHtml, bindPdfTool, pdfListHtml, bindPdfList } from "./pdf-tools.js";

const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB per image, fixed and stated on the page.
const app = document.getElementById("app");

const CATS = {
  image: { name: "Picture Tools", logo: "/logo-picture.webp", desc: "Resize, compress and convert images — in your browser, nothing uploaded." },
  pdf: { name: "PDF Tools", logo: "/logo-pdf.webp", desc: "42 free PDF tools — merge, split, convert, sign, organise and more, in your browser." },
  text: { name: "Text Tools", logo: "/logo-text.webp", desc: "Count words, change text case, calculate percentages and discounts." },
  seo: { name: "SEO Tools", icon: "🔍", desc: "Meta tags, slugs, robots.txt, sitemaps, headings and keyword ideas — in your browser." },
  developer: { name: "Developer Tools", icon: "🧑‍💻", desc: "JSON, encoding, hashes, timestamps, colours, regex and more — in your browser." },
  business: { name: "Business Tools", icon: "💼", desc: "Margins, tax, budgets and invoices — in your browser, nothing uploaded." },
  learning: { name: "Learning Tools", icon: "🎓", desc: "Study notes, flashcards and quizzes made from your own text — local, non-AI." },
  ai: { name: "AI Tools", icon: "✨", desc: "AI writing tools — text, captions, product descriptions and emails. Requires login. 5 free AI requests per day." },
};

const TOOLS = [
  { slug: "image-compressor", name: "Image Compressor", cat: "image", icon: "🗜️", desc: "Compress images in your browser with a quality slider. No server upload.", faq: "JPEG/WebP compression is lossy — keep your original file." },
  { slug: "image-resizer", name: "Image Resizer", cat: "image", icon: "📐", desc: "Resize images in your browser, keep aspect ratio, choose output format.", faq: "Upscaling beyond the original size will look soft." },
  { slug: "image-format-converter", name: "Image Format Converter", cat: "image", icon: "🔄", desc: "Convert an image between PNG, JPG and WebP in your browser and download it.", faq: "Conversion runs on Canvas in your browser; the image is not uploaded." },
  { slug: "image-format-info", name: "Image Format Info", cat: "image", icon: "ℹ️", desc: "Read an image's type, dimensions, file size and aspect ratio.", faq: "Metadata is read from the file you choose, in your browser." },
  { slug: "word-counter", name: "Word Counter", cat: "text", icon: "🔤", desc: "Count words, characters, sentences, paragraphs and reading time.", faq: "Reading time uses 200 words per minute." },
  { slug: "case-converter", name: "Text Case Converter", cat: "text", icon: "🔠", desc: "Convert text to UPPER, lower, Title, Sentence, camelCase or snake_case.", faq: "Title Case capitalises each word; Sentence Case capitalises after full stops." },
  { slug: "percentage-calculator", name: "Percentage Calculator", cat: "text", icon: "%", desc: "X% of Y, X is what % of Y, and percentage increase / decrease.", faq: "Percentage change divides by the starting value." },
  { slug: "discount-calculator", name: "Discount Calculator", cat: "text", icon: "🏷️", desc: "Final price after discount, plus optional tax, with savings shown.", faq: "Tax is applied after the discount, which matches common shop practice." },
  { slug: "lorem-generator", name: "Lorem Ipsum Generator", cat: "text", icon: "📝", desc: "Generate placeholder paragraphs for layouts.", faq: "Placeholder text only — replace it before publishing." },
  { slug: "meta-description-generator", name: "Meta Description Generator", cat: "seo", icon: "📄", desc: "Trim a description to 155–160 characters and preview the SERP snippet.", faq: "Google may rewrite snippets; staying near 160 characters is a safe target." },
  { slug: "slug-generator", name: "Slug Generator", cat: "seo", icon: "🔗", desc: "Turn a title into a clean URL slug.", faq: "Slugs use lowercase letters, numbers and hyphens only." },
  { slug: "robots-generator", name: "Robots.txt Generator", cat: "seo", icon: "🤖", desc: "Generate a robots.txt file, with an optional sitemap line.", faq: "Robots.txt is a request to crawlers, not access control." },
  { slug: "sitemap-generator", name: "XML Sitemap Generator", cat: "seo", icon: "🗺️", desc: "Build an XML sitemap from a list of URLs you provide.", faq: "Only include URLs you own and want indexed." },
  { slug: "meta-title-generator", name: "Meta Title Generator", cat: "seo", icon: "📰", desc: "Check a page title's length and estimated pixel width, with a SERP preview.", faq: "Pixel width is an estimate only — Google truncates around 600px and may rewrite titles." },
  { slug: "open-graph-preview", name: "Open Graph Preview", cat: "seo", icon: "👁️", desc: "Preview how a page title, description and image would look when shared.", faq: "This is a preview of your own inputs, not a fetch of a live page." },
  { slug: "heading-structure-checker", name: "Heading Structure Checker", cat: "seo", icon: "📑", desc: "Paste HTML and check H1–H6 structure: missing H1, skipped levels, duplicates.", faq: "Paste HTML you own. The checker reads headings with a pattern match, it does not render the page." },
  { slug: "website-text-analyzer", name: "Website Text Analyzer", cat: "seo", icon: "📊", desc: "Paste text (no URL fetching) for word count, top keywords and an approximate reading level.", faq: "URL fetching is deliberately disabled to avoid server-side request forgery — paste the text instead." },
  { slug: "keyword-idea-generator", name: "Keyword Idea Generator", cat: "seo", icon: "💡", desc: "Seed word plus prefix, suffix and question expansions. Ideas only — no search-volume data, no ranking promise.", faq: "These are brainstorming ideas, not measured search volumes. No ranking is promised." },
  { slug: "json-formatter", name: "JSON Formatter & Validator", cat: "developer", icon: "🧩", desc: "Format, minify and validate JSON with clear error messages.", faq: "Invalid JSON shows the parser error — fix that part and try again." },
  { slug: "url-encoder", name: "URL Encoder / Decoder", cat: "developer", icon: "🌐", desc: "Encode or decode URLs safely with encodeURIComponent.", faq: "Encoding is for URL parts, not whole passwords or secrets." },
  { slug: "uuid-generator", name: "UUID Generator", cat: "developer", icon: "🆔", desc: "Generate random UUIDs (v4) in your browser. Nothing is sent to a server.", faq: "UUIDs are random identifiers, not secrets or passwords." },
  { slug: "base64-encoder", name: "Base64 Encoder / Decoder", cat: "developer", icon: "🔣", desc: "Encode or decode Base64 text (Unicode-safe).", faq: "Base64 is encoding, not encryption — never use it to hide secrets." },
  { slug: "hash-generator", name: "Hash Generator (SHA-256)", cat: "developer", icon: "⛓️", desc: "Hash text with SHA-256 in your browser. A hash is not encryption.", faq: "Do not hash passwords here for storage — use a proper password system." },
  { slug: "timestamp-converter", name: "Unix Timestamp Converter", cat: "developer", icon: "⏰", desc: "Convert between Unix seconds and a readable date/time.", faq: "Unix time here is seconds since 1970-01-01 UTC." },
  { slug: "color-converter", name: "Color Converter", cat: "developer", icon: "🎨", desc: "Convert between hex and RGB colours.", faq: "Hex #2563eb is the same colour as rgb(37, 99, 235)." },
  { slug: "html-escaper", name: "HTML Escaper", cat: "developer", icon: "💻", desc: "Escape HTML so code displays as text instead of rendering.", faq: "Escaping replaces & < > \" and ' with safe entities." },
  { slug: "css-minifier", name: "CSS Minifier (Basic)", cat: "developer", icon: "🪶", desc: "Basic whitespace and comment removal for CSS. Basic — not a production parser.", faq: "This is a basic minifier: it removes comments and extra whitespace. It is not a production CSS parser, so check the output before shipping." },
  { slug: "jwt-decoder", name: "JWT Decoder", cat: "developer", icon: "🎟️", desc: "Decode a JWT's header and payload locally. Decoding is NOT verification.", faq: "Decoding is NOT verification: a decoded token may still be forged, expired, or issued by someone else. Never accept a token as valid just because it decodes." },
  { slug: "regex-tester", name: "Regex Tester", cat: "developer", icon: "🔎", desc: "Test a regular expression against text, in your browser. No server execution, no eval.", faq: "Patterns run only in your browser with length caps; invalid patterns show the error." },
  { slug: "profit-margin-calculator", name: "Profit Margin Calculator", cat: "business", icon: "💰", desc: "Cost and selling price → profit, margin % and markup %.", faq: "Margin divides by selling price; markup divides by cost — they are different numbers." },
  { slug: "sales-tax-calculator", name: "Sales Tax Calculator", cat: "business", icon: "💸", desc: "Price plus a configurable tax rate → tax amount and total.", faq: "Set the rate that applies where you sell; this tool does not look up tax law." },
  { slug: "simple-budget-calculator", name: "Simple Budget Calculator", cat: "business", icon: "📒", desc: "Income plus expense rows → totals and money remaining.", faq: "Enter one expense per line as: label | amount." },
  { slug: "invoice-generator", name: "Invoice Generator", cat: "business", icon: "🧾", desc: "Seller, buyer, items and tax → a downloadable, printable invoice. No company data is prefilled.", faq: "Fill in your own business details — nothing is prefilled and no invoice is sent anywhere." },
  { slug: "study-notes-generator", name: "Study Notes Generator", cat: "learning", icon: "📖", desc: "Extractive notes: picks key sentences from pasted text. Local and labelled non-AI.", faq: "Extractive means sentences are picked from your text, not written fresh — this is not AI summarising." },
  { slug: "flashcard-generator", name: "Flashcard Generator", cat: "learning", icon: "🎴", desc: "Lines in 'Question | Answer' format become reveal cards. Local, non-AI.", faq: "Write one card per line, with a | between question and answer." },
  { slug: "quiz-generator", name: "Quiz Generator", cat: "learning", icon: "❓", desc: "Fill-in-the-blank questions made from pasted sentences. Template-based, local, non-AI.", faq: "Template-based: each sentence becomes one blanked question. This is not AI question writing." },
  { slug: "ai-text-generator", name: "AI Text Generator", cat: "ai", icon: "✍️", desc: "Real AI writing — requires login. 5 free requests per day.", faq: "AI output is a draft — check facts before publishing." },
  { slug: "ai-caption-generator", name: "Social Media Caption Generator", cat: "ai", icon: "📣", desc: "Real AI captions — requires login. 5 free requests per day.", faq: "Captions are drafts; add your own details before posting." },
  { slug: "ai-product-description", name: "Product Description Generator", cat: "ai", icon: "🛍️", desc: "Real AI product descriptions — requires login. 5 free requests per day.", faq: "The tool never invents features you did not provide — check the draft." },
  { slug: "ai-email-writer", name: "AI Email Writer", cat: "ai", icon: "✉️", desc: "Real AI emails — requires login. 5 free requests per day.", faq: "Review any commitment or date in a draft before sending." },
];

function esc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function setOut(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function setErr(id, text) { const el = document.getElementById(id); if (el) el.textContent = text || ""; }
function downloadText(filename, text, type) {
  const blob = new Blob([text], { type: type || "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function copyText(text, noteId) {
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => setErr(noteId, "Copied.")).catch(() => setErr(noteId, "Copy failed — select the text manually."));
  else setErr(noteId, "Clipboard not available — select the text manually.");
}
function toolCard(t) {
  return `<a class="card cat-${t.cat} tool-card" data-search="${esc((t.name + " " + t.desc).toLowerCase())}" href="/tools.html?tool=${t.slug}"><span class="tool-icon" aria-hidden="true">${esc(t.icon)}</span><h3>${esc(t.name)}</h3><p>${esc(t.desc)}</p></a>`;
}
function pdfCard(t) {
  return `<a class="card cat-pdf tool-card" data-search="${esc(searchText(t))}" href="/tools.html?tool=${t.slug}"><span class="tool-icon" aria-hidden="true">${esc(t.icon)}</span><h3>${esc(t.name)}</h3><p>${esc(t.desc)}</p><span class="status ${statusClass(t)}">${statusLabel(t)}</span></a>`;
}
function bindLiveSearch(inputId, clearId, noMatchId) {
  const input = document.getElementById(inputId);
  const clear = document.getElementById(clearId);
  const noMatch = document.getElementById(noMatchId);
  if (!input) return;
  const apply = () => {
    const q = input.value.trim().toLowerCase();
    if (clear) clear.hidden = !q;
    let visible = 0;
    document.querySelectorAll(".tool-card").forEach((card) => {
      const hit = !q || (card.dataset.search || card.textContent || "").toLowerCase().includes(q);
      card.style.display = hit ? "" : "none";
      if (hit) visible++;
    });
    document.querySelectorAll("[data-list-section]").forEach((sec) => {
      const any = Array.from(sec.querySelectorAll(".tool-card")).some((c) => c.style.display !== "none");
      sec.style.display = any ? "" : "none";
    });
    if (noMatch) noMatch.hidden = visible !== 0;
  };
  input.addEventListener("input", apply);
  if (clear) clear.addEventListener("click", () => { input.value = ""; apply(); input.focus(); });
}
function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image file.")); };
    img.src = url;
  });
}
function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Image conversion failed.")), type, quality));
}
async function readFileLatin1(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let out = "";
  const CHUNK = 8192;
  for (let i = 0; i < buf.length; i += CHUNK) out += String.fromCharCode.apply(null, buf.slice(i, i + CHUNK));
  return out;
}

function toolFormHtml(slug) {
  switch (slug) {
    case "word-counter": return `<label>Your text <textarea id="in" rows="8" maxlength="100000" placeholder="Paste text here…"></textarea></label><button type="button" id="runBtn">Count</button> <button type="button" id="exampleBtn" class="secondary">Example</button>`;
    case "case-converter": return `<label>Your text <textarea id="in" rows="6" maxlength="100000"></textarea></label><label>Case <select id="mode"><option value="upper">UPPERCASE</option><option value="lower">lowercase</option><option value="title">Title Case</option><option value="sentence">Sentence case</option><option value="camel">camelCase</option><option value="snake">snake_case</option><option value="kebab">kebab-case</option></select></label><button type="button" id="runBtn">Convert</button> <button type="button" id="exampleBtn" class="secondary">Example</button>`;
    case "percentage-calculator": return `<label>Calculation <select id="mode"><option value="percent-of">X% of Y</option><option value="is-what-percent">X is what % of Y</option><option value="change">% change from X to Y</option></select></label><div class="row"><label>First number (X) <input id="in" type="number" step="any"></label><label>Second number (Y) <input id="in2" type="number" step="any"></label></div><button type="button" id="runBtn">Calculate</button> <button type="button" id="exampleBtn" class="secondary">Example</button>`;
    case "discount-calculator": return `<div class="row"><label>Original price <input id="in" type="number" step="any" min="0"></label><label>Discount % <input id="in2" type="number" step="any" min="0" max="100"></label></div><label>Tax % (optional) <input id="in3" type="number" step="any" min="0" max="100" value="0"></label><button type="button" id="runBtn">Calculate</button> <button type="button" id="exampleBtn" class="secondary">Example</button>`;
    case "lorem-generator": return `<label>Paragraphs (1–10) <input id="in" type="number" min="1" max="10" value="3"></label><button type="button" id="runBtn">Generate</button>`;
    case "image-compressor": return `<label>Image (JPG/PNG/WebP, up to 10 MB) <input id="fileIn" type="file" accept="image/jpeg,image/png,image/webp"></label><label>Quality <input id="quality" type="range" min="10" max="95" value="80"> <span id="qualityVal">80</span></label><button type="button" id="runBtn">Compress</button><p id="imgInfo" class="small"></p><img id="imgPreview" class="preview" hidden alt="Compressed preview">`;
    case "image-resizer": return `<label>Image (JPG/PNG/WebP, up to 10 MB) <input id="fileIn" type="file" accept="image/jpeg,image/png,image/webp"></label><div class="row"><label>Width (px) <input id="in" type="number" min="1" max="8000"></label><label>Height (px) <input id="in2" type="number" min="1" max="8000"></label></div><label><input id="keepAspect" type="checkbox" class="checkbox" checked> Keep aspect ratio</label><label>Output format <select id="mode"><option value="image/jpeg">JPEG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></label><button type="button" id="runBtn">Resize</button><p id="imgInfo" class="small"></p><img id="imgPreview" class="preview" hidden alt="Resized preview">`;
    case "image-format-converter": return `<label>Image (JPG/PNG/WebP, up to 10 MB) <input id="fileIn" type="file" accept="image/jpeg,image/png,image/webp"></label><label>Output format <select id="mode"><option value="image/jpeg">JPEG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></label><button type="button" id="runBtn">Convert</button><p id="imgInfo" class="small"></p><img id="imgPreview" class="preview" hidden alt="Converted preview">`;
    case "image-format-info": return `<label>Image (JPG/PNG/WebP, up to 10 MB) <input id="fileIn" type="file" accept="image/jpeg,image/png,image/webp"></label><button type="button" id="runBtn">Show info</button><p id="imgInfo" class="small"></p>`;
    case "json-formatter": return `<label>JSON <textarea id="in" rows="10" maxlength="100000" placeholder='{"name":"Kavron Labs"}'></textarea></label><button type="button" id="runBtn">Format</button> <button type="button" id="minifyBtn" class="secondary">Minify</button> <button type="button" id="exampleBtn" class="secondary">Example</button>`;
    case "url-encoder": return `<label>Text / URL <textarea id="in" rows="4" maxlength="10000"></textarea></label><button type="button" id="runBtn">Encode</button> <button type="button" id="decodeBtn" class="secondary">Decode</button> <button type="button" id="exampleBtn" class="secondary">Example</button>`;
    case "uuid-generator": return `<label>How many? (1–50) <input id="in" type="number" min="1" max="50" value="5"></label><button type="button" id="runBtn">Generate</button>`;
    case "meta-description-generator": return `<label>Page content / draft description <textarea id="in" rows="5" maxlength="5000"></textarea></label><label>Main keyword (optional) <input id="in2"></label><button type="button" id="runBtn">Generate & preview</button> <button type="button" id="exampleBtn" class="secondary">Example</button>`;
    case "base64-encoder": return `<label>Text <textarea id="in" rows="5" maxlength="10000"></textarea></label><button type="button" id="runBtn">Encode</button> <button type="button" id="decodeBtn" class="secondary">Decode</button>`;
    case "slug-generator": return `<label>Title <input id="in" maxlength="500" placeholder="My Great Blog Post"></label><button type="button" id="runBtn">Generate slug</button> <button type="button" id="exampleBtn" class="secondary">Example</button>`;
    case "hash-generator": return `<label>Text to hash <textarea id="in" rows="4" maxlength="10000"></textarea></label><button type="button" id="runBtn">Hash (SHA-256)</button><p class="small">A hash is one-way: it cannot be reversed to recover the text, and it is not encryption.</p>`;
    case "timestamp-converter": return `<label>Unix timestamp (seconds) <input id="in" type="number" step="1"></label><button type="button" id="runBtn">To date</button> <button type="button" id="dateBtn" class="secondary">Use current time</button><label>Date & time (local) <input id="in2" type="datetime-local"></label><button type="button" id="dateToUnixBtn" class="secondary">Date to Unix</button>`;
    case "color-converter": return `<label>Hex colour <input id="in" value="#2563eb"></label><button type="button" id="runBtn">Hex to RGB</button><div class="row"><label>R <input id="in2" type="number" min="0" max="255" value="37"></label><label>G <input id="in3" type="number" min="0" max="255" value="99"></label></div><label>B <input id="bIn" type="number" min="0" max="255" value="235"></label><button type="button" id="rgbBtn" class="secondary">RGB to Hex</button>`;
    case "robots-generator": return `<label><input id="allowAll" type="checkbox" class="checkbox" checked> Allow all crawlers</label><label>Sitemap URL (optional) <input id="in" placeholder="https://example.com/sitemap.xml"></label><button type="button" id="runBtn">Generate robots.txt</button>`;
    case "sitemap-generator": return `<label>URLs, one per line <textarea id="in" rows="6" placeholder="https://example.com/&#10;https://example.com/tools"></textarea></label><button type="button" id="runBtn">Generate sitemap</button>`;
    case "meta-title-generator": return `<label>Page title <input id="in" maxlength="200" placeholder="Your page title"></label><button type="button" id="runBtn">Check title</button> <button type="button" id="exampleBtn" class="secondary">Example</button>`;
    case "open-graph-preview": return `<label>Page title <input id="in" maxlength="200"></label><label>Description <textarea id="in2" rows="3" maxlength="500"></textarea></label><label>Page URL <input id="in3" placeholder="https://example.com/page"></label><label>Image URL (optional) <input id="in4" placeholder="https://example.com/image.jpg"></label><button type="button" id="runBtn">Preview</button> <button type="button" id="exampleBtn" class="secondary">Example</button>`;
    case "heading-structure-checker": return `<label>Paste HTML <textarea id="in" rows="10" maxlength="100000" placeholder="<h1>Title</h1><h2>Section</h2>"></textarea></label><button type="button" id="runBtn">Check headings</button> <button type="button" id="exampleBtn" class="secondary">Example</button>`;
    case "website-text-analyzer": return `<label>Paste text (no URL fetching — paste the text itself) <textarea id="in" rows="8" maxlength="100000"></textarea></label><button type="button" id="runBtn">Analyze</button> <button type="button" id="exampleBtn" class="secondary">Example</button>`;
    case "keyword-idea-generator": return `<label>Seed word <input id="in" maxlength="100" placeholder="bakery"></label><button type="button" id="runBtn">Generate ideas</button> <button type="button" id="exampleBtn" class="secondary">Example</button><p class="small">Ideas only — no search-volume data, no ranking promise.</p>`;
    case "html-escaper": return `<label>HTML to escape <textarea id="in" rows="6" maxlength="100000" placeholder="<p>Hello</p>"></textarea></label><button type="button" id="runBtn">Escape</button> <button type="button" id="exampleBtn" class="secondary">Example</button>`;
    case "css-minifier": return `<label>CSS <textarea id="in" rows="8" maxlength="100000" placeholder="/* comment */ .box { margin: 0; }"></textarea></label><button type="button" id="runBtn">Minify (basic)</button> <button type="button" id="exampleBtn" class="secondary">Example</button><p class="small">Basic minifier — not a production parser. Check the output before shipping.</p>`;
    case "jwt-decoder": return `<label>JWT token <textarea id="in" rows="4" maxlength="10000" placeholder="eyJhbGciOi…"></textarea></label><button type="button" id="runBtn">Decode</button><p class="small"><strong>Warning: decoding is NOT verification.</strong> A token that decodes may still be forged or expired.</p>`;
    case "regex-tester": return `<label>Pattern <input id="in" maxlength="500" placeholder="\\d+"></label><label>Flags (g, i, m, s, u, y) <input id="in2" maxlength="6" value="g"></label><label>Test string <textarea id="in3" rows="5" maxlength="10000"></textarea></label><button type="button" id="runBtn">Test</button> <button type="button" id="exampleBtn" class="secondary">Example</button>`;
    case "profit-margin-calculator": return `<div class="row"><label>Cost <input id="in" type="number" step="any" min="0"></label><label>Selling price <input id="in2" type="number" step="any" min="0"></label></div><button type="button" id="runBtn">Calculate</button> <button type="button" id="exampleBtn" class="secondary">Example</button>`;
    case "sales-tax-calculator": return `<div class="row"><label>Price <input id="in" type="number" step="any" min="0"></label><label>Tax rate % <input id="in2" type="number" step="any" min="0" max="100" value="17"></label></div><button type="button" id="runBtn">Calculate</button> <button type="button" id="exampleBtn" class="secondary">Example</button>`;
    case "simple-budget-calculator": return `<label>Monthly income <input id="in" type="number" step="any" min="0"></label><label>Expenses, one per line: label | amount <textarea id="in2" rows="6" placeholder="Rent | 20000&#10;Food | 15000"></textarea></label><button type="button" id="runBtn">Calculate</button> <button type="button" id="exampleBtn" class="secondary">Example</button>`;
    case "invoice-generator": return `<label>Seller name / details <textarea id="in" rows="2" maxlength="500"></textarea></label><label>Buyer name / details <textarea id="in2" rows="2" maxlength="500"></textarea></label><label>Items, one per line: description | quantity | unit price <textarea id="in3" rows="6" placeholder="Design work | 2 | 5000"></textarea></label><label>Tax rate % <input id="in4" type="number" step="any" min="0" max="100" value="0"></label><button type="button" id="runBtn">Generate invoice</button> <button type="button" id="exampleBtn" class="secondary">Example</button><p class="small">No company data is prefilled. The invoice downloads as a printable HTML file.</p>`;
    case "study-notes-generator": return `<label>Paste text to study <textarea id="in" rows="10" maxlength="100000"></textarea></label><label>Max notes <input id="in2" type="number" min="1" max="10" value="5"></label><button type="button" id="runBtn">Generate notes</button> <button type="button" id="exampleBtn" class="secondary">Example</button><p class="small">Extractive, local, non-AI: key sentences are picked from your text.</p>`;
    case "flashcard-generator": return `<label>One card per line: Question | Answer <textarea id="in" rows="8" maxlength="100000" placeholder="What is 2 + 2? | 4"></textarea></label><button type="button" id="runBtn">Generate cards</button> <button type="button" id="exampleBtn" class="secondary">Example</button>`;
    case "quiz-generator": return `<label>Paste sentences <textarea id="in" rows="8" maxlength="100000"></textarea></label><button type="button" id="runBtn">Generate quiz</button> <button type="button" id="exampleBtn" class="secondary">Example</button><p class="small">Template-based, local, non-AI.</p>`;
    case "ai-text-generator": return `<label>What should the AI write? <textarea id="in" rows="6" maxlength="2000" placeholder="Describe what you want written…"></textarea></label><button type="button" id="runBtn">Generate</button> <button type="button" id="exampleBtn" class="secondary">Example</button>`;
    case "ai-caption-generator": return `<label>Describe your post <textarea id="in" rows="6" maxlength="2000" placeholder="Describe your post — topic, product, mood…"></textarea></label><button type="button" id="runBtn">Generate</button> <button type="button" id="exampleBtn" class="secondary">Example</button>`;
    case "ai-product-description": return `<label>Product details <textarea id="in" rows="6" maxlength="2000" placeholder="Product name, features, who it is for…"></textarea></label><button type="button" id="runBtn">Generate</button> <button type="button" id="exampleBtn" class="secondary">Example</button>`;
    case "ai-email-writer": return `<label>What should the email say? <textarea id="in" rows="6" maxlength="2000" placeholder="Who is it to, and what should it say?"></textarea></label><button type="button" id="runBtn">Generate</button> <button type="button" id="exampleBtn" class="secondary">Example</button>`;
    default: return `<p>This tool is not available.</p>`;
  }
}

async function runImageTool(slug, getVal) {
  const fileEl = document.getElementById("fileIn");
  const files = fileEl ? Array.from(fileEl.files || []) : [];
  if (!files.length) { setOut("result", ""); setErr("toolErr", "Choose an image file first."); return; }
  const bad = files.find((f) => !["image/jpeg", "image/png", "image/webp"].includes(f.type) || f.size > IMAGE_MAX_BYTES);
  if (bad) { setOut("result", ""); setErr("toolErr", "Only JPG, PNG or WebP images up to 10 MB are accepted."); return; }
  const file = files[0];
  const img = await loadImageFile(file);
  const canvas = document.createElement("canvas");
  if (slug === "image-compressor") {
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    canvas.getContext("2d").drawImage(img, 0, 0);
    const q = Number(document.getElementById("quality").value) / 100;
    const type = file.type === "image/png" ? "image/png" : (file.type === "image/webp" ? "image/webp" : "image/jpeg");
    const blob = await canvasToBlob(canvas, type, q);
    const url = URL.createObjectURL(blob);
    const prev = document.getElementById("imgPreview"); prev.src = url; prev.hidden = false;
    const info = document.getElementById("imgInfo");
    info.textContent = `Original: ${file.size} bytes → Compressed: ${blob.size} bytes (${file.name})`;
    const a = document.createElement("a"); a.href = url; a.download = "compressed-" + file.name; a.textContent = "Download compressed image";
    setOut("result", `Original: ${file.size} bytes\nCompressed: ${blob.size} bytes\nSaved: ${file.size - blob.size} bytes`);
    info.appendChild(document.createElement("br")); info.appendChild(a);
  } else {
    let w = Number(getVal("in")), h = Number(getVal("in2"));
    const keep = document.getElementById("keepAspect").checked;
    if (!w && !h) { setOut("result", ""); setErr("toolErr", "Enter a width or a height."); return; }
    if (keep) { if (w && !h) h = Math.round(img.naturalHeight * (w / img.naturalWidth)); if (h && !w) w = Math.round(img.naturalWidth * (h / img.naturalHeight)); }
    if (!w || !h) { setOut("result", ""); setErr("toolErr", "Enter both width and height, or keep aspect ratio on with one value."); return; }
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    const type = getVal("mode");
    const blob = await canvasToBlob(canvas, type, 0.92);
    const url = URL.createObjectURL(blob);
    const prev = document.getElementById("imgPreview"); prev.src = url; prev.hidden = false;
    const info = document.getElementById("imgInfo");
    info.textContent = `Original: ${img.naturalWidth}×${img.naturalHeight} → Resized: ${w}×${h} (${blob.size} bytes)`;
    const a = document.createElement("a"); a.href = url; a.download = "resized." + (type.split("/")[1] || "jpg"); a.textContent = "Download resized image";
    setOut("result", `Resized to ${w}×${h} (${blob.size} bytes).`);
    info.appendChild(document.createElement("br")); info.appendChild(a);
  }
}

async function runFileTool(slug) {
  const fileEl = document.getElementById("fileIn");
  const files = fileEl ? Array.from(fileEl.files || []) : [];
  if (!files.length) { setOut("result", ""); setErr("toolErr", "Choose a file first."); return; }
  const file = files[0];
  if (slug === "image-format-converter") {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > IMAGE_MAX_BYTES) { setOut("result", ""); setErr("toolErr", "Only JPG, PNG or WebP images up to 10 MB are accepted."); return; }
    const img = await loadImageFile(file);
    const canvas = document.createElement("canvas"); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    canvas.getContext("2d").drawImage(img, 0, 0);
    const type = document.getElementById("mode").value;
    const blob = await canvasToBlob(canvas, type, 0.92);
    const url = URL.createObjectURL(blob);
    const prev = document.getElementById("imgPreview"); prev.src = url; prev.hidden = false;
    const a = document.createElement("a"); a.href = url; a.download = "converted." + (type.split("/")[1] || "jpg"); a.textContent = "Download converted image";
    const info = document.getElementById("imgInfo");
    info.textContent = `${img.naturalWidth}×${img.naturalHeight} · ${file.size} bytes → ${blob.size} bytes (${type})`;
    info.appendChild(document.createElement("br")); info.appendChild(a);
    setOut("result", `Converted to ${type} (${blob.size} bytes). Use the download link above.`);
  } else if (slug === "image-format-info") {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > IMAGE_MAX_BYTES) { setOut("result", ""); setErr("toolErr", "Only JPG, PNG or WebP images up to 10 MB are accepted."); return; }
    const img = await loadImageFile(file);
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const g = gcd(img.naturalWidth, img.naturalHeight) || 1;
    setOut("result", `Type: ${file.type}\nDimensions: ${img.naturalWidth}×${img.naturalHeight}\nFile size: ${file.size} bytes\nAspect ratio: ${img.naturalWidth / g}:${img.naturalHeight / g} (${(img.naturalWidth / img.naturalHeight).toFixed(2)}:1)`);
  }
}

/* --- AI tools (the only tools in this file that use the network) ---
   Same-origin /api/ai/* only, login + CSRF, exactly like ExamMate:
   GET /api/auth/me (credentials:'include') returns {email, role,
   csrfToken}; state-changing POST/DELETE calls send that token as the
   'X-CSRF-Token' header. 401 from /api/auth/me or /api/ai/usage means
   the visitor is not logged in, so the login gate is shown instead of
   the form. Quota is 5 free AI requests per day per account. */
const AI_SLUGS = ["ai-text-generator", "ai-caption-generator", "ai-product-description", "ai-email-writer"];
const AI_DAILY_LIMIT = 5;
let aiCsrfToken = null;
function isAiTool(slug) { return AI_SLUGS.includes(slug); }
function quotaText(remaining, limit) { return `${remaining} of ${limit} free requests left today`; }
function setQuota(remaining, limit) {
  const el = document.getElementById("quotaLine");
  if (el && Number.isFinite(remaining) && Number.isFinite(limit)) el.textContent = quotaText(remaining, limit);
}
function showAiGate() {
  const gate = document.getElementById("aiGate");
  const form = document.getElementById("toolForm");
  if (gate) gate.hidden = false;
  if (form) form.hidden = true;
  const saveBtn = document.getElementById("saveBtn");
  if (saveBtn) saveBtn.hidden = true;
}
async function getAiCsrf() {
  if (aiCsrfToken) return aiCsrfToken;
  const r = await fetch("/api/auth/me", { credentials: "include" });
  if (!r.ok) return null;
  const me = await r.json();
  aiCsrfToken = me.csrfToken || null;
  return aiCsrfToken;
}
async function readJsonSafe(r) { try { return await r.json(); } catch (e) { return {}; } }
function renderSavedList(items, slug) {
  const list = document.getElementById("savedList");
  if (!list) return;
  list.textContent = "";
  const mine = (items || []).filter((it) => it.tool === slug);
  if (!mine.length) {
    const p = document.createElement("p");
    p.className = "small";
    p.textContent = "No saved results yet for this tool.";
    list.appendChild(p);
    return;
  }
  mine.forEach((it) => {
    const wrap = document.createElement("div");
    wrap.className = "saved-item";
    const meta = document.createElement("p");
    meta.className = "small";
    meta.textContent = (it.created_at || "").slice(0, 10);
    const snippet = document.createElement("p");
    snippet.textContent = String(it.input || "").slice(0, 120);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "secondary";
    del.textContent = "Delete";
    del.setAttribute("data-saved-id", String(it.id));
    del.addEventListener("click", async () => {
      del.disabled = true;
      try {
        const token = await getAiCsrf();
        const r = await fetch("/api/ai/saved/" + encodeURIComponent(String(it.id)), { method: "DELETE", headers: token ? { "X-CSRF-Token": token } : {}, credentials: "include" });
        if (r.status === 401) { showAiGate(); return; }
        if (!r.ok) { setErr("toolErr", "Could not delete that saved result. Please try again."); del.disabled = false; return; }
        await loadAiSaved(slug);
      } catch (e) {
        setErr("toolErr", "Could not reach the server. Check your connection and try again.");
        del.disabled = false;
      }
    });
    wrap.appendChild(meta);
    wrap.appendChild(snippet);
    wrap.appendChild(del);
    list.appendChild(wrap);
  });
}
async function loadAiSaved(slug) {
  const r = await fetch("/api/ai/saved", { credentials: "include" });
  if (r.status === 401) { showAiGate(); return; }
  if (!r.ok) return;
  const data = await readJsonSafe(r);
  renderSavedList(data.items, slug);
}
async function loadAiUsage() {
  const r = await fetch("/api/ai/usage", { credentials: "include" });
  if (r.status === 401) { showAiGate(); return false; }
  if (!r.ok) return false;
  const data = await readJsonSafe(r);
  setQuota(data.remaining, data.limit);
  return true;
}
function bindAiTool(tool) {
  const slug = tool.slug;
  const runBtn = document.getElementById("runBtn");
  const saveBtn = document.getElementById("saveBtn");
  const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ""; };
  if (saveBtn) saveBtn.addEventListener("click", async () => {
    const result = document.getElementById("result");
    if (!result || !result.innerHTML.trim() || result.textContent.trim() === "Working…") { setErr("toolErr", "Generate a result first, then save it."); return; }
    saveBtn.disabled = true;
    try {
      const token = await getAiCsrf();
      if (!token) { showAiGate(); saveBtn.disabled = false; return; }
      const r = await fetch("/api/ai/save", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": token }, credentials: "include", body: JSON.stringify({ tool: slug, input: getVal("in"), outputHtml: result.innerHTML }) });
      const data = await readJsonSafe(r);
      if (r.status === 401) { showAiGate(); saveBtn.disabled = false; return; }
      if (r.status === 429) { setErr("toolErr", data.error || "You have reached the limit of 50 saved results."); saveBtn.disabled = false; return; }
      if (!r.ok) { setErr("toolErr", data.error || "Could not save this result. Please try again."); saveBtn.disabled = false; return; }
      setErr("toolMsg", "Saved.");
      await loadAiSaved(slug);
    } catch (e) {
      setErr("toolErr", "Could not reach the server. Check your connection and try again.");
    }
    saveBtn.disabled = false;
  });
  if (!runBtn) return;
  runBtn.addEventListener("click", async () => {
    setErr("toolErr", ""); setErr("toolMsg", "");
    const input = getVal("in").trim();
    if (!input) { setOut("result", ""); setErr("toolErr", "Please enter some text first."); return; }
    if (input.length > 2000) { setOut("result", ""); setErr("toolErr", "Please keep your text under 2000 characters."); return; }
    setOut("result", "Working…");
    runBtn.disabled = true;
    if (saveBtn) saveBtn.hidden = true;
    try {
      const token = await getAiCsrf();
      if (!token) { setOut("result", ""); showAiGate(); runBtn.disabled = false; return; }
      const r = await fetch("/api/ai/generate", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": token }, credentials: "include", body: JSON.stringify({ tool: slug, input }) });
      const data = await readJsonSafe(r);
      if (r.status === 401) { setOut("result", ""); showAiGate(); runBtn.disabled = false; return; }
      if (!r.ok) {
        setOut("result", "");
        setErr("toolErr", data.error || (r.status === 429 ? "You have used all 5 free AI requests for today. Please try again tomorrow." : (r.status === 502 || r.status === 503) ? "The AI service is unavailable right now. Please try again later." : "Something went wrong. Please try again."));
        runBtn.disabled = false;
        return;
      }
      // data.answerHtml is server-sanitized HTML, rendered as HTML on purpose.
      document.getElementById("result").innerHTML = data.answerHtml || "";
      setQuota(data.remaining, data.limit);
      if (saveBtn) saveBtn.hidden = false;
    } catch (e) {
      setOut("result", "");
      setErr("toolErr", "Could not reach the server. Check your connection and try again.");
    }
    runBtn.disabled = false;
  });
  // Page load: login check first (401 shows the gate), then quota + saved.
  (async () => {
    let token = null;
    try { token = await getAiCsrf(); } catch (e) { setErr("toolErr", "Could not reach the server. Check your connection and try again."); return; }
    if (!token) { showAiGate(); return; }
    try { await loadAiUsage(); await loadAiSaved(slug); } catch (e) { setErr("toolErr", "Could not reach the server. Check your connection and try again."); }
  })();
}

function bindTool(tool) {
  const slug = tool.slug;
  const runBtn = document.getElementById("runBtn");
  const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ""; };
  const exampleBtn = document.getElementById("exampleBtn");
  if (exampleBtn) exampleBtn.addEventListener("click", () => {
    if (slug === "word-counter") document.getElementById("in").value = "Hello world. This is a short example paragraph.\n\nIt has two paragraphs.";
    else if (slug === "case-converter") document.getElementById("in").value = "hello world from kavron labs";
    else if (slug === "percentage-calculator") { document.getElementById("in").value = "20"; document.getElementById("in2").value = "250"; }
    else if (slug === "discount-calculator") { document.getElementById("in").value = "1000"; document.getElementById("in2").value = "20"; document.getElementById("in3").value = "5"; }
    else if (slug === "json-formatter") document.getElementById("in").value = '{"name":"Kavron Labs","tools":3}';
    else if (slug === "url-encoder") document.getElementById("in").value = "https://example.com/search?q=hello world&lang=en";
    else if (slug === "meta-description-generator") document.getElementById("in").value = "Kavron Labs brings text, image, PDF, SEO and developer tools together in one simple platform.";
    else if (slug === "slug-generator") document.getElementById("in").value = "My Great Blog Post About Tools!";
    else if (slug === "meta-title-generator") document.getElementById("in").value = "Kavron Labs — Powerful Tools. One Simple Platform.";
    else if (slug === "heading-structure-checker") document.getElementById("in").value = "<h1>Guide</h1><h3>Skipped level</h3><h2>Section</h2><h2>Section</h2>";
    else if (slug === "website-text-analyzer") document.getElementById("in").value = "Fresh bread every morning. Our bakery bakes fresh bread, cakes and pastries every morning for the neighbourhood.";
    else if (slug === "keyword-idea-generator") document.getElementById("in").value = "bakery";
    else if (slug === "html-escaper") document.getElementById("in").value = "<p>Hello & welcome</p>";
    else if (slug === "css-minifier") document.getElementById("in").value = "/* header */ .box { margin: 0; padding: 10px; }";
    else if (slug === "regex-tester") { document.getElementById("in").value = "\\d+"; document.getElementById("in2").value = "g"; document.getElementById("in3").value = "Order 12 and 34 shipped."; }
    else if (slug === "profit-margin-calculator") { document.getElementById("in").value = "60"; document.getElementById("in2").value = "100"; }
    else if (slug === "sales-tax-calculator") { document.getElementById("in").value = "1000"; document.getElementById("in2").value = "17"; }
    else if (slug === "simple-budget-calculator") { document.getElementById("in").value = "50000"; document.getElementById("in2").value = "Rent | 20000\nFood | 15000"; }
    else if (slug === "invoice-generator") { document.getElementById("in").value = "Your Business Name"; document.getElementById("in2").value = "Customer Name"; document.getElementById("in3").value = "Design work | 2 | 5000"; }
    else if (slug === "open-graph-preview") { document.getElementById("in").value = "Kavron Labs — Powerful Tools"; document.getElementById("in2").value = "Working text, image, PDF, SEO and developer tools in one place."; document.getElementById("in3").value = "https://example.com/"; }
    else if (slug === "study-notes-generator") document.getElementById("in").value = "Fresh bread is baked every morning. The bakery uses local flour and traditional recipes. Customers love the morning pastries. Delivery starts at eight in the morning.";
    else if (slug === "flashcard-generator") document.getElementById("in").value = "What is 2 + 2? | 4\nCapital of France? | Paris";
    else if (slug === "quiz-generator") document.getElementById("in").value = "Fresh bread is baked every morning at the bakery.";
    else if (slug === "ai-text-generator") document.getElementById("in").value = "Write a short welcome message for a new bakery in Karachi.";
    else if (slug === "ai-caption-generator") document.getElementById("in").value = "A new bakery in Karachi, fresh bread every morning, warm and friendly.";
    else if (slug === "ai-product-description") document.getElementById("in").value = "Handmade herbal hair oil with alsi, darcheeni, laung, curry patta and hibiscus. For dry, frizzy hair.";
    else if (slug === "ai-email-writer") document.getElementById("in").value = "To a customer: their order will arrive tomorrow, thank them and offer help.";
  });
  document.getElementById("copyBtn").addEventListener("click", () => copyText(document.getElementById("result").textContent || "", "toolMsg"));
  document.getElementById("downloadBtn").addEventListener("click", () => downloadText(slug + "-result.txt", document.getElementById("result").textContent || ""));
  document.getElementById("resetBtn").addEventListener("click", () => {
    const f = document.getElementById("toolForm");
    if (f) f.querySelectorAll("input,textarea,select").forEach((el) => { if (el.type === "checkbox") el.checked = false; else el.value = ""; });
    setOut("result", ""); setErr("toolErr", ""); setErr("toolMsg", "");
    const prev = document.getElementById("imgPreview"); if (prev) { prev.hidden = true; prev.removeAttribute("src"); }
    const info = document.getElementById("imgInfo"); if (info) info.textContent = "";
  });
  const q = document.getElementById("quality");
  if (q) q.addEventListener("input", () => { document.getElementById("qualityVal").textContent = q.value; });
  const decodeBtn = document.getElementById("decodeBtn");
  if (decodeBtn) decodeBtn.addEventListener("click", () => {
    if (slug === "url-encoder") { const r = urlDecode(getVal("in")); if (!r.ok) { setOut("result", ""); setErr("toolErr", r.error); } else setOut("result", r.value); }
    else if (slug === "base64-encoder") { const r = base64Decode(getVal("in")); if (!r.ok) { setOut("result", ""); setErr("toolErr", r.error); } else setOut("result", r.value); }
  });
  const minifyBtn = document.getElementById("minifyBtn");
  if (minifyBtn) minifyBtn.addEventListener("click", () => { const r = validateJson(getVal("in")); if (!r.ok) { setOut("result", ""); setErr("toolErr", "Invalid JSON: " + r.error); } else setOut("result", r.minified); });
  const dateBtn = document.getElementById("dateBtn");
  if (dateBtn) dateBtn.addEventListener("click", () => { document.getElementById("in").value = Math.floor(Date.now() / 1000); });
  const dateToUnixBtn = document.getElementById("dateToUnixBtn");
  if (dateToUnixBtn) dateToUnixBtn.addEventListener("click", () => { const v = getVal("in2"); if (!v) { setErr("toolErr", "Pick a date and time first."); return; } setOut("result", String(Math.floor(new Date(v).getTime() / 1000))); });
  const rgbBtn = document.getElementById("rgbBtn");
  if (rgbBtn) rgbBtn.addEventListener("click", () => { const r = rgbToHex(getVal("in2"), getVal("in3"), document.getElementById("bIn").value); if (!r.ok) { setOut("result", ""); setErr("toolErr", r.error); } else setOut("result", r.hex); });
  if (isAiTool(slug)) { bindAiTool(tool); return; }
  if (!runBtn) return;
  runBtn.addEventListener("click", async () => {
    setErr("toolErr", ""); setErr("toolMsg", ""); setOut("result", "Working…");
    try {
      if (slug === "word-counter") { const c = countWords(getVal("in")); setOut("result", `Words: ${c.words}\nCharacters: ${c.chars}\nCharacters (no spaces): ${c.charsNoSpaces}\nSentences: ${c.sentences}\nParagraphs: ${c.paragraphs}\nReading time: ${c.readingMinutes} minute(s)`); }
      else if (slug === "case-converter") setOut("result", convertCase(getVal("in"), getVal("mode")));
      else if (slug === "percentage-calculator") { const r = percentageCalc(getVal("mode"), getVal("in"), getVal("in2")); if (!r.ok) { setOut("result", ""); setErr("toolErr", r.error); } else setOut("result", `${r.label} = ${r.result}`); }
      else if (slug === "discount-calculator") { const r = discountCalc(getVal("in"), getVal("in2"), getVal("in3")); if (!r.ok) { setOut("result", ""); setErr("toolErr", r.error); } else setOut("result", `Savings: ${r.savings}\nPrice after discount: ${r.afterDiscount}\nTax: ${r.tax}\nFinal price: ${r.final}`); }
      else if (slug === "lorem-generator") setOut("result", loremGenerator(getVal("in")));
      else if (slug === "image-compressor" || slug === "image-resizer") await runImageTool(slug, getVal);
      else if (slug === "image-format-converter" || slug === "image-format-info") await runFileTool(slug);
      else if (slug === "json-formatter") { const r = validateJson(getVal("in")); if (!r.ok) { setOut("result", ""); setErr("toolErr", "Invalid JSON: " + r.error); } else setOut("result", r.formatted); }
      else if (slug === "url-encoder") setOut("result", urlEncode(getVal("in")));
      else if (slug === "uuid-generator") { const n = Math.max(1, Math.min(50, Number(getVal("in")) || 5)); setOut("result", Array.from({ length: n }, () => crypto.randomUUID()).join("\n")); }
      else if (slug === "meta-description-generator") { const d = trimMeta(getVal("in"), 160); setOut("result", `Meta description (${d.length} / 160 chars):\n${d}\n\nSERP preview:\n${getVal("in2") ? getVal("in2") + " | Kavron Labs" : "Your page title"}\n${d}`); }
      else if (slug === "base64-encoder") setOut("result", base64Encode(getVal("in")));
      else if (slug === "slug-generator") setOut("result", slugify(getVal("in")) || "Enter a title to generate a slug.");
      else if (slug === "hash-generator") { const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(getVal("in"))); setOut("result", Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("")); }
      else if (slug === "timestamp-converter") { const ts = Number(getVal("in")); if (!Number.isFinite(ts)) { setOut("result", ""); setErr("toolErr", "Enter a valid Unix timestamp."); } else setOut("result", new Date(ts * 1000).toString() + "\nUTC: " + new Date(ts * 1000).toISOString()); }
      else if (slug === "color-converter") { const r = hexToRgb(getVal("in")); if (!r.ok) { setOut("result", ""); setErr("toolErr", r.error); } else setOut("result", r.rgb); }
      else if (slug === "robots-generator") setOut("result", robotsGenerator(document.getElementById("allowAll").checked, getVal("in")));
      else if (slug === "sitemap-generator") setOut("result", sitemapGenerator(getVal("in")));
      else if (slug === "meta-title-generator") { const r = metaTitleCheck(getVal("in")); setOut("result", `Title: ${r.title}\nLength: ${r.length} characters\nEstimated pixel width: ${r.pixelEstimate}px (fits ~600px SERP limit: ${r.fits ? "yes" : "no — shorten it"}\n\nSERP preview:\n${r.title}\n${trimMeta(getVal("in"), 160)}\n${r.note}`); }
      else if (slug === "open-graph-preview") { setOut("result", `Open Graph preview (from your inputs, not a live fetch):\nTitle: ${getVal("in")}\nDescription: ${getVal("in2")}\nURL: ${getVal("in3")}\nImage: ${getVal("in4") || "(none provided)"}`); }
      else if (slug === "heading-structure-checker") { const r = headingChecker(getVal("in")); const lines = r.headings.map((h) => `H${h.level}: ${h.text || "(empty)"}`).join("\n") || "(no headings found)"; const issues = [...(r.missingH1 ? ["Missing H1"] : []), ...r.skippedLevels, ...(r.duplicates.length ? ["Duplicate headings: " + r.duplicates.join(", ")] : [])]; setOut("result", `Headings found: ${r.count}\n${lines}\n\nIssues: ${issues.length ? issues.join("; ") : "None — structure looks clean."}`); }
      else if (slug === "website-text-analyzer") { const r = textAnalyzer(getVal("in")); setOut("result", `Words: ${r.words}\nCharacters: ${r.chars}\nSentences: ${r.sentences}\nReading time: ${r.readingMinutes} minute(s)\nAverage sentence length: ${r.avgSentenceLength} words\nApproximate reading level: ${r.readingLevel} (${r.readingLevelNote})\n\nTop keywords:\n${r.topKeywords.map((k) => `${k.word} (${k.count})`).join("\n") || "(none)"}`); }
      else if (slug === "keyword-idea-generator") { const ideas = keywordIdeas(getVal("in")); if (!ideas.length) { setOut("result", ""); setErr("toolErr", "Enter a seed word first."); } else setOut("result", `Keyword ideas for "${getVal("in")}" — ideas only, no search-volume data, no ranking promise:\n\n${ideas.join("\n")}`); }
      else if (slug === "html-escaper") setOut("result", htmlEscape(getVal("in")));
      else if (slug === "css-minifier") setOut("result", cssMinify(getVal("in")) + "\n\n— Basic minifier, not a production parser. Check the output before shipping.");
      else if (slug === "jwt-decoder") { const r = jwtDecode(getVal("in")); if (!r.ok) { setOut("result", ""); setErr("toolErr", r.error + "\n" + r.warning); } else setOut("result", `${r.warning}\n\nHeader:\n${JSON.stringify(r.header, null, 2)}\n\nPayload:\n${JSON.stringify(r.payload, null, 2)}`); }
      else if (slug === "regex-tester") { const r = regexTest(getVal("in"), getVal("in2"), getVal("in3")); if (!r.ok) { setOut("result", ""); setErr("toolErr", r.error); } else setOut("result", `Matches: ${r.count}\n${r.matches.map((m) => `"${m.match}" at index ${m.index}`).join("\n") || "(no matches)"}`); }
      else if (slug === "profit-margin-calculator") { const r = profitMargin(getVal("in"), getVal("in2")); if (!r.ok) { setOut("result", ""); setErr("toolErr", r.error); } else setOut("result", `Profit: ${r.profit}\nMargin: ${r.marginPct.toFixed(2)}% (profit ÷ selling price)\nMarkup: ${Number.isFinite(r.markupPct) ? r.markupPct.toFixed(2) + "%" : "n/a (zero cost)"} (profit ÷ cost)`); }
      else if (slug === "sales-tax-calculator") { const r = salesTax(getVal("in"), getVal("in2")); if (!r.ok) { setOut("result", ""); setErr("toolErr", r.error); } else setOut("result", `Price: ${getVal("in")}\nTax (${getVal("in2")}%): ${r.tax}\nTotal: ${r.total}`); }
      else if (slug === "simple-budget-calculator") { const rows = getVal("in2").split("\n").map((l) => l.trim()).filter(Boolean); const amounts = []; const bad = []; rows.forEach((l) => { const parts = l.split("|"); const amt = Number((parts[1] || "").trim()); if (parts.length < 2 || !Number.isFinite(amt)) bad.push(l); else amounts.push(amt); }); if (bad.length) { setOut("result", ""); setErr("toolErr", "These expense lines need the format 'label | amount': " + bad.join("; ")); } else { const r = budgetCalc(getVal("in"), amounts); if (!r.ok) { setOut("result", ""); setErr("toolErr", r.error); } else setOut("result", `Income: ${r.income}\nTotal expenses: ${r.totalExpenses}\nRemaining: ${r.remaining}`); } }
      else if (slug === "invoice-generator") { const rows = getVal("in3").split("\n").map((l) => l.trim()).filter(Boolean); const items = []; const bad = []; rows.forEach((l) => { const p = l.split("|").map((x) => x.trim()); const q = Number(p[1]), pr = Number(p[2]); if (p.length < 3 || !p[0] || !Number.isFinite(q) || !Number.isFinite(pr)) bad.push(l); else items.push({ desc: p[0], qty: q, price: pr }); }); if (!items.length) { setOut("result", ""); setErr("toolErr", "Add at least one item as: description | quantity | unit price" + (bad.length ? ". Skipped: " + bad.join("; ") : "")); } else { const taxRate = Number(getVal("in4")) || 0; const subtotal = items.reduce((a, i) => a + i.qty * i.price, 0); const tax = subtotal * (taxRate / 100); const total = subtotal + tax; const rowsHtml = items.map((i) => `<tr><td>${esc(i.desc)}</td><td>${i.qty}</td><td>${i.price}</td><td>${i.qty * i.price}</td></tr>`).join(""); const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice</title></head><body><h1>Invoice</h1><p><strong>From:</strong> ${esc(getVal("in"))}</p><p><strong>To:</strong> ${esc(getVal("in2"))}</p><table border="1" cellpadding="8"><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr>${rowsHtml}</table><p>Subtotal: ${subtotal}</p><p>Tax (${taxRate}%): ${tax}</p><p><strong>Total: ${total}</strong></p></body></html>`; downloadText("invoice.html", html, "text/html"); setOut("result", `Invoice ready and downloading as invoice.html.\nItems: ${items.length}\nSubtotal: ${subtotal}\nTax (${taxRate}%): ${tax}\nTotal: ${total}`); } }
      else if (slug === "study-notes-generator") { const notes = extractiveNotes(getVal("in"), getVal("in2")); if (!notes.length) { setOut("result", ""); setErr("toolErr", "Paste some text first."); } else setOut("result", `Study notes (extractive — key sentences picked from your text, not AI-written):\n\n${notes.map((n, i) => `${i + 1}. ${n}`).join("\n")}`); }
      else if (slug === "flashcard-generator") { const r = parseFlashcards(getVal("in")); if (!r.cards.length) { setOut("result", ""); setErr("toolErr", "Write cards as: Question | Answer, one per line."); } else { document.getElementById("result").innerHTML = `<p>${r.cards.length} card(s)${r.skipped ? ` (${r.skipped} line(s) skipped — they need a | separator)` : ""}. Click a card to reveal its answer.</p>` + r.cards.map((c) => `<details class="flash-card"><summary>${esc(c.question)}</summary><p>${esc(c.answer)}</p></details>`).join(""); } }
      else if (slug === "quiz-generator") { const qs = quizBlanks(getVal("in")); if (!qs.length) { setOut("result", ""); setErr("toolErr", "Paste sentences with words longer than 4 letters first."); } else { document.getElementById("result").innerHTML = `<p>${qs.length} question(s) — template-based, local, non-AI. Click to reveal each answer.</p>` + qs.map((q, i) => `<details class="flash-card"><summary>Q${i + 1}: ${esc(q.question)}</summary><p>Answer: ${esc(q.answer)}</p></details>`).join(""); } }
      else setOut("result", "Tool not implemented.");
    } catch (e) { setOut("result", ""); setErr("toolErr", e && e.message ? e.message : "Something went wrong."); }
  });
}

function pageAll() {
  document.title = "Tools — Kavron Labs";
  const total = TOOLS.length + PDF_TOOLS.length;
  app.innerHTML = `<h2>All Tools</h2><p class="sec-sub">${total} free tools. Most tools run in your browser — no uploads, no account needed. AI tools need a login and give 5 free requests a day.</p>
  <div class="searchbar"><input id="toolSearch" type="search" placeholder="Search all tools — try “excel”, “pdf”, “image”… " aria-label="Search tools"><button type="button" id="searchClear" class="secondary" hidden>Clear ×</button></div>
  <p id="noMatch" class="notice" hidden>No tools match your search. Try another keyword, or clear the search to see all tools.</p>` +
    Object.keys(CATS).map((k) => {
      if (k === "pdf") {
        const sections = PDF_SECTIONS.map((s) => {
          const list = PDF_TOOLS.filter((t) => t.section === s.id);
          return `<div data-list-section><h3>${esc(s.title)}</h3><div class="grid">${list.map(pdfCard).join("")}</div></div>`;
        }).join("");
        return `<div data-list-section><h2>${esc(CATS[k].name)}</h2><p class="sec-sub">${esc(CATS[k].desc)}</p>${sections}</div>`;
      }
      const list = TOOLS.filter((t) => t.cat === k);
      return `<div data-list-section><h2>${esc(CATS[k].name)}</h2><p class="sec-sub">${esc(CATS[k].desc)}</p><div class="grid">${list.map(toolCard).join("")}</div></div>`;
    }).join("");
  bindLiveSearch("toolSearch", "searchClear", "noMatch");
}

function pageCategory(catKey) {
  if (catKey === "pdf") {
    document.title = "PDF Tools — Kavron Labs";
    app.innerHTML = pdfListHtml();
    bindPdfList();
    window.scrollTo(0, 0);
    return;
  }
  const cat = CATS[catKey];
  if (!cat) { pageAll(); return; }
  document.title = `${cat.name} — Kavron Labs`;
  const list = TOOLS.filter((t) => t.cat === catKey);
  const headIcon = cat.logo
    ? `<img class="logo" src="${esc(cat.logo)}" alt="${esc(cat.name)} logo">`
    : `<span class="tool-icon cat-${catKey}" aria-hidden="true">${esc(cat.icon || "🔧")}</span>`;
  app.innerHTML = `<p class="crumb"><a href="/">Home</a> › <a href="/tools.html">All Tools</a> › ${esc(cat.name)}</p>
  <div class="tool-head">${headIcon}<div><h1>${esc(cat.name)}</h1><p>${esc(cat.desc)}</p></div></div>
  <p class="small">${catKey === "ai" ? "Requires login. 5 free AI requests per day." : "Free to use. No account needed. Your files and text stay in your browser."}</p>
  <div class="searchbar"><input id="toolSearch" type="search" placeholder="Search ${esc(cat.name)} — try a keyword…" aria-label="Search ${esc(cat.name)}"><button type="button" id="searchClear" class="secondary" hidden>Clear ×</button></div>
  <p id="noMatch" class="notice" hidden>No tools match your search. Try another keyword, or clear the search to see all tools.</p>
  <div class="grid">${list.map(toolCard).join("")}</div>`;
  bindLiveSearch("toolSearch", "searchClear", "noMatch");
}

function pageTool(slug) {
  if (slug === "images-to-pdf") slug = "jpg-to-pdf"; // same tool, new name
  const pdfTool = pdfToolBySlug(slug);
  if (pdfTool) {
    const cat = CATS.pdf;
    const isServerPdf = slug === "protect-pdf" || slug === "unlock-pdf";
    document.title = `${pdfTool.name} — Kavron Labs`;
    const related = PDF_TOOLS.filter((t) => t.section === pdfTool.section && t.slug !== slug).slice(0, 6);
    app.innerHTML = `<p class="crumb"><a href="/">Home</a> › <a href="/tools.html">All Tools</a> › <a href="/tools.html?cat=pdf">${esc(cat.name)}</a> › ${esc(pdfTool.name)}</p>
  <div class="tool-head"><span class="tool-icon cat-pdf" aria-hidden="true">${esc(pdfTool.icon)}</span><div><h1>${esc(pdfTool.name)}</h1><p>${esc(pdfTool.desc)}</p><p><span class="status ${statusClass(pdfTool)}">${statusLabel(pdfTool)}</span></p></div></div>
  <p class="small">${isServerPdf ? "Requires login. 10 free uses per day." : "Free to use. No account needed for this tool."}</p>
  ${isServerPdf ? `<p id="quotaLine" class="small"></p><div id="pdfGate" class="notice" hidden><p>Please log in to use this tool.</p><p><a href="/#account">Log in or register</a></p><p class="small">Protect and Unlock need an account because each account gets 10 free uses per day.</p></div>` : ""}
  <div class="toolbox" id="toolForm">${pdfToolFormHtml(slug)}</div>
  <div class="toolbox"><div class="btn-row"><button type="button" id="copyBtn" class="secondary">Copy result</button><button type="button" id="downloadBtn" class="secondary">Download result (.txt)</button><button type="button" id="resetBtn" class="secondary">Reset</button></div>
  <p id="toolErr" class="error"></p><p id="toolMsg" class="small"></p><div class="result" id="result" role="status"></div>
  <p class="small">${isServerPdf ? "Privacy: your file is sent to our server over HTTPS, processed in memory, and never stored. Your password is never stored or logged." : "Privacy: this tool runs in your browser. Your files are not uploaded to any server."}</p>
  <h3>FAQ</h3><p>${esc(pdfTool.faq)}</p>
  <h3>Related tools</h3><div class="grid">${related.map(pdfCard).join("")}</div></div>`;
    bindPdfTool(slug);
    window.scrollTo(0, 0);
    return;
  }
  const tool = TOOLS.find((t) => t.slug === slug);
  if (!tool) { pageAll(); return; }
  const cat = CATS[tool.cat];
  document.title = `${tool.name} — Kavron Labs`;
  const related = TOOLS.filter((t) => t.cat === tool.cat && t.slug !== slug);
  const isAi = tool.cat === "ai";
  const privacy = isAi
    ? "Privacy: your input is sent to our server and the AI provider to generate the answer. It is not shared anywhere else."
    : (tool.cat === "image" || tool.cat === "pdf")
      ? "Privacy: this tool runs in your browser. Your files are not uploaded to any server."
      : "Privacy: this tool runs in your browser. Your text is not sent to any server.";
  const aiGateHtml = isAi ? `<div id="aiGate" class="notice" hidden><p>Please log in to use the AI tools.</p><p><a href="/#account">Log in or register</a></p><p class="small">AI tools need an account because each account gets 5 free AI requests per day.</p></div>` : "";
  const quotaHtml = isAi ? `<p id="quotaLine" class="small"></p>` : "";
  const saveBtnHtml = isAi ? `<button type="button" id="saveBtn" class="secondary" hidden>Save result</button>` : "";
  const savedHtml = isAi ? `<h3>Saved results</h3><div id="savedList"><p class="small">No saved results yet for this tool.</p></div>` : "";
  app.innerHTML = `<p class="crumb"><a href="/">Home</a> › <a href="/tools.html">All Tools</a> › <a href="/tools.html?cat=${tool.cat}">${esc(cat.name)}</a> › ${esc(tool.name)}</p>
  <div class="tool-head"><span class="tool-icon cat-${tool.cat}" aria-hidden="true">${esc(tool.icon)}</span><div><h1>${esc(tool.name)}</h1><p>${esc(tool.desc)}</p></div></div>
  <p class="small">${isAi ? "Requires login. 5 free AI requests per day." : "Free to use. No account needed for this tool."}</p>
  ${quotaHtml}
  ${aiGateHtml}
  <div class="toolbox" id="toolForm">${toolFormHtml(slug)}</div>
  <div class="toolbox"><div class="btn-row"><button type="button" id="copyBtn" class="secondary">Copy result</button><button type="button" id="downloadBtn" class="secondary">Download result (.txt)</button><button type="button" id="resetBtn" class="secondary">Reset</button>${saveBtnHtml}</div>
  <p id="toolErr" class="error"></p><p id="toolMsg" class="small"></p><div class="result" id="result" role="status"></div>
  ${savedHtml}
  <p class="small">${esc(privacy)}</p>
  <h3>FAQ</h3><p>${esc(tool.faq)}</p>
  <h3>Related tools</h3><div class="grid">${related.map(toolCard).join("")}</div></div>`;
  bindTool(tool);
}

function render() {
  const params = new URLSearchParams(location.search);
  const tool = params.get("tool");
  const cat = params.get("cat");
  if (tool) pageTool(tool);
  else if (cat) pageCategory(cat);
  else pageAll();
  window.scrollTo(0, 0);
}

render();
