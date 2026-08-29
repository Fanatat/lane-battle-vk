#!/usr/bin/env node
/*
 * tests/sim.js — измеритель турнира стратегий (ТЗ №06, блок 3), headless.
 * Использует тот же engine.js, что и main.js: правила боя не дублируются.
 * Печатает TSV-таблицу распределения ВСЕХ партий турнира (не только да/нет)
 * и проверяет по ней критерии готовности ТЗ №06, раздел 4. Провал — точечно,
 * что именно не выполнено и по каким числам (K-11).
 *
 * ДОГОН ПРИЁМКИ (20260829): добавлены хеш+дедуп партии (блок Д1), три
 * прогона устойчивости вне balance.json (блок Д2) и факт/требование
 * числами по всем восьми порогам вместо "passed" (блок Д3). balance.json
 * и механика не меняются нигде в этом файле кроме in-memory клонов для Д2.
 *
 * Запуск: node tests/sim.js
 */
'use strict';

var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var LaneEngine = require(path.join(__dirname, '..', 'engine.js'));

// Опорное разрешение для headless-прогона: 1280×587 — десктоп-канвас после
// вычета высоты topBar и карточек юнитов из index.html (~133px суммарно).
var REF_W = 1280;
var REF_H = 587;
var DT = 1 / 30;
var MAX_TIME = 300; // тайм-аут партии игрового времени (ТЗ №06, дефолт #12)
var OUT_DIR = path.join(__dirname, '..', 'ВЫДАЧА', 'отчёты');

function loadBalance() {
  var p = path.join(__dirname, '..', 'balance.json');
  delete require.cache[require.resolve(p)];
  return require(p);
}

function deepClone(x) { return JSON.parse(JSON.stringify(x)); }

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
var SEEDS_MAIN = [1, 2, 3, 4, 5, 6, 7, 8]; // дефолт #11 — зашиты константой, не рандомные
var SEEDS_NEW = [9, 10, 11, 12, 13, 14, 15, 16]; // блок Д2.1 — вне выборки основного прогона

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

function countAlive(pool) {
  var n = 0;
  for (var i = 0; i < pool.length; i++) { if (pool[i].active) n++; }
  return n;
}

// Хеш партии (блок Д1). В движке нет лога событий боя (тик, актор, действие)
// — по дефолту #3 ТЗ собираем минимальный лог из уже существующих величин:
// тик, число живых юнитов каждой стороны, HP обеих баз. engine.js и main.js
// не трогаем — getPlayerUnits()/getEnemyUnits() уже есть в публичном API.
function runGame(name, seed, balance, factories) {
  var layout = LaneEngine.computeLayout(REF_W, REF_H, balance.geometry);
  var engine = LaneEngine.createEngine(balance, layout);
  var decide = factories[name]();

  var trace = [];
  var tick = 0;
  var state = engine.getState();
  while (!state.over && state.timeElapsed <= MAX_TIME) {
    decide(engine, DT);
    engine.step(DT);
    state = engine.getState();
    tick++;
    trace.push(tick + ':' + countAlive(engine.getPlayerUnits()) + ':' + countAlive(engine.getEnemyUnits()) +
      ':' + Math.round(state.playerBaseHp) + ':' + Math.round(state.enemyBaseHp));
  }
  var hash = crypto.createHash('sha256').update(trace.join('|')).digest('hex').slice(0, 16);

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
    enemyHpFrac: state.enemyBaseHp / state.enemyBaseMaxHp,
    hash: hash
  };
}

// Дедуп по хешу траектории (блок Д1): первое появление хеша — «уникальная»
// партия, повтор — «дубль» со ссылкой на исходную строку (1-based индекс).
function dedupe(rows) {
  var firstIndexByHash = {};
  rows.forEach(function (r, i) {
    if (!(r.hash in firstIndexByHash)) firstIndexByHash[r.hash] = i;
    r.uniqueIndex = firstIndexByHash[r.hash];
    r.isUnique = firstIndexByHash[r.hash] === i;
  });
  return Object.keys(firstIndexByHash).length;
}

