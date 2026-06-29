// _shared.js — shared utilities for index.html, events.html, team.html
// Loaded via <script src="/_shared.js"> on every public page.

// ── CONFIGURATION ─────────────────────────────────────────────────────────
// Using var so pages that load _shared.js can safely redeclare API if needed
var API = '/api'; // eslint-disable-line no-var

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
    { id: 'drugo', label: 'Drugo' }
  ]
};

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
    return `<img src="${imageUrl}" class="${cls}" alt="Slika dogodka" loading="lazy" onerror="this.outerHTML='<div class=&quot;${cls} placeholder&quot;>☽</div>'">`;
  }
  return `<div class="${cls} placeholder">☽</div>`;
}

// ── EVENT BADGES ─────────────────────────────────────────────────────────
function eventBadges(ev) {
  const badges = [];
  if (ev.date) badges.push(`<span class="badge">${formatDate(ev.date)}${ev.time ? ' · ' + ev.time : ''}</span>`);
  if (ev.isOnline === 'true') badges.push(`<span class="badge online">🔗 Online</span>`);
  else if (ev.location) badges.push(`<span class="badge">📍 ${ev.location}</span>`);
  if (ev.eventType === 'recurring') badges.push(`<span class="badge recurring">↻ Serija</span>`);
  return badges.join('');
}

// ── SUBSCRIBE FORM ────────────────────────────────────────────────────────
async function handleSubscribe(e, collectName) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type=submit]');
  const msg = form.querySelector('.sub-msg');
  const emailEl = form.querySelector('.sub-email');
  const nameEl = form.querySelector('.sub-name');
  if (!emailEl) return;
  btn.disabled = true;
  if (msg) { msg.textContent = ''; msg.className = 'sub-msg'; }

  try {
    const res = await fetch(`${API}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailEl.value.trim(), name: nameEl?.value?.trim() || '' })
    });
    const data = await res.json();
    if (data.ok) {
      if (msg) { msg.className = 'sub-msg ok'; msg.textContent = '✦ Prijava uspešna. Dobrodošel/a v skupnosti.'; }
      form.reset();
    } else {
      if (msg) { msg.className = 'sub-msg error'; msg.textContent = data.error || 'Napaka. Poskusi znova.'; }
    }
  } catch {
    if (msg) { msg.className = 'sub-msg error'; msg.textContent = 'Napaka pri povezavi.'; }
  } finally {
    btn.disabled = false;
    if (msg) setTimeout(() => { if (msg) msg.textContent = ''; }, 5000);
  }
}

// ── SKELETON LOADERS ──────────────────────────────────────────────────────
function skeletonCard(count = 3) {
  return Array(count).fill(0).map(() => `
    <div class="skeleton-card">
      <div class="skeleton-img skel"></div>
      <div class="skeleton-body">
        <div class="skel" style="height:12px; width:60%; margin-bottom:10px"></div>
        <div class="skel" style="height:18px; width:85%; margin-bottom:8px"></div>
        <div class="skel" style="height:12px; width:100%; margin-bottom:6px"></div>
        <div class="skel" style="height:12px; width:75%"></div>
      </div>
    </div>
  `).join('');
}

function skeletonSingle() {
  return `
    <div style="max-width:680px; margin:3rem auto; padding:0 1.5rem">
      <div class="skel" style="width:100%; aspect-ratio:16/9; border-radius:14px; margin-bottom:2rem"></div>
      <div class="skel" style="height:14px; width:50%; margin-bottom:1.5rem; border-radius:4px"></div>
      <div class="skel" style="height:32px; width:80%; margin-bottom:1.2rem; border-radius:4px"></div>
      <div class="skel" style="height:12px; width:100%; margin-bottom:8px; border-radius:4px"></div>
      <div class="skel" style="height:12px; width:90%; margin-bottom:8px; border-radius:4px"></div>
      <div class="skel" style="height:12px; width:70%; border-radius:4px"></div>
    </div>`;
}

function skeletonTeam(count = 3) {
  return `<div class="team-grid">${Array(count).fill(0).map(() => `
    <div class="team-card">
      <div class="skel" style="width:72px;height:72px;border-radius:50%;margin:0 auto 1rem"></div>
      <div class="skel" style="height:16px;width:60%;margin:0 auto 8px;border-radius:4px"></div>
      <div class="skel" style="height:12px;width:40%;margin:0 auto;border-radius:4px"></div>
    </div>
  `).join('')}</div>`;
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
