#!/usr/bin/env node
/*
 * tests/layout_check.js — ТЗ №09, порог 2: юнит не мельче 1/8 высоты
 * экрана в портрете (закон 7 ROADMAP.md), проверяется СКРИПТОМ по метрике
 * рендера, не глазами. Заодно проверяет три ширины из порога 1 (T-03/T-04) —
 * unitSize/laneLengthPx не должны быть вырожденными (NaN/<=0) ни на одной.
 *
 * Запуск: node tests/layout_check.js
 */
'use strict';

var path = require('path');
var LaneEngine = require(path.join(__dirname, '..', 'engine.js'));
var balance = require(path.join(__dirname, '..', 'balance.json'));

// Три ширины порога 1 (узкий/средний/широкий телефон-десктоп, T-03) + портрет
// (T-04). Высоты — типичный "канвас после вычета UI-чрома", как в tests/sim.js.
var CHECKS = [
  { label: 'узкий (360×640, landscape-ish canvas)', w: 360, h: 500 },
  { label: 'средний (768×500)', w: 768, h: 500 },
  { label: 'широкий (1280×587)', w: 1280, h: 587 },
  { label: 'портрет 9:16 (390×704)', w: 390, h: 704, requireLaw7: true }
];

var MIN_UNIT_FRACTION = 1 / 8;
var failures = [];

CHECKS.forEach(function (c) {
  var layout = LaneEngine.computeLayout(c.w, c.h, balance.geometry);
  var frac = layout.unitSize / c.h;
  var ok = frac >= MIN_UNIT_FRACTION - 1e-9;
  console.log(c.label + ': unitSize=' + layout.unitSize.toFixed(1) + 'px, доля высоты=' +
    (frac * 100).toFixed(2) + '% (нужно ≥12.50%), laneLengthPx=' + layout.laneLengthPx.toFixed(1) +
    (ok ? ' OK' : ' ПРОВАЛ'));
  if (!ok && c.requireLaw7) failures.push(c.label + ': юнит ' + (frac * 100).toFixed(2) + '% высоты экрана < 1/8 (закон 7)');
  if (layout.laneLengthPx <= 0 || isNaN(layout.laneLengthPx)) failures.push(c.label + ': длина полосы вырождена (' + layout.laneLengthPx + 'px)');
});

// unit_height_screen_fraction — единственный источник закона 7 (доля высоты
// экрана), должен буквально равняться или превышать 1/8 в самом balance.json,
// иначе закон 7 нарушается на любой геометрии, не только в тесте выше.
if (balance.geometry.unit_height_screen_fraction < MIN_UNIT_FRACTION - 1e-9) {
  failures.push('geometry.unit_height_screen_fraction=' + balance.geometry.unit_height_screen_fraction + ' < 1/8 — закон 7 нарушен по определению');
}

if (failures.length > 0) {
  console.error('\nПРОВАЛ (' + failures.length + '):');
  failures.forEach(function (f) { console.error('  - ' + f); });
  process.exit(1);
}

console.log('\nOK: закон 7 (юнит ≥1/8 высоты экрана) выполнен на портрете и всех проверенных ширинах.');
