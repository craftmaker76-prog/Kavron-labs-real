// Kavron Labs homepage logic. Loaded as an external file on purpose:
// the site's Content Security Policy allows scripts only from the site
// itself ('self'), so inline scripts and onclick attributes are blocked.
// All buttons are wired here with addEventListener instead.
//
// Account behaviour (like any real website, not a demo dump):
// - On page load we check the session: if already logged in, the login
//   and register forms are hidden and a "Logged in as ..." view shows.
// - After a successful login the forms disappear and the logged-in
//   view appears. After logout the forms come back.
// - Messages are plain words, never raw JSON.
// (ExamMate now lives on its own page: /exammate.html.)
async function refreshAuth(){
  try{
    const r=await fetch('/api/auth/me',{credentials:'include'});
    if(!r.ok) throw new Error('logged out');
    const me=await r.json();
    document.getElementById('authForms').hidden=true;
    document.getElementById('loggedInView').hidden=false;
    document.getElementById('whoami').textContent='Logged in as '+me.email+' ('+me.role+').';
  }catch(e){
    document.getElementById('authForms').hidden=false;
    document.getElementById('loggedInView').hidden=true;
  }
}
async function readError(r,fallback){
  try{const j=await r.json();return j.error||fallback;}catch(e){return fallback;}
}
async function login(){
  const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({email:document.getElementById('email').value,password:document.getElementById('password').value})});
  if(!r.ok){document.getElementById('authMsg').textContent=await readError(r,'Login failed. Please check your email and password.');return;}
  document.getElementById('authMsg').textContent='';
  await refreshAuth();
}
async function logout(){
  try{
    const me=await (await fetch('/api/auth/me',{credentials:'include'})).json();
    if(me.csrfToken) await fetch('/api/auth/logout',{method:'POST',headers:{'X-CSRF-Token':me.csrfToken},credentials:'include'});
  }catch(e){}
  await refreshAuth();
}
async function register(){
  const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({email:document.getElementById('regEmail').value,password:document.getElementById('regPassword').value})});
  if(!r.ok){document.getElementById('regMsg').textContent=await readError(r,'Registration failed. Please try again.');return;}
  document.getElementById('regMsg').textContent='Account created! Now log in.';
}
document.getElementById('loginBtn').addEventListener('click',login);
document.getElementById('logoutBtn').addEventListener('click',logout);
document.getElementById('registerBtn').addEventListener('click',register);
refreshAuth();
