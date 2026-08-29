#!/usr/bin/env node
/*
 * tests/sim.js — headless прогон боя четырьмя ботами, без браузера.
 * Использует тот же engine.js, что и main.js: правила боя не дублируются.
 * Прогон валится с ненулевым кодом и точечным сообщением, если критерии
 * приёмки ТЗ №02 (раздел 3) не выполнены.
 *
 * Запуск: node tests/sim.js
 */
'use strict';

var path = require('path');
var LaneEngine = require(path.join(__dirname, '..', 'engine.js'));

// Опорное разрешение для headless-прогона: 1280×587 — десктоп-канвас после
// вычета высоты topBar и карточек юнитов из index.html (~133px суммарно).
// Геометрия боя завязана на экран (см. balance.json._comment), поэтому цифры
// калиброваны под это разрешение; на другом aspect ratio секунды поплывут.
var REF_W = 1280;
var REF_H = 587;
var DT = 1 / 30;
var MAX_TIME = 600; // громкий предохранитель от бесконечного цикла

function loadBalance() {
  var p = path.join(__dirname, '..', 'balance.json');
  delete require.cache[require.resolve(p)];
  return require(p);
}

// "greedy" смотрит на еду не каждый кадр, а раз в GLANCE_S секунд — как игрок,
// поглядывающий на полоску, а не бот с рефлексом в 1/30с. Без этого «трать как
// только хватает на самого дорогого доступного» математически вырождается в
// вечный спам A (A становится доступной раньше B и C при любой частоте
// проверки < времени набора 18 еды, так что greedy ничем не отличался бы от
// spamA — а нужны они как раз разные).
// 9с — время набора B (18 еды) с нуля при production_rate=2.2/с (18/2.2≈8.2с):
// при более частом взгляде A всегда становится доступна первой и greedy
// вырождается в spamA (см. комментарий про BOT_FACTORIES ниже).
var GLANCE_S = 9;

function makeGreedy() {
  var sinceGlance = GLANCE_S;
  return function (engine, dt) {
    sinceGlance += dt;
    if (sinceGlance < GLANCE_S) return;
    sinceGlance = 0;
    var spent = true;
    while (spent) {
      spent = ['C', 'B', 'A'].some(function (type) { return engine.trySpawnFood(type); });
    }
  };
}

var BOT_FACTORIES = {
  greedy: makeGreedy,
  spamA: function () { return function (engine) { while (engine.trySpawnFood('A')) {} }; },
  spamC: function () { return function (engine) { while (engine.trySpawnFood('C')) {} }; },
  idle: function () { return function () {}; }
};

function runBot(name, balance) {
  var layout = LaneEngine.computeLayout(REF_W, REF_H, balance.geometry);
  var engine = LaneEngine.createEngine(balance, layout);
  var decide = BOT_FACTORIES[name]();

  var state = engine.getState();
  while (!state.over && state.timeElapsed <= MAX_TIME) {
    decide(engine, DT);
    engine.step(DT);
    state = engine.getState();
  }

  var timedOut = !state.over;
  return {
    bot: name,
    result: timedOut ? 'TIMEOUT' : state.result,
    duration: state.timeElapsed,
    minPlayerBaseHp: state.minPlayerBaseHp,
    minPlayerBaseHpFrac: state.minPlayerBaseHp / state.playerBaseMaxHp,
    finalEnemyBaseHpFrac: state.enemyBaseHp / state.enemyBaseMaxHp,
    foodFullFrac: state.timeElapsed > 0 ? state.foodFullTime / state.timeElapsed : 0,
    spawnedByType: state.spawnedByType
  };
}

function fmtPct(x) { return (x * 100).toFixed(1) + '%'; }
function fmtSpawns(s) { return 'A=' + s.A + ' B=' + s.B + ' C=' + s.C; }

function printTable(runs) {
  var header = ['бот', 'исход', 'время,с', 'мин.HP базы', 'полоса полна', 'спавны'];
  var rows = runs.map(function (r) {
    return [
      r.bot,
      r.result,
      r.duration.toFixed(1),
      fmtPct(r.minPlayerBaseHpFrac),
      fmtPct(r.foodFullFrac),
      fmtSpawns(r.spawnedByType)
    ];
  });
  var widths = header.map(function (h, i) {
    return Math.max(h.length, Math.max.apply(null, rows.map(function (r) { return r[i].length; })));
  });
  function line(cells) {
    return cells.map(function (c, i) { return c.padEnd(widths[i]); }).join(' | ');
  }
  console.log(line(header));
  console.log(widths.map(function (w) { return '-'.repeat(w); }).join('-+-'));
  rows.forEach(function (r) { console.log(line(r)); });
}

function main() {
  var balance = loadBalance();
  var runs = ['greedy', 'spamA', 'spamC', 'idle'].map(function (name) {
    return runBot(name, balance);
  });

  printTable(runs);

  var byName = {};
  runs.forEach(function (r) { byName[r.bot] = r; });
  var failures = [];

  var g = byName.greedy;
  if (g.result !== 'WIN') {
    failures.push('greedy не победил: исход ' + g.result + ' (ожидалась победа)');
  } else if (g.duration < 100 || g.duration > 130) {
    failures.push('greedy: длительность ' + g.duration.toFixed(1) + 'с вне диапазона 100–130с');
  }

  var i = byName.idle;
  if (i.result !== 'LOSE') {
    failures.push('idle не проиграл: исход ' + i.result + ' (ожидалось поражение)');
  }

  var c = byName.spamC;
  if (c.result === 'WIN' && g.result === 'WIN' && c.duration < g.duration * 0.9) {
    failures.push('spamC строго лучше greedy: spamC=' + c.duration.toFixed(1) + 'с против greedy=' + g.duration.toFixed(1) + 'с (более чем на 10% быстрее)');
  }

  var a = byName.spamA;
  var spamAOk = a.result === 'WIN' || a.finalEnemyBaseHpFrac <= 0.25;
  if (!spamAOk) {
    failures.push('spamA нежизнеспособен: исход ' + a.result + ', HP базы врага в конце ' + fmtPct(a.finalEnemyBaseHpFrac) + ' (нужно победить или увести ниже 25%)');
  }

  if (g.foodFullFrac >= 0.15) {
    failures.push('greedy: доля времени с полной едой ' + fmtPct(g.foodFullFrac) + ' >= 15% — дефицита нет');
  }

  if (g.minPlayerBaseHpFrac >= 0.6) {
    failures.push('greedy: минимальный HP базы игрока ' + fmtPct(g.minPlayerBaseHpFrac) + ' >= 60% — напряжения нет');
  }

  if (failures.length > 0) {
    console.error('\nПРОВАЛ (' + failures.length + '):');
    failures.forEach(function (f) { console.error('  - ' + f); });
    process.exit(1);
  }

  console.log('\nOK: все критерии приёмки ТЗ №02 выполнены.');
}

main();
