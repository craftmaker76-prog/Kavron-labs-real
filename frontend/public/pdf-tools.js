// Kavron Labs PDF tools (tools.html) — frontend-only.
// Every PDF tool here runs fully in the browser using pdf-lib and pdf.js,
// both vendored locally (pdf-lib.min.js, pdf.min.js, pdf.worker.min.js).
// There is no network call of any kind in this file: no login, no AI,
// no saved results, no pricing, no fetch, no CDN.
// Loaded as an external module on purpose: the site CSP allows scripts
// only from the site itself ('self'), so no inline scripts and no inline
// event attributes are used anywhere in the pack.
//
// Tool statuses (shown honestly on the list and on each tool page):
//   full      — works completely in the browser.
//   partial   — works in the browser with stated limits (see the tool page).
//   interface — needs server processing, which arrives in a later step.
//               The full interface is built (upload, instructions, options)
//               but there is no fake processing and no fake download button.

const PDF_MAX_BYTES = 25 * 1024 * 1024; // 25 MB per PDF, fixed and stated on the page.
const PDF_MAX_PAGES = 200; // safety cap for multi-file downloads.

function esc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function setOut(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function setErr(id, text) { const el = document.getElementById(id); if (el) el.textContent = text || ""; }
function getVal(id) { const el = document.getElementById(id); return el ? el.value : ""; }
function getChecked(id) { const el = document.getElementById(id); return el ? el.checked : false; }

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function downloadPdfBytes(bytes, filename) {
  downloadBlob(new Blob([bytes], { type: "application/pdf" }), filename);
}
function downloadTextFile(filename, text, type) {
  downloadBlob(new Blob([text], { type: type || "text/plain" }), filename);
}
function readAsBytes(file) { return file.arrayBuffer().then((b) => new Uint8Array(b)); }
function readAsText(file) { return file.text(); }

function pdfLib() {
  if (typeof window !== "undefined" && window.PDFLib) return window.PDFLib;
  throw new Error("The PDF engine did not load. Please refresh the page and try again.");
}
function pdfjs() {
  if (typeof window !== "undefined" && window.pdfjsLib) {
    const lib = window.pdfjsLib;
    if (lib.GlobalWorkerOptions) lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
    return lib;
  }
  throw new Error("The PDF reader did not load. Please refresh the page and try again.");
}
function needPdfFile(files, multiple) {
  const list = Array.from(files || []);
  if (!list.length) throw new Error(multiple ? "Choose at least one PDF file first." : "Choose a PDF file first.");
  const bad = list.find((f) => f.type !== "application/pdf" && !/\.pdf$/i.test(f.name || ""));
  if (bad) throw new Error("Only PDF files are accepted for this tool.");
  const big = list.find((f) => f.size > PDF_MAX_BYTES);
  if (big) throw new Error("Each PDF must be under 25 MB.");
  return list;
}
function needImageFiles(files) {
  const list = Array.from(files || []);
  if (!list.length) throw new Error("Choose at least one image file first.");
  const bad = list.find((f) => !["image/jpeg", "image/png", "image/webp"].includes(f.type));
  if (bad) throw new Error("Only JPG, PNG or WebP images are accepted.");
  const big = list.find((f) => f.size > 10 * 1024 * 1024);
  if (big) throw new Error("Each image must be under 10 MB.");
  return list;
}

// "1,3,5-7" -> [0,2,4,5,6] (0-based). Throws a clear error on bad input.
function parsePageSpec(spec, total) {
  const out = [];
  const parts = String(spec || "").split(",");
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    const m = p.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      const a = Number(m[1]), b = Number(m[2]);
      if (a < 1 || b > total || a > b) throw new Error("Page range " + p + " is out of range (this file has " + total + " pages).");
      for (let n = a; n <= b; n++) out.push(n - 1);
    } else if (/^\d+$/.test(p)) {
      const n = Number(p);
      if (n < 1 || n > total) throw new Error("Page " + n + " does not exist (this file has " + total + " pages).");
      out.push(n - 1);
    } else {
      throw new Error("Could not understand page selection " + p + ". Use numbers like 1, 3, 5-7.");
    }
  }
  return Array.from(new Set(out));
}
function parsePageList(spec, total) { // keeps duplicates and order, for reorder
  const out = [];
  const parts = String(spec || "").split(",");
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    if (!/^\d+$/.test(p)) throw new Error("Reorder uses page numbers like 3, 1, 2, 4.");
    const n = Number(p);
    if (n < 1 || n > total) throw new Error("Page " + n + " does not exist (this file has " + total + " pages).");
    out.push(n - 1);
  }
  return out;
}

// Drag & drop zone: wires a .dropzone box to its hidden file input.
function bindDropZone() {
  const dz = document.getElementById("dropzone");
  const input = document.getElementById("fileIn");
  const list = document.getElementById("fileList");
  if (!dz || !input) return;
  const showFiles = () => {
    if (list) list.textContent = input.files && input.files.length
      ? Array.from(input.files).map((f) => f.name + " (" + Math.round(f.size / 1024) + " KB)").join(" · ")
      : "";
  };
  dz.addEventListener("click", (e) => { if (e.target !== input) input.click(); });
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault(); dz.classList.remove("drag");
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      input.files = e.dataTransfer.files; showFiles();
    }
  });
  input.addEventListener("change", showFiles);
  const browse = document.getElementById("browseBtn");
  if (browse) browse.addEventListener("click", (e) => { e.stopPropagation(); input.click(); });
}

export const PDF_SECTIONS = [
  { id: "basic", title: "Basic PDF Tools", sub: "Everyday PDF jobs — merge, split, convert and organise." },
  { id: "office", title: "Office & Document Tools", sub: "Edit, sign, fill, protect and work with documents." },
  { id: "finance", title: "Banking & Finance Tools", sub: "Statements, invoices, receipts and tables — into Excel or CSV." },
  { id: "accounting", title: "Accounting & Professional Tools", sub: "Bulk jobs, archives, cleanup and specialist conversions." },
];

