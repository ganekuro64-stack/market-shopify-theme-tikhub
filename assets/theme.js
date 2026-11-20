/* ============================================================
   VERA MARKET — SHOPIFY OS 2.0 PRODUCTION RUNTIME
   - Native Shopify Ajax Cart (/cart/add.js, /cart/change.js, /cart.js)
   - Native Shopify Predictive Search (/search/suggest.json)
   - Native Shopify Product Recommendations API
   - Stepped Auto-Carousel, PDP Variants/Bundles, Video Reels Lightbox
   ============================================================ */

(function () {
  'use strict';

  const cfg = window.VM_THEME || {
    freeShippingThreshold: 7500,
    cartAddUrl: '/cart/add',
    cartChangeUrl: '/cart/change',
    cartUrl: '/cart',
    predictiveSearchUrl: '/search/suggest',
    recommendationsUrl: '/recommendations/products'
  };

  function formatMoney(cents) {
    const dollars = (Number(cents || 0) / 100).toFixed(2);
    return `$${dollars}`;
  }

  function showToast(msg) {
    const el = document.getElementById('vm-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2800);
  }
  window.vmShowToast = showToast;

  /* ---------- AJAX CART DRAWER ---------- */
  function openCart() {
    document.getElementById('cart-backdrop')?.classList.add('open');
    document.getElementById('cart-drawer')?.classList.add('open');
  }
  function closeCart() {
    document.getElementById('cart-backdrop')?.classList.remove('open');
    document.getElementById('cart-drawer')?.classList.remove('open');
  }
  window.openCart = openCart;
  window.closeCart = closeCart;

  async function refreshCart() {
    try {
      const res = await fetch(`${cfg.cartUrl}.js`, { headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const cart = await res.json();
      renderCart(cart);
    } catch (err) {
      console.error('Cart refresh error:', err);
    }
  }

  async function addToCartByVariant(variantId, quantity = 1) {
    if (!variantId) return;
    try {
      const res = await fetch(`${cfg.cartAddUrl}.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items: [{ id: Number(variantId), quantity: Number(quantity) }] })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.description || 'Could not add item to bag.');
        return;
      }
      await refreshCart();
      openCart();
    } catch (err) {
      console.error('Add to cart error:', err);
      showToast('Connection issue. Please try again.');
    }
  }
  window.vmAddToCart = addToCartByVariant;

  async function updateCartLine(lineIndex, quantity) {
    try {
      const res = await fetch(`${cfg.cartChangeUrl}.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ line: Number(lineIndex), quantity: Number(quantity) })
      });
      if (!res.ok) return;
      const cart = await res.json();
      renderCart(cart);
    } catch (err) {
      console.error('Cart update error:', err);
    }
  }
  window.vmUpdateCartLine = updateCartLine;

  function renderCart(cart) {
    const countEl = document.getElementById('header-cart-count');
    const drawerCountEl = document.getElementById('drawer-cart-count');
    if (countEl) countEl.textContent = cart.item_count;
    if (drawerCountEl) drawerCountEl.textContent = `(${cart.item_count})`;

    const threshold = cfg.freeShippingThreshold || 7500;
    const pct = Math.min(100, Math.round((cart.total_price / threshold) * 100));
    const remaining = Math.max(0, threshold - cart.total_price);

    const fillEl = document.getElementById('shipping-fill');
    const msgEl = document.getElementById('shipping-msg');
    if (fillEl) fillEl.style.width = `${pct}%`;
    if (msgEl) {
      msgEl.innerHTML = remaining === 0 && cart.item_count > 0
        ? `<strong>Free 2-Day Express Shipping</strong> unlocked.`
        : `Add <strong>${formatMoney(remaining)}</strong> more for Free 2-Day Shipping.`;
    }

    const itemsEl = document.getElementById('cart-items');
    if (itemsEl) {
      if (!cart.items || cart.items.length === 0) {
        itemsEl.innerHTML = `<p style="color: var(--text-muted); text-align:center; padding: 32px 0;">Your bag is currently empty.</p>`;
      } else {
        itemsEl.innerHTML = cart.items.map((item, idx) => `
          <div class="cart-item">
            <img src="${item.image || ''}" alt="${item.product_title}">
            <div class="cart-item-info">
              <div class="cart-item-top">
                <a href="${item.url}">${item.product_title}</a>
                <span>${formatMoney(item.final_line_price)}</span>
              </div>
              <div class="cart-item-variant">${item.variant_title || ''}</div>
              <div class="cart-item-bottom">
                <div class="qty-stepper">
                  <button type="button" onclick="vmUpdateCartLine(${idx + 1}, ${item.quantity - 1})" aria-label="Decrease">−</button>
                  <span>${item.quantity}</span>
                  <button type="button" onclick="vmUpdateCartLine(${idx + 1}, ${item.quantity + 1})" aria-label="Increase">+</button>
                </div>
                <button type="button" onclick="vmUpdateCartLine(${idx + 1}, 0)" style="font-size:12px; color:var(--text-subtle); text-decoration:underline;">Remove</button>
              </div>
            </div>
          </div>
        `).join('');
      }
    }

    const subtotalEl = document.getElementById('cart-subtotal');
    const shipValEl = document.getElementById('cart-shipping-val');
    const savingsEl = document.getElementById('cart-savings');
    if (subtotalEl) subtotalEl.textContent = `${formatMoney(cart.total_price)} USD`;
    if (shipValEl) shipValEl.textContent = remaining === 0 && cart.item_count > 0 ? 'Free' : 'Calculated at checkout';
    if (savingsEl) {
      const saved = cart.total_discount || 0;
      savingsEl.textContent = saved > 0 ? `−${formatMoney(saved)}` : '$0.00';
    }
  }

  /* ---------- PREDICTIVE SEARCH ---------- */
  let searchDebounce = null;
  function initPredictiveSearch() {
    const input = document.getElementById('header-search-input');
    const dropdown = document.getElementById('search-dropdown');
    if (!input || !dropdown) return;

    input.addEventListener('input', () => {
      const q = input.value.trim();
      clearTimeout(searchDebounce);
      if (!q) {
        dropdown.classList.remove('open');
        return;
      }
      searchDebounce = setTimeout(async () => {
        try {
          const url = `${cfg.predictiveSearchUrl}.json?q=${encodeURIComponent(q)}&resources[type]=product&resources[limit]=6`;
          const res = await fetch(url);
          if (!res.ok) return;
          const data = await res.json();
          const products = data?.resources?.results?.products || [];
          if (products.length === 0) {
            dropdown.innerHTML = `<div style="padding:14px; font-size:13px; color:var(--text-muted);">No matching products found for "${q}".</div>`;
          } else {
            dropdown.innerHTML = products.map(p => `
              <a class="search-result-item" href="${p.url}">
                <img src="${p.image || ''}" alt="${p.title}">
                <div style="flex:1;">
                  <div style="font-size:13.5px; font-weight:600; color:var(--text);">${p.title}</div>
                  <div style="font-size:12px; color:var(--text-muted);"><strong>$${p.price}</strong></div>
                </div>
                <span style="font-size:12px; color:var(--accent); font-weight:600;">View →</span>
              </a>
            `).join('');
          }
          dropdown.classList.add('open');
        } catch (e) {
          console.error('Predictive search error:', e);
        }
      }, 220);
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.header-search-wrap')) dropdown.classList.remove('open');
    });
  }

  /* ---------- STEPPED AUTO COLLAGE CAROUSEL ---------- */
  function initCarousels() {
    document.querySelectorAll('[data-vm-carousel]').forEach((shell) => {
      const viewport = shell.querySelector('.collage-viewport');
      const track = shell.querySelector('.collage-track');
      const dotsEl = shell.querySelector('.collage-dots');
      const slides = track ? track.querySelectorAll('.collage-slide') : [];
      if (!viewport || !track || slides.length === 0) return;

      let page = 0;
      let totalPages = 1;
      let paused = false;
      let timer = null;
      let dragging = false;
      let startX = 0;
      let dragDelta = 0;

      const perPage = () => (window.innerWidth <= 960 ? 2 : 4);
      const pageOffset = (idx) => {
        const gap = window.innerWidth <= 960 ? 14 : 18;
        return idx * (viewport.clientWidth + gap);
      };

      const renderDots = () => {
        if (!dotsEl) return;
        dotsEl.innerHTML = Array.from({ length: totalPages }, (_, i) =>
          `<button type="button" class="collage-dot ${i === page ? 'active' : ''}" data-slide-idx="${i}" aria-label="Slide ${i + 1}"></button>`
        ).join('');
        dotsEl.querySelectorAll('.collage-dot').forEach(btn => {
          btn.addEventListener('click', () => goTo(Number(btn.dataset.slideIdx)));
        });
      };

      const apply = () => {
        track.style.transform = `translate3d(${-pageOffset(page)}px, 0, 0)`;
      };

      const startAuto = () => {
        clearInterval(timer);
        if (totalPages <= 1) return;
        timer = setInterval(() => {
          if (!paused && !dragging) {
            page = (page + 1) % totalPages;
            apply();
            renderDots();
          }
        }, 4500);
      };

      const goTo = (idx) => {
        page = (idx + totalPages) % totalPages;
        apply();
        renderDots();
        startAuto();
      };

      const recalc = () => {
        totalPages = Math.max(1, Math.ceil(slides.length / perPage()));
        if (page >= totalPages) page = 0;
        renderDots();
        apply();
      };

      shell.querySelector('[data-carousel-prev]')?.addEventListener('click', () => goTo(page - 1));
      shell.querySelector('[data-carousel-next]')?.addEventListener('click', () => goTo(page + 1));

      shell.addEventListener('mouseenter', () => { paused = true; shell.classList.add('is-paused'); });
      shell.addEventListener('mouseleave', () => { paused = false; shell.classList.remove('is-paused'); });

      viewport.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button, a')) return;
        dragging = true;
        startX = e.clientX;
        dragDelta = 0;
        track.classList.add('is-dragging');
        viewport.setPointerCapture(e.pointerId);
      });
      viewport.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        dragDelta = e.clientX - startX;
        track.style.transform = `translate3d(${-(pageOffset(page) - dragDelta)}px, 0, 0)`;
      });
      const endDrag = () => {
        if (!dragging) return;
        dragging = false;
        track.classList.remove('is-dragging');
        if (dragDelta < -50) goTo(page + 1);
        else if (dragDelta > 50) goTo(page - 1);
        else goTo(page);
      };
      viewport.addEventListener('pointerup', endDrag);
      viewport.addEventListener('pointercancel', endDrag);

      window.addEventListener('resize', recalc);
      recalc();
      startAuto();
    });
  }

  /* ---------- DEAL COUNTDOWN ---------- */
  function initDealTimer() {
    const el = document.getElementById('deal-countdown');
    if (!el) return;
    let secs = 4 * 3600 + 18 * 60 + 22;
    const tick = () => {
      const h = String(Math.floor(secs / 3600)).padStart(2, '0');
      const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
      const s = String(secs % 60).padStart(2, '0');
      el.textContent = `Ends in ${h}:${m}:${s}`;
      if (secs > 0) secs -= 1;
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- PDP INTERACTIONS ---------- */
  window.setPdpImage = function (src, thumbEl) {
    const main = document.getElementById('pdp-main-img');
    if (main) main.src = src;
    document.querySelectorAll('.pdp-thumb').forEach(t => t.classList.remove('active'));
    if (thumbEl) thumbEl.classList.add('active');
  };

  window.setDescTab = function (tab) {
    document.querySelectorAll('.pdp-desc-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.descTab === tab);
    });
    document.querySelectorAll('.pdp-desc-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `desc-panel-${tab}`);
    });
  };

  window.toggleAccordion = function (btn) {
    const item = btn.closest('.accordion-item');
    const isOpen = item.classList.contains('open');
    item.classList.toggle('open', !isOpen);
    const icon = btn.querySelector('.acc-icon');
    if (icon) icon.textContent = isOpen ? '+' : '−';
  };

  window.openMobileFilters = function () {
    document.getElementById('collection-sidebar')?.classList.add('mobile-open');
    document.getElementById('filter-backdrop')?.classList.add('open');
  };
  window.closeMobileFilters = function () {
    document.getElementById('collection-sidebar')?.classList.remove('mobile-open');
    document.getElementById('filter-backdrop')?.classList.remove('open');
  };

  /* ---------- PDP VIDEO REELS & LIGHTBOX ---------- */
  window.toggleReelPause = function (btn) {
    const card = btn.closest('.reel-card');
    const video = card.querySelector('video');
    const paused = card.classList.toggle('is-paused');
    btn.textContent = paused ? '▶' : '❚❚';
    if (video) {
      if (paused) video.pause();
      else video.play().catch(() => {});
    }
  };

  window.toggleReelMute = function (btn) {
    const card = btn.closest('.reel-card');
    const video = card.querySelector('video');
    const isMuted = btn.dataset.muted === '1';
    btn.dataset.muted = isMuted ? '0' : '1';
    btn.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
    if (video) video.muted = !isMuted;
  };

  window.openVideoLightbox = function (cardEl) {
    const modal = document.getElementById('video-modal-backdrop');
    const media = document.getElementById('video-modal-media');
    if (!modal || !media) return;

    const poster = cardEl.dataset.poster || '';
    const videoSrc = cardEl.dataset.video || '';
    media.innerHTML = videoSrc
      ? `<video autoplay loop playsinline src="${videoSrc}" poster="${poster}" style="width:100%;height:100%;object-fit:cover;"></video>`
      : `<img class="reel-motion-bg" src="${poster}" alt="" />`;

    const tagEl = document.getElementById('video-modal-tag');
    const capEl = document.getElementById('video-modal-caption');
    if (tagEl) tagEl.textContent = `${cardEl.dataset.tag || ''} · ${cardEl.dataset.creator || ''}`;
    if (capEl) capEl.textContent = cardEl.dataset.caption || '';
    modal.classList.add('open');
  };

  window.closeVideoLightbox = function () {
    const modal = document.getElementById('video-modal-backdrop');
    if (!modal) return;
    modal.classList.remove('open');
    const vid = modal.querySelector('video');
    if (vid) vid.pause();
  };

  /* ---------- NATIVE SHOPIFY PRODUCT RECOMMENDATIONS API ---------- */
  function initProductRecommendations() {
    const container = document.querySelector('[data-product-recommendations]');
    if (!container) return;
    const url = container.dataset.url;
    if (!url) return;

    fetch(url)
      .then(res => res.text())
      .then(html => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const fresh = doc.querySelector('[data-product-recommendations]');
        if (fresh && fresh.innerHTML.trim().length > 0) {
          container.innerHTML = fresh.innerHTML;
        }
      })
      .catch(err => console.error('Recommendations error:', err));
  }

  /* ---------- STICKY ATC ---------- */
  function initStickyAtc() {
    const bar = document.getElementById('sticky-atc');
    if (!bar) return;
    window.addEventListener('scroll', () => {
      bar.classList.toggle('visible', window.scrollY > 560);
    }, { passive: true });
  }

  document.addEventListener('DOMContentLoaded', () => {
    refreshCart();
    initPredictiveSearch();
    initCarousels();
    initDealTimer();
    initProductRecommendations();
    initStickyAtc();
  });
})();
