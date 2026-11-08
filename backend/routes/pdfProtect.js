// Hissa 3 PDF tools: Protect PDF with Password + Unlock PDF.
// Pure-JS encryption via @cantoo/pdf-lib (MIT fork of pdf-lib — upstream
// pdf-lib cannot encrypt). No native binary, no LibreOffice.
// Patterns copied from routes/ai.js: requireAuth + csrfProtect +
// dbRateLimit, DB-counted per-user daily quota (Vercel-safe, not memory).
//
// SECURITY (read before changing anything here):
// - Files are processed fully IN MEMORY (multer memoryStorage). Nothing
//   is ever written to disk or stored in the database.
// - The password arrives over HTTPS in the multipart body, is used once
//   for this one file, and is then discarded. It is NEVER logged, NEVER
//   stored, and NEVER appears in any error message or log line.
// - Responses are the processed PDF bytes only. No file content is
//   logged. File names are sanitised before use in headers.
const express = require('express');
const multer = require('multer');
const { PDFDocument } = require('@cantoo/pdf-lib');
const router = express.Router();
const config = require('../config/env');
const { getClient } = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const { csrfProtect } = require('../middleware/csrf');
const { dbRateLimit } = require('../middleware/rateLimit');
const { cleanText } = require('../validators');
const { ensurePdfProtectSchema } = require('../db/pdfProtectSchema');

const PDF_TOOLS = ['protect-pdf', 'unlock-pdf'];
// Server backstop. Vercel's function request limit is ~4.5 MB, so the
// page enforces a 4 MB client-side limit with a clear message; 5 MB here
// is only a safety net for requests that reach us another way.
const PDF_MAX_BYTES = 5 * 1024 * 1024;
const PASSWORD_MAX = 128;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PDF_MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname || '');
    cb(ok ? null : new Error('ONLY_PDF'), ok);
  },
});

