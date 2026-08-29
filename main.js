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
    playerReinforceX: 0, enemyReinforceX: 0, reinforceOffsetPx: 0
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

    // Дистанция подкрепления (ТЗ №06, блок 1) — та же формула, что в
    // engine.js computeLayout, чтобы браузер и headless-прогон не расходились.
    var laneLengthPx = layout.enemyBase.frontX - layout.playerBase.frontX;
    var reinforceOffsetPx = Math.min(
      balance.geometry.reinforce_offset_uw * unitSize,
      laneLengthPx * 0.2
    );
    layout.reinforceOffsetPx = reinforceOffsetPx;
    layout.playerReinforceX = layout.playerBase.frontX + reinforceOffsetPx;
    layout.enemyReinforceX = layout.enemyBase.frontX - reinforceOffsetPx;

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

    drawBase(layout.playerBase, state.playerBaseHp, state.playerBaseMaxHp, balance.sides.player, 'ИГРОК', 'left');
    drawBase(layout.enemyBase, state.enemyBaseHp, state.enemyBaseMaxHp, balance.sides.enemy, 'ВРАГ', 'right');
    drawLastStand();
    drawWavePreview(state);

    for (var i = 0; i < playerUnits.length; i++) drawUnit(playerUnits[i], balance.sides.player);
    for (var j = 0; j < enemyUnits.length; j++) drawUnit(enemyUnits[j], balance.sides.enemy);
    for (var m = 0; m < shots.length; m++) drawShot(shots[m]);
    for (var k = 0; k < dmgNumbers.length; k++) drawDamageNumber(dmgNumbers[k]);

    ctx.restore();
  }

  function drawBase(base, hp, maxHp, side, label, numberAlign) {
    ctx.fillStyle = side.fill;
    ctx.fillRect(base.x, base.y, base.w, base.h);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(base.x, base.y, base.w, base.h * 0.18);
    ctx.fillStyle = side.text;
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

  // Дистанция подкрепления и последний рубеж (ТЗ №06, блоки 1–2): тонкая
  // линия на полосе в точке подкрепления каждой стороны, полупрозрачная
  // дуга радиуса залпа у каждой базы. Цвет — существующая палитра стороны
  // (дефолт #9), новых цветов не вводим.
  function drawLastStand() {
    drawReinforceLine(layout.playerReinforceX, balance.sides.player);
    drawReinforceLine(layout.enemyReinforceX, balance.sides.enemy);

    var bd = balance.base_defense;
    if (!bd) return;
    var rangePx = bd.range_uw * layout.unitSize;
    drawBaseDefenseArc(layout.playerBase.frontX, balance.sides.player, rangePx);
    drawBaseDefenseArc(layout.enemyBase.frontX, balance.sides.enemy, rangePx);
  }

  function drawReinforceLine(x, side) {
    var size = layout.unitSize;
    ctx.strokeStyle = side.fill;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = Math.max(1, size * 0.04);
    ctx.beginPath();
    ctx.moveTo(x, layout.laneY - size * 0.9);
    ctx.lineTo(x, layout.laneY + size * 0.9);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawBaseDefenseArc(frontX, side, rangePx) {
    ctx.strokeStyle = side.fill;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = Math.max(1, layout.unitSize * 0.06);
    ctx.beginPath();
    ctx.arc(frontX, layout.laneY, rangePx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Превью следующей волны (фаза 2 ТЗ №05): те же силуэты, что у юнитов на
  // поле, плюс таймер — над вражеской базой, выше её полосы HP, чтобы не
  // перекрывать ни базу, ни лейн боя.
  function drawWavePreview(state) {
    if (!state.nextWaveType) return;
    var p = balance.wave_preview;
    var size = layout.unitSize;
    var spec = balance.units[state.nextWaveType];
    var side = balance.sides.enemy;
    var cy = layout.enemyBase.y - size * p.y_offset_uw;
    var iconSize = size * p.icon_scale;
    var iconCount = state.nextWaveCount >= 2 ? 2 : 1;
    var gap = size * p.icon_gap_uw;
    // Группа растёт влево от правого края базы (минус небольшой отступ),
    // а не центрируется на базе — иначе у самого правого края канваса
    // второй значок срезается рамкой экрана.
    var rightEdge = layout.enemyBase.x + layout.enemyBase.w - size * p.right_margin_uw;
    var lastIconCx = rightEdge - iconSize / 2;
    var startX = lastIconCx - (iconCount - 1) * gap;
    var cx = startX + ((iconCount - 1) * gap) / 2;

    for (var i = 0; i < iconCount; i++) {
      var ix = startX + i * gap;
      var x = ix - iconSize / 2;
      var y = cy - iconSize / 2;
      pathUnitShape(spec.shape, x, y, iconSize, iconSize);
      ctx.fillStyle = side.fill;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = Math.max(1, size * 0.03);
      ctx.stroke();
      ctx.fillStyle = side.text;
      ctx.font = 'bold ' + Math.round(size * p.font_scale_icon) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(state.nextWaveType, ix, y + iconSize / 2 + iconSize * 0.08);
    }

    var secondsLeft = Math.max(0, Math.ceil(state.nextWaveTime - state.timeElapsed));
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.round(size * p.font_scale_timer) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(secondsLeft + 'с', cx, cy + iconSize / 2 + size * 0.08);
  }

  // Форма — единственный несущий тип-сигнал в отрисовке юнита (плюс буква):
  // rect = боец, spike = стрелок (остриё — дальний бой), dome = щит (купол — держит фронт).
  function pathUnitShape(shape, x, y, w, h) {
    ctx.beginPath();
    if (shape === 'spike') {
      var neckY = y + h * 0.32;
      ctx.moveTo(x, neckY);
      ctx.lineTo(x + w / 2, y);
      ctx.lineTo(x + w, neckY);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
    } else if (shape === 'dome') {
      var domeH = h * 0.32;
      ctx.moveTo(x, y + domeH);
      ctx.quadraticCurveTo(x, y, x + w / 2, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + domeH);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
    } else {
      ctx.rect(x, y, w, h);
    }
  }

  function drawUnit(u, side) {
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

    // Заливка кодирует сторону (чья), форма — тип (какой). Обводка — только
    // для читаемости силуэта на фоне, сама по себе она ничего не сообщает
    // (тонкий контур на телефоне исчезает первым — вывод приёмки ТЗ №01).
    pathUnitShape(spec.shape, x, y, w, h);
    ctx.fillStyle = side.fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.stroke();

    if (u.flashT > 0) {
      pathUnitShape(spec.shape, x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,' + (u.flashT / (balance.juice.hit_flash_ms / 1000)) + ')';
      ctx.fill();
    }

    ctx.fillStyle = side.text;
    ctx.font = 'bold ' + Math.round(size * 0.4) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(u.type, u.x, y + h / 2 + h * 0.08);

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
