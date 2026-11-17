// ExamMate tool page. External file (CSP: scripts only from 'self').
// Chat-style: every question and answer stays visible below, newest last.
// Step-by-step gate (user requirement 2026-11-03): Country -> Province/State
// -> Class -> Board -> Subject, in order. The question area stays LOCKED
// (disabled) until all five steps are complete.
const $ = id => document.getElementById(id);
function currentProvince(){
  return $('country').value === 'Pakistan' ? $('provinceSelect').value : $('provinceText').value.trim();
}
function toggleProvince(){
  const pak = $('country').value === 'Pakistan';
  $('provinceSelect').hidden = !pak;
  $('provinceText').hidden = pak;
}
// Board field is added here (not in exammate.html) so the page markup file
// needs no change: the input is created with DOM calls only (CSP-safe, no
// innerHTML) and placed right after the Class field, before Subject.
(function addBoardField(){
  const classInput = $('className');
  const classLabel = classInput && classInput.closest ? classInput.closest('label') : null;
  const boardLabel = document.createElement('label');
  boardLabel.textContent = 'Board ';
  const boardInput = document.createElement('input');
  boardInput.id = 'board';
  boardInput.placeholder = 'e.g. BISE Lahore';
  boardLabel.appendChild(boardInput);
  if(classLabel && classLabel.after) classLabel.after(boardLabel);
  else if(classLabel && classLabel.parentNode) classLabel.parentNode.insertBefore(boardLabel, classLabel.nextSibling || null);
})();
// Per-step messages (professional English, exact texts — the backend returns
// these same strings). The status line always shows the FIRST missing step.
const STEP_MSGS = {
  country: 'Please select your Country first.',
  province: 'Please select your Province/State.',
  className: 'Please select your Class.',
  board: 'Please select your Board.',
  subject: 'Please select your Subject.',
};
function stepValues(){
  const boardEl = $('board');
  return {
    country: $('country').value,
    province: currentProvince(),
    className: $('className').value.trim(),
    board: boardEl ? boardEl.value.trim() : '',
    subject: $('subject').value.trim(),
  };
}
function firstMissing(v){
  if(!v.country) return STEP_MSGS.country;
  if(!v.province) return STEP_MSGS.province;
  if(!v.className) return STEP_MSGS.className;
  if(!v.board) return STEP_MSGS.board;
  if(!v.subject) return STEP_MSGS.subject;
  return null;
}
// Progressive enablement, in step order: each field unlocks only when the
// previous step is complete; the question area unlocks only when all five
// are complete. Completion cascades, so clearing an early step re-locks
// everything below it even if stale values remain. The status line always
// names the next step, so a student facing a locked question area always
// knows what to do next.
function updateGates(){
  const v = stepValues();
  const c1 = !!v.country;
  const c2 = c1 && !!v.province;
  const c3 = c2 && !!v.className;
  const c4 = c3 && !!v.board;
  const ready = c4 && !!v.subject;
  $('provinceSelect').disabled = !c1;
  $('provinceText').disabled = !c1;
  $('className').disabled = !c2;
  $('board').disabled = !c3;
  $('subject').disabled = !c4;
  $('q').disabled = !ready;
  $('askBtn').disabled = !ready;
  // Vision (image questions): the attach control is gated by this same
  // step-gate lock — unusable until all five steps are complete.
  $('attachBtn').disabled = !ready;
  $('imageInput').disabled = !ready;
  $('removeImageBtn').disabled = !ready;
  const miss = firstMissing(v);
  $('status').textContent = miss || '';
  // Error styling (user requirement 2026-11-04): a missing step shows as an
  // important error (red, semibold via #status.error in exammate.css);
  // when nothing is missing the status line returns to normal styling.
  $('status').classList.toggle('error', !!miss);
}
$('country').addEventListener('change', () => { toggleProvince(); updateGates(); });
$('provinceSelect').addEventListener('change', updateGates);
$('provinceText').addEventListener('input', updateGates);
$('className').addEventListener('input', updateGates);
$('board').addEventListener('input', updateGates);
$('subject').addEventListener('input', updateGates);

