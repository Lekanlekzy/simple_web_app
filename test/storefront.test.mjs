import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';
import { initializeApp } from '../src/app.js';
import { business, menu } from '../src/catalog.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const basketKey = 'zaynab-cooks-basket-v2';

// Model browser APIs that jsdom does not implement. No network requests, browser
// layout, or real-time sleeps are involved; the production event handlers run.
function storefront(
  context,
  { basket, reducedMotion = false, corruptStorage = false } = {},
) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error.message));
  const dom = new JSDOM(html, {
    url: 'https://zaynab.example/',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  const { document } = window;
  const timers = new Map();
  let clock = 0;
  let serial = 0;
  const schedule = (callback, delay, interval = 0) => {
    const id = ++serial;
    timers.set(id, { callback, at: clock + delay, interval });
    return id;
  };
  window.setTimeout = (callback, delay = 0) => schedule(callback, delay);
  window.setInterval = (callback, delay) => schedule(callback, delay, delay);
  window.clearTimeout = window.clearInterval = (id) => timers.delete(id);
  window.requestAnimationFrame = (callback) => {
    callback(clock);
    return 0;
  };
  window.matchMedia = () => ({ matches: reducedMotion });
  window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  window.HTMLDialogElement.prototype.close = function () {
    if (!this.open) return;
    this.removeAttribute('open');
    this.dispatchEvent(new window.Event('close'));
  };
  window.HTMLElement.prototype.scrollIntoView = function (options) {
    this.lastScroll = options;
  };
  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 500,
      bottom: 500,
    });
  });

  const $ = (selector) => {
    const element = document.querySelector(selector);
    assert(element, 'Expected an element matching ' + selector);
    return element;
  };
  const all = (selector) => [...document.querySelectorAll(selector)];
  const input = (selector, value) => {
    $(selector).value = value;
    $(selector).dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  const click = (selector) => $(selector).click();
  const advance = (duration) => {
    const end = clock + duration;
    let remaining = 1000;
    while (true) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.at <= end)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (!next) break;
      assert(remaining-- > 0, 'A timer did not settle');
      const [id, timer] = next;
      clock = timer.at;
      if (timer.interval) timer.at += timer.interval;
      else timers.delete(id);
      timer.callback();
    }
    clock = end;
  };
  if (corruptStorage) window.localStorage.setItem(basketKey, '{broken json');
  else if (basket)
    window.localStorage.setItem(basketKey, JSON.stringify(basket));

  context.after(() => {
    timers.clear();
    window.close();
    assert.deepEqual(errors, [], 'The page emitted unexpected DOM errors');
  });
  initializeApp(window);
  return { window, document, $, all, input, click, advance };
}

test('the storefront renders all dishes and recovers from invalid saved basket data', (context) => {
  const page = storefront(context, { corruptStorage: true });
  assert.equal(page.all('#featured-menu .menu-card').length, 4);
  assert.equal(page.all('[data-menu-item]').length, 40);
  assert.equal(page.$('#floating-basket').hidden, true);
  assert.equal(page.$('#cart-footer').hidden, true);
  assert.match(
    page.$('#cart-items').textContent,
    /Your happy plate is waiting/,
  );
  assert.equal(page.$('#sample-label').textContent, 'MENU PRICES IN CAD');
  assert.match(page.$('#menu-disclaimer').textContent, /Payment validates/);
  assert.match(
    page.$('[data-photo="peppered-chicken"]').style.backgroundImage,
    /peppered-chicken\.jpg/,
  );
  assert.equal(page.$('[data-cooking-days]').textContent, business.cookingDays);
});

