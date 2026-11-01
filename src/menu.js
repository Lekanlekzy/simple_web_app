import { formatPrice } from './order.js';

export const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character],
  );

export function filterDishes(dishes, category = 'all', search = '') {
  const query = search.trim().toLocaleLowerCase();
  return dishes.filter(
    (dish) =>
      (category === 'all' || dish.category === category) &&
      (dish.name + ' ' + dish.description).toLocaleLowerCase().includes(query),
  );
}

export function featuredCard(dish, photo) {
  const variant = dish.variants[0];
  return `<article class="menu-card">
    <div class="card-image-wrap">${photo}<span class="photo-label">FROM ZAYNAB'S KITCHEN</span></div>
    <div class="card-content"><div class="card-meta"><span class="dish-label">${escapeHTML(dish.label)}</span></div>
      <h3>${escapeHTML(dish.name)}</h3><p>${escapeHTML(dish.description)}</p>
      <div class="card-bottom"><span class="card-price">${formatPrice(variant.price)}<small>${escapeHTML(variant.label.toUpperCase())}</small></span>
        <button class="card-add" data-add="${dish.id}" data-variant="${variant.id}" data-order-now aria-label="Order ${escapeHTML(dish.name + ', ' + variant.label)}">Order now <span aria-hidden="true">+</span></button>
      </div>
    </div>
  </article>`;
}

function menuItem(dish) {
  const single = dish.variants.length === 1;
  const portion = single
    ? `<div class="menu-item-portion"><span>${escapeHTML(dish.variants[0].label)}</span><strong>${formatPrice(dish.variants[0].price)}</strong></div>`
    : `<select class="menu-portion-select" id="portion-${dish.id}" data-menu-size aria-label="Choose a portion for ${escapeHTML(dish.name)}">${dish.variants.map((variant) => `<option value="${variant.id}">${escapeHTML(variant.label)} &middot; ${formatPrice(variant.price)}</option>`).join('')}</select>`;
  return `<div class="menu-item" data-menu-item="${dish.id}">
    <h4>${escapeHTML(dish.name)}</h4>${portion}
    <button class="menu-add-button" data-menu-add="${dish.id}" data-default-variant="${dish.variants[0].id}" aria-label="Add ${escapeHTML(dish.name)} to your order"><span aria-hidden="true">+</span> Add to order</button>
  </div>`;
}

export function menuCategory(category, dishes) {
  if (!dishes.length) return '';
  return `<section class="menu-group" aria-labelledby="category-${category.id}">
    <header class="menu-group-heading"><h3 id="category-${category.id}">${escapeHTML(category.name)}</h3><span>${dishes.length} ${dishes.length === 1 ? 'dish' : 'dishes'}</span></header>
    <div class="menu-group-items">${dishes.map(menuItem).join('')}</div>
  </section>`;
}

export const emptyMenu =
  '<div class="menu-no-results"><h3>No cravings found... yet.</h3><p>Try jollof, chicken, soup, or a little treat.</p><button class="text-button" data-reset-menu>Show me all the good stuff &#8599;</button></div>';