// Vision — image questions (2026-11-17). An attached image is compressed
// in the browser before sending: resized to max 1024px on the longest side
// (aspect ratio kept, never upscaled), exported as JPEG quality 0.8. The
// original file bytes are never sent, which also strips EXIF/GPS metadata.
// Previews use data: URLs (CSP imgSrc allows 'self' and data: only — never
// blob URLs). The question text is optional when an image is attached.
const MAX_IMAGE_SIDE = 1024;
const JPEG_QUALITY = 0.8;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
let attachedImage = null; // Compressed JPEG data URL string, or null.
let imageProcessing = false; // True while a selected image is compressing.
let imageJob = 0; // Guards against overlapping selections: only the latest wins.
function showStatusError(msg){
  $('status').textContent = msg;
  $('status').classList.add('error');
}
function clearAttachedImage(){
  attachedImage = null;
  $('imageInput').value = '';
  $('imagePreview').removeAttribute('src');
  $('imagePreviewWrap').hidden = true;
}
function readFileAsDataURL(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(new Error('read')));
    reader.readAsDataURL(file);
  });
}
async function decodeImage(file){
  // Prefer createImageBitmap so phone photos keep their EXIF orientation.
  if(window.createImageBitmap){
    try{
      const bitmap = await createImageBitmap(file, {imageOrientation: 'from-image'});
      return {source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close()};
    }catch(e){ /* fall through to the Image-element path below */ }
  }
  const dataUrl = await readFileAsDataURL(file);
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.addEventListener('load', () => resolve(im));
    im.addEventListener('error', () => reject(new Error('decode')));
    im.src = dataUrl;
  });
  return {source: img, width: img.naturalWidth, height: img.naturalHeight, close: null};
}
async function compressImage(file){
  const decoded = await decodeImage(file);
  if(!decoded.width || !decoded.height) throw new Error('decode');
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(decoded.width, decoded.height));
  const targetWidth = Math.max(1, Math.round(decoded.width * scale));
  const targetHeight = Math.max(1, Math.round(decoded.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  // JPEG has no transparency: paint white behind transparent PNG pixels.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(decoded.source, 0, 0, targetWidth, targetHeight);
  if(decoded.close) decoded.close();
  let dataUrl;
  let byteSize;
  const blob = await new Promise(resolve => {
    if(canvas.toBlob) canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
    else resolve(null);
  });
  if(blob){
    byteSize = blob.size;
    dataUrl = await readFileAsDataURL(blob);
  }else{
    dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const base64 = dataUrl.split(',')[1] || '';
    byteSize = Math.floor(base64.length * 3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  }
  if(byteSize > MAX_IMAGE_BYTES) throw new Error('too-large');
  if(!dataUrl || dataUrl.length < 100) throw new Error('decode');
  return dataUrl;
}
async function onImageSelected(){
  const input = $('imageInput');
  const file = input.files && input.files[0];
  if(!file) return;
  if(file.type && file.type.indexOf('image/') !== 0){
    clearAttachedImage();
    showStatusError('Please choose an image file (JPEG, PNG, or WebP).');
    return;
  }
  const job = ++imageJob;
  imageProcessing = true;
  $('status').textContent = 'Preparing your image…';
  $('status').classList.remove('error');
  try{
    const dataUrl = await compressImage(file);
    if(job !== imageJob) return; // A newer selection superseded this one.
    attachedImage = dataUrl;
    $('imagePreview').src = dataUrl;
    $('imagePreviewWrap').hidden = false;
    $('status').textContent = '';
    $('status').classList.remove('error');
  }catch(e){
    if(job !== imageJob) return;
    clearAttachedImage();
    if(e && e.message === 'too-large') showStatusError('That image is too large even after compression. Please choose a smaller image.');
    else showStatusError('Could not read that image. Please choose a JPEG, PNG, or WebP image.');
  }finally{
    if(job === imageJob) imageProcessing = false;
  }
}
$('attachBtn').addEventListener('click', () => { $('imageInput').click(); });
$('imageInput').addEventListener('change', onImageSelected);
$('removeImageBtn').addEventListener('click', clearAttachedImage);
async function checkLogin(){
  const r = await fetch('/api/auth/me', {credentials:'include'});
  if(!r.ok){ $('loginGate').hidden = false; $('toolUI').hidden = true; return null; }
  const me = await r.json();
  $('loginGate').hidden = true; $('toolUI').hidden = false;
  $('whoamiLine').textContent = 'Logged in as ' + me.email + ' (' + me.role + ').';
  return me;
}
function addMsg(kind, meta, content, isHtml){
  const div = document.createElement('div'); div.className = 'msg ' + kind;
  if(meta){ const m = document.createElement('div'); m.className = 'meta'; m.textContent = meta; div.appendChild(m); }
  const b = document.createElement('div'); b.className = 'body';
  if(isHtml) b.innerHTML = content; else b.textContent = content;
  div.appendChild(b); $('chat').appendChild(div);
  div.scrollIntoView({behavior:'smooth', block:'nearest'});
}
async function ask(){
  const q = $('q').value.trim();
  const v = stepValues();
  const miss = firstMissing(v);
  if(miss){ $('status').textContent = miss; $('status').classList.add('error'); return; }
  if(imageProcessing){ showStatusError('Please wait while your image is being prepared.'); return; }
  if(!q && !attachedImage){ showStatusError('Please type a question or attach an image.'); return; }
  const meR = await fetch('/api/auth/me', {credentials:'include'});
  if(!meR.ok){ $('status').textContent = 'Please log in first.'; $('status').classList.add('error'); $('loginGate').hidden = false; $('toolUI').hidden = true; return; }
  const me = await meR.json();
  const imageToSend = attachedImage;
  const userText = imageToSend ? (q ? q + '\n[Image attached]' : '[Image attached]') : q;
  addMsg('user', v.subject + ' · ' + v.className + ' · ' + v.board + ' · ' + v.country + ' / ' + v.province, userText, false);
  $('q').value = '';
  $('askBtn').disabled = true;
  $('status').textContent = 'Getting your answer… This can take up to a minute.';
  // Loading text is information, not an error — normal styling.
  $('status').classList.remove('error');
  const payload = {question:q, subject: v.subject, country: v.country, province: v.province, className: v.className, board: v.board};
  if(imageToSend) payload.image = imageToSend;
  let askOk = false;
  try{
    const r = await fetch('/api/exammate/ask', {method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':me.csrfToken}, credentials:'include', body:JSON.stringify(payload)});
    const j = await r.json();
    if(!r.ok) addMsg('err', '', j.error || 'Something went wrong. Please try again.', false);
    else{ addMsg('ai', 'ExamMate', j.answerHtml || 'No answer received.', true); askOk = true; }
  }catch(e){
    addMsg('err', '', 'Network error. Please check your connection and try again.', false);
  }
  // Clear the attached image only after a successful answer, so a failed ask
  // keeps it for retry. The identity check keeps a newer selection (picked
  // while this ask was in flight) intact.
  if(askOk && attachedImage === imageToSend) clearAttachedImage();
  updateGates();
}
$('askBtn').addEventListener('click', ask);
toggleProvince();
updateGates();
checkLogin();

// History (2026-11-04): past questions, newest first. No exammate.html
// change: the section is created with DOM calls only (like the Board
// field), inside #toolUI, so it is login-gated like the rest of the tool.
// Answers use server-sanitized answerHtml, exactly like live answers.
(function addHistorySection(){
  const toolUI = $('toolUI');
  if(!toolUI) return;
  const wrap = document.createElement('div');
  wrap.id = 'historyWrap';
  const btn = document.createElement('button');
  btn.id = 'historyBtn';
  btn.textContent = 'Show history';
  const list = document.createElement('div');
  list.id = 'historyList';
  list.className = 'chat';
  wrap.appendChild(btn);
  wrap.appendChild(list);
  toolUI.appendChild(wrap);
  btn.addEventListener('click', loadHistory);
})();
async function loadHistory(){
  const list = $('historyList');
  const btn = $('historyBtn');
  if(!list || !btn) return;
  btn.disabled = true;
  list.textContent = 'Loading history…';
  try{
    const r = await fetch('/api/exammate/history', {credentials:'include'});
    const j = await r.json();
    if(!r.ok){ list.textContent = j.error || 'Could not load history.'; btn.disabled = false; return; }
    list.textContent = '';
    if(!j.history || !j.history.length){ list.textContent = 'No past questions yet.'; btn.disabled = false; return; }
    j.history.forEach(function(h){
      const div = document.createElement('div'); div.className = 'msg ai';
      const meta = document.createElement('div'); meta.className = 'meta';
      meta.textContent = (h.subject || '') + ' · ' + (h.class_name || '') + ' · ' + (h.created_at || '');
      const q = document.createElement('div'); q.className = 'body';
      q.textContent = 'Q: ' + (h.question || '');
      const a = document.createElement('div'); a.className = 'body';
      if(h.answerHtml) a.innerHTML = h.answerHtml; else a.textContent = h.answer || '';
      div.appendChild(meta); div.appendChild(q); div.appendChild(a);
      list.appendChild(div);
    });
    btn.textContent = 'Reload history';
    btn.disabled = false;
  }catch(e){
    list.textContent = 'Network error. Please check your connection and try again.';
    btn.disabled = false;
  }
}
