// _shared.js — shared utilities for index.html, events.html, team.html
// Loaded via <script src="/_shared.js"> on every public page.

// ── CONFIGURATION ─────────────────────────────────────────────────────────
const API = '/api';

// Open Graph image — change this one URL to update og:image across all pages.
// Use an absolute URL to a JPG/PNG for best social media compatibility.
// SVG works in most modern scrapers but PNG/JPG is safest.
// To replace: upload your image somewhere (e.g. Vercel Blob) and paste the URL here.
const OG_IMAGE_URL = '/og-image.svg';

// ── TAGS (edit to match your event taxonomy) ──────────────────────────────
const EVENT_TAGS = {
  types: [
    { id: 'delavnica', label: 'Delavnica' },
    { id: 'predavanje', label: 'Predavanje' },
    { id: 'ritual', label: 'Ritual' },
    { id: 'meditacija', label: 'Meditacija' },
    { id: 'pogovor', label: 'Pogovor' },
    { id: 'drugo', label: 'Drugo' }
  ],
  themes: [
    { id: 'sanje', label: 'Sanje' },
    { id: 'lucidno-sanjanje', label: 'Lucidno sanjanje' },
    { id: 'samanizem', label: 'Šamanizem' },
    { id: 'zavest', label: 'Zavest' },
    { id: 'energija', label: 'Energija' },
    { id: 'telo', label: 'Telo' },
    { id: 'narava', label: 'Narava' },
    { id: 'zdravljenje', label: 'Zdravljenje' },
    { id: 'izventelesne-izkusnje', label: 'Izventelesne izkušnje' },
    { id: 'drugo', label: 'Drugo' }
  ]
};

// ── HTML ESCAPING ─────────────────────────────────────────────────────────
// All event/speaker/team-member text fields are plain text (never meant to
// contain markup), but they're admin-entered and rendered via innerHTML
// across every public page. Escaping them here — once — means a stray "<",
// "&" or quote in a title/bio can never break page layout or inject markup.
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── SHARED ICONS ──────────────────────────────────────────────────────────
const GLOBE_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-1px;margin-right:3px"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;

// ── DATE HELPERS ──────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Intl.DateTimeFormat('sl-SI', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(new Date(dateStr));
  } catch { return dateStr; }
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('sl-SI', { day: '2-digit', month: 'short' });
  } catch { return dateStr; }
}

function isUpcoming(dateStr) {
  if (!dateStr) return true;
  const d = new Date(dateStr);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return d >= today;
}

// ── API ───────────────────────────────────────────────────────────────────
async function fetchPublicData() {
  const res = await fetch(`${API}/events`);
  if (!res.ok) throw new Error('API error ' + res.status);
  return res.json(); // { events, settings, teamMembers }
}

// ── SPEAKER / TAG HELPERS ─────────────────────────────────────────────────
function parseSpeakers(ev) {
  const v = ev.speakers;
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object' && v !== null) return Object.values(v);
  try { return JSON.parse(v); } catch { return []; }
}

function parseTags(ev) {
  const tagType = ev.tagType || '';
  let tagThemes = ev.tagThemes;
  if (!tagThemes) return tagType ? [tagType] : [];
  if (typeof tagThemes === 'string') {
    try { tagThemes = JSON.parse(tagThemes); } catch { tagThemes = []; }
  }
  if (!Array.isArray(tagThemes)) tagThemes = [];
  return [tagType, ...tagThemes].filter(Boolean);
}

function tagLabel(id) {
  const all = [...EVENT_TAGS.types, ...EVENT_TAGS.themes];
  return all.find(t => t.id === id)?.label || id;
}

function renderTagPills(tags, clickable = false) {
  if (!tags?.length) return '';
  return tags.map(t => `<span class="tag-pill${clickable ? ' clickable' : ''}" data-tag="${t}"${clickable ? ` onclick="filterByTag('${t}')"` : ''}>${tagLabel(t)}</span>`).join('');
}

// ── IMAGE RENDER ──────────────────────────────────────────────────────────
function renderImage(imageUrl, cls = '') {
  if (imageUrl) {
    return `<img src="${escapeHtml(imageUrl)}" class="${cls}" alt="Slika dogodka" loading="lazy" onerror="this.outerHTML='<div class=&quot;${cls} placeholder&quot;>☽</div>'">`;
  }
  return `<div class="${cls} placeholder">☽</div>`;
}