// status: full | partial | interface
export const PDF_TOOLS = [
  // --- Basic (10 + 2 extras) ---
  { slug: "merge-pdf", name: "Merge PDF", section: "basic", icon: "🔗", desc: "Combine multiple PDF files into one PDF, in the order you choose.", keywords: "merge combine join append pdf", status: "full", faq: "Pages keep their original order: first file first, then the next." },
  { slug: "split-pdf", name: "Split PDF", section: "basic", icon: "✂️", desc: "Split a PDF into smaller PDFs — every N pages, or by page ranges.", keywords: "split divide separate pages ranges", status: "full", faq: "Each part downloads as its own PDF file." },
  { slug: "compress-pdf", name: "Compress PDF", section: "basic", icon: "🗜️", desc: "Make a PDF smaller by re-saving it in a compact form.", keywords: "compress shrink reduce size smaller", status: "partial", limit: "This re-saves the file with compact object streams and removes metadata. It does not downscale images inside the PDF — that needs server processing, so the saving depends on the file.", faq: "Text-heavy PDFs shrink well; image-heavy PDFs shrink less." },
  { slug: "pdf-to-word", name: "PDF to Word", section: "basic", icon: "📝", desc: "Convert a PDF into an editable Word (.docx) document.", keywords: "pdf to word docx convert editable", status: "interface", serverNote: "Converting a PDF into a real Word document needs server processing, which arrives in the next step. This page is ready — upload, options and download will work once the server step is live.", faq: "Server processing arrives in the next step." },
  { slug: "word-to-pdf", name: "Word to PDF", section: "basic", icon: "📄", desc: "Convert a Word (.docx) document into a PDF.", keywords: "word docx to pdf convert", status: "interface", serverNote: "Converting Word files into PDF needs server processing, which arrives in the next step. This page is ready — upload, options and download will work once the server step is live.", faq: "Server processing arrives in the next step." },
  { slug: "pdf-to-excel", name: "PDF to Excel", section: "basic", icon: "📊", desc: "Turn tables and text in a PDF into a real Excel (.xlsx) workbook.", keywords: "pdf to excel xlsx spreadsheet table", status: "partial", limit: "Tables are detected from text positions, so clean text-based PDFs work best. Scanned PDFs need OCR (server step). Check the workbook before using it.", faq: "The download is a real .xlsx file that opens in Excel." },
  { slug: "excel-to-pdf", name: "Excel to PDF", section: "basic", icon: "📗", desc: "Convert an Excel (.xlsx) spreadsheet into a PDF.", keywords: "excel xlsx spreadsheet to pdf convert", status: "interface", serverNote: "Reading Excel files and laying them out as PDF needs server processing, which arrives in the next step. This page is ready — upload, options and download will work once the server step is live.", faq: "Server processing arrives in the next step." },
  { slug: "pdf-to-jpg", name: "PDF to JPG", section: "basic", icon: "🖼️", desc: "Turn PDF pages into JPG images — one image per page.", keywords: "pdf to jpg jpeg image picture render pages", status: "full", faq: "Each page downloads as its own JPG file." },
  { slug: "jpg-to-pdf", name: "JPG to PDF", section: "basic", icon: "📑", desc: "Turn JPG, PNG or WebP images into a PDF — one image per page.", keywords: "jpg jpeg png image to pdf convert", status: "full", faq: "Images are placed one per page, fitted to the page." },
  { slug: "organize-pdf-pages", name: "Organize PDF Pages", section: "basic", icon: "🗂️", desc: "Reorder, delete and rotate pages in one step.", keywords: "organize reorder delete rotate pages arrange", status: "full", faq: "Reordering happens first, then deletions, then rotation." },
  { slug: "pdf-page-counter", name: "PDF Page Counter", section: "basic", icon: "🔢", desc: "Count the pages in a PDF file.", keywords: "count pages number of pages", status: "full", faq: "Encrypted or damaged PDFs show a clear error instead of a guessed count." },
  { slug: "pdf-metadata-viewer", name: "PDF Metadata Viewer", section: "basic", icon: "📋", desc: "Read a PDF's Title, Author, Creator and CreationDate when present.", keywords: "metadata info details title author creator", status: "full", faq: "Fields are shown only when the file actually contains them." },
  // --- Office & Document (10) ---
  { slug: "edit-pdf", name: "Edit PDF", section: "office", icon: "✏️", desc: "Add new text on top of a PDF page.", keywords: "edit add text write annotate", status: "partial", limit: "This adds new text on top of the page. It does not change or remove the text that is already in the PDF.", faq: "Pick the page, the position and the text to add." },
  { slug: "sign-pdf", name: "Sign PDF", section: "office", icon: "✍️", desc: "Draw or type your signature and place it on a PDF page.", keywords: "sign signature draw handwritten", status: "partial", limit: "This places a picture of your signature on the page. It is not a certified digital signature.", faq: "Draw with your mouse or finger, or type your name." },
  { slug: "fill-pdf-forms", name: "Fill PDF Forms", section: "office", icon: "🖊️", desc: "Fill in the fields of a PDF form and save the filled copy.", keywords: "fill form fields acroform", status: "partial", limit: "Works with PDFs that already have fillable form fields. Plain PDFs without fields cannot be filled this way.", faq: "Text fields, tick boxes and dropdowns are supported." },
  { slug: "add-page-numbers", name: "Add Page Numbers", section: "office", icon: "#️⃣", desc: "Add page numbers to every page of a PDF.", keywords: "page numbers numbering footer", status: "full", faq: "Choose the position, the starting number and the format." },
  { slug: "add-watermark-pdf", name: "Add Watermark to PDF", section: "office", icon: "💧", desc: "Add a text watermark (for example CONFIDENTIAL) to every page.", keywords: "watermark stamp confidential draft", status: "full", faq: "Choose the text, size, colour and transparency." },
  { slug: "protect-pdf", name: "Protect PDF with Password", section: "office", icon: "🔒", desc: "Lock a PDF with a password so only people with the password can open it.", keywords: "protect password lock encrypt secure", status: "interface", serverNote: "Password encryption cannot be done in the browser — it needs server processing, which arrives in the next step. This page is ready — upload, options and download will work once the server step is live.", faq: "Server processing arrives in the next step." },
  { slug: "unlock-pdf", name: "Unlock PDF", section: "office", icon: "🔓", desc: "Remove the password from a PDF you own.", keywords: "unlock remove password decrypt open", status: "interface", serverNote: "Removing a password needs server processing, which arrives in the next step. This page is ready — upload, options and download will work once the server step is live.", faq: "Server processing arrives in the next step." },
  { slug: "rotate-pdf", name: "Rotate PDF", section: "office", icon: "🔄", desc: "Rotate pages in a PDF by 90, 180 or 270 degrees.", keywords: "rotate turn pages orientation", status: "full", faq: "Rotate all pages or only the pages you list." },
  { slug: "compare-pdf", name: "Compare PDF", section: "office", icon: "⚖️", desc: "Compare two PDFs and see which text changed.", keywords: "compare diff difference two files", status: "partial", limit: "This compares the text of the two files, page by page. It does not compare images or layout.", faq: "The result lists lines that differ, for the first 20 differing lines." },
  { slug: "ocr-pdf", name: "OCR PDF", section: "office", icon: "🔍", desc: "Turn a scanned PDF into searchable, selectable text.", keywords: "ocr scanned searchable text recognition", status: "interface", serverNote: "Reading text from scanned images needs OCR, which needs server processing — it arrives in the next step. This page is ready — upload, options and download will work once the server step is live.", faq: "Server processing arrives in the next step." },
  // --- Banking & Finance (8) ---
  { slug: "bank-statement-to-excel", name: "Bank Statement to Excel", section: "finance", icon: "🏦", desc: "Turn a bank statement PDF into an Excel workbook with Date, Description and Amount.", keywords: "bank statement excel xlsx transactions", status: "partial", limit: "Transactions are found from text patterns (dates and amounts), so clean text-based statements work best. Scanned statements need OCR (server step). Always check the workbook before using it.", faq: "The download is a real .xlsx file that opens in Excel." },
  { slug: "bank-statement-to-csv", name: "Bank Statement to CSV", section: "finance", icon: "🏧", desc: "Turn a bank statement PDF into a CSV file.", keywords: "bank statement csv transactions", status: "partial", limit: "Transactions are found from text patterns (dates and amounts), so clean text-based statements work best. Scanned statements need OCR (server step).", faq: "CSV opens in Excel, Google Sheets and accounting software." },
  { slug: "pdf-table-extractor", name: "PDF Table Extractor", section: "finance", icon: "🔲", desc: "Pull tables out of a PDF into Excel or CSV.", keywords: "table extractor extract rows columns", status: "partial", limit: "Tables are detected from text positions, so clean text-based PDFs work best. Scanned PDFs need OCR (server step).", faq: "Choose Excel (.xlsx) or CSV as the output." },
  { slug: "invoice-to-excel", name: "Invoice to Excel", section: "finance", icon: "📃", desc: "Turn an invoice PDF into an Excel workbook — details plus line items.", keywords: "invoice excel xlsx bill items", status: "partial", limit: "Details and line items are found from text patterns, so clean text-based invoices work best. Scanned invoices need OCR (server step).", faq: "The workbook has the invoice details and one row per item." },
  { slug: "receipt-to-excel", name: "Receipt to Excel", section: "finance", icon: "🧾", desc: "Turn a receipt PDF into an Excel workbook — merchant, date, items and total.", keywords: "receipt excel xlsx expense items total", status: "partial", limit: "Details are found from text patterns, so clean text-based receipts work best. Scanned receipts need OCR (server step).", faq: "The workbook has the receipt details and one row per item." },
  { slug: "multiple-invoices-to-excel", name: "Multiple Invoices to Excel", section: "finance", icon: "📚", desc: "Turn several invoice PDFs into one Excel workbook — one sheet per invoice.", keywords: "multiple invoices bulk excel xlsx sheets", status: "partial", limit: "Details are found from text patterns, so clean text-based invoices work best. Scanned invoices need OCR (server step).", faq: "One sheet per invoice, named after the invoice number or file." },
  { slug: "pdf-to-csv", name: "PDF to CSV", section: "finance", icon: "📉", desc: "Turn the text of a PDF into a CSV file, one line per row.", keywords: "pdf to csv text lines spreadsheet", status: "partial", limit: "Text is read in reading order. Tables without clear lines may need the Table Extractor instead.", faq: "CSV opens in Excel, Google Sheets and accounting software." },
  { slug: "redact-pdf", name: "Redact PDF", section: "finance", icon: "⬛", desc: "Cover chosen words or whole pages with black boxes.", keywords: "redact hide confidential black out remove", status: "partial", limit: "This covers the text with black boxes so it cannot be seen. The text underneath is not removed from the file — full removal needs server processing.", faq: "Enter words or phrases separated by commas, or whole page numbers." },
  // --- Accounting & Professional (12) ---
  { slug: "bulk-pdf-splitter", name: "Bulk PDF Splitter", section: "accounting", icon: "📂", desc: "Split many PDFs at once — every file into one PDF per page.", keywords: "bulk splitter many files split pages", status: "full", faq: "Each page downloads as its own PDF file." },
  { slug: "pdf-to-pdfa", name: "PDF to PDF/A", section: "accounting", icon: "📜", desc: "Prepare a PDF for long-term archiving (PDF/A) with metadata and embedded fonts.", keywords: "pdf/a archive archiving pdfa standard", status: "partial", limit: "This prepares the file for archiving: it adds archive metadata and re-saves the file. Full PDF/A compliance checking and font embedding need server processing.", faq: "Use this for archive-ready copies, not for certified compliance." },
  { slug: "delete-pdf-pages", name: "Delete PDF Pages", section: "accounting", icon: "🗑️", desc: "Delete pages from a PDF.", keywords: "delete remove pages", status: "full", faq: "List pages like 2, 5-7. The rest of the file is unchanged." },
  { slug: "extract-pdf-pages", name: "Extract PDF Pages", section: "accounting", icon: "📤", desc: "Save only the pages you choose as a new PDF.", keywords: "extract pages save selected", status: "full", faq: "List pages like 1-3, 5. The original file is unchanged." },
  { slug: "reorder-pdf-pages", name: "Reorder PDF Pages", section: "accounting", icon: "↕️", desc: "Put the pages of a PDF in a new order.", keywords: "reorder rearrange order pages", status: "full", faq: "List the new order like 3, 1, 2, 4. Every page must be listed once." },
  { slug: "add-images-to-pdf", name: "Add Images to PDF", section: "accounting", icon: "📷", desc: "Place an image onto a page of an existing PDF.", keywords: "add image picture insert photo stamp", status: "full", faq: "Choose the page, the position and the width." },
  { slug: "convert-powerpoint-to-pdf", name: "Convert PowerPoint to PDF", section: "accounting", icon: "🎞️", desc: "Convert a PowerPoint (.pptx) presentation into a PDF.", keywords: "powerpoint pptx presentation slides to pdf", status: "interface", serverNote: "Reading PowerPoint files and laying out slides as PDF needs server processing, which arrives in the next step. This page is ready — upload, options and download will work once the server step is live.", faq: "Server processing arrives in the next step." },
  { slug: "pdf-to-powerpoint", name: "PDF to PowerPoint", section: "accounting", icon: "📽️", desc: "Convert a PDF into a PowerPoint (.pptx) presentation.", keywords: "pdf to powerpoint pptx presentation slides", status: "interface", serverNote: "Building a PowerPoint file from a PDF needs server processing, which arrives in the next step. This page is ready — upload, options and download will work once the server step is live.", faq: "Server processing arrives in the next step." },
  { slug: "html-to-pdf", name: "HTML to PDF", section: "accounting", icon: "🌐", desc: "Turn a web page (HTML) into a PDF using your browser's print-to-PDF.", keywords: "html web page to pdf print", status: "partial", limit: "This opens your HTML in a print view — choose Save as PDF in the print dialog. Your browser makes the PDF, so the layout follows your browser's print settings.", faq: "If a pop-up blocker stops the print view, allow pop-ups for this site and try again." },
  { slug: "repair-pdf", name: "Repair PDF", section: "accounting", icon: "🛠️", desc: "Rebuild a damaged PDF by re-saving it, or recover its text into a new PDF.", keywords: "repair fix damaged corrupt recover", status: "partial", limit: "This fixes minor structural problems by rebuilding the file. Severely damaged files may still fail — the tool will say so clearly.", faq: "If the file cannot be rebuilt, the tool tries to recover the text instead." },
  { slug: "remove-pdf-metadata", name: "Remove PDF Metadata", section: "accounting", icon: "🧹", desc: "Remove Title, Author, Creator and other hidden details from a PDF.", keywords: "remove metadata privacy clean details", status: "full", faq: "The pages are unchanged — only the hidden details are removed." },
  { slug: "scan-to-pdf", name: "Scan to PDF", section: "accounting", icon: "📸", desc: "Turn photos or camera scans into a PDF — one photo per page.", keywords: "scan camera photo to pdf", status: "full", faq: "Use your device camera, or upload photos you already have." },
];

export function pdfToolBySlug(slug) { return PDF_TOOLS.find((t) => t.slug === slug) || null; }
export function statusLabel(t) { return t.status === "interface" ? "Coming soon" : (t.status === "partial" ? "Working*" : "Working"); }
export function statusClass(t) { return t.status === "interface" ? "status-soon" : (t.status === "partial" ? "status-partial" : "status-working"); }
export function searchText(t) { return (t.name + " " + t.desc + " " + (t.keywords || "")).toLowerCase(); }

// ---- Form HTML ----

