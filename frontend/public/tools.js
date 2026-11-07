// Kavron Labs tools pages (tools.html) — frontend-only.
// Every tool here runs fully in the browser. There is no network call of
// any kind in this file: no login, no AI tools, no saved results, no pricing.
// Image and PDF files are processed with Canvas in the browser and are
// never uploaded anywhere.
// Loaded as an external module on purpose: the site CSP allows scripts
// only from the site itself ('self'), so no inline scripts and no inline
// event attributes are used anywhere in the pack.

import { countWords, convertCase, percentageCalc, discountCalc, loremGenerator } from "./pure.js";
import { PDF_TOOLS, PDF_SECTIONS, pdfToolBySlug, statusLabel, statusClass, searchText, pdfToolFormHtml, bindPdfTool, pdfListHtml, bindPdfList } from "./pdf-tools.js";

const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB per image, fixed and stated on the page.
const app = document.getElementById("app");

const CATS = {
  image: { name: "Picture Tools", logo: "/logo-picture.webp", desc: "Resize, compress and convert images — in your browser, nothing uploaded." },
  pdf: { name: "PDF Tools", logo: "/logo-pdf.webp", desc: "42 free PDF tools — merge, split, convert, sign, organise and more, in your browser." },
  text: { name: "Text Tools", logo: "/logo-text.webp", desc: "Count words, change text case, calculate percentages and discounts." },
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
      else setOut("result", "Tool not implemented.");
    } catch (e) { setOut("result", ""); setErr("toolErr", e && e.message ? e.message : "Something went wrong."); }
  });
}

function pageAll() {
  document.title = "Tools — Kavron Labs";
  const total = TOOLS.length + PDF_TOOLS.length;
  app.innerHTML = `<h2>All Tools</h2><p class="sec-sub">${total} free tools. Everything runs in your browser — no uploads, no account needed.</p>
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
  app.innerHTML = `<p class="crumb"><a href="/">Home</a> › <a href="/tools.html">All Tools</a> › ${esc(cat.name)}</p>
  <div class="tool-head"><img class="logo" src="${esc(cat.logo)}" alt="${esc(cat.name)} logo"><div><h1>${esc(cat.name)}</h1><p>${esc(cat.desc)}</p></div></div>
  <p class="small">Free to use. No account needed. Your files and text stay in your browser.</p>
  <div class="grid">${list.map(toolCard).join("")}</div>`;
}

function pageTool(slug) {
  if (slug === "images-to-pdf") slug = "jpg-to-pdf"; // same tool, new name
  const pdfTool = pdfToolBySlug(slug);
  if (pdfTool) {
    const cat = CATS.pdf;
    document.title = `${pdfTool.name} — Kavron Labs`;
    const related = PDF_TOOLS.filter((t) => t.section === pdfTool.section && t.slug !== slug).slice(0, 6);
    app.innerHTML = `<p class="crumb"><a href="/">Home</a> › <a href="/tools.html">All Tools</a> › <a href="/tools.html?cat=pdf">${esc(cat.name)}</a> › ${esc(pdfTool.name)}</p>
  <div class="tool-head"><span class="tool-icon cat-pdf" aria-hidden="true">${esc(pdfTool.icon)}</span><div><h1>${esc(pdfTool.name)}</h1><p>${esc(pdfTool.desc)}</p><p><span class="status ${statusClass(pdfTool)}">${statusLabel(pdfTool)}</span></p></div></div>
  <p class="small">Free to use. No account needed for this tool.</p>
  <div class="toolbox" id="toolForm">${pdfToolFormHtml(slug)}</div>
  <div class="toolbox"><div class="btn-row"><button type="button" id="copyBtn" class="secondary">Copy result</button><button type="button" id="downloadBtn" class="secondary">Download result (.txt)</button><button type="button" id="resetBtn" class="secondary">Reset</button></div>
  <p id="toolErr" class="error"></p><p id="toolMsg" class="small"></p><div class="result" id="result" role="status"></div>
  <p class="small">Privacy: this tool runs in your browser. Your files are not uploaded to any server.</p>
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
  const privacy = (tool.cat === "image" || tool.cat === "pdf")
    ? "Privacy: this tool runs in your browser. Your files are not uploaded to any server."
    : "Privacy: this tool runs in your browser. Your text is not sent to any server.";
  app.innerHTML = `<p class="crumb"><a href="/">Home</a> › <a href="/tools.html">All Tools</a> › <a href="/tools.html?cat=${tool.cat}">${esc(cat.name)}</a> › ${esc(tool.name)}</p>
  <div class="tool-head"><span class="tool-icon cat-${tool.cat}" aria-hidden="true">${esc(tool.icon)}</span><div><h1>${esc(tool.name)}</h1><p>${esc(tool.desc)}</p></div></div>
  <p class="small">Free to use. No account needed for this tool.</p>
  <div class="toolbox" id="toolForm">${toolFormHtml(slug)}</div>
  <div class="toolbox"><div class="btn-row"><button type="button" id="copyBtn" class="secondary">Copy result</button><button type="button" id="downloadBtn" class="secondary">Download result (.txt)</button><button type="button" id="resetBtn" class="secondary">Reset</button></div>
  <p id="toolErr" class="error"></p><p id="toolMsg" class="small"></p><div class="result" id="result" role="status"></div>
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