// ── SPEAKER LIST (shared markup for index.html + events.html) ─────────────
// Renders the speaker cards used both on the homepage event view and inside
// the events.html modal. Previously this ~15-line block was hand-copied in
// both places and had drifted slightly; now both pages call this function.
function renderSpeakerCards(speakers) {
  if (!speakers?.length) return '';
  return speakers.map(s => `
    <div style="display:flex;gap:0.8rem;align-items:flex-start;margin-bottom:1rem">
      ${s.imageUrl ? `<img src="${escapeHtml(s.imageUrl)}" alt="${escapeHtml(s.name)}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1px solid var(--border)" onerror="this.style.display='none'">` : ''}
      <div>
        <div style="font-size:0.92rem;color:var(--text)">${escapeHtml(s.name)}</div>
        ${s.role ? `<div style="font-size:0.76rem;color:var(--accent2);font-family:var(--sans)">${escapeHtml(s.role)}</div>` : ''}
        ${s.bio ? `<p style="font-size:0.84rem;color:var(--text2);line-height:1.6;margin:0.3rem 0 0">${s.bio}</p>` : ''}
        ${s.link ? `<a href="${escapeHtml(s.link)}" target="_blank" rel="noopener" style="font-size:0.8rem;color:var(--accent);text-decoration:none;font-family:var(--sans);display:inline-flex;align-items:center;gap:2px;margin-top:0.3rem">${GLOBE_ICON}Spletna stran</a>` : ''}
      </div>
    </div>`).join('');
}

// Wraps renderSpeakerCards in the collapsible "Predavatelji" toggle button
// used on the homepage (index.html). events.html's modal uses its own
// toggle (toggleCollapsible) since it shares that mechanism with descriptions.
function speakerListHtml(speakers, bodyId) {
  if (!speakers?.length) return '';
  const bid = bodyId || ('sp-' + Math.random().toString(36).slice(2, 7));
  return `
    <button class="collapsible-trigger" onclick="toggleSpeakers(this,'${bid}')">
      <span class="btn-label">Predavatelji</span><span class="chevron">▾</span>
    </button>
    <div class="collapsible-body" id="${bid}">${renderSpeakerCards(speakers)}</div>`;
}

// ── EVENT BADGES ─────────────────────────────────────────────────────────
function eventBadges(ev) {
  const badges = [];
  if (ev.date) badges.push(`<span class="badge">${escapeHtml(formatDate(ev.date))}${ev.time ? ' · ' + escapeHtml(ev.time) : ''}</span>`);
  if (ev.isOnline === 'true') badges.push(`<span class="badge online">🔗 Online</span>`);
  else if (ev.location) badges.push(`<span class="badge">📍 ${escapeHtml(ev.location)}</span>`);
  if (ev.eventType === 'recurring') badges.push(`<span class="badge recurring">↻ Serija</span>`);
  return badges.join('');
}

// ── SUBSCRIBE BAR (shared component, injected on all 3 public pages) ──────
// Previously each page hardcoded its own copy of this markup in <body>.
// Now there's one implementation: it mounts into a `#subscribe-bar-mount`
// div, stays hidden until the visitor scrolls a bit (so it doesn't compete
// with the hero/first impression), and starts collapsed to a slim tab
// rather than the full form. Once someone subscribes on this browser it's
// remembered and the bar never shows again — no point still asking.
function initSubscribeBar() {
  if (localStorage.getItem('ev_subscribed') === 'true') return;

  const mount = document.getElementById('subscribe-bar-mount');
  if (!mount) return;

  mount.innerHTML = `
    <div class="subscribe-bar collapsed" id="subscribe-bar">
      <button type="button" class="subscribe-bar-tab" onclick="expandSubscribeBar()">
        <span>✦ Prijava na vabila k dogodkom</span><span class="chevron">▴</span>
      </button>
      <form class="subscribe-bar-inner" id="subscribe-form" onsubmit="handleSubscribe(event)">
        <div class="bar-msg" id="sub-msg-bar" style="display:none"></div>
        <input type="text" class="sub-name name-field" placeholder="Ime">
        <input type="email" class="sub-email" placeholder="E-mail za vabila na dogodke" required autocomplete="email">
        <button type="submit">Prijavi se</button>
        <button type="button" class="subscribe-bar-collapse" onclick="collapseSubscribeBar()" aria-label="Skrij obrazec">▾</button>
      </form>
    </div>`;

  const revealIfScrolled = () => {
    if (window.scrollY > 400) {
      document.getElementById('subscribe-bar')?.classList.add('visible');
      window.removeEventListener('scroll', revealIfScrolled);
    }
  };
  window.addEventListener('scroll', revealIfScrolled, { passive: true });
  // Short pages may never reach 400px of scroll — reveal right away instead.
  if (document.body.scrollHeight <= window.innerHeight + 400) revealIfScrolled();
}

