/*
 * engine.js — ядро симуляции боя, без DOM/Canvas.
 * Общий модуль для main.js (браузер) и tests/sim.js (Node) — правила боя
 * живут в одном месте, чтобы headless-прогон и то, что видит игрок, не расходились.
 *
 * ТЗ №07, блок 1: боевые дистанции живут в ЛОГИЧЕСКИХ единицах — доле
 * фиксированной длины полосы (geometry.lane_length_logical, 100 условных
 * единиц), а не в пикселях экрана. Позиция юнита (unit.x) — тоже логическая
 * координата 0..lane_length_logical (0 = дверь базы игрока, 100 = дверь базы
 * врага). Экран участвует только в render-конвертации через
 * layout.pxPerLogical — величину, которую сама симуляция никогда не читает.
 * unitSize/baseWidth/margin остаются пиксельными: это художественный размер
 * (высота юнита от высоты экрана), к длине полосы отношения не имеет и вне
 * объёма фазы 07 (см. ТЗ, раздел 5).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LaneEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var POOL_SIZE = 220;

  function makePool(size) {
    var arr = new Array(size);
    for (var i = 0; i < size; i++) {
      arr[i] = {
        active: false, type: null, x: 0, y: 0, hp: 0, maxHp: 0,
        cooldown: 0, state: 'MOVE', squashT: 0, flashT: 0, advancing: false
      };
    }
    return arr;
  }

  // Детерминированный PRNG (mulberry32), сид — целое число. Источник
  // вариативности турнира (ТЗ №07, блок 2): используется и для случайного
  // выбора цели среди равноценных внутри движка, и (снаружи, в tests/sim.js)
  // для джиттера интервала решений стратегий. Не солвер и не генератор
  // контента — детерминированный ГПСЧ для замера, вход и выход которого
  // полностью числовые.
  function createRng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------- layout (pure geometry, no canvas) ----------------

  // Художественная (пиксельная) геометрия — высота юнита и размеры баз от
  // высоты экрана — плюс мост между логической полосой и пикселями:
  // pxPerLogical нужен ИСКЛЮЧИТЕЛЬНО рендеру (main.js), симуляция его не
  // читает нигде, поэтому одна и та же логика боя даёт одну и ту же игру
  // на любом соотношении сторон (ТЗ №07, диагноз, п.1).
  function computeLayout(cssW, cssH, geometry) {
    var unitSize = cssH * geometry.unit_height_screen_fraction;
    var baseWidth = unitSize * 0.55;
    var baseHeight = unitSize * 1.9;
    var margin = unitSize * 0.15;

    var layout = {
      w: cssW, h: cssH, unitSize: unitSize,
      laneY: cssH / 2,
      playerBase: { x: margin, y: 0, w: baseWidth, h: baseHeight, frontX: margin + baseWidth },
      enemyBase: { x: 0, y: 0, w: baseWidth, h: baseHeight, frontX: cssW - margin - baseWidth },
      laneLengthLogical: geometry.lane_length_logical,
      reinforceOffsetLogical: geometry.reinforce_offset_logical
    };
    layout.playerBase.y = layout.laneY - baseHeight / 2;
    layout.enemyBase.x = cssW - margin - baseWidth;
    layout.enemyBase.y = layout.laneY - baseHeight / 2;

    var laneLengthPx = layout.enemyBase.frontX - layout.playerBase.frontX;
    layout.laneLengthPx = laneLengthPx;
    layout.pxPerLogical = laneLengthPx / geometry.lane_length_logical;

    // Точка подкрепления — только для отрисовки опорной линии (main.js);
    // сама механика подкрепления читает reinforceOffsetLogical напрямую.
    layout.playerReinforceX = layout.playerBase.frontX + layout.reinforceOffsetLogical * layout.pxPerLogical;
    layout.enemyReinforceX = layout.enemyBase.frontX - layout.reinforceOffsetLogical * layout.pxPerLogical;
    return layout;
  }

  // Логическая координата юнита -> пиксель экрана. Единственное место,
  // где логическая полоса "ложится" в пиксели (ТЗ №07, блок 1) — вызывается
  // только рендером, симуляция об этой функции не знает.
  function logicalToPx(layout, logicalX) {
    return layout.playerBase.frontX + logicalX * layout.pxPerLogical;
  }

  // ---------------- battle ----------------

  function createEngine(balance, layout, hooks, options) {
    hooks = hooks || {};
    options = options || {};
    var onDamage = hooks.onDamage || function () {};
    var onKill = hooks.onKill || function () {};
    var onBaseHit = hooks.onBaseHit || function () {};
    var onBaseDestroyed = hooks.onBaseDestroyed || function () {};
    var onRangedShot = hooks.onRangedShot || function () {};

    var LANE = balance.geometry.lane_length_logical;
    var deterministic = !!options.deterministic;
    var seed = options.seed || 1;
    var rng = deterministic ? null : createRng(seed);
    // Допуск "равноценности" цели (ТЗ №07, блок 2, дефолт #4): цели в пределах
    // одного шага очереди друг от друга не различимы по дистанции для решения
    // игрока/врага — выбор между ними даёт джиттер. Без rng (deterministic)
    // всегда побеждает первая найденная по индексу пула — старое поведение.
    var tieEpsilonLogical = balance.geometry.queue_gap_logical || 0;

    var playerUnits = makePool(POOL_SIZE);
    var enemyUnits = makePool(POOL_SIZE);
    var playerOrder = new Array(POOL_SIZE);
    var enemyOrder = new Array(POOL_SIZE);
    var state = null;

    function freshState() {
      return {
        food: 0, foodCap: 0, productionRate: 0,
        playerBaseHp: 0, playerBaseMaxHp: 0,
        enemyBaseHp: 0, enemyBaseMaxHp: 0,
        timeElapsed: 0,
        scheduleIndex: 0,
        spawnedCount: 0, spawnedByType: { A: 0, B: 0, C: 0 },
        enemySpawnedCount: 0,
        killedCount: 0,
        over: false, result: null,
        hitstopMs: 0,
        shakeMag: 0, shakeMs: 0, shakeTotalMs: 0,
        dpsAccum: 0, dpsLastSecond: 0, dpsSecondFloor: 0,
        foodFullTime: 0, minPlayerBaseHp: 0, minEnemyBaseHp: 0,
        nextEndlessTime: 0, endlessWaveIndex: 0,
        nextWaveType: null, nextWaveTime: null, nextWaveCount: null,
        playerBaseDefCooldown: 0, enemyBaseDefCooldown: 0
      };
    }

    // Джиттер интервала решений вражеского ИИ (ТЗ №07, блок 2, дефолт #4):
    // ±10% на время КАЖДОЙ волны расписания, посчитано один раз на бой из
    // сида партии. Не трогает состав/счётчик волны (тип, count) и не
    // трогает экономику/урон (дефолт #4) — только момент решения "напасть".
    var jitteredWaveTimes = [];
    function buildJitteredWaveTimes() {
      var sched = balance.enemy.schedule;
      jitteredWaveTimes = new Array(sched.length);
      for (var i = 0; i < sched.length; i++) {
        jitteredWaveTimes[i] = rng ? sched[i].time * (1 + (rng() * 0.2 - 0.1)) : sched[i].time;
      }
    }

    function restart(newSeed) {
      if (newSeed !== undefined && !deterministic) rng = createRng(newSeed);
      buildJitteredWaveTimes();
      for (var i = 0; i < playerUnits.length; i++) playerUnits[i].active = false;
      for (var j = 0; j < enemyUnits.length; j++) enemyUnits[j].active = false;
      state = freshState();
      state.food = balance.player.food_start;
      state.foodCap = balance.player.food_cap;
      state.productionRate = balance.player.production_rate;
      state.playerBaseHp = state.playerBaseMaxHp = balance.player.base_hp;
      state.enemyBaseHp = state.enemyBaseMaxHp = balance.enemy.base_hp;
      state.minPlayerBaseHp = state.playerBaseHp;
      state.minEnemyBaseHp = state.enemyBaseHp;
      var sched = balance.enemy.schedule;
      state.nextEndlessTime = (sched.length ? jitteredWaveTimes[sched.length - 1] : 0) +
        (balance.enemy.endless ? balance.enemy.endless.interval_start_s : 0);
      state.endlessWaveIndex = 0;
      if (sched.length) {
        state.nextWaveType = sched[0].type;
        state.nextWaveTime = jitteredWaveTimes[0];
        state.nextWaveCount = sched[0].count;
      }
    }

    function endBattle(result) {
      if (state.over) return;
      state.over = true;
      state.result = result;
      onBaseDestroyed(result);
    }

    function findFreeSlot(pool) {
      for (var i = 0; i < pool.length; i++) {
        if (!pool[i].active) return pool[i];
      }
      console.warn('Пул юнитов исчерпан (' + pool.length + ') — спавн пропущен.');
      return null;
    }

    function minActiveX(pool) {
      var min = null;
      for (var i = 0; i < pool.length; i++) {
        if (pool[i].active && (min === null || pool[i].x < min)) min = pool[i].x;
      }
      return min;
    }
    function maxActiveX(pool) {
      var max = null;
      for (var i = 0; i < pool.length; i++) {
        if (pool[i].active && (max === null || pool[i].x > max)) max = pool[i].x;
      }
      return max;
    }

    // ТЗ №08: апгрейды кампании усиливают ТОЛЬКО юнитов игрока — balance.units
    // общий для обеих сторон (движок не различает игрока/врага при чтении
    // характеристик), поэтому прямая правка balance.units.X.damage усилила бы
    // и врага. player_unit_overrides — необязательный аддитивный бонус,
    // читается только при isPlayer===true; без него (обычный бой ТЗ №01-07)
    // поведение побитово прежнее.
    function getUnitStats(type, isPlayer) {
      var spec = balance.units[type];
      var overrides = isPlayer && balance.player_unit_overrides ? balance.player_unit_overrides[type] : null;
      return {
        hp: spec.hp + (overrides && overrides.hp_bonus ? overrides.hp_bonus : 0),
        damage: spec.damage + (overrides && overrides.damage_bonus ? overrides.damage_bonus : 0)
      };
    }

    function spawnUnit(isPlayer, type) {
      var pool = isPlayer ? playerUnits : enemyUnits;
      var spec = balance.units[type];
      var uStats = getUnitStats(type, isPlayer);
      var slot = findFreeSlot(pool);
      if (!slot) return null;

      var gap = balance.geometry.queue_gap_logical;
      var x;
      if (isPlayer) {
        x = layout.reinforceOffsetLogical;
        var minX = minActiveX(playerUnits);
        if (minX !== null && minX - x < gap) x = minX - gap;
      } else {
        x = LANE - layout.reinforceOffsetLogical;
        var maxX = maxActiveX(enemyUnits);
        if (maxX !== null && x - maxX < gap) x = maxX + gap;
      }

      slot.active = true;
      slot.type = type;
      slot.x = x;
      slot.y = layout.laneY;
      slot.hp = uStats.hp;
      slot.maxHp = uStats.hp;
      slot.cooldown = 0;
      slot.state = 'MOVE';
      slot.squashT = balance.juice.spawn_squash_ms / 1000;
      slot.flashT = 0;
      slot.advancing = false;
      if (isPlayer) {
        state.spawnedCount++;
        if (state.spawnedByType[type] !== undefined) state.spawnedByType[type]++;
      } else {
        state.enemySpawnedCount++;
      }
      return slot;
    }

    function trySpawnFood(type) {
      if (state.over) return false;
      // ТЗ №08: тип, не открытый в кампании, недоступен для покупки — проверка
      // в движке, а не только в UI/боте, чтобы конфигурация была надёжна сама
      // по себе (balance.campaignUnlocked отсутствует вне кампании — ТЗ №01-07
      // ведут себя как раньше, все типы доступны с самого начала).
      if (balance.campaignUnlocked && balance.campaignUnlocked[type] === false) return false;
      var cost = balance.units[type].cost;
      if (state.food < cost) return false;
      state.food -= cost;
      spawnUnit(true, type);
      return true;
    }

    function processSchedule() {
      var sched = balance.enemy.schedule;
      while (state.scheduleIndex < sched.length && jitteredWaveTimes[state.scheduleIndex] <= state.timeElapsed) {
        var wave = sched[state.scheduleIndex];
        for (var i = 0; i < wave.count; i++) spawnUnit(false, wave.type);
        state.scheduleIndex++;
      }
      processEndlessSchedule();
      updateNextWavePreview();
    }

    // Расписание не кончается: как только напечённый массив исчерпан, волны
    // продолжают идти по формуле от номера волны — интервал линейно сокращается
    // к полу, состав тяжелеет (счёт растёт со ступенями), тип — циклический
    // паттерн. Всё — числа из balance.json, формула не генерирует контент,
    // только раскладывает по времени.
    function processEndlessSchedule() {
      var sched = balance.enemy.schedule;
      var endless = balance.enemy.endless;
      if (!endless) return;
      var lastTime = sched.length ? jitteredWaveTimes[sched.length - 1] : 0;
      if (state.nextEndlessTime < lastTime) state.nextEndlessTime = lastTime + endless.interval_start_s;

      while (state.nextEndlessTime <= state.timeElapsed) {
        var waveIndex = state.endlessWaveIndex;
        var type = endless.pattern[waveIndex % endless.pattern.length];
        var extra = Math.min(endless.count_growth_max, Math.floor(waveIndex / endless.count_growth_every_n_waves));
        var count = endless.count_base + extra;
        for (var i = 0; i < count; i++) spawnUnit(false, type);

        var interval = endless.interval_start_s - waveIndex * endless.interval_step_s;
        if (interval < endless.interval_min_s) interval = endless.interval_min_s;
        state.nextEndlessTime += interval;
        state.endlessWaveIndex++;
      }
    }

    // Превью следующей волны (фаза 2 ТЗ №05) — тип и время следующего спавна,
    // читается из того же источника расписания, что и реальный спавн, не
    // дублирует данные.
    function updateNextWavePreview() {
      var sched = balance.enemy.schedule;
      if (state.scheduleIndex < sched.length) {
        state.nextWaveType = sched[state.scheduleIndex].type;
        state.nextWaveTime = jitteredWaveTimes[state.scheduleIndex];
        state.nextWaveCount = sched[state.scheduleIndex].count;
        return;
      }
      var endless = balance.enemy.endless;
      if (!endless) { state.nextWaveType = null; state.nextWaveTime = null; state.nextWaveCount = null; return; }
      var waveIndex = state.endlessWaveIndex;
      state.nextWaveType = endless.pattern[waveIndex % endless.pattern.length];
      state.nextWaveTime = state.nextEndlessTime;
      var extra = Math.min(endless.count_growth_max, Math.floor(waveIndex / endless.count_growth_every_n_waves));
      state.nextWaveCount = endless.count_base + extra;
    }

    function buildOrder(pool, order, descending) {
      var n = 0;
      for (var i = 0; i < pool.length; i++) {
        if (pool[i].active) order[n++] = pool[i];
      }
      var slice = order.slice(0, n);
      slice.sort(function (a, b) { return descending ? b.x - a.x : a.x - b.x; });
      for (var j = 0; j < n; j++) order[j] = slice[j];
      return n;
    }

    // Общий выбор ближайшей цели с джиттером равноценных (ТЗ №07, блок 2):
    // сначала находим лучшую дистанцию, затем среди всех целей в пределах
    // tieEpsilonLogical от неё выбираем случайно (детерминированно — первую
    // по порядку пула, как раньше). maxDist === null — без ограничения
    // дальности (nearestEnemy), число — с ограничением (nearestToPoint).
    function pickNearestWithTie(pool, originX, maxDist) {
      var bestDist = Infinity;
      var i, o, d;
      for (i = 0; i < pool.length; i++) {
        o = pool[i];
        if (!o.active) continue;
        d = Math.abs(o.x - originX);
        if (maxDist !== null && d > maxDist) continue;
        if (d < bestDist) bestDist = d;
      }
      if (bestDist === Infinity) return null;
      var candidates = [];
      for (i = 0; i < pool.length; i++) {
        o = pool[i];
        if (!o.active) continue;
        d = Math.abs(o.x - originX);
        if (maxDist !== null && d > maxDist) continue;
        if (d <= bestDist + tieEpsilonLogical) candidates.push({ unit: o, dist: d });
      }
      if (!rng || candidates.length === 1) return candidates[0];
      var idx = Math.floor(rng() * candidates.length);
      if (idx >= candidates.length) idx = candidates.length - 1;
      return candidates[idx];
    }

    function nearestEnemy(unit, otherPool) {
      return pickNearestWithTie(otherPool, unit.x, null);
    }

    function nearestToPoint(pool, originX, range) {
      var r = pickNearestWithTie(pool, originX, range);
      return r ? r.unit : null;
    }

    function applyDamage(target, amount, isPlayerAttacking) {
      target.hp -= amount;
      target.flashT = balance.juice.hit_flash_ms / 1000;
      onDamage(target.x, target.y - layout.unitSize * 0.65, amount);
      if (isPlayerAttacking) state.dpsAccum += amount;
      if (target.hp <= 0) {
        target.active = false;
        state.killedCount++;
        triggerHitstop(balance.juice.death_hitstop_ms);
        triggerShake(balance.juice.death_shake_px, balance.juice.death_shake_ms);
        onKill(target, isPlayerAttacking);
      }
    }

    function damageBase(isPlayerBase, amount) {
      if (isPlayerBase) {
        state.playerBaseHp = Math.max(0, state.playerBaseHp - amount);
        if (state.playerBaseHp < state.minPlayerBaseHp) state.minPlayerBaseHp = state.playerBaseHp;
      } else {
        state.enemyBaseHp = Math.max(0, state.enemyBaseHp - amount);
        if (state.enemyBaseHp < state.minEnemyBaseHp) state.minEnemyBaseHp = state.enemyBaseHp;
        state.dpsAccum += amount;
      }
      triggerShake(balance.juice.base_hit_shake_px, balance.juice.base_hit_shake_ms);
      onBaseHit(isPlayerBase, amount);
      if ((isPlayerBase && state.playerBaseHp <= 0) || (!isPlayerBase && state.enemyBaseHp <= 0)) {
        triggerHitstop(balance.juice.base_destroy_hitstop_ms);
        triggerShake(balance.juice.base_destroy_shake_px, balance.juice.base_destroy_shake_ms);
        endBattle(isPlayerBase ? 'LOSE' : 'WIN');
      }
    }

    function simulateSide(pool, order, isPlayer, dt) {
      var n = buildOrder(pool, order, isPlayer);
      var siegeRange = balance.geometry.siege_range_logical;
      var gap = balance.geometry.queue_gap_logical;
      // Ширина фронта (ТЗ №05, 1.1): радиус ближней атаки расширен так, чтобы
      // до front_depth юнитов очереди одновременно доставали до контакта —
      // юнит позади не блокируется союзником впереди, очередь остаётся только
      // визуальной (шаг ниже по-прежнему держит gap).
      var contactRange = balance.geometry.attack_range_logical;
      var meleeRange = balance.geometry.attack_range_logical +
        (balance.geometry.front_depth - 1) * balance.geometry.queue_gap_logical;
      var otherPool = isPlayer ? enemyUnits : playerUnits;
      var dir = isPlayer ? 1 : -1;

      for (var i = 0; i < n; i++) {
        var u = order[i];
        var spec = balance.units[u.type];
        var uStats = getUnitStats(u.type, isPlayer); // ТЗ №08: аддитивный урон-бонус игрока
        if (u.cooldown > 0) u.cooldown -= dt;
        // ТЗ №21 (QA-баг 4): по умолчанию не движется физически этот тик —
        // ниже переставляется в true ТОЛЬКО в ветке, где u.x реально
        // меняется, пока state остаётся ATTACK (задние ряды бьют с
        // расширенного радиуса и одновременно доходят до contactRange).
        // Рендер (main.js unitAnim) читает этот флаг, чтобы не замораживать
        // ходьбу под скользящими ногами — движковую логику не трогает.
        u.advancing = false;

        // Осада — безусловный приоритет: юнит в радиусе осады бьёт по базе,
        // даже если рядом враг (иначе бой у самой базы стопорит осаду навечно).
        var distToBase = isPlayer ? (LANE - u.x) : u.x;
        if (distToBase <= siegeRange) {
          u.state = 'SIEGE';
          if (u.cooldown <= 0) {
            u.cooldown = spec.attack_speed;
            damageBase(!isPlayer, uStats.damage);
          }
          continue;
        }

        // Радиус атаки — свой у каждой роли: ближний бой берёт общую
        // geometry.attack_range_logical, стрелок — собственный unit.range_logical.
        var isRanged = spec.attack_mode === 'ranged';
        var ownRange = isRanged ? spec.range_logical : meleeRange;
        var found = nearestEnemy(u, otherPool);
        var ahead = i > 0 ? order[i - 1] : null;
        // Дистанция подкрепления (ТЗ №06, блок 1): юнит идёт к БЛИЖАЙШЕМУ
        // врагу, а не всегда вперёд к базе противника — прорвавшийся враг,
        // оказавшийся позади точки подкрепления, тянет свежих защитников
        // назад, к своей базе. moveDir совпадает с исходным «вперёд» (dir)
        // в подавляющем большинстве тиков; ahead-клэмп (держит очередь) имеет
        // смысл только в этом случае — иначе он привязывает юнита к соседу,
        // идущему в другую сторону, и клинит движение.
        var moveDir = found ? (Math.sign(found.unit.x - u.x) || dir) : dir;

        // Слабость стрелка вблизи (ТЗ №07, блок 3, дефолт #7-8): ближе
        // min_range_fraction от своей дальности стрелок не стреляет и не
        // наносит урон, но и не убегает — остаётся на месте и терпит.
        var tooClose = isRanged && found && found.dist < ownRange * spec.min_range_fraction;

        if (found && found.dist <= ownRange && !tooClose) {
          u.state = 'ATTACK';
          if (u.cooldown <= 0) {
            u.cooldown = spec.attack_speed;
            applyDamage(found.unit, uStats.damage, isPlayer);
            if (isRanged) onRangedShot(u.x, u.y, found.unit.x, found.unit.y);
          }
          // Задние ряды бьют с расширенного радиуса, но продолжают идти к
          // истинной дистанции контакта, пока не дойдут — иначе фронт
          // замирает на границе meleeRange и никогда не сжимается
          // (перманентный пат). Стрелка это не касается: его логика
          // "остановился в своей дистанции — дальше не идёт" не трогается.
          if (!isRanged && found.dist > contactRange) {
            var advance = spec.speed_logical * dt;
            var ax = u.x + moveDir * advance;
            if (ahead && moveDir === dir) {
              if (isPlayer) ax = Math.min(ax, ahead.x - gap);
              else ax = Math.max(ax, ahead.x + gap);
            }
            // advancing только если реально сдвинулся — очередь может
            // клэмпить ax обратно в u.x (упёрся в союзника впереди), тогда
            // юнит физически стоит и ATTACK-поза (не ходьба) верна.
            if (ax !== u.x) u.advancing = true;
            u.x = ax;
          }
          continue;
        }

        if (tooClose) {
          u.state = 'HELPLESS';
          continue;
        }

        u.state = 'MOVE';
        var speed = spec.speed_logical * dt;
        var nx = u.x + moveDir * speed;
        if (ahead && moveDir === dir) {
          if (isPlayer) nx = Math.min(nx, ahead.x - gap);
          else nx = Math.max(nx, ahead.x + gap);
        }
        u.x = nx;
      }
    }

    // Последний рубеж (ТЗ №06, блок 2): у обеих баз безусловно есть оружие —
    // залп по ближайшему врагу в радиусе base_defense.range_logical,
    // перезарядка base_defense.cooldown. Своё HP у оружия нет, дружественного
    // огня нет, цель — один враг, урон не делится. Симметрично, флага
    // отключения нет (дефолт #8 ТЗ06) — асимметрия испортила бы замер.
    function stepBaseDefense(dt) {
      var bd = balance.base_defense;
      if (!bd) return;
      var range = bd.range_logical;

      if (state.playerBaseDefCooldown > 0) state.playerBaseDefCooldown -= dt;
      if (state.playerBaseDefCooldown <= 0 && !state.over) {
        var enemyTarget = nearestToPoint(enemyUnits, 0, range);
        if (enemyTarget) {
          state.playerBaseDefCooldown = bd.cooldown;
          applyDamage(enemyTarget, bd.damage, true);
          onRangedShot(0, layout.laneY, enemyTarget.x, enemyTarget.y);
        }
      }

      if (state.enemyBaseDefCooldown > 0) state.enemyBaseDefCooldown -= dt;
      if (state.enemyBaseDefCooldown <= 0 && !state.over) {
        var playerTarget = nearestToPoint(playerUnits, LANE, range);
        if (playerTarget) {
          state.enemyBaseDefCooldown = bd.cooldown;
          applyDamage(playerTarget, bd.damage, false);
          onRangedShot(LANE, layout.laneY, playerTarget.x, playerTarget.y);
        }
      }
    }

    function triggerHitstop(ms) {
      state.hitstopMs = Math.max(state.hitstopMs, ms);
    }
    function triggerShake(px, ms) {
      if (px >= state.shakeMag) {
        state.shakeMag = px;
        state.shakeMs = ms;
        state.shakeTotalMs = ms;
      }
    }

    function step(simDt) {
      if (state.over) return;
      state.timeElapsed += simDt;
      var wasFull = state.food >= state.foodCap;
      state.food = Math.min(state.foodCap, state.food + state.productionRate * simDt);
      if (wasFull && state.food >= state.foodCap) state.foodFullTime += simDt;

      var prevFloor = state.dpsSecondFloor;
      var newFloor = Math.floor(state.timeElapsed);
      if (newFloor > prevFloor) {
        state.dpsLastSecond = state.dpsAccum;
        state.dpsAccum = 0;
        state.dpsSecondFloor = newFloor;
      }

      processSchedule();
      simulateSide(playerUnits, playerOrder, true, simDt);
      simulateSide(enemyUnits, enemyOrder, false, simDt);
      stepBaseDefense(simDt);
    }

    restart();

    return {
      restart: restart,
      step: step,
      trySpawnFood: trySpawnFood,
      spawnPlayer: function (type) { return spawnUnit(true, type); },
      spawnEnemy: function (type) { return spawnUnit(false, type); },
      getState: function () { return state; },
      getPlayerUnits: function () { return playerUnits; },
      getEnemyUnits: function () { return enemyUnits; },
      isDeterministic: function () { return deterministic; },
      getSeed: function () { return seed; }
    };
  }

  return { createEngine: createEngine, computeLayout: computeLayout, logicalToPx: logicalToPx, createRng: createRng };
});
