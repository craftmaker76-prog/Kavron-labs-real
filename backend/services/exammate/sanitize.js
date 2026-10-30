// AI output sanitization. AI text is untrusted input.
// Before it is rendered as HTML, strip scripts, event handlers,
// javascript: links, iframes and style tags. Only safe formatting stays.
const sanitizeHtml = require('sanitize-html');
function sanitizeAiOutput(html) {
  if (typeof html !== 'string') return '';
  return sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'b', 'strong', 'i', 'em', 'ul', 'ol', 'li', 'h2', 'h3', 'code', 'pre'],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  });
}
// Convert plain AI text to safe HTML: escape first, then line breaks.
function aiTextToSafeHtml(text) {
  const escaped = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return sanitizeAiOutput('<p>' + escaped.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') + '</p>');
}
module.exports = { sanitizeAiOutput, aiTextToSafeHtml };
