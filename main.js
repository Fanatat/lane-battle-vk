/*
 * Lane Battle — вертикальный срез боя (ТЗ №01).
 * Vanilla JS + Canvas 2D. Ни одного игрового числа здесь — всё в balance.json.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var dpr = Math.max(1, window.devicePixelRatio || 1);

  var DMG_POOL_SIZE = 96;
  var SHOT_POOL_SIZE = 48;

  var balance = null;
  var engine = null;
  var speedIndex = 0; // index into balance.speed_levels
  var paused = false;

  // ---- layout (recomputed on resize) ----
  var layout = {
    w: 0, h: 0, unitSize: 0,
    laneY: 0,
    playerBase: { x: 0, y: 0, w: 0, h: 0, frontX: 0 },
    enemyBase: { x: 0, y: 0, w: 0, h: 0, frontX: 0 },
    playerSpawnX: 0, enemySpawnX: 0
  };

  function makeDmgPool(size) {
    var arr = new Array(size);
    for (var i = 0; i < size; i++) {
      arr[i] = { active: false, x: 0, y: 0, vy: 0, age: 0, maxAge: 0, value: 0 };
    }
    return arr;
  }

  var dmgNumbers = makeDmgPool(DMG_POOL_SIZE);

  function makeShotPool(size) {
    var arr = new Array(size);
    for (var i = 0; i < size; i++) {
      arr[i] = { active: false, fromX: 0, fromY: 0, toX: 0, toY: 0, age: 0, maxAge: 0 };
    }
    return arr;
  }

  var shots = makeShotPool(SHOT_POOL_SIZE);

  // ---------------- loading ----------------

  fetch('balance.json', { cache: 'no-store' })
    .then(function (r) {
      if (!r.ok) throw new Error('balance.json: HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      balance = data;
      engine = window.LaneEngine.createEngine(balance, layout, {
        onDamage: spawnDamageNumber,
        onBaseDestroyed: showPopup,
        onRangedShot: spawnShot
      });
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
    if (oldLaneWidth > 1 && engine) {
      var ratio = newLaneWidth / oldLaneWidth;
      remapUnitsX(engine.getPlayerUnits(), oldLaneStart, ratio);
      remapUnitsX(engine.getEnemyUnits(), oldLaneStart, ratio);
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

  function findFreeShot() {
    for (var i = 0; i < shots.length; i++) {
      if (!shots[i].active) return shots[i];
    }
    return shots[0];
  }

  function spawnShot(fromX, fromY, toX, toY) {
    var s = findFreeShot();
    s.active = true; s.fromX = fromX; s.fromY = fromY; s.toX = toX; s.toY = toY;
    s.age = 0; s.maxAge = balance.juice.ranged_shot_ms / 1000;
  }

  // ---------------- battle lifecycle ----------------

  function restartBattle() {
    for (var k = 0; k < dmgNumbers.length; k++) dmgNumbers[k].active = false;
    for (var m = 0; m < shots.length; m++) shots[m].active = false;
    engine.restart();
    hidePopup();
    updateSpeedButton();
    updateHud();
  }

  function trySpawnFromCard(type) {
    if (!engine.trySpawnFood(type)) shakeCard(type);
  }

  // ---------------- juice ----------------

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
    if (paused) return;

    update(realDt);
    render();
  }

  function update(realDt) {
    var state = engine.getState();
    // juice timers run in real time so hit-stop still shows flash/shake while sim is frozen
    updateJuiceTimers(realDt);

    var speedMult = balance.speed_levels[speedIndex];
    var simDt = state.hitstopMs > 0 ? 0 : realDt * speedMult;

    if (!state.over) {
      engine.step(simDt);
    }

    var playerUnits = engine.getPlayerUnits();
    var enemyUnits = engine.getEnemyUnits();
    for (var i = 0; i < playerUnits.length; i++) tickUnitAnim(playerUnits[i], realDt);
    for (var j = 0; j < enemyUnits.length; j++) tickUnitAnim(enemyUnits[j], realDt);
    for (var k = 0; k < dmgNumbers.length; k++) tickDamageNumber(dmgNumbers[k], realDt);
    for (var m = 0; m < shots.length; m++) tickShot(shots[m], realDt);

    updateHud();
  }

  function updateJuiceTimers(realDt) {
    var state = engine.getState();
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

  function tickShot(s, realDt) {
    if (!s.active) return;
    s.age += realDt;
    if (s.age >= s.maxAge) s.active = false;
  }

  // ---------------- rendering ----------------

  function render() {
    var state = engine.getState();
    var playerUnits = engine.getPlayerUnits();
    var enemyUnits = engine.getEnemyUnits();
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
    for (var m = 0; m < shots.length; m++) drawShot(shots[m]);
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

  function drawShot(s) {
    if (!s.active) return;
    var t = s.age / s.maxAge;
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.strokeStyle = balance.juice.ranged_shot_color;
    ctx.lineWidth = Math.max(1, layout.unitSize * 0.05);
    ctx.beginPath();
    ctx.moveTo(s.fromX, s.fromY);
    ctx.lineTo(s.toX, s.toY);
    ctx.stroke();
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
    var state = engine.getState();
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
    speedBtnEl.textContent = '×' + balance.speed_levels[speedIndex];
  }

  function showPopup(result) {
    var state = engine.getState();
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
      speedIndex = (speedIndex + 1) % balance.speed_levels.length;
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
    getState: function () { return engine.getState(); },
    restart: function () { restartBattle(); },
    setPaused: function (p) { paused = p; },
    spawnEnemyDebug: function (type) { engine.spawnEnemy(type); },
    spawnPlayerDebug: function (type) { engine.spawnPlayer(type); }
  };
})();
