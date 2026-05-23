// =============================================
// script.js — Telegram Mini App JavaScript
// =============================================

// ─── SOZLAMALAR ──────────────────────────────────
const API_BASE = 'https://69a7cb31c1958.clouduz.ru/Kinobottest/api.php'; // api.php fayli bilan bir papkada bo'lishi kerak

// ─── TELEGRAM WEBAPP ─────────────────────────────
const tg = window.Telegram?.WebApp;
let tgUserId = null;

if (tg) {
  tg.ready();
  tg.expand();
  tg.enableClosingConfirmation();

  // Foydalanuvchi ID sini olish
  tgUserId = tg.initDataUnsafe?.user?.id ?? null;

  // Tema ranglarini CSS ga ulash
  const tc = tg.themeParams;
  if (tc?.bg_color)         document.documentElement.style.setProperty('--tg-bg', tc.bg_color);
  if (tc?.button_color)     document.documentElement.style.setProperty('--tg-btn', tc.button_color);
  if (tc?.button_text_color)document.documentElement.style.setProperty('--tg-btn-txt', tc.button_text_color);
}

// ─── DOM ELEMENTLAR ───────────────────────────────
const $grid        = document.getElementById('grid');
const $loader      = document.getElementById('loader');
const $empty       = document.getElementById('emptyState');
const $total       = document.getElementById('totalCount');
const $search      = document.getElementById('searchInput');
const $modal       = document.getElementById('modal');
const $overlay     = document.getElementById('modalOverlay');
const $closeBtn    = document.getElementById('modalCloseBtn');
const $modalTitle  = document.getElementById('modalTitle');
const $modalMeta   = document.getElementById('modalMeta');
const $partsLabel  = document.getElementById('partsLabel');
const $partsList   = document.getElementById('partsList');
const $partsLoader = document.getElementById('partsLoader');
const $modalHeroImg= document.getElementById('modalHeroImg');
const $heroPholder = document.getElementById('modalHeroPlaceholder');
const $toast       = document.getElementById('toast');

// ─── STATE ────────────────────────────────────────
let allKinolar  = [];      // barcha kinolar keshi
let currentKino = null;    // ochilgan kino
let searchTimer = null;    // debounce timer
let toastTimer  = null;

// ─── API SO'ROVLAR ────────────────────────────────
async function apiGet(action, params = {}) {
  const url = new URL(API_BASE, location.href);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const headers = {};
  if (tg?.initData) headers['X-Telegram-Init-Data'] = tg.initData;

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiPost(action, body = {}) {
  const url = new URL(API_BASE, location.href);
  url.searchParams.set('action', action);

  const headers = { 'Content-Type': 'application/json' };
  if (tg?.initData) headers['X-Telegram-Init-Data'] = tg.initData;

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── TOAST BILDIRISHNOMA ──────────────────────────
function showToast(msg, type = 'info', duration = 3000) {
  $toast.textContent = msg;
  $toast.className   = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $toast.className = '';
  }, duration);
}

// ─── RASM YUKLASH (xato bo'lsa placeholder) ───────
function loadImage(imgEl, placeholderEl, url) {
  if (!url) { imgEl.style.display = 'none'; placeholderEl.style.display = 'flex'; return; }
  imgEl.style.display = 'none';
  placeholderEl.style.display = 'flex';
  const temp = new Image();
  temp.onload = () => {
    imgEl.src = url;
    imgEl.style.display = 'block';
    placeholderEl.style.display = 'none';
  };
  temp.onerror = () => {
    imgEl.style.display = 'none';
    placeholderEl.style.display = 'flex';
  };
  temp.src = url;
}

