#!/usr/bin/env node
/*
 * tests/sim.js — турнир стратегий, headless, без браузера.
 * Использует тот же engine.js, что и main.js: правила боя не дублируются.
 * Прогон валится с ненулевым кодом и точечным сообщением, если критерии
 * приёмки ТЗ №04 (раздел 3) не выполнены.
 *
 * Запуск: node tests/sim.js
 */
'use strict';

var path = require('path');
var LaneEngine = require(path.join(__dirname, '..', 'engine.js'));

// Опорное разрешение для headless-прогона: 1280×587 — десктоп-канвас после
// вычета высоты topBar и карточек юнитов из index.html (~133px суммарно).
var REF_W = 1280;
var REF_H = 587;
var DT = 1 / 30;
var MAX_TIME = 600; // громкий предохранитель от бесконечного цикла — пат

function loadBalance() {
  var p = path.join(__dirname, '..', 'balance.json');
  delete require.cache[require.resolve(p)];
  return require(p);
}

// "greedy" смотрит на еду не каждый кадр, а раз в GLANCE_S секунд — как игрок,
// поглядывающий на полоску, а не бот с рефлексом в 1/30с. Без этого «трать как
// только хватает на самого дорогого доступного» математически вырождается в
// вечный спам самого дешёвого типа (см. отчёт ТЗ №02).
var GLANCE_S = 8;

function makeGreedy(balance) {
  var order = Object.keys(balance.units).sort(function (a, b) {
    return balance.units[b].cost - balance.units[a].cost;
  });
  var sinceGlance = GLANCE_S;
  return function (engine, dt) {
    sinceGlance += dt;
    if (sinceGlance < GLANCE_S) return;
    sinceGlance = 0;
    var spent = true;
    while (spent) {
      spent = order.some(function (type) { return engine.trySpawnFood(type); });
    }
  };
}

function makeSpam(type) {
  return function () {
    return function (engine) { while (engine.trySpawnFood(type)) {} };
  };
}

// Круговая закупка: пока не хватает на текущий тип очереди — ждём, не
// перескакивая на следующий (иначе это уже не «щит, потом стрелки», а снова
// греedy). Как только хватило — покупаем и переходим к следующему типу.
function makeRotation(pattern) {
  return function () {
    var idx = 0;
    return function (engine) {
      if (engine.trySpawnFood(pattern[idx])) {
        idx = (idx + 1) % pattern.length;
      }
    };
  };
}

var PURE = ['spamA', 'spamB', 'spamC'];
var MIXED = ['mixShieldArchers', 'mixCheapArchers', 'greedy'];
var ACTIVE = PURE.concat(MIXED); // шесть активных стратегий из ТЗ №04, раздел 3
var STRATEGY_NAMES = ACTIVE.concat(['idle']);

function buildFactories(balance) {
  return {
    spamA: makeSpam('A'),
    spamB: makeSpam('B'),
    spamC: makeSpam('C'),
    mixShieldArchers: makeRotation(['C', 'B']),
    mixCheapArchers: makeRotation(['A', 'B']),
    greedy: function () { return makeGreedy(balance); },
    idle: function () { return function () {}; }
  };
}

function runStrategy(name, balance, factories) {
  var layout = LaneEngine.computeLayout(REF_W, REF_H, balance.geometry);
  var engine = LaneEngine.createEngine(balance, layout);
  var decide = factories[name]();

  var state = engine.getState();
  while (!state.over && state.timeElapsed <= MAX_TIME) {
    decide(engine, DT);
    engine.step(DT);
    state = engine.getState();
  }

  var timedOut = !state.over;
  return {
    name: name,
    result: timedOut ? 'TIMEOUT' : state.result,
    duration: state.timeElapsed,
    minPlayerBaseHpFrac: state.minPlayerBaseHp / state.playerBaseMaxHp,
    enemyHpFrac: state.enemyBaseHp / state.enemyBaseMaxHp,
    foodFullFrac: state.timeElapsed > 0 ? state.foodFullTime / state.timeElapsed : 0,
    spawnedByType: state.spawnedByType
  };
}