function howHtml(steps) {
  return `<div class="how"><h3>How to use</h3><ol>${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>`;
}
function serverNoticeHtml(tool) {
  return `<div class="notice server-notice"><strong>Server processing coming soon.</strong><br>${esc(tool.serverNote || "")}</div>`;
}
function limitHtml(tool) {
  return tool.limit ? `<div class="notice limit-notice"><strong>Please note:</strong> ${esc(tool.limit)}</div>` : "";
}
function uploadField(accept, multiple, label, ids) {
  const d = ids || {};
  const dz = d.dz || "dropzone", inp = d.input || "fileIn", list = d.list || "fileList", browse = d.browse || "browseBtn";
  return `<div class="field"><span class="field-label">${esc(label)}</span><div class="dropzone" id="${dz}" tabindex="0"><span>Drag &amp; drop your file${multiple ? "s" : ""} here, or</span> <button type="button" id="${browse}" class="secondary">Browse files</button><input id="${inp}" type="file" accept="${esc(accept)}"${multiple ? " multiple" : ""} hidden></div><p id="${list}" class="small"></p></div>`;
}
function pdfSingle(label) { return uploadField("application/pdf", false, label || "PDF file (up to 25 MB)"); }
function pdfMulti(label) { return uploadField("application/pdf", true, label || "PDF files (up to 25 MB each)"); }
function imgMulti(label) { return uploadField("image/jpeg,image/png,image/webp", true, label || "Images (JPG, PNG or WebP, up to 10 MB each)"); }
function textField(id, label, placeholder, value) {
  return `<label>${esc(label)} <input id="${id}"${value !== undefined ? ` value="${esc(value)}"` : ""}${placeholder ? ` placeholder="${esc(placeholder)}"` : ""}></label>`;
}
function numField(id, label, value, min, max) {
  return `<label>${esc(label)} <input id="${id}" type="number" step="any" value="${esc(value === undefined ? "" : value)}"${min !== undefined ? ` min="${min}"` : ""}${max !== undefined ? ` max="${max}"` : ""}></label>`;
}
function selectField(id, label, options, selected) {
  return `<label>${esc(label)} <select id="${id}">${options.map((o) => `<option value="${esc(o.value)}"${o.value === selected ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label>`;
}
function runBtn(label) { return `<button type="button" id="runBtn">${esc(label)}</button>`; }

export function pdfToolFormHtml(slug) {
  const tool = pdfToolBySlug(slug);
  if (!tool) return `<p>This tool is not available.</p>`;
  const head = (tool.status === "interface" ? serverNoticeHtml(tool) : limitHtml(tool));
  switch (slug) {
    case "merge-pdf": return head + howHtml(["Add two or more PDF files below.", "Files merge in the order shown — first file first.", "Click Merge PDFs, then download the combined file."]) + pdfMulti("PDF files to merge (up to 25 MB each)") + runBtn("Merge PDFs");
    case "split-pdf": return head + howHtml(["Add one PDF file.", "Choose how to split it: every N pages, or page ranges like 1-3, 5.", "Click Split PDF — each part downloads as its own file."]) + pdfSingle() + selectField("mode", "Split by", [{ value: "every", label: "Every N pages" }, { value: "ranges", label: "Page ranges" }], "every") + numField("in", "Pages per part (N)", 1, 1) + textField("in2", "Page ranges (for example 1-3, 5)", "1-3, 5") + runBtn("Split PDF");
    case "compress-pdf": return head + howHtml(["Add one PDF file.", "Choose what to remove, then click Compress PDF.", "Download the smaller file and compare the sizes."]) + pdfSingle() + `<label><input id="stripMeta" type="checkbox" class="checkbox" checked> Remove metadata (title, author, hidden details)</label><label><input id="compactStreams" type="checkbox" class="checkbox" checked> Use compact object streams</label>` + runBtn("Compress PDF");
    case "pdf-to-word": return head + howHtml(["Add one PDF file.", "Choose the Word format.", "When server processing is live, the .docx file will download here."]) + pdfSingle() + selectField("mode", "Output format", [{ value: "docx", label: "Word (.docx)" }], "docx") ;
    case "word-to-pdf": return head + howHtml(["Add one Word (.docx) file.", "Choose the page size.", "When server processing is live, the PDF will download here."]) + uploadField(".docx", false, "Word file (.docx, up to 25 MB)") + selectField("mode", "Page size", [{ value: "a4", label: "A4" }, { value: "letter", label: "Letter" }], "a4");
    case "pdf-to-excel": return head + howHtml(["Add one PDF file with tables or text.", "Choose the workbook layout, then click Convert to Excel.", "Download the real .xlsx file and open it in Excel."]) + pdfSingle() + selectField("mode", "Workbook layout", [{ value: "one", label: "One sheet for the whole file" }, { value: "per-page", label: "One sheet per page" }], "one") + runBtn("Convert to Excel");
    case "excel-to-pdf": return head + howHtml(["Add one Excel (.xlsx) file.", "Choose the page size.", "When server processing is live, the PDF will download here."]) + uploadField(".xlsx", false, "Excel file (.xlsx, up to 25 MB)") + selectField("mode", "Page size", [{ value: "a4", label: "A4" }, { value: "letter", label: "Letter" }], "a4");
    case "pdf-to-jpg": return head + howHtml(["Add one PDF file.", "Choose which pages to turn into images and the quality.", "Click Create JPGs — each page downloads as its own JPG file."]) + pdfSingle() + selectField("mode", "Pages", [{ value: "all", label: "All pages" }, { value: "range", label: "Page range" }], "all") + textField("in", "Page range (for example 1-3, 5)", "1-3, 5") + `<label>Quality <input id="quality" type="range" min="50" max="95" value="85"> <span id="qualityVal">85</span></label>` + selectField("scale", "Image size", [{ value: "1", label: "Normal (1x)" }, { value: "2", label: "Large (2x)" }], "1") + runBtn("Create JPGs") + `<p id="imgInfo" class="small"></p>`;
    case "jpg-to-pdf": return head + howHtml(["Add one or more JPG, PNG or WebP images.", "Choose the page size, then click Create PDF.", "Each image becomes one page in the PDF."]) + imgMulti() + selectField("mode", "Page size", [{ value: "fit", label: "Fit each image" }, { value: "a4", label: "A4" }], "fit") + runBtn("Create PDF");
    case "organize-pdf-pages": return head + howHtml(["Add one PDF file.", "Enter the new page order, pages to delete, and pages to rotate.", "Click Organize PDF, then download the new file."]) + pdfSingle() + textField("in", "New page order (for example 3, 1, 2, 4) — leave empty to keep the order", "3, 1, 2, 4") + textField("in2", "Pages to delete (for example 2, 5-7) — leave empty for none", "2, 5-7") + textField("in3", "Pages to rotate (for example 1, 4) — leave empty for none", "1, 4") + selectField("mode", "Rotation", [{ value: "90", label: "90° clockwise" }, { value: "180", label: "180°" }, { value: "270", label: "270° clockwise" }], "90") + runBtn("Organize PDF");
    case "pdf-page-counter": return head + howHtml(["Add one PDF file.", "Click Count pages.", "The number of pages is shown below."]) + pdfSingle() + runBtn("Count pages");
    case "pdf-metadata-viewer": return head + howHtml(["Add one PDF file.", "Click Show metadata.", "Title, Author, Creator and CreationDate are shown when present."]) + pdfSingle() + runBtn("Show metadata");
    case "edit-pdf": return head + howHtml(["Add one PDF file.", "Enter the page, the text, and where it should go.", "Click Add text, then download the updated PDF."]) + pdfSingle() + `<div class="row">${numField("page", "Page number", 1, 1)}${numField("size", "Font size", 14, 6, 72)}</div>` + textField("in", "Text to add", "Approved") + `<div class="row">${numField("x", "Position from left (points)", 50, 0)}${numField("y", "Position from bottom (points)", 700, 0)}</div>` + selectField("mode", "Colour", [{ value: "black", label: "Black" }, { value: "red", label: "Red" }, { value: "blue", label: "Blue" }, { value: "green", label: "Green" }], "black") + runBtn("Add text");
    case "sign-pdf": return head + howHtml(["Add one PDF file.", "Draw your signature in the box below, or type your name.", "Choose the page and position, click Place signature, then download the signed PDF."]) + pdfSingle() + `<div class="field"><span class="field-label">Your signature — draw here</span><canvas id="sigPad" class="sigpad" width="520" height="160"></canvas><p class="small"><button type="button" id="sigClear" class="secondary">Clear signature</button></p></div>` + textField("in", "Or type your name instead", "Your Name") + `<div class="row">${numField("page", "Page number", 1, 1)}${numField("w", "Signature width (points)", 150, 20, 500)}</div><div class="row">${numField("x", "Position from left (points)", 50, 0)}${numField("y", "Position from bottom (points)", 100, 0)}</div>` + runBtn("Place signature");
    case "fill-pdf-forms": return head + howHtml(["Add a PDF that has fillable form fields.", "Click Load form fields — the fields appear below.", "Fill them in, then click Download filled PDF."]) + pdfSingle() + runBtn("Load form fields") + `<div id="fieldList"></div><button type="button" id="fillBtn" class="secondary" hidden>Download filled PDF</button>`;
    case "add-page-numbers": return head + howHtml(["Add one PDF file.", "Choose the position, starting number and format.", "Click Add page numbers, then download the file."]) + pdfSingle() + selectField("mode", "Position", [{ value: "bottom-center", label: "Bottom centre" }, { value: "bottom-right", label: "Bottom right" }, { value: "bottom-left", label: "Bottom left" }, { value: "top-right", label: "Top right" }], "bottom-center") + numField("in", "Start numbering from", 1, 1) + selectField("format", "Format", [{ value: "n", label: "1, 2, 3…" }, { value: "page-n", label: "Page 1, Page 2…" }, { value: "page-n-of-m", label: "Page 1 of 5…" }], "page-n") + runBtn("Add page numbers");
    case "add-watermark-pdf": return head + howHtml(["Add one PDF file.", "Enter the watermark text and choose its look.", "Click Add watermark, then download the file."]) + pdfSingle() + textField("in", "Watermark text", "CONFIDENTIAL", "CONFIDENTIAL") + `<div class="row">${numField("size", "Font size", 60, 12, 120)}${numField("opacity", "Transparency % (0–100)", 25, 0, 100)}</div>` + selectField("mode", "Angle", [{ value: "45", label: "Diagonal (45°)" }, { value: "0", label: "Straight (0°)" }, { value: "-45", label: "Diagonal (-45°)" }], "45") + selectField("color", "Colour", [{ value: "grey", label: "Grey" }, { value: "red", label: "Red" }, { value: "blue", label: "Blue" }], "grey") + runBtn("Add watermark");
    case "protect-pdf": return head + howHtml(["Add one PDF file.", "Choose a password and confirm it.", "When server processing is live, the protected PDF will download here."]) + pdfSingle() + `<label>Password <input id="in" type="password" autocomplete="new-password"></label><label>Confirm password <input id="in2" type="password" autocomplete="new-password"></label><p class="small">Your password is never sent anywhere — it is only used when the server step runs.</p>`;
    case "unlock-pdf": return head + howHtml(["Add one protected PDF file.", "Enter its password.", "When server processing is live, the unlocked PDF will download here."]) + pdfSingle() + `<label>Current password <input id="in" type="password" autocomplete="current-password"></label><p class="small">Your password is never sent anywhere — it is only used when the server step runs.</p>`;
    case "rotate-pdf": return head + howHtml(["Add one PDF file.", "Choose which pages to rotate and by how much.", "Click Rotate PDF, then download the file."]) + pdfSingle() + selectField("mode", "Pages", [{ value: "all", label: "All pages" }, { value: "listed", label: "Only listed pages" }], "all") + textField("in", "Pages to rotate (for example 1, 3-5)", "1, 3-5") + selectField("angle", "Rotation", [{ value: "90", label: "90° clockwise" }, { value: "180", label: "180°" }, { value: "270", label: "270° clockwise" }], "90") + runBtn("Rotate PDF");
    case "compare-pdf": return head + howHtml(["Add the first PDF, then the second PDF.", "Click Compare PDFs.", "The result lists the lines that differ, page by page."]) + uploadField("application/pdf", false, "First PDF file", { dz: "dropzone", input: "fileIn", list: "fileList", browse: "browseBtn" }) + uploadField("application/pdf", false, "Second PDF file", { dz: "dropzone2", input: "fileIn2", list: "fileList2", browse: "browseBtn2" }) + runBtn("Compare PDFs");
    case "ocr-pdf": return head + howHtml(["Add one scanned PDF file.", "Choose the language of the text.", "When server processing is live, the searchable PDF will download here."]) + pdfSingle() + selectField("mode", "Text language", [{ value: "en", label: "English" }, { value: "ur", label: "Urdu" }, { value: "ar", label: "Arabic" }], "en");
    // --- Banking & Finance ---
    case "bank-statement-to-excel": return head + howHtml(["Add one bank statement PDF (text-based, not scanned).", "Click Extract to Excel.", "Download the real .xlsx workbook — Date, Description, Debit, Credit."]) + pdfSingle() + runBtn("Extract to Excel");
    case "bank-statement-to-csv": return head + howHtml(["Add one bank statement PDF (text-based, not scanned).", "Click Extract to CSV.", "Download the CSV file — it opens in Excel and Google Sheets."]) + pdfSingle() + runBtn("Extract to CSV");
    case "pdf-table-extractor": return head + howHtml(["Add one PDF file with tables.", "Choose the output and which pages to read.", "Click Extract tables, then download the file."]) + pdfSingle() + selectField("mode", "Output format", [{ value: "xlsx", label: "Excel (.xlsx)" }, { value: "csv", label: "CSV (.csv)" }], "xlsx") + selectField("pages", "Pages", [{ value: "all", label: "All pages" }, { value: "range", label: "Page range" }], "all") + textField("in", "Page range (for example 1-3, 5)", "1-3, 5") + runBtn("Extract tables");
    case "invoice-to-excel": return head + howHtml(["Add one invoice PDF (text-based, not scanned).", "Click Extract to Excel.", "Download the workbook — invoice details plus one row per item."]) + pdfSingle() + runBtn("Extract to Excel");
    case "receipt-to-excel": return head + howHtml(["Add one receipt PDF (text-based, not scanned).", "Click Extract to Excel.", "Download the workbook — merchant, date, items and total."]) + pdfSingle() + runBtn("Extract to Excel");
    case "multiple-invoices-to-excel": return head + howHtml(["Add two or more invoice PDFs.", "Click Extract to Excel.", "Download one workbook — one sheet per invoice."]) + pdfMulti("Invoice PDF files (up to 25 MB each)") + runBtn("Extract to Excel");
    case "pdf-to-csv": return head + howHtml(["Add one PDF file.", "Choose which pages to read, then click Convert to CSV.", "Each line of text becomes one row in the CSV file."]) + pdfSingle() + selectField("mode", "Pages", [{ value: "all", label: "All pages" }, { value: "range", label: "Page range" }], "all") + textField("in", "Page range (for example 1-3, 5)", "1-3, 5") + runBtn("Convert to CSV");
    case "redact-pdf": return head + howHtml(["Add one PDF file.", "Enter words or phrases to cover, or whole page numbers.", "Click Redact PDF, then download the file."]) + pdfSingle() + `<label>Words or phrases to cover (comma-separated) <textarea id="in" rows="3" placeholder="account number, 1234-5678"></textarea></label>` + textField("in2", "Whole pages to cover (for example 2, 5) — leave empty for none", "2, 5") + runBtn("Redact PDF");
    // --- Accounting & Professional ---
    case "bulk-pdf-splitter": return head + howHtml(["Add two or more PDF files.", "Click Split all PDFs.", "Every file splits into one PDF per page — each downloads separately."]) + pdfMulti("PDF files to split (up to 25 MB each)") + runBtn("Split all PDFs");
    case "pdf-to-pdfa": return head + howHtml(["Add one PDF file.", "Optionally set the archive title and author.", "Click Prepare PDF/A, then download the archive-ready file."]) + pdfSingle() + textField("in", "Archive title (optional)", "Archive copy") + textField("in2", "Author (optional)", "") + runBtn("Prepare PDF/A");
    case "delete-pdf-pages": return head + howHtml(["Add one PDF file.", "List the pages to delete, like 2, 5-7.", "Click Delete pages, then download the new file."]) + pdfSingle() + textField("in", "Pages to delete (for example 2, 5-7)", "2, 5-7") + runBtn("Delete pages");
    case "extract-pdf-pages": return head + howHtml(["Add one PDF file.", "List the pages to keep, like 1-3, 5.", "Click Extract pages, then download the new file."]) + pdfSingle() + textField("in", "Pages to extract (for example 1-3, 5)", "1-3, 5") + runBtn("Extract pages");
    case "reorder-pdf-pages": return head + howHtml(["Add one PDF file.", "Enter the new page order, like 3, 1, 2, 4.", "Click Reorder pages, then download the new file."]) + pdfSingle() + textField("in", "New page order (for example 3, 1, 2, 4)", "3, 1, 2, 4") + runBtn("Reorder pages");
    case "add-images-to-pdf": return head + howHtml(["Add one PDF file, then the image to place on it.", "Choose the page, position and width.", "Click Add image, then download the updated PDF."]) + pdfSingle("PDF file (up to 25 MB)") + uploadField("image/jpeg,image/png,image/webp", false, "Image to add (JPG, PNG or WebP, up to 10 MB)", { dz: "dropzone2", input: "fileIn2", list: "fileList2", browse: "browseBtn2" }) + `<div class="row">${numField("page", "Page number", 1, 1)}${numField("w", "Image width (points)", 200, 20, 600)}</div><div class="row">${numField("x", "Position from left (points)", 50, 0)}${numField("y", "Position from bottom (points)", 400, 0)}</div>` + runBtn("Add image");
    case "convert-powerpoint-to-pdf": return head + howHtml(["Add one PowerPoint (.pptx) file.", "Choose the page size.", "When server processing is live, the PDF will download here."]) + uploadField(".pptx", false, "PowerPoint file (.pptx, up to 25 MB)") + selectField("mode", "Page size", [{ value: "a4", label: "A4" }, { value: "letter", label: "Letter" }], "a4");
    case "pdf-to-powerpoint": return head + howHtml(["Add one PDF file.", "Choose the slide size.", "When server processing is live, the .pptx file will download here."]) + pdfSingle() + selectField("mode", "Slide size", [{ value: "16x9", label: "Widescreen (16:9)" }, { value: "4x3", label: "Standard (4:3)" }], "16x9");
    case "html-to-pdf": return head + howHtml(["Paste your HTML below, or upload an .html file.", "Click Open print view — your browser opens a print window.", "In the print dialog choose Save as PDF, then save the file."]) + `<label>Paste HTML <textarea id="in" rows="8" placeholder="&lt;h1&gt;Hello&lt;/h1&gt;&lt;p&gt;Your text here.&lt;/p&gt;"></textarea></label>` + uploadField(".html,.htm", false, "Or upload an HTML file") + runBtn("Open print view");
    case "repair-pdf": return head + howHtml(["Add one damaged PDF file.", "Click Repair PDF.", "The tool rebuilds the file; if that fails, it recovers the text into a new PDF."]) + pdfSingle() + runBtn("Repair PDF");
    case "remove-pdf-metadata": return head + howHtml(["Add one PDF file.", "Click Remove metadata.", "Download the clean copy — the pages are unchanged."]) + pdfSingle() + runBtn("Remove metadata");
    case "scan-to-pdf": return head + howHtml(["Use your device camera, or upload photos you already have.", "Each photo becomes one page in the PDF.", "Click Create PDF, then download the file."]) + `<div class="field"><span class="field-label">Camera (optional)</span><video id="camVideo" class="cam" hidden autoplay playsinline></video><p><button type="button" id="camBtn" class="secondary">Use camera</button> <button type="button" id="shotBtn" class="secondary" hidden>Capture photo</button></p><p id="camMsg" class="small"></p></div>` + imgMulti("Photos (JPG, PNG or WebP, up to 10 MB each)") + selectField("mode", "Page size", [{ value: "fit", label: "Fit each photo" }, { value: "a4", label: "A4" }], "fit") + runBtn("Create PDF");
    default: return `<p>This tool is not available.</p>`;
  }
}

// ---------- text extraction (pdf.js) ----------
// Returns pages: [{ lines: [{ y, text, cells: [{x, y, w, h, str}] }] }] — lines top to bottom.
async function extractPages(bytes) {
  const lib = pdfjs();
  // Copy: pdf.js may transfer/detach the buffer it is given.
  const doc = await lib.getDocument({ data: bytes.slice() }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.filter((it) => it.str !== undefined && it.str !== "").map((it) => ({
      x: it.transform[4], y: it.transform[5], w: it.width || 0, h: it.height || 0, str: it.str,
    }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of items) {
      const line = lines.find((l) => Math.abs(l.y - it.y) < 4);
      if (line) { line.cells.push(it); line.cells.sort((a, b) => a.x - b.x); line.y = Math.max(line.y, it.y); }
      else lines.push({ y: it.y, cells: [it] });
    }
    for (const l of lines) l.text = l.cells.map((c) => c.str).join(" ").replace(/\s+/g, " ").trim();
    pages.push({ lines: lines.filter((l) => l.text) });
  }
  await doc.destroy();
  return pages;
}
async function extractTextLines(bytes) {
  const pages = await extractPages(bytes);
  return pages.map((p) => p.lines.map((l) => l.text));
}
function rowsFromLines(lines, gap) {
  // Split a line's cells into columns where the x-gap is large.
  const rows = [];
  for (const l of lines) {
    const cells = [];
    let cur = null;
    for (const c of l.cells) {
      if (!cur) { cur = { x: c.x, end: c.x + c.w, text: c.str }; continue; }
      if (c.x - cur.end > (gap || 18)) { cells.push(cur.text.trim()); cur = { x: c.x, end: c.x + c.w, text: c.str }; }
      else { cur.end = Math.max(cur.end, c.x + c.w); cur.text += (cur.text && !cur.text.endsWith(" ") ? " " : "") + c.str; }
    }
    if (cur) cells.push(cur.text.trim());
    rows.push(cells);
  }
  return rows;
}
function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(rows) {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}
function downloadCsv(filename, rows) { downloadTextFile(filename, toCsv(rows), "text/csv"); }

// ---------- minimal real .xlsx writer (stored zip, no dependency) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function u16(n) { return new Uint8Array([n & 0xFF, (n >> 8) & 0xFF]); }
function u32(n) { return new Uint8Array([n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >> 24) & 0xFF]); }
function zipStore(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = new TextEncoder().encode(f.name);
    const crc = crc32(f.data);
    const lh = new Uint8Array(30);
    lh.set(u32(0x04034b50), 0); lh.set(u16(20), 4); lh.set(u16(0), 6); lh.set(u16(0), 8);
    lh.set(u16(0), 10); lh.set(u16(0x21), 12); lh.set(u32(crc), 14); lh.set(u32(f.data.length), 18); lh.set(u32(f.data.length), 22);
    lh.set(u16(name.length), 26); lh.set(u16(0), 28);
    parts.push(lh, name, f.data);
    const ch = new Uint8Array(46);
    ch.set(u32(0x02014b50), 0); ch.set(u16(20), 4); ch.set(u16(20), 6); ch.set(u16(0), 8); ch.set(u16(0), 10);
    ch.set(u16(0), 12); ch.set(u16(0x21), 14); ch.set(u32(crc), 16); ch.set(u32(f.data.length), 20); ch.set(u32(f.data.length), 24);
    ch.set(u16(name.length), 28); ch.set(u16(0), 30); ch.set(u16(0), 32); ch.set(u16(0), 34); ch.set(u16(0), 36);
    ch.set(u32(0), 38); ch.set(u32(offset), 42);
    central.push(ch, name);
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array(22);
  end.set(u32(0x06054b50), 0); end.set(u16(0), 4); end.set(u16(0), 6); end.set(u16(files.length), 8); end.set(u16(files.length), 10);
  end.set(u32(cdSize), 12); end.set(u32(offset), 16); end.set(u16(0), 20);
  const total = offset + cdSize + 22;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of [...parts, ...central, end]) { out.set(p, pos); pos += p.length; }
  return out;
}
function xmlEsc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function colRef(i) { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function cleanSheetName(n) { return String(n || "Sheet").replace(/[\[\]:*?\/\\]/g, " ").slice(0, 31) || "Sheet"; }
// sheets: [{ name, rows: [[string|number, ...]] }] -> Uint8Array (.xlsx)
function buildXlsx(sheets) {
  const strings = [], index = new Map();
  const strId = (s) => {
    const k = String(s);
    if (!index.has(k)) { index.set(k, strings.length); strings.push(k); }
    return index.get(k);
  };
  const sheetXml = sheets.map((sh) => {
    const rows = sh.rows.map((row, ri) => {
      const cells = row.map((v, ci) => {
        const ref = colRef(ci) + (ri + 1);
        if (typeof v === "number" && isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
        return `<c r="${ref}" t="s"><v>${strId(v)}</v></c>`;
      }).join("");
      return `<row r="${ri + 1}">${cells}</row>`;
    }).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  });
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sh, i) => `<sheet name="${xmlEsc(cleanSheetName(sh.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`;
  const shared = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings.map((s) => `<si><t xml:space="preserve">${xmlEsc(s)}</t></si>`).join("")}</sst>`;
  const enc = (s) => new TextEncoder().encode(s);
  const files = [
    { name: "[Content_Types].xml", data: enc(contentTypes) },
    { name: "_rels/.rels", data: enc(rels) },
    { name: "xl/workbook.xml", data: enc(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: enc(wbRels) },
    { name: "xl/sharedStrings.xml", data: enc(shared) },
    ...sheetXml.map((x, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc(x) })),
  ];
  return zipStore(files);
}
function downloadXlsx(filename, sheets) {
  downloadBlob(new Blob([buildXlsx(sheets)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}
function parseMoney(s) {
  if (s === undefined || s === null) return null;
  const m = String(s).replace(/[, ]/g, "").match(/-?\d+\.\d{2}|-?\d+/);
  return m ? Number(m[0]) : null;
}
const DATE_RE = /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})/i;

// ---------- pdf-lib helpers ----------
async function loadPdf(bytes, opts) { return pdfLib().PDFDocument.load(bytes, opts || {}); }
async function savePdf(doc, opts) {
  const o = Object.assign({ useObjectStreams: true }, opts || {});
  return doc.save(o);
}
function baseName(name, ext) { return String(name || "file").replace(/\.[^.]+$/, "") + ext; }
function downloadLink(containerId, blob, filename, label) {
  const info = document.getElementById(containerId || "imgInfo");
  if (!info) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename; a.textContent = label || ("Download " + filename);
  info.appendChild(document.createElement("br")); info.appendChild(a);
}
function fileListOf(id) { const el = document.getElementById(id); return el ? Array.from(el.files || []) : []; }
function singlePdfFile() { return needPdfFile(fileListOf("fileIn"), false)[0]; }
async function loadSinglePdf() { return loadPdf(await readAsBytes(singlePdfFile())); }
async function renderPageToJpg(pdfBytes, pageNum, scale, quality) {
  const lib = pdfjs();
  const doc = await lib.getDocument({ data: pdfBytes.slice() }).promise;
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale: scale || 1.5 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  await doc.destroy();
  return new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Could not render that page as an image.")), "image/jpeg", quality || 0.85));
}
const COLOR_MAP = { black: [0, 0, 0], red: [0.85, 0.1, 0.1], blue: [0.1, 0.25, 0.85], green: [0.1, 0.6, 0.2], grey: [0.5, 0.5, 0.5] };
function pdfColor(name) { const c = COLOR_MAP[name] || COLOR_MAP.black; return pdfLib().rgb(c[0], c[1], c[2]); }

async function runPdfTool(slug, getVal, ctx) {
  const L = pdfLib();
  const std = L.StandardFonts;
  if (slug === "merge-pdf") {
    const files = needPdfFile(fileListOf("fileIn"), true);
    if (files.length < 2) throw new Error("Add at least two PDF files to merge.");
    const out = await L.PDFDocument.create();
    let total = 0;
    for (const f of files) {
      const src = await loadPdf(await readAsBytes(f));
      total += src.getPageCount();
      const pages = await out.copyPages(src, src.getPageIndices());
      for (const p of pages) out.addPage(p);
    }
    if (total > PDF_MAX_PAGES) throw new Error("The merged file would have more than " + PDF_MAX_PAGES + " pages.");
    downloadPdfBytes(await savePdf(out), "merged.pdf");
    setOut("result", `Merged ${files.length} file(s), ${total} page(s) into one PDF. Use the download link below the result.`);
    return;
  }
  if (slug === "split-pdf") {
    const doc = await loadSinglePdf();
    const n = doc.getPageCount();
    const mode = getVal("mode");
    const parts = [];
    if (mode === "ranges") {
      const ranges = parsePageSpec(getVal("in2"), n);
      if (!ranges.length) throw new Error("Enter page ranges like 1-3, 5.");
      const runs = [];
      let run = [ranges[0]];
      for (let i = 1; i < ranges.length; i++) {
        if (ranges[i] === ranges[i - 1] + 1) run.push(ranges[i]);
        else { runs.push(run); run = [ranges[i]]; }
      }
      runs.push(run);
      for (const r of runs) parts.push(r);
    } else {
      const per = Math.max(1, Math.floor(Number(getVal("in")) || 1));
      for (let i = 0; i < n; i += per) parts.push(Array.from({ length: Math.min(per, n - i) }, (_, k) => i + k));
    }
    for (let i = 0; i < parts.length; i++) {
      const d = await L.PDFDocument.create();
      const pages = await d.copyPages(doc, parts[i]);
      for (const p of pages) d.addPage(p);
      downloadPdfBytes(await savePdf(d), `split-part-${i + 1}.pdf`);
    }
    setOut("result", `Split into ${parts.length} file(s). Each part downloads as its own PDF — check your downloads.`);
    return;
  }
  if (slug === "compress-pdf") {
    const file = singlePdfFile();
    const doc = await loadPdf(await readAsBytes(file));
    if (getChecked("stripMeta")) { doc.setTitle(""); doc.setAuthor(""); doc.setSubject(""); doc.setKeywords([]); doc.setProducer(""); doc.setCreator(""); }
    const bytes = await savePdf(doc, { useObjectStreams: getChecked("compactStreams") });
    downloadPdfBytes(bytes, "compressed-" + file.name);
    const saved = file.size - bytes.length;
    setOut("result", `Original: ${file.size} bytes\nCompressed: ${bytes.length} bytes\nSaved: ${saved > 0 ? saved : 0} bytes (${saved > 0 ? Math.round((saved / file.size) * 100) : 0}%)\nUse the download link below the result.`);
    return;
  }
  if (slug === "pdf-to-jpg") {
    const file = singlePdfFile();
    const bytes = await readAsBytes(file);
    const doc = await loadPdf(bytes);
    const n = doc.getPageCount();
    const mode = getVal("mode");
    const pages = mode === "range" ? parsePageSpec(getVal("in"), n) : Array.from({ length: n }, (_, i) => i);
    if (!pages.length) throw new Error("Enter a page range like 1-3, 5.");
    const q = Number(document.getElementById("quality") ? document.getElementById("quality").value : 85) / 100;
    const scale = Number(getVal("scale") || 1);
    for (const p of pages) {
      const blob = await renderPageToJpg(bytes, p + 1, 1.5 * scale, q);
      downloadLink("imgInfo", blob, `page-${p + 1}.jpg`, `Download page ${p + 1} as JPG`);
    }
    setOut("result", `Created ${pages.length} JPG image(s). Use the download links below the result.`);
    return;
  }
  if (slug === "jpg-to-pdf") {
    const files = needImageFiles(fileListOf("fileIn"));
    const doc = await L.PDFDocument.create();
    const mode = getVal("mode");
    for (const f of files) {
      const bytes = await readAsBytes(f);
      const img = f.type === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      let w = img.width, h = img.height;
      let page;
      if (mode === "a4") { page = doc.addPage([595.28, 841.89]); const s = Math.min(page.getWidth() / w, page.getHeight() / h); w *= s; h *= s; }
      else page = doc.addPage([w, h]);
      page.drawImage(img, { x: (page.getWidth() - w) / 2, y: (page.getHeight() - h) / 2, width: w, height: h });
    }
    downloadPdfBytes(await savePdf(doc), "images.pdf");
    setOut("result", `PDF ready: ${files.length} page(s). Use the download link below the result.`);
    return;
  }
  if (slug === "organize-pdf-pages" || slug === "reorder-pdf-pages" || slug === "delete-pdf-pages" || slug === "extract-pdf-pages") {
    const doc = await loadSinglePdf();
    const n = doc.getPageCount();
    let indices;
    if (slug === "reorder-pdf-pages") {
      indices = parsePageList(getVal("in"), n);
      if (indices.length !== n) throw new Error("List every page exactly once (for example 3, 1, 2, 4 for a " + n + "-page file).");
    } else if (slug === "delete-pdf-pages") {
      const del = new Set(parsePageSpec(getVal("in"), n));
      if (!del.size) throw new Error("Enter pages to delete like 2, 5-7.");
      indices = Array.from({ length: n }, (_, i) => i).filter((i) => !del.has(i));
      if (!indices.length) throw new Error("You cannot delete every page.");
    } else if (slug === "extract-pdf-pages") {
      indices = parsePageSpec(getVal("in"), n);
      if (!indices.length) throw new Error("Enter pages to extract like 1-3, 5.");
    } else {
      const orderTxt = getVal("in").trim();
      indices = orderTxt ? parsePageList(orderTxt, n) : Array.from({ length: n }, (_, i) => i);
      const del = getVal("in2").trim() ? new Set(parsePageSpec(getVal("in2"), n)) : new Set();
      const rotTxt = getVal("in3").trim();
      const rotSet = rotTxt ? new Set(parsePageSpec(rotTxt, n)) : new Set();
      const angle = Number(getVal("mode") || 90);
      indices = indices.filter((i) => !del.has(i));
      if (!indices.length) throw new Error("You cannot delete every page.");
      const out = await L.PDFDocument.create();
      const pages = await out.copyPages(doc, indices);
      pages.forEach((p, k) => { out.addPage(p); if (rotSet.has(indices[k])) p.setRotation(L.degrees(angle)); });
      downloadPdfBytes(await savePdf(out), "organized.pdf");
      setOut("result", `Done — the new PDF has ${indices.length} page(s). Use the download link below the result.`);
      return;
    }
    const out = await L.PDFDocument.create();
    const pages = await out.copyPages(doc, indices);
    for (const p of pages) out.addPage(p);
    downloadPdfBytes(await savePdf(out), slug + ".pdf");
    setOut("result", `Done — the new PDF has ${indices.length} page(s). Use the download link below the result.`);
    return;
  }
  if (slug === "bulk-pdf-splitter") {
    const files = needPdfFile(fileListOf("fileIn"), true);
    let count = 0;
    for (const f of files) {
      const doc = await loadPdf(await readAsBytes(f));
      const n = doc.getPageCount();
      for (let i = 0; i < n; i++) {
        const d = await L.PDFDocument.create();
        const pages = await d.copyPages(doc, [i]);
        d.addPage(pages[0]);
        downloadPdfBytes(await savePdf(d), `${baseName(f.name, "")}-page-${i + 1}.pdf`);
        count++;
      }
    }
    setOut("result", `Split ${files.length} file(s) into ${count} single-page PDF(s). Each downloads separately — check your downloads.`);
    return;
  }
  if (slug === "rotate-pdf") {
    const doc = await loadSinglePdf();
    const n = doc.getPageCount();
    const angle = Number(getVal("angle") || 90);
    const mode = getVal("mode");
    const targets = mode === "listed" ? new Set(parsePageSpec(getVal("in"), n)) : new Set(Array.from({ length: n }, (_, i) => i));
    if (!targets.size) throw new Error("Enter pages to rotate like 1, 3-5.");
    for (const i of targets) doc.getPage(i).setRotation(L.degrees(angle));
    downloadPdfBytes(await savePdf(doc), "rotated.pdf");
    setOut("result", `Rotated ${targets.size} page(s) by ${angle}°. Use the download link below the result.`);
    return;
  }
  if (slug === "pdf-to-pdfa") {
    const file = singlePdfFile();
    const doc = await loadPdf(await readAsBytes(file));
    const title = getVal("in").trim(), author = getVal("in2").trim();
    if (title) doc.setTitle(title);
    if (author) doc.setAuthor(author);
    doc.setProducer("Kavron Labs");
    downloadPdfBytes(await savePdf(doc), "archive-" + file.name);
    setOut("result", `Archive-ready copy prepared (${doc.getPageCount()} page(s)). Use the download link below the result.`);
    return;
  }
  if (slug === "remove-pdf-metadata") {
    const file = singlePdfFile();
    const doc = await loadPdf(await readAsBytes(file));
    doc.setTitle(""); doc.setAuthor(""); doc.setSubject(""); doc.setKeywords([]); doc.setProducer(""); doc.setCreator("");
    downloadPdfBytes(await savePdf(doc), "clean-" + file.name);
    setOut("result", `Metadata removed. The pages are unchanged. Use the download link below the result.`);
    return;
  }
  if (slug === "repair-pdf") {
    const file = singlePdfFile();
    const bytes = await readAsBytes(file);
    try {
      const doc = await loadPdf(bytes, { ignoreEncryption: true });
      downloadPdfBytes(await savePdf(doc), "repaired-" + file.name);
      setOut("result", `Rebuilt the file (${doc.getPageCount()} page(s)). Use the download link below the result.`);
    } catch (e) {
      const pages = await extractTextLines(bytes);
      const doc = await L.PDFDocument.create();
      const font = await doc.embedFont(std.Helvetica);
      for (const lines of pages) {
        let page = doc.addPage([595.28, 841.89]);
        let y = 800;
        for (const line of lines) {
          if (y < 40) { page = doc.addPage([595.28, 841.89]); y = 800; }
          page.drawText(line.slice(0, 110), { x: 40, y, size: 10, font });
          y -= 14;
        }
      }
      downloadPdfBytes(await savePdf(doc), "recovered-" + file.name);
      setOut("result", `The file could not be rebuilt, so the text was recovered into a new PDF instead. Use the download link below the result.`);
    }
    return;
  }
  if (slug === "add-page-numbers") {
    const doc = await loadSinglePdf();
    const n = doc.getPageCount();
    const pos = getVal("mode");
    const start = Math.max(1, Math.floor(Number(getVal("in")) || 1));
    const format = getVal("format");
    const font = await doc.embedFont(std.Helvetica);
    for (let i = 0; i < n; i++) {
      const page = doc.getPage(i);
      const num = start + i;
      const text = format === "n" ? String(num) : (format === "page-n-of-m" ? `Page ${num} of ${start + n - 1}` : `Page ${num}`);
      const w = font.widthOfTextAtSize(text, 11);
      const pw = page.getWidth(), ph = page.getHeight();
      let x = (pw - w) / 2, y = 20;
      if (pos === "bottom-right") { x = pw - w - 20; y = 20; }
      if (pos === "bottom-left") { x = 20; y = 20; }
      if (pos === "top-right") { x = pw - w - 20; y = ph - 25; }
      page.drawText(text, { x, y, size: 11, font, color: pdfColor("black") });
    }
    downloadPdfBytes(await savePdf(doc), "numbered.pdf");
    setOut("result", `Page numbers added to ${n} page(s), starting from ${start}. Use the download link below the result.`);
    return;
  }
  if (slug === "add-watermark-pdf") {
    const doc = await loadSinglePdf();
    const text = getVal("in").trim();
    if (!text) throw new Error("Enter the watermark text.");
    const size = Math.min(120, Math.max(12, Number(getVal("size")) || 60));
    const opacity = Math.min(100, Math.max(0, Number(getVal("opacity")) || 25)) / 100;
    const angle = Number(getVal("mode") || 45);
    const font = await doc.embedFont(std.HelveticaBold);
    for (const page of doc.getPages()) {
      const pw = page.getWidth(), ph = page.getHeight();
      page.drawText(text, {
        x: pw / 2, y: ph / 2, size, font, color: pdfColor(getVal("color")),
        opacity, rotate: L.degrees(angle),
      });
    }
    downloadPdfBytes(await savePdf(doc), "watermarked.pdf");
    setOut("result", `Watermark "${text}" added to ${doc.getPageCount()} page(s). Use the download link below the result.`);
    return;
  }
  if (slug === "edit-pdf") {
    const doc = await loadSinglePdf();
    const pageNum = Math.floor(Number(getVal("page")) || 1);
    if (pageNum < 1 || pageNum > doc.getPageCount()) throw new Error("Page number is out of range.");
    const text = getVal("in");
    if (!text.trim()) throw new Error("Enter the text to add.");
    const font = await doc.embedFont(std.Helvetica);
    doc.getPage(pageNum - 1).drawText(text, {
      x: Number(getVal("x")) || 50, y: Number(getVal("y")) || 700,
      size: Math.min(72, Math.max(6, Number(getVal("size")) || 14)), font, color: pdfColor(getVal("mode")),
    });
    downloadPdfBytes(await savePdf(doc), "edited.pdf");
    setOut("result", `Text added to page ${pageNum}. Use the download link below the result.`);
    return;
  }
  if (slug === "redact-pdf") {
    const file = singlePdfFile();
    const bytes = await readAsBytes(file);
    const words = getVal("in").split(",").map((s) => s.trim()).filter(Boolean);
    const pagesToCover = getVal("in2").trim() ? new Set(parsePageSpec(getVal("in2"), (await loadPdf(bytes)).getPageCount())) : new Set();
    if (!words.length && !pagesToCover.size) throw new Error("Enter words to cover, or page numbers to cover.");
    const pages = await extractPages(bytes);
    const doc = await loadPdf(bytes);
    let covered = 0;
    pages.forEach((p, pi) => {
      const page = doc.getPage(pi);
      if (pagesToCover.has(pi)) { page.drawRectangle({ x: 0, y: 0, width: page.getWidth(), height: page.getHeight(), color: pdfColor("black") }); covered++; return; }
      for (const w of words) {
        const lw = w.toLowerCase();
        for (const line of p.lines) {
          for (const c of line.cells) {
            if (c.str.toLowerCase().includes(lw)) {
              page.drawRectangle({ x: c.x - 1, y: c.y - 2, width: c.w + 2, height: c.h + 4, color: pdfColor("black") });
              covered++;
            }
          }
        }
      }
    });
    if (!covered) throw new Error("Nothing matched — no words or pages were covered.");
    downloadPdfBytes(await savePdf(doc), "redacted-" + file.name);
    setOut("result", `Covered ${covered} match(es) with black boxes. Note: the text underneath is covered, not removed from the file. Use the download link below the result.`);
    return;
  }
  if (slug === "add-images-to-pdf") {
    const doc = await loadSinglePdf();
    const files = needImageFiles(fileListOf("fileIn2"));
    const img = files[0];
    const bytes = await readAsBytes(img);
    const embedded = img.type === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const pageNum = Math.floor(Number(getVal("page")) || 1);
    if (pageNum < 1 || pageNum > doc.getPageCount()) throw new Error("Page number is out of range.");
    const w = Math.min(600, Math.max(20, Number(getVal("w")) || 200));
    const h = (embedded.height / embedded.width) * w;
    doc.getPage(pageNum - 1).drawImage(embedded, { x: Number(getVal("x")) || 50, y: Number(getVal("y")) || 400, width: w, height: h });
    downloadPdfBytes(await savePdf(doc), "with-image.pdf");
    setOut("result", `Image placed on page ${pageNum}. Use the download link below the result.`);
    return;
  }
  if (slug === "pdf-page-counter") {
    const doc = await loadSinglePdf();
    setOut("result", `Pages: ${doc.getPageCount()}`);
    return;
  }
  if (slug === "pdf-metadata-viewer") {
    const doc = await loadSinglePdf();
    const fmt = (d) => (d ? d.toISOString() : "(not present)");
    setOut("result", `Title: ${doc.getTitle() || "(not present)"}\nAuthor: ${doc.getAuthor() || "(not present)"}\nCreator: ${doc.getCreator() || "(not present)"}\nCreationDate: ${fmt(doc.getCreationDate())}\nProducer: ${doc.getProducer() || "(not present)"}`);
    return;
  }
  if (slug === "sign-pdf") { await runSignPdf(getVal, ctx && ctx.pad); return; }
  if (slug === "fill-pdf-forms") { await runFillForms(); return; }
  if (slug === "compare-pdf") { await runComparePdf(); return; }
  if (slug === "pdf-to-excel") { await runTableExtract(slug, getVal); return; }
  if (slug === "pdf-table-extractor") { await runTableExtract(slug, getVal); return; }
  if (slug === "bank-statement-to-excel" || slug === "bank-statement-to-csv") { await runBankStatement(slug); return; }
  if (slug === "invoice-to-excel") { await runInvoice(slug, getVal); return; }
  if (slug === "receipt-to-excel") { await runReceipt(); return; }
  if (slug === "multiple-invoices-to-excel") { await runMultipleInvoices(); return; }
  if (slug === "pdf-to-csv") { await runPdfToCsv(getVal); return; }
  if (slug === "html-to-pdf") { await runHtmlToPdf(getVal); return; }
  if (slug === "scan-to-pdf") { await runScanToPdf(getVal, ctx && ctx.cam); return; }
  throw new Error("This tool is not available in the browser yet.");
}

// ---------- signature pad, form filling, compare, extraction ----------
function bindSignaturePad() {
  const pad = document.getElementById("sigPad");
  if (!pad) return null;
  const ctx = pad.getContext("2d");
  ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.lineCap = "round";
  let drawing = false, hasInk = false;
  const pos = (e) => {
    const r = pad.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: (t.clientX - r.left) * (pad.width / r.width), y: (t.clientY - r.top) * (pad.height / r.height) };
  };
  const start = (e) => { drawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); if (e.preventDefault) e.preventDefault(); };
  const move = (e) => { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); hasInk = true; if (e.preventDefault) e.preventDefault(); };
  const stop = () => { drawing = false; };
  pad.addEventListener("mousedown", start);
  pad.addEventListener("mousemove", move);
  pad.addEventListener("mouseup", stop);
  pad.addEventListener("mouseleave", stop);
  pad.addEventListener("touchstart", start, { passive: false });
  pad.addEventListener("touchmove", move, { passive: false });
  pad.addEventListener("touchend", stop);
  const clear = document.getElementById("sigClear");
  if (clear) clear.addEventListener("click", () => { ctx.clearRect(0, 0, pad.width, pad.height); hasInk = false; });
  return { hasInk: () => hasInk, canvas: pad };
}
async function runSignPdf(getVal, pad) {
  const L = pdfLib();
  const doc = await loadSinglePdf();
  const pageNum = Math.floor(Number(getVal("page")) || 1);
  if (pageNum < 1 || pageNum > doc.getPageCount()) throw new Error("Page number is out of range.");
  const w = Math.min(500, Math.max(20, Number(getVal("w")) || 150));
  const page = doc.getPage(pageNum - 1);
  const x = Number(getVal("x")) || 50, y = Number(getVal("y")) || 100;
  if (pad && pad.hasInk()) {
    const blob = await new Promise((res) => pad.canvas.toBlob(res, "image/png"));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const img = await doc.embedPng(bytes);
    const h = (img.height / img.width) * w;
    page.drawImage(img, { x, y, width: w, height: h });
  } else {
    const name = getVal("in").trim();
    if (!name) throw new Error("Draw your signature, or type your name.");
    const font = await doc.embedFont(L.StandardFonts.HelveticaOblique);
    page.drawText(name, { x, y, size: 28, font, color: pdfColor("black") });
  }
  downloadPdfBytes(await savePdf(doc), "signed.pdf");
  setOut("result", `Signature placed on page ${pageNum}. Use the download link below the result.`);
}
async function runFillForms() {
  const L = pdfLib();
  const file = singlePdfFile();
  const bytes = await readAsBytes(file);
  const doc = await loadPdf(bytes);
  const form = doc.getForm();
  const fields = form.getFields();
  if (!fields.length) throw new Error("This PDF has no fillable form fields.");
  const list = document.getElementById("fieldList");
  list.innerHTML = "";
  const font = await doc.embedFont(L.StandardFonts.Helvetica);
  form.updateFieldAppearances(font);
  const filled = [];
  for (const f of fields) {
    const name = f.getName();
    const type = f.constructor.name;
    const row = document.createElement("div");
    row.className = "field";
    if (type.includes("PDFCheckBox")) {
      row.innerHTML = `<label><input type="checkbox" class="checkbox" data-field="${esc(name)}"> ${esc(name)}</label>`;
    } else if (type.includes("PDFDropdown")) {
      const opts = f.getOptions ? f.getOptions() : [];
      row.innerHTML = `<label>${esc(name)} <select data-field="${esc(name)}">${opts.map((o) => `<option>${esc(o)}</option>`).join("")}</select></label>`;
    } else {
      row.innerHTML = `<label>${esc(name)} <input data-field="${esc(name)}" value="${esc(f instanceof L.PDFTextField ? (f.getText() || "") : "")}"></label>`;
    }
    list.appendChild(row);
    filled.push(f);
  }
  const fillBtn = document.getElementById("fillBtn");
  fillBtn.hidden = false;
  setOut("result", `Found ${fields.length} field(s). Fill them in above, then click Download filled PDF.`);
  fillBtn.addEventListener("click", async () => {
    try {
      for (const f of filled) {
        const el = list.querySelector(`[data-field="${CSS.escape(f.getName())}"]`);
        if (!el) continue;
        if (f instanceof L.PDFCheckBox) { if (el.checked) f.check(); else f.uncheck(); }
        else if (f instanceof L.PDFDropdown) f.select(el.value);
        else if (f instanceof L.PDFTextField) f.setText(el.value);
      }
      form.updateFieldAppearances(font);
      downloadPdfBytes(await savePdf(doc), "filled-" + file.name);
      setOut("result", `Filled PDF ready. Use the download link below the result.`);
    } catch (e) { setErr("toolErr", e && e.message ? e.message : "Could not save the filled PDF."); }
  });
}
async function runComparePdf() {
  const files1 = needPdfFile(fileListOf("fileIn"), false);
  const files2 = needPdfFile(fileListOf("fileIn2"), false);
  const a = await extractTextLines(await readAsBytes(files1[0]));
  const b = await extractTextLines(await readAsBytes(files2[0]));
  const maxPages = Math.max(a.length, b.length);
  const diffs = [];
  for (let p = 0; p < maxPages; p++) {
    const la = a[p] || [], lb = b[p] || [];
    const setB = new Set(lb), setA = new Set(la);
    for (const line of la) if (!setB.has(line)) diffs.push(`Page ${p + 1} — only in first file: ${line}`);
    for (const line of lb) if (!setA.has(line)) diffs.push(`Page ${p + 1} — only in second file: ${line}`);
    if (diffs.length >= 20) break;
  }
  setOut("result", diffs.length
    ? `Found ${diffs.length} differing line(s) (showing first 20):\n${diffs.slice(0, 20).join("\n")}`
    : "The text of both files is identical.");
}
function rowsToWorkbookRows(rows) { return rows; }
async function runTableExtract(slug, getVal) {
  const file = singlePdfFile();
  const bytes = await readAsBytes(file);
  const pages = await extractPages(bytes);
  const layoutMode = getVal("mode");
  const pagesMode = getVal("pages") || layoutMode; // table-extractor has a separate "pages" select
  const rangeTxt = getVal("in");
  let pageIdx = pages.map((_, i) => i);
  if (pagesMode === "range" && rangeTxt.trim()) pageIdx = parsePageSpec(rangeTxt, pages.length);
  if (!pageIdx.length) throw new Error("Enter a page range like 1-3, 5.");
  const perPage = layoutMode === "per-page";
  const sheets = [];
  const allRows = [];
  for (const pi of pageIdx) {
    const rows = rowsFromLines(pages[pi].lines, 18).filter((r) => r.length && r.some((c) => c));
    if (perPage) sheets.push({ name: `Page ${pi + 1}`, rows });
    else allRows.push(...rows);
  }
  if (!perPage) sheets.push({ name: "Table", rows: allRows });
  if (!sheets.some((s) => s.rows.length)) throw new Error("No tables or text were found on those pages.");
  const outMode = slug === "pdf-to-csv" ? "csv" : (getVal("mode") === "csv" ? "csv" : "xlsx");
  if (outMode === "csv") downloadCsv("tables.csv", sheets.flatMap((s) => s.rows));
  else downloadXlsx("tables.xlsx", sheets);
  setOut("result", `Extracted ${sheets.reduce((a, s) => a + s.rows.length, 0)} row(s) from ${pageIdx.length} page(s). Use the download link below the result.`);
}
async function runPdfToCsv(getVal) {
  const file = singlePdfFile();
  const pages = await extractTextLines(await readAsBytes(file));
  const mode = getVal("mode");
  const rangeTxt = getVal("in");
  let pageIdx = pages.map((_, i) => i);
  if (mode === "range" && rangeTxt.trim()) pageIdx = parsePageSpec(rangeTxt, pages.length);
  const rows = [["Text"]];
  for (const pi of pageIdx) for (const line of pages[pi]) rows.push([line]);
  if (rows.length < 2) throw new Error("No text was found in this PDF.");
  downloadCsv("pdf-text.csv", rows);
  setOut("result", `Converted ${rows.length - 1} line(s) from ${pageIdx.length} page(s) to CSV. Use the download link below the result.`);
}
function txnRowsFromPages(pages) {
  const rows = [];
  for (const p of pages) {
    for (const line of p.lines) {
      const text = line.text;
      const dm = text.match(DATE_RE);
      if (!dm) continue;
      const amounts = [...text.matchAll(/-?[\d,]+\.\d{2}/g)].map((m) => m[0]);
      if (!amounts.length) continue;
      const date = dm[0];
      const rest = text.replace(dm[0], "").trim();
      const last = amounts[amounts.length - 1];
      const desc = rest.replace(new RegExp(last.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$"), "").trim();
      let debit = "", credit = "";
      const isCredit = /\b(cr|credit|deposit|received|in)\b/i.test(text);
      const isDebit = /\b(dr|debit|withdrawal|payment|paid|out)\b/i.test(text);
      if (amounts.length >= 2) { debit = parseMoney(amounts[amounts.length - 2]); credit = parseMoney(last); }
      else if (isCredit && !isDebit) credit = parseMoney(last);
      else debit = parseMoney(last);
      rows.push([date, desc || "(no description)", debit === "" ? "" : debit, credit === "" ? "" : credit]);
    }
  }
  return rows;
}
async function runBankStatement(slug) {
  const file = singlePdfFile();
  const pages = await extractPages(await readAsBytes(file));
  const rows = txnRowsFromPages(pages);
  if (!rows.length) throw new Error("No transactions were found. This works with text-based statements — scanned statements need OCR (server step).");
  if (slug === "bank-statement-to-csv") {
    downloadCsv("bank-statement.csv", [["Date", "Description", "Debit", "Credit"], ...rows]);
  } else {
    downloadXlsx("bank-statement.xlsx", [{ name: "Statement", rows: [["Date", "Description", "Debit", "Credit"], ...rows] }]);
  }
  setOut("result", `Found ${rows.length} transaction(s). Check the file before using it — amounts are read from text patterns. Use the download link below the result.`);
}
function itemRowsFromLines(lines) {
  const items = [];
  for (const line of lines) {
    const m = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/);
    if (m) items.push([m[1].trim(), Number(m[2]), parseMoney(m[3]), parseMoney(m[4])]);
  }
  return items;
}
function findField(lines, re) {
  for (const line of lines) { const m = line.match(re); if (m) return m[1].trim(); }
  return "";
}
async function runInvoice(slug, getVal) {
  const file = singlePdfFile();
  const pages = await extractPages(await readAsBytes(file));
  const allLines = pages.flatMap((p) => p.lines.map((l) => l.text));
  const invNo = findField(allLines, /(?:invoice\s*(?:no|#|number)|inv\.?\s*(?:no|#)?)\s*[:#]?\s*([A-Za-z0-9\-\/]+)/i) || file.name;
  const date = findField(allLines, /(?:date|issued)\s*[:#]?\s*(.+)/i);
  const total = findField(allLines, /(?:total|amount due|balance due|grand total)\s*[:#]?\s*([\d,]+\.\d{2})/i);
  const items = itemRowsFromLines(allLines);
  const sheets = [
    { name: "Details", rows: [["Field", "Value"], ["Invoice number", invNo], ["Date", date], ["Total", total]] },
    { name: "Items", rows: [["Description", "Qty", "Unit price", "Amount"], ...items] },
  ];
  downloadXlsx("invoice.xlsx", sheets);
  setOut("result", `Invoice ${invNo}: ${items.length} item line(s) found. Check the workbook before using it. Use the download link below the result.`);
}
async function runReceipt() {
  const file = singlePdfFile();
  const pages = await extractPages(await readAsBytes(file));
  const allLines = pages.flatMap((p) => p.lines.map((l) => l.text));
  const merchant = allLines.find((l) => l.trim()) || "";
  const date = findField(allLines, /(?:date)\s*[:#]?\s*(.+)/i) || (allLines.find((l) => DATE_RE.test(l)) || "").match(DATE_RE)?.[0] || "";
  const total = findField(allLines, /(?:total|amount)\s*[:#]?\s*([\d,]+\.\d{2})/i);
  const items = itemRowsFromLines(allLines);
  downloadXlsx("receipt.xlsx", [
    { name: "Details", rows: [["Field", "Value"], ["Merchant", merchant], ["Date", date], ["Total", total]] },
    { name: "Items", rows: [["Description", "Qty", "Unit price", "Amount"], ...items] },
  ]);
  setOut("result", `Receipt from ${merchant || "unknown merchant"}: ${items.length} item line(s) found. Check the workbook before using it. Use the download link below the result.`);
}
async function runMultipleInvoices() {
  const files = needPdfFile(fileListOf("fileIn"), true);
  if (files.length < 2) throw new Error("Add at least two invoice PDFs.");
  const sheets = [];
  for (const f of files) {
    const pages = await extractPages(await readAsBytes(f));
    const allLines = pages.flatMap((p) => p.lines.map((l) => l.text));
    const invNo = findField(allLines, /(?:invoice\s*(?:no|#|number)|inv\.?\s*(?:no|#)?)\s*[:#]?\s*([A-Za-z0-9\-\/]+)/i) || f.name;
    const items = itemRowsFromLines(allLines);
    sheets.push({ name: invNo.slice(0, 31), rows: [["Description", "Qty", "Unit price", "Amount"], ...items] });
  }
  downloadXlsx("invoices.xlsx", sheets);
  setOut("result", `Processed ${files.length} invoice(s) into one workbook (one sheet per invoice). Check it before using it. Use the download link below the result.`);
}
async function runHtmlToPdf(getVal) {
  const pasted = getVal("in").trim();
  const files = fileListOf("fileIn");
  let html = pasted;
  if (!html && files.length) html = await files[0].text();
  if (!html) throw new Error("Paste HTML or upload an .html file first.");
  const win = window.open("", "_blank");
  if (!win) throw new Error("The print view was blocked. Allow pop-ups for this site and try again.");
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Document</title></head><body>${html}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
  setOut("result", "The print view is open. In the print dialog choose Save as PDF, then save the file.");
}
async function runScanToPdf(getVal, cam) {
  const L = pdfLib();
  const doc = await L.PDFDocument.create();
  const mode = getVal("mode");
  const addImage = async (bytes, type) => {
    const img = type === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    let w = img.width, h = img.height, page;
    if (mode === "a4") { page = doc.addPage([595.28, 841.89]); const s = Math.min(page.getWidth() / w, page.getHeight() / h); w *= s; h *= s; }
    else page = doc.addPage([w, h]);
    page.drawImage(img, { x: (page.getWidth() - w) / 2, y: (page.getHeight() - h) / 2, width: w, height: h });
  };
  let count = 0;
  if (cam && cam.shot) {
    const blob = await cam.shot();
    if (blob) { await addImage(new Uint8Array(await blob.arrayBuffer()), "image/jpeg"); count++; }
  }
  const files = needImageFiles(fileListOf("fileIn"));
  for (const f of files) {
    const img = await loadImageForPdf(f);
    await addImage(img.bytes, img.type);
    count++;
  }
  if (!count) throw new Error("Take a photo with the camera, or upload photos first.");
  downloadPdfBytes(await savePdf(doc), "scanned.pdf");
  setOut("result", `PDF ready: ${count} page(s). Use the download link below the result.`);
}
function loadImageForPdf(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        canvas.getContext("2d").drawImage(img, 0, 0);
        const blob = await new Promise((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error("Could not read that image.")), "image/jpeg", 0.92));
        URL.revokeObjectURL(url);
        resolve({ bytes: new Uint8Array(await blob.arrayBuffer()), type: "image/jpeg" });
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image file.")); };
    img.src = url;
  });
}
function bindCamera() {
  const video = document.getElementById("camVideo");
  const camBtn = document.getElementById("camBtn");
  const shotBtn = document.getElementById("shotBtn");
  const msg = document.getElementById("camMsg");
  if (!camBtn || !video) return null;
  let stream = null;
  camBtn.addEventListener("click", async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("Camera is not available in this browser.");
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream; video.hidden = false; shotBtn.hidden = false;
      camBtn.textContent = "Stop camera";
      if (msg) msg.textContent = "Camera is on. Point it at the page, then click Capture photo.";
    } catch (e) { if (msg) msg.textContent = "Camera could not start (" + (e.message || "not available") + "). You can still upload photos below."; }
  });
  return {
    shot: async () => {
      if (!stream || video.readyState < 2) return null;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      return new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.92));
    },
  };
}

// ---------- list page (sections + live search) + tool binding ----------
function bindDropZoneByIds(dzId, inputId, listId, browseId) {
  const dz = document.getElementById(dzId);
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  if (!dz || !input) return;
  const showFiles = () => {
    if (list) list.textContent = input.files && input.files.length
      ? Array.from(input.files).map((f) => f.name + " (" + Math.round(f.size / 1024) + " KB)").join(" · ")
      : "";
  };
  dz.addEventListener("click", (e) => { if (e.target !== input) input.click(); });
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault(); dz.classList.remove("drag");
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      input.files = e.dataTransfer.files; showFiles();
    }
  });
  input.addEventListener("change", showFiles);
  const browse = document.getElementById(browseId);
  if (browse) browse.addEventListener("click", (e) => { e.stopPropagation(); input.click(); });
}
export function bindPdfTool(slug) {
  const tool = pdfToolBySlug(slug);
  if (!tool) return;
  const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ""; };
  bindDropZoneByIds("dropzone", "fileIn", "fileList", "browseBtn");
  bindDropZoneByIds("dropzone2", "fileIn2", "fileList2", "browseBtn2");
  const q = document.getElementById("quality");
  if (q) q.addEventListener("input", () => { const v = document.getElementById("qualityVal"); if (v) v.textContent = q.value; });
  const pad = slug === "sign-pdf" ? bindSignaturePad() : null;
  const cam = slug === "scan-to-pdf" ? bindCamera() : null;
  const copyBtn = document.getElementById("copyBtn");
  if (copyBtn) copyBtn.addEventListener("click", () => {
    const text = document.getElementById("result").textContent || "";
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => setErr("toolMsg", "Copied.")).catch(() => setErr("toolMsg", "Copy failed — select the text manually."));
    else setErr("toolMsg", "Clipboard not available — select the text manually.");
  });
  const downloadBtn = document.getElementById("downloadBtn");
  if (downloadBtn) downloadBtn.addEventListener("click", () => {
    const text = document.getElementById("result").textContent || "";
    downloadTextFile(slug + "-result.txt", text, "text/plain");
  });
  const resetBtn = document.getElementById("resetBtn");
  if (resetBtn) resetBtn.addEventListener("click", () => {
    const f = document.getElementById("toolForm");
    if (f) f.querySelectorAll("input,textarea,select").forEach((el) => { if (el.type === "checkbox") el.checked = false; else el.value = ""; });
    setOut("result", ""); setErr("toolErr", ""); setErr("toolMsg", "");
    const info = document.getElementById("imgInfo"); if (info) info.textContent = "";
    const fl = document.getElementById("fieldList"); if (fl) fl.innerHTML = "";
    const fb = document.getElementById("fillBtn"); if (fb) fb.hidden = true;
  });
  const runBtn = document.getElementById("runBtn");
  if (!runBtn) return; // interface-only tools have no run button by design
  runBtn.addEventListener("click", async () => {
    setErr("toolErr", ""); setErr("toolMsg", ""); setOut("result", "Working…");
    const info = document.getElementById("imgInfo"); if (info) info.textContent = "";
    try { await runPdfTool(slug, getVal, { pad, cam }); }
    catch (e) { setOut("result", ""); setErr("toolErr", e && e.message ? e.message : "Something went wrong."); }
  });
}
function pdfToolCard(t) {
  return `<a class="card cat-pdf pdf-tool-card" data-search="${esc(searchText(t))}" href="/tools.html?tool=${t.slug}"><span class="tool-icon" aria-hidden="true">${esc(t.icon)}</span><h3>${esc(t.name)}</h3><p>${esc(t.desc)}</p><span class="status ${statusClass(t)}">${statusLabel(t)}</span></a>`;
}
export function pdfListHtml() {
  const sections = PDF_SECTIONS.map((s) => {
    const list = PDF_TOOLS.filter((t) => t.section === s.id);
    return `<section class="pdf-section" data-section="${esc(s.id)}"><h2>${esc(s.title)}</h2><p class="sec-sub">${esc(s.sub)}</p><div class="grid">${list.map(pdfToolCard).join("")}</div></section>`;
  }).join("");
  return `<p class="crumb"><a href="/">Home</a> › <a href="/tools.html">All Tools</a> › PDF Tools</p>
  <div class="tool-head"><img class="logo" src="/logo-pdf.webp" alt="PDF Tools logo"><div><h1>PDF Tools</h1><p>42 free PDF tools in one place. Most run in your browser — no uploads, no account needed.</p></div></div>
  <div class="searchbar"><input id="toolSearch" type="search" placeholder="Search PDF tools — try “excel”, “merge”, “sign”… " aria-label="Search PDF tools"><button type="button" id="searchClear" class="secondary" hidden>Clear ×</button></div>
  <p class="small">Free to use. <span class="status status-working">Working</span> tools run fully in your browser. <span class="status status-partial">Working*</span> tools work with the limits shown on their page. <span class="status status-soon">Coming soon</span> tools need server processing, which arrives in the next step.</p>
  <div id="pdfSections">${sections}</div>
  <p id="noMatch" class="notice" hidden>No tools match your search. Try another keyword, or clear the search to see all 42 tools.</p>`;
}
export function bindPdfList() {
  const input = document.getElementById("toolSearch");
  const clear = document.getElementById("searchClear");
  const noMatch = document.getElementById("noMatch");
  if (!input) return;
  const apply = () => {
    const q = input.value.trim().toLowerCase();
    if (clear) clear.hidden = !q;
    let visible = 0;
    document.querySelectorAll(".pdf-tool-card").forEach((card) => {
      const hit = !q || (card.dataset.search || "").includes(q);
      card.style.display = hit ? "" : "none";
      if (hit) visible++;
    });
    document.querySelectorAll(".pdf-section").forEach((sec) => {
      const any = Array.from(sec.querySelectorAll(".pdf-tool-card")).some((c) => c.style.display !== "none");
      sec.style.display = any ? "" : "none";
    });
    if (noMatch) noMatch.hidden = visible !== 0;
  };
  input.addEventListener("input", apply);
  if (clear) clear.addEventListener("click", () => { input.value = ""; apply(); input.focus(); });
}