// ─── KINO KARTASI ─────────────────────────────────
function createCard(kino) {
  const card = document.createElement('div');
  card.className = 'kino-card';
  card.dataset.id = kino.kino_id;

  const posterHTML = kino.rasm_url
    ? `<img class="card-poster" src="${escHtml(kino.rasm_url)}" alt="${escHtml(kino.kino_nomi)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
       <div class="card-poster-placeholder" style="display:none;">🎬</div>`
    : `<div class="card-poster-placeholder">🎬</div>`;

  const partsText = kino.qismlar_soni > 0
    ? `<b>${kino.qismlar_soni}</b> qism`
    : 'Qismlar yo\'q';

  card.innerHTML = `
    <div class="card-wrap">
      ${posterHTML}
      ${kino.qismlar_soni > 0 ? `<div class="card-badge">${kino.qismlar_soni}✦</div>` : ''}
    </div>
    <div class="card-info">
      <div class="card-name">${escHtml(kino.kino_nomi)}</div>
      <div class="card-parts">${partsText}</div>
    </div>
  `;

  card.addEventListener('click', () => openModal(kino.kino_id));
  return card;
}

// ─── GRIDNI RENDER QILISH ────────────────────────
function renderGrid(kinolar) {
  $grid.innerHTML = '';
  $loader.style.display   = 'none';

  if (!kinolar.length) {
    $empty.style.display  = 'flex';
    $total.textContent    = '';
    return;
  }

  $empty.style.display = 'none';
  $total.textContent   = `(${kinolar.length})`;

  kinolar.forEach((k, i) => {
    const card = createCard(k);
    card.style.animationDelay = `${Math.min(i * 0.04, 0.5)}s`;
    $grid.appendChild(card);
  });
}

// ─── BARCHA KINOLARNI YUKLASH ─────────────────────
async function loadKinolar() {
  $loader.style.display  = 'flex';
  $grid.innerHTML        = '';
  $empty.style.display   = 'none';

  try {
    const data = await apiGet('list');
    if (!data.ok) throw new Error(data.error ?? 'API xato');
    allKinolar = data.kinolar ?? [];
    renderGrid(allKinolar);
  } catch (err) {
    $loader.style.display = 'none';
    showToast('❌ Kinolar yuklanmadi: ' + err.message, 'error');
    console.error(err);
  }
}

// ─── QIDIRUV ──────────────────────────────────────
$search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = $search.value.trim();

  if (q.length === 0) {
    renderGrid(allKinolar);
    return;
  }

  if (q.length < 2) return;

  // Avval lokal qidiruv (tezroq)
  const local = allKinolar.filter(k =>
    k.kino_nomi.toLowerCase().includes(q.toLowerCase())
  );
  renderGrid(local);

  // Keyin API qidiruv (debounce 500ms)
  searchTimer = setTimeout(async () => {
    try {
      const data = await apiGet('search', { q });
      if (data.ok) renderGrid(data.kinolar ?? []);
    } catch (e) { /* lokal natija qolsin */ }
  }, 500);
});

// ─── MODAL OCHISH ─────────────────────────────────
async function openModal(kinoId) {
  // Avval keshdan tezkor render
  currentKino = allKinolar.find(k => k.kino_id == kinoId) ?? { kino_id: kinoId };
  renderModalShell(currentKino);

  $modal.classList.add('active');
  $overlay.classList.add('active');

  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');

  // API dan to'liq ma'lumot olish
  $partsLoader.style.display = 'block';
  $partsList.innerHTML       = '';
  $partsLabel.textContent    = '';

  try {
    const data = await apiGet('kino', { id: kinoId });
    if (!data.ok) throw new Error(data.error ?? 'Xato');

    currentKino = data;
    updateModalFull(data);
  } catch (err) {
    $partsLoader.style.display = 'none';
    $partsList.innerHTML = `<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px;">❌ Qismlar yuklanmadi</p>`;
    showToast('Xato: ' + err.message, 'error');
  }
}

