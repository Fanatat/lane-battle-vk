/*
 * engine.js — ядро симуляции боя, без DOM/Canvas.
 * Общий модуль для main.js (браузер) и tests/sim.js (Node) — правила боя
 * живут в одном месте, чтобы headless-прогон и то, что видит игрок, не расходились.
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
        cooldown: 0, state: 'MOVE', squashT: 0, flashT: 0
      };
    }
    return arr;
  }

  // ---------------- layout (pure geometry, no canvas) ----------------

  // Reproduces exactly the math main.js's resize() uses to turn a CSS
  // viewport into lane positions, so a headless sim at a given resolution
  // matches what the browser would compute for the same resolution.
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
      playerReinforceX: 0, enemyReinforceX: 0, reinforceOffsetPx: 0
    };
    layout.playerBase.y = layout.laneY - baseHeight / 2;
    layout.enemyBase.x = cssW - margin - baseWidth;
    layout.enemyBase.y = layout.laneY - baseHeight / 2;

    // Дистанция подкрепления (ТЗ №06, блок 1): точка появления купленного
    // юнита отодвинута от двери базы на reinforce_offset_uw, но не более
    // 20% длины полосы — на узких/квадратных экранах офсет в uw не должен
    // съедать почти всю полосу.
    var laneLengthPx = layout.enemyBase.frontX - layout.playerBase.frontX;
    var reinforceOffsetPx = Math.min(
      geometry.reinforce_offset_uw * unitSize,
      laneLengthPx * 0.2
    );
    layout.reinforceOffsetPx = reinforceOffsetPx;
    layout.playerReinforceX = layout.playerBase.frontX + reinforceOffsetPx;
    layout.enemyReinforceX = layout.enemyBase.frontX - reinforceOffsetPx;
    return layout;
  }

  // ---------------- battle ----------------

  function createEngine(balance, layout, hooks) {
    hooks = hooks || {};
    var onDamage = hooks.onDamage || function () {};
    var onKill = hooks.onKill || function () {};
    var onBaseHit = hooks.onBaseHit || function () {};
    var onBaseDestroyed = hooks.onBaseDestroyed || function () {};
    var onRangedShot = hooks.onRangedShot || function () {};

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

    function restart() {
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
      state.nextEndlessTime = (sched.length ? sched[sched.length - 1].time : 0) +
        (balance.enemy.endless ? balance.enemy.endless.interval_start_s : 0);
      state.endlessWaveIndex = 0;
      if (sched.length) {
        state.nextWaveType = sched[0].type;
        state.nextWaveTime = sched[0].time;
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

    function spawnUnit(isPlayer, type) {
      var pool = isPlayer ? playerUnits : enemyUnits;
      var spec = balance.units[type];
      var slot = findFreeSlot(pool);
      if (!slot) return null;

      var gapPx = balance.geometry.queue_gap_uw * layout.unitSize;
      var x;
      if (isPlayer) {
        x = layout.playerReinforceX;
        var minX = minActiveX(playerUnits);
        if (minX !== null && minX - x < gapPx) x = minX - gapPx;
      } else {
        x = layout.enemyReinforceX;
        var maxX = maxActiveX(enemyUnits);
        if (maxX !== null && x - maxX < gapPx) x = maxX + gapPx;
      }

      slot.active = true;
      slot.type = type;
      slot.x = x;
      slot.y = layout.laneY;
      slot.hp = spec.hp;
      slot.maxHp = spec.hp;
      slot.cooldown = 0;
      slot.state = 'MOVE';
      slot.squashT = balance.juice.spawn_squash_ms / 1000;
      slot.flashT = 0;
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
      var cost = balance.units[type].cost;
      if (state.food < cost) return false;
      state.food -= cost;
      spawnUnit(true, type);
      return true;
    }

    function processSchedule() {
      var sched = balance.enemy.schedule;
      while (state.scheduleIndex < sched.length && sched[state.scheduleIndex].time <= state.timeElapsed) {
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
      var lastTime = sched.length ? sched[sched.length - 1].time : 0;
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
        state.nextWaveTime = sched[state.scheduleIndex].time;
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

    function nearestEnemy(unit, otherPool) {
      var best = null, bestDist = Infinity;
      for (var i = 0; i < otherPool.length; i++) {
        var o = otherPool[i];
        if (!o.active) continue;
        var d = Math.abs(o.x - unit.x);
        if (d < bestDist) { bestDist = d; best = o; }
      }
      return best ? { unit: best, dist: bestDist } : null;
    }

    function nearestToPoint(pool, originX, rangePx) {
      var best = null, bestDist = Infinity;
      for (var i = 0; i < pool.length; i++) {
        var o = pool[i];
        if (!o.active) continue;
        var d = Math.abs(o.x - originX);
        if (d <= rangePx && d < bestDist) { bestDist = d; best = o; }
      }
      return best;
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
      var siegeRangePx = balance.geometry.siege_range_uw * layout.unitSize;
      var gapPx = balance.geometry.queue_gap_uw * layout.unitSize;
      // Ширина фронта (ТЗ №05, 1.1): радиус ближней атаки расширен так, чтобы
      // до front_depth юнитов очереди одновременно доставали до контакта —
      // юнит позади не блокируется союзником впереди, очередь остаётся только
      // визуальной (шаг ниже по-прежнему держит gap).
      var contactRangePx = balance.geometry.attack_range_uw * layout.unitSize;
      var meleeRangePx = (balance.geometry.attack_range_uw +
        (balance.geometry.front_depth - 1) * balance.geometry.queue_gap_uw) * layout.unitSize;
      var otherPool = isPlayer ? enemyUnits : playerUnits;
      var dir = isPlayer ? 1 : -1;
      var frontEdge = isPlayer ? layout.enemyBase.frontX : layout.playerBase.frontX;

      for (var i = 0; i < n; i++) {
        var u = order[i];
        var spec = balance.units[u.type];
        if (u.cooldown > 0) u.cooldown -= dt;

        // Осада — безусловный приоритет: юнит в радиусе осады бьёт по базе,
        // даже если рядом враг (иначе бой у самой базы стопорит осаду навечно).
        var distToBase = isPlayer ? (frontEdge - u.x) : (u.x - frontEdge);
        if (distToBase <= siegeRangePx) {
          u.state = 'SIEGE';
          if (u.cooldown <= 0) {
            u.cooldown = spec.attack_speed;
            damageBase(!isPlayer, spec.damage);
          }
          continue;
        }

        // Радиус атаки — свой у каждой роли: ближний бой берёт общую
        // geometry.attack_range_uw, стрелок — собственный unit.range_uw.
        var isRanged = spec.attack_mode === 'ranged';
        var ownRangePx = isRanged ? spec.range_uw * layout.unitSize : meleeRangePx;
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
        if (found && found.dist <= ownRangePx) {
          u.state = 'ATTACK';
          if (u.cooldown <= 0) {
            u.cooldown = spec.attack_speed;
            applyDamage(found.unit, spec.damage, isPlayer);
            if (isRanged) onRangedShot(u.x, u.y, found.unit.x, found.unit.y);
          }
          // Задние ряды бьют с расширенного радиуса, но продолжают идти к
          // истинной дистанции контакта, пока не дойдут — иначе фронт
          // замирает на границе meleeRangePx и никогда не сжимается
          // (перманентный пат). Стрелка это не касается: его логика
          // "остановился в своей дистанции — дальше не идёт" не трогается.
          if (!isRanged && found.dist > contactRangePx) {
            var advancePx = spec.speed_uw * layout.unitSize;
            var ax = u.x + moveDir * advancePx * dt;
            if (ahead && moveDir === dir) {
              if (isPlayer) ax = Math.min(ax, ahead.x - gapPx);
              else ax = Math.max(ax, ahead.x + gapPx);
            }
            u.x = ax;
          }
          continue;
        }

        u.state = 'MOVE';
        var speedPx = spec.speed_uw * layout.unitSize;
        var nx = u.x + moveDir * speedPx * dt;
        if (ahead && moveDir === dir) {
          if (isPlayer) nx = Math.min(nx, ahead.x - gapPx);
          else nx = Math.max(nx, ahead.x + gapPx);
        }
        u.x = nx;
      }
    }

    // Последний рубеж (ТЗ №06, блок 2): у обеих баз безусловно есть оружие —
    // залп по ближайшему врагу в радиусе base_defense.range_uw, перезарядка
    // base_defense.cooldown. Своё HP у оружия нет, дружественного огня нет,
    // цель — один враг, урон не делится. Симметрично, флага отключения нет
    // (дефолт #8) — асимметрия испортила бы замер.
    function stepBaseDefense(dt) {
      var bd = balance.base_defense;
      if (!bd) return;
      var rangePx = bd.range_uw * layout.unitSize;

      if (state.playerBaseDefCooldown > 0) state.playerBaseDefCooldown -= dt;
      if (state.playerBaseDefCooldown <= 0 && !state.over) {
        var enemyTarget = nearestToPoint(enemyUnits, layout.playerBase.frontX, rangePx);
        if (enemyTarget) {
          state.playerBaseDefCooldown = bd.cooldown;
          applyDamage(enemyTarget, bd.damage, true);
          onRangedShot(layout.playerBase.frontX, layout.laneY, enemyTarget.x, enemyTarget.y);
        }
      }

      if (state.enemyBaseDefCooldown > 0) state.enemyBaseDefCooldown -= dt;
      if (state.enemyBaseDefCooldown <= 0 && !state.over) {
        var playerTarget = nearestToPoint(playerUnits, layout.enemyBase.frontX, rangePx);
        if (playerTarget) {
          state.enemyBaseDefCooldown = bd.cooldown;
          applyDamage(playerTarget, bd.damage, false);
          onRangedShot(layout.enemyBase.frontX, layout.laneY, playerTarget.x, playerTarget.y);
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
      getEnemyUnits: function () { return enemyUnits; }
    };
  }

  return { createEngine: createEngine, computeLayout: computeLayout };
});
