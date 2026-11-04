
var ANIMS = {
  exammate: '<svg viewBox="0 0 120 80" width="132" height="88"><polygon points="60,10 110,32 60,54 10,32" fill="#312e81"/><polygon points="32,42 32,62 60,72 88,62 88,42 60,54" fill="#4338ca"/><line x1="110" y1="32" x2="110" y2="56" stroke="#f59e0b" stroke-width="2"/><circle cx="110" cy="60" r="4" fill="#f59e0b"/><text class="float-a" x="60" y="30" text-anchor="middle" fill="#fbbf24" font-size="20" font-weight="800">A+</text></svg>',
  picture: '<svg viewBox="0 0 120 80" width="132" height="88"><rect x="14" y="10" width="92" height="60" rx="10" fill="#064e3b"/><rect x="20" y="16" width="80" height="48" rx="6" fill="#ecfdf5"/><g class="spin-rays" stroke="#f59e0b" stroke-width="2"><circle cx="60" cy="34" r="9" fill="#fbbf24" stroke="none"/><line x1="60" y1="20" x2="60" y2="23"/><line x1="60" y1="45" x2="60" y2="48"/><line x1="46" y1="34" x2="49" y2="34"/><line x1="71" y1="34" x2="74" y2="34"/></g><polygon points="20,64 44,42 60,56 74,44 100,64" fill="#10b981"/></svg>',
  pdf: '<svg viewBox="0 0 120 80" width="132" height="88"><path d="M30,6 h44 l16,16 v52 a4,4 0 0 1 -4,4 h-56 a4,4 0 0 1 -4,-4 v-64 a4,4 0 0 1 4,-4 z" fill="#fff1f2"/><polygon class="flip-corner" points="74,6 90,22 74,22" fill="#fda4af"/><rect x="38" y="34" width="44" height="18" rx="4" fill="#e11d48"/><text x="60" y="47" text-anchor="middle" fill="#fff" font-size="11" font-weight="800">PDF</text></svg>',
  text: '<svg viewBox="0 0 120 80" width="132" height="88"><text x="30" y="34" fill="#c4b5fd" font-size="26" font-weight="800">Aa</text><rect class="line-draw" x="58" y="20" width="44" height="6" rx="3" fill="#a78bfa"/><rect class="line-draw d2" x="30" y="48" width="72" height="6" rx="3" fill="#8b5cf6"/><rect class="line-draw d3" x="30" y="62" width="54" height="6" rx="3" fill="#7c3aed"/></svg>'
};
var TOOLS = {
  "ExamMate": {desc: "Ask study questions and get answers in your own language.", live: true, review: "Loved by students", rating: "4.8/5", anim: "exammate", users: 22.8},
  "Picture Tools": {desc: "Resize, compress and convert images.", live: false, review: "A favourite for quick edits", rating: "4.7/5", anim: "picture", users: 18.6},
  "PDF Tools": {desc: "Merge and split PDF files.", live: false, review: "Rated highly for everyday documents", rating: "4.6/5", anim: "pdf", users: 15.3},
  "Text Tools": {desc: "Count words and convert text case.", live: false, review: "Praised for its simplicity", rating: "4.9/5", anim: "text", users: 12.1}
};
var back = document.getElementById('splashBack');
var timer = null;
function openSplash(name, logoSrc) {
  document.getElementById('splashName').textContent = name;
  document.getElementById('splashDesc').textContent = TOOLS[name].desc;
  document.getElementById('splashRating').textContent = TOOLS[name].rating;
  document.getElementById('splashReview').textContent = TOOLS[name].review;
  document.getElementById('toolAnim').innerHTML = ANIMS[TOOLS[name].anim];
  document.getElementById('activeUsers').textContent = (TOOLS[name].users + (Math.random() * 0.8 - 0.4)).toFixed(1) + 'k';
  document.getElementById('splashLogo').src = logoSrc;
  var st = document.getElementById('splashStatus');
  st.textContent = 'Analysing tool\u2026';
  var prog = document.getElementById('splashProg');
  prog.classList.remove('run'); void prog.offsetWidth; prog.classList.add('run');
  back.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(function() {
    if (TOOLS[name].live) { window.location.href = '/exammate.html'; }
    else { st.textContent = name + ' is Coming soon. Stay tuned!'; }
  }, 5000);
}
function closeSplash() { back.classList.remove('show'); clearTimeout(timer); }
document.getElementById('splashClose').addEventListener('click', closeSplash);
back.addEventListener('click', function(e) { if (e.target === back) closeSplash(); });
document.querySelectorAll('.card').forEach(function(card) {
  card.addEventListener('click', function(e) {
    e.preventDefault();
    var name = card.querySelector('h3').textContent;
    var logo = card.querySelector('img').getAttribute('src');
    openSplash(name, logo);
  });
});
