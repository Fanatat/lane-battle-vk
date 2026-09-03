/*
 * rig.js — единый стик-rig для всех юнитов обеих сторон (A-16), доведён до
 * ТЗ №17 (ходьба суставом, без лица) поверх ТЗ №15/16 (пропы, роли, кадр).
 *
 * ТЗ №15: одно тело, роль и сторона задаются ПРОПАМИ, ГАБАРИТАМИ и АКЦЕНТОМ,
 * не переделкой анатомии. ТЗ №16: тело — чернила сплошняком, крупные пропы у
 * плеча, кадр без пустоты. ТЗ №17 (вердикт основателя 2026-09-01, задача №3
 * СПИСОК ЗАДАЧ.md — плотность варианта 2, торс ПАЛОЧКОЙ, а не заливкой; без
 * лица — голова сплошной круг): торс переведён с залитого эллипса на такую
 * же линию-обводку, что руки/ноги (растут из единой точки на её концах —
 * иначе плотность линии вернула бы зазор), глаза убраны. Взамен константного
 * сноса конечностей по X при неизменном Y (не человекоподобно — колено/локоть
 * не гнулись) — 2-костный IK (twoBoneJoint) с реальным сгибом сустава и
 * наклоном торса на ходу; знак сустава руки ПРОТИВОПОЛОЖЕН ноге (локоть
 * гнётся к корпусу, не "в небо" — правка по замечанию основателя).
 *
 * Модуль самодостаточен: не знает о balance.json, engine.js или DOM — только
 * геометрия по параметрам, чтобы его можно было перенести в следующую игру
 * студии без правок (A-12).
 *
 * Контракт: shape ('rect'|'spike'|'dome') — тот же ключ, что был у формы
 * силуэта до ТЗ №15 (theme_art.js, ТЗ №13), переосмыслен как РОЛЬ:
 * rect=боец, spike=стрелок, dome=щит. Числа/структура balance.json не
 * менялись — та же отстройка, что и раньше, другой рисующий код.
 *
 * anim = { mode: 'walk'|'attack'|'idle', t: number } — фаза анимации
 * приходит СНАРУЖИ (main.js вычисляет её из состояния юнита движка), сам
 * rig о движке ничего не знает.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Rig = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Тело — ВСЕГДА чернила студии (A-01/A-18), не параметр: приёмка ТЗ №15
  // отклонила версию, где тело красилось цветом стороны (бледный контур на
  // бледном фоне). Сторона красит только акцент пропа (шлем/повязка/щит).
  var INK = '#2b2723';

  function addEllipse(ctx, cx, cy, rx, ry, rot) {
    rx = Math.max(0.5, rx); ry = Math.max(0.5, ry); rot = rot || 0;
    var startX = cx + rx * Math.cos(rot);
    var startY = cy + rx * Math.sin(rot);
    ctx.moveTo(startX, startY);
    ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
  }

  // ---------------- габариты роли (K-22 + ТЗ15 критерий 2, ТЗ16 п.1.4) ----
  // Стрелок заметно тоньше и выше бойца, щит заметно ниже и шире (за счёт
  // пропа, не корпуса). headRFrac*2 + torsoFrac + legFrac держится ≈1 (плюс
  // фиксированный neckGap=0.03 в computeRig) — иначе голова вылезает выше
  // topY=feetY-figH. Голова 22-28% роста фигуры (ТЗ16 п.1.4).
  function roleMetrics(shape) {
    if (shape === 'spike') { // стрелок
      return { hScale: 1.20, wScale: 0.60, headRFrac: 0.14, torsoFrac: 0.27, legFrac: 0.38, limbScale: 0.80 };
    }
    if (shape === 'dome') { // щит
      return { hScale: 0.56, wScale: 0.92, headRFrac: 0.145, torsoFrac: 0.26, legFrac: 0.30, limbScale: 1.20 };
    }
    return { hScale: 1.0, wScale: 0.86, headRFrac: 0.15, torsoFrac: 0.27, legFrac: 0.38, limbScale: 1.0 }; // боец
  }

  // 2-костный IK, вырожденный для двух равных сегментов (бедро=голень,
  // плечо=предплечье): сустав лежит на середине хорды origin->target со
  // сдвигом перпендикулярно хорде на h=0.5*sqrt(segLen²-d²), d=|origin-target|
  // (классическая 2-bone IK). sign фиксирует сторону сгиба — не на усмотрение
  // кадра: колено гнётся вперёд (sign=+1), локоть — назад, к корпусу
  // (sign=-1), это анатомическое требование основателя (ТЗ17 п.2.1, критерий 1а).
  function twoBoneJoint(originX, originY, targetX, targetY, segLen, sign) {
    var dx = targetX - originX, dy = targetY - originY;
    var d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    var clampedD = Math.min(d, segLen); // цель дальше вытянутой конечности — берём вытянутую
    var ux = dx / d, uy = dy / d;
    var endX = originX + ux * clampedD, endY = originY + uy * clampedD;
    var half = segLen * 0.5;
    var h = Math.sqrt(Math.max(0, half * half - (clampedD * 0.5) * (clampedD * 0.5)));
    var midX = originX + ux * clampedD * 0.5, midY = originY + uy * clampedD * 0.5;
    var perpX = uy, perpY = -ux;
    return { jx: midX + perpX * h * sign, jy: midY + perpY * h * sign, ex: endX, ey: endY };
  }

  // ---------------- геометрия rig (общая для draw и flash-path) ----------------
  function computeRig(shape, x, y, w, h, anim) {
    anim = anim || { mode: 'idle', t: 0 };
    var m = roleMetrics(shape);
    var cxSlot = x + w / 2;
    var feetY = y + h;
    var figH = h * m.hScale;
    var headR = figH * m.headRFrac;
    var neckGap = figH * 0.03;
    var torsoLen = figH * m.torsoFrac;
    var legLen = figH * m.legFrac;
    var armLen = torsoLen; // антропометрично: плечо+предплечье ≈ длине торса

    var idleSway = Math.sin(anim.t * 2.1) * figH * 0.012;
    var stance = figH * 0.06; // разнос стоп/кистей в покое, чтобы не слипались на одну линию
    var stride = figH * 0.16 * (m.limbScale > 1 ? 0.85 : 1);
    var armStride = stride * 0.62;
    var maxLift = legLen * 0.22;

    var hipX = cxSlot, hipY = feetY - legLen;
    var leanAngle = 0;
    var legTargetA, legTargetB, armTargetA, armTargetB;

    // ТЗ №23: ноги и рука+оружие МОГУТ анимироваться разными фазами —
    // задние ряды очереди (engine.js u.advancing, ТЗ №21/22) физически
    // ещё идут к contactRange, но УЖЕ бьют по кулдауну на расширенном
    // радиусе meleeRange (намеренная механика фронта, ТЗ №05 1.1 —
    // front_depth юнитов очереди одновременно достают до контакта, не
    // трогаем). Раньше вся фигура рисовалась ЛИБО ходьбой (ноги живые, но
    // взмаха не видно синхронно с уроном), ЛИБО замахом (взмах виден, но
    // ноги стоят под скользящим юнитом) — один anim.mode на всё тело не
    // мог показать оба факта разом. anim.armMode/anim.armT (опционально,
    // по умолчанию = anim.mode/anim.t — 100% обратная совместимость со
    // всеми существующими вызовами/тестами) отвязывают руку+оружие от
    // ног: main.js теперь может отдать ноги под 'walk' (юнит правда
    // движется), а руку — под 'attack' (взмах синхронен с реальным
    // моментом урона, cooldown-based t), не трогая радиус/баланс в
    // engine.js вовсе.
    var armMode = anim.armMode || anim.mode;
    var armT = (anim.armT !== undefined) ? anim.armT : anim.t;

    if (anim.mode === 'walk') {
      leanAngle = 0.13; // фиксированный наклон корпуса вперёд на ходу (ТЗ17)
      var freq = 0.9, phase = anim.t * freq;
      var sA = Math.sin(phase), sB = Math.sin(phase + Math.PI);
      var liftA = Math.max(0, Math.cos(phase)) * maxLift; // стопа отрывается только в фазе выноса
      var liftB = Math.max(0, Math.cos(phase + Math.PI)) * maxLift;
      legTargetA = { x: hipX + sA * stride, y: feetY - liftA };
      legTargetB = { x: hipX + sB * stride, y: feetY - liftB };
    } else if (anim.mode === 'attack') {
      var legT = Math.max(0, Math.min(1, anim.t));
      var legSwing = Math.sin(legT * Math.PI);
      leanAngle = legSwing * 0.16;
      legTargetA = { x: hipX - stance, y: feetY };
      legTargetB = { x: hipX + stance, y: feetY };
    } else {
      legTargetA = { x: hipX - stance, y: feetY - maxLift * 0.10 };
      legTargetB = { x: hipX + stance, y: feetY - maxLift * 0.10 };
    }

    var shoulderX = hipX + Math.sin(leanAngle) * torsoLen;
    var shoulderY = hipY - Math.cos(leanAngle) * torsoLen + idleSway;
    var headCx = shoulderX + Math.sin(leanAngle) * (neckGap + headR);
    var headCy = shoulderY - Math.cos(leanAngle) * (neckGap + headR);

    if (armMode === 'walk') {
      var freqW = 0.9, phaseW = armT * freqW;
      var sAw = Math.sin(phaseW), sBw = Math.sin(phaseW + Math.PI);
      armTargetA = { x: hipX + sBw * armStride, y: null }; // контралатерально ноге
      armTargetB = { x: hipX + sAw * armStride, y: null };
    } else if (armMode === 'attack') {
      armTargetA = { x: hipX - stance * 1.4, y: null };
      armTargetB = { x: hipX + stance * 1.4, y: null };
    } else {
      armTargetA = { x: hipX - stance * 1.2 + idleSway * 0.6, y: null };
      armTargetB = { x: hipX + stance * 1.2 - idleSway * 0.6, y: null };
    }
    armTargetA.y = shoulderY + armLen * 0.82;
    armTargetB.y = shoulderY + armLen * 0.82;

    var legL = twoBoneJoint(hipX, hipY, legTargetA.x, legTargetA.y, legLen, 1);
    var legR = twoBoneJoint(hipX, hipY, legTargetB.x, legTargetB.y, legLen, 1);
    var armL = twoBoneJoint(shoulderX, shoulderY, armTargetA.x, armTargetA.y, armLen, -1);
    var armR = twoBoneJoint(shoulderX, shoulderY, armTargetB.x, armTargetB.y, armLen, -1);

    // Угол оружия — своя дуга у плеча, НЕ зависящая от кисти (ТЗ16 п.2.1/2.4).
    // База наклона (WEAPON_REST) — клинок под углом вперёд-вверх, а не строго
    // вертикально над плечом: чисто вертикальный клинок визуально сливался с
    // гребнем шлема ("две антенны" над головой) — тот же дефект читаемости,
    // что ТЗ16 разбирал для голой дуги дальности обороны. Замах доворачивает
    // клинок дальше вперёд-вниз по дуге, чтобы удар был виден кадр-к-кадру
    // (критерий 8).
    var WEAPON_REST = 0.45;
    var weaponAngle;
    if (armMode === 'attack') {
      weaponAngle = WEAPON_REST + (Math.sin(Math.max(0, Math.min(1, armT)) * Math.PI)) * 1.05;
    } else if (armMode === 'walk') {
      weaponAngle = WEAPON_REST + Math.sin(armT * 0.9) * 0.12;
    } else {
      weaponAngle = WEAPON_REST + Math.sin(armT * 2.1) * 0.08;
    }
    var weaponLen = figH * 0.38; // ТЗ16 п.2.1: оружие держится у плеча

    var helmetTopY = headCy - headR * 1.95;
    // ТЗ №22 п.2: пивот меча теперь = рука (armR.ey), не фиксированный
    // офсет от плеча (см. drawMeleeWeapon) — верх клинка считаем от той
    // же точки, иначе HP-бар (propTopY) разъедется с реальной отрисовкой.
    var weaponTopY = armR.ey - weaponLen - figH * 0.03;

    return {
      m: m, cx: hipX, feetY: feetY, figH: figH, figW: w * m.wScale,
      weaponLen: weaponLen, weaponAngle: weaponAngle,
      // bodyBarW — ширина HP-бара юнита: доля figW (уже несёт разницу ролей
      // по wScale/limbScale), не привязана к разносу плеч (торс теперь без
      // ширины — единая линия, ТЗ17).
      bodyBarW: w * m.wScale * 0.55,
      headCx: headCx, headCy: headCy, headR: headR,
      // Верх самой высокой детали (шлем/клинок) с запасом, чтобы HP-бар
      // юнита (main.js критерий 5) не резал проп ни у игрока, ни у врага.
      propTopY: Math.min(helmetTopY, weaponTopY),
      shoulderY: shoulderY, hipY: hipY, shoulderX: shoulderX, hipX: hipX,
      legL: { hx: hipX, hy: hipY, kx: legL.jx, ky: legL.jy, fx: legL.ex, fy: legL.ey },
      legR: { hx: hipX, hy: hipY, kx: legR.jx, ky: legR.jy, fx: legR.ex, fy: legR.ey },
      armL: { sx: shoulderX, sy: shoulderY, ex: armL.jx, ey: armL.jy, hx: armL.ex, hy: armL.ey },
      armR: { sx: shoulderX, sy: shoulderY, ex: armR.jx, ey: armR.jy, hx: armR.ex, hy: armR.ey }
    };
  }

  // ---------------- тело (общее для всех ролей) ----------------
  function pathHead(ctx, rig) {
    ctx.moveTo(rig.headCx + rig.headR, rig.headCy);
    ctx.arc(rig.headCx, rig.headCy, rig.headR, 0, Math.PI * 2);
  }

  function drawLimbLine(ctx, ax, ay, bx, by, cx2, cy2, jointR) {
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cx2, cy2);
    ctx.stroke();
    if (jointR > 0) {
      ctx.beginPath();
      ctx.arc(bx, by, jointR, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
    }
  }

  // ТЗ17: торс — палочка (обводка) от плеча до таза, той же толщины, что
  // руки/ноги (плотность варианта 2 из задачи №3 — толщиной линии, не
  // площадью заливки). Конечности растут из ЕДИНОЙ точки на её концах —
  // иначе безобъёмная линия вернула бы зазор (тот же приём, что в
  // drawVariant2Stick черновика задачи №3). Суставы (таз/плечи/колени/
  // локти) — залитые точки, читаются как сочленения скелета, не обрыв линии.
  function drawSkeleton(ctx, rig, lineWidth) {
    var lw = Math.max(3, lineWidth * rig.m.limbScale * 2.2);
    var jointR = lw * 0.42;
    ctx.strokeStyle = INK;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(rig.hipX, rig.hipY);
    ctx.lineTo(rig.shoulderX, rig.shoulderY);
    ctx.stroke();

    drawLimbLine(ctx, rig.legL.hx, rig.legL.hy, rig.legL.kx, rig.legL.ky, rig.legL.fx, rig.legL.fy, jointR);
    drawLimbLine(ctx, rig.legR.hx, rig.legR.hy, rig.legR.kx, rig.legR.ky, rig.legR.fx, rig.legR.fy, jointR);
    drawLimbLine(ctx, rig.armL.sx, rig.armL.sy, rig.armL.ex, rig.armL.ey, rig.armL.hx, rig.armL.hy, jointR);
    drawLimbLine(ctx, rig.armR.sx, rig.armR.sy, rig.armR.ex, rig.armR.ey, rig.armR.hx, rig.armR.hy, jointR);

    ctx.beginPath(); ctx.arc(rig.hipX, rig.hipY, jointR, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
    ctx.beginPath(); ctx.arc(rig.shoulderX, rig.shoulderY, jointR, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
  }

  // ---------------- пропы: обязаны выступать за контур тела (раздел 1) ----------------
  // helmet — та же роль, разная форма по СТОРОНЕ (не только заливка):
  // игрок — круглый шлем с гребнем, враг — гранёный шлем с рогом. Только
  // боец/щит (п.2.2: у стрелка шлема нет вовсе — см. pathHeadband).
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

  // Повязка стрелка (п.2.2: "без шлема, повязка или капюшон") — тонкая
  // акцентная лента через лоб с узлом-хвостом сбоку, вместо полного шлема.
  function pathHeadband(ctx, rig, isPlayer) {
    var r = rig.headR;
    var bandHalf = r * 0.16;
    var y = rig.headCy - r * 0.25;
    ctx.moveTo(rig.headCx - r * 0.98, y - bandHalf);
    ctx.lineTo(rig.headCx + r * 0.98, y - bandHalf);
    ctx.lineTo(rig.headCx + r * 0.98, y + bandHalf);
    ctx.lineTo(rig.headCx - r * 0.98, y + bandHalf);
    ctx.closePath();
    // хвост узла — выступает за контур головы сбоку
    var tailX = isPlayer ? rig.headCx - r * 1.05 : rig.headCx + r * 1.05;
    var tailDir = isPlayer ? -1 : 1;
    ctx.moveTo(tailX, y - bandHalf * 0.6);
    ctx.lineTo(tailX + tailDir * r * 0.55, y + r * 0.1);
    ctx.lineTo(tailX, y + bandHalf * 1.4);
    ctx.closePath();
  }

  // Оружие бойца/щита — пивот держится КИСТИ (rig.armR.hx/hy — та же
  // 2-костная IK-цепочка, что и рука, ТЗ №22 п.2: раньше был фиксирован
  // офисетом от плеча, тремя правками координат так и не удалось развести
  // его одновременно с головой (близко) и с рукой (далеко) — точка была
  // не привязана ни к чему анатомическому. Кисть — реальная кость, меч
  // теперь СЛЕДУЕТ за рукой при ходьбе/замахе. Угол клинка (weaponAngle)
  // сознательно НЕ следует повороту предплечья — ТЗ16 п.2.1 уже пробовал
  // полную привязку (позиция+поворот кисти) и это свисало до колена в
  // покое (кисть в idle отдыхает низко); развязка угла даёт читаемый
  // «наготове» клинок независимо от того, где сейчас отдыхает кисть.
  function drawMeleeWeapon(ctx, rig, accentColor) {
    var pivotX = rig.armR.hx;
    var pivotY = rig.armR.hy;
    var angle = -Math.PI / 2 + rig.weaponAngle;
    var tipX = pivotX + Math.cos(angle) * rig.weaponLen;
    var tipY = pivotY + Math.sin(angle) * rig.weaponLen;
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, rig.figH * 0.05);
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    // крестовина — короткая поперечина у рукояти, читается как оружие, не палка.
    var crossX = pivotX + Math.cos(angle) * rig.weaponLen * 0.22;
    var crossY = pivotY + Math.sin(angle) * rig.weaponLen * 0.22;
    var px = -Math.sin(angle), py = Math.cos(angle);
    var crossHalf = rig.figH * 0.09;
    ctx.lineWidth = Math.max(1.5, rig.figH * 0.035);
    ctx.beginPath();
    ctx.moveTo(crossX - px * crossHalf, crossY - py * crossHalf);
    ctx.lineTo(crossX + px * crossHalf, crossY + py * crossHalf);
    ctx.stroke();
    // навершие рукояти — акцент стороны, у самого плеча.
    ctx.beginPath();
    addEllipse(ctx, pivotX, pivotY, rig.figH * 0.045, rig.figH * 0.045);
    ctx.fillStyle = accentColor;
    ctx.fill();
  }

  // лук стрелка — дуга у кисти, выступающая вбок от тела (не полукруг через
  // всю фигуру). Размер ≥40% роста фигуры (п.2.2).
  // ТЗ №21 (QA-баг 3, "тот же класс, что меч"): дуга лука раньше рисовалась
  // отдельно от тела, без метки хвата — читалась как повисшая рядом
  // фигура, не как оружие В РУКЕ. Кисть (armR) уже физически в правильном
  // месте (в отличие от меча, лук не имел проблемы с пивотом), не хватало
  // только точки хвата — тот же приём, что навершие рукояти меча.
  function drawBow(ctx, rig, hand, strokeStyle, lineWidth, accentColor) {
    var bowR = rig.figH * 0.34;
    var half = 0.78; // рад, ~45° в каждую сторону от направления кисти
    var ccx = hand.hx, ccy = hand.hy;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = Math.max(1.5, lineWidth * 1.1);
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
    // точка хвата — акцент стороны, у самой кисти (тот же приём, что
    // навершие рукояти меча) — читается как рука, держащая лук.
    ctx.beginPath();
    addEllipse(ctx, ccx, ccy, rig.figH * 0.04, rig.figH * 0.04);
    ctx.fillStyle = accentColor;
    ctx.fill();
  }

  // щит — крупный, ПЕРЕД корпусом, заметно выступает за силуэт тела с обеих
  // сторон (раздел 2, п.2.3) — торс теперь линия, поэтому центрирование на
  // rig.cx само по себе даёт выступ и слева, и справа.
  function pathShield(ctx, rig) {
    var cx = rig.cx;
    var cy = (rig.shoulderY + rig.hipY) / 2 + rig.figH * 0.03;
    var rx = rig.figH * 0.32;
    var ry = rig.figH * 0.40;
    addEllipse(ctx, cx, cy, rx, ry);
  }

  function drawShieldDetail(ctx, rig, strokeStyle, lineWidth) {
    var cx = rig.cx;
    var cy = (rig.shoulderY + rig.hipY) / 2 + rig.figH * 0.03;
    var rx = rig.figH * 0.32, ry = rig.figH * 0.40;
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(0.6, lineWidth * 0.5);
    ctx.beginPath();
    ctx.moveTo(cx, cy - ry * 0.55);
    ctx.lineTo(cx, cy + ry * 0.55);
    ctx.moveTo(cx - rx * 0.5, cy);
    ctx.lineTo(cx + rx * 0.5, cy);
    ctx.stroke();
  }

  // Заливаемые части (голова, шлем/повязка, щит) — один path, используется
  // для белой вспышки попадания (pathUnitFillShapes ниже): флэш белит именно
  // заливаемые части. Торс/конечности — линии, не заливаются флэшем (то же,
  // что было со штрихами конечностей в ТЗ13/15/16).
  function pathFillGroup(ctx, shape, isPlayer, rig) {
    pathHead(ctx, rig);
    if (shape === 'spike') pathHeadband(ctx, rig, isPlayer);
    else pathHelmet(ctx, rig, isPlayer);
    if (shape === 'dome') pathShield(ctx, rig);
  }

  function drawProps(ctx, shape, isPlayer, rig, fillStyle, strokeStyle, lineWidth) {
    if (shape === 'spike') {
      drawBow(ctx, rig, rig.armR, INK, lineWidth, fillStyle);
    } else {
      drawMeleeWeapon(ctx, rig, fillStyle);
    }
    if (shape === 'dome') {
      drawShieldDetail(ctx, rig, strokeStyle, lineWidth);
    }
  }

  // Тень под юнитом на земле — плоский эллипс, новых цветов не вводит.
  function drawUnitShadow(ctx, rig) {
    ctx.beginPath();
    addEllipse(ctx, rig.cx, rig.feetY + rig.figH * 0.02, rig.figW * 0.30, rig.figH * 0.05);
    ctx.fillStyle = 'rgba(43,39,35,0.18)';
    ctx.fill();
  }

  // Только общее тело rig (скелет+голова, БЕЗ пропов). Экспортируется
  // отдельно, чтобы проп-тест мог сравнить контур тела с полной отрисовкой.
  function drawBodyOnly(ctx, rig, lineWidth) {
    drawUnitShadow(ctx, rig);
    drawSkeleton(ctx, rig, lineWidth);
    ctx.beginPath();
    pathHead(ctx, rig);
    ctx.fillStyle = INK;
    ctx.fill();
    // Ни обводки, ни глаз (ТЗ17: "у человечков лица рисовать не нужно" —
    // отменяет ТЗ16 п.1.2 для этой линии развития).
  }

  // ТЗ №20 (QA-баг 3): обе стороны рисовались буквально одной и той же
  // геометрией — визуально невозможно было понять, кто на чьей стороне,
  // не читая заливку. Минимум по формулировке задачи — зеркалирование
  // рига: враг (isPlayer=false) отражается по горизонтали вокруг центра
  // своего слота (rig.cx), player остаётся как был (ни один существующий
  // визуальный тест не завязан на isPlayer=false — decor/readability
  // мерят только цвет/контраст, prop_check всегда зовёт isPlayer=true,
  // площадь и яркость под отражением не меняются).
  function beginSideMirror(ctx, rig, isPlayer) {
    if (isPlayer) return false;
    ctx.save();
    ctx.translate(rig.cx * 2, 0);
    ctx.scale(-1, 1);
    return true;
  }

  function drawUnit(ctx, shape, isPlayer, x, y, w, h, fillStyle, strokeStyle, lineWidth, anim) {
    var rig = computeRig(shape, x, y, w, h, anim);
    var mirrored = beginSideMirror(ctx, rig, isPlayer);
    drawBodyOnly(ctx, rig, lineWidth);
    // fillStyle здесь — АКЦЕНТ стороны (balance.json.sides.*.fill), красится
    // только на шлем/повязку/щит, не на тело.
    ctx.beginPath();
    if (shape === 'spike') pathHeadband(ctx, rig, isPlayer);
    else pathHelmet(ctx, rig, isPlayer);
    if (shape === 'dome') pathShield(ctx, rig);
    ctx.fillStyle = fillStyle;
    ctx.fill();
    // Обводка акцента — ВСЕГДА чернила, сплошняком: акцент игрока почти
    // сливается со светлым бумажным фоном без тёмного контура.
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(lineWidth, rig.figH * 0.025);
    ctx.stroke();
    drawProps(ctx, shape, isPlayer, rig, fillStyle, strokeStyle, lineWidth);
    if (mirrored) ctx.restore();
    return rig;
  }

  // shape-уровня обёртка над drawBodyOnly — для тестов/переиспользования
  // без ручного computeRig снаружи модуля.
  function drawUnitBodyOnly(ctx, shape, x, y, w, h, lineWidth, anim) {
    var rig = computeRig(shape, x, y, w, h, anim);
    drawBodyOnly(ctx, rig, lineWidth);
    return rig;
  }

  // Путь только заливаемых частей — для вспышки попадания в main.js.
  // Тот же mirror, что и drawUnit() — иначе флэш вспышки не совпал бы по
  // пикселям с отражённым враждебным телом.
  function pathUnitFillShapes(ctx, shape, isPlayer, x, y, w, h, anim) {
    var rig = computeRig(shape, x, y, w, h, anim);
    var mirrored = beginSideMirror(ctx, rig, isPlayer);
    pathFillGroup(ctx, shape, isPlayer, rig);
    if (mirrored) ctx.restore();
  }

  // ---------------- базы: башня (игрок) / частокол (враг) ----------------
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

  // ---------------- земля полосы (theme_art.js ТЗ13, без изменений) --------
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
  // ТЗ13, клэмп по РЕАЛЬНЫМ чернилам глифа — ТЗ16 п.4.2) --------------
  function drawClampedLabel(ctx, text, centerX, y, canvasW, font, fillStyle, padPx) {
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var m = ctx.measureText(text);
    var inkLeft = m.actualBoundingBoxLeft;
    var inkRight = m.actualBoundingBoxRight;
    var pad = padPx;
    var minX = pad + inkLeft;
    var maxX = canvasW - pad - inkRight;
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
