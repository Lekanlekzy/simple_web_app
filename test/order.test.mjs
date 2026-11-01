import assert from 'node:assert/strict';
import { test } from 'node:test';
import { business, gallery, menu } from '../src/catalog.js';
import {
  MAX_QUANTITY,
  normalizeCart,
  getOrderTotal,
  getOrderLines,
  createOrderMessage,
  buildWhatsAppUrl,
  usesWhatsAppShortLink,
  pickDish,
} from '../src/order.js';

test('restored baskets reject obsolete portions and invalid sizes or quantities', () => {
  assert.deepEqual(normalizeCart(null), {});
  assert.deepEqual(normalizeCart(['jollof']), {});
  assert.deepEqual(
    normalizeCart({
      jollof: 2,
      'jollof:medium': 2,
      'jollof:large': 999,
      'egusi:medium': -1,
      'ayamase:medium': 1.5,
      'meatpie:each': '2',
      'puff-puff:each': 1,
      'unknown:medium': 4,
      'jollof:each': 1,
    }),
    { 'jollof:medium': 2, 'jollof:large': MAX_QUANTITY, 'puff-puff:each': 1 },
  );
});

test('basket totals keep medium and large trays separate and snacks priced per piece', () => {
  const cart = {
    'jollof:medium': 2,
    'jollof:large': 1,
    'meatpie:each': 3,
    unknown: 30,
  };
  assert.equal(getOrderTotal(cart), 28500);
  assert.deepEqual(
    getOrderLines(cart).map((line) => [
      line.variantLabel,
      line.quantity,
      line.subtotal,
    ]),
    [
      ['Medium tray', 2, 14000],
      ['Large tray', 1, 13000],
      ['Each', 3, 1500],
    ],
  );
  assert.equal(getOrderTotal({}), 0);
  assert.equal(getOrderTotal({ 'akara:pack-10': 2 }), 4000);
  assert.equal(
    getOrderLines({ 'akara:pack-10': 2 })[0].variantLabel,
    '10 pieces',
  );
});

test('printed menu prices remain unchanged including the large Buka Stew exception', () => {
  const expected = [
    ['Jollof Rice', 70, 130],
    ['Fried Rice', 80, 150],
    ['Coconut Rice', 90, 180],
    ['Native Rice', 130, 260],
    ['White Rice', 50, 100],
    ['Rice & Beans', 50, 100],
    ['Moimoi', 60, 120],
    ['Ewa Agoyin', 100, 200],
    ['Asun Jollof', 150, 300],
    ['Beans Porridge', 85, 170],
    ['Yam Porridge', 115, 230],
    ['Asun', 170, 340],
    ['Stewed Turkey', 110, 220],
    ['Stewed Chicken', 90, 180],
    ['Stewed Goat Meat', 170, 340],
    ['Stewed Beef', 100, 200],
    ['Fried Fish', 125, 250],
    ['Plantain', 40, 80],
    ['Gizdodo', 125, 250],
    ['Goat Meat Pepper Soup', 150, 300],
    ['Cat Fish Pepper Soup', 140, 280],
    ['Tilapia Pepper Soup', 130, 260],
    ['Egusi Soup', 130, 260],
    ['Efo Riro', 130, 260],
    ['Ayamase', 130, 260],
    ['Okra Soup', 120, 240],
    ['Ofada Sauce', 130, 260],
    ['Assorted Meat Stew', 120, 240],
    ['Goat Meat Stew', 120, 240],
    ['Chicken Stew', 90, 180],
    ['Beef Stew', 110, 220],
    ['Fish Stew', 120, 240],
    ['Turkey Stew', 110, 220],
    ['Buka Stew', 120, 230],
    ['Seafood Okra', 165, 330],
    ['Akara', 20],
    ['Meat Pies', 5],
    ['Puff-Puff', 1],
  ];
  assert.deepEqual(
    menu
      .filter((item) => !['peppered-chicken', 'chicken-suya'].includes(item.id))
      .map((item) => [
        item.name,
        ...item.variants.map((variant) => variant.price / 100),
      ]),
    expected,
  );
  assert.equal(business.sampleMenu, false);
  assert.equal(business.currency, 'CAD');
});