test('a restored basket keeps valid tray sizes and discards obsolete or unknown items', (context) => {
  const page = storefront(context, {
    basket: {
      'jollof:large': 2,
      'chicken-suya:stick': 3,
      jollof: 20,
      unknown: 99,
    },
  });
  assert.equal(page.all('#cart-items .cart-line').length, 2);
  assert.equal(page.$('#floating-basket-count').textContent, '5');
  assert.equal(page.$('#cart-total').textContent, '$275');
  assert.match(
    page.$('#order-message').textContent,
    /2 x Jollof Rice \(Large tray\)/,
  );
  assert.match(
    page.$('#order-message').textContent,
    /3 x Chicken Suya \(Per stick\)/,
  );
  assert.doesNotMatch(page.$('#order-message').textContent, /unknown/);
});

test('search and category filters combine, announce results, and reset an empty search', (context) => {
  const page = storefront(context);
  page.click('[data-filter="proteins"]');
  page.input('#menu-search', '  CHICKEN  ');
  assert.deepEqual(
    page.all('[data-menu-item]').map((row) => row.dataset.menuItem),
    ['stewed-chicken', 'peppered-chicken', 'chicken-suya'],
  );
  assert.match(page.$('#menu-result-count').textContent, /^3 dishes/);
  page.input('#menu-search', 'no-dish-matches-this');
  assert.equal(page.all('[data-menu-item]').length, 0);
  assert.match(page.$('#menu-grid').textContent, /No cravings found/);
  page.click('[data-reset-menu]');
  assert.equal(page.$('#menu-search').value, '');
  assert.equal(
    page.$('[data-filter="all"]').getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(page.all('[data-menu-item]').length, 40);
  page.input('#menu-search', 'Coconut Rice');
  assert.match(page.$('#menu-result-count').textContent, /^1 dish to/);
});

test('a chosen large tray and a per-stick item reach WhatsApp with exact prices and customer details', (context) => {
  const page = storefront(context);
  page.$('#portion-jollof').value = 'large';
  page.click('[data-menu-add="jollof"]');
  page.click('[data-menu-add="chicken-suya"]');
  page.click('[data-menu-add="chicken-suya"]');
  assert.equal(page.$('#cart-total').textContent, '$140');
  assert.equal(page.$('#floating-basket-count').textContent, '3');
  page.click('[data-open-cart]');
  assert(page.$('#cart-dialog').open);
  assert(page.document.body.classList.contains('dialog-open'));
  page.input('#customer-name', '  Ade  ');
  page.input('#order-note', 'Saturday pickup if available');
  page.$('input[value="delivery"]').checked = true;
  page
    .$('input[value="delivery"]')
    .dispatchEvent(new page.window.Event('input', { bubbles: true }));
  const link = new URL(page.$('#whatsapp-checkout').href);
  const message = link.searchParams.get('text');
  assert.equal(link.pathname, '/' + business.whatsappNumber);
  assert.match(message, /1 x Jollof Rice \(Large tray\) - \$130/);
  assert.match(message, /2 x Chicken Suya \(Per stick\) - \$10/);
  assert.match(message, /Food subtotal: \$140/);
  assert.match(message, /My name is Ade/);
  assert.match(message, /Preference: Delivery/);
  assert.match(message, /Saturday pickup if available/);
  assert.equal(page.$('#whatsapp-checkout').textContent, 'Order via WhatsApp');
  const saved = JSON.parse(page.window.localStorage.getItem(basketKey));
  assert.deepEqual(saved, { 'jollof:large': 1, 'chicken-suya:stick': 2 });
  page.advance(3600);
  assert(!page.$('#toast').classList.contains('visible'));
});

test('featured ordering opens the basket and quantities update totals through an empty basket', (context) => {
  const page = storefront(context);
  page.click('#featured-menu [data-add="peppered-chicken"] span');
  assert(page.$('#cart-dialog').open);
  assert.equal(page.$('#cart-total').textContent, '$90');
  page.click('[data-adjust="peppered-chicken:tray"][data-change="1"]');
  assert.equal(page.$('#cart-total').textContent, '$180');
  page.click('[data-adjust="peppered-chicken:tray"][data-change="-1"]');
  assert.equal(page.$('#cart-total').textContent, '$90');
  page.click('[data-remove="peppered-chicken:tray"]');
  assert.equal(page.$('#cart-footer').hidden, true);
  assert.equal(page.$('#floating-basket').hidden, true);
  page.click('[data-browse-menu]');
  assert.equal(page.$('#cart-dialog').open, false);
  assert.equal(page.$('#menu').lastScroll.behavior, 'smooth');
  page.click('[data-menu-add="meatpie"]');
  page.click('[data-adjust="meatpie:each"][data-change="-1"]');
  assert.equal(page.$('#cart-footer').hidden, true);
});

test('basket limits prevent oversized orders without breaking quantity controls', (context) => {
  const page = storefront(context, { basket: { 'chicken-suya:stick': 20 } });
  assert.equal(
    page.$('[data-adjust="chicken-suya:stick"][data-change="1"]').disabled,
    true,
  );
  page.click('[data-menu-add="chicken-suya"]');
  assert.equal(page.$('#cart-total').textContent, '$100');
  assert.match(page.$('#toast').textContent, /bulk quantities/);
  page.click('[data-adjust="chicken-suya:stick"][data-change="-1"]');
  assert.equal(page.$('#cart-total').textContent, '$95');
  assert.equal(
    page.$('[data-adjust="chicken-suya:stick"][data-change="1"]').disabled,
    false,
  );
});

test('customers can still build an order when browser storage is blocked', (context) => {
  const page = storefront(context);
  page.window.Storage.prototype.setItem = () => {
    throw new Error('Storage disabled');
  };
  page.click('[data-menu-add="akara"]');
  assert.equal(page.$('#cart-total').textContent, '$20');
  assert.match(page.$('#order-message').textContent, /1 x Akara \(10 pieces\)/);
});

test('contact and catering requests open the matching WhatsApp chat and dialog dismissal works', (context) => {
  const page = storefront(context, { reducedMotion: true });
  page.click('[data-contact]');
  assert(page.$('#contact-dialog').open);
  assert.match(
    new URL(page.$('#contact-whatsapp').href).searchParams.get('text'),
    /current menu/,
  );
  page.click('#contact-dialog [data-close-dialog]');
  assert.equal(page.$('#contact-dialog').open, false);
  assert.equal(page.document.body.classList.contains('dialog-open'), false);
  page.click('[data-catering]');
  assert.match(
    new URL(page.$('#contact-whatsapp').href).searchParams.get('text'),
    /planning an occasion/,
  );
  page.$('#contact-dialog').dispatchEvent(
    new page.window.MouseEvent('click', {
      bubbles: true,
      clientX: 1,
      clientY: 1,
    }),
  );
  assert.equal(
    page.$('#contact-dialog').open,
    true,
    'A click inside the dialog must leave it open',
  );
  page.$('#contact-dialog').dispatchEvent(
    new page.window.MouseEvent('click', {
      bubbles: true,
      clientX: -1,
      clientY: -1,
    }),
  );
  assert.equal(page.$('#contact-dialog').open, false);
  page.click('[data-contact]');
  page.click('#contact-explore');
  assert.equal(page.$('#menu').lastScroll.behavior, 'instant');
});

test('Craving Club spins, offers a different dish, changes mood, and orders the chosen portion', (context) => {
  const page = storefront(context);
  page.click('#craving-open');
  page.click('[data-mood="comfort"]');
  assert.equal(page.$('#craving-spinner').hidden, false);
  assert.equal(page.$('#craving-spinner').getAttribute('aria-busy'), 'true');
  page.advance(1449);
  assert.equal(page.$('#craving-result').hidden, true);
  page.advance(1);
  assert.equal(page.$('#craving-result').hidden, false);
  const firstName = page.$('#craving-result h3').textContent;
  assert.equal(menu.find((dish) => dish.name === firstName).mood, 'comfort');
  page
    .all('.confetti-piece')
    .forEach((piece) =>
      piece.dispatchEvent(new page.window.Event('animationend')),
    );
  assert.equal(page.all('.confetti-piece').length, 0);
  page.click('[data-pick-again]');
  page.advance(1450);
  assert.notEqual(page.$('#craving-result h3').textContent, firstName);
  page.click('[data-change-mood]');
  assert.equal(page.$('#mood-options').hidden, false);
  page.click('[data-mood="spicy"]');
  page.advance(1450);
  const chosen = menu.find(
    (dish) => dish.name === page.$('#craving-result h3').textContent,
  );
  assert.equal(chosen.mood, 'spicy');
  const variant = chosen.variants.at(-1);
  page.$('#craving-size').value = variant.id;
  page.click('[data-recommendation-add]');
  assert(page.$('#cart-dialog').open);
  assert.equal(page.$('#craving-dialog').open, false);
  assert.match(page.$('#order-message').textContent, new RegExp(chosen.name));
  assert(
    page.$('#order-message').textContent.includes('(' + variant.label + ')'),
  );
});

test('Craving Club respects reduced motion and cancelling a spin prevents a late result', (context) => {
  const reduced = storefront(context, { reducedMotion: true });
  reduced.click('#craving-wheel-open');
  reduced.click('[data-mood="treat"]');
  assert.equal(reduced.$('#craving-result').hidden, false);
  assert.equal(reduced.$('#craving-spinner').hidden, true);
  assert.equal(reduced.all('.confetti-piece').length, 0);
  assert.equal(
    menu.find(
      (dish) => dish.name === reduced.$('#craving-result h3').textContent,
    ).mood,
    'treat',
  );
  const animated = storefront(context);
  animated.click('#craving-open');
  animated.click('[data-mood="all"]');
  animated.advance(320);
  animated.click('#craving-dialog [data-close-dialog]');
  animated.advance(2000);
  assert.equal(animated.$('#craving-dialog').open, false);
  assert.equal(animated.$('#craving-result').hidden, true);
  animated.click('#craving-open');
  assert.equal(animated.$('#mood-options').hidden, false);
  assert.equal(animated.$('#craving-result').hidden, true);
});

test('mobile navigation closes after a link and review controls reflect the scroll position', (context) => {
  const page = storefront(context);
  page.click('#nav-toggle span');
  assert.equal(page.$('#nav-toggle').getAttribute('aria-expanded'), 'true');
  assert.equal(page.$('#mobile-nav').hidden, false);
  page.click('#mobile-nav a');
  assert.equal(page.$('#nav-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(page.$('#mobile-nav').hidden, true);
  page.click('#nav-toggle');
  page.click('#nav-toggle');
  assert.equal(page.$('#mobile-nav').hidden, true);

  const track = page.$('#reviews-track');
  Object.defineProperties(track, {
    clientWidth: { value: 320 },
    scrollWidth: { value: 866 },
  });
  page.all('.review-card').forEach((card) => {
    card.getBoundingClientRect = () => ({ width: 200 });
  });
  track.scrollBy = ({ left }) => {
    track.scrollLeft = Math.min(546, Math.max(0, track.scrollLeft + left));
    track.dispatchEvent(new page.window.Event('scroll'));
  };
  page.window.dispatchEvent(new page.window.Event('resize'));
  assert.equal(page.$('#reviews-prev').disabled, true);
  assert.equal(page.$('#reviews-next').disabled, false);
  page.click('#reviews-next');
  assert.equal(track.scrollLeft, 222);
  assert.equal(page.$('#reviews-prev').disabled, false);
  page.click('#reviews-prev');
  assert.equal(track.scrollLeft, 0);
  assert.equal(page.$('#reviews-prev').disabled, true);
  track.scrollLeft = 546;
  track.dispatchEvent(new page.window.Event('scroll'));
  assert.equal(page.$('#reviews-next').disabled, true);
});