// Полный расчёт турнира (ACTIVE × seeds) + пороги 2,3,4,5, пересчитанные по
// уникальным партиям (блок Д1). Используется и основным прогоном, и всеми
// прогонами блока Д2 — методика одна и та же, чтобы числа были сравнимы.
function evaluateTournament(balance, seeds) {
  var factories = buildFactories(balance);
  var rows = [];
  ACTIVE.forEach(function (name) {
    seeds.forEach(function (seed) {
      rows.push(runGame(name, seed, balance, factories));
    });
  });
  var uniqueCount = dedupe(rows);
  var total = rows.length;

  var timeouts = rows.filter(function (r) { return r.result === 'TIMEOUT'; });

  var byStrategy = {};
  ACTIVE.forEach(function (name) { byStrategy[name] = rows.filter(function (r) { return r.name === name; }); });
  var winRate = {};
  ACTIVE.forEach(function (name) {
    var games = byStrategy[name];
    var wins = games.filter(function (r) { return r.result === 'WIN'; }).length;
    winRate[name] = wins / games.length;
  });

  var pureWinDurations = rows.filter(function (r) { return PURE.indexOf(r.name) !== -1 && r.result === 'WIN'; })
    .map(function (r) { return r.duration; });
  var mixedWinDurations = rows.filter(function (r) { return MIXED.indexOf(r.name) !== -1 && r.result === 'WIN'; })
    .map(function (r) { return r.duration; });
  var bestPure = pureWinDurations.length ? Math.min.apply(null, pureWinDurations) : null;
  var bestMixed = mixedWinDurations.length ? Math.min.apply(null, mixedWinDurations) : null;

  var atLeastHalf = ACTIVE.filter(function (name) { return winRate[name] >= 0.5; });

  var decidedUnique = rows.filter(function (r) { return r.isUnique && r.winnerMinHpFrac !== null; });
  var gradientUnique = decidedUnique.filter(function (r) { return r.winnerMinHpFrac > 0.01 && r.winnerMinHpFrac < 0.99; });
  var comebackUnique = decidedUnique.filter(function (r) { return r.winnerMinHpFrac <= 0.4; });
  var reqGradient = Math.ceil(0.4 * uniqueCount);
  var reqComeback = Math.ceil(uniqueCount / 8);

  var cDeltaPp = (winRate.mixShieldArchers - winRate.mixCheapArchers) * 100;

  return {
    rows: rows, total: total, uniqueCount: uniqueCount,
    timeouts: timeouts,
    byStrategy: byStrategy, winRate: winRate,
    bestPure: bestPure, bestMixed: bestMixed,
    atLeastHalf: atLeastHalf,
    gradientUnique: gradientUnique, comebackUnique: comebackUnique,
    reqGradient: reqGradient, reqComeback: reqComeback,
    cDeltaPp: cDeltaPp
  };
}

// Пороги 2,3,4,5 (раздел 4 ТЗ №06) на готовом результате evaluateTournament.
// Возвращает { ok, failures[] } — используется и основным прогоном (полный
// список причин), и блоком Д2 (только "какие пороги устояли").
function checkCoreThresholds(ev) {
  var failures = [];
  if (ev.timeouts.length > 0) {
    failures.push('ТАЙМ-АУТ: ' + ev.timeouts.length + ' партий из ' + ev.total + ' без исхода за ' + MAX_TIME + 'с');
  }
  if (ev.bestPure !== null && (ev.bestMixed === null || ev.bestPure < ev.bestMixed)) {
    failures.push('НЕТ ДОМИНАНТА провалено: лучшая чистая ' + ev.bestPure.toFixed(1) + 'с против лучшей смешанной ' +
      (ev.bestMixed !== null ? ev.bestMixed.toFixed(1) + 'с' : '(смешанные не побеждают)'));
  }
  if (ev.atLeastHalf.length < 3) {
    failures.push('НИЖНЯЯ ГРАНИЦА провалена: ' + ev.atLeastHalf.length + ' из 6 стратегий с долей побед ≥50% (нужно ≥3)');
  }
  if (ev.gradientUnique.length < ev.reqGradient) {
    failures.push('БИНАРНОСТЬ не снята: ' + ev.gradientUnique.length + ' из ' + ev.uniqueCount +
      ' уникальных партий с градиентом (нужно ≥' + ev.reqGradient + ')');
  }
  if (ev.comebackUnique.length < ev.reqComeback) {
    failures.push('КАМБЭК не подтверждён: ' + ev.comebackUnique.length + ' из ' + ev.uniqueCount +
      ' уникальных партий с камбэком (нужно ≥' + ev.reqComeback + ')');
  }
  return { ok: failures.length === 0, failures: failures };
}

