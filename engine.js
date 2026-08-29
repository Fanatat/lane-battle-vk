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
      playerSpawnX: 0, enemySpawnX: 0
    };
    layout.playerBase.y = layout.laneY - baseHeight / 2;
    layout.enemyBase.x = cssW - margin - baseWidth;
    layout.enemyBase.y = layout.laneY - baseHeight / 2;
    layout.playerSpawnX = layout.playerBase.frontX + unitSize * 0.5;
    layout.enemySpawnX = layout.enemyBase.frontX - unitSize * 0.5;
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
        killedCount: 0,
        over: false, result: null,
        hitstopMs: 0,
        shakeMag: 0, shakeMs: 0, shakeTotalMs: 0,
        dpsAccum: 0, dpsLastSecond: 0, dpsSecondFloor: 0,
        foodFullTime: 0, minPlayerBaseHp: 0
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
        x = layout.playerSpawnX;
        var minX = minActiveX(playerUnits);
        if (minX !== null && minX - x < gapPx) x = minX - gapPx;
      } else {
        x = layout.enemySpawnX;
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
        var ownRangePx = (isRanged ? spec.range_uw : balance.geometry.attack_range_uw) * layout.unitSize;
        var found = nearestEnemy(u, otherPool);
        if (found && found.dist <= ownRangePx) {
          u.state = 'ATTACK';
          if (u.cooldown <= 0) {
            u.cooldown = spec.attack_speed;
            applyDamage(found.unit, spec.damage, isPlayer);
            if (isRanged) onRangedShot(u.x, u.y, found.unit.x, found.unit.y);
          }
          continue;
        }

        u.state = 'MOVE';
        var ahead = i > 0 ? order[i - 1] : null;
        var speedPx = spec.speed_uw * layout.unitSize;
        var nx = u.x + dir * speedPx * dt;
        if (ahead) {
          if (isPlayer) nx = Math.min(nx, ahead.x - gapPx);
          else nx = Math.max(nx, ahead.x + gapPx);
        }
        u.x = nx;
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