function fmtPct(x) { return (x * 100).toFixed(1) + '%'; }
function fmtSpawns(s) { return 'A=' + s.A + ' B=' + s.B + ' C=' + s.C; }

function printTable(runs) {
  var header = ['стратегия', 'исход', 'время,с', 'мин.HP базы', 'полоса полна', 'спавны'];
  var rows = runs.map(function (r) {
    return [
      r.name,
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
  var factories = buildFactories(balance);
  var runs = STRATEGY_NAMES.map(function (name) { return runStrategy(name, balance, factories); });
  var byName = {};
  runs.forEach(function (r) { byName[r.name] = r; });

  printTable(runs);

  var failures = [];

  // Пат: любая стратегия без исхода за MAX_TIME — провал сам по себе.
  runs.forEach(function (r) {
    if (r.result === 'TIMEOUT') {
      failures.push(r.name + ': уход в пат — нет исхода за ' + MAX_TIME + 'с (мин.HP игрока ' + fmtPct(r.minPlayerBaseHpFrac) + ', HP врага ' + fmtPct(r.enemyHpFrac) + ')');
    }
  });

  var activeRuns = runs.filter(function (r) { return ACTIVE.indexOf(r.name) !== -1; });
  var winners = activeRuns.filter(function (r) { return r.result === 'WIN'; });
  var pureWinners = winners.filter(function (r) { return PURE.indexOf(r.name) !== -1; });
  var mixedWinners = winners.filter(function (r) { return MIXED.indexOf(r.name) !== -1; });

  var bestPure = pureWinners.length ? pureWinners.reduce(function (a, b) { return a.duration <= b.duration ? a : b; }) : null;
  var bestMixed = mixedWinners.length ? mixedWinners.reduce(function (a, b) { return a.duration <= b.duration ? a : b; }) : null;

  // НИЖНЯЯ граница (главный порог этого ТЗ): не менее 3 из 6 активных
  // стратегий обязаны побеждать. Единственная выигрышная линия недопустима,
  // даже если остальные проверки зелёные.
  if (winners.length < 3) {
    failures.push(
      'НИЖНЯЯ ГРАНИЦА провалена: побеждает только ' + winners.length + ' из 6 активных стратегий (' +
      (winners.map(function (r) { return r.name; }).join(', ') || 'никто') + ') — нужно не менее 3'
    );
  }

  // ВЕРХНЯЯ граница: ни одна чистая стратегия не быстрее лучшей смешанной.
  // Если чистые вообще не побеждают, порог выполнен тривиально. Если чистая
  // побеждает, а ни одна смешанная — нет, чистая тем более «быстрее».
  if (bestPure && (!bestMixed || bestPure.duration < bestMixed.duration)) {
    failures.push(
      'ВЕРХНЯЯ ГРАНИЦА провалена: чистая ' + bestPure.name + ' (' + bestPure.duration.toFixed(1) + 'с) быстрее лучшей смешанной ' +
      (bestMixed ? bestMixed.name + ' (' + bestMixed.duration.toFixed(1) + 'с)' : '(смешанные не побеждают)')
    );
  }

  var idle = byName.idle;
  if (idle.result !== 'LOSE') {
    failures.push('idle не проиграл: исход ' + idle.result + ' (ожидалось поражение)');
  }

  winners.forEach(function (r) {
    if (r.duration < 90 || r.duration > 140) {
      failures.push('победитель ' + r.name + ': длительность ' + r.duration.toFixed(1) + 'с вне диапазона 90–140с');
    }
    if (r.foodFullFrac >= 0.15) {
      failures.push('победитель ' + r.name + ': доля времени с полной едой ' + fmtPct(r.foodFullFrac) + ' >= 15%');
    }
  });

  if (failures.length > 0) {
    console.error('\nПРОВАЛ (' + failures.length + '):');
    failures.forEach(function (f) { console.error('  - ' + f); });
    process.exit(1);
  }

  console.log('\nOK: все критерии приёмки ТЗ №04 выполнены. Побеждают ' + winners.length + ' из 6: ' +
    winners.map(function (r) { return r.name + ' ' + r.duration.toFixed(1) + 'с'; }).join(', ') + '.');
}

main();
