// Туториал миссии 1 (раунд 15, И4, ТЗ_КАЧЕСТВО_CRAZYGAMES — П2): по одному
// действию за раз — короткая надпись (≤4 слов) и прыгающая стрелка на цель,
// гаснет, как только игрок сделал это действие. Заменяет прежнюю подсказку
// из двух строк мелкого текста (там же было неверное «клавиши 1–4»).
//
// Шаги 1–3 идут строго по порядку: купи бойца → веди героя → бей. Шаги 4–5
// («Залп!», «Новая эра!») появляются, когда соответствующая кнопка готова, в
// любом порядке. Игра не ставится на паузу и не замедляется. Действие,
// сделанное раньше своего шага (например, игрок сразу побежал героем),
// засчитывается молча — подсказка про уже сделанное не показывается.
//
// Показывается только при первом прохождении миссии 1: progress.tutorialDone
// ставится, когда пройдены все 5 шагов или миссия закончилась (итог боя).
// Состояние опрашивается из frame() (Tutorial.tick) — в чужие функции
// покупки/атаки хуки не встраиваются. Хоткеи на десктопе, тач-кнопки на
// устройствах с pointer: coarse.
'use strict';

const Tutorial = (() => {
  let st = null;        // состояние текущего прохождения (или null)
  let layer = null, bubble = null, textEl = null, keysEl = null, arrow = null;
  let rectCache = null, rectFrame = 0;

  const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

  // Цель стрелки: DOM-элемент (селектор) или герой на канвасе.
  const STEPS = [
    { n: 1, text: 'tut.buy', flag: 'buy', target: () => '#toolbar [data-unit]', keys: () => (isTouch() ? null : ['1']) },
    { n: 2, text: 'tut.move', flag: 'move', target: () => (isTouch() ? '#joyBase' : 'hero'), keys: () => (isTouch() ? 'swipe' : ['A', 'D']) },
    { n: 3, text: 'tut.attack', flag: 'attack', target: () => (isTouch() ? '#touchAttack' : 'hero'), keys: () => (isTouch() ? null : [I18N.t('tut.keySpace')]) },
    { n: 4, brief: true, text: 'tut.volley', flag: 'volley', target: () => '#volleyBtn', keys: () => (isTouch() ? null : ['V']), ready: (m) => m.volleyCd <= 0 && m.world.units.some(u => u.team === 'enemy' && u.state !== 'dead') },
    { n: 5, brief: true, text: 'tut.age', flag: 'age', target: () => '#ageBtn', keys: () => (isTouch() ? null : ['T']), ready: () => typeof playerAgeReady === 'function' && playerAgeReady() },
  ];
  // r15 И12 (куратор №3: «„Volley! V“ и „New Age! T“ десятки секунд висят над
  // центром поля»): подсказки-способности (brief) — компактно у самой кнопки
  // (сбоку от стрелки, на уровне верха тулбара) и не дольше BRIEF_SEC секунд
  // боя; дальше гаснут и больше не показываются. Кнопка подсвечена, пока
  // висит подсказка (.tut-glow).
  const BRIEF_SEC = 6;
  let glowEl = null;
  function setGlow(sel) {
    if (glowEl) glowEl.classList.remove('tut-glow');
    glowEl = sel ? document.querySelector(sel) : null;
    if (glowEl) glowEl.classList.add('tut-glow');
  }

  function ensureDom() {
    if (layer) return;
    const wrap = document.getElementById('arenaWrap');
    layer = document.createElement('div');
    layer.id = 'tutLayer';
    layer.className = 'tut-layer hidden';
    layer.innerHTML = `
      <div class="tut-bubble"><span class="tut-text"></span><span class="tut-keys"></span></div>
      <div class="tut-arrow"><svg viewBox="0 0 40 48" aria-hidden="true">
        <path d="M13 2h14v22h11L20 46 2 24h11z" fill="#ffd35c" stroke="#1a120a" stroke-width="3" stroke-linejoin="round"/>
        <path d="M17 6h5v19" fill="none" stroke="#fff6d0" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>
      </svg></div>`;
    wrap.appendChild(layer);
    bubble = layer.querySelector('.tut-bubble');
    textEl = layer.querySelector('.tut-text');
    keysEl = layer.querySelector('.tut-keys');
    arrow = layer.querySelector('.tut-arrow');
  }

  // ---- r15 И10: разовый тост «эпоха сбрасывается» -----------------------
  // Куратор: «бронзовый замок из м1 в м2 снова частокол — нужно пояснить
  // игроку». Один раз за профиль, на старте второй сыгранной миссии (или
  // первой в этой версии у игрока, уже прошедшего м1), только в миссии, где
  // эпоху можно поднять. Флаг progress.ageResetTipSeen — булев (облачное
  // слияние: ИЛИ), счётчик progress.missionsStarted — число (слияние: max),
  // см. mergeProgress в save.js. Показ — после отсчёта, ~5 с, не блокирует.
  const AGE_TIP_SEC = 5.2;
  let ageTip = null; // { m, t } — ждёт/показывает тост для матча m
  let ageTipEl = null;
  function ageTipCheck(m) {
    ageTip = null;
    if (ageTipEl) ageTipEl.classList.add('hidden');
    const played = progress.missionsStarted || 0;
    progress.missionsStarted = played + 1;
    const canAge = typeof ageMaxSteps === 'function' ? ageMaxSteps(m.mission) > 0 : true;
    if (!progress.ageResetTipSeen && canAge && (played >= 1 || (progress.unlocked || 1) > 1)) {
      progress.ageResetTipSeen = true;
      ageTip = { m, t: 0 };
    }
    saveProgress(progress);
  }
  function ageTipTick(m, screenName, dt) {
    if (!ageTip) return;
    if (!m || ageTip.m !== m || m.resolved) { ageTip = null; if (ageTipEl) ageTipEl.classList.add('hidden'); return; }
    if (screenName !== 'match' || m.countdown > 0) { if (ageTipEl) ageTipEl.classList.add('hidden'); return; }
    if (!ageTipEl) {
      ageTipEl = document.createElement('div');
      ageTipEl.id = 'ageTip';
      ageTipEl.className = 'age-tip hidden';
      ageTipEl.innerHTML = '<svg class="ico"><use href="#i-age"/></svg><span class="age-tip-text"></span>';
      document.getElementById('arenaWrap').appendChild(ageTipEl);
    }
    if (ageTip.t === 0) {
      ageTipEl.querySelector('.age-tip-text').textContent = I18N.t('tip.ageReset');
      ageTipEl.classList.remove('hidden', 'out');
    }
    ageTip.t += dt;
    if (ageTip.t > AGE_TIP_SEC - 0.4) ageTipEl.classList.add('out');
    if (ageTip.t >= AGE_TIP_SEC) { ageTipEl.classList.add('hidden'); ageTip = null; }
  }

  function begin(m) {
    st = null;
    hide();
    if (m && m.mission) ageTipCheck(m); // r15 И10
    if (!m || !m.mission || m.mission.id !== 1 || progress.tutorialDone) return;
    ensureDom();
    st = {
      m, flags: {}, done: new Set(), cur: null, gapT: 0.35,
      heroLastX: m.world.hero.x, moved: 0,
    };
  }

  function finishAll() {
    progress.tutorialDone = true;
    saveProgress(progress);
    hide();
    st = null;
  }

  // Конец миссии (endMatch): туториал больше не показывается.
  function end(m) {
    if (!st || st.m !== m) return;
    finishAll();
  }

  function hide() {
    if (layer) layer.classList.add('hidden');
    setGlow(null);
  }

  function pollFlags(m) {
    const f = st.flags, w = m.world, hero = w.hero;
    if ((w.spawnCount && w.spawnCount.player > 0)) f.buy = true;
    // И8: самооборона героя в мягком старте (ai.js, softStartHeroGuard) —
    // не действие игрока, шаги «Веди героя» / «Бей!» ею не засчитываются.
    if (hero.alive && !hero.autoGuard) {
      st.moved += Math.abs(hero.x - st.heroLastX);
      if (st.moved >= 24) f.move = true;
      if (hero.attackAnimT !== null && hero.attackAnimT !== undefined) f.attack = true;
    }
    st.heroLastX = hero.x;
    if (w.volleyZone && w.volleyZone.team === 'player') f.volley = true;
    if (w.ageStep && w.ageStep.player > 0) f.age = true;
  }

  function complete(step) {
    st.done.add(step.n);
    try { Analytics.track('tutorial_step', { n: step.n }); } catch (e) { /* аналитика не ломает туториал */ }
  }

  // Следующий шаг к показу: 1→2→3 по порядку, потом готовый из 4/5.
  function pickStep(m) {
    for (const s of STEPS) {
      if (st.done.has(s.n)) continue;
      if (st.flags[s.flag]) { complete(s); continue; } // сделано раньше своего шага — молча
      if (s.n <= 3) return s;
      if (!st.done.has(3)) return null;
      if (s.ready(m)) return s;
    }
    return null;
  }

  function show(step) {
    st.cur = step;
    st.curT = 0;
    rectCache = null;
    layer.classList.toggle('tut-brief', !!step.brief);
    setGlow(step.brief ? step.target() : null);
    textEl.textContent = I18N.t(step.text);
    const keys = step.keys();
    keysEl.innerHTML = '';
    keysEl.classList.toggle('hidden', !keys);
    if (keys === 'swipe') {
      keysEl.innerHTML = '<span class="tut-swipe"><svg viewBox="0 0 48 20" aria-hidden="true"><path d="M2 10h44M2 10l7-6M2 10l7 6M46 10l-7-6M46 10l-7 6" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
    } else if (keys) {
      keysEl.innerHTML = keys.map(k => `<kbd>${k}</kbd>`).join('');
    }
    layer.classList.remove('hidden', 'tut-done');
    layer.classList.remove('tut-in'); void layer.offsetWidth; layer.classList.add('tut-in');
  }

  // Точка, в которую упирается остриё стрелки (координаты #arenaWrap, CSS px).
  function targetPoint(step) {
    const t = step.target();
    if (t === 'hero') {
      const hero = st.m.world.hero;
      if (!hero.alive) return null; // герой пал — ждём возрождения
      // над маркером-треугольником героя; И7: высота — с крупным планом VIEW.fig
      const wx = hero.x, wy = ARENA.groundY - (118 * VIEW.fig + 32);
      return { x: (wx - VIEW.x0) * VIEW.k, y: (wy - VIEW.y0) * VIEW.k };
    }
    // DOM-цель: прямоугольник перечитываем раз в ~10 кадров (без лишних
    // принудительных пересчётов раскладки каждый кадр).
    if (!rectCache || ++rectFrame % 10 === 0) {
      const el = document.querySelector(t);
      const wrapRect = layer.parentElement.getBoundingClientRect();
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (!r.width) return null;
      rectCache = { x: r.left - wrapRect.left + r.width / 2, y: r.top - wrapRect.top - 4 };
    }
    return rectCache;
  }

  // Прямоугольник героя на экране (CSS px #arenaWrap) — с маркером над головой.
  function heroRect() {
    const hero = st.m.world.hero;
    if (!hero || !hero.alive) return null;
    const f = 1.2 * VIEW.fig, k = VIEW.k;
    const cx = (hero.x - VIEW.x0) * k;
    // ±40 — с учётом вытянутой руки/оружия в стойке героя
    return { l: cx - 40 * f * k, r: cx + 40 * f * k, t: (ARENA.groundY - 118 * f - VIEW.y0) * k, b: (ARENA.groundY - VIEW.y0) * k };
  }
  function place(step) {
    const p = targetPoint(step);
    if (!p) { layer.classList.add('hidden'); return; }
    layer.classList.remove('hidden');
    const W = layer.clientWidth || VIEW.cssW;
    const aw = arrow.offsetWidth, ah = arrow.offsetHeight;
    arrow.style.transform = `translate(${Math.round(p.x - aw / 2)}px, ${Math.round(p.y - ah)}px)`;
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    if (step.brief) {
      // r15 И12: пузырь сбоку от стрелки, низом на уровне верха кнопки —
      // в полосе над тулбаром, а не над линией боя. Справа от стрелки; если
      // не влезает в кадр или ложится на тач-кнопки — слева.
      if (!glowEl) setGlow(step.target());
      // Препятствия: счётчик золота над тулбаром и тач-кнопки справа.
      const wr = layer.parentElement.getBoundingClientRect();
      const rel = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { l: r.left - wr.left, r: r.right - wr.left, t: r.top - wr.top, b: r.bottom - wr.top } : null; };
      const blocks = [rel(document.getElementById('goldRow')), rel(document.querySelector('#touchControls:not(.hidden) .touch-actions'))].filter(Boolean);
      const fits = (x, y) => x >= 8 && x + bw <= W - 8 && !blocks.some(b => x < b.r + 4 && x + bw > b.l - 4 && y < b.b && y + bh > b.t);
      const low = Math.round(p.y - bh + 2);
      const cands = [
        [p.x + aw / 2 + 6, low],               // справа от стрелки
        [p.x - aw / 2 - 6 - bw, low],          // слева от стрелки
        [Math.max(8, Math.min(W - bw - 8, p.x - bw / 2)), Math.round(p.y - ah - bh - 4)], // над стрелкой
      ];
      const [bxB, byB] = cands.find(([x, y]) => fits(x, y)) || cands[2];
      bubble.style.transform = `translate(${Math.round(bxB)}px, ${byB}px)`;
      return;
    }
    let bx = Math.max(8, Math.min(W - bw - 8, p.x - bw / 2));
    let by = Math.max(8, p.y - ah - bh - 6);
    // И7 (отчёт куратора, мобильный): пузырь над джойстиком ложился прямо на
    // героя у крепости. Если пересекается с героем — сдвигаем вправо от него
    // (на уровне пузыря), а если справа не помещается — над его маркером.
    const hr = step.target() !== 'hero' ? heroRect() : null;
    if (hr && bx < hr.r && bx + bw > hr.l && by < hr.b && by + bh > hr.t) {
      if (hr.r + 12 + bw <= W - 8) bx = hr.r + 12;
      else by = Math.max(8, hr.t - bh - 10);
    }
    bubble.style.transform = `translate(${Math.round(bx)}px, ${Math.round(by)}px)`;
  }

  // Каждый кадр из frame(): m — текущий матч или null (не бой).
  function tick(m, screenName, dt) {
    ageTipTick(m, screenName, dt); // r15 И10
    if (!st) return;
    if (!m || st.m !== m) { hide(); st = null; return; }
    if (screenName !== 'match' || m.countdown > 0 || m.resolved) { hide(); return; }
    pollFlags(m);
    const cur = st.cur;
    if (cur) {
      if (st.flags[cur.flag]) {
        // Выполнено: короткое «гаснет» и пауза перед следующим шагом.
        complete(cur);
        st.cur = null;
        st.gapT = 0.6;
        setGlow(null);
        layer.classList.add('tut-done');
        setTimeout(() => { if (st && !st.cur && layer) layer.classList.add('hidden'); }, 320);
        return;
      }
      if (cur.ready && !cur.ready(m)) { st.cur = null; hide(); return; } // кнопка снова не готова (нет врагов) — спрячем до готовности
      // r15 И12: подсказка-способность живёт BRIEF_SEC секунд боя, потом
      // гаснет насовсем (шаг считается показанным; аналитика — skipped).
      if (cur.brief && (st.curT = (st.curT || 0) + dt) >= BRIEF_SEC) {
        st.done.add(cur.n);
        try { Analytics.track('tutorial_step', { n: cur.n, skipped: true }); } catch (e) { /* аналитика не ломает туториал */ }
        st.cur = null;
        st.gapT = 0.6;
        setGlow(null);
        layer.classList.add('tut-done');
        setTimeout(() => { if (st && !st.cur && layer) layer.classList.add('hidden'); }, 320);
        return;
      }
      place(cur);
      return;
    }
    if (st.gapT > 0) { st.gapT -= dt; return; }
    if (st.done.size >= STEPS.length) { finishAll(); return; }
    const next = pickStep(m);
    if (st.done.size >= STEPS.length) { finishAll(); return; }
    if (next) { show(next); place(next); }
  }

  return { begin, tick, end, active: () => !!st };
})();