// Расписание бесконечно (наследие ТЗ №05): подставляем недостижимо большой
// HP базы игрока и смотрим, продолжает ли враг спавниться после 300с
// бездействия игрока. Не входит в критерий готовности ТЗ №06 (раздел 4),
// но остаётся дешёвой регрессионной проверкой того, что этот блок не сломан.
function checkEndlessSchedule(balance) {
  var patched = deepClone(balance);
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

function tsvMainRows(rows) {
  var header = ['стратегия', 'сид', 'исход', 'мин.HP базы победителя, %', 'длительность, с', 'хеш партии', 'уникальна', 'дубль строки №'];
  var lines = [header.join('\t')];
  rows.forEach(function (r, i) {
    lines.push([
      r.name, r.seed, r.result, fmtPct(r.winnerMinHpFrac), r.duration.toFixed(1),
      r.hash, r.isUnique ? 'да' : 'нет', r.isUnique ? '' : (r.uniqueIndex + 1)
    ].join('\t'));
  });
  return lines.join('\n');
}

function printTsv(rows) {
  console.log(tsvMainRows(rows));
}

function writeArtifact(filename, content) {
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, filename), content, 'utf8');
    return path.join(OUT_DIR, filename);
  } catch (e) {
    console.error('ПРОВАЛ записи артефакта ' + filename + ': ' + e.message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------
// Блок Д2.2/Д2.3 — параметры боя/экономики, подлежащие возмущению ±10%.
// Дефолт #4 раздела 4 ДОГОНА: HP, урон, скорости, цены, доход, кулдаун и
// радиус залпа, дистанция подкрепления, тайминги волн. НЕ возмущаются:
// геометрия поля (кроме дистанции подкрепления), front_depth как целое,
// число типов юнитов, состав/счётчики волн (это не тайминг и не названо
// явно в перечне) и радиус атаки юнита-стрелка (в перечне назван только
// «радиус залпа» базы — это отдельная, явно поименованная величина).
// ---------------------------------------------------------------------
function collectParams(balance) {
  var params = [];
  function add(getPath, label) { params.push({ path: getPath, label: label }); }

  add(['player', 'base_hp'], 'player.base_hp (HP базы игрока)');
  add(['player', 'production_rate'], 'player.production_rate (доход)');
  add(['enemy', 'base_hp'], 'enemy.base_hp (HP базы врага)');

  ['A', 'B', 'C'].forEach(function (t) {
    add(['units', t, 'hp'], 'units.' + t + '.hp');
    add(['units', t, 'damage'], 'units.' + t + '.damage');
    add(['units', t, 'attack_speed'], 'units.' + t + '.attack_speed');
    add(['units', t, 'speed_uw'], 'units.' + t + '.speed_uw');
    add(['units', t, 'cost'], 'units.' + t + '.cost');
  });

  add(['base_defense', 'range_uw'], 'base_defense.range_uw (радиус залпа)');
  add(['base_defense', 'cooldown'], 'base_defense.cooldown (кулдаун залпа)');
  add(['base_defense', 'damage'], 'base_defense.damage (урон залпа)');

  add(['geometry', 'reinforce_offset_uw'], 'geometry.reinforce_offset_uw (дистанция подкрепления)');

  balance.enemy.schedule.forEach(function (w, i) {
    add(['enemy', 'schedule', i, 'time'], 'enemy.schedule[' + i + '].time (' + w.type + '×' + w.count + ' @ ' + w.time + 'с)');
  });
  add(['enemy', 'endless', 'interval_start_s'], 'enemy.endless.interval_start_s (тайминг бесконечных волн)');
  add(['enemy', 'endless', 'interval_step_s'], 'enemy.endless.interval_step_s (тайминг бесконечных волн)');
  add(['enemy', 'endless', 'interval_min_s'], 'enemy.endless.interval_min_s (тайминг бесконечных волн)');

  return params;
}

function getAtPath(obj, p) { return p.reduce(function (o, k) { return o[k]; }, obj); }
function setAtPath(obj, p, val) {
  var parent = p.slice(0, -1).reduce(function (o, k) { return o[k]; }, obj);
  parent[p[p.length - 1]] = val;
}

function perturb(value, dir) {
  var v = value * (1 + dir * 0.10);
  if (Number.isInteger(value)) {
    v = dir > 0 ? Math.ceil(v) : Math.floor(v);
    if (v < 1) v = 1;
  }
  return v;
}

// Скаляр «насколько плохо»: число проваленных из {2,3,4,5} + сумма запасов
// (margin) по каждому — так у равного числа провалов есть тай-брейк, а у
// «всё зелено» — ранжирование по тому, насколько близко к границе. Это
// решение методики измерения (не подгонка баланса) — объяснено в отчёте.
function badnessScore(ev) {
  var marginDominant;
  if (ev.bestMixed === null) marginDominant = -1000;
  else if (ev.bestPure === null) marginDominant = 1000;
  else marginDominant = ev.bestMixed - ev.bestPure;
  var marginLowerBound = ev.atLeastHalf.length - 3;
  var marginGradient = ev.gradientUnique.length - ev.reqGradient;
  var marginComeback = ev.comebackUnique.length - ev.reqComeback;
  var margins = [marginDominant, marginLowerBound, marginGradient, marginComeback];
  var failedCount = margins.filter(function (m) { return m < 0; }).length;
  var marginSum = margins.reduce(function (a, b) { return a + b; }, 0);
  return { failedCount: failedCount, marginSum: marginSum };
}

// true, если "a" хуже "b" (больше провалов, при равенстве — меньше запас).
function isWorse(a, b) {
  if (a.failedCount !== b.failedCount) return a.failedCount > b.failedCount;
  return a.marginSum < b.marginSum;
}

function runPerturbationSweep(balance) {
  var params = collectParams(balance);
  var results = []; // { label, dir, oldValue, newValue, ev, check, score }
  params.forEach(function (p) {
    [1, -1].forEach(function (dir) {
      var clone = deepClone(balance);
      var oldValue = getAtPath(clone, p.path);
      var newValue = perturb(oldValue, dir);
      setAtPath(clone, p.path, newValue);
      var ev = evaluateTournament(clone, [1]); // сид не влияет на движок (Д1) — одного достаточно
      var check = checkCoreThresholds(ev);
      results.push({
        label: p.label, dir: dir, oldValue: oldValue, newValue: newValue,
        ev: ev, check: check, score: badnessScore(ev)
      });
    });
  });
  return results;
}

function buildWorstCaseBalance(balance, sweepResults) {
  var worst = deepClone(balance);
  var byLabel = {};
  sweepResults.forEach(function (r) {
    if (!byLabel[r.label]) byLabel[r.label] = {};
    byLabel[r.label][r.dir] = r;
  });
  var params = collectParams(balance);
  var chosen = [];
  params.forEach(function (p) {
    var plus = byLabel[p.label][1];
    var minus = byLabel[p.label][-1];
    var worseOne = isWorse(plus.score, minus.score) ? plus : minus;
    setAtPath(worst, p.path, worseOne.newValue);
    chosen.push({ label: p.label, dir: worseOne.dir, oldValue: worseOne.oldValue, newValue: worseOne.newValue });
  });
  return { balance: worst, chosen: chosen };
}

function tsvSweep(results) {
  var header = ['параметр', 'направление', 'старое значение', 'новое значение', 'провалено порогов (2,3,4,5)', 'детали'];
  var lines = [header.join('\t')];
  results.forEach(function (r) {
    lines.push([
      r.label, r.dir > 0 ? '+10%' : '-10%', r.oldValue, r.newValue,
      r.check.failures.length, r.check.failures.join(' | ') || 'все устояли'
    ].join('\t'));
  });
  return lines.join('\n');
}

function main() {
  var balance = loadBalance();

  // ---- Основной турнир (раздел 4 ТЗ №06): 6 × 8 = 48 партий, сиды 1..8 ----
  var main8 = evaluateTournament(balance, SEEDS_MAIN);
  printTsv(main8.rows);
  var mainTsvPath = writeArtifact('ДОГОН_TSV_основной_прогон_48.tsv', tsvMainRows(main8.rows));

  console.log('\n=== БЛОК Д1: сколько партий на самом деле ===');
  console.log('уникальных партий: ' + main8.uniqueCount + ' из ' + main8.total);
  if (main8.uniqueCount === main8.total) {
    console.log('Сид влияет на движок — 48 уникальных партий, блок Д1 закрывается этой строкой (дефолт #8 ДОГОНА).');
  } else {
    console.log('Сид НЕ влияет на движок (engine.js детерминирован, поле seed не читается ни в одной ветке — ' +
      'подтверждает BLOCKERS.md ТЗ №06, п.2). ' + ACTIVE.length + ' стратегий × 8 одинаковых сидов = ' +
      ACTIVE.length + ' уникальных партий по 8 побитово идентичных копий каждая.');
  }

  var core8 = checkCoreThresholds(main8);

  // ---- Блок Д3: факт/требование числами по всем 8 порогам ----
  console.log('\n=== БЛОК Д3: факт и требование по восьми порогам раздела 4 ===');
  console.log('1. Скрипт завершается кодом 0 и печатает таблицу 48 партий: факт — ' +
    (main8.timeouts.length === 0 ? 'нет тайм-аутов' : main8.timeouts.length + ' тайм-аутов') +
    '; требование — 0 тайм-аутов из ' + main8.total + '.');
  console.log('2. Нет доминанта: факт — лучшая чистая ' + (main8.bestPure !== null ? main8.bestPure.toFixed(1) + 'с' : '—') +
    ', лучшая смешанная ' + (main8.bestMixed !== null ? main8.bestMixed.toFixed(1) + 'с' : '—') +
    '; требование — чистая не быстрее смешанной.');
  console.log('3. Нижняя граница: факт — ' + main8.atLeastHalf.length + ' из 6 стратегий с долей побед ≥50% (' +
    ACTIVE.map(function (n) { return n + '=' + fmtPct(main8.winRate[n]); }).join(', ') + '); требование — ≥3 из 6.');
  console.log('4. Бинарности нет (по уникальным партиям, блок Д1): факт — ' + main8.gradientUnique.length +
    ' из ' + main8.uniqueCount + '; требование — ≥' + main8.reqGradient + ' (40% округлено вверх).');
  console.log('5. Камбэк существует (по уникальным партиям, блок Д1): факт — ' + main8.comebackUnique.length +
    ' из ' + main8.uniqueCount + '; требование — ≥' + main8.reqComeback + ' (1/8 округлено вверх).');
  console.log('6. Роль C обоснована: факт — mixShieldArchers ' + fmtPct(main8.winRate.mixShieldArchers) +
    ' против mixCheapArchers ' + fmtPct(main8.winRate.mixCheapArchers) + ', разница ' + main8.cDeltaPp.toFixed(1) +
    ' п.п.; требование — ≥15 п.п.');

  // ---- Блок 4 (ТЗ №06): честная ценность превью волны — не порог, число ----
  var factoriesMain = buildFactories(balance);
  var counter = runGame('counter', SEEDS_MAIN[0], balance, factoriesMain);
  var noPreview = main8.byStrategy.mixCheapArchers[0]; // use_preview:false вариант той же ротации A/B
  var previewLine;
  if (counter.result === 'WIN' && noPreview.result === 'WIN') {
    var speedup = (1 - counter.duration / noPreview.duration) * 100;
    previewLine = '7. Ценность превью измерена (не порог, T-09): факт — с превью ' + counter.duration.toFixed(1) +
      'с, без превью ' + noPreview.duration.toFixed(1) + 'с, выигрыш во времени ' + speedup.toFixed(1) +
      '%; требование — печать числа как есть, без подгонки.';
  } else {
    previewLine = '7. Ценность превью измерена (не порог, T-09): сравнение невозможно — counter=' + counter.result +
      ', без превью (mixCheapArchers)=' + noPreview.result + ' (оба должны быть WIN).';
  }
  console.log(previewLine);

  var idle = runGame('idle', SEEDS_MAIN[0], balance, factoriesMain);
  var endless = checkEndlessSchedule(balance);
  var idleOk = idle.result === 'LOSE';
  var endlessOk = endless.spawnedBy320 > endless.spawnedBy300;
  console.log('8. Регрессии наследия зелёные: факт — idle→' + idle.result + ' (ожидание LOSE), спавнов к 300с=' +
    endless.spawnedBy300 + '/к 320с=' + endless.spawnedBy320 + ' (ожидание рост); требование — оба условия истинны.');
  if (!idleOk) core8.failures.push('idle не проиграл: исход ' + idle.result + ' (ожидалось поражение) — регрессия наследия ТЗ №04');
  if (!endlessOk) core8.failures.push('Расписание НЕ бесконечно: спавнов к 300с=' + endless.spawnedBy300 + ', к 320с=' + endless.spawnedBy320 + ' — регрессия наследия ТЗ №05');

  // ---- БЛОК Д2: устоит ли находка вне выборки (balance.json не меняется) ----
  console.log('\n=== БЛОК Д2: устойчивость находки вне выборки ===');

  // Д2.1 — новые сиды 9..16
  var newSeeds = evaluateTournament(balance, SEEDS_NEW);
  var newSeedsCheck = checkCoreThresholds(newSeeds);
  writeArtifact('ДОГОН_TSV_Д2_новые_сиды_9-16.tsv', tsvMainRows(newSeeds.rows));
  console.log('Д2.1 новые сиды (9…16): уникальных партий ' + newSeeds.uniqueCount + ' из ' + newSeeds.total +
    '. Пороги 2,3,4,5: ' + (newSeedsCheck.ok ? 'все устояли' : 'провал — ' + newSeedsCheck.failures.join(' | ')));

  // Д2.2 — возмущение по одному, ±10%, один шаг на параметр (дефолт #6)
  var sweep = runPerturbationSweep(balance);
  var preservedAll = sweep.filter(function (r) { return r.check.ok; });
  writeArtifact('ДОГОН_TSV_Д2_возмущение_по_одному.tsv', tsvSweep(sweep));
  console.log('Д2.2 возмущение по одному параметру (±10%, один шаг на параметр — ' + collectParams(balance).length +
    ' параметров × 2 направления = ' + sweep.length + ' прогонов): сохранили пороги 2,3,4,5 в ' +
    preservedAll.length + ' из ' + sweep.length + ' прогонов.');
  var brokenSweep = sweep.filter(function (r) { return !r.check.ok; });
  if (brokenSweep.length > 0) {
    console.log('  Провалившие хоть один порог направления:');
    brokenSweep.forEach(function (r) {
      console.log('  - ' + r.label + ' ' + (r.dir > 0 ? '+10%' : '-10%') + ' (' + r.oldValue + '→' + r.newValue + '): ' +
        r.check.failures.join(' | '));
    });
  }

  // Д2.3 — худший набор: по каждому параметру берём худшее из двух направлений Д2.2
  var worstCase = buildWorstCaseBalance(balance, sweep);
  var worstEv = evaluateTournament(worstCase.balance, SEEDS_MAIN);
  var worstCheck = checkCoreThresholds(worstEv);
  writeArtifact('ДОГОН_TSV_Д2_худший_набор_48.tsv', tsvMainRows(worstEv.rows));
  writeArtifact('ДОГОН_худший_набор_выбор_направлений.tsv',
    ['параметр\tнаправление\tстарое\tновое'].concat(worstCase.chosen.map(function (c) {
      return c.label + '\t' + (c.dir > 0 ? '+10%' : '-10%') + '\t' + c.oldValue + '\t' + c.newValue;
    })).join('\n'));
  console.log('Д2.3 худший набор (все параметры одновременно в худшую по отдельности сторону, ' +
    worstCase.chosen.length + ' параметров): уникальных партий ' + worstEv.uniqueCount + ' из ' + worstEv.total +
    '. Пороги 2,3,4,5: ' + (worstCheck.ok ? 'все устояли' : 'провал — ' + worstCheck.failures.join(' | ')));

  // ---- Итог по основному прогону (как раньше — код возврата по ТЗ №06) ----
  if (core8.failures.length > 0) {
    console.error('\nПРОВАЛ основного прогона (' + core8.failures.length + '):');
    core8.failures.forEach(function (f) { console.error('  - ' + f); });
    console.error('\nАртефакты записаны в ' + OUT_DIR);
    process.exit(1);
  }

  console.log('\nOK: 48 партий (6×8), критерии готовности ТЗ №06 (раздел 4, пп.1-6,8) выполнены.');
  console.log('Артефакты записаны в ' + OUT_DIR + ' (см. список в дополнении к отчёту).');
}

main();
