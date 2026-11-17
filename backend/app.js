// PORTABLE Express app. This file has NO Vercel code and NO listen().
// - Vercel: api/index.js imports this app and exports it as a serverless function.
// - VPS / Docker: server.js imports this app and calls app.listen().
// That separation is what makes migration possible without rewriting the app.
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const config = require('./config/env');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
// Security headers, including CSP. Helmet sets HSTS, X-Content-Type-Options,
// X-Frame-Options, Referrer-Policy and more.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));
// CORS: strictly only allowed origins from env. No wildcard, no reflection.
app.use(cors({ origin: (origin, cb) => {
  if (!origin) return cb(null, true); // same-origin / curl / health checks
  if (config.allowedOrigins.includes(origin)) return cb(null, true);
  return cb(new Error('Origin not allowed by CORS'));
}, credentials: true }));
app.use(cookieParser());
// Request size limits: global small limit, so a huge body cannot crash the server.
// ExamMate accepts an optional base64 image (up to 2 MB decoded, ~2.7 MB as
// base64), so its router is mounted here with its own 3 MB JSON parser,
// BEFORE the global parser. body-parser skips a body it already parsed
// (req._body), so the global 100kb parser leaves exammate bodies alone
// while every other route keeps the 100kb limit. 3 MB stays under Vercel's
// ~4.5 MB function request cap; the route still enforces its own 2 MB
// decoded-image cap. Do NOT re-mount /api/exammate below.
app.use('/api/exammate', express.json({ limit: '3mb' }), require('./routes/exammate'));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use('/', require('./routes/health'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/pdf', require('./routes/pdfProtect'));
app.use('/api/admin', require('./routes/admin'));
// Public frontend (static) — no admin link in the public site.
app.use(express.static(path.join(__dirname, '..', 'frontend', 'public')));
app.use(notFound);
app.use(errorHandler);
module.exports = app;
