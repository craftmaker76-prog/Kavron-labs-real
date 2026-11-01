// Kavron Labs homepage logic. Loaded as an external file on purpose:
// the site's Content Security Policy allows scripts only from the site
// itself ('self'), so inline scripts and onclick attributes are blocked.
// All buttons are wired here with addEventListener instead.
async function login(){const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({email:document.getElementById('email').value,password:document.getElementById('password').value})});document.getElementById('me').textContent=await r.text();}
async function logout(){const me=await (await fetch('/api/auth/me',{credentials:'include'})).json();await fetch('/api/auth/logout',{method:'POST',headers:{'X-CSRF-Token':me.csrfToken},credentials:'include'});document.getElementById('me').textContent='Logged out';}
async function register(){const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({email:document.getElementById('regEmail').value,password:document.getElementById('regPassword').value})});document.getElementById('regMsg').textContent=await r.text();}
async function ask(){const me=await (await fetch('/api/auth/me',{credentials:'include'})).json();const r=await fetch('/api/exammate/ask',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':me.csrfToken},credentials:'include',body:JSON.stringify({question:document.getElementById('q').value,subject:document.getElementById('subject').value,country:'Pakistan',province:'Punjab',className:'Class 10'})});const j=await r.json();document.getElementById('answer').innerHTML=j.answerHtml||j.error||'Error';}
document.getElementById('loginBtn').addEventListener('click',login);
document.getElementById('logoutBtn').addEventListener('click',logout);
document.getElementById('registerBtn').addEventListener('click',register);
document.getElementById('askBtn').addEventListener('click',ask);