function runUpload(req, res) {
  return new Promise((resolve, reject) => {
    upload.single('file')(req, res, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function multerErrorMessage(err) {
  if (!err) return null;
  if (err.code === 'LIMIT_FILE_SIZE') return 'The PDF must be under 5 MB.';
  if (err.code === 'LIMIT_UNEXPECTED_FILE') return 'Please upload one PDF file.';
  if (err.message === 'ONLY_PDF') return 'Only PDF files are accepted.';
  return 'Could not read the uploaded file. Please try again.';
}

function isPdfBuffer(buf) {
  return buf && buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-';
}

function safeFileName(name, fallback) {
  const base = String(name || '').split(/[\\/]/).pop().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  const clean = base && base !== '.' && base !== '..' ? base.slice(0, 100) : fallback;
  return clean.endsWith('.pdf') ? clean : clean + '.pdf';
}

// Per-user daily usage, counted in the DB (Vercel-safe, not memory).
// Only successful operations are inserted, so the quota counts finished
// files, never failed attempts.
async function dailyUsage(userId) {
  const c = getClient();
  const today = new Date().toISOString().slice(0, 10);
  const r = await c.execute({ sql: "SELECT COUNT(*) AS n FROM pdf_tool_usage WHERE user_id = ? AND substr(created_at,1,10) = ?", args: [userId, today] });
  return Number(r.rows[0].n);
}

function sendPdf(res, bytes, filename, remaining, limit) {
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'attachment; filename="' + filename.replace(/"/g, '') + '"',
    'Content-Length': String(bytes.length),
    'X-Pdf-Remaining': String(remaining),
    'X-Pdf-Limit': String(limit),
  });
  res.send(Buffer.from(bytes));
}

const pdfRateLimit = dbRateLimit({ limit: 30, windowMinutes: 60, keyFn: (req) => 'pdf:' + req.user.userId });

// Shared validation for both endpoints. Returns { file, password } or
// sends the 400 response itself and returns null.
async function validateUpload(req, res) {
  try {
    await runUpload(req, res);
  } catch (e) {
    res.status(400).json({ error: multerErrorMessage(e) });
    return null;
  }
  const file = req.file;
  if (!file || !file.buffer || !file.buffer.length) {
    res.status(400).json({ error: 'Please choose a PDF file first.' });
    return null;
  }
  if (!isPdfBuffer(file.buffer)) {
    res.status(400).json({ error: 'Only PDF files are accepted.' });
    return null;
  }
  const password = cleanText(req.body && req.body.password);
  if (!password || password.length > PASSWORD_MAX) {
    res.status(400).json({ error: `Password must be 1 to ${PASSWORD_MAX} characters.` });
    return null;
  }
  return { file, password };
}

async function checkQuota(req, res) {
  const limit = config.pdfDailyCap;
  const used = await dailyUsage(req.user.userId);
  if (used >= limit) {
    res.status(429).json({ error: `You have used all ${limit} free PDF protections for today. Please try again tomorrow.`, remaining: 0, limit });
    return null;
  }
  return { limit, used };
}

async function recordUsage(userId, tool) {
  await getClient().execute({ sql: 'INSERT INTO pdf_tool_usage (user_id, tool) VALUES (?,?)', args: [userId, tool] });
}

// Metadata helpers: Info-dict reads can be missing or oddly shaped
// (getKeywords returns a string in this fork); never let a metadata
// read fail the unlock itself.
function metaText(fn) {
  try { const v = fn(); return typeof v === 'string' && v ? v : ''; } catch (e) { return ''; }
}
function metaList(fn) {
  try {
    const v = fn();
    if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x);
    if (typeof v === 'string' && v) return v.split(/\s+/).filter(Boolean);
    return [];
  } catch (e) { return []; }
}
// POST /api/pdf/protect — lock a PDF with a password.
// Body (multipart): file + password + confirmPassword.
router.post('/protect', requireAuth, csrfProtect, pdfRateLimit, async (req, res, next) => {
  try {
    await ensurePdfProtectSchema();
    const checked = await validateUpload(req, res);
    if (!checked) return;
    const { file, password } = checked;
    const confirm = cleanText(req.body && req.body.confirmPassword);
    if (password !== confirm) {
      return res.status(400).json({ error: 'The two passwords do not match.' });
    }
    const quota = await checkQuota(req, res);
    if (!quota) return;
    let doc;
    try {
      doc = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
    } catch (e) {
      return res.status(400).json({ error: 'This file could not be read as a PDF. It may be damaged.' });
    }
    if (doc.isEncrypted) {
      return res.status(400).json({ error: 'This PDF is already protected.' });
    }
    doc.encrypt({ userPassword: password, ownerPassword: password });
    const out = Buffer.from(await doc.save());
    await recordUsage(req.user.userId, 'protect-pdf');
    const usedNow = await dailyUsage(req.user.userId);
    sendPdf(res, out, 'protected-' + safeFileName(file.originalname, 'file.pdf'), Math.max(0, quota.limit - usedNow), quota.limit);
  } catch (e) { next(e); }
});

// POST /api/pdf/unlock — remove the password from a PDF you own.
// Body (multipart): file + password.
router.post('/unlock', requireAuth, csrfProtect, pdfRateLimit, async (req, res, next) => {
  try {
    await ensurePdfProtectSchema();
    const checked = await validateUpload(req, res);
    if (!checked) return;
    const { file, password } = checked;
    const quota = await checkQuota(req, res);
    if (!quota) return;
    let probe;
    try {
      probe = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
    } catch (e) {
      return res.status(400).json({ error: 'This file could not be read as a PDF. It may be damaged.' });
    }
    if (!probe.isEncrypted) {
      return res.status(400).json({ error: 'This PDF is not protected.' });
    }
    let src;
    try {
      src = await PDFDocument.load(file.buffer, { password });
    } catch (e) {
      return res.status(400).json({ error: 'The password is incorrect, or the file could not be opened.' });
    }
    // A clean unlock: copy the pages into a FRESH document. Saving the
    // loaded document directly keeps a stale /Encrypt entry in the
    // trailer (verified 2026-11-08: a fresh load then still reports
    // isEncrypted=true and refuses to open without a password), so the
    // file would still look protected to strict readers. A fresh
    // document has no Encrypt entry at all. Page content is identical;
    // document metadata (title/author/subject/keywords) is copied when
    // present. Annotations, form fields and outlines are not carried
    // over — the tool promises the pages, not the extras.
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const pg of pages) out.addPage(pg);
    const title = metaText(() => src.getTitle());
    const author = metaText(() => src.getAuthor());
    const subject = metaText(() => src.getSubject());
    const keywords = metaList(() => src.getKeywords());
    if (title) out.setTitle(title);
    if (author) out.setAuthor(author);
    if (subject) out.setSubject(subject);
    if (keywords.length) out.setKeywords(keywords);
    const bytes = Buffer.from(await out.save());
    await recordUsage(req.user.userId, 'unlock-pdf');
    const usedNow = await dailyUsage(req.user.userId);
    sendPdf(res, bytes, 'unlocked-' + safeFileName(file.originalname, 'file.pdf'), Math.max(0, quota.limit - usedNow), quota.limit);
  } catch (e) { next(e); }
});

// GET /api/pdf/usage — today's quota for this user.
router.get('/usage', requireAuth, async (req, res, next) => {
  try {
    await ensurePdfProtectSchema();
    const limit = config.pdfDailyCap;
    const used = await dailyUsage(req.user.userId);
    res.json({ used, remaining: Math.max(0, limit - used), limit });
  } catch (e) { next(e); }
});

module.exports = router;