function expandSubscribeBar() {
  document.getElementById('subscribe-bar')?.classList.remove('collapsed');
}
function collapseSubscribeBar() {
  document.getElementById('subscribe-bar')?.classList.add('collapsed');
}
// Called by each page once its settings (collectName) have loaded.
function setSubscribeBarNameField(collect) {
  document.getElementById('subscribe-bar')?.classList.toggle('show-name', !!collect);
}

// ── SUBSCRIBE FORM ────────────────────────────────────────────────────────
// Single implementation used by index.html, events.html and team.html.
// Each page's sticky subscribe bar uses the same markup (.sub-email,
// .sub-name, a #sub-msg-bar message element and a submit button), so one
// handler covers all three — no more per-page copies to keep in sync.
async function handleSubscribe(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type=submit]');
  const msg = document.getElementById('sub-msg-bar');
  const emailEl = form.querySelector('.sub-email');
  const nameEl = form.querySelector('.sub-name');
  if (!emailEl) return;
  btn.disabled = true;
  if (msg) { msg.style.display = 'none'; msg.textContent = ''; msg.className = 'bar-msg'; }

  try {
    const res = await fetch(`${API}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailEl.value.trim(), name: nameEl?.value?.trim() || '' })
    });
    const data = await res.json();
    if (msg) {
      msg.style.display = 'block';
      msg.className = 'bar-msg ' + (data.ok ? 'ok' : 'error');
      msg.textContent = data.ok ? '✦ Prijava uspešna. Dobrodošel/a v skupnosti.' : (data.error || 'Napaka. Poskusi znova.');
    }
    if (data.ok) {
      form.reset();
      localStorage.setItem('ev_subscribed', 'true');
      // Leave the success message visible for a moment, then remove the bar
      // entirely — goal achieved, no reason to keep asking on this browser.
      setTimeout(() => { document.getElementById('subscribe-bar')?.remove(); }, 3000);
      return;
    }
  } catch {
    if (msg) { msg.style.display = 'block'; msg.className = 'bar-msg error'; msg.textContent = 'Napaka pri povezavi.'; }
  } finally {
    btn.disabled = false;
    if (msg) setTimeout(() => { msg.style.display = 'none'; }, 4000);
  }
}

// ── BACK TO TOP ───────────────────────────────────────────────────────────
function initBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });
}

// ── NAVIGATION ACTIVE STATE ───────────────────────────────────────────────
function initNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach(a => {
    const href = a.getAttribute('href');
    const isHome = (href === '/' || href === '/index.html') && (path === '/' || path === '/index.html');
    const isMatch = href !== '/' && href !== '/index.html' && path.includes(href.replace('.html', ''));
    if (isHome || isMatch) a.classList.add('active');
  });

  // Inject hamburger button into nav
  const navInner = document.querySelector('.site-nav-inner');
  const links = document.querySelector('.site-nav-links');
  if (navInner && links) {
    const btn = document.createElement('button');
    btn.className = 'nav-hamburger';
    btn.setAttribute('aria-label', 'Meni');
    btn.innerHTML = '☰';
    btn.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      btn.innerHTML = open ? '✕' : '☰';
    });
    // Close on outside click
    document.addEventListener('click', e => {
      if (!navInner.contains(e.target)) {
        links.classList.remove('open');
        btn.innerHTML = '☰';
      }
    });
    navInner.appendChild(btn);
  }

  // Set copyright year dynamically
  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}

// ── DYNAMIC OG META (for pages that know their event) ─────────────────────
function setOgMeta({ title, description, image, url }) {
  const set = (prop, val) => {
    let el = document.querySelector(`meta[property="${prop}"]`);
    if (el) el.setAttribute('content', val || '');
  };
  if (title) { set('og:title', title); set('twitter:title', title); document.title = title; }
  if (description) { set('og:description', description); set('twitter:description', description); }
  if (image) { set('og:image', image); set('twitter:image', image); }
  if (url) set('og:url', url);
}
