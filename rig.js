/*
 * rig.js — ТЗ №15: единый стик-rig для всех юнитов обеих сторон (A-16).
 * Одно тело (голова-круг, глаза-овалы, корпус, руки/ноги по два сустава),
 * роль и сторона задаются ПРОПАМИ, ГАБАРИТАМИ и СВЕТЛОТОЙ заливки — не
 * переделкой анатомии (ТЗ раздел 1). Модуль самодостаточен: не знает о
 * balance.json, engine.js или DOM — только геометрия по параметрам, чтобы
 * его можно было перенести в следующую игру студии без правок (A-12).
 *
 * Контракт: shape ('rect'|'spike'|'dome') — тот же ключ, что был у формы
 * силуэта до этого ТЗ (theme_art.js, ТЗ №13), переосмыслен как РОЛЬ:
 * rect=боец, spike=стрелок, dome=щит. Числа/структура balance.json не
 * менялись — та же отстройка, что и раньше, другой рисующий код.
 *
 * anim = { mode: 'walk'|'attack'|'idle', t: number } — фаза анимации
 * приходит СНАРУЖИ (main.js вычисляет её из состояния юнита движка), сам
 * rig о движке ничего не знает (ТЗ раздел 2, блок 1: "игровая логика о
 * внутренностях rig не знает" — верно и в обратную сторону).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Rig = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function addEllipse(ctx, cx, cy, rx, ry, rot) {
    rx = Math.max(0.5, rx); ry = Math.max(0.5, ry); rot = rot || 0;
    var startX = cx + rx * Math.cos(rot);
    var startY = cy + rx * Math.sin(rot);
    ctx.moveTo(startX, startY);
    ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
  }

  // ---------------- габариты роли (K-22 + ТЗ15 критерий 2) ----------------
  // Тот же rig, другие пропорции: стрелок заметно тоньше и выше бойца, щит
  // заметно ниже и шире (за счёт пропа, не корпуса) — раздел 2, блок 2.
  // headRFrac*2 + torsoFrac + legFrac держится ≈1 (плюс фиксированный
  // neckGap=0.03 в computeRig) — иначе голова вылезает выше topY=feetY-figH
  // (проверено проп-тестом: overflow клипался о верх канваса и ломал
  // сравнение bbox тела/пропа).
  function roleMetrics(shape) {
    if (shape === 'spike') { // стрелок
      return { hScale: 1.20, wScale: 0.60, headRFrac: 0.135, torsoFrac: 0.28, legFrac: 0.40, limbScale: 0.80 };
    }
    if (shape === 'dome') { // щит
      return { hScale: 0.56, wScale: 0.92, headRFrac: 0.19, torsoFrac: 0.27, legFrac: 0.32, limbScale: 1.20 };
    }
    return { hScale: 1.0, wScale: 0.86, headRFrac: 0.145, torsoFrac: 0.28, legFrac: 0.40, limbScale: 1.0 }; // боец
  }

  // ---------------- геометрия rig (общая для draw и flash-path) ----------------
  function computeRig(shape, x, y, w, h, anim) {
    anim = anim || { mode: 'idle', t: 0 };
    var m = roleMetrics(shape);
    var cx = x + w / 2;
    var feetY = y + h;
    var figH = h * m.hScale;
    var headR = figH * m.headRFrac;
    var neckGap = figH * 0.03;
    var torsoLen = figH * m.torsoFrac;
    var legLen = figH * m.legFrac;
    var hipY = feetY - legLen;
    var shoulderY = hipY - torsoLen;
    var headCy = shoulderY - neckGap - headR;

    // Покачивание корпуса в покое — всегда небольшое, поверх ходьбы/атаки,
    // чтобы юнит никогда не стоял истуканом (раздел 2, блок 3).
    var idleSway = Math.sin(anim.t * 2.1) * figH * 0.012;
    var lean = 0;

    var strideSpread = figH * 0.17 * (m.limbScale > 1 ? 0.85 : 1); // короче шаг у широкого щита
    var legSwingA = 0, legSwingB = 0, armSwingA = 0, armSwingB = 0;
    if (anim.mode === 'walk') {
      var strideFreq = 0.9; // логических единиц на цикл шага, деterministично от anim.t = u.x
      var phase = anim.t * strideFreq;
      legSwingA = Math.sin(phase) * strideSpread;
      legSwingB = Math.sin(phase + Math.PI) * strideSpread;
      armSwingA = Math.sin(phase + Math.PI) * strideSpread * 0.6;
      armSwingB = Math.sin(phase) * strideSpread * 0.6;
    } else if (anim.mode === 'attack') {
      // замах-удар: 0..1 за цикл атаки, пик размаха на середине (T-05 юз).
      var t = Math.max(0, Math.min(1, anim.t));
      var swing = Math.sin(t * Math.PI);
      armSwingA = -swing * figH * 0.30; // "оружейная" рука уходит вперёд/вверх
      armSwingB = swing * figH * 0.08;
      lean = swing * figH * 0.03;
    } else {
      armSwingA = idleSway * 0.6;
      armSwingB = -idleSway * 0.6;
    }

    var shoulderSpread = figH * 0.14 * m.limbScale;
    var hipSpread = figH * 0.11 * m.limbScale;
    var elbowDrop = figH * 0.15;
    var handDrop = figH * 0.15;
    var kneeDrop = legLen * 0.52;
    var footDrop = legLen * 0.48;

    return {
      m: m, cx: cx + lean, feetY: feetY, figH: figH, figW: w * m.wScale,
      // bodyBarW — реальная ширина тела (плечи+запас), НЕ то же самое, что
      // figW (масштаб слота для пропов/тени, декоративная величина): HP-бар
      // юнита (main.js критерий 5) обязан не быть шире РЕАЛЬНО нарисованных
      // конечностей, а не масштаба слота — плечи единственная величина,
      // которая эти конечности реально позиционирует.
      bodyBarW: shoulderSpread * 2.3,
      headCx: cx + lean, headCy: headCy + idleSway, headR: headR,
      // Верх шлема с гребнем/рогом (пропы, раздел 1) — самый высокий из
      // двух вариантов стороны с запасом, чтобы HP-бар не резал проп ни у
      // игрока, ни у врага (main.js критерий 5: зазор от макушки).
      propTopY: headCy + idleSway - headR * 1.95,
      shoulderY: shoulderY + idleSway, hipY: hipY,
      shoulderSpread: shoulderSpread, hipSpread: hipSpread,
      legL: { hx: cx - hipSpread, hy: hipY, kx: cx - hipSpread + legSwingA * 0.5, ky: hipY + kneeDrop, fx: cx - hipSpread + legSwingA, fy: feetY },
      legR: { hx: cx + hipSpread, hy: hipY, kx: cx + hipSpread + legSwingB * 0.5, ky: hipY + kneeDrop, fx: cx + hipSpread + legSwingB, fy: feetY },
      armL: { sx: cx - shoulderSpread + lean, sy: shoulderY + idleSway, ex: cx - shoulderSpread + armSwingA * 0.6 + lean, ey: shoulderY + idleSway + elbowDrop, hx: cx - shoulderSpread + armSwingA + lean, hy: shoulderY + idleSway + elbowDrop + handDrop },
      armR: { sx: cx + shoulderSpread + lean, sy: shoulderY + idleSway, ex: cx + shoulderSpread + armSwingB * 0.6 + lean, ey: shoulderY + idleSway + elbowDrop, hx: cx + shoulderSpread + armSwingB + lean, hy: shoulderY + idleSway + elbowDrop + handDrop }
    };
  }

  // ---------------- тело (общее для всех ролей) ----------------
  function pathHead(ctx, rig) {
    ctx.moveTo(rig.headCx + rig.headR, rig.headCy);
    ctx.arc(rig.headCx, rig.headCy, rig.headR, 0, Math.PI * 2);
  }

  function pathTorso(ctx, rig) {
    addEllipse(ctx, rig.cx, (rig.shoulderY + rig.hipY) / 2, rig.figH * 0.085, (rig.hipY - rig.shoulderY) / 2 + rig.figH * 0.02);
  }

  function drawLimbLine(ctx, ax, ay, bx, by, cx2, cy2) {
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cx2, cy2);
    ctx.stroke();
  }

  function drawLimbs(ctx, rig, strokeStyle, lineWidth) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = Math.max(1, lineWidth * rig.m.limbScale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawLimbLine(ctx, rig.legL.hx, rig.legL.hy, rig.legL.kx, rig.legL.ky, rig.legL.fx, rig.legL.fy);
    drawLimbLine(ctx, rig.legR.hx, rig.legR.hy, rig.legR.kx, rig.legR.ky, rig.legR.fx, rig.legR.fy);
    drawLimbLine(ctx, rig.armL.sx, rig.armL.sy, rig.armL.ex, rig.armL.ey, rig.armL.hx, rig.armL.hy);
    drawLimbLine(ctx, rig.armR.sx, rig.armR.sy, rig.armR.ex, rig.armR.ey, rig.armR.hx, rig.armR.hy);
  }

  function drawEyes(ctx, rig, strokeStyle) {
    var eyeR = rig.headR * 0.22;
    var offX = rig.headR * 0.42;
    var offY = -rig.headR * 0.08;
    ctx.fillStyle = strokeStyle;
    ctx.beginPath();
    addEllipse(ctx, rig.headCx - offX, rig.headCy + offY, eyeR, eyeR * 1.15);
    addEllipse(ctx, rig.headCx + offX, rig.headCy + offY, eyeR, eyeR * 1.15);
    ctx.fill();
  }

  // ---------------- пропы: обязаны выступать за контур тела (раздел 1) ----------------
  // helmet — та же роль, разная форма по СТОРОНЕ (не только заливка):
  // игрок — круглый шлем с гребнем, враг — гранёный шлем с рогом.
  function pathHelmet(ctx, rig, isPlayer) {
    var r = rig.headR * 1.22;
    if (isPlayer) {
      ctx.moveTo(rig.headCx + r, rig.headCy - rig.headR * 0.15);
      ctx.arc(rig.headCx, rig.headCy - rig.headR * 0.15, r, Math.PI, 0, false);
      // гребень — выступает над головой
      ctx.moveTo(rig.headCx - rig.headR * 0.10, rig.headCy - r * 0.85);
      ctx.lineTo(rig.headCx, rig.headCy - r * 1.55);
      ctx.lineTo(rig.headCx + rig.headR * 0.10, rig.headCy - r * 0.85);
      ctx.closePath();
    } else {
      ctx.moveTo(rig.headCx - r, rig.headCy - rig.headR * 0.05);
      ctx.lineTo(rig.headCx - r * 0.55, rig.headCy - r * 1.05);
      ctx.lineTo(rig.headCx + r * 0.55, rig.headCy - r * 1.05);
      ctx.lineTo(rig.headCx + r, rig.headCy - rig.headR * 0.05);
      ctx.closePath();
      // рог — выступает вбок
      ctx.moveTo(rig.headCx + r * 0.55, rig.headCy - r * 0.9);
      ctx.lineTo(rig.headCx + r * 1.55, rig.headCy - r * 1.15);
      ctx.lineTo(rig.headCx + r * 0.75, rig.headCy - r * 0.55);
      ctx.closePath();
    }
  }

  // короткое оружие бойца/щита — в руке, явно выступает за кисть.
  function drawMeleeWeapon(ctx, rig, hand, fillStyle, strokeStyle, lineWidth) {
    var dx = hand.hx - hand.ex, dy = hand.hy - hand.ey;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len;
    var tipX = hand.hx + ux * rig.figH * 0.30;
    var tipY = hand.hy + uy * rig.figH * 0.30;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = Math.max(1, lineWidth * 0.9);
    ctx.beginPath();
    ctx.moveTo(hand.hx, hand.hy);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.beginPath();
    addEllipse(ctx, tipX, tipY, rig.figH * 0.06, rig.figH * 0.06);
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = Math.max(1, lineWidth * 0.7);
    ctx.stroke();
  }

  // лук стрелка — небольшая дуга, выступающая вбок от кисти (не полукруг
  // через всю фигуру — прежний угловой диапазон разворачивался "длинным"
  // путём и рисовал почти полную окружность вместо лука).
  function drawBow(ctx, rig, hand, strokeStyle, lineWidth) {
    var bowR = rig.figH * 0.29;
    var half = 0.78; // рад, ~45° в каждую сторону от направления кисти
    var ccx = hand.hx, ccy = hand.hy;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = Math.max(1, lineWidth * 0.85);
    ctx.beginPath();
    ctx.arc(ccx, ccy, bowR, -half, half, false);
    ctx.stroke();
    // тетива
    ctx.lineWidth = Math.max(0.6, lineWidth * 0.4);
    ctx.beginPath();
    var topX = ccx + bowR * Math.cos(-half), topY = ccy + bowR * Math.sin(-half);
    var botX = ccx + bowR * Math.cos(half), botY = ccy + bowR * Math.sin(half);
    ctx.moveTo(topX, topY);
    ctx.lineTo(ccx - bowR * 0.15, ccy);
    ctx.lineTo(botX, botY);
    ctx.stroke();
  }

  // щит — крупный, перед корпусом, шире и заметно выступает за силуэт тела
  // с обеих сторон (K-22 проп-тест раздел 3, п.3).
  function pathShield(ctx, rig) {
    var cx = rig.cx + rig.figW * 0.34;
    var cy = (rig.shoulderY + rig.hipY) / 2;
    var rx = rig.figH * 0.30;
    var ry = rig.figH * 0.40;
    addEllipse(ctx, cx, cy, rx, ry);
  }

  function drawShieldDetail(ctx, rig, strokeStyle, lineWidth) {
    var cx = rig.cx + rig.figW * 0.34;
    var cy = (rig.shoulderY + rig.hipY) / 2;
    var rx = rig.figH * 0.30, ry = rig.figH * 0.40;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = Math.max(0.6, lineWidth * 0.5);
    ctx.beginPath();
    ctx.moveTo(cx, cy - ry * 0.55);
    ctx.lineTo(cx, cy + ry * 0.55);
    ctx.moveTo(cx - rx * 0.5, cy);
    ctx.lineTo(cx + rx * 0.5, cy);
    ctx.stroke();
  }

  // Всё, что заливается сплошным цветом тела/пропов (голова, торс, шлем,
  // щит) — один path, используется для белой вспышки попадания
  // (pathUnitFillShapes ниже): флэш белит именно заливаемые части,
  // конечности остаются линиями (тот же приём, что был у ТЗ13).
  function pathFillGroup(ctx, shape, isPlayer, rig) {
    pathHead(ctx, rig);
    pathTorso(ctx, rig);
    pathHelmet(ctx, rig, isPlayer);
    if (shape === 'dome') pathShield(ctx, rig);
  }

  function drawProps(ctx, shape, isPlayer, rig, fillStyle, strokeStyle, lineWidth) {
    if (shape === 'spike') {
      drawBow(ctx, rig, rig.armR, strokeStyle, lineWidth);
    } else {
      drawMeleeWeapon(ctx, rig, rig.armR, fillStyle, strokeStyle, lineWidth);
    }
    if (shape === 'dome') {
      drawShieldDetail(ctx, rig, strokeStyle, lineWidth);
    }
  }

  // Тень под юнитом на земле (раздел 2, блок 5.4) — плоский эллипс в
  // палитре, новых цветов не вводит (rgba(0,0,0,alpha), тот же приём,
  // что уже использовался в декоре theme_art.js ТЗ13, только здесь под
  // ногами).
  function drawUnitShadow(ctx, rig) {
    ctx.beginPath();
    addEllipse(ctx, rig.cx, rig.feetY + rig.figH * 0.02, rig.figW * 0.30, rig.figH * 0.05);
    ctx.fillStyle = 'rgba(43,39,35,0.18)';
    ctx.fill();
  }

  // Только общее тело rig (голова, торс, конечности, глаза, тень) — БЕЗ
  // пропов. Экспортируется отдельно, чтобы проп-тест (ТЗ15 раздел 3, п.3)
  // мог сравнить контур тела с полной отрисовкой и убедиться, что пропы
  // выступают за него, а не совпадение с pathFillGroup внутри drawUnit
  // держало бы эту проверку недоступной снаружи модуля.
  function drawBodyOnly(ctx, rig, fillStyle, strokeStyle, lineWidth) {
    drawUnitShadow(ctx, rig);
    drawLimbs(ctx, rig, strokeStyle, lineWidth);
    ctx.beginPath();
    pathHead(ctx, rig);
    pathTorso(ctx, rig);
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    drawEyes(ctx, rig, strokeStyle);
  }

  function drawUnit(ctx, shape, isPlayer, x, y, w, h, fillStyle, strokeStyle, lineWidth, anim) {
    var rig = computeRig(shape, x, y, w, h, anim);
    drawBodyOnly(ctx, rig, fillStyle, strokeStyle, lineWidth);
    ctx.beginPath();
    pathHelmet(ctx, rig, isPlayer);
    if (shape === 'dome') pathShield(ctx, rig);
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    drawProps(ctx, shape, isPlayer, rig, fillStyle, strokeStyle, lineWidth);
    return rig;
  }

  // shape-уровня обёртка над drawBodyOnly — для тестов/переиспользования
  // без ручного computeRig снаружи модуля.
  function drawUnitBodyOnly(ctx, shape, x, y, w, h, fillStyle, strokeStyle, lineWidth, anim) {
    var rig = computeRig(shape, x, y, w, h, anim);
    drawBodyOnly(ctx, rig, fillStyle, strokeStyle, lineWidth);
    return rig;
  }

  // Путь только заливаемых частей — для вспышки попадания в main.js (тот же
  // приём, что pathUnitSilhouette в theme_art.js ТЗ13: caller делает
  // beginPath()/fill() сам поверх обычной отрисовки).
  function pathUnitFillShapes(ctx, shape, isPlayer, x, y, w, h, anim) {
    var rig = computeRig(shape, x, y, w, h, anim);
    pathFillGroup(ctx, shape, isPlayer, rig);
  }

  // ---------------- базы: башня (игрок) / частокол (враг) ----------------
  // Плоские силуэты укреплений вместо муравейника/термитника (ТЗ15 блок 4),
  // та же палитра (side.fill), надстройка НАД существующим прямоугольником-
  // хитбоксом (main.js drawBase оставляет геометрию/HP-бар/подпись как
  // есть — здесь только декор). Высота ограничена, чтобы не залезать в зону
  // HP-бара/подписи (унаследовано из theme_art.js ТЗ13, тот же расчёт).
  function drawTower(ctx, base, fillStyle, strokeStyle) {
    var cx = base.x + base.w / 2;
    var topY = base.y - base.h * 0.11;
    var crenels = 3;
    ctx.beginPath();
    ctx.moveTo(base.x + base.w * 0.08, base.y);
    ctx.lineTo(base.x + base.w * 0.08, topY + base.h * 0.05);
    for (var i = 0; i < crenels; i++) {
      var seg = base.w * 0.84 / crenels;
      var sx = base.x + base.w * 0.08 + i * seg;
      ctx.lineTo(sx, topY);
      ctx.lineTo(sx + seg * 0.55, topY);
      ctx.lineTo(sx + seg * 0.55, topY + base.h * 0.05);
      ctx.lineTo(sx + seg, topY + base.h * 0.05);
    }
    ctx.lineTo(base.x + base.w * 0.92, base.y);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = Math.max(1, base.w * 0.04);
    ctx.stroke();
    // флаг — выступает над башней
    ctx.beginPath();
    ctx.moveTo(cx, topY);
    ctx.lineTo(cx, topY - base.h * 0.16);
    ctx.moveTo(cx, topY - base.h * 0.16);
    ctx.lineTo(cx + base.w * 0.22, topY - base.h * 0.11);
    ctx.lineTo(cx, topY - base.h * 0.06);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = Math.max(1, base.w * 0.02);
    ctx.stroke();
  }

  function drawPalisade(ctx, base, fillStyle, strokeStyle) {
    var stakes = 5;
    var seg = base.w * 0.90 / stakes;
    ctx.beginPath();
    ctx.moveTo(base.x + base.w * 0.05, base.y);
    for (var i = 0; i < stakes; i++) {
      var sx = base.x + base.w * 0.05 + i * seg;
      var stakeH = base.h * (0.14 + (i % 2 === 0 ? 0.05 : 0));
      ctx.lineTo(sx, base.y - stakeH * 0.4);
      ctx.lineTo(sx + seg * 0.5, base.y - stakeH);
      ctx.lineTo(sx + seg, base.y - stakeH * 0.4);
    }
    ctx.lineTo(base.x + base.w * 0.95, base.y);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = Math.max(1, base.w * 0.04);
    ctx.stroke();
  }

  function drawBaseStructure(ctx, base, isPlayer, fillStyle, strokeStyle) {
    if (isPlayer) drawTower(ctx, base, fillStyle, strokeStyle);
    else drawPalisade(ctx, base, fillStyle, strokeStyle);
  }

  // ---------------- земля полосы (перенесено из theme_art.js ТЗ13 без
  // изменений — не про тему юнитов, генерик-декор ленты боя) ----------------
  function drawGroundBand(ctx, w, groundY, bandHeight, baseColor, speckColor) {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, groundY, w, bandHeight);
    var step = Math.max(10, bandHeight * 0.9);
    var n = Math.ceil(w / step);
    ctx.fillStyle = speckColor;
    for (var i = 0; i < n; i++) {
      var px = (i + 0.5) * step;
      var jitter = Math.sin(i * 12.9898) * 0.5 + 0.5;
      var py = groundY + bandHeight * (0.25 + jitter * 0.5);
      var r = bandHeight * 0.06;
      ctx.beginPath();
      addEllipse(ctx, px, py, r, r * 0.7);
      ctx.fill();
    }
    ctx.strokeStyle = speckColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(w, groundY);
    ctx.stroke();
  }

  // ---------------- декор верха кадра (ТЗ15 блок 5.4 / критерий 6) --------
  // Редкие вымпелы на шнуре вдоль верхней кромки канваса — тема "стик-
  // армии", светлее силуэтов, детерминированный узор (без Math.random()),
  // чтобы не мигал перерисовкой кадра.
  function drawTopBanner(ctx, w, topY, height, ropeColor, pennantColor) {
    ctx.strokeStyle = ropeColor;
    ctx.lineWidth = Math.max(1, height * 0.08);
    ctx.beginPath();
    ctx.moveTo(0, topY);
    ctx.lineTo(w, topY);
    ctx.stroke();
    var step = Math.max(24, height * 3.2);
    var n = Math.ceil(w / step);
    ctx.fillStyle = pennantColor;
    for (var i = 0; i < n; i++) {
      var px = (i + 0.5) * step;
      var sag = Math.sin(i * 7.31) * height * 0.12;
      var pw = height * 0.7, ph = height * 1.15;
      ctx.beginPath();
      ctx.moveTo(px - pw / 2, topY + sag);
      ctx.lineTo(px + pw / 2, topY + sag);
      ctx.lineTo(px, topY + sag + ph);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ---------------- подписи баз без обрезки краем канваса (theme_art.js
  // ТЗ13, перенесено без изменений — раздел 2, блок 5, п.5.1) --------------
  function drawClampedLabel(ctx, text, centerX, y, canvasW, font, fillStyle, padPx) {
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var halfW = ctx.measureText(text).width / 2;
    var pad = padPx;
    var minX = pad + halfW;
    var maxX = canvasW - pad - halfW;
    var x = centerX;
    if (minX <= maxX) {
      x = Math.min(maxX, Math.max(minX, centerX));
    } else {
      x = canvasW / 2;
    }
    ctx.fillStyle = fillStyle;
    ctx.fillText(text, x, y);
    return x;
  }

  return {
    roleMetrics: roleMetrics,
    computeRig: computeRig,
    drawUnit: drawUnit,
    drawUnitBodyOnly: drawUnitBodyOnly,
    pathUnitFillShapes: pathUnitFillShapes,
    drawBaseStructure: drawBaseStructure,
    drawGroundBand: drawGroundBand,
    drawTopBanner: drawTopBanner,
    drawClampedLabel: drawClampedLabel
  };
});