test('confirmed chicken portions use shared prices in featured cards and basket totals', () => {
  assert.equal(menu.length, 40);
  const tray = menu.find((dish) => dish.id === 'peppered-chicken');
  const suya = menu.find((dish) => dish.id === 'chicken-suya');
  assert.deepEqual(tray.variants, [{ id: 'tray', label: 'Tray', price: 9000 }]);
  assert.deepEqual(suya.variants, [
    { id: 'stick', label: 'Per stick', price: 500 },
  ]);
  for (const dish of gallery) {
    const source = menu.find((item) => item.id === dish.id);
    assert.equal(dish.variants, source.variants);
    assert.equal(dish.image, source.image);
  }
  const cart = { 'peppered-chicken:tray': 1, 'chicken-suya:stick': 6 };
  assert.equal(getOrderTotal(cart), 12000);
  const message = createOrderMessage(cart);
  assert.match(message, /1 x Peppered Chicken \(Tray\)/);
  assert.match(message, /6 x Chicken Suya \(Per stick\)/);
  assert.match(message, /Food subtotal: \$120/);
});

test('order requests explain tray sizes, pack sizes, preferences and payment confirmation', () => {
  const message = createOrderMessage(
    { 'jollof:large': 2, 'akara:pack-10': 1, 'meatpie:each': 3 },
    {
      name: '  Guest  ',
      method: 'delivery',
      note: '  Saturday if available  ',
    },
  );
  assert.match(message, /My name is Guest/);
  assert.match(message, /2 x Jollof Rice \(Large tray\)/);
  assert.match(message, /1 x Akara \(10 pieces\)/);
  assert.match(message, /3 x Meat Pies \(Each\)/);
  assert.match(message, /Preference: Delivery/);
  assert.match(message, /Saturday if available/);
  assert.match(message, /Food subtotal: \$295/);
  assert.match(
    message,
    /confirm availability, the final price, any delivery charges/,
  );
  assert.match(message, /payment validates the order/);
  assert.match(createOrderMessage({}), /current menu/);
});

test('WhatsApp Business short links remain intact as a fallback', () => {
  const shortLink = 'https://wa.me/message/EXAMPLE';
  assert(usesWhatsAppShortLink(shortLink));
  assert.equal(buildWhatsAppUrl(shortLink, 'My custom basket'), shortLink);
  assert.equal(usesWhatsAppShortLink('+12025550147'), false);
  const numberLink = new URL(
    buildWhatsAppUrl('+1 (202) 555-0147', 'Rice & beans + a treat?'),
  );
  assert.equal(numberLink.pathname, '/12025550147');
  assert.equal(numberLink.searchParams.get('text'), 'Rice & beans + a treat?');
});

test('WhatsApp links reject missing, malformed and untrusted destinations', () => {
  for (const contact of [
    '',
    'not-a-number',
    'javascript:alert(1)',
    'http://wa.me/12345678',
    'https://example.com',
    'https://wa.me.example.com/12345678',
    'https://user:pass@wa.me/12345678',
    'https://wa.me:9000/12345678',
  ]) {
    assert.equal(buildWhatsAppUrl(contact, 'Hello'), null);
    assert.equal(usesWhatsAppShortLink(contact), false);
  }
});

test('Craving Club respects every mood and avoids an immediate repeat', () => {
  for (const mood of ['comfort', 'spicy', 'treat']) {
    const first = pickDish(mood, null, () => 0);
    assert.equal(first.mood, mood);
    const next = pickDish(mood, first.id, () => 0);
    assert.equal(next.mood, mood);
    assert.notEqual(first.id, next.id);
    assert(menu.includes(pickDish(mood, null, () => 0.99999)));
  }
  assert(pickDish('unknown-mood', null, () => 0));
});

test('configured WhatsApp ordering opens the matching number with the full basket message', () => {
  assert(business.whatsappNumber);
  assert(business.whatsappLink.startsWith('https://wa.me/message/'));
  const message = createOrderMessage(
    { 'peppered-chicken:tray': 1, 'chicken-suya:stick': 3 },
    { note: 'Friday if available' },
  );
  const url = new URL(
    buildWhatsAppUrl(business.whatsappNumber || business.whatsappLink, message),
  );
  assert.equal(url.pathname, '/' + business.whatsappNumber);
  assert.equal(url.searchParams.get('text'), message);
  assert.match(message, /Friday if available/);
  assert.match(message, /Food subtotal: \$105/);
});
