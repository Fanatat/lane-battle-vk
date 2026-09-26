// Процедурный риг стикмена: вся "графика" юнитов/героя — линии и дуги,
// нарисованные по параметрам позы. Осознанное решение по ассетам —
// см. КОНЦЕПТ_ГДД.md, раздел «Допущения».
//
// Раунд 14 (визуал «под обложку», ТЗ_ВИЗУАЛ_ПОД_ОБЛОЖКУ.md): фигуры
// в ART.rigScale раз крупнее (внутренняя геометрия рига не менялась —
// множитель применяется одним ctx.scale, оружие/плащ/щит/цепь едут вместе),
// конечности двухсегментные (колено/локоть), атака в три фазы с корпусом и
// следом-дугой, враги — чёрные силуэты с тёплой кромкой, тень под ногами.
// Цвета — только из ART/GEAR_TIER_COLORS (data.js), литералов не плодить.
//
// Раунд 15 (И6): костюмы «роль × эпоха» (ART.costume) — цветной корпус
// поверх палочек, головной убор, щит, наплечники; атака по роли (рубящий
// взмах / укол / удар сверху / лук), три вида смерти с оседанием тела.
'use strict';

const RIG = {
  head: 6,
  neck: 3,
  torso: 15,
  legLen: 15,
  armLen: 12,
  lineWidth: 3.4,
};
const RIG_K = (typeof ART !== 'undefined' && ART.rigScale) || 1.5;
// Сегменты чуть длиннее половины прямой конечности — иначе колено/локоть
// никогда не сгибаются (сустав лежит ровно на прямой между концами).
const LEG_SEG = RIG.legLen * 0.56;
const ARM_SEG = RIG.armLen * 0.56;
const RANGED_WEAPONS = new Set(['bow', 'sling', 'rifle']);

function rigLerp(a, b, t) { return a + (b - a) * t; }
function rigEaseOut(t) { return 1 - Math.pow(1 - t, 3); }
function rigEaseInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function rigEaseOutBack(t) { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

// Сустав двухсегментной конечности: точка на серединном перпендикуляре
// отрезка «начало → конец», сдвинутая в сторону bendDir. Если конец дальше,
// чем два сегмента, конец подтягивается на предел досягаемости.
function limbPoints(ox, oy, tx, ty, seg, bendDir) {
  let dx = tx - ox, dy = ty - oy;
  let d = Math.hypot(dx, dy) || 0.001;
  if (d > seg * 2) { dx *= (seg * 2) / d; dy *= (seg * 2) / d; d = seg * 2; }
  const half = d / 2;
  const h = Math.sqrt(Math.max(0, seg * seg - half * half));
  const nx = -dy / d, ny = dx / d;
  return {
    joint: { x: ox + dx / 2 + nx * h * bendDir, y: oy + dy / 2 + ny * h * bendDir },
    end: { x: ox + dx, y: oy + dy },
  };
}

// Таймлайн удара ближнего боя. theta — угол руки от плеча (рад, для
// facing=1: 0 = вперёд, -PI/2 = вверх), rot — поворот оружия в руке,
// lean — наклон корпуса (+ вперёд), sweep — какая доля дуги следа уже
// пройдена, slashA — яркость следа, reach — вытянутость руки.
// Два профиля, потому что момент урона разный: юнит наносит урон в КОНЦЕ
// фазы (entities.js: attackTimer<=0 => p=1) — замах долгий, удар в самом
// конце; герой — мгновенно по нажатию (updateHero) — короткий рывок и
// сразу удар, иначе управление ощущалось бы «ватным».
const ATK_REST = 1.32, ATK_BACK = -1.9, ATK_FRONT = 0.35;
function attackTimeline(p, profile) {
  let theta, rot, lean, reach, sweep = 0, slashA = 0;
  if (profile === 'hero') {
    if (p < 0.08) {
      const t = p / 0.08;
      theta = rigLerp(ATK_REST, ATK_BACK * 0.8, t); rot = rigLerp(0, -1.5, t); lean = rigLerp(0, -0.1, t); reach = rigLerp(0.85, 1, t);
    } else if (p < 0.34) {
      const t = rigEaseOut((p - 0.08) / 0.26);
      theta = rigLerp(ATK_BACK * 0.8, ATK_FRONT, t); rot = rigLerp(-1.5, 1.15, t); lean = rigLerp(-0.1, 0.18, t); reach = 1;
      sweep = t; slashA = 0.95;
    } else if (p < 0.55) {
      const t = (p - 0.34) / 0.21;
      theta = ATK_FRONT; rot = 1.15; lean = rigLerp(0.18, 0.1, t); reach = 1; sweep = 1; slashA = 0.95 * (1 - t);
    } else {
      const t = rigEaseInOut((p - 0.55) / 0.45);
      theta = rigLerp(ATK_FRONT, ATK_REST, t); rot = rigLerp(1.15, 0, t); lean = rigLerp(0.1, 0, t); reach = rigLerp(1, 0.85, t);
    }
  } else {
    if (p < 0.15) {
      const t = rigEaseInOut(p / 0.15);
      theta = rigLerp(ATK_FRONT, ATK_REST, t); rot = rigLerp(1.15, 0, t); lean = rigLerp(0.18, 0, t); reach = rigLerp(1, 0.85, t);
    } else if (p < 0.7) {
      const t = rigEaseInOut((p - 0.15) / 0.55);
      theta = rigLerp(ATK_REST, ATK_BACK, t); rot = rigLerp(0, -1.6, t); lean = rigLerp(0, -0.12, t); reach = rigLerp(0.85, 1, t);
    } else if (p < 0.93) {
      const t = rigEaseOut((p - 0.7) / 0.23);
      theta = rigLerp(ATK_BACK, ATK_FRONT, t); rot = rigLerp(-1.6, 1.15, t); lean = rigLerp(-0.12, 0.18, t); reach = 1;
      sweep = t; slashA = 0.9;
    } else {
      const t = (p - 0.93) / 0.07;
      theta = ATK_FRONT; rot = 1.15; lean = 0.18; reach = 1; sweep = 1; slashA = 0.9 * (1 - t * 0.6);
    }
  }
  return { theta, rot, lean, reach, sweep, slashA, style: profile === 'hero' ? 'hero' : 'slash', a0: ATK_BACK, a1: ATK_FRONT };
}

// Раунд 15 (И6): укол (копьё, пика, штык, ствол-«пушка»): древко отводится
// к плечу, затем резкий выпад вперёд с наклоном корпуса; вторая рука — на
// древке. Урон, как и у всех юнитов, в конце фазы (p → 1).
function thrustTimeline(p) {
  let theta, rot, lean, reach, sweep = 0, slashA = 0;
  if (p < 0.15) {
    const t = rigEaseInOut(p / 0.15);
    theta = rigLerp(0.12, 0.3, t); reach = rigLerp(1.32, 0.75, t); rot = rigLerp(0.3, 0.12, t); lean = rigLerp(0.24, 0, t);
  } else if (p < 0.74) {
    const t = rigEaseInOut((p - 0.15) / 0.59);
    theta = rigLerp(0.3, 0.24, t); reach = rigLerp(0.75, 0.3, t); rot = rigLerp(0.12, 0.04, t); lean = rigLerp(0, -0.1, t);
  } else if (p < 0.9) {
    const t = rigEaseOut((p - 0.74) / 0.16);
    theta = rigLerp(0.24, 0.1, t); reach = rigLerp(0.3, 1.32, t); rot = rigLerp(0.04, 0.3, t); lean = rigLerp(-0.1, 0.24, t);
    sweep = t; slashA = 0.85;
  } else {
    const t = (p - 0.9) / 0.1;
    theta = 0.1; reach = 1.32; rot = 0.3; lean = 0.24; sweep = 1; slashA = 0.85 * (1 - t * 0.7);
  }
  return { theta, rot, lean, reach, sweep, slashA, style: 'thrust' };
}
// Тяжёлый удар сверху (кувалда, топор): долгий замах за голову с прогибом
// назад, падение с ускорением (t²) и сильным наклоном вперёд.
const SLAM_UP = -2.35, SLAM_DOWN = 0.95;
function slamTimeline(p) {
  let theta, rot, lean, reach, sweep = 0, slashA = 0;
  if (p < 0.15) {
    const t = rigEaseInOut(p / 0.15);
    theta = rigLerp(SLAM_DOWN, ATK_REST, t); rot = rigLerp(1.25, 0, t); lean = rigLerp(0.32, 0, t); reach = rigLerp(1, 0.85, t);
  } else if (p < 0.72) {
    const t = rigEaseInOut((p - 0.15) / 0.57);
    theta = rigLerp(ATK_REST, SLAM_UP, t); rot = rigLerp(0, -1.95, t); lean = rigLerp(0, -0.16, t); reach = rigLerp(0.85, 1, t);
  } else if (p < 0.9) {
    const t0 = (p - 0.72) / 0.18, t = t0 * t0;
    theta = rigLerp(SLAM_UP, SLAM_DOWN, t); rot = rigLerp(-1.95, 1.25, t); lean = rigLerp(-0.16, 0.34, t); reach = 1;
    sweep = t; slashA = 0.9;
  } else {
    const t = (p - 0.9) / 0.1;
    theta = SLAM_DOWN; rot = 1.25; lean = 0.34 - 0.04 * t; reach = 1; sweep = 1; slashA = 0.9 * (1 - t * 0.7);
  }
  return { theta, rot, lean, reach, sweep, slashA, style: 'slam', a0: SLAM_UP, a1: SLAM_DOWN };
}
const THRUST_WEAPONS = new Set(['stick_spear', 'bronze_spear', 'pike', 'bayonet', 'cannonarm']);
const SLAM_WEAPONS = new Set(['stone_hammer', 'axe']);
function meleeTimeline(p, profile, weapon) {
  if (profile !== 'hero') {
    if (THRUST_WEAPONS.has(weapon)) return thrustTimeline(p);
    if (SLAM_WEAPONS.has(weapon)) return slamTimeline(p);
  }
  return attackTimeline(p, profile);
}

// Дальний бой: draw — натяжение (0..1), flash — вспышка выстрела сразу
// после p=0 (снаряд уже вылетел в entities.js), whirl — угол раскрутки
// пращи. Урон/снаряд — в конце фазы, как у всех юнитов.
function rangedTimeline(p) {
  let draw, flash = 0;
  if (p < 0.15) { draw = 0; flash = 1 - p / 0.15; }
  else if (p < 0.85) draw = rigEaseInOut((p - 0.15) / 0.7);
  else draw = 1;
  const whirl = p < 0.15 ? 0 : (p - 0.15) / 0.85 * Math.PI * 3;
  return { draw, flash, whirl, lean: flash * -0.08 };
}

const WEAPON_PAL_LIGHT = { main: '#d8d2c2', accent: '#c9c2ae', dark: '#8a7a63', metal: '#9aa0a8', wood: '#c9b48a' };
const WEAPON_PAL_DARK = { main: '#1e1813', accent: '#3a2c20', dark: '#2a2018', metal: '#3a3a40', wood: '#3a2c20' };
// r15 И20 (куратор №7: «вражеская толпа — сплошной чёрный клубок, типы не
// различить»): оружие живого врага — не чёрное, а тёмное дерево и серый
// металл (наконечник копья, клинок, ствол видны на тёмном теле); палитра
// DARK осталась для тел (оружие убитого на земле).
const WEAPON_PAL_ENEMY = { main: '#5a4431', accent: '#a39a8e', dark: '#4e3c2b', metal: '#8a8c94', wood: '#7a5a3a' };
// Читаемость врага: светлая кромка ПОД тёмным контуром (как ореол героя, без
// shadowBlur) отделяет фигуру от соседей в толпе; тело — два тона по id
// (чередование в строю); одежда — оттенок цвета роли (ROLE_ACCENT), как пояс у своих.
const ENEMY_READ = {
  rim: '#eedcc0',                     // кромка силуэта (непрозрачная — дешевле)
  weaponRim: 'rgba(255,238,210,.3)',  // мягкая кромка вдоль древка/клинка
  fill: ['#211a14', '#30251c'],       // тело: чётный/нечётный id
  roleMix: 0.42,                      // доля цвета роли в одежде
};
function rigHexMix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}
// Палитра костюма врага под роль: ткань/кожа/мех/бронза/щит — смесь тёмного
// тона врага с цветом роли (кэш по цвету роли — без аллокаций в кадре).
const enemyRolePalCache = new Map();
function enemyRolePal(base, roleAccent) {
  if (!roleAccent || roleAccent[0] !== '#' || roleAccent.length !== 7) return base;
  let p = enemyRolePalCache.get(roleAccent);
  if (p) return p;
  const k = ENEMY_READ.roleMix;
  p = Object.assign({}, base);
  for (const key of ['cloth', 'leather', 'fur', 'bronze', 'wicker', 'trouser']) p[key] = rigHexMix(base[key], roleAccent, k);
  for (const key of ['clothDark', 'leatherDark', 'furDark', 'bronzeDark']) p[key] = rigHexMix(base[key], roleAccent, k * 0.6);
  enemyRolePalCache.set(roleAccent, p);
  return p;
}

