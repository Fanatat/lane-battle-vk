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

  var baseBalance = null; // сырой balance.json, не мутируется
  var battleBalance = null; // ТЗ №08: собран campaign.js под текущую битву (апгрейды + сложность)
  var campaignState = null;
  var saveGateOpen = false; // ТЗ №10, S-03: закрыт, пока Platform.load() не подтвердится (ok:true)
  var engine = null;
  var speedIndex = 0; // index into balance.speed_levels
  var paused = true; // ТЗ №09: старт на экране меню — движок ещё не создан

  // Джиттер (ТЗ №07, блок 2): по умолчанию каждый бой — новый сид, для
  // воспроизведения бага — ?seed=N или ?deterministic=1 в адресе (дефолт #6).
  var urlParams = new URLSearchParams(window.location.search);
  var deterministic = urlParams.get('deterministic') === '1';
  var fixedSeed = urlParams.has('seed') ? parseInt(urlParams.get('seed'), 10) : null;
  function rollSeed() { return fixedSeed !== null ? fixedSeed : Math.floor(Math.random() * 1e9); }

  // ---- layout (recomputed on resize, полностью из LaneEngine.computeLayout) ----
  var layout = {};
  // ТЗ №15: часы боя для фазы покоя rig (Rig.drawUnit анимация) — читаются
  // отрисовкой юнита без протаскивания state через каждый вызов.
  var frameTimeElapsed = 0;
  // ТЗ №15, блок 5.3: вспышка дуги обороны базы при залпе — таймеры вне
  // движка (juice, не бой), обнуляются при пересоздании движка в startBattle().
  var prevBaseDefCooldown = { player: 0, enemy: 0 };
  var baseDefFlashMs = { player: 0, enemy: 0 };

  // ТЗ №15, блок 3: анимация процедурная от состояния движка, не своих
  // таймеров — фаза ходьбы берётся от логической координаты юнита (детер-
  // министично, без дрейфа), замах — от cooldown относительно attack_speed.
  function unitAnim(u, spec, isPlayer) {
    // ТЗ №21 (QA-баг 4): задние ряды бьют с расширенного радиуса, ещё
    // физически доходя до contactRange (engine.js, u.advancing) — раньше
    // это всегда рендерилось как ATTACK-поза, ноги замирали, юнит скользил
    // под неподвижными ногами. Пока реально движется — играем ходьбу, не
    // застывший замах; сам замах начнётся, когда дойдёт и остановится.
    if (u.state === 'ATTACK' && u.advancing) {
      return { mode: 'walk', t: isPlayer ? u.x : -u.x };
    }
    if (u.state === 'ATTACK' || u.state === 'SIEGE') {
      var speed = spec.attack_speed > 0 ? spec.attack_speed : 1;
      return { mode: 'attack', t: 1 - Math.max(0, Math.min(1, u.cooldown / speed)) };
    }
    if (u.state === 'MOVE') {
      // ТЗ №21 (QA-баг 1): фаза шага раньше читалась прямо из u.x — у
      // игрока x растёт вперёд по бою, у врага, наоборот, УБЫВАЕТ (engine.js
      // dir = isPlayer?1:-1) — фаза шла назад во времени, походка враг
      // выглядела так, будто идёт задом наперёд (не то же самое, что
      // зеркалирование отрисовки ТЗ №20 — то отражает геометрию в
      // пространстве, это чинит направление течения фазы во времени).
      return { mode: 'walk', t: isPlayer ? u.x : -u.x };
    }
    return { mode: 'idle', t: frameTimeElapsed };
  }

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
    .then(async function (data) {
      baseBalance = data;
      resize();
      wireInput();
      drawStaticIcons();
      window.addEventListener('resize', resize);
      window.addEventListener('orientationchange', resize);
      requestAnimationFrame(loop);

      // ---- ТЗ №10: платформа + сейв (S-01/S-03/S-05) ----
      // Порядок как у эталона (game3/color_sort main.js boot()): init →
      // load → гейт записи открывается ТОЛЬКО на ok:true, иначе дефолты
      // остаются только в памяти и persist() ничего не пишет — иначе
      // первый же persist() полным объектом стёр бы реальный прогресс
      // на сбое сети при старте (S-03: сейв пишется всегда целиком).
      await Platform.init();
      // ТЗ №19 (повторный отказ п.2.14 — ТЗ №18 меняло только невидимый
      // атрибут lang, площадка требует РЕАЛЬНО видимую смену языка):
      // setLanguage() переключает словарь I18N и применяет его ко всем
      // [data-i18n]-элементам (i18n.js, эталон game3/color_sort).
      setLanguage(Platform.getLang());
      var loadResult = await Platform.load();
      if (loadResult.ok) {
        campaignState = window.LaneCampaign.migrateSave(loadResult.data);
        saveGateOpen = true;
      } else {
        console.error('[save] load() не удался при старте — играем на дефолтах, запись сейва отключена', loadResult.error);
        campaignState = window.LaneCampaign.freshCampaignState();
      }
      // ТЗ №19: топ-бар («Битва N») — статичный текст из index.html до
      // первого боя, applyStrings() его не трогает (число нужно). Без
      // этого вызова заголовок остаётся русским на EN до старта первой
      // битвы — обновляем сразу, как только язык и campaignState известны.
      updateCampaignHud();
      showMenu();
      Platform.gameReady();
      updateBuildBadge();
    })
    .catch(function (err) {
      document.body.innerHTML =
        '<pre style="color:#f66;background:#200;padding:16px;white-space:pre-wrap;">' +
        'Не удалось загрузить balance.json.\n' + String(err && err.stack || err) +
        '</pre>';
      throw err;
    });

  // ---------------- layout ----------------

  // ТЗ №07, блок 1: позиции юнитов — логические координаты 0..lane_length_logical,
  // не зависят от вьюпорта, поэтому ресайз/поворот экрана больше не требует
  // пересчёта позиций юнитов — только геометрии отрисовки.
  var cardsEl = document.getElementById('cards');

  function resize() {
    var cssW = canvas.clientWidth || window.innerWidth;
    var cssH = canvas.clientHeight || Math.round(window.innerHeight * 0.6);
    dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    var newLayout = window.LaneEngine.computeLayout(cssW, cssH, baseBalance.geometry);
    Object.keys(newLayout).forEach(function (k) { layout[k] = newLayout[k]; });

    // ТЗ №20 (QA-баг 2): плашка BUILD (position:fixed, левый нижний угол,
    // G-07(3)) раньше садилась ПОВЕРХ карточки юнита A — #cards занимает
    // весь нижний край экрана, «нижний левый угол вьюпорта» физически
    // совпадал с игровым контролом. Меряем реальную высоту #cards и
    // отодвигаем плашку выше неё через CSS-переменную (не магическое
    // число — карта либо контент карточек может измениться размером).
    if (cardsEl) {
      document.documentElement.style.setProperty('--cards-h', cardsEl.getBoundingClientRect().height + 'px');
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
    d.active = true; d.x = x; d.y = y; d.vy = -battleBalance.juice.damage_number_rise_px / (battleBalance.juice.damage_number_ms / 1000);
    d.age = 0; d.maxAge = battleBalance.juice.damage_number_ms / 1000; d.value = Math.round(value);
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
    s.age = 0; s.maxAge = battleBalance.juice.ranged_shot_ms / 1000;
  }

  // ---------------- battle lifecycle (ТЗ №08: кампания) ----------------

  // Собирает боевой balance под текущий номер битвы (апгрейды кампании +
  // сложность врага, campaign.js) и создаёт под него НОВЫЙ движок — battleBalance
  // меняется от битвы к битве (растущая сложность, апгрейды), поэтому движок
  // пересоздаётся, а не просто рестартуется на месте. Первые три битвы —
  // без джиттера (закон 1 ROADMAP.md, см. комментарий в tests/campaign_sim.js).
  function startBattle() {
    battleBalance = window.LaneCampaign.buildBattleBalance(baseBalance, campaignState, campaignState.battleNumber);
    for (var k = 0; k < dmgNumbers.length; k++) dmgNumbers[k].active = false;
    for (var m = 0; m < shots.length; m++) shots[m].active = false;
    prevBaseDefCooldown.player = 0; prevBaseDefCooldown.enemy = 0;
    baseDefFlashMs.player = 0; baseDefFlashMs.enemy = 0;
    resize();
    engine = window.LaneEngine.createEngine(battleBalance, layout, {
      onDamage: function (logicalX, y, value) { spawnDamageNumber(window.LaneEngine.logicalToPx(layout, logicalX), y, value); },
      onBaseDestroyed: showPopup,
      onRangedShot: function (fromX, fromY, toX, toY) {
        spawnShot(window.LaneEngine.logicalToPx(layout, fromX), fromY, window.LaneEngine.logicalToPx(layout, toX), toY);
      }
    }, { seed: rollSeed(), deterministic: deterministic || campaignState.battleNumber <= 3 });
    hidePopup();
    hideMenu();
    paused = false;
    updateSpeedButton();
    updateCardLocks();
    updateCampaignHud();
    updateHud();
  }

  // ---------------- menu / pause (ТЗ №09) ----------------

  var menuScreenEl = document.getElementById('menuScreen');
  var pauseScreenEl = document.getElementById('pauseScreen');

  // K-26: строка кнопки не обещает того, чего нет — «Играть» подошло бы
  // только первому запуску; при продолженной кампании (сейв реально
  // что-то восстановил) кнопка честно говорит «Продолжить».
  function showMenu() {
    var playBtnEl = document.getElementById('playBtn');
    if (playBtnEl) playBtnEl.textContent = campaignState && campaignState.battleNumber > 1 ? t('continueLabel') : t('play');
    updateDailyBonusButton();
    menuScreenEl.classList.remove('hidden');
  }
  function hideMenu() { menuScreenEl.classList.add('hidden'); }

  // ТЗ №11, N-12/K-24: ежедневный крючок возвращения. dailyAvailable —
  // чистая функция (не мутирует), безопасно звать на каждый показ меню.
  function updateDailyBonusButton() {
    var btn = document.getElementById('dailyBonusBtn');
    if (!campaignState || !window.LaneCampaign.dailyAvailable(campaignState, Platform.now())) {
      btn.classList.add('hidden');
      return;
    }
    btn.textContent = t('dailyBonus')
      .replace('{n}', campaignState.dailyStreak + 1)
      .replace('{icon}', baseBalance.campaign.currency_icon)
      .replace('{m}', baseBalance.campaign.daily.bonus_trophies);
    btn.classList.remove('hidden');
    btn.onclick = function () {
      var gained = window.LaneCampaign.claimDaily(baseBalance.campaign, campaignState, Platform.now());
      if (gained > 0) {
        campaignState.trophies += gained;
        persist();
      }
      updateDailyBonusButton();
    };
  }

  function openPause() {
    if (!engine || engine.getState().over) return; // нечего ставить на паузу без боя/после его конца
    paused = true;
    pauseScreenEl.classList.remove('hidden');
  }
  function closePause() {
    paused = false;
    pauseScreenEl.classList.add('hidden');
  }
  // K-19: пути, стирающего прогресс, в UI не существует — «Выйти в меню»
  // НЕ сбрасывает campaignState (иначе кнопка означала бы одновременно
  // «продолжить» и «стереть»). Прогресс уже сохранён по событиям
  // (persist() после каждой покупки/битвы, ТЗ №10) — «Играть» из меню
  // продолжит с того же campaignState.battleNumber.
  function exitToMenu() {
    pauseScreenEl.classList.add('hidden');
    engine = null;
    paused = true;
    showMenu();
  }

  // Рестарт ТЕКУЩЕЙ битвы (тот же номер, тот же battleBalance) — дев-панель
  // и повторная попытка без продвижения кампании.
  function restartCurrentBattle() {
    for (var k = 0; k < dmgNumbers.length; k++) dmgNumbers[k].active = false;
    for (var m = 0; m < shots.length; m++) shots[m].active = false;
    engine.restart(rollSeed());
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
    el.style.setProperty('--shake-ms', battleBalance.juice.card_shake_ms + 'ms');
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

    var speedMult = battleBalance.speed_levels[speedIndex];
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
    // ТЗ №15, блок 5.3: вспышка дуги обороны при залпе — детект по росту
    // cooldown'а движка (сбросился на bd.cooldown = только что выстрелил),
    // без отдельного хука движка (та же цена, что у juice-таймеров выше).
    var flashMs = battleBalance.juice.base_def_flash_ms;
    if (state.playerBaseDefCooldown > prevBaseDefCooldown.player) baseDefFlashMs.player = flashMs;
    if (state.enemyBaseDefCooldown > prevBaseDefCooldown.enemy) baseDefFlashMs.enemy = flashMs;
    prevBaseDefCooldown.player = state.playerBaseDefCooldown;
    prevBaseDefCooldown.enemy = state.enemyBaseDefCooldown;
    if (baseDefFlashMs.player > 0) baseDefFlashMs.player = Math.max(0, baseDefFlashMs.player - realDt * 1000);
    if (baseDefFlashMs.enemy > 0) baseDefFlashMs.enemy = Math.max(0, baseDefFlashMs.enemy - realDt * 1000);
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
    frameTimeElapsed = state.timeElapsed;
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

    // ТЗ №16, п.3.1/3.2: верх кадра до земли красится тёплым задником
    // (существующий цвет палитры paper-panel, новых не вводим) ДО земли и
    // юнитов — иначе пустой бумажный верх кадра даёт критерий 5 (доля
    // пустого фона ≤45%) провал при любом масштабе юнита. Заливка на весь
    // канвас (включая низ под землёй) стоила ~15fps на 24 юнитах при 1920 —
    // не нужна: низ и так по большей части занят землёй/HP-барами/подписью.
    var groundY = layout.laneY + layout.unitSize * 0.48;
    var groundH = layout.unitSize * 0.35;
    ctx.fillStyle = '#e9dcbd';
    ctx.fillRect(0, 0, layout.w, groundY);
    // ТЗ №13, блок 1: полоса земли с фактурой вместо отладочной линии.
    window.Rig.drawGroundBand(ctx, layout.w, groundY, groundH, '#e3d3a8', 'rgba(139,113,74,0.35)');
    // ТЗ №15, раздел 2, блок 5.4: редкий орнамент верха кадра — светлее
    // силуэтов, вне зоны HP-баров/подписей баз (те начинаются заметно ниже).
    window.Rig.drawTopBanner(ctx, layout.w, layout.unitSize * 0.12, layout.unitSize * 0.14, 'rgba(183,164,126,0.6)', '#ddccaa');

    drawBase(layout.playerBase, state.playerBaseHp, state.playerBaseMaxHp, battleBalance.sides.player, t('player'), 'left', true);
    drawBase(layout.enemyBase, state.enemyBaseHp, state.enemyBaseMaxHp, battleBalance.sides.enemy, t('enemy'), 'right', false);
    drawLastStand();
    drawWavePreview(state);

    for (var i = 0; i < playerUnits.length; i++) drawUnit(playerUnits[i], battleBalance.sides.player, true);
    for (var j = 0; j < enemyUnits.length; j++) drawUnit(enemyUnits[j], battleBalance.sides.enemy, false);
    for (var m = 0; m < shots.length; m++) drawShot(shots[m]);
    for (var k = 0; k < dmgNumbers.length; k++) drawDamageNumber(dmgNumbers[k]);

    ctx.restore();
  }

  // ТЗ №15, блок 4: башня/частокол вместо прежнего тематического укрепления
  // (window.Rig.drawBaseStructure) — прямоугольник остаётся хит-боксом
  // геометрии (не трогаем layout), сверху рисуется силуэт укрепления.
  // Подпись стороны — Rig.drawClampedLabel: измеряет реальную ширину
  // текста и клэмпит X внутрь канваса, дефект обрезки края (ТЗ №01) чинится
  // измерением, а не подгонкой отступа на глаз.
  function drawBase(base, hp, maxHp, side, label, numberAlign, isPlayer) {
    // Столб-основание (как раньше, ТЗ №01-12) держит контраст подписи —
    // укрепление рисуется НАД ним отдельной надстройкой (Rig), не вместо.
    ctx.fillStyle = side.fill;
    ctx.fillRect(base.x, base.y, base.w, base.h);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(base.x, base.y, base.w, base.h * 0.18);
    window.Rig.drawBaseStructure(ctx, base, isPlayer, side.fill, 'rgba(0,0,0,0.4)');

    var fontPx = Math.round(layout.unitSize * 0.22);
    window.Rig.drawClampedLabel(
      ctx, label, base.x + base.w / 2, base.y + base.h * 0.62, layout.w,
      'bold ' + fontPx + 'px Georgia, "Times New Roman", serif', side.text, fontPx * 0.4
    );

    drawHpBar(base.x, base.y - layout.unitSize * 0.3, base.w, layout.unitSize * 0.18, hp, maxHp, numberAlign);
  }

  // numberAlign: falsy = no number (unit HP bars); 'left'/'right' = base HP bars,
  // anchored so the wider "current / max" label never clips off the canvas edge.
  function drawHpBar(x, y, w, h, hp, maxHp, numberAlign) {
    var frac = maxHp > 0 ? Math.max(0, hp / maxHp) : 0;
    ctx.fillStyle = '#3a2c1c';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = frac > 0.5 ? '#6f8f45' : (frac > 0.2 ? '#d9a441' : '#b5482f');
    ctx.fillRect(x, y, w * frac, h);
    ctx.strokeStyle = 'rgba(58,44,28,0.5)';
    ctx.strokeRect(x, y, w, h);
    if (numberAlign) {
      ctx.fillStyle = '#3a2c1c';
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

  // ТЗ №15, критерий 5: полоса HP юнита — тоньше базовой, со скруглением
  // и тёмной подложкой (переиспользует ту же палитру, что и drawHpBar).
  // Ширина/позиция задаются вызывающим кодом по силуэту роли (rig.bodyBarW),
  // не по слоту юнита.
  function drawUnitHpBar(x, y, w, h, hp, maxHp) {
    var frac = maxHp > 0 ? Math.max(0, hp / maxHp) : 0;
    var r = h / 2;
    ctx.fillStyle = '#3a2c1c';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    if (frac > 0) {
      ctx.fillStyle = frac > 0.5 ? '#6f8f45' : (frac > 0.2 ? '#d9a441' : '#b5482f');
      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(h, w * frac), h, r);
      ctx.fill();
    }
  }

  // Дистанция подкрепления и последний рубеж (ТЗ №06, блоки 1–2): тонкая
  // линия на полосе в точке подкрепления каждой стороны, локальная дуга
  // обороны у подножия каждой базы (ТЗ №15, блок 5.3). Цвет — существующая
  // палитра стороны (дефолт #9), новых цветов не вводим.
  function drawLastStand() {
    drawReinforceLine(layout.playerReinforceX, battleBalance.sides.player);
    drawReinforceLine(layout.enemyReinforceX, battleBalance.sides.enemy);

    var bd = battleBalance.base_defense;
    if (!bd) return;
    var rangePx = bd.range_logical * layout.pxPerLogical;
    // Раздел 2, блок 5.3 / критерий 7: "вместо окружности через весь экран —
    // локальная дуга у подножия базы", не пересекает более трети ширины
    // поля. bd.range_logical — реальная боевая дистанция (не трогаем,
    // Block 4 п.5), но ИНДИКАТОР дистанции рисуется урезанным радиусом —
    // отображение приближённое, как превью волны без точных цифр.
    var visualR = Math.min(rangePx, layout.w * 0.15);
    drawBaseDefenseArc(layout.playerBase.frontX, battleBalance.sides.player, visualR, 0, baseDefFlashMs.player);
    drawBaseDefenseArc(layout.enemyBase.frontX, battleBalance.sides.enemy, visualR, Math.PI, baseDefFlashMs.enemy);
  }

  // ТЗ №13, блок 1: пунктирная метка вместо голой отладочной линии, та же
  // палитра стороны (дефолт #9 ТЗ №06, новых цветов не вводим).
  function drawReinforceLine(x, side) {
    var size = layout.unitSize;
    ctx.strokeStyle = side.fill;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = Math.max(1, size * 0.04);
    ctx.setLineDash([size * 0.10, size * 0.08]);
    ctx.beginPath();
    ctx.moveTo(x, layout.laneY - size * 0.9);
    ctx.lineTo(x, layout.laneY + size * 0.9);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // facingAngle: 0 = сектор смотрит вправо (игрок), Math.PI = влево (враг) —
  // сектор ±ARC_HALF вокруг направления вглубь полосы, не полная окружность
  // (ТЗ №15, блок 5.3). flashMs>0 — вспышка от только что отработавшего
  // залпа (ярче на затухающую долю flashMs/base_def_flash_ms). ТЗ №16,
  // п.3.3: раньше здесь была бледная ЛИНИЯ через пол-экрана — читалась как
  // случайная кривая; теперь ЗАЛИВКА сектора у подножия башни (клин от
  // центра, не контур), видна и без залпа за счёт фоновой прозрачности.
  var ARC_HALF = 0.95; // рад, ~54° в каждую сторону от направления полосы
  function drawBaseDefenseArc(frontX, side, rangePx, facingAngle, flashMs) {
    var flashFrac = battleBalance.juice.base_def_flash_ms > 0 ? flashMs / battleBalance.juice.base_def_flash_ms : 0;
    ctx.fillStyle = side.fill;
    ctx.globalAlpha = 0.16 + flashFrac * 0.5;
    ctx.beginPath();
    ctx.moveTo(frontX, layout.laneY);
    ctx.arc(frontX, layout.laneY, rangePx, facingAngle - ARC_HALF, facingAngle + ARC_HALF);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Превью следующей волны (фаза 2 ТЗ №05): те же силуэты, что у юнитов на
  // поле, плюс таймер — над вражеской базой, выше её полосы HP, чтобы не
  // перекрывать ни базу, ни лейн боя.
  function drawWavePreview(state) {
    if (!state.nextWaveType) return;
    var p = battleBalance.wave_preview;
    var size = layout.unitSize;
    var spec = battleBalance.units[state.nextWaveType];
    var side = battleBalance.sides.enemy;
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
      // ТЗ №13, блок 2: ни одной буквы-обозначения типа на поле — превью
      // несёт тип силуэтом (тем же rig, что и юнит в бою), без надписи.
      window.Rig.drawUnit(ctx, spec.shape, false, x, y, iconSize, iconSize, side.fill, 'rgba(0,0,0,0.4)', Math.max(1, size * 0.03), { mode: 'idle', t: frameTimeElapsed });
    }

    var secondsLeft = Math.max(0, Math.ceil(state.nextWaveTime - state.timeElapsed));
    ctx.fillStyle = '#3a2c1c';
    ctx.font = 'bold ' + Math.round(size * p.font_scale_timer) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(secondsLeft + t('secShort'), cx, cy + iconSize / 2 + size * 0.08);
  }

  function drawUnit(u, side, isPlayer) {
    if (!u.active) return;
    var spec = battleBalance.units[u.type];
    var size = layout.unitSize;
    var squash = 1;
    if (u.squashT > 0) {
      var t = 1 - (u.squashT / (battleBalance.juice.spawn_squash_ms / 1000));
      squash = battleBalance.juice.spawn_squash_scale + (1 - battleBalance.juice.spawn_squash_scale) * t;
    }
    var sx = window.LaneEngine.logicalToPx(layout, u.x); // ТЗ №07, блок 1: u.x — логическая координата
    var w = size * 0.82;
    var h = size * squash;
    var x = sx - w / 2;
    var groundY = u.y + size / 2; // fixed baseline: unit grows upward from the lane as it squashes
    var y = groundY - h;
    var anim = unitAnim(u, spec, isPlayer);

    // Заливка кодирует сторону (чья), rig+пропы — роль (какую). Ни одной
    // буквы на поле (ТЗ №13, блок 2, перенесено в ТЗ №15) — силуэт из
    // rig.js несёт весь роль-сигнал сам по себе (габариты+пропы РАЗНЫЕ).
    var rig = window.Rig.drawUnit(ctx, spec.shape, isPlayer, x, y, w, h, side.fill, 'rgba(0,0,0,0.4)', Math.max(1, size * 0.03), anim);

    if (u.flashT > 0) {
      ctx.beginPath();
      window.Rig.pathUnitFillShapes(ctx, spec.shape, isPlayer, x, y, w, h, anim);
      ctx.fillStyle = 'rgba(255,255,255,' + (u.flashT / (battleBalance.juice.hit_flash_ms / 1000)) + ')';
      ctx.fill();
    }

    // ТЗ №16, критерий 7: полоса HP юнита рисуется ТОЛЬКО при неполном
    // здоровье — на полном HP она висела шапкой над каждой головой и
    // конкурировала с силуэтом (раздел 4, п.4.1).
    if (u.hp < u.maxHp) {
      // ТЗ №15, критерий 5: полоса HP не шире силуэта роли (rig.bodyBarW —
      // реальная ширина тела по плечам, не декоративный масштаб слота
      // rig.figW), тоньше прежней, зазор от макушки ≤ высоты полосы, одна
      // высота внутри стороны.
      var barH = size * 0.07;
      var barGap = barH * 0.5; // ≤ высоты полосы (критерий 5)
      drawUnitHpBar(sx - rig.bodyBarW / 2, rig.propTopY - barGap - barH, rig.bodyBarW, barH, u.hp, u.maxHp);
    }
  }

  function drawDamageNumber(d) {
    if (!d.active) return;
    var t = d.age / d.maxAge;
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.fillStyle = '#b5482f';
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
    ctx.strokeStyle = battleBalance.juice.ranged_shot_color;
    ctx.lineWidth = Math.max(1, layout.unitSize * 0.05);
    ctx.beginPath();
    ctx.moveTo(s.fromX, s.fromY);
    ctx.lineTo(s.toX, s.toY);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ---------------- статичные иконки карточек/меню (ТЗ №13, блок 3) ----------------
  // Рисуются ОДИН РАЗ на загрузке (не каждый кадр — это не игровой канвас):
  // карточки спавна используют силуэт+заливку своей стороны (игрок),
  // значки меню — состав ростера тем же кодом отрисовки, что и в бою.
  function drawStaticIcons() {
    var side = baseBalance.sides.player;
    ['A', 'B', 'C'].forEach(function (type) {
      var spec = baseBalance.units[type];
      drawIconCanvas(document.querySelector('#card-' + type + ' .unitIcon'), spec.shape, side);
      drawIconCanvas(document.getElementById('menuIcon' + type), spec.shape, side);
    });
  }

  function drawIconCanvas(canvasEl, shape, side) {
    if (!canvasEl) return;
    var iw = canvasEl.width, ih = canvasEl.height;
    var ictx = canvasEl.getContext('2d');
    ictx.clearRect(0, 0, iw, ih);
    var pad = iw * 0.12;
    window.Rig.drawUnit(ictx, shape, true, pad, pad, iw - pad * 2, ih - pad * 2, side.fill, 'rgba(0,0,0,0.5)', Math.max(1, iw * 0.05), { mode: 'idle', t: 0 });
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
  var battleLabelEl = document.getElementById('battleLabel');
  var trophyValueEl = document.getElementById('trophyValue');
  var upgradeShopEl = document.getElementById('upgradeShop');

  function updateHud() {
    var state = engine.getState();
    foodValueEl.textContent = Math.floor(state.food);
    foodCapEl.textContent = state.foodCap;
    foodBarFillEl.style.width = (state.foodCap > 0 ? (state.food / state.foodCap) * 100 : 0) + '%';

    ['A', 'B', 'C'].forEach(function (type) {
      if (!battleBalance.campaignUnlocked[type]) return; // updateCardLocks владеет видом запертой карты
      var cost = battleBalance.units[type].cost;
      var el = cardEls[type];
      var costEl = el.querySelector('.cost');
      costEl.textContent = cost;
      el.classList.toggle('disabled', state.over || state.food < cost);
    });
  }

  // ТЗ №08: карта закрытого в кампании типа выглядит иначе, чем «не хватает
  // еды» — постоянный замок, не мигающий disabled. Дёргается один раз на
  // старте битвы (список открытых типов не меняется посреди боя).
  function updateCardLocks() {
    ['A', 'B', 'C'].forEach(function (type) {
      var el = cardEls[type];
      var costEl = el.querySelector('.cost');
      var locked = !battleBalance.campaignUnlocked[type];
      el.classList.toggle('locked', locked);
      el.classList.toggle('disabled', locked);
      costEl.textContent = locked ? '🔒' : battleBalance.units[type].cost;
    });
  }

  function updateCampaignHud() {
    battleLabelEl.textContent = t('battleLabel').replace('{n}', campaignState.battleNumber);
    trophyValueEl.textContent = campaignState.trophies;
  }

  // ТЗ №10: запись по событиям (S-04) — вызывается в каждой точке, где
  // campaignState реально меняется (после битвы, после покупки), а не
  // таймером. Гейт (S-03) не даёт затереть реальный сейв дефолтами, пока
  // load() при старте не подтвердился. Сторож объёма (S-06) меряет
  // РЕАЛЬНЫЕ байты, не полагается на «должно влезать».
  function persist() {
    if (!saveGateOpen) {
      console.warn('[save] запись пропущена — сейв ещё не подтверждён (гейт закрыт)');
      return;
    }
    var payload = window.LaneCampaign.serializeForSave(campaignState);
    if (typeof Platform.SAVE_SIZE_GUARD_BYTES === 'number') {
      var sizeBytes = new Blob([JSON.stringify(payload)]).size;
      if (sizeBytes > Platform.SAVE_SIZE_GUARD_BYTES) {
        console.error('[save] СЕЙВ ПРЕВЫСИЛ БЮДЖЕТ СТОРОЖА: ' + sizeBytes + ' байт > ' + Platform.SAVE_SIZE_GUARD_BYTES);
      }
    }
    Platform.save(payload);
  }

  function advanceBattle() {
    campaignState.battleNumber++;
    persist();
    startBattle();
  }

  // ТЗ №13, блок 4 (R-04, G-04): режим гейта подставляется build.py
  // ТОЧЕЧНОЙ ЗАМЕНОЙ этой строки-плейсхолдера в СОБРАННОЙ копии main.js —
  // НЕ рантайм-флагом (URL/localStorage и т.п. сюда не годятся, дефолт
  // #8 ТЗ). На несобранном исходнике (dev-сервер, все текущие тесты)
  // плейсхолдер не заменён и трактуется как ВК-режим — тот же гейт по
  // campaign.ads, что был универсальным с ТЗ №11, без изменения поведения
  // против raw index.html.
  var AD_GATE_MODE = '__AD_GATE_MODE__';

  // ТЗ №11/13: гейт interstitial МЕЖДУ битвами. R-04 — на Яндексе частотой
  // управляет платформа САМА, свой гейт не строим (вызываем ВСЕГДА, SDK
  // решает, показывать ли реально; main.js.wireInput уже игнорирует
  // wasShown и продолжает игру в любом случае). На ВК частоту/кулдаун
  // задаёт игра числами campaign.ads (решение основателя, см. BLOCKERS.md).
  var lastInterstitialAtMs = null;
  function shouldShowInterstitial() {
    if (AD_GATE_MODE === 'yandex') return true;
    var ads = baseBalance.campaign.ads;
    if (campaignState.battleNumber % ads.interstitial_every_n_battles !== 0) return false;
    var now = Platform.now();
    if (lastInterstitialAtMs !== null && (now - lastInterstitialAtMs) < ads.interstitial_cooldown_s * 1000) return false;
    lastInterstitialAtMs = now;
    return true;
  }

  function updateSpeedButton() {
    speedBtnEl.textContent = '×' + battleBalance.speed_levels[speedIndex];
  }

  // ТЗ №12, G-07(3): плашка видна ТОЛЬКО когда build.py реально подставил
  // BUILD в СОБРАННУЮ копию (не сырой плейсхолдер платформы,
  // typeof-гейт — тот же приём, что у эталона game3). ?nobuild=1 прячет
  // плашку перед промо-скриншотом без обращения к платформе.
  function updateBuildBadge() {
    var el = document.getElementById('buildBadge');
    if (!el) return;
    if (typeof Platform.BUILD !== 'string' || Platform.BUILD.indexOf('__') === 0) return;
    if (urlParams.has('nobuild')) return;
    el.textContent = Platform.BUILD;
    el.classList.remove('hidden');
  }

  function showPopup(result) {
    var state = engine.getState();
    var won = result === 'WIN';
    var gained = window.LaneCampaign.reward(baseBalance, campaignState.battleNumber, won);
    campaignState.trophies += gained;

    // Закон 9/K-18: финал-событие. Кампания бесконечна (N-08) — это не
    // "конец игры" (не обещаем того, чего нет, K-26), а рубеж по НОМЕРУ
    // битвы, а не по её исходу — "дошёл до рубежа" верно и при победе, и
    // при поражении (кампания продолжается в обоих случаях, ТЗ №08), в
    // отличие от "глава ПРОЙДЕНА", что было бы ложью после поражения.
    var reachedMilestone = campaignState.battleNumber === baseBalance.campaign.milestone_battle && !campaignState.milestoneShown;
    if (reachedMilestone) campaignState.milestoneShown = true;

    updateCampaignHud();
    persist();

    popupTitleEl.textContent = won ? t('win') : t('lose');
    var seconds = state.timeElapsed.toFixed(1);
    popupStatsEl.textContent =
      (reachedMilestone ? t('milestoneLine').replace('{n}', campaignState.battleNumber) : '') +
      t('battleLabel').replace('{n}', campaignState.battleNumber) + '\n' +
      t('statsDuration').replace('{s}', seconds) + '\n' +
      t('statsSpawned').replace('{n}', state.spawnedCount) + '\n' +
      t('statsKilled').replace('{n}', state.killedCount) + '\n' +
      t('statsGained').replace('{icon}', baseBalance.campaign.currency_icon).replace('{n}', gained).replace('{total}', campaignState.trophies);
    setupRewardedBonusButton(gained);
    buildUpgradeShop();
    restartBtnEl.textContent = t('restartNext').replace('{n}', campaignState.battleNumber + 1);
    popupEl.classList.remove('hidden');
  }

  // ТЗ №11: rewarded — бонус ПОВЕРХ обычной награды, не вместо (R-09: база
  // бесплатна). Кнопка НИКОГДА не прячется при недоступности рекламы
  // (R-07) — showRewarded уже гарантирует бесплатную выдачу в dev-режиме/
  // при сбое (platform.js), поэтому здесь просто всегда показываем кнопку
  // и один раз реагируем на клик за попап (одна попытка на битву).
  function setupRewardedBonusButton(baseGained) {
    var btn = document.getElementById('rewardedBonusBtn');
    var bonus = Math.round(baseGained * baseBalance.campaign.ads.rewarded_bonus_fraction);
    btn.textContent = t('rewardedBonus').replace('{n}', bonus);
    btn.classList.remove('hidden');
    btn.disabled = false;
    btn.onclick = function () {
      btn.disabled = true;
      Platform.showRewarded(function onRewarded() {
        campaignState.trophies += bonus;
        updateCampaignHud();
        persist();
        btn.textContent = t('rewardedGranted').replace('{n}', bonus).replace('{icon}', baseBalance.campaign.currency_icon);
        btn.classList.add('hidden');
      }, null, null);
    };
  }
  function hidePopup() {
    popupEl.classList.add('hidden');
  }

  // Магазин апгрейдов (ТЗ №08, ГРАФ_РАЗБЛОКИРОВОК_ТЗ08.md) — перерисовывается
  // целиком на каждое открытие попапа и после каждой покупки (onclick, не
  // addEventListener — CLAUDE.md: на перерисовываемых экранах копятся дубли
  // при addEventListener).
  var UNLOCK_KEYS = { unlock_B: true, unlock_C: true };
  function buildUpgradeShop() {
    var campaign = baseBalance.campaign;
    upgradeShopEl.innerHTML = '';

    // ТЗ №19: def.label — русский текст из balance.json (структуру не
    // трогаем), для отображения берём перевод из i18n.js по тому же ключу
    // ('upg_' + key), не из JSON — RU-рендер byte-идентичен прежнему.
    var unlockHeader = document.createElement('h2');
    unlockHeader.textContent = t('unlocksHeader');
    upgradeShopEl.appendChild(unlockHeader);
    Object.keys(campaign.unlocks).forEach(function (key) {
      if (campaignState.unlocked[key]) return;
      var def = campaign.unlocks[key];
      var canBuy = window.LaneCampaign.canBuyUnlock(campaign, key, campaignState);
      var locked = def.requires && !campaignState.unlocked[def.requires];
      upgradeShopEl.appendChild(buildShopRow(
        t('upg_' + key), locked ? t('needsUnlock').replace('{label}', t('upg_' + def.requires)) : '',
        def.cost, canBuy, function () { buyAndRefresh(function () { return window.LaneCampaign.buyUnlock(campaign, key, campaignState); }); }
      ));
    });

    var upgHeader = document.createElement('h2');
    upgHeader.textContent = t('upgradesHeader');
    upgradeShopEl.appendChild(upgHeader);
    Object.keys(campaign.upgrades).forEach(function (key) {
      var def = campaign.upgrades[key];
      var level = campaignState.levels[key];
      var locked = def.requires && !campaignState.unlocked[def.requires];
      if (locked) return; // недоступные пока апгрейды не показываем (граф — это последовательность, не витрина)
      var cost = window.LaneCampaign.upgradeCost(campaign, key, campaignState);
      var maxed = cost === null;
      var canBuy = !maxed && window.LaneCampaign.canBuyUpgrade(campaign, key, campaignState);
      upgradeShopEl.appendChild(buildShopRow(
        t('upg_' + key), t('upgradeLevel').replace('{n}', level) + (maxed ? t('maxedSuffix') : ''),
        maxed ? null : cost, canBuy, function () { buyAndRefresh(function () { return window.LaneCampaign.buyUpgrade(campaign, key, campaignState); }); }
      ));
    });
  }

  function buildShopRow(label, sub, cost, canBuy, onBuy) {
    var row = document.createElement('div');
    row.className = 'upgradeItem';
    var text = document.createElement('div');
    text.innerHTML = '<div class="upgLabel">' + label + '</div><div class="upgLevel">' + sub + '</div>';
    row.appendChild(text);
    var btn = document.createElement('button');
    btn.textContent = cost === null ? '—' : (baseBalance.campaign.currency_icon + ' ' + cost);
    btn.disabled = cost === null || !canBuy;
    btn.onclick = onBuy;
    row.appendChild(btn);
    return row;
  }

  function buyAndRefresh(action) {
    if (action()) {
      updateCampaignHud();
      buildUpgradeShop();
      persist();
    }
  }

  // Требования площадки, п.1.6.1.1/1.6.3.1: доступен полноэкранный режим.
  // Кнопка показывается только если API реально доступен (feature-detect —
  // некоторые встраиваемые iframe без allow="fullscreen" его не дают, тест-
  // окружения Playwright тоже иногда без него): скрытая кнопка лучше
  // мёртвой. Вызов — try/catch: браузер может отклонить запрос вне жеста
  // пользователя или в кросс-origin iframe без разрешения, это не баг игры.
  function fullscreenSupported() {
    var el = document.documentElement;
    return !!(el.requestFullscreen || el.webkitRequestFullscreen) &&
      !!(document.exitFullscreen || document.webkitExitFullscreen);
  }
  function toggleFullscreen() {
    try {
      var isFs = document.fullscreenElement || document.webkitFullscreenElement;
      if (!isFs) {
        var el = document.documentElement;
        (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      }
    } catch (e) { /* платформа отклонила — тихо, кнопка не роняет игру */ }
  }

  function wireInput() {
    var fsBtn = document.getElementById('fullscreenBtn');
    if (fullscreenSupported()) {
      fsBtn.classList.remove('hidden');
      fsBtn.onclick = toggleFullscreen;
    }
    speedBtnEl.onclick = function () {
      speedIndex = (speedIndex + 1) % battleBalance.speed_levels.length;
      updateSpeedButton();
    };
    restartBtnEl.onclick = function () {
      // R-01: вызов рекламы — ПЕРВАЯ инструкция обработчика, до неё ни
      // одного await/сохранения/отрисовки — всё остальное уезжает в
      // колбэк закрытия (advanceBattle).
      if (shouldShowInterstitial()) {
        Platform.showInterstitial(null, function () { advanceBattle(); });
      } else {
        advanceBattle();
      }
    };
    Object.keys(cardEls).forEach(function (type) {
      cardEls[type].onclick = function () { trySpawnFromCard(type); };
      cardEls[type].ontouchend = function (e) { e.preventDefault(); trySpawnFromCard(type); };
    });

    document.getElementById('playBtn').onclick = function () { startBattle(); };
    document.getElementById('pauseBtn').onclick = function () { openPause(); };
    document.getElementById('pauseResumeBtn').onclick = function () { closePause(); };
    document.getElementById('pauseMenuBtn').onclick = function () { exitToMenu(); };
  }

  // ---------------- expose for dev.js ----------------

  window.Game = {
    getBalance: function () { return battleBalance; },
    getLayout: function () { return layout; },
    getState: function () { return engine ? engine.getState() : null; },
    getCampaignState: function () { return campaignState; },
    restart: function () { if (engine) restartCurrentBattle(); },
    resetCampaign: function () { campaignState = window.LaneCampaign.freshCampaignState(); startBattle(); },
    setPaused: function (p) { paused = p; },
    spawnEnemyDebug: function (type) { if (engine) engine.spawnEnemy(type); },
    spawnPlayerDebug: function (type) { if (engine) engine.spawnPlayer(type); },
    isDeterministic: function () { return engine ? engine.isDeterministic() : null; },
    getSeed: function () { return engine ? engine.getSeed() : null; }
  };
})();
