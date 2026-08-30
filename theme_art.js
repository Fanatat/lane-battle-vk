/*
 * theme_art.js — ТЗ №13: тема «муравьи против жуков» (насекомые), отрисовка
 * кодом (Canvas 2D примитивы, без растровых ассетов — ТЗ, раздел 6, п.1).
 * Общий модуль для main.js (боевой рендер) и tests/*_check.py (headless-
 * приёмка через тот же самый код рисования, не копия — иначе тест мог бы
 * разойтись с тем, что реально видит игрок).
 *
 * Тип юнита кодируется ФОРМОЙ силуэта (K-22: форма — когда формы РАЗНЫЕ),
 * сторона — заливкой (light = игрок, dark = враг), без единой буквы.
 * shape ('rect'|'spike'|'dome') приходит из balance.json (unit.shape) —
 * тот же ключ, что был до этого ТЗ, значения переосмыслены художественно,
 * числа/структура balance.json не менялись.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ThemeArt = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ctx.ellipse() продолжает ТЕКУЩИЙ subpath прямой линией от предыдущей
  // точки к началу дуги, если перед ним не было moveTo — при нескольких
  // эллипсах в одном path (три сегмента тела в один fill()) это рисовало
  // невидимый глазом на превью, но видимый на однотонной заливке клин
  // между сегментами. moveTo в начальную точку дуги убирает коннектор,
  // сама дуга рисуется как отдельный subpath.
  function addEllipse(ctx, cx, cy, rx, ry, rot) {
    rx = Math.max(0.5, rx); ry = Math.max(0.5, ry); rot = rot || 0;
    var startX = cx + rx * Math.cos(rot);
    var startY = cy + rx * Math.sin(rot);
    ctx.moveTo(startX, startY);
    ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
  }

  // ---------------- юниты-насекомые ----------------
  // Три силуэта (единый рисунок обеих сторон — различает СТОРОНА, не форма,
  // ТЗ раздел 6, п.1): x,y,w,h — bounding box, тот же контракт, что был у
  // старого pathUnitShape (main.js ТЗ №01-12).

  // rect -> A, рабочий муравей: три сегмента столбиком, самый компактный
  // силуэт из трёх — читается как узкая колонна.
  function pathAntWorker(ctx, x, y, w, h) {
    var cx = x + w / 2;
    ctx.beginPath();
    addEllipse(ctx, cx, y + h * 0.82, w * 0.32, h * 0.18); // брюшко
    addEllipse(ctx, cx, y + h * 0.56, w * 0.21, h * 0.14); // грудь
    addEllipse(ctx, cx, y + h * 0.27, w * 0.24, h * 0.16); // голова
  }

  // spike -> B, муравей-кислотомёт: брюшко-эллипс задран и повёрнут над
  // телом (как у настоящих кислотных муравьёв) — самый "высокий"/
  // асимметричный силуэт из трёх, явно отличим от компактного столбика A.
  // Только эллипсы в одном path (как у A) — без самопересекающихся кривых,
  // которые давали артефакт заливки на стыке subpath'ов (nonzero winding).
  function pathAntAcid(ctx, x, y, w, h) {
    var cx = x + w / 2;
    ctx.beginPath();
    addEllipse(ctx, cx + w * 0.06, y + h * 0.30, w * 0.30, h * 0.22, -0.55); // брюшко, задрано и повёрнуто
    addEllipse(ctx, cx - w * 0.10, y + h * 0.62, w * 0.18, h * 0.13); // грудь
    addEllipse(ctx, cx - w * 0.22, y + h * 0.84, w * 0.19, h * 0.13); // голова, внизу-вперёд
  }

  // dome -> C, жук-броневик: широкий низкий купол во всю ширину бокса —
  // самый "плоский и широкий" силуэт из трёх, шов на панцире для фактуры.
  function pathBeetle(ctx, x, y, w, h) {
    var cx = x + w / 2;
    var domeTop = y + h * 0.12;
    var domeBottom = y + h * 0.92;
    ctx.beginPath();
    ctx.moveTo(x, domeBottom);
    ctx.quadraticCurveTo(x, domeTop, cx, domeTop);
    ctx.quadraticCurveTo(x + w, domeTop, x + w, domeBottom);
    ctx.closePath();
    // головка спереди (снизу бокса) — маленький выступ
    addEllipse(ctx, cx, y + h * 0.94, w * 0.16, h * 0.09);
  }

  function pathUnitSilhouette(ctx, shape, x, y, w, h) {
    if (shape === 'spike') pathAntAcid(ctx, x, y, w, h);
    else if (shape === 'dome') pathBeetle(ctx, x, y, w, h);
    else pathAntWorker(ctx, x, y, w, h);
  }

  // Шов на панцире жука — фактура поверх заливки, тем же контурным цветом.
  function strokeBeetleSeam(ctx, x, y, w, h, strokeStyle, lineWidth) {
    var cx = x + w / 2;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(cx, y + h * 0.16);
    ctx.lineTo(cx, y + h * 0.88);
    ctx.stroke();
  }

  // Ноги/усики — тонкие штрихи контурным цветом, отдельно от заливаемого
  // тела (иначе fill() залил бы и их).
  function drawUnitLegs(ctx, shape, x, y, w, h, strokeStyle, lineWidth) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    var cx = x + w / 2;
    var legRowY = shape === 'spike' ? y + h * 0.62 : (shape === 'dome' ? y + h * 0.62 : y + h * 0.60);
    var spread = w * 0.55;
    var i, lx;
    for (i = -1; i <= 1; i++) {
      lx = cx + i * spread * 0.42;
      ctx.beginPath();
      ctx.moveTo(lx, legRowY);
      ctx.lineTo(lx - spread * 0.30, legRowY + spread * 0.30);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(lx, legRowY);
      ctx.lineTo(lx + spread * 0.30, legRowY + spread * 0.30);
      ctx.stroke();
    }
    if (shape === 'dome') strokeBeetleSeam(ctx, x, y, w, h, strokeStyle, lineWidth);
    // усики — только у муравьёв (антенны над головой), у жука их нет
    // (панцирь закрывает голову) — дополнительная не-цветовая отстройка.
    if (shape !== 'dome') {
      var headY = shape === 'spike' ? y + h * 0.84 : y + h * 0.27;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.08, headY - h * 0.10);
      ctx.lineTo(cx - w * 0.22, headY - h * 0.28);
      ctx.moveTo(cx + w * 0.08, headY - h * 0.10);
      ctx.lineTo(cx + w * 0.22, headY - h * 0.28);
      ctx.stroke();
    }
  }

  // Цельная отрисовка юнита (тело + ноги/усики), используется и в бою, и в
  // превью следующей волны — один код, один силуэт.
  function drawUnit(ctx, shape, x, y, w, h, fillStyle, strokeStyle, lineWidth) {
    pathUnitSilhouette(ctx, shape, x, y, w, h);
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    drawUnitLegs(ctx, shape, x, y, w, h, strokeStyle, lineWidth * 0.7);
  }

  // ---------------- базы: муравейник (игрок) / термитник (враг) ----------------
  // Декор поверх существующего прямоугольника базы (main.js drawBase
  // оставляет hit-box/HP-бар/подпись как есть — здесь только силуэт-
  // надстройка), различаются формой холма (не только заливкой — бонус
  // читаемости сверх K-22, который требует различия сторон по светлоте
  // при ОДИНАКОВОЙ форме; тут форма тоже разная, светлота — тем более).
  // Высота холма ограничена так, чтобы не залезать в зону HP-бара/цифр
  // (main.js рисует их на base.y - unitSize*0.3, unitSize = base.h/1.9) —
  // иначе тёмная заливка врага съедала контраст числа "450 / 450" (найдено
  // приёмкой промо-режима этого же ТЗ).
  function drawAnthill(ctx, base, fillStyle, strokeStyle) {
    var cx = base.x + base.w / 2;
    var topY = base.y - base.h * 0.10;
    ctx.beginPath();
    ctx.moveTo(base.x + base.w * 0.05, base.y);
    ctx.quadraticCurveTo(base.x, topY + base.h * 0.10, cx, topY);
    ctx.quadraticCurveTo(base.x + base.w, topY + base.h * 0.10, base.x + base.w * 0.95, base.y);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = Math.max(1, base.w * 0.04);
    ctx.stroke();
    // вход в муравейник — тёмная дырка у основания холма
    ctx.beginPath();
    addEllipse(ctx, cx, base.y - base.h * 0.02, base.w * 0.11, base.h * 0.035);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
  }

  function drawTermiteMound(ctx, base, fillStyle, strokeStyle) {
    var cx = base.x + base.w / 2;
    var topY = base.y - base.h * 0.13;
    ctx.beginPath();
    ctx.moveTo(base.x + base.w * 0.10, base.y);
    ctx.quadraticCurveTo(base.x + base.w * 0.05, base.y - base.h * 0.08, cx - base.w * 0.12, topY + base.h * 0.04);
    ctx.quadraticCurveTo(cx - base.w * 0.05, topY - base.h * 0.01, cx, topY);
    ctx.quadraticCurveTo(cx + base.w * 0.05, topY - base.h * 0.01, cx + base.w * 0.12, topY + base.h * 0.04);
    ctx.quadraticCurveTo(base.x + base.w * 0.95, base.y - base.h * 0.08, base.x + base.w * 0.90, base.y);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = Math.max(1, base.w * 0.04);
    ctx.stroke();
    // рёбра-вентиляция термитника — пара штрихов текстуры
    ctx.beginPath();
    ctx.moveTo(cx - base.w * 0.10, base.y - base.h * 0.03);
    ctx.lineTo(cx - base.w * 0.05, topY + base.h * 0.02);
    ctx.moveTo(cx + base.w * 0.10, base.y - base.h * 0.03);
    ctx.lineTo(cx + base.w * 0.05, topY + base.h * 0.02);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = Math.max(1, base.w * 0.02);
    ctx.stroke();
  }

  function drawBaseMound(ctx, base, isPlayer, fillStyle, strokeStyle) {
    if (isPlayer) drawAnthill(ctx, base, fillStyle, strokeStyle);
    else drawTermiteMound(ctx, base, fillStyle, strokeStyle);
  }

  // ---------------- земля полосы ----------------
  // Полоса боя — не отладочная линия, а лента грунта с фактурой (детерми-
  // нированные "камешки", не Math.random() — иначе пересчёт на каждый
  // кадр сыпал бы новым узором, визуальный шум). Формула от x, стабильна
  // между кадрами при неизменном layout.
  function drawGroundBand(ctx, w, groundY, bandHeight, baseColor, speckColor) {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, groundY, w, bandHeight);
    var step = Math.max(10, bandHeight * 0.9);
    var n = Math.ceil(w / step);
    ctx.fillStyle = speckColor;
    for (var i = 0; i < n; i++) {
      var px = (i + 0.5) * step;
      var jitter = Math.sin(i * 12.9898) * 0.5 + 0.5; // [0,1), детерминированный псевдошум
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

  // ---------------- подписи баз без обрезки краем канваса ----------------
  // Дефект тянулся с ТЗ №01 (K-19/readability): centerX без учёта ширины
  // текста мог унести подпись за край канваса на узких геометриях. Клэмп
  // по РЕАЛЬНОЙ ширине текста (measureText) — единственный источник истины
  // о том, влезает подпись или нет, а не подгонка отступов на глаз.
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
    } // иначе (текст шире канваса целиком) — рисуем по центру канваса, дальше некуда клэмпить
    else {
      x = canvasW / 2;
    }
    ctx.fillStyle = fillStyle;
    ctx.fillText(text, x, y);
    return x;
  }

  return {
    pathUnitSilhouette: pathUnitSilhouette,
    drawUnit: drawUnit,
    drawUnitLegs: drawUnitLegs,
    drawBaseMound: drawBaseMound,
    drawGroundBand: drawGroundBand,
    drawClampedLabel: drawClampedLabel
  };
});
