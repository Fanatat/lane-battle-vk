#!/usr/bin/env node
/*
 * tests/sim.js — измеритель турнира стратегий (ТЗ №06, блок 3), headless.
 * Использует тот же engine.js, что и main.js: правила боя не дублируются.
 * Печатает TSV-таблицу распределения ВСЕХ партий турнира (не только да/нет)
 * и проверяет по ней критерии готовности ТЗ №06, раздел 4. Провал — точечно,
 * что именно не выполнено и по каким числам (K-11).
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
var MAX_TIME = 300; // тайм-аут партии игрового времени (ТЗ №06, дефолт #12)

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

// "counter" (ТЗ №05, фаза 2) читает то же превью следующей волны, что видит
// игрок на экране, и покупает ответ на неё — не на еду вообще, как greedy.
// База ротации — 'A','B', та же, что у mixCheapArchers: честный A/B (блок 4,
// T-09) сравнивает counter именно с mixCheapArchers, а не с greedy — это
// единственная пара, где use_preview — ЕДИНСТВЕННОЕ отличие (дефолт #15).
function makeCounter(balance) {
  var idx = 0;
  var pattern = ['A', 'B'];
  return function (engine) {
    var state = engine.getState();
    var type = state.nextWaveType;
    var count = state.nextWaveCount;

    // Превью отвечает на вопрос «нужен ли щит прямо сейчас», а не только
    // «что покупать вообще»: против одиночных и лёгких волн щит — лишний
    // расход; щит оправдан только настоящей плотной волной ближнего боя.
    // Пока копим на щит — не разменивать еду на дешёвые покупки, иначе
    // накопление до cost('C') еды никогда не случится (её перехватит A).
    if (count >= 3 && (type === 'A' || type === 'C')) {
      engine.trySpawnFood('C');
      return;
    }
    var spent = true;
    while (spent) {
      spent = engine.trySpawnFood(pattern[idx]);
      if (spent) idx = (idx + 1) % pattern.length;
    }
  };
}

var PURE = ['spamA', 'spamB', 'spamC'];
var MIXED = ['mixShieldArchers', 'mixCheapArchers', 'greedy'];
var ACTIVE = PURE.concat(MIXED); // существующие шесть стратегий турнира (дефолт #16, новых не заводим)
var SEEDS = [1, 2, 3, 4, 5, 6, 7, 8]; // дефолт #11 — зашиты константой, не рандомные
var PHASE4_EXTRA = ['counter']; // честный A/B превью — блок 4, не входит в шесть турнирных

function buildFactories(balance) {
  return {
    spamA: makeSpam('A'),
    spamB: makeSpam('B'),
    spamC: makeSpam('C'),
    mixShieldArchers: makeRotation(['C', 'B']),
    mixCheapArchers: makeRotation(['A', 'B']),
    greedy: function () { return makeGreedy(balance); },
    counter: function () { return makeCounter(balance); },
    idle: function () { return function () {}; }
  };
}

// Сид зашит константой (1…8) и передаётся в каждую партию, но текущий
// движок ПОЛНОСТЬЮ детерминирован — в рантайме нет генераторов/солверов
// (жёсткий запрет CLAUDE.md), и ни одна ветка симуляции сид не читает.
// Ввод стохастики в бой — новая система, которую раздел 6 этого ТЗ не
// решает заранее, а «Границы» запрещают заводить незаявленные системы
// самостоятельно. Поэтому 8 партий одной стратегии дают 8 побитово
// идентичных исходов; таблица всё равно печатает все 48 строк буквально
// по требованию раздела 4. Вырожденность зафиксирована здесь и в
// BLOCKERS.md, а не замаскирована псевдослучайностью на скорую руку.
function runGame(name, seed, balance, factories) {
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
  var result = timedOut ? 'TIMEOUT' : state.result;
  // «мин.HP базы победителя» (раздел 3, блок 3): для WIN — просевшая база
  // игрока, для LOSE — просевшая база врага. При TIMEOUT победителя нет.
  var winnerMinHpFrac = null;
  if (result === 'WIN') winnerMinHpFrac = state.minPlayerBaseHp / state.playerBaseMaxHp;
  else if (result === 'LOSE') winnerMinHpFrac = state.minEnemyBaseHp / state.enemyBaseMaxHp;

  return {
    name: name,
    seed: seed,
    result: result,
    duration: state.timeElapsed,
    winnerMinHpFrac: winnerMinHpFrac,
    minPlayerBaseHpFrac: state.minPlayerBaseHp / state.playerBaseMaxHp,
    enemyHpFrac: state.enemyBaseHp / state.enemyBaseMaxHp
  };
}

// Расписание бесконечно (наследие ТЗ №05): подставляем недостижимо большой
// HP базы игрока и смотрим, продолжает ли враг спавниться после 300с
// бездействия игрока. Не входит в критерий готовности ТЗ №06 (раздел 4),
// но остаётся дешёвой регрессионной проверкой того, что этот блок не сломан.
function checkEndlessSchedule(balance) {
  var patched = JSON.parse(JSON.stringify(balance));
  patched.player.base_hp = 1e9;
  var layout = LaneEngine.computeLayout(REF_W, REF_H, patched.geometry);
  var engine = LaneEngine.createEngine(patched, layout);
  var state = engine.getState();
  var countAt300 = 0;
  while (state.timeElapsed <= 320) {
    engine.step(DT);
    state = engine.getState();
    if (Math.abs(state.timeElapsed - 300) < DT) countAt300 = state.enemySpawnedCount;
  }
  return { spawnedBy300: countAt300, spawnedBy320: state.enemySpawnedCount };
}

function fmtPct(x) { return x === null ? '—' : (x * 100).toFixed(1) + '%'; }

function printTsv(rows) {
  var header = ['стратегия', 'сид', 'исход', 'мин.HP базы победителя, %', 'длительность, с'];
  console.log(header.join('\t'));
  rows.forEach(function (r) {
    console.log([r.name, r.seed, r.result, fmtPct(r.winnerMinHpFrac), r.duration.toFixed(1)].join('\t'));
  });
}

function main() {
  var balance = loadBalance();
  var factories = buildFactories(balance);

  // Турнир: 6 стратегий × 8 фиксированных сидов = 48 партий (раздел 4).
  var rows = [];
  ACTIVE.forEach(function (name) {
    SEEDS.forEach(function (seed) {
      rows.push(runGame(name, seed, balance, factories));
    });
  });

  printTsv(rows);

  var failures = [];

  // Пат/тайм-аут — провал сам по себе, для любой партии.
  rows.forEach(function (r) {
    if (r.result === 'TIMEOUT') {
      failures.push(r.name + ' сид ' + r.seed + ': тайм-аут партии (' + MAX_TIME + 'с) — нет исхода ни для одной стороны');
    }
  });

  var byStrategy = {};
  ACTIVE.forEach(function (name) { byStrategy[name] = rows.filter(function (r) { return r.name === name; }); });
  var winRate = {};
  ACTIVE.forEach(function (name) {
    var games = byStrategy[name];
    var wins = games.filter(function (r) { return r.result === 'WIN'; }).length;
    winRate[name] = wins / games.length;
  });

  // 2. НЕТ ДОМИНАНТА (порог ТЗ №03, сохраняется): ни одна чистая стратегия
  //    не побеждает быстрее лучшей смешанной.
  var pureWinDurations = rows.filter(function (r) { return PURE.indexOf(r.name) !== -1 && r.result === 'WIN'; })
    .map(function (r) { return r.duration; });
  var mixedWinDurations = rows.filter(function (r) { return MIXED.indexOf(r.name) !== -1 && r.result === 'WIN'; })
    .map(function (r) { return r.duration; });
  var bestPure = pureWinDurations.length ? Math.min.apply(null, pureWinDurations) : null;
  var bestMixed = mixedWinDurations.length ? Math.min.apply(null, mixedWinDurations) : null;
  if (bestPure !== null && (bestMixed === null || bestPure < bestMixed)) {
    failures.push(
      'НЕТ ДОМИНАНТА провалено: лучшая чистая стратегия быстрее (' + bestPure.toFixed(1) + 'с) лучшей смешанной' +
      (bestMixed !== null ? ' (' + bestMixed.toFixed(1) + 'с)' : ' (смешанные не побеждают ни разу)')
    );
  }

  // 3. НИЖНЯЯ ГРАНИЦА: не менее 3 из 6 стратегий побеждают не менее половины своих партий.
  var atLeastHalf = ACTIVE.filter(function (name) { return winRate[name] >= 0.5; });
  if (atLeastHalf.length < 3) {
    failures.push(
      'НИЖНЯЯ ГРАНИЦА провалена: не менее половины партий побеждают только ' + atLeastHalf.length +
      ' из 6 стратегий (' + (atLeastHalf.join(', ') || 'никто') + ')'
    );
  }

  var decided = rows.filter(function (r) { return r.winnerMinHpFrac !== null; });

  // 4. БИНАРНОСТИ НЕТ: не менее 19 из 48 (≥40%) партий с мин.HP базы
  //    победителя строго между 1% и 99%.
  var gradientRows = decided.filter(function (r) { return r.winnerMinHpFrac > 0.01 && r.winnerMinHpFrac < 0.99; });
  if (gradientRows.length < 19) {
    failures.push(
      'БИНАРНОСТЬ не снята: ' + gradientRows.length + ' из 48 партий с мин.HP базы победителя строго между 1% и 99% — нужно не менее 19 (40%)'
    );
  }

  // 5. КАМБЭК СУЩЕСТВУЕТ: не менее 6 партий, где мин.HP базы победителя
  //    опускался до 40% и ниже, и партия всё равно выиграна победителем.
  var comebacks = decided.filter(function (r) { return r.winnerMinHpFrac <= 0.4; });
  if (comebacks.length < 6) {
    failures.push('КАМБЭК не подтверждён: ' + comebacks.length + ' партий с мин.HP базы победителя ≤40% — нужно не менее 6');
  }

  // 6. РОЛЬ C ОБОСНОВАНА: A/B mixShieldArchers (щит+стрелок) против
  //    mixCheapArchers (боец+стрелок, тот же архетип БЕЗ щита) — разница
  //    доли побед не менее 15 п.п. в пользу стратегии со щитом.
  var withC = winRate.mixShieldArchers;
  var withoutC = winRate.mixCheapArchers;
  var cDeltaPp = (withC - withoutC) * 100;
  if (cDeltaPp < 15) {
    failures.push(
      'РОЛЬ C не обоснована: mixShieldArchers (с C, доля побед ' + fmtPct(withC) + ') против mixCheapArchers ' +
      '(без C, доля побед ' + fmtPct(withoutC) + ') — разница ' + cDeltaPp.toFixed(1) +
      ' п.п., нужно не менее 15 (см. дефолт-Б, раздел 6 п.17, и BLOCKERS.md)'
    );
  }

  // Регрессия наследия ТЗ №05 (не входит в критерий готовности раздела 4,
  // но остаётся дешёвой и информативной).
  var idle = runGame('idle', SEEDS[0], balance, factories);
  if (idle.result !== 'LOSE') {
    failures.push('idle не проиграл: исход ' + idle.result + ' (ожидалось поражение) — регрессия наследия ТЗ №04');
  }
  var endless = checkEndlessSchedule(balance);
  if (!(endless.spawnedBy320 > endless.spawnedBy300)) {
    failures.push(
      'Расписание НЕ бесконечно: спавнов к 300с=' + endless.spawnedBy300 + ', к 320с=' + endless.spawnedBy320 +
      ' — регрессия наследия ТЗ №05'
    );
  }

  // ---- Блок 4 (ТЗ №06): честная ценность превью волны — не порог, число ----
  var counter = runGame('counter', SEEDS[0], balance, factories);
  var noPreview = byStrategy.mixCheapArchers[0]; // use_preview:false вариант той же ротации A/B
  var previewLine;
  if (counter.result === 'WIN' && noPreview.result === 'WIN') {
    var speedup = (1 - counter.duration / noPreview.duration) * 100;
    previewLine = 'Ценность превью волны (блок 4, честный A/B use_preview true/false, ротация A/B): ' +
      'с превью ' + counter.duration.toFixed(1) + 'с, без превью ' + noPreview.duration.toFixed(1) +
      'с — выигрыш во времени ' + speedup.toFixed(1) + '% (порогом не является, T-09).';
  } else {
    previewLine = 'Ценность превью волны: сравнение невозможно — counter=' + counter.result +
      ', без превью (mixCheapArchers)=' + noPreview.result + ' (оба должны быть WIN).';
  }
  console.log('\n' + previewLine);

  if (failures.length > 0) {
    console.error('\nПРОВАЛ (' + failures.length + '):');
    failures.forEach(function (f) { console.error('  - ' + f); });
    process.exit(1);
  }

  console.log('\nOK: 48 партий (6×8), критерии готовности ТЗ №06 (раздел 4, пп.1-6,8) выполнены.');
}

main();
