import { business, categories, gallery, menu, reviews } from './catalog.js';
import {
  MAX_QUANTITY,
  cartKey,
  normalizeCart,
  getOrderLines,
  getOrderTotal,
  formatPrice,
  createOrderMessage,
  buildWhatsAppUrl,
  pickDish,
  cravingLines,
} from './order.js';
import {
  escapeHTML,
  filterDishes,
  featuredCard,
  menuCategory,
  emptyMenu,
} from './menu.js';

export function initializeApp(window) {
  const document = window.document;
  const $ = (selector) => document.querySelector(selector);
  const storageKey = 'zaynab-cooks-basket-v2';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const contact = business.whatsappNumber || business.whatsappLink;
  let cart = {};
  let activeCategory = 'all';
  let currentMood = 'all';
  let recommendation = null;
  let toastTimer;
  let spinInterval;
  let spinTimeout;
  let spinTicket = 0;
  let spinning = false;
  let discoveries = 0;

  try {
    cart = normalizeCart(JSON.parse(window.localStorage.getItem(storageKey)));
  } catch {
    cart = {};
  }

  function showToast(message) {
    $('#toast').textContent = message;
    $('#toast').classList.add('visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(
      () => $('#toast').classList.remove('visible'),
      3600,
    );
  }

  function persistCart() {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(cart));
    } catch {
      // The basket still works when persistent storage is unavailable.
    }
  }

  function photoMarkup(item, extraClass = '') {
    if (!item.image)
      return `<div class="food-photo food-photo--symbol ${extraClass}" aria-hidden="true"><span>${item.emoji || '&#127858;'}</span></div>`;
    return `<div class="food-photo food-photo--single ${extraClass}" data-photo="${item.id}" role="img" aria-label="${escapeHTML(item.name)} from Zaynab's kitchen"></div>`;
  }

  function applyPhotos(scope = document) {
    scope.querySelectorAll('[data-photo]').forEach((element) => {
      const item = [...menu, ...gallery].find(
        (dish) => dish.id === element.dataset.photo && dish.image,
      );
      if (!item) return;
      const image = new URL(item.image, window.location.origin);
      if (
        image.origin !== window.location.origin &&
        image.protocol !== 'https:'
      )
        return;
      element.style.backgroundImage = 'url(' + JSON.stringify(image.href) + ')';
      element.style.backgroundPosition = item.imagePosition || 'center';
    });
  }

  function addToCart(id, variantId) {
    const item = menu.find((dish) => dish.id === id);
    const variant = item?.variants.find((size) => size.id === variantId);
    if (!variant) return;
    const key = cartKey(id, variantId);
    if ((cart[key] || 0) >= MAX_QUANTITY) {
      showToast(
        'Planning a bigger table? Please discuss bulk quantities with Zaynab.',
      );
      return;
    }
    cart[key] = (cart[key] || 0) + 1;
    persistCart();
    renderCart();
    showToast(
      item.name +
        ' (' +
        variant.label.toLowerCase() +
        ') added. Excellent taste!',
    );
  }

  function renderGallery() {
    $('#featured-menu').innerHTML = gallery
      .map((dish) => featuredCard(dish, photoMarkup(dish)))
      .join('');
    applyPhotos($('#featured-menu'));
  }

  function renderMenu() {
    const dishes = filterDishes(menu, activeCategory, $('#menu-search').value);
    $('#menu-result-count').textContent =
      dishes.length +
      (dishes.length === 1
        ? ' dish to fall in love with'
        : ' dishes to fall in love with');
    $('#menu-grid').innerHTML =
      categories
        .filter((category) => category.id !== 'all')
        .map((category) =>
          menuCategory(
            category,
            dishes.filter((dish) => dish.category === category.id),
          ),
        )
        .join('') || emptyMenu;
  }

  function orderMessage() {
    return createOrderMessage(cart, {
      name: $('#customer-name').value,
      method: document.querySelector('input[name="method"]:checked')?.value,
      note: $('#order-note').value,
    });
  }

  function updateOrderMessage() {
    const message = orderMessage();
    $('#order-message').textContent = message;
    const link = buildWhatsAppUrl(contact, message);
    const checkout = $('#whatsapp-checkout');
    checkout.hidden = !link;
    if (link) checkout.href = link;
    else checkout.removeAttribute('href');
    checkout.textContent = 'Order via WhatsApp';
    $('#cart-contact-pending').hidden = Boolean(link);
    $('#cart-contact-pending').textContent =
      'Please contact Zaynab to confirm your order details.';
  }

  function renderCart() {
    const lines = getOrderLines(cart);
    const count = lines.reduce((sum, item) => sum + item.quantity, 0);
    document.querySelectorAll('[data-cart-count]').forEach((element) => {
      element.textContent = count;
    });
    document
      .querySelectorAll('[data-open-cart]')
      .forEach((element) =>
        element.setAttribute(
          'aria-label',
          'Open your basket, ' + count + (count === 1 ? ' item' : ' items'),
        ),
      );
    $('#floating-basket').hidden = count === 0;
    $('#floating-basket-count').textContent = count;
    $('#floating-basket-total').textContent = formatPrice(getOrderTotal(cart));
    $('#cart-total').textContent = formatPrice(getOrderTotal(cart));
    $('#cart-total-label').textContent = 'Food subtotal';
    $('#cart-form').hidden = count === 0;
    $('#cart-footer').hidden = count === 0;
    $('#cart-items').innerHTML = lines.length
      ? lines
          .map(
            (
              item,
            ) => `<div class="cart-line">${photoMarkup(item)}<div class="cart-line-info"><h3>${escapeHTML(item.name)}</h3><p class="cart-variant">${escapeHTML(item.variantLabel)}</p><span class="cart-line-price">${formatPrice(item.subtotal)}</span><div class="quantity-controls">
    <button data-adjust="${item.key}" data-change="-1" aria-label="Decrease ${escapeHTML(item.name + ' ' + item.variantLabel)} quantity">-</button><span aria-label="Quantity">${item.quantity}</span>
    <button data-adjust="${item.key}" data-change="1" aria-label="Increase ${escapeHTML(item.name + ' ' + item.variantLabel)} quantity" ${item.quantity >= MAX_QUANTITY ? 'disabled' : ''}>+</button>
    <button class="remove-line" data-remove="${item.key}" aria-label="Remove ${escapeHTML(item.name + ' ' + item.variantLabel)}">Remove</button></div></div></div>`,
          )
          .join('')
      : '<div class="cart-empty"><span aria-hidden="true">&#9825;</span><h3>A little room for something good.</h3><p>Your happy plate is waiting to happen.</p><button class="button" data-browse-menu>Explore the menu &#8599;</button></div>';
    applyPhotos($('#cart-items'));
    updateOrderMessage();
  }

  function openDialog(dialog) {
    document.querySelectorAll('dialog[open]').forEach((other) => other.close());
    dialog.showModal();
    document.body.classList.add('dialog-open');
  }

  function browseMenu() {
    document
      .querySelectorAll('dialog[open]')
      .forEach((dialog) => dialog.close());
    $('#menu').scrollIntoView({
      behavior: reducedMotion.matches ? 'instant' : 'smooth',
    });
  }

  function openContact(message = createOrderMessage({})) {
    const link = buildWhatsAppUrl(contact, message);
    $('#contact-whatsapp').hidden = !link;
    $('#contact-whatsapp').textContent = 'Order via WhatsApp';
    $('#contact-unavailable').hidden = Boolean(link);
    if (link) $('#contact-whatsapp').href = link;
    else $('#contact-whatsapp').removeAttribute('href');
    openDialog($('#contact-dialog'));
  }

  function clearSpinTimers() {
    window.clearInterval(spinInterval);
    window.clearTimeout(spinTimeout);
    spinning = false;
  }
  function cancelSpin() {
    spinTicket += 1;
    clearSpinTimers();
  }

  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.addEventListener('close', () => {
      if (dialog.id === 'craving-dialog') cancelSpin();
      if (!document.querySelector('dialog[open]'))
        document.body.classList.remove('dialog-open');
    });
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      )
        dialog.close();
    });
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-close-dialog'))
      button.closest('dialog').close();
    if (button.hasAttribute('data-open-cart')) openDialog($('#cart-dialog'));
    if (button.hasAttribute('data-browse-menu')) browseMenu();
    if (button.dataset.add) {
      addToCart(button.dataset.add, button.dataset.variant);
      if (button.hasAttribute('data-order-now')) openDialog($('#cart-dialog'));
    }
    if (button.dataset.menuAdd) {
      const row = button.closest('[data-menu-item]');
      const variant =
        row.querySelector('[data-menu-size]')?.value ||
        button.dataset.defaultVariant;
      addToCart(button.dataset.menuAdd, variant);
    }
    if (button.hasAttribute('data-contact')) openContact();
    if (button.hasAttribute('data-catering'))
      openContact(
        "Hi Zaynab! I'm planning an occasion and would love to discuss food options, tray sizes, prices, and availability.",
      );
    if (button.hasAttribute('data-reset-menu')) {
      activeCategory = 'all';
      $('#menu-search').value = '';
      document
        .querySelectorAll('[data-filter]')
        .forEach((chip) =>
          chip.setAttribute(
            'aria-pressed',
            String(chip.dataset.filter === 'all'),
          ),
        );
      renderMenu();
    }
  });

  $('#menu-filters').innerHTML = categories
    .map(
      (category) =>
        `<button class="filter-chip" data-filter="${category.id}" aria-pressed="${category.id === 'all'}">${escapeHTML(category.name)}</button>`,
    )
    .join('');
  $('#menu-filters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    activeCategory = button.dataset.filter;
    $('#menu-filters')
      .querySelectorAll('button')
      .forEach((chip) =>
        chip.setAttribute('aria-pressed', String(chip === button)),
      );
    renderMenu();
  });
  $('#menu-search').addEventListener('input', renderMenu);

  $('#cart-items').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const key = button.dataset.adjust || button.dataset.remove;
    if (!getOrderLines(cart).some((item) => item.key === key)) return;
    if (button.dataset.remove) delete cart[key];
    else {
      const quantity = cart[key] + Number(button.dataset.change);
      if (quantity <= 0) delete cart[key];
      else cart[key] = Math.min(quantity, MAX_QUANTITY);
    }
    persistCart();
    renderCart();
    const replacement =
      button.dataset.adjust && cart[key]
        ? $('#cart-items').querySelector(
            `[data-adjust="${key}"][data-change="${button.dataset.change}"]`,
          )
        : $('#cart-items').querySelector('button');
    (replacement && !replacement.disabled
      ? replacement
      : $('#cart-items').querySelector('button')
    )?.focus({ preventScroll: true });
  });
  $('#cart-form').addEventListener('input', updateOrderMessage);
  $('#contact-explore').addEventListener('click', browseMenu);

  function littleCelebration() {
    if (reducedMotion.matches) return;
    for (let index = 0; index < 24; index += 1) {
      const piece = document.createElement('span');
      piece.className = 'confetti-piece';
      piece.style.background = ['#e8ba74', '#b85237', '#697b5c', '#efe3cf'][
        index % 4
      ];
      piece.style.setProperty('--x', (Math.random() - 0.5) * 500 + 'px');
      piece.style.setProperty('--y', Math.random() * 250 + 100 + 'px');
      piece.style.setProperty('--rotation', index * 70 + 'deg');
      $('#craving-dialog').append(piece);
      piece.addEventListener('animationend', () => piece.remove(), {
        once: true,
      });
    }
  }

  function revealRecommendation(item) {
    clearSpinTimers();
    recommendation = item;
    discoveries += 1;
    $('#craving-spinner').hidden = true;
    $('#craving-spinner').setAttribute('aria-busy', 'false');
    const lines = cravingLines[currentMood] || cravingLines.all;
    const line = lines[(discoveries - 1) % lines.length];
    const result = $('#craving-result');
    result.hidden = false;
    result.className = 'craving-result';
    result.innerHTML = `<p class="eyebrow">THE CRAVING COMMITTEE HAS SPOKEN</p><p class="craving-verdict">${escapeHTML(line)}</p>${photoMarkup(item)}<h3>${escapeHTML(item.name)}</h3><p>${escapeHTML(item.description)}</p>
    <label class="craving-size-label" for="craving-size">A little treat or a table to share?</label><select class="text-input craving-size" id="craving-size">${item.variants.map((variant) => `<option value="${variant.id}">${escapeHTML(variant.label)} - ${formatPrice(variant.price)}</option>`).join('')}</select>
    <div class="result-actions"><button class="button" data-recommendation-add>Claim my happy plate <span aria-hidden="true">+</span></button><button class="text-button" data-pick-again>Spin me another delicious idea <span aria-hidden="true">&#8635;</span></button></div>
    <button class="change-mood" data-change-mood>New mood, who dis? Pick a different craving.</button>`;
    applyPhotos(result);
    result.querySelector('select').focus({ preventScroll: true });
    littleCelebration();
  }

  function spinCraving(mood) {
    if (spinning) return;
    currentMood = mood;
    const ticket = ++spinTicket;
    const item = pickDish(mood, recommendation?.id);
    $('#mood-options').hidden = true;
    $('.craving-dialog-intro').hidden = true;
    $('#craving-result').hidden = true;
    const spinner = $('#craving-spinner');
    spinner.hidden = false;
    spinner.setAttribute('aria-busy', 'true');
    spinner.focus({ preventScroll: true });
    if (reducedMotion.matches) {
      revealRecommendation(item);
      return;
    }
    spinning = true;
    $('#spinning-emoji').textContent = item.emoji;
    $('#spinning-name').textContent = 'Something delicious...';
    $('#spin-caption').textContent = 'Consulting the craving committee...';
    const teasers = menu.filter((dish) => mood === 'all' || dish.mood === mood);
    let tick = 0;
    const captions = [
      'Consulting the craving committee...',
      'A little spice? A little comfort?',
      'Your happy plate is almost ready...',
    ];
    spinInterval = window.setInterval(() => {
      const teaser = teasers[tick % teasers.length];
      $('#spinning-emoji').textContent = teaser.emoji;
      $('#spinning-name').textContent = teaser.name;
      $('#spin-caption').textContent =
        captions[Math.min(captions.length - 1, Math.floor(tick / 3))];
      tick += 1;
    }, 160);
    spinTimeout = window.setTimeout(() => {
      if (ticket === spinTicket && $('#craving-dialog').open)
        revealRecommendation(item);
    }, 1450);
  }

  function resetCravingPicker() {
    cancelSpin();
    $('#mood-options').hidden = false;
    $('.craving-dialog-intro').hidden = false;
    $('#craving-result').hidden = true;
    $('#craving-spinner').hidden = true;
    $('#craving-dialog-title').innerHTML = "What's your <em>food mood?</em>";
    $('#mood-options').querySelector('button').focus({ preventScroll: true });
  }
  function openCravingPicker() {
    openDialog($('#craving-dialog'));
    resetCravingPicker();
  }
  $('#craving-open').addEventListener('click', openCravingPicker);
  $('#craving-wheel-open').addEventListener('click', openCravingPicker);
  $('#mood-options').addEventListener('click', (event) => {
    const button = event.target.closest('[data-mood]');
    if (button) spinCraving(button.dataset.mood);
  });
  $('#craving-result').addEventListener('click', (event) => {
    if (event.target.closest('[data-recommendation-add]')) {
      addToCart(recommendation.id, $('#craving-size').value);
      $('#craving-dialog').close();
      openDialog($('#cart-dialog'));
    }
    if (event.target.closest('[data-pick-again]')) spinCraving(currentMood);
    if (event.target.closest('[data-change-mood]')) resetCravingPicker();
  });

  $('#reviews-track').innerHTML = reviews
    .map(
      (review) =>
        `<article class="review-card"><div class="review-card-top"><span class="review-sparkles" aria-hidden="true">&#10023; &#10023; &#10023;</span><span class="review-sample">Sample review</span></div><blockquote>&ldquo;${escapeHTML(review.quote)}&rdquo;</blockquote><div class="review-person"><span class="review-avatar" aria-hidden="true">${escapeHTML(review.initials)}</span><div><strong>${escapeHTML(review.detail)}</strong><small>Room for your customer's story</small></div></div></article>`,
    )
    .join('');
  function updateReviewControls() {
    const track = $('#reviews-track');
    $('#reviews-prev').disabled = track.scrollLeft <= 2;
    $('#reviews-next').disabled =
      track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
  }
  function moveReviews(direction) {
    const track = $('#reviews-track');
    const width =
      track.querySelector('.review-card').getBoundingClientRect().width + 22;
    track.scrollBy({
      left: direction * width,
      behavior: reducedMotion.matches ? 'instant' : 'smooth',
    });
  }
  $('#reviews-prev').addEventListener('click', () => moveReviews(-1));
  $('#reviews-next').addEventListener('click', () => moveReviews(1));
  $('#reviews-track').addEventListener('scroll', updateReviewControls, {
    passive: true,
  });
  window.addEventListener('resize', updateReviewControls, { passive: true });

  $('#nav-toggle').addEventListener('click', () => {
    const expanded = $('#nav-toggle').getAttribute('aria-expanded') === 'true';
    $('#nav-toggle').setAttribute('aria-expanded', String(!expanded));
    $('#nav-toggle').setAttribute(
      'aria-label',
      expanded ? 'Open navigation' : 'Close navigation',
    );
    $('#mobile-nav').hidden = expanded;
  });
  $('#mobile-nav').addEventListener('click', (event) => {
    if (!event.target.closest('a')) return;
    $('#mobile-nav').hidden = true;
    $('#nav-toggle').setAttribute('aria-expanded', 'false');
    $('#nav-toggle').setAttribute('aria-label', 'Open navigation');
  });

  document.querySelectorAll('[data-cooking-days]').forEach((element) => {
    element.textContent = business.cookingDays;
  });
  document.querySelectorAll('[data-delivery-details]').forEach((element) => {
    element.textContent = business.deliveryDetails;
  });
  if (
    business.instagramHandle &&
    /^@?[A-Za-z0-9._]+$/.test(business.instagramHandle)
  ) {
    const handle = business.instagramHandle.replace(/^@/, '');
    const link = document.createElement('a');
    link.href = 'https://www.instagram.com/' + handle + '/';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '@' + handle;
    $('#instagram-slot').replaceWith(link);
  }
  $('#sample-label').hidden = false;
  $('#sample-label').textContent = 'MENU PRICES IN ' + business.currency;
  $('#menu-disclaimer').textContent =
    'Prices from the Zaynab Cooks menu. Tray sizes and individual snack portions are listed above. Please confirm availability, allergens, and delivery details. Payment validates your order.';
  $('#year').textContent = new Date().getFullYear();
  renderGallery();
  renderMenu();
  renderCart();
  window.requestAnimationFrame(updateReviewControls);
}
