import { business, menu } from './catalog.js';

export const MAX_QUANTITY = 20;
export const cartKey = (id, variant) => id + ':' + variant;

export function normalizeCart(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    menu.flatMap((item) =>
      item.variants.flatMap((variant) => {
        const key = cartKey(item.id, variant.id);
        const quantity = value[key];
        return Number.isInteger(quantity) && quantity > 0
          ? [[key, Math.min(quantity, MAX_QUANTITY)]]
          : [];
      }),
    ),
  );
}

export function getOrderLines(cart) {
  const valid = normalizeCart(cart);
  return menu.flatMap((item) =>
    item.variants.flatMap((variant) => {
      const key = cartKey(item.id, variant.id);
      return valid[key]
        ? [
            {
              ...item,
              key,
              variantId: variant.id,
              variantLabel: variant.label,
              price: variant.price,
              quantity: valid[key],
              subtotal: variant.price * valid[key],
            },
          ]
        : [];
    }),
  );
}

export function getOrderTotal(cart) {
  return getOrderLines(cart).reduce((sum, item) => sum + item.subtotal, 0);
}

export function formatPrice(cents) {
  return new Intl.NumberFormat(business.locale, {
    style: 'currency',
    currency: business.currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function createOrderMessage(
  cart,
  { name = '', method = 'pickup', note = '' } = {},
) {
  const lines = getOrderLines(cart);
  if (!lines.length)
    return "Hi Zaynab! I'd love to ask about your current menu and next cooking day.";
  return [
    'Hi Zaynab! I have a little craving.',
    name.trim() ? 'My name is ' + name.trim() + '.' : '',
    '',
    'Here is my order request:',
    ...lines.map(
      (item) =>
        '- ' +
        item.quantity +
        ' x ' +
        item.name +
        ' (' +
        item.variantLabel +
        ') - ' +
        formatPrice(item.subtotal),
    ),
    '',
    'Food subtotal: ' + formatPrice(getOrderTotal(cart)),
    'Preference: ' + (method === 'delivery' ? 'Delivery' : 'Pickup'),
    note.trim() ? 'A little note: ' + note.trim() : '',
    '',
    'Please confirm availability, the final price, any delivery charges, and the pickup or delivery time.',
    'I understand payment validates the order. Please share payment details after confirming availability. Thank you!',
  ].join('\n');
}

function parseContact(contact) {
  const value = String(contact || '').trim();
  if (!value) return null;
  if (/^https:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (
        !['wa.me', 'api.whatsapp.com', 'web.whatsapp.com'].includes(
          url.hostname,
        )
      )
        return null;
      if (url.username || url.password || url.port) return null;
      return url;
    } catch {
      return null;
    }
  }
  const digits = value.replace(/[\s()+-]/g, '');
  return /^[1-9][0-9]{7,14}$/.test(digits)
    ? new URL('https://wa.me/' + digits)
    : null;
}

export function usesWhatsAppShortLink(contact) {
  const url = parseContact(contact);
  return Boolean(url && /^\/message\//.test(url.pathname));
}

export function buildWhatsAppUrl(contact, message) {
  const url = parseContact(contact);
  if (!url) return null;
  // Number links carry a prefilled order. Preserve Business short links as a fallback.
  if (!usesWhatsAppShortLink(contact)) url.searchParams.set('text', message);
  return url.href;
}

export function pickDish(mood, previousId = null, random = Math.random) {
  let candidates = menu.filter((item) => mood === 'all' || item.mood === mood);
  if (!candidates.length) candidates = menu;
  if (candidates.length > 1)
    candidates = candidates.filter((item) => item.id !== previousId);
  return candidates[
    Math.min(
      candidates.length - 1,
      Math.max(0, Math.floor(random() * candidates.length)),
    )
  ];
}

export const cravingLines = {
  comfort: [
    'A little taste of home has entered the chat.',
    'Comfort level: extra spoonful.',
    'Your happy place comes on a plate.',
  ],
  spicy: [
    'Your taste buds have main-character energy.',
    'A little heat. A very big yes.',
    'Bold flavours. Excellent decisions.',
  ],
  treat: [
    'A small treat is a very big mood.',
    'One for you. Maybe one more for you.',
    'A little snack break? Excellent idea.',
  ],
  all: [
    'The craving committee has excellent taste.',
    'A happy plate has chosen you.',
    'Your next food crush is here.',
  ],
};
