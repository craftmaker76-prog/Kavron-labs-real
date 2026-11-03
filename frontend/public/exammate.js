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
// Per-step messages (Roman Urdu, exact texts — the backend returns these
// same strings). The status line always shows the FIRST missing step.
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
  $('status').textContent = firstMissing(v) || '';
}
$('country').addEventListener('change', () => { toggleProvince(); updateGates(); });
$('provinceSelect').addEventListener('change', updateGates);
$('provinceText').addEventListener('input', updateGates);
$('className').addEventListener('input', updateGates);
$('board').addEventListener('input', updateGates);
$('subject').addEventListener('input', updateGates);
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
  if(miss){ $('status').textContent = miss; return; }
  if(!q){ $('status').textContent = 'Please type a question.'; return; }
  const meR = await fetch('/api/auth/me', {credentials:'include'});
  if(!meR.ok){ $('status').textContent = 'Please log in first.'; $('loginGate').hidden = false; $('toolUI').hidden = true; return; }
  const me = await meR.json();
  addMsg('user', v.subject + ' · ' + v.className + ' · ' + v.board + ' · ' + v.country + ' / ' + v.province, q, false);
  $('q').value = '';
  $('askBtn').disabled = true;
  $('status').textContent = 'Getting your answer… This can take up to a minute.';
  try{
    const r = await fetch('/api/exammate/ask', {method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':me.csrfToken}, credentials:'include', body:JSON.stringify({question:q, subject: v.subject, country: v.country, province: v.province, className: v.className, board: v.board})});
    const j = await r.json();
    if(!r.ok) addMsg('err', '', j.error || 'Something went wrong. Please try again.', false);
    else addMsg('ai', 'ExamMate', j.answerHtml || 'No answer received.', true);
  }catch(e){
    addMsg('err', '', 'Network error. Please check your connection and try again.', false);
  }
  updateGates();
}
$('askBtn').addEventListener('click', ask);
toggleProvince();
updateGates();
checkLogin();
