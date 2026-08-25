/*
 * Lane Battle — вертикальный срез боя (ТЗ №01).
 * Vanilla JS + Canvas 2D. Ни одного игрового числа здесь — всё в balance.json.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var dpr = Math.max(1, window.devicePixelRatio || 1);

  var POOL_SIZE = 220;
  var DMG_POOL_SIZE = 96;

  var balance = null;

  // ---- layout (recomputed on resize) ----
  var layout = {
    w: 0, h: 0, unitSize: 0,
    laneY: 0,
    playerBase: { x: 0, y: 0, w: 0, h: 0, frontX: 0 },
    enemyBase: { x: 0, y: 0, w: 0, h: 0, frontX: 0 },
    playerSpawnX: 0, enemySpawnX: 0
  };

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

  var playerUnits = makePool(POOL_SIZE);
  var enemyUnits = makePool(POOL_SIZE);
  var dmgNumbers = makePool(DMG_POOL_SIZE).map(function (u) {
    u.vy = 0; u.age = 0; u.maxAge = 0; u.value = 0; u.crit = false; return u;
  });

  // scratch order arrays reused every frame — no `new` in the loop
  var playerOrder = new Array(POOL_SIZE);
  var enemyOrder = new Array(POOL_SIZE);

  var state = null;

  function freshState() {
    return {
      food: 0,
      foodCap: 0,
      productionRate: 0,
      playerBaseHp: 0, playerBaseMaxHp: 0,
      enemyBaseHp: 0, enemyBaseMaxHp: 0,
      timeElapsed: 0,
      scheduleIndex: 0,
      speedIndex: 0, // index into balance.speed_levels
      spawnedCount: 0,
      killedCount: 0,
      over: false,
      result: null, // 'WIN' | 'LOSE'
      hitstopMs: 0,
      shakeMag: 0, shakeMs: 0, shakeTotalMs: 0,
      dpsAccum: 0, dpsLastSecond: 0, dpsSecondFloor: 0,
      paused: false
    };
  }

  // ---------------- loading ----------------

  fetch('balance.json', { cache: 'no-store' })
    .then(function (r) {
      if (!r.ok) throw new Error('balance.json: HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      balance = data;
      resize();
      restartBattle();
      wireInput();
      window.addEventListener('resize', resize);
      window.addEventListener('orientationchange', resize);
      requestAnimationFrame(loop);
    })
    .catch(function (err) {
      document.body.innerHTML =
        '<pre style="color:#f66;background:#200;padding:16px;white-space:pre-wrap;">' +
        'Не удалось загрузить balance.json.\n' + String(err && err.stack || err) +
        '</pre>';
      throw err;
    });

  // ---------------- layout ----------------

  function resize() {
    var cssW = canvas.clientWidth || window.innerWidth;
    var cssH = canvas.clientHeight || Math.round(window.innerHeight * 0.6);
    dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    var oldLaneStart = layout.playerBase.frontX;
    var oldLaneEnd = layout.enemyBase.frontX;
    var oldLaneWidth = oldLaneEnd - oldLaneStart;

    var unitSize = cssH * (balance.geometry.unit_height_screen_fraction);
    var baseWidth = unitSize * 0.55;
    var baseHeight = unitSize * 1.9;
    var margin = unitSize * 0.15;

    layout.w = cssW; layout.h = cssH; layout.unitSize = unitSize;
    layout.laneY = cssH / 2;
    layout.playerBase.x = margin;
    layout.playerBase.y = layout.laneY - baseHeight / 2;
    layout.playerBase.w = baseWidth;
    layout.playerBase.h = baseHeight;
    layout.playerBase.frontX = margin + baseWidth;

    layout.enemyBase.w = baseWidth;
    layout.enemyBase.h = baseHeight;
    layout.enemyBase.x = cssW - margin - baseWidth;
    layout.enemyBase.y = layout.laneY - baseHeight / 2;
    layout.enemyBase.frontX = cssW - margin - baseWidth;

    layout.playerSpawnX = layout.playerBase.frontX + unitSize * 0.5;
    layout.enemySpawnX = layout.enemyBase.frontX - unitSize * 0.5;

    // reposition existing units proportionally so a mid-battle resize (e.g. rotate) doesn't break the lane
    var newLaneWidth = layout.enemyBase.frontX - layout.playerBase.frontX;
    if (oldLaneWidth > 1) {
      var ratio = newLaneWidth / oldLaneWidth;
      remapUnitsX(playerUnits, oldLaneStart, ratio);
      remapUnitsX(enemyUnits, oldLaneStart, ratio);
    }
  }

  function remapUnitsX(pool, oldLaneStart, ratio) {
    for (var i = 0; i < pool.length; i++) {
      var u = pool[i];
      if (!u.active) continue;
      u.x = layout.playerBase.frontX + (u.x - oldLaneStart) * ratio;
    }
  }

  // ---------------- pooling helpers ----------------

  function findFreeSlot(pool) {
    for (var i = 0; i < pool.length; i++) {
      if (!pool[i].active) return pool[i];
    }
    console.warn('Пул юнитов исчерпан (' + pool.length + ') — спавн пропущен.');
    return null;
  }

  function findFreeDmg() {
    for (var i = 0; i < dmgNumbers.length; i++) {
      if (!dmgNumbers[i].active) return dmgNumbers[i];
    }
    console.warn('Пул цифр урона исчерпан (' + dmgNumbers.length + ') — переиспользую старейший слот.');
    return dmgNumbers[0];
  }

  function spawnDamageNumber(x, y, value) {
    var d = findFreeDmg();
    d.active = true; d.x = x; d.y = y; d.vy = -balance.juice.damage_number_rise_px / (balance.juice.damage_number_ms / 1000);
    d.age = 0; d.maxAge = balance.juice.damage_number_ms / 1000; d.value = Math.round(value);
  }

  // ---------------- battle lifecycle ----------------

  function restartBattle() {
    for (var i = 0; i < playerUnits.length; i++) playerUnits[i].active = false;
    for (var j = 0; j < enemyUnits.length; j++) enemyUnits[j].active = false;
    for (var k = 0; k < dmgNumbers.length; k++) dmgNumbers[k].active = false;

    var prevSpeedIndex = state ? state.speedIndex : 0;
    state = freshState();
    state.speedIndex = prevSpeedIndex;
    state.food = balance.player.food_start;
    state.foodCap = balance.player.food_cap;
    state.productionRate = balance.player.production_rate;
    state.playerBaseHp = state.playerBaseMaxHp = balance.player.base_hp;
    state.enemyBaseHp = state.enemyBaseMaxHp = balance.enemy.base_hp;

    hidePopup();
    updateSpeedButton();
    updateHud();
  }

  function endBattle(result) {
    if (state.over) return;
    state.over = true;
    state.result = result;
    showPopup(result);
  }

  // ---------------- spawning ----------------

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
    state.spawnedCount++;
    return slot;
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

  function trySpawnFromCard(type) {
    if (state.over) return;
    var cost = balance.units[type].cost;
    if (state.food < cost) {
      shakeCard(type);
      return;
    }
    state.food -= cost;
    spawnUnit(true, type);
  }

  // ---------------- enemy AI ----------------

  function processSchedule() {
    var sched = balance.enemy.schedule;
    while (state.scheduleIndex < sched.length && sched[state.scheduleIndex].time <= state.timeElapsed) {
      var wave = sched[state.scheduleIndex];
      for (var i = 0; i < wave.count; i++) spawnUnit(false, wave.type);
      state.scheduleIndex++;
    }
  }

  // ---------------- combat resolution ----------------

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
    spawnDamageNumber(target.x, target.y - layout.unitSize * 0.65, amount);
    if (isPlayerAttacking) {
      state.dpsAccum += amount;
    }
    if (target.hp <= 0) {
      target.active = false;
      state.killedCount++;
      triggerHitstop(balance.juice.death_hitstop_ms);
      triggerShake(balance.juice.death_shake_px, balance.juice.death_shake_ms);
    }
  }

  function damageBase(isPlayerBase, amount) {
    if (isPlayerBase) {
      state.playerBaseHp = Math.max(0, state.playerBaseHp - amount);
    } else {
      state.enemyBaseHp = Math.max(0, state.enemyBaseHp - amount);
      state.dpsAccum += amount;
    }
    triggerShake(balance.juice.base_hit_shake_px, balance.juice.base_hit_shake_ms);
    if ((isPlayerBase && state.playerBaseHp <= 0) || (!isPlayerBase && state.enemyBaseHp <= 0)) {
      triggerHitstop(balance.juice.base_destroy_hitstop_ms);
      triggerShake(balance.juice.base_destroy_shake_px, balance.juice.base_destroy_shake_ms);
      endBattle(isPlayerBase ? 'LOSE' : 'WIN');
    }
  }

  function simulateSide(pool, order, isPlayer, dt) {
    var n = buildOrder(pool, order, isPlayer /* player front = max x */);
    var attackRangePx = balance.geometry.attack_range_uw * layout.unitSize;
    var siegeRangePx = balance.geometry.siege_range_uw * layout.unitSize;
    var gapPx = balance.geometry.queue_gap_uw * layout.unitSize;
    var otherPool = isPlayer ? enemyUnits : playerUnits;
    var dir = isPlayer ? 1 : -1;
    var frontEdge = isPlayer ? layout.enemyBase.frontX : layout.playerBase.frontX;

    for (var i = 0; i < n; i++) {
      var u = order[i];
      var spec = balance.units[u.type];
      if (u.cooldown > 0) u.cooldown -= dt;

      var found = nearestEnemy(u, otherPool);
      if (found && found.dist <= attackRangePx) {
        u.state = 'ATTACK';
        if (u.cooldown <= 0) {
          u.cooldown = spec.attack_speed;
          applyDamage(found.unit, spec.damage, isPlayer);
        }
        continue;
      }

      var distToBase = isPlayer ? (frontEdge - u.x) : (u.x - frontEdge);
      if (distToBase <= siegeRangePx) {
        u.state = 'SIEGE';
        if (u.cooldown <= 0) {
          u.cooldown = spec.attack_speed;
          damageBase(!isPlayer, spec.damage);
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

  // ---------------- juice ----------------

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

  function shakeCard(type) {
    var el = document.getElementById('card-' + type);
    if (!el) return;
    el.style.setProperty('--shake-ms', balance.juice.card_shake_ms + 'ms');
    el.classList.remove('shake');
    // eslint-disable-next-line no-unused-expressions
    void el.offsetWidth; // restart CSS animation
    el.classList.add('shake');
  }

  // ---------------- main loop ----------------

  var lastTs = null;

  function loop(ts) {
    requestAnimationFrame(loop);
    if (lastTs === null) lastTs = ts;
    var realDt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    if (state.paused) return;

    update(realDt);
    render();
  }

  function update(realDt) {
    // juice timers run in real time so hit-stop still shows flash/shake while sim is frozen
    updateJuiceTimers(realDt);

    var speedMult = balance.speed_levels[state.speedIndex];
    var simDt = state.hitstopMs > 0 ? 0 : realDt * speedMult;

    if (!state.over) {
      state.timeElapsed += simDt;
      state.food = Math.min(state.foodCap, state.food + state.productionRate * simDt);

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

    for (var i = 0; i < playerUnits.length; i++) tickUnitAnim(playerUnits[i], realDt);
    for (var j = 0; j < enemyUnits.length; j++) tickUnitAnim(enemyUnits[j], realDt);
    for (var k = 0; k < dmgNumbers.length; k++) tickDamageNumber(dmgNumbers[k], realDt);

    updateHud();
  }

  function updateJuiceTimers(realDt) {
    if (state.hitstopMs > 0) {
      state.hitstopMs -= realDt * 1000;
      if (state.hitstopMs < 0) state.hitstopMs = 0;
    }
    if (state.shakeMs > 0) {
      state.shakeMs -= realDt * 1000;
      if (state.shakeMs < 0) state.shakeMs = 0;
    }
  }

  function tickUnitAnim(u, realDt) {
    if (!u.active) return;
    if (u.squashT > 0) u.squashT = Math.max(0, u.squashT - realDt);
    if (u.flashT > 0) u.flashT = Math.max(0, u.flashT - realDt);
  }

  function tickDamageNumber(d, realDt) {
    if (!d.active) return;
    d.age += realDt;
    d.y += d.vy * realDt;
    if (d.age >= d.maxAge) d.active = false;
  }

  // ---------------- rendering ----------------

  function render() {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, layout.w, layout.h);

    var shakeX = 0, shakeY = 0;
    if (state.shakeMs > 0) {
      var frac = state.shakeMs / state.shakeTotalMs;
      var amp = state.shakeMag * frac;
      shakeX = (Math.random() * 2 - 1) * amp;
      shakeY = (Math.random() * 2 - 1) * amp;
    } else {
      state.shakeMag = 0;
    }
    ctx.translate(shakeX, shakeY);

    // lane ground line
    ctx.strokeStyle = '#262b36';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, layout.laneY + layout.unitSize * 0.7);
    ctx.lineTo(layout.w, layout.laneY + layout.unitSize * 0.7);
    ctx.stroke();

    drawBase(layout.playerBase, state.playerBaseHp, state.playerBaseMaxHp, '#3fa7ff', 'ИГРОК', 'left');
    drawBase(layout.enemyBase, state.enemyBaseHp, state.enemyBaseMaxHp, '#e0475a', 'ВРАГ', 'right');

    for (var i = 0; i < playerUnits.length; i++) drawUnit(playerUnits[i], '#3fa7ff');
    for (var j = 0; j < enemyUnits.length; j++) drawUnit(enemyUnits[j], '#e0475a');
    for (var k = 0; k < dmgNumbers.length; k++) drawDamageNumber(dmgNumbers[k]);

    ctx.restore();
  }

  function drawBase(base, hp, maxHp, color, label, numberAlign) {
    ctx.fillStyle = color;
    ctx.fillRect(base.x, base.y, base.w, base.h);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(base.x, base.y, base.w, base.h * 0.18);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.round(layout.unitSize * 0.22) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, base.x + base.w / 2, base.y + base.h / 2);

    drawHpBar(base.x, base.y - layout.unitSize * 0.3, base.w, layout.unitSize * 0.18, hp, maxHp, numberAlign);
  }

  // numberAlign: falsy = no number (unit HP bars); 'left'/'right' = base HP bars,
  // anchored so the wider "current / max" label never clips off the canvas edge.
  function drawHpBar(x, y, w, h, hp, maxHp, numberAlign) {
    var frac = maxHp > 0 ? Math.max(0, hp / maxHp) : 0;
    ctx.fillStyle = '#1b1e27';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = frac > 0.5 ? '#5fd15f' : (frac > 0.2 ? '#e0b23c' : '#e0475a');
    ctx.fillRect(x, y, w * frac, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.strokeRect(x, y, w, h);
    if (numberAlign) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold ' + Math.round(h * 1.1) + 'px system-ui, sans-serif';
      ctx.textBaseline = 'bottom';
      var text = Math.round(hp) + ' / ' + Math.round(maxHp);
      if (numberAlign === 'left') {
        ctx.textAlign = 'left';
        ctx.fillText(text, x, y - 2);
      } else {
        ctx.textAlign = 'right';
        ctx.fillText(text, x + w, y - 2);
      }
    }
  }

  function drawUnit(u, sideColor) {
    if (!u.active) return;
    var spec = balance.units[u.type];
    var size = layout.unitSize;
    var squash = 1;
    if (u.squashT > 0) {
      var t = 1 - (u.squashT / (balance.juice.spawn_squash_ms / 1000));
      squash = balance.juice.spawn_squash_scale + (1 - balance.juice.spawn_squash_scale) * t;
    }
    var w = size * 0.82;
    var h = size * squash;
    var x = u.x - w / 2;
    var groundY = u.y + size / 2; // fixed baseline: unit grows upward from the lane as it squashes
    var y = groundY - h;

    ctx.fillStyle = spec.color;
    ctx.fillRect(x, y, w, h);

    // type sets the fill, side sets this outline — the two colorings answer different questions
    // ("what is it" vs "whose is it") and both matter once units from both sides share the lane.
    ctx.strokeStyle = sideColor;
    ctx.lineWidth = Math.max(2, size * 0.045);
    ctx.strokeRect(x, y, w, h);

    if (u.flashT > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (u.flashT / (balance.juice.hit_flash_ms / 1000)) + ')';
      ctx.fillRect(x, y, w, h);
    }

    ctx.fillStyle = '#0b0d12';
    ctx.font = 'bold ' + Math.round(size * 0.4) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(u.type, u.x, y + h / 2);

    drawHpBar(u.x - w / 2, y - size * 0.16, w, size * 0.1, u.hp, u.maxHp, false);
  }

  function drawDamageNumber(d) {
    if (!d.active) return;
    var t = d.age / d.maxAge;
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.round(layout.unitSize * 0.26) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('-' + d.value, d.x, d.y);
    ctx.globalAlpha = 1;
  }

  // ---------------- HUD / DOM ----------------

  var foodValueEl = document.getElementById('foodValue');
  var foodCapEl = document.getElementById('foodCap');
  var foodBarFillEl = document.getElementById('foodBarFill');
  var speedBtnEl = document.getElementById('speedBtn');
  var cardEls = { A: document.getElementById('card-A'), B: document.getElementById('card-B'), C: document.getElementById('card-C') };
  var popupEl = document.getElementById('popup');
  var popupTitleEl = document.getElementById('popupTitle');
  var popupStatsEl = document.getElementById('popupStats');
  var restartBtnEl = document.getElementById('restartBtn');

  function updateHud() {
    foodValueEl.textContent = Math.floor(state.food);
    foodCapEl.textContent = state.foodCap;
    foodBarFillEl.style.width = (state.foodCap > 0 ? (state.food / state.foodCap) * 100 : 0) + '%';

    ['A', 'B', 'C'].forEach(function (type) {
      var cost = balance.units[type].cost;
      var el = cardEls[type];
      var costEl = el.querySelector('.cost');
      costEl.textContent = cost;
      el.classList.toggle('disabled', state.over || state.food < cost);
    });
  }

  function updateSpeedButton() {
    speedBtnEl.textContent = '×' + balance.speed_levels[state.speedIndex];
  }

  function showPopup(result) {
    popupTitleEl.textContent = result === 'WIN' ? 'Победа' : 'Поражение';
    var seconds = state.timeElapsed.toFixed(1);
    popupStatsEl.textContent =
      'Длительность боя: ' + seconds + ' с\n' +
      'Юнитов заспавнено: ' + state.spawnedCount + '\n' +
      'Юнитов убито: ' + state.killedCount;
    popupEl.classList.remove('hidden');
  }
  function hidePopup() {
    popupEl.classList.add('hidden');
  }

  function wireInput() {
    speedBtnEl.onclick = function () {
      state.speedIndex = (state.speedIndex + 1) % balance.speed_levels.length;
      updateSpeedButton();
    };
    restartBtnEl.onclick = function () {
      restartBattle();
    };
    Object.keys(cardEls).forEach(function (type) {
      cardEls[type].onclick = function () { trySpawnFromCard(type); };
      cardEls[type].ontouchend = function (e) { e.preventDefault(); trySpawnFromCard(type); };
    });
  }

  // ---------------- expose for dev.js ----------------

  window.Game = {
    getBalance: function () { return balance; },
    getState: function () { return state; },
    restart: function () { restartBattle(); },
    setPaused: function (p) { state.paused = p; },
    spawnEnemyDebug: function (type) { spawnUnit(false, type); },
    spawnPlayerDebug: function (type) { spawnUnit(true, type); }
  };
})();
