// ExamMate tool page. External file (CSP: scripts only from 'self').
// Chat-style: every question and answer stays visible below, newest last.
const $ = id => document.getElementById(id);
function currentProvince(){
  return $('country').value === 'Pakistan' ? $('provinceSelect').value : $('provinceText').value.trim();
}
function toggleProvince(){
  const pak = $('country').value === 'Pakistan';
  $('provinceSelect').hidden = !pak;
  $('provinceText').hidden = pak;
}
$('country').addEventListener('change', toggleProvince);
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
  const subject = $('subject').value.trim();
  const className = $('className').value.trim();
  const country = $('country').value;
  const province = currentProvince();
  if(!q){ $('status').textContent = 'Please type a question.'; return; }
  if(!subject){ $('status').textContent = 'Please enter a subject.'; return; }
  if(!className){ $('status').textContent = 'Please enter your class.'; return; }
  if(!province){ $('status').textContent = 'Please enter your province or state.'; return; }
  const meR = await fetch('/api/auth/me', {credentials:'include'});
  if(!meR.ok){ $('status').textContent = 'Please log in first.'; $('loginGate').hidden = false; $('toolUI').hidden = true; return; }
  const me = await meR.json();
  addMsg('user', subject + ' · ' + className + ' · ' + country + ' / ' + province, q, false);
  $('q').value = '';
  $('askBtn').disabled = true;
  $('status').textContent = 'Getting your answer… This can take up to a minute.';
  try{
    const r = await fetch('/api/exammate/ask', {method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':me.csrfToken}, credentials:'include', body:JSON.stringify({question:q, subject, country, province, className})});
    const j = await r.json();
    if(!r.ok) addMsg('err', '', j.error || 'Something went wrong. Please try again.', false);
    else addMsg('ai', 'ExamMate', j.answerHtml || 'No answer received.', true);
  }catch(e){
    addMsg('err', '', 'Network error. Please check your connection and try again.', false);
  }
  $('status').textContent = '';
  $('askBtn').disabled = false;
}
$('askBtn').addEventListener('click', ask);
toggleProvince();
checkLogin();
