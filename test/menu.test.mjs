import assert from 'node:assert/strict';
import { test } from 'node:test';
import { menu } from '../src/catalog.js';
import { filterDishes } from '../src/menu.js';

test('menu search combines a category with case-insensitive, trimmed food names', () => {
  const chicken = filterDishes(menu, 'proteins', '  CHICKEN  ');
  assert.deepEqual(
    chicken.map((dish) => dish.id),
    ['stewed-chicken', 'peppered-chicken', 'chicken-suya'],
  );
  assert.equal(filterDishes(menu).length, 40);
  assert.equal(filterDishes(menu, 'mains', 'chicken suya').length, 0);
  assert.equal(filterDishes(menu, 'all', 'nothing-matches-this').length, 0);
});