// Основная ось оружия — для ореола (герой) рисуется отдельным широким
// полупрозрачным штрихом ПОД самим оружием, без shadowBlur.
function weaponShaft(kind) {
  switch (kind) {
    case 'club': return [0, 0, 14, -4];
    case 'stone_hammer': return [-4, 4, 13, -9];
    case 'stick_spear': case 'bronze_spear': return [-6, 2, 22, -6];
    case 'sword': return [0, 4, 17, -8];
    case 'axe': return [0, 2, 15, -8];
    case 'bayonet': return [-6, 3, 17, -5];
    case 'pike': return [-10, 4, 26, -8];
    case 'rifle': return [-9, 4, 20, -4];
    case 'cannonarm': return [0, 1, 15, -3];
    default: return [0, 0, 12, -3];
  }
}

// weapon: рисуется как дополнительный штрих в руке персонажа, зависит от
// эпохи (см. AGES[...].weapon) и роли юнита. rot — поворот в руке (рад,
// null = покой с лёгким покачиванием restWobble). tint — цвет тира
// прокачки героя (GEAR_TIER_COLORS) красит общий штрих клинка/древка (см.
// КОНЦЕПТ_ГДД.md, «Допущения»). opts: pal (палитра стороны), glow (цвет
// ореола — герой), flash (0..1, вспышка у дула/тетивы), draw (натяжение
// лука 0..1), pull {x,y} (точка тетивы относительно кисти), whirl (праща).
function drawWeapon(ctx, kind, handX, handY, facing, rot, restWobble = 0, tint = null, opts = {}) {
  const pal = opts.pal || WEAPON_PAL_LIGHT;
  ctx.save();
  ctx.translate(handX, handY);
  ctx.rotate(facing < 0 ? Math.PI : 0);
  ctx.rotate(rot === null || rot === undefined ? restWobble : rot);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (opts.glow && !RANGED_WEAPONS.has(kind)) {
    const [x0, y0, x1, y1] = weaponShaft(kind);
    ctx.save();
    ctx.strokeStyle = opts.glow;
    ctx.lineWidth = 6.5;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = tint || pal.main;
  ctx.lineWidth = 2.4;
  switch (kind) {
    case 'club':
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(14, -4); ctx.stroke();
      ctx.fillStyle = tint || pal.dark;
      ctx.beginPath(); ctx.arc(14, -4, 3.4, 0, Math.PI * 2); ctx.fill();
      break;
    case 'stone_hammer':
      // тяжёлая двуручная кувалда — толще древко, большая гранёная голова
      ctx.lineWidth = 3.6;
      ctx.beginPath(); ctx.moveTo(-4, 4); ctx.lineTo(13, -9); ctx.stroke();
      ctx.fillStyle = tint || pal.dark;
      ctx.beginPath();
      ctx.moveTo(13, -9); ctx.lineTo(20, -14); ctx.lineTo(21, -6); ctx.lineTo(13, -2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    case 'stick_spear':
    case 'bronze_spear':
      ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(22, -6); ctx.stroke();
      ctx.fillStyle = tint || pal.accent;
      ctx.beginPath(); ctx.moveTo(22, -6); ctx.lineTo(17, -9); ctx.lineTo(19, -3); ctx.closePath(); ctx.fill();
      break;
    case 'sword':
      ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(17, -8); ctx.stroke();
      if (opts.glow) {
        // блик по кромке клинка — читается как «золотой меч» с обложки
        ctx.strokeStyle = opts.glowHi || pal.main; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(3, 1.2); ctx.lineTo(16, -8.2); ctx.stroke();
        ctx.strokeStyle = tint || pal.main;
      }
      ctx.strokeStyle = tint || pal.accent; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(3, -1); ctx.lineTo(6, 6); ctx.stroke();
      break;
    case 'axe':
      ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(15, -8); ctx.stroke();
      ctx.fillStyle = tint || pal.accent;
      ctx.beginPath(); ctx.moveTo(15, -8); ctx.lineTo(10, -13); ctx.lineTo(19, -12); ctx.closePath(); ctx.fill();
      break;
    case 'sling': {
      // Праща: ремень от кисти к «карману» с камнем; при раскрутке карман
      // идёт по кругу за кистью, в покое висит вниз.
      const w = opts.whirl || 0;
      const a = w > 0 ? w + Math.PI * 0.5 : Math.PI * 0.5; // в покое карман висит вниз
      const px = Math.cos(a) * 9, py = Math.sin(a) * 9;
      ctx.strokeStyle = pal.wood; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(px, py); ctx.stroke();
      ctx.fillStyle = tint || pal.accent;
      ctx.beginPath(); ctx.arc(px, py, 2.4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'bow': {
      // Лук в передней руке, тетива уходит к задней кисти (opts.pull —
      // относительно кисти, в СИСТЕМЕ ДО поворота — сюда приходит уже
      // повёрнутой на facing), стрела на тетиве при натяжении.
      const draw = opts.draw || 0;
      ctx.strokeStyle = pal.wood; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(2, 0, 10, -1.2, 1.2); ctx.stroke();
      const tipTopX = 2 + Math.cos(-1.2) * 10, tipTopY = Math.sin(-1.2) * 10;
      const tipBotX = 2 + Math.cos(1.2) * 10, tipBotY = Math.sin(1.2) * 10;
      const pull = opts.pull || { x: 0, y: 0 };
      ctx.strokeStyle = pal.main; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(tipTopX, tipTopY); ctx.lineTo(pull.x, pull.y); ctx.lineTo(tipBotX, tipBotY); ctx.stroke();
      if (draw > 0.05) {
        ctx.strokeStyle = tint || pal.main; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(pull.x, pull.y); ctx.lineTo(pull.x + 17, pull.y * 0.4); ctx.stroke();
        ctx.fillStyle = pal.accent;
        ctx.beginPath(); ctx.moveTo(pull.x + 17, pull.y * 0.4); ctx.lineTo(pull.x + 13, pull.y * 0.4 - 1.6); ctx.lineTo(pull.x + 13, pull.y * 0.4 + 1.6); ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'bayonet':
      // короткая винтовка со штыком — компактный силуэт ближнего боя
      ctx.beginPath(); ctx.moveTo(-6, 3); ctx.lineTo(12, -3); ctx.stroke();
      ctx.strokeStyle = tint || pal.metal; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(12, -3); ctx.lineTo(17, -5); ctx.stroke();
      break;
    case 'pike':
      // длинная пика без приклада — самый длинный силуэт роли "копейщик"
      ctx.beginPath(); ctx.moveTo(-10, 4); ctx.lineTo(26, -8); ctx.stroke();
      ctx.fillStyle = tint || pal.accent;
      ctx.beginPath(); ctx.moveTo(26, -8); ctx.lineTo(22, -11); ctx.lineTo(23, -5); ctx.closePath(); ctx.fill();
      break;
    case 'rifle': {
      // длинная винтовка с прицельной планкой — читается как "дальний бой"
      ctx.beginPath(); ctx.moveTo(-9, 4); ctx.lineTo(20, -4); ctx.stroke();
      ctx.fillStyle = pal.dark;
      ctx.beginPath(); ctx.rect(6, -3, 3, 2); ctx.fill();
      const flash = opts.flash || 0;
      if (flash > 0) {
        const g = ctx.createRadialGradient(24, -5, 0, 24, -5, 6 + flash * 4);
        g.addColorStop(0, `rgba(255,240,190,${0.9 * flash})`);
        g.addColorStop(0.5, `rgba(255,180,80,${0.55 * flash})`);
        g.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(24, -5, 6 + flash * 4, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'cannonarm':
      // короткий толстый ствол на плече — самый массивный силуэт роли "тяжёлый"
      ctx.lineWidth = 6;
      ctx.strokeStyle = tint || pal.metal;
      ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(15, -3); ctx.stroke();
      ctx.fillStyle = pal.dark;
      ctx.beginPath(); ctx.arc(15, -3, 3, 0, Math.PI * 2); ctx.fill();
      if (opts.flash > 0) { // раунд 15 (И6): выстрел в упор на выпаде тяжёлого
        const fl = opts.flash;
        const g = ctx.createRadialGradient(19, -4, 0, 19, -4, 5 + fl * 6);
        g.addColorStop(0, `rgba(255,244,200,${0.95 * fl})`);
        g.addColorStop(0.5, `rgba(255,170,70,${0.6 * fl})`);
        g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(19, -4, 5 + fl * 6, 0, Math.PI * 2); ctx.fill();
      }
      break;
    default:
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(12, -3); ctx.stroke();
  }
  ctx.restore();
}

// След-дуга удара (slash arc) — серп по траектории оружия вокруг плеча.
// Рисуется в системе верхней части тела (плечо — начало координат), до
// самой фигуры, чтобы фигура перекрывала след. style: fill, rim, glow.
function drawSlashArc(ctx, facing, sweep, alpha, r, style, from = ATK_BACK, to = ATK_FRONT) {
  if (sweep <= 0.02 || alpha <= 0.02) return;
  const a0 = from, a1 = rigLerp(from, to, sweep);
  ctx.save();
  ctx.scale(facing, 1);
  ctx.globalAlpha = alpha;
  const sickle = (rOut, rIn) => {
    ctx.beginPath();
    ctx.arc(0, 0, rOut, a0, a1);
    ctx.arc(0, 0, rIn, a1, a0 + (a1 - a0) * 0.3, true);
    ctx.closePath();
    ctx.fill();
  };
  if (style.glow) {
    ctx.fillStyle = style.glow;
    sickle(r * (style.glowR || 1.28), r * 0.42);
    if (style.glowR) sickle(r * 1.22, r * 0.5); // второй, более плотный слой ореола
  }
  ctx.fillStyle = style.fill; sickle(r, r * 0.6);
  if (style.rim) {
    ctx.strokeStyle = style.rim; ctx.lineWidth = style.rimW || 1.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, r, a0 + (a1 - a0) * 0.15, a1); ctx.stroke();
  }
  ctx.restore();
}

// «Раб с цепью» (раунд 5, физика/высота поправлены в раунде 7 по
// баг-репорту — шар катился выше линии земли) — цепь и шар волочатся
// сзади, доп. штрих поверх обычного рига (не отдельный скелет, см.
// КОНЦЕПТ_ГДД.md, «Допущения»). lag — насколько шар отстаёт по инерции
// (больше на бегу), taut — рывок натяжения цепи на ударе (0..1).
function drawChainBall(ctx, facing, lag = 6, taut = 0, pal = WEAPON_PAL_LIGHT) {
  const BALL_R = 5;
  const anchorX = -facing * 5, anchorY = -9; // у бедра, сзади по ходу
  const ballX = anchorX - facing * (8 + lag);
  const ballY = -BALL_R; // низ шара касается y=0 — линии земли
  ctx.save();
  ctx.strokeStyle = pal.metal; ctx.lineWidth = 2; ctx.lineCap = 'round';
  const segs = 5;
  ctx.beginPath(); ctx.moveTo(anchorX, anchorY);
  for (let i = 1; i <= segs; i++) {
    const tt = i / segs;
    const sag = Math.sin(tt * Math.PI) * (4.5 - taut * 3.5); // натянутая цепь почти прямая
    ctx.lineTo(anchorX + (ballX - anchorX) * tt, anchorY + (ballY - anchorY) * tt + sag);
  }
  ctx.stroke();
  ctx.fillStyle = pal.dark; ctx.strokeStyle = pal.metal; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(ballX, ballY, BALL_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(ballX - 2, ballY - 1); ctx.lineTo(ballX + 2, ballY + 1.5); ctx.stroke();
  ctx.restore();
}

// Щит — проп в задней руке (раунд 8): используется и на герое (тир
// прокачки красит цвет — бронза/серебро/золото), и на вражеском
// Щитоносце (нейтральный серый, без тира).
function drawShieldProp(ctx, x, y, facing, color, outline = '#221a10') {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color; ctx.strokeStyle = outline; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(-facing * 2, 0, 4.5, 7.5, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-facing * 2, -5); ctx.lineTo(-facing * 2, 5); ctx.stroke();
  ctx.restore();
}
// Броня — нагрудная пластина поверх торса (раунд 8, визуал прокачки).
function drawArmorPlate(ctx, hipY, shoulderY, color, outline = '#221a10') {
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = color; ctx.strokeStyle = outline; ctx.lineWidth = 1.4;
  const top = shoulderY + 2, bottom = hipY - 2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-4.5, top, 9, bottom - top, 2); else ctx.rect(-4.5, top, 9, bottom - top);
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

// Красный плащ героя (утро, покупка магазина) — асимметричный силуэт за
// спиной, читаемый признак направления даже без черт лица на стикмене.
// Висит в сторону, противоположную facing; лёгкое развевание от walkPhase
// (сильнее на бегу), кратковременный "порыв ветра" cloakFlareT — при
// развороте (см. entities.js, updateHero) распахивается заметно шире на
// ~0.35с, а не просто плавно перетекает в зеркальное положение.
// Раунд 15 (И6): fill/stroke/len — короткая золотая накидка героя по
// умолчанию (ART.costume.pal.hero.cape); красный плащ магазина — как был.
function drawCloak(ctx, hipY, shoulderY, facing, walkPhase, moving, cloakFlareT, fill = '#c62828', stroke = '#5a0f0f', len = 1, wide = 1) {
  const back = -facing;
  const sway = Math.sin(walkPhase * (moving ? 1 : 0.35)) * (moving ? 5 : 1.5) * len;
  const flare = cloakFlareT > 0 ? Math.sin(cloakFlareT * Math.PI) * 12 * len : 0;
  const attachY = shoulderY + 3;
  const midY = (shoulderY + hipY) / 2;
  const midX = back * (9 * wide + sway + flare) * len;
  const botX = back * (6 * wide + sway * 1.4 + flare * 1.3) * len;
  const botY = shoulderY + (hipY + 4 - shoulderY) * len;
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-back * 1.2, attachY);
  ctx.quadraticCurveTo(midX, midY, botX, botY);
  ctx.lineTo(back * 1.2, Math.min(hipY - 1, botY - 2));
  ctx.quadraticCurveTo(midX * 0.65, midY, -back * 1.2, attachY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- костюмы
// Раунд 15 (И6). Костюм выбирается по (эпоха, роль) из ART.costume. Если
// вызывающий не передал outfit/ageId (иконки тулбара, справка, сцена меню),
// они выводятся из оружия: у каждой пары «роль × эпоха» своё оружие (AGES).
const OUTFIT_BY_WEAPON = (() => {
  const m = {};
  if (typeof AGES === 'undefined') return m;
  for (const id of Object.keys(AGES)) {
    const w = AGES[id].weapon;
    for (const r of Object.keys(w)) m[w[r]] = { ageId: id, role: r };
  }
  return m;
})();
function resolveOutfit(o) {
  const C = ART.costume;
  if (!C || o.outfit === false) return null;
  let ageId = o.ageId || null, key = o.outfit || null;
  if (!ageId || !key) {
    const inf = o.weapon ? OUTFIT_BY_WEAPON[o.weapon] : null;
    if (!ageId && inf) ageId = inf.ageId;
    if (!key) key = o.hero ? 'hero' : (inf ? inf.role : null);
  }
  if (!key) return null;
  if (C.common[key]) return C.common[key];
  if (!ageId) return null;
  return (C[ageId] || C.stone)[key] || null;
}

// Корпус: трапеция от плеч к бёдрам с выпуклой грудью по ходу (f — facing).
// Координаты — система бедра (0,0), S — y плеча (отрицательный).
const TORSO_BOTTOM = 1.2;
function torsoPath(ctx, S, f, bulk, k = 1) {
  const sw = 4.3 * bulk * k, hw = 3.4 * bulk * k, by = TORSO_BOTTOM;
  const top = S + (1 - k) * 3;
  ctx.beginPath();
  ctx.moveTo(-f * sw * 0.85, top + 0.2);
  ctx.quadraticCurveTo(0, top - 1.8, f * sw, top + 0.4);
  ctx.quadraticCurveTo(f * (sw + 1.3), (top + by) * 0.5, f * hw, by);
  ctx.lineTo(-f * hw * 0.95, by);
  ctx.quadraticCurveTo(-f * (sw - 0.4), (top + by) * 0.5, -f * sw * 0.85, top + 0.2);
  ctx.closePath();
}

// Слой за спиной: колчан, фалды мундира, сумка-перевязь.
function drawOutfitBack(ctx, oc, cp, S, f, bulk, ol) {
  const hw = 3.4 * bulk;
  ctx.lineWidth = 1.1; ctx.strokeStyle = ol;
  if (oc.quiver) {
    ctx.save(); ctx.translate(-f * 3.6, S + 5.5); ctx.rotate(f * 0.38);
    ctx.fillStyle = cp.leather;
    ctx.beginPath(); ctx.rect(-1.7, -6.5, 3.4, 11); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = cp.trim; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const dx of [-1, 0.2, 1.3]) { ctx.moveTo(dx, -6.5); ctx.lineTo(dx, -9.5); }
    ctx.stroke();
    ctx.restore();
  }
  if (oc.body === 'coat') {
    ctx.fillStyle = cp.clothDark;
    ctx.beginPath();
    ctx.moveTo(-f * hw * 0.3, TORSO_BOTTOM - 4);
    ctx.lineTo(-f * (hw + 3.8), TORSO_BOTTOM + 6.8);
    ctx.lineTo(-f * (hw + 0.6), TORSO_BOTTOM + 7.4);
    ctx.lineTo(f * 0.5, TORSO_BOTTOM + 1);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}

// Уровень детализации (бюджет кадра, ТЗ И6 п.5): при толпе (RIG_LOD.lite
// выставляет render() в game.js по числу фигур) и у тел убитых мелочь —
// швы кирасы, пуговицы, блики, бахрома наплечников, кокарды — не рисуется;
// силуэт, цвета, головной убор и пояс роли остаются.
const RIG_LOD = { lite: false };
let rigDetail = true;
// Юбка/бахрома под корпусом, сам корпус и детали, наплечники, пояс роли.
function drawOutfitBody(ctx, oc, cp, S, f, bulk, ol, enemy, armorTint, roleAccent) {
  const sw = 4.3 * bulk, hw = 3.4 * bulk, by = TORSO_BOTTOM;
  ctx.lineWidth = 1.1; ctx.strokeStyle = ol;
  const body = oc.body;
  if (body === 'rags') {
    // набедренная повязка поверх палочки-торса
    ctx.fillStyle = cp.leather;
    ctx.beginPath();
    ctx.moveTo(-f * 3.6, -2.2); ctx.lineTo(f * 3.8, -2.2); ctx.lineTo(f * 2.6, 4.6); ctx.lineTo(f * 0.2, 2.4); ctx.lineTo(-f * 1.8, 5.2);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    if (oc.collar) {
      ctx.strokeStyle = cp.steelDark; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, S - 1.2, 2.8, 1.3, 0, 0, Math.PI * 2); ctx.stroke();
    }
    return;
  }
  // низ: бахрома шкуры / птеруги / подол
  if (body === 'hide' || body === 'fur') {
    ctx.fillStyle = body === 'fur' ? cp.furDark : cp.leather;
    ctx.beginPath();
    ctx.moveTo(-f * hw, by - 2.5);
    ctx.lineTo(f * hw * 1.05, by - 2.5);
    const n = 4, x0 = f * hw * 1.05, x1 = -f * hw;
    for (let i = 1; i <= n; i++) {
      const xa = x0 + (x1 - x0) * (i - 0.5) / n, xb = x0 + (x1 - x0) * i / n;
      ctx.lineTo(xa, by + 4.6 + (i % 2) * 1.2); ctx.lineTo(xb, by + 1.6);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (oc.skirt) {
    ctx.fillStyle = cp.cloth;
    ctx.beginPath(); // одним путём — 1 fill + 1 stroke вместо 4+4 (бюджет кадра)
    for (let i = 0; i < 4; i++) ctx.rect(-hw + i * (hw * 2 / 4) + 0.2, by - 1.5, hw * 2 / 4 - 0.4, 5.8);
    ctx.fill(); ctx.stroke();
  } else if (body === 'tunic') {
    ctx.fillStyle = cp.cloth;
    ctx.beginPath(); ctx.moveTo(-hw, by - 2); ctx.lineTo(hw, by - 2); ctx.lineTo(hw + 1.2, by + 4.2); ctx.lineTo(-hw - 1.2, by + 4.2); ctx.closePath();
    ctx.fill(); ctx.stroke();
  } else if (body === 'coat') {
    ctx.fillStyle = cp.cloth;
    ctx.beginPath(); ctx.moveTo(-hw, by - 2); ctx.lineTo(hw, by - 2); ctx.lineTo(f * (hw + 0.8), by + 3.8); ctx.lineTo(-f * (hw * 0.4), by + 3.8); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  // корпус
  let fill = cp.leather;
  if (body === 'fur') fill = cp.fur;
  else if (body === 'cuirass') fill = armorTint || cp.bronze;
  else if (body === 'tunic' || body === 'coat') fill = cp.cloth;
  torsoPath(ctx, S, f, bulk);
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = 1.3; ctx.stroke();
  // детали корпуса
  ctx.lineWidth = 1;
  if (!rigDetail) {
    if (oc.sash || oc.strap) {
      ctx.strokeStyle = cp.accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-f * sw * 0.75, S + 0.8); ctx.lineTo(f * hw * 0.9, by - 1.6); ctx.stroke();
    }
  } else if (body === 'hide') {
    ctx.strokeStyle = oc.strap ? cp.accent : cp.leatherDark; ctx.lineWidth = oc.strap ? 2 : 1.6;
    ctx.beginPath(); ctx.moveTo(f * sw * 0.75, S + 0.6); ctx.lineTo(-f * hw * 0.9, by - 2.2); ctx.stroke();
    ctx.fillStyle = cp.leatherDark;
    ctx.beginPath(); ctx.arc(-f * 1.4, S + 8, 0.9, 0, Math.PI * 2); ctx.arc(f * 1.6, S + 11.5, 0.8, 0, Math.PI * 2); ctx.fill();
  } else if (body === 'fur') {
    ctx.fillStyle = cp.furDark; ctx.strokeStyle = ol;
    ctx.beginPath(); ctx.ellipse(0, S + 0.8, sw + 0.4, 2.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (body === 'cuirass') {
    ctx.strokeStyle = cp.bronzeDark; ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-f * 1.2, S + 4.6); ctx.quadraticCurveTo(f * 1.4, S + 6.8, f * sw * 0.95, S + 4.2);
    ctx.moveTo(f * 0.8, S + 7.2); ctx.lineTo(f * 0.8, by - 3.4);
    ctx.stroke();
    ctx.fillStyle = cp.bronzeDark;
    ctx.fillRect(-hw, by - 3.2, hw * 2, 1.7);
    if (!enemy) {
      ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(f * 1.2, S + 1.6); ctx.quadraticCurveTo(f * sw * 0.9, S + 1.4, f * (sw + 0.4), S + 3.6); ctx.stroke();
    }
  } else if (body === 'tunic') {
    ctx.fillStyle = cp.leatherDark; ctx.fillRect(-hw, by - 3.2, hw * 2, 1.6);
    ctx.strokeStyle = cp.trim; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(-f * 1.5, S + 0.4); ctx.lineTo(f * 0.6, S + 3.4); ctx.lineTo(f * 2.4, S + 0.4); ctx.stroke();
  } else if (body === 'coat') {
    ctx.strokeStyle = cp.trim; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(f * sw * 0.55, S + 1); ctx.lineTo(f * hw * 0.8, by); ctx.stroke();
    ctx.fillStyle = cp.bronze;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { const bx = f * (sw * 0.55 - 1.2 - i * 0.05), byy = S + 3.5 + i * 3.4; ctx.moveTo(bx + 0.55, byy); ctx.arc(bx, byy, 0.55, 0, Math.PI * 2); }
    ctx.fill();
    if (oc.belts) {
      ctx.strokeStyle = cp.trim; ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(f * sw * 0.8, S + 0.6); ctx.lineTo(-f * hw * 0.8, by - 1.2);
      ctx.moveTo(-f * sw * 0.75, S + 0.6); ctx.lineTo(f * hw * 0.9, by - 1.2);
      ctx.stroke();
    }
    if (oc.sash) {
      ctx.strokeStyle = cp.accent; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(-f * sw * 0.75, S + 0.8); ctx.lineTo(f * hw * 0.9, by - 1.6); ctx.stroke();
    }
    // высокий воротник
    ctx.fillStyle = cp.clothDark; ctx.strokeStyle = ol; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.rect(-1.8, S - 1.6, 3.6, 1.8); ctx.fill(); ctx.stroke();
  }
  // броня героя (тир магазина) — нагрудник поверх любой одежды, кроме кирасы
  if (armorTint && body !== 'cuirass') {
    torsoPath(ctx, S, f, bulk, 0.72);
    ctx.fillStyle = armorTint; ctx.fill();
    ctx.strokeStyle = ol; ctx.lineWidth = 1; ctx.stroke();
  }
  if (oc.satchel) {
    ctx.strokeStyle = cp.leatherDark; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-f * sw * 0.7, S + 0.6); ctx.lineTo(f * hw * 0.6, by - 4); ctx.stroke();
    ctx.fillStyle = cp.leather; ctx.strokeStyle = ol; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.rect(f > 0 ? 0.6 : -5.6, by - 5.6, 5, 4.2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = cp.hat;
    ctx.beginPath(); ctx.arc(f * 3.1, by - 6.2, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  // пояс-перевязь роли (второй сигнал роли на малом масштабе, раунд 3)
  if (roleAccent) {
    ctx.strokeStyle = roleAccent; ctx.lineWidth = 1.7;
    ctx.globalAlpha *= enemy ? 0.85 : 1;
    ctx.beginPath(); ctx.moveTo(-hw * 0.98, by - 2.3); ctx.lineTo(hw * 0.98, by - 2.3); ctx.stroke();
    if (enemy) ctx.globalAlpha /= 0.85;
  }
}

// Наплечники — у тяжёлого и героя, делают силуэт массивным.
function drawPads(ctx, kind, cp, S, f, bulk, ol) {
  ctx.lineWidth = 1.1; ctx.strokeStyle = ol;
  if (kind === 'fur') {
    ctx.fillStyle = cp.fur;
    ctx.beginPath(); ctx.ellipse(f * 0.6, S + 1.2, 5.6 * bulk * 0.85, 3.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (!rigDetail) return;
    ctx.strokeStyle = cp.furDark; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const dx of [-3, 0, 3]) { ctx.moveTo(f * (0.6 + dx), S + 3.6); ctx.lineTo(f * (0.6 + dx * 1.2), S + 5.4); }
    ctx.stroke();
  } else if (kind === 'plate') {
    ctx.fillStyle = cp.bronze;
    ctx.beginPath(); ctx.ellipse(f * 0.8, S + 0.9, 5.4, 3.2, f * 0.15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(f * 1.4, S + 3.6, 4.3, 2.4, f * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (kind === 'epaulette') {
    ctx.fillStyle = cp.bronze;
    ctx.beginPath(); ctx.ellipse(f * 0.7, S + 0.3, 4.4, 1.9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (!rigDetail) return;
    ctx.strokeStyle = cp.bronze; ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (const dx of [-2.4, -0.8, 0.8, 2.4]) { ctx.moveTo(f * (0.7 + dx), S + 1.8); ctx.lineTo(f * (0.7 + dx), S + 3.8); }
    ctx.stroke();
  }
}

// Головные уборы. Рисуются в системе головы: (0,0) — центр головы, ось x
// направлена по взгляду (ctx.scale(f,1) снаружи), R — радиус головы.
function drawHeadgear(ctx, kind, cp, R, ol, time, enemy) {
  ctx.lineWidth = 1.1; ctx.strokeStyle = ol; ctx.lineJoin = 'round';
  const dome = (r, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.arc(0, -0.4, r, 0, Math.PI, true); ctx.closePath(); ctx.fill(); ctx.stroke();
  };
  switch (kind) {
    case 'band': {
      ctx.fillStyle = cp.accent;
      ctx.beginPath(); ctx.moveTo(-R * 1.02, -2.8); ctx.lineTo(R * 1.02, -2.8); ctx.lineTo(R, -0.8); ctx.lineTo(-R, -0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
      const sw = Math.sin(time * 6) * 1.2;
      ctx.strokeStyle = cp.accent; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-R * 0.9, -1.8); ctx.lineTo(-R - 4.8, 0.6 + sw); ctx.moveTo(-R * 0.9, -1.6); ctx.lineTo(-R - 3.4, 3.4 + sw * 0.6); ctx.stroke();
      break;
    }
    case 'bone': {
      ctx.fillStyle = cp.bone;
      ctx.beginPath();
      for (const a of [-2.45, -1.95, -1.45]) {
        const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
        const len = a === -1.95 ? 6.2 : 4.6;
        ctx.moveTo(ca * R * 0.8 + px * 1.5, sa * R * 0.8 + py * 1.5);
        ctx.lineTo(ca * (R + len), sa * (R + len));
        ctx.lineTo(ca * R * 0.8 - px * 1.5, sa * R * 0.8 - py * 1.5);
        ctx.closePath();
      }
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = cp.accent;
      ctx.beginPath(); ctx.rect(-R, -1.9, R * 2, 1.6); ctx.fill();
      break;
    }
    case 'furcap': {
      ctx.fillStyle = cp.furDark; ctx.lineWidth = 2.6; ctx.strokeStyle = cp.furDark; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-R * 0.8, -1); ctx.quadraticCurveTo(-R - 3, 2, -R - 1.8, 6.5); ctx.stroke();
      ctx.lineWidth = 1.1; ctx.strokeStyle = ol;
      dome(R + 0.8, cp.fur);
      ctx.fillStyle = cp.furDark;
      ctx.beginPath(); ctx.ellipse(0, -0.6, R + 1.2, 1.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = cp.accent; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-1.5, -R - 0.2); ctx.quadraticCurveTo(-3, -R - 4, -5.5, -R - 6.2); ctx.stroke();
      break;
    }
    case 'skull': {
      ctx.fillStyle = cp.bone;
      ctx.beginPath(); ctx.moveTo(-3, -R + 1); ctx.quadraticCurveTo(-8.5, -R - 0.5, -7.5, -R - 7.5); ctx.quadraticCurveTo(-4.8, -R - 2.6, 0.2, -R + 0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1, -R + 0.4); ctx.quadraticCurveTo(5.4, -R - 0.8, 5.8, -R - 6.2); ctx.quadraticCurveTo(3.4, -R - 2, 3.6, -R + 1.4); ctx.closePath(); ctx.fill(); ctx.stroke();
      dome(R + 1.2, cp.bone);
      ctx.beginPath(); ctx.moveTo(R * 0.3, -R * 0.55); ctx.lineTo(R + 3.6, -1.2); ctx.lineTo(R + 2.6, 0.8); ctx.lineTo(R * 0.5, -0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = enemy ? cp.slit : cp.leatherDark;
      ctx.beginPath(); ctx.arc(R * 0.55, -R * 0.45, 1, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'crest':
    case 'crestT':
    case 'heroBronze':
    case 'corinth': {
      const full = kind === 'corinth' || kind === 'heroBronze';
      const r = R + 1.1;
      // гребень — под шлемом, чтобы основание пряталось
      ctx.fillStyle = cp.accent;
      if (kind === 'crestT') {
        ctx.beginPath(); ctx.ellipse(0.2, -R - 4.2, 2.6, 5.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else {
        const big = full ? 4.6 : 3.4;
        ctx.beginPath();
        ctx.arc(-0.6, -0.8, r + big, Math.PI * 1.08, Math.PI * 1.9);
        ctx.arc(-0.6, -0.8, r - 0.6, Math.PI * 1.88, Math.PI * 1.1, true);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        if (full) { // хвост гребня за спиной
          ctx.beginPath(); ctx.moveTo(-r - 0.5, -2.5); ctx.quadraticCurveTo(-r - 5, 0, -r - 3.6, 5.5); ctx.lineTo(-r - 1.2, 1); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      }
      ctx.fillStyle = cp.bronze;
      if (full) {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = cp.slit; // Т-образная прорезь
        ctx.beginPath(); ctx.moveTo(R * 0.05, -1.5); ctx.lineTo(r + 0.2, -1.8); ctx.lineTo(r + 0.2, -0.3); ctx.lineTo(R * 0.75, -0.2); ctx.lineTo(R * 0.72, 3.6); ctx.lineTo(R * 0.45, 3.6); ctx.lineTo(R * 0.4, -0.2); ctx.lineTo(R * 0.05, -0.1); ctx.closePath(); ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(r, 0.2);
        ctx.arc(0, 0, r, 0, Math.PI, true);
        ctx.lineTo(-r + 0.2, 3.4); ctx.lineTo(-R + 2.4, 2.6); ctx.lineTo(-R + 2.6, -0.8);
        ctx.lineTo(R * 0.3, -0.9); ctx.lineTo(R * 0.42, 3.8); ctx.lineTo(r, 2.6);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      if (!enemy && rigDetail) {
        ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.arc(0, 0, r - 1.4, -2.4, -1.5); ctx.stroke();
      }
      break;
    }
    case 'cone': {
      ctx.fillStyle = cp.bronze;
      ctx.beginPath(); ctx.moveTo(-R - 1, -0.4); ctx.lineTo(R + 1, -0.4); ctx.lineTo(0.8, -R - 6.8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.rect(R - 0.9, -1, 1.5, 4.4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = cp.bronzeDark; ctx.fillRect(-R - 1, -1.6, R * 2 + 2, 1.3);
      break;
    }
    case 'shako': {
      ctx.fillStyle = cp.hat;
      ctx.beginPath(); ctx.moveTo(-R * 0.82, -R * 0.3); ctx.lineTo(-R * 0.95, -R - 5.6); ctx.lineTo(R * 0.98, -R - 5.6); ctx.lineTo(R * 0.86, -R * 0.3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(R * 0.6, -R * 0.45); ctx.quadraticCurveTo(R + 2.6, -R * 0.35, R + 3.4, 0); ctx.lineTo(R * 0.55, -R * 0.12); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (rigDetail) {
        ctx.strokeStyle = cp.trim; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(-R * 0.94, -R - 4.6); ctx.lineTo(R * 0.97, -R - 4.6); ctx.stroke();
        ctx.fillStyle = cp.bronze;
        ctx.beginPath(); ctx.arc(R * 0.18, -R - 1.4, 1.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = cp.accent; ctx.strokeStyle = ol; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.ellipse(R * 0.15, -R - 7.6, 1.6, 2.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    }
    case 'tricorne': {
      ctx.fillStyle = cp.hat;
      ctx.beginPath();
      ctx.moveTo(-R - 3.6, -R * 0.2);
      ctx.quadraticCurveTo(-R - 1, -R - 4, 0, -R - 1.8);
      ctx.quadraticCurveTo(R + 1, -R - 4, R + 3.6, -R * 0.2);
      ctx.quadraticCurveTo(0, -R * 0.95, -R - 3.6, -R * 0.2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      if (rigDetail) {
        ctx.strokeStyle = cp.trim; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(-R - 3, -R * 0.3); ctx.quadraticCurveTo(0, -R * 0.85, R + 3, -R * 0.3); ctx.stroke();
      }
      ctx.fillStyle = cp.accent;
      ctx.beginPath(); ctx.arc(R * 0.55, -R - 0.6, 1.3, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'morion': {
      ctx.fillStyle = cp.steel;
      ctx.beginPath(); ctx.moveTo(-R * 0.75, -R * 0.55); ctx.quadraticCurveTo(0, -R - 6.2, R * 0.75, -R * 0.55); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -R * 0.35, R * 0.82, 0, Math.PI, true); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-R - 3.8, -R * 1.05); ctx.quadraticCurveTo(0, -R * 0.1, R + 3.8, -R * 1.05); ctx.quadraticCurveTo(0, -R * 0.55, -R - 3.8, -R * 1.05); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (!enemy && rigDetail) { ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-R * 0.4, -R - 1.6); ctx.quadraticCurveTo(0, -R - 3.8, R * 0.4, -R - 1.6); ctx.stroke(); }
      break;
    }
    case 'spike': {
      ctx.fillStyle = cp.bronze;
      ctx.beginPath(); ctx.moveTo(-1.3, -R - 1); ctx.lineTo(0, -R - 6.8); ctx.lineTo(1.3, -R - 1); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = cp.hat;
      ctx.beginPath();
      ctx.moveTo(R + 1, -0.6);
      ctx.arc(0, -0.6, R + 1, 0, Math.PI, true);
      ctx.lineTo(-R - 1.4, 2.2); ctx.lineTo(-R + 1.8, 1.6); ctx.lineTo(-R + 2, -0.6);
      ctx.lineTo(R * 0.6, -0.6); ctx.lineTo(R + 2.6, 0.6); ctx.lineTo(R + 1.2, -0.6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = cp.bronze;
      ctx.beginPath(); ctx.arc(R * 0.35, -R * 0.55, 1.3, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'heroStone': {
      const cols = [cp.accent, cp.trim, cp.bronze];
      [-2.1, -1.65, -1.2].forEach((a, i) => {
        ctx.save(); ctx.rotate(a + Math.PI / 2 + Math.sin(time * 3 + i) * 0.05);
        ctx.fillStyle = cols[i];
        ctx.beginPath(); ctx.ellipse(0, -R - 4.2, 1.7, 4.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.restore();
      });
      ctx.fillStyle = cp.bronze;
      ctx.beginPath(); ctx.moveTo(-R - 0.4, -3.2); ctx.lineTo(R + 0.4, -3.2); ctx.lineTo(R + 0.2, -0.9); ctx.lineTo(-R - 0.2, -0.9); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = cp.accent;
      ctx.beginPath(); ctx.arc(R * 0.55, -2.05, 0.9, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'heroIron': {
      ctx.fillStyle = cp.trim; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(-1.5, -R - 5.2, 2, 3.6, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = cp.hat; ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-R - 4.8, -R * 0.1);
      ctx.quadraticCurveTo(-0.5, -R - 7.8, R + 4.8, -R * 0.1);
      ctx.quadraticCurveTo(0, -R * 0.8, -R - 4.8, -R * 0.1);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = cp.bronze; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-R - 4, -R * 0.25); ctx.quadraticCurveTo(-0.5, -R - 6.6, R + 4, -R * 0.25); ctx.stroke();
      ctx.fillStyle = cp.accent;
      ctx.beginPath(); ctx.arc(R * 0.2, -R - 1.6, 1.5, 0, Math.PI * 2); ctx.fill();
      break;
    }
    default: break;
  }
}

// Щит в руке перед корпусом. tint — цвет тира прокачки героя.
function drawGearShield(ctx, kind, x, y, f, cp, ol, enemy, tint) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(f, 1);
  ctx.lineWidth = 1.3; ctx.strokeStyle = ol;
  switch (kind) {
    case 'wicker': {
      ctx.fillStyle = cp.wicker;
      ctx.beginPath(); ctx.ellipse(0, 0, 4.8, 7.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = cp.leatherDark; ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (const yy of [-4.4, -1.5, 1.5, 4.4]) { const hw = 4.6 * Math.sqrt(Math.max(0, 1 - (yy * yy) / 61)); ctx.moveTo(-hw, yy); ctx.lineTo(hw, yy); }
      ctx.moveTo(0, -7.4); ctx.lineTo(0, 7.4);
      ctx.stroke();
      break;
    }
    case 'hide': {
      ctx.fillStyle = cp.leather;
      ctx.beginPath(); ctx.arc(0, 0, 6.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = cp.leatherDark; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(-4.6, -4.6); ctx.lineTo(4.6, 4.6); ctx.moveTo(4.6, -4.6); ctx.lineTo(-4.6, 4.6); ctx.stroke();
      break;
    }
    case 'round': {
      ctx.fillStyle = tint || cp.bronze;
      ctx.beginPath(); ctx.arc(0, 0, 7.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = cp.bronzeDark; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, 5.7, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = tint ? cp.accent : cp.accent;
      ctx.beginPath(); ctx.arc(0.4, 0, 2.6, 0, Math.PI * 2); ctx.fill();
      if (!enemy) {
        ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, 6.3, -2.6, -1.4); ctx.stroke();
      }
      break;
    }
    case 'tower': {
      ctx.fillStyle = tint || (enemy ? cp.leather : cp.cloth);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-4.6, -9.8, 9.2, 19.6, 3); else ctx.rect(-4.6, -9.8, 9.2, 19.6);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = cp.bronze; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, -8.4); ctx.lineTo(0, 8.4); ctx.moveTo(-3.4, 0); ctx.lineTo(3.4, 0); ctx.stroke();
      ctx.fillStyle = cp.bronze;
      ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = ol; ctx.lineWidth = 0.9; ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

// Смерть: три позы (назад / на колени и ничком / отлёт от сильного удара),
// тело лежит DEATH_HOLD с и за DEATH_FADE с оседает и растворяется.
const DEATH_HOLD = 0.9, DEATH_FADE = 0.6;
const DEATH_TOTAL = DEATH_HOLD + DEATH_FADE;

/**
 * Рисует стикмена. Все координаты pose — в мировых пикселях, x/y = точка
 * стопы на земле (контакт с ground line). Размер фигуры = RIG × scale ×
 * RIG_K (иконки HUD/справки передают scale/RIG_K, чтобы влезть в канвас).
 *
 * Раунд 14: enemy (силуэт: чёрная заливка + тёплая кромка, тёмное оружие),
 * elite (красная кромка + свечение под ногами), attackProfile ('unit' —
 * урон в конце фазы, 'hero' — мгновенно), buffed (аура Боевого клича), time
 * (секунды — дыхание в покое, пульс ауры), shadow (тень-эллипс).
 * Раунд 15 (И6): outfit/ageId (костюм; без них — выводится из weapon),
 * deathSec (секунды после смерти; deathT 0..1 — старый формат, ×0.6 с),
 * deathKind ('back' | 'knees' | 'fly'), dressFlash (0..1 — вспышка
 * «переодевания» при смене эпохи).
 */
function drawStickman(ctx, o) {
  const {
    x, y, scale = 1, outline = ART.player.outline, facing = 1,
    walkPhase = 0, moving = false, attackPhase = null, deathT = null, hitFlash = 0,
    weapon = null, hero = false, roleAccent = null,
    bent = false, cheer = false, chainBall = false, chainLag = 6, chainTaut = 0,
    digPhase = null,
    gearSwordTier = 0, gearShieldTier = 0, gearArmorTier = 0, shieldColor = null,
    cloak = false, cloakFlareT = 0,
    enemy = false, elite = false, attackProfile = 'unit', buffed = false, time = 0, shadow = true,
    marker = false,
    deathKind = 'back', dressFlash = 0,
  } = o;
  // r15 И20: тело врага — два тона по o.shade (id юнита), не один чёрный
  const color = (enemy && o.color === ART.enemy.fill) ? ENEMY_READ.fill[o.shade ? 1 : 0] : (o.color || ART.player.fill);
  const deathSec = (o.deathSec !== undefined && o.deathSec !== null) ? o.deathSec : (deathT !== null && deathT !== undefined ? deathT * 0.6 : null);
  const dead = deathSec !== null;
  if (dead && deathSec >= DEATH_TOTAL) return;
  const f = facing;
  const oc = resolveOutfit(o);
  const CPAL = ART.costume && ART.costume.pal;
  const cp = oc ? (hero ? CPAL.hero : enemy ? (dead ? CPAL.enemy : enemyRolePal(CPAL.enemy, roleAccent)) : CPAL.player) : null; // И20: одежда врага — в цвет роли
  const bulk = (oc && oc.bulk) || 1;
  const LW = RIG.lineWidth * (bulk > 1 ? 1.22 : 1);
  const HR = oc ? 5.4 * (oc.headK || 1) : RIG.head; // headK — раб-великан (heightMult 1.5): голова не «шар»
  rigDetail = !(RIG_LOD.lite && !hero) && !dead; // толпа/тело — без мелких деталей (RIG_LOD)
  const s = scale * RIG_K;
  const wpal = enemy ? (dead ? WEAPON_PAL_DARK : WEAPON_PAL_ENEMY) : WEAPON_PAL_LIGHT;
  const isRanged = weapon !== null && RANGED_WEAPONS.has(weapon);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // --- земля: тень, свечение элиты, аура клича (до поворота смерти) ---
  const fade = !dead ? 1 : deathSec < DEATH_HOLD ? 1 : Math.max(0, 1 - (deathSec - DEATH_HOLD) / DEATH_FADE);
  if (shadow) {
    const lying = dead ? Math.min(1, deathSec / 0.5) : 0;
    ctx.fillStyle = ART.shadow;
    ctx.globalAlpha = dead ? fade * 0.85 : 1;
    ctx.beginPath(); ctx.ellipse(dead && deathKind === 'fly' ? -f * 20 * lying : 0, 0.5, 11 * (1 + lying * 0.9), 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (elite && enemy && !dead) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
    g.addColorStop(0, ART.enemy.eliteGlow); g.addColorStop(1, 'rgba(200,48,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0.5, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (buffed && !dead) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 9);
    ctx.save();
    ctx.strokeStyle = ART.cryAura; ctx.lineWidth = 2 + pulse;
    ctx.globalAlpha = 0.55 + pulse * 0.35;
    ctx.beginPath(); ctx.ellipse(0, 0.5, 12 + pulse * 2, 4 + pulse * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // Оружие убитого выпадает и лежит на земле рядом (раньше оставалось в
  // руке и после поворота тела торчало «под землю»).
  if (dead && weapon && !cheer && weapon !== 'cannonarm') {
    const k = Math.min(1, deathSec / 0.35);
    const dx = deathKind === 'fly' ? -f * (6 + 18 * k) : f * (6 + 6 * k);
    ctx.save();
    ctx.globalAlpha = fade;
    drawWeapon(ctx, weapon, dx - f * 6, -1.5 - (1 - k) * 14, f, (1 - k) * -0.9 * (RANGED_WEAPONS.has(weapon) ? 0 : 1), 0, hero ? ART.hero.gold : null, { pal: wpal, draw: 0 });
    ctx.restore();
  }
  // щит тоже падает плашмя у ног (не уходит «под землю» вместе с рукой)
  const dropShield = dead && !cheer && oc ? (hero ? (gearShieldTier > 0 ? 'round' : null) : oc.shield) : null;
  if (dropShield) {
    const k = Math.min(1, deathSec / 0.3);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(f * 3, -2 - (1 - k) * 12);
    ctx.scale(1.15, 1 - 0.62 * k);
    drawGearShield(ctx, dropShield, 0, 0, f, cp, outline, enemy, hero && gearShieldTier > 0 ? GEAR_TIER_COLORS[gearShieldTier - 1] : null);
    ctx.restore();
  }
  // --- смерть: поза по виду, затем оседание в землю и растворение ---
  let kneel = 0;
  if (dead) {
    const ts = deathSec;
    const sink = ts > DEATH_HOLD ? (ts - DEATH_HOLD) / DEATH_FADE * 5 : 0;
    if (deathKind === 'fly') {
      const k = Math.min(1, ts / 0.55), e = rigEaseOut(k);
      ctx.translate(-f * 22 * e, -Math.sin(k * Math.PI) * 12 - 1 + sink);
      ctx.rotate(-f * (Math.PI / 2) * Math.min(1, e * 1.06));
    } else if (deathKind === 'knees') {
      kneel = Math.min(1, ts / 0.26);
      const k2 = Math.max(0, Math.min(1, (ts - 0.3) / 0.32));
      ctx.translate(0, sink);
      ctx.rotate(f * (Math.PI / 2) * 0.94 * k2 * k2);
    } else {
      const fall = rigEaseOutBack(Math.min(1, ts / 0.48));
      ctx.translate(0, -1 - Math.sin(Math.min(1, ts / 0.24) * Math.PI) * 2.5 + sink);
      ctx.rotate(-f * fall * (Math.PI / 2)); // назад — от того, кто ударил
    }
    ctx.globalAlpha = fade;
  }
  // «Переодевание» при смене эпохи — короткий «поп» масштаба.
  if (dressFlash > 0 && !dead) { const k = 1 + Math.sin(dressFlash * Math.PI) * 0.1; ctx.scale(k, k); }
  const cheerBounce = (cheer && !dead) ? Math.abs(Math.sin(walkPhase)) * 7 : 0;
  if (cheerBounce) ctx.translate(0, -cheerBounce);
  if (bent && !dead) ctx.rotate(f * 0.16);

  const legsMoving = moving && !dead;
  const legSwing = legsMoving ? Math.sin(walkPhase) * 9 : 0;
  const legSwing2 = legsMoving ? Math.sin(walkPhase + Math.PI) * 9 : 0;
  const bob = legsMoving ? Math.abs(Math.cos(walkPhase)) * 2 : 0;
  const liftFront = legsMoving ? Math.max(0, Math.cos(walkPhase)) * 4 : 0;
  const liftBack = legsMoving ? Math.max(0, Math.cos(walkPhase + Math.PI)) * 4 : 0;
  const breath = (!legsMoving && !dead && !cheer) ? Math.sin(time * 2.2) * 0.6 : 0;

  const hipY = -RIG.legLen - bob + kneel * 7;
  const T = RIG.torso;
  const shoulderLocal = -T + breath;
  const S = shoulderLocal;
  const headLocal = S - RIG.neck - HR;

  const legBack = limbPoints(0, hipY, f * legSwing2 * 0.6 - f * kneel * 7, -liftBack, LEG_SEG, -f);
  const legFront = limbPoints(0, hipY, f * legSwing * 0.6 + f * kneel * 3, -liftFront, LEG_SEG, -f);

  const shieldKind = hero ? (gearShieldTier > 0 ? 'round' : null) : (oc && oc.shield) || null;
  const shieldTint = hero && gearShieldTier > 0 ? GEAR_TIER_COLORS[gearShieldTier - 1] : null;
  const shieldHold = shieldKind ? { x: f * 4.4, y: S + 9 + (legsMoving ? Math.sin(walkPhase * 2) * 0.5 : 0) } : null;

  let armBack, armFront, lean = 0, weaponRot = null, atk = null, rng = null;
  let pullPoint = null;
  if (dead) {
    if (deathKind === 'fly') { armBack = { x: -f * 6, y: S - 8 }; armFront = { x: f * 5, y: S - 9 }; }
    else if (deathKind === 'knees') { armBack = { x: f * 2, y: S + 11 }; armFront = { x: f * 6, y: S + 10 }; }
    else { armBack = { x: -f * 8, y: S + 6 }; armFront = { x: f * 8, y: S + 6 }; }
    if (kneel) lean = 0.35 * kneel;
  } else {
    armBack = legsMoving
      ? { x: -f * 3 + Math.sin(walkPhase) * 7 * 0.3, y: S + RIG.armLen }
      : { x: -f * 3, y: S + RIG.armLen * 0.8 };
    if (attackPhase !== null && isRanged) {
      rng = rangedTimeline(attackPhase);
      lean = rng.lean;
      if (weapon === 'sling') {
        const a = -Math.PI / 2 + rng.whirl;
        const cx = f * 2, cy = headLocal - HR - 4;
        armFront = rng.whirl > 0
          ? { x: cx + Math.cos(a) * 4 * f, y: cy + Math.sin(a) * 2.5 }
          : { x: f * RIG.armLen * 0.9, y: S + 2 };
        weaponRot = rng.whirl > 0 ? (a + Math.PI * 0.5) * f : null;
      } else if (weapon === 'bow') {
        const recoil = rng.flash * 1.5;
        armFront = { x: f * (RIG.armLen * 0.98 - recoil), y: S - 0.5 };
        const cheek = { x: -f * 1.5, y: S - RIG.neck * 0.6 };
        const nearBow = { x: f * (RIG.armLen * 0.75), y: S - 0.5 };
        armBack = { x: rigLerp(nearBow.x, cheek.x, rng.draw), y: rigLerp(nearBow.y, cheek.y, rng.draw) };
        pullPoint = { x: (armBack.x - armFront.x) * f, y: armBack.y - armFront.y };
        weaponRot = 0;
      } else { // rifle
        const recoil = rng.flash * 3;
        armFront = { x: f * (RIG.armLen * 0.95 - recoil), y: S + 1.5 };
        armBack = { x: f * (RIG.armLen * 0.45 - recoil), y: S + 4 };
        weaponRot = 0;
      }
    } else if (attackPhase !== null) {
      atk = meleeTimeline(attackPhase, attackProfile, weapon);
      lean = atk.lean;
      const r = RIG.armLen * 1.05 * atk.reach;
      armFront = { x: f * Math.cos(atk.theta) * r, y: S + Math.sin(atk.theta) * r };
      weaponRot = atk.rot;
      if (atk.style === 'thrust' && !shieldKind) {
        armBack = { x: armFront.x - f * 7, y: armFront.y + 1.6 }; // вторая рука на древке
      } else if (atk.style === 'slam' && !shieldKind) {
        armBack = { x: armFront.x * 0.78 - f * 1, y: S + (armFront.y - S) * 0.78 };
      } else {
        armBack = { x: -f * (3 + atk.reach * 4), y: S + RIG.armLen * 0.7 };
      }
    } else if (isRanged) {
      armFront = { x: f * RIG.armLen * 0.85, y: S + 3 };
      if (weapon !== 'sling') armBack = { x: f * RIG.armLen * 0.4, y: S + 5 };
      weaponRot = 0;
    } else if (legsMoving) {
      armFront = { x: f * 3 + Math.sin(walkPhase + Math.PI) * 7 * 0.3, y: S + RIG.armLen };
    } else {
      armFront = { x: f * 3, y: S + RIG.armLen };
    }
    if (legsMoving) lean += 0.07;
    if (shieldHold) armBack = shieldHold; // щит всегда перед корпусом, удар — одной рукой
  }
  if (cheer && !dead) {
    const wave = Math.sin(walkPhase * 2) * 3;
    armBack = { x: -f * 9 + wave, y: S - RIG.armLen * 0.7 };
    armFront = { x: f * 9 - wave, y: S - RIG.armLen * 0.7 };
    lean = 0;
  }
  let digHand = null;
  if (digPhase !== null && !dead) {
    let dax, day;
    if (digPhase < 0.5) {
      const p = digPhase / 0.5;
      dax = f * RIG.armLen * 0.3;
      day = S - p * RIG.armLen * 1.15;
      lean = -0.08 * p;
    } else {
      const p = (digPhase - 0.5) / 0.5;
      dax = f * (RIG.armLen * 0.3 + p * RIG.armLen * 0.9);
      day = (S - RIG.armLen * 1.15) + p * (RIG.armLen * 1.15 + RIG.legLen * 0.95);
      lean = rigLerp(-0.08, 0.22, p);
    }
    digHand = { x: dax, y: day };
    armFront = digHand;
    weaponRot = digPhase < 0.5 ? -1.2 * (digPhase / 0.5) : rigLerp(-1.2, 1.3, (digPhase - 0.5) / 0.5);
  }

  const armB = limbPoints(0, S, armBack.x, armBack.y, ARM_SEG, f);
  const armF = limbPoints(0, S, armFront.x, armFront.y, ARM_SEG, f);

  const upperTransform = () => { ctx.translate(0, hipY); ctx.rotate(f * lean); };
  const legPath = () => {
    ctx.beginPath();
    for (const L of [legBack, legFront]) { ctx.moveTo(0, hipY); ctx.lineTo(L.joint.x, L.joint.y); ctx.lineTo(L.end.x, L.end.y); }
  };
  const strokeLegs = (w, col) => { ctx.lineWidth = w; ctx.strokeStyle = col; legPath(); ctx.stroke(); };
  const armPath = (A) => { ctx.beginPath(); ctx.moveTo(0, S); ctx.lineTo(A.joint.x, A.joint.y); ctx.lineTo(A.end.x, A.end.y); };
  const strokeArm = (A, w, col) => { ctx.lineWidth = w; ctx.strokeStyle = col; armPath(A); ctx.stroke(); };
  const bareTorso = !oc || oc.body === 'rags';
  const strokeSpine = (w, col) => {
    ctx.lineWidth = w; ctx.strokeStyle = col;
    ctx.beginPath(); ctx.moveTo(0, bareTorso ? 0 : S + 2); ctx.lineTo(0, S - RIG.neck * 0.6); ctx.stroke();
  };
  const outlineW = LW + 1.6;

  // --- задний слой: плащ/накидка, колчан, фалды, след удара ---
  ctx.save(); upperTransform();
  if (!dead) {
    if (cloak) drawCloak(ctx, 0, S, f, walkPhase, moving, cloakFlareT);
    else if (oc && oc.cape && hero) drawCloak(ctx, 0, S, f, walkPhase, moving, cloakFlareT, cp.cape, cp.capeDark, 1.1, 1.7);
  }
  if (oc) drawOutfitBack(ctx, oc, cp, S, f, bulk, outline);
  if (atk && atk.slashA > 0 && weapon && !cheer && atk.style !== 'thrust') {
    ctx.save(); ctx.translate(0, S);
    const reach = RIG.armLen * 1.05 + (THRUST_WEAPONS.has(weapon) && weapon !== 'bayonet' && weapon !== 'cannonarm' ? 22 : 15);
    const style = hero
      ? { fill: ART.slash.hero, glow: ART.hero.goldGlow, rim: ART.hero.goldHi, rimW: 2.2, glowR: 1.5 }
      : enemy ? { fill: ART.slash.enemy, rim: ART.slash.enemyRim } : { fill: ART.slash.player };
    drawSlashArc(ctx, f, atk.sweep, atk.slashA, hero ? reach * 1.15 : (atk.style === 'slam' ? reach * 1.1 : reach), style, atk.a0, atk.a1);
    ctx.restore();
  }
  ctx.restore();

  // --- ореол героя: золотая кромка под тёмным контуром ---
  if (hero && !dead) {
    const haloW = outlineW + 2.6;
    strokeLegs(haloW, ART.hero.rim);
    ctx.save(); upperTransform();
    strokeArm(armB, haloW, ART.hero.rim); strokeArm(armF, haloW, ART.hero.rim);
    if (oc) { torsoPath(ctx, S, f, bulk); ctx.lineWidth = 2.6; ctx.strokeStyle = ART.hero.rim; ctx.stroke(); } else strokeSpine(haloW, ART.hero.rim);
    ctx.fillStyle = ART.hero.rim;
    ctx.beginPath(); ctx.arc(0, headLocal, HR + haloW / 2 - 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // --- r15 И20: светлая кромка силуэта врага (тонкая, под тёмным контуром):
  // в толпе каждая фигура отделена от соседа светлой линией ---
  if (enemy && !dead) {
    const rimW = outlineW + 1.5, R = ENEMY_READ.rim;
    strokeLegs(rimW, R);
    ctx.save(); upperTransform();
    strokeArm(armB, rimW, R); strokeArm(armF, rimW, R);
    if (oc && !bareTorso) { torsoPath(ctx, S, f, bulk); ctx.lineWidth = 3; ctx.strokeStyle = R; ctx.stroke(); } else strokeSpine(rimW, R);
    ctx.fillStyle = R;
    ctx.beginPath(); ctx.arc(0, headLocal, HR + (RIG.lineWidth - 1) / 2 + 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // --- ноги: контур → заливка (штаны), сапоги/поножи ---
  strokeLegs(outlineW, outline);
  strokeLegs(LW, oc && oc.trousers ? cp.trouser : color);
  if (oc && (oc.trousers || oc.greaves)) {
    ctx.strokeStyle = oc.trousers ? cp.hat : cp.bronze; ctx.lineWidth = LW * 0.95;
    ctx.beginPath();
    for (const L of [legBack, legFront]) {
      const k0 = oc.trousers ? 0.62 : 0.25, k1 = oc.trousers ? 1 : 0.8;
      ctx.moveTo(rigLerp(L.joint.x, L.end.x, k0), rigLerp(L.joint.y, L.end.y, k0));
      ctx.lineTo(rigLerp(L.joint.x, L.end.x, k1), rigLerp(L.joint.y, L.end.y, k1));
    }
    ctx.stroke();
  }

  ctx.save(); upperTransform();
  // задняя рука (за корпусом)
  strokeArm(armB, outlineW, outline);
  strokeArm(armB, LW, color);
  if (oc && oc.sleeves) { ctx.lineWidth = LW * 0.95; ctx.strokeStyle = cp.cloth; ctx.beginPath(); ctx.moveTo(0, S); ctx.lineTo(armB.joint.x, armB.joint.y); ctx.stroke(); }
  // корпус: палочка (старый вид/«раб») или костюм
  strokeSpine(outlineW, outline);
  strokeSpine(LW, color);
  if (oc) {
    const armorTint = hero && gearArmorTier > 0 ? GEAR_TIER_COLORS[gearArmorTier - 1] : null;
    drawOutfitBody(ctx, oc, cp, S, f, bulk, outline, enemy, armorTint, dead ? null : roleAccent);
    if (oc.pads) drawPads(ctx, oc.pads, cp, S, f, bulk, outline);
  } else if (roleAccent && !dead) {
    ctx.strokeStyle = roleAccent; ctx.lineWidth = 3;
    ctx.globalAlpha *= enemy ? 0.85 : 1;
    ctx.beginPath(); ctx.moveTo(-4, S + 2); ctx.lineTo(4, -2); ctx.stroke();
    if (enemy) ctx.globalAlpha /= 0.85;
  }

  // голова + головной убор
  ctx.fillStyle = color; ctx.strokeStyle = outline; ctx.lineWidth = RIG.lineWidth - 1;
  ctx.beginPath(); ctx.arc(0, headLocal, HR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (!enemy && rigDetail) {
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.beginPath(); ctx.arc(-f * 1.4, headLocal - 1.4, HR * 0.55, 0, Math.PI * 2); ctx.fill();
  }
  if (oc && oc.head && oc.head !== 'none') {
    ctx.save(); ctx.translate(0, headLocal); ctx.scale(f, 1);
    drawHeadgear(ctx, oc.head, cp, HR, outline, time, enemy);
    ctx.restore();
  } else if (hero) {
    ctx.fillStyle = ART.hero.gold; ctx.strokeStyle = ART.hero.outline; ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-HR * 0.8, headLocal - HR * 0.6); ctx.lineTo(HR * 0.8, headLocal - HR * 0.6); ctx.lineTo(0, headLocal - HR * 1.7);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // старый путь без костюма (иконки без оружия, внешние вызовы)
  if (!oc && !dead) {
    if (hero && gearArmorTier > 0) drawArmorPlate(ctx, 0, S, GEAR_TIER_COLORS[gearArmorTier - 1], outline);
    if (hero && gearShieldTier > 0) drawShieldProp(ctx, armB.end.x, armB.end.y, f, GEAR_TIER_COLORS[gearShieldTier - 1], outline);
    else if (shieldColor) drawShieldProp(ctx, armB.end.x, armB.end.y, f, shieldColor, outline);
  }
  if (oc && shieldKind && !cheer && !dead) drawGearShield(ctx, shieldKind, armB.end.x + f * 1.4, armB.end.y - 1, f, cp, outline, enemy, shieldTint);

  // передняя рука
  strokeArm(armF, outlineW, outline);
  strokeArm(armF, LW, color);
  if (oc && oc.sleeves) { ctx.lineWidth = LW * 0.95; ctx.strokeStyle = cp.cloth; ctx.beginPath(); ctx.moveTo(0, S); ctx.lineTo(armF.joint.x, armF.joint.y); ctx.stroke(); }

  if (weapon && !cheer && !dead) {
    const hand = armF.end;
    const restWobble = legsMoving && attackPhase === null && !digHand ? Math.sin(walkPhase) * 0.15 : 0;
    const tint = hero && gearSwordTier > 0 ? GEAR_TIER_COLORS[gearSwordTier - 1] : (hero ? ART.hero.gold : null);
    const wopts = { pal: wpal };
    if (hero) { wopts.glow = ART.hero.goldGlow; wopts.glowHi = ART.hero.goldHi; }
    else if (enemy) wopts.glow = ENEMY_READ.weaponRim; // И20: оружие врага видно на тёмном теле
    if (rng) { wopts.draw = rng.draw; wopts.flash = rng.flash; wopts.whirl = rng.whirl; }
    if (atk && weapon === 'cannonarm' && atk.style === 'thrust' && atk.sweep > 0.6) wopts.flash = atk.slashA; // выстрел в упор
    if (pullPoint) wopts.pull = pullPoint;
    else if (weapon === 'bow') wopts.pull = { x: -6, y: 0 };
    drawWeapon(ctx, weapon, hand.x, hand.y, f, weaponRot, restWobble, tint, wopts);
    if (rng && weapon === 'bow' && rng.flash > 0) {
      ctx.fillStyle = `rgba(255,240,200,${0.5 * rng.flash})`;
      ctx.beginPath(); ctx.arc(hand.x + f * 6, hand.y, 3 + rng.flash * 2, 0, Math.PI * 2); ctx.fill();
    }
    // укол — прямой «росчерк» вдоль древка вместо дуги
    if (atk && atk.style === 'thrust' && atk.slashA > 0.05) {
      ctx.save();
      ctx.globalAlpha *= atk.slashA * 0.8;
      ctx.strokeStyle = enemy ? ART.slash.enemyRim : ART.slash.player; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
      const tipX = hand.x + f * (weapon === 'pike' ? 27 : 20);
      ctx.beginPath(); ctx.moveTo(tipX - f * 16 * atk.sweep, hand.y - 1); ctx.lineTo(tipX + f * 4, hand.y - 1.5); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();

  // --- вспышки поверх фигуры: попадание (белая/тёплая кромка) и смена эпохи ---
  const overlay = (col, a, rimOnly) => {
    ctx.save();
    ctx.globalAlpha = a;
    const w = rimOnly ? LW + 1.6 : LW;
    strokeLegs(w, col);
    ctx.save(); upperTransform();
    strokeArm(armB, w, col); strokeArm(armF, w, col);
    if (oc && !bareTorso) {
      torsoPath(ctx, S, f, bulk);
      if (rimOnly) { ctx.lineWidth = 1.6; ctx.strokeStyle = col; ctx.stroke(); } else { ctx.fillStyle = col; ctx.fill(); }
    } else strokeSpine(w, col);
    ctx.beginPath(); ctx.arc(0, headLocal, HR, 0, Math.PI * 2);
    if (rimOnly) { ctx.lineWidth = 2.2; ctx.strokeStyle = col; ctx.stroke(); } else { ctx.fillStyle = col; ctx.fill(); }
    if (rimOnly) { strokeArm(armB, LW, color); strokeArm(armF, LW, color); }
    ctx.restore();
    if (rimOnly) strokeLegs(LW, color);
    ctx.restore();
  };
  if (hitFlash > 0 && !dead) overlay(enemy ? '#ffd7a8' : '#ffffff', Math.min(1, hitFlash) * (enemy ? 0.9 : 0.85), enemy);
  // свои — золотая заливка-вспышка, враги — красная кромка (силуэт не «выцветает»)
  if (dressFlash > 0 && !dead) overlay(enemy ? ART.enemy.eliteOutline : ART.hero.goldHi, Math.min(1, dressFlash) * 0.85, enemy);

  if (chainBall && !dead) drawChainBall(ctx, f, chainLag, chainTaut, wpal);

  if (marker && hero && !dead) {
    const my = hipY + headLocal - HR * 1.7 - 9 - (oc ? 5 : 0) + Math.sin(time * 4) * 1.4;
    // r15 И18: где на экране маркер героя (пиксели канваса) — vfx.js
    // отодвигает от него цифры урона (drawDamageNumbers).
    if (ctx.getTransform) { const tr = ctx.getTransform(); ctx.heroMarkerAt = { p: tr.transformPoint(new DOMPoint(0, my - 2)), r: 11 * Math.hypot(tr.a, tr.b), at: performance.now() }; }
    ctx.save();
    ctx.fillStyle = ART.hero.goldGlow;
    ctx.beginPath(); ctx.arc(0, my - 2, 7.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ART.hero.marker; ctx.strokeStyle = ART.hero.outline; ctx.lineWidth = 1.3; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-5, my - 6); ctx.lineTo(5, my - 6); ctx.lineTo(0, my + 2.5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = ART.hero.goldHi;
    ctx.beginPath(); ctx.moveTo(-3, my - 5); ctx.lineTo(0.5, my - 5); ctx.lineTo(-1, my - 2.5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

// «Наездник» (раунд 5) — составной риг: нижний несёт (обычная поза
// ходьбы, бьёт лоу-киком), верхний сидит сверху и стреляет камнями
// (переиспользует drawWeapon('sling'), не новый скелет — см.
// КОНЦЕПТ_ГДД.md, «Допущения»). Раунд 15 (И6): носильщик — в повязке,
// верхний — в костюме стрелка своей эпохи (o.ageId).
function drawRiderPair(ctx, o) {
  const {
    x, y, scale = 1, facing = 1, walkPhase = 0, moving = false,
    attackPhase = null, deathT = null, deathSec = null, deathKind = 'back', hitFlash = 0, roleAccent = null,
    color = ART.enemy.fill, outline = ART.enemy.outline, enemy = true, elite = false, buffed = false, time = 0,
    ageId = null, dressFlash = 0, shade = 0,
  } = o;
  drawStickman(ctx, {
    x, y, scale, facing, walkPhase, moving, deathT, deathSec, deathKind, hitFlash, shade,
    color, outline, roleAccent, enemy, elite, buffed, time, outfit: 'riderMount', dressFlash,
  });
  if (deathT !== null || deathSec !== null) return; // при смерти верхний наездник не отрисовывается отдельно
  const topScale = scale * 0.8;
  const riderHeight = (RIG.legLen + RIG.torso * 0.55) * scale * RIG_K;
  drawStickman(ctx, {
    x, y: y - riderHeight, scale: topScale, facing, walkPhase: 0, moving: false,
    attackPhase, hitFlash, time, dressFlash, shade: shade ? 0 : 1,
    color, outline, weapon: 'sling', enemy, shadow: false, outfit: 'ranged', ageId: ageId || 'stone',
  });
}