// Modal skeleton (tez ko'rsatish uchun)
function renderModalShell(kino) {
  $modalTitle.textContent = kino.kino_nomi ?? '';
  loadImage($modalHeroImg, $heroPholder, kino.rasm_url ?? null);

  $modalMeta.innerHTML = '';
  if (kino.kino_id) {
    $modalMeta.innerHTML += `<div class="meta-tag accent">ID: ${escHtml(kino.kino_id)}</div>`;
  }
  if (kino.qismlar_soni != null) {
    $modalMeta.innerHTML += `<div class="meta-tag">${kino.qismlar_soni} qism</div>`;
  }
}

// Modal to'liq ma'lumot bilan yangilash
function updateModalFull(data) {
  $modalTitle.textContent = data.kino_nomi ?? '';
  loadImage($modalHeroImg, $heroPholder, data.rasm_url ?? null);

  $modalMeta.innerHTML = `
    <div class="meta-tag accent">ID: ${escHtml(data.kino_id)}</div>
    <div class="meta-tag">${data.qismlar_soni} qism</div>
  `;

  const qismlar = data.qismlar ?? [];
  $partsLoader.style.display = 'none';

  if (!qismlar.length) {
    $partsLabel.textContent = '';
    $partsList.innerHTML = `<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px;">Hali qismlar yo'q</p>`;
    return;
  }

  $partsLabel.textContent = `Qismlar`;
  $partsList.innerHTML = '';

  qismlar.forEach(q => {
    const item = document.createElement('div');
    item.className = 'part-item';

    const views = q.ko_rishlar > 0 ? `👁 ${q.ko_rishlar}` : '';

    item.innerHTML = `
      <div class="part-num">${q.qism_raqami}</div>
      <div class="part-info">
        <div class="part-name">${escHtml(q.qism_nomi ?? `${data.kino_nomi} — ${q.qism_raqami}-qism`)}</div>
        ${q.malumot ? `<div class="part-desc">${escHtml(q.malumot)}</div>` : ''}
      </div>
      <button class="watch-btn" data-kino="${escHtml(data.kino_id)}" data-qism="${q.qism_raqami}">
        ▶ Ko'rish
      </button>
    `;

    item.querySelector('.watch-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      watchPart(data.kino_id, q.qism_raqami, e.currentTarget);
    });

    $partsList.appendChild(item);
  });
}

// ─── KINO QISMINI TOMOSHA QILISH ─────────────────
async function watchPart(kinoId, qismRaqami, btn) {
  if (!tgUserId) {
    // Telegram WebApp tashqarisida test rejimi
    showToast('ℹ️ Telegram orqali kirganingizda video yuboriladi', 'info');
    return;
  }

  const originalText = btn.innerHTML;
  btn.classList.add('loading');
  btn.innerHTML = '⏳ Yuklanmoqda…';

  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');

  try {
    const data = await apiPost('watch', {
      kino_id:     kinoId,
      qism_raqami: qismRaqami,
      tg_user_id:  tgUserId,
    });

    if (data.ok) {
      showToast('✅ Video botdan yuborildi! Telegram\'ni oching.', 'success');
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');

      // Modal yopib, Telegram ga qaytish (ixtiyoriy)
      // closeModal();
    } else {
      throw new Error(data.error ?? 'Noma\'lum xato');
    }
  } catch (err) {
    showToast('❌ Xato: ' + err.message, 'error');
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
  } finally {
    btn.classList.remove('loading');
    btn.innerHTML = originalText;
  }
}

// ─── MODAL YOPISH ─────────────────────────────────
function closeModal() {
  $modal.classList.remove('active');
  $overlay.classList.remove('active');
  currentKino = null;
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}

$closeBtn.addEventListener('click',   closeModal);
$overlay.addEventListener('click',    closeModal);

// Swipe pastga — modal yopilsin
let touchStartY = 0;
$modal.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
$modal.addEventListener('touchend',   e => {
  const diff = e.changedTouches[0].clientY - touchStartY;
  if (diff > 80) closeModal(); // 80px pastga sürüldü
}, { passive: true });

// ─── YORDAMCHI: HTML ESCAPE ───────────────────────
function escHtml(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── BOSHLASH ─────────────────────────────────────
loadKinolar();
