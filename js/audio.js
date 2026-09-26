// SFX — записанные сэмплы (CC0: Kenney.nl, OpenGameArt), 24.09.2026.
// Прежний синтез осцилляторами (square/sawtooth + шум) основатель назвал
// «режет уши» — заменён целиком, API объекта SFX прежний. Источники и
// лицензии — tools/SFX_ИСТОЧНИКИ.md, подготовка файлов —
// tools/make_sfx.py.
'use strict';

const SFX = (() => {
  // Банк: имя -> число вариантов (assets/audio/sfx/<имя>_<n>.mp3). Варианты
  // чередуются случайно, без повтора подряд, плюс лёгкий разброс высоты —
  // сотня одинаковых ударов за бой не звучит «пулемётом».
  const BANK = {
    hit_melee: 5, hit_spear: 4, hit_heavy: 5, hit_hero: 3, hit_hero_special: 2,
    hit_ranged: 5, shoot: 4, death: 5, spawn: 4, deny: 2, upgrade: 1, coins: 1,
    mine: 4, swing: 3, bell: 1, click: 2, core_hit: 5,
  };
  const SFX_DIR = 'assets/audio/sfx/';
  // В большой битве (45+ юнитов) удары сыплются десятками в секунду: без
  // потолка голосов и минимального шага между одинаковыми звуками получается
  // каша. Лишнее просто не играет — слышно всё равно одно и то же событие.
  const MAX_VOICES = 14;

  let ctx = null;
  let master = null;
  let muted = false;
  // Приоритет площадки (CrazyGames SDK.game.settings.muteAudio, см.
  // js/platform.js, initCrazyGames()) над собственным тумблером звука игры
  // — независимый флаг, не пишется в progress/save.js (эфемерное состояние
  // площадки, не выбор игрока).
  let platformMuted = false;
  const buffers = {}; // имя -> [AudioBuffer]
  const lastIdx = {};
  const lastAt = {};
  let voices = 0;
  let loadStarted = false;

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Мягкий компрессор на выходе — пачка одновременных ударов не даёт
      // пиков, громкость ровная.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  // Загрузка ~270 КБ (56 файлов) после показа первого экрана, не блокирует старт; пока
  // файл не пришёл, его звук просто пропускается.
  function preload() {
    if (loadStarted) return;
    loadStarted = true;
    const c = ensure();
    Object.keys(BANK).forEach((name) => {
      buffers[name] = [];
      for (let i = 1; i <= BANK[name]; i++) {
        fetch(SFX_DIR + name + '_' + i + '.mp3')
          .then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
          .then((data) => new Promise((res, rej) => c.decodeAudioData(data, res, rej)))
          .then((buf) => { buffers[name].push(buf); })
          .catch((e) => console.warn('[sfx] не загружен', name + '_' + i, e));
      }
    });
  }

  // vol — громкость события (0..1), rate — высота, delay — сдвиг в секундах,
  // gap — минимальный шаг между одинаковыми звуками.
  function play(name, { vol = 0.5, rate = 1, delay = 0, gap = 0 } = {}) {
    if (muted || platformMuted) return;
    const c = ensure();
    if (!loadStarted) preload();
    const list = buffers[name];
    if (!list || !list.length) return;
    const now = c.currentTime;
    if (gap && lastAt[name] !== undefined && now - lastAt[name] < gap) return;
    if (voices >= MAX_VOICES) return;
    lastAt[name] = now;
    let idx = Math.floor(Math.random() * list.length);
    if (list.length > 1 && idx === lastIdx[name]) idx = (idx + 1) % list.length;
    lastIdx[name] = idx;
    const src = c.createBufferSource();
    src.buffer = list[idx];
    src.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    const g = c.createGain();
    g.gain.value = vol * (0.85 + Math.random() * 0.15);
    src.connect(g).connect(master);
    voices++;
    src.onended = () => { voices--; g.disconnect(); };
    src.start(now + delay);
  }

  return {
    setMuted(v) { muted = v; },
    isMuted() { return muted; },
    // Площадка (CrazyGames muteAudio) — приоритет над muted выше, но не
    // подменяет/не сбрасывает его: оба флага независимы, звук глушится, если
    // сработал хотя бы один (см. play()).
    setPlatformMuted(v) { platformMuted = v; },
    unlock() { ensure(); preload(); },
    preload,
    // Скрытая/неактивная вкладка (модерация, п.1.3 — см. document.
    // visibilitychange в game.js) — тем же способом, что MUSIC.pauseForAd:
    // suspend() всего контекста замораживает любой SFX, который случайно
    // доигрывает в момент сворачивания, вместо того чтобы дать ему дозвучать
    // в фоне.
    suspend() { if (ctx) ctx.suspend().catch(() => {}); },
    resume() { if (ctx) ctx.resume().catch(() => {}); },
    // роль атакующего задаёт тембр удара — тяжёлый глухой, копьё деревянное,
    // герой — металл (см. ГДД, «Аудио: звук на все события мира»)
    hitMelee(role) {
      const cfg = {
        melee: ['hit_melee', 0.42],
        spear: ['hit_spear', 0.5],
        heavy: ['hit_heavy', 0.5],
        hero: ['hit_hero', 0.55],
        hero_special: ['hit_hero_special', 0.65],
      }[role] || ['hit_melee', 0.42];
      play(cfg[0], { vol: cfg[1], gap: 0.05 });
    },
    hitRanged() { play('hit_ranged', { vol: 0.32, gap: 0.05 }); },
    shoot() { play('shoot', { vol: 0.22, gap: 0.07 }); },
    death() { play('death', { vol: 0.38, rate: 0.9, gap: 0.08 }); },
    spawn() { play('spawn', { vol: 0.28, gap: 0.12 }); },
    buyDenied() { play('deny', { vol: 0.4, gap: 0.1 }); },
    upgrade() { play('upgrade', { vol: 0.4 }); play('coins', { vol: 0.4, delay: 0.05 }); },
    mine() { play('mine', { vol: 0.45, gap: 0.1 }); },
    heroSpecial() { play('swing', { vol: 0.55 }); play('hit_heavy', { vol: 0.6, rate: 0.85, delay: 0.07 }); },
    heroHurt() { play('hit_heavy', { vol: 0.35, rate: 1.1, gap: 0.15 }); },
    // Отдельный, более тревожный сигнал именно на смерть героя (не просто
    // урон) — стадия 2, баг-репорт: игрок должен заметить это, даже глядя
    // в другой конец арены, не только по надписи в углу HUD.
    heroDown() { play('death', { vol: 0.6, rate: 0.8 }); play('bell', { vol: 0.45, delay: 0.08 }); },
    click() { play('click', { vol: 0.4, gap: 0.03 }); },
    coreHit() { play('core_hit', { vol: 0.45, gap: 0.08 }); },
  };
})();

// Музыка (раунд 10, переведена на Web Audio API 2026-09-14) — реальные
// mp3-треки (Suno), процедурный WebAudio-луп раунда 5 полностью убран
// (основатель прослушал — «очень посредственно», см. КОНЦЕПТ_ГДД.md).
// Канал НЕЗАВИСИМ от SFX (свой мьют, свой gain-граф) — «никогда не
// смешивать» было прямым требованием основателя, это по-прежнему так: у
// музыки свой AudioContext и свой master-gain, SFX его не трогает.
//
// ВАЖНО (модерация Яндекса, замечания 4-5, 2026-09-14): раньше канал играл
// через HTMLMediaElement (<audio>). Chrome/Android автоматически показывает
// системный медиаплеер (десктоп) и уведомление о воспроизведении
// (Android/lock screen) для ЛЮБОГО играющего <audio>/<video> — независимо от
// того, вызывает ли страница Media Session API сама (см. приложенная статья
// Chrome for Developers). Единственный надёжный способ убрать оба — не
// использовать HTMLMediaElement вообще. Здесь музыка декодируется в
// AudioBuffer и играет через AudioBufferSourceNode + GainNode, как SFX, но
// по отдельному графу — Web Audio узлы не подпадают под авто-детект медиа.
const MUSIC = (() => {
  let ctx = null;
  let masterGain = null; // мьют + громкость от числа юнитов (effectiveVolume)
  let musicMuted = false;
  // Приоритет площадки (CrazyGames SDK.game.settings.muteAudio) — тот же
  // принцип, что и platformMuted у SFX выше, независимый от musicMuted.
  let platformMuted = false;
  let baseVolume = 0.7;
  let unitVolumeMult = 1; // множитель от числа юнитов на поле (см. setUnitCount)
  let current = null; // { trackId, buffer, source, gain, startedAt, offset, fading, manualStop, stopped, audible }
  let endedCb = null;

  // Ленивая загрузка (раунд 15, П5 — требования CrazyGames «загрузка < 10 с»,
  // «сборка < 20 МБ»). Раньше menu_theme (2,9 МБ) качался сразу при показе
  // первого экрана и на медленной сети забирал канал у всего остального, а
  // боевой трек (6,8 МБ) при первом запуске грузился в самом начале боя.
  // Теперь:
  //  - трек меню ждёт «ворота»: первый экран + MENU_GATE_DELAY_MS или первый
  //    жест игрока (до жеста AudioContext всё равно молчит, см. ensureCtx);
  //  - боевой трек и стинги качаются сразу при вызове play() — игрок уже в
  //    игре, это «фон после первого экрана»;
  //  - пока новый трек не готов, старый доигрывает (не дольше
  //    HANDOVER_WAIT_MS) — переход без провала в тишину;
  //  - в меню, когда его трек уже играет, в фоне докачивается боевой трек
  //    (только байты, без декодирования), в бою — стинги победы/поражения.
  // Ошибки сети/декодирования не всплывают: трек просто не играет, при
  // следующем play() загрузка повторяется.
  const MENU_GATE_DELAY_MS = 1500;
  const HANDOVER_WAIT_MS = 4000;
  const PREFETCH_DELAY_MS = 2500;
  // Декодированный трек в памяти — это PCM float32: ~40-100 МБ на трек в
  // 2-5 минут. Держим не больше DECODED_MAX последних (меню + бой + стинг),
  // сжатые байты остальных остаются в bytesCache (≤ 9 МБ на все треки) и
  // декодируются заново за доли секунды.
  const DECODED_MAX = 3;
  const bytesCache = new Map(); // file -> Promise<ArrayBuffer> (сжатые байты mp3)
  const decodedCache = new Map(); // file -> Promise<AudioBuffer>, порядок вставки = LRU
  let gateOpen = false;
  const gateWaiters = [];
  function openGate() {
    if (gateOpen) return;
    gateOpen = true;
    gateWaiters.splice(0).forEach((fn) => fn());
  }
  function whenGateOpen() {
    return gateOpen ? Promise.resolve() : new Promise((res) => gateWaiters.push(res));
  }
  window.addEventListener('boot:firstscreen', () => setTimeout(openGate, MENU_GATE_DELAY_MS));
  ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, openGate, { capture: true, once: true }));
  // Страховка, если первый экран так и не был отмечен (сбой платформы).
  window.addEventListener('load', () => setTimeout(openGate, 6000));

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = effectiveVolume();
      masterGain.connect(ctx.destination);
    }
    // Автоплей до первого пользовательского жеста браузер не запрещает на
    // уровне start() (он ставится в очередь на таймлайне контекста), но сам
    // контекст рождается 'suspended' и не тикает — значит трек просто висит
    // неслышимым до первого жеста, а не проигрывается тихо/криво. Ретрай на
    // жест — ниже, armResumeOnGesture().
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  function armResumeOnGesture() {
    const retry = () => { if (ctx) ctx.resume().catch(() => {}); cleanup(); };
    function cleanup() {
      document.removeEventListener('pointerdown', retry, true);
      document.removeEventListener('keydown', retry, true);
    }
    document.addEventListener('pointerdown', retry, true);
    document.addEventListener('keydown', retry, true);
  }

  function trackMeta(trackId) {
    if (trackId === 'menu') return MENU_MUSIC_TRACK;
    return MUSIC_TRACKS[trackId] || EVENT_TRACKS[trackId];
  }
  function effectiveVolume() {
    return (musicMuted || platformMuted) ? 0 : baseVolume * unitVolumeMult;
  }
  function fetchBytes(file, lowPriority) {
    if (!bytesCache.has(file)) {
      const p = fetch(file, lowPriority ? { priority: 'low' } : undefined)
        .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); });
      p.catch(() => bytesCache.delete(file)); // следующий запрос попробует снова
      bytesCache.set(file, p);
    }
    return bytesCache.get(file);
  }
  function prefetch(file) {
    if (file) fetchBytes(file, true).catch(() => { /* фоновая докачка — молча */ });
  }
  function loadBuffer(file) {
    if (decodedCache.has(file)) {
      const hit = decodedCache.get(file);
      decodedCache.delete(file); // LRU: в конец очереди
      decodedCache.set(file, hit);
      return hit;
    }
    // decodeAudioData «забирает» ArrayBuffer — декодируем копию, байты в
    // кэше остаются для повторного декодирования после вытеснения.
    const p = fetchBytes(file).then((data) => new Promise((res, rej) =>
      ensureCtx().decodeAudioData(data.slice(0), res, rej)));
    p.catch(() => decodedCache.delete(file));
    decodedCache.set(file, p);
    while (decodedCache.size > DECODED_MAX) decodedCache.delete(decodedCache.keys().next().value);
    return p;
  }
  // Плавно гасит и освобождает запись трека.
  function retire(entry, dur) {
    if (!entry) return;
    fadeGain(entry.gain, 0, dur);
    setTimeout(() => { stopSource(entry); entry.gain.disconnect(); }, dur * 1000 + 50);
  }
  // Плавный переход gain-узла — через нативную автоматизацию AudioParam, не
  // через rAF-цикл (как было у <audio>.volume раньше): cancelScheduledValues
  // + фиксация текущего значения перед новым ramp'ом сама по себе исключает
  // старый баг гонки нескольких fadeTo на одном узле (тикает по аудио-часам,
  // а не по независимым rAF-циклам с разъезжающимися t0).
  function fadeGain(gainNode, target, dur) {
    const c = ensureCtx();
    const now = c.currentTime;
    const safeTarget = Math.max(0, Math.min(1, target));
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(safeTarget, now + Math.max(dur, 0.01));
  }
  function currentOffset(entry) {
    if (!entry || !entry.buffer) return 0;
    // ctx.currentTime не тикает, пока контекст suspended (см. pauseForAd) —
    // поэтому это выражение само "замирает" на паузе, без отдельного флага.
    const raw = entry.offset + (ctx.currentTime - entry.startedAt);
    return entry.loop ? raw % entry.buffer.duration : raw;
  }
  function startSource(entry) {
    const c = ensureCtx();
    const source = c.createBufferSource();
    source.buffer = entry.buffer;
    source.loop = entry.loop;
    source.connect(entry.gain);
    source.addEventListener('ended', () => {
      if (entry.manualStop) { entry.manualStop = false; return; } // сами остановили (кроссфейд на новый трек) — не событие "трек доиграл"
      if (current === entry && endedCb) endedCb(entry.trackId);
    });
    source.start(0, 0);
    entry.source = source;
    entry.offset = 0;
    entry.startedAt = c.currentTime;
  }
  function stopSource(entry) {
    if (!entry.source || entry.stopped) return;
    entry.stopped = true;
    entry.manualStop = true;
    try { entry.source.stop(); } catch (e) { /* уже остановлен/доиграл */ }
  }

  return {
    setMusicMuted(v) {
      musicMuted = v;
      if (masterGain) fadeGain(masterGain, effectiveVolume(), 0.3);
    },
    isMusicMuted() { return musicMuted; },
    setPlatformMuted(v) {
      platformMuted = v;
      if (masterGain) fadeGain(masterGain, effectiveVolume(), 0.3);
    },
    // Динамическая громкость от количества живых юнитов на поле (раунд 10,
    // MUSIC_MIX.unitsForMaxVolume/volumeBoostAtMaxUnits) — не режет резко,
    // применяется тем же fadeGain с коротким временем сглаживания.
    setUnitCount(n) {
      const frac = Math.max(0, Math.min(1, n / MUSIC_MIX.unitsForMaxVolume));
      const mult = 1 + frac * MUSIC_MIX.volumeBoostAtMaxUnits;
      if (Math.abs(mult - unitVolumeMult) < 0.01) return;
      unitVolumeMult = mult;
      if (current && !current.fading && masterGain) fadeGain(masterGain, effectiveVolume(), 0.4);
    },
    play(trackId, opts = {}) {
      const meta = trackMeta(trackId);
      if (!meta) return;
      if (current && current.trackId === trackId && !opts.force) return;
      const dur = opts.instant ? 0.05 : MUSIC_MIX.crossfadeSec;
      const c = ensureCtx();
      armResumeOnGesture();
      const entry = {
        trackId,
        loop: trackId === 'menu', // меню/пауза — простой луп, без плейлиста
        buffer: null,
        source: null,
        gain: c.createGain(),
        startedAt: 0,
        offset: 0,
        fading: true,
        manualStop: false,
        stopped: false,
        audible: null, // трек, который звучит, пока этот грузится (гасится при старте этого)
      };
      entry.gain.gain.value = 0;
      entry.gain.connect(masterGain);
      const old = current;
      current = entry;
      if (old) {
        if (old.source) {
          entry.audible = old;
        } else {
          // Предыдущий ещё не успел зазвучать — звучит то, что было до него.
          entry.audible = old.audible;
          old.audible = null;
          retire(old, 0.05);
        }
      }
      const handOver = () => { const a = entry.audible; entry.audible = null; if (a) retire(a, dur); };
      setTimeout(handOver, HANDOVER_WAIT_MS);
      (trackId === 'menu' ? whenGateOpen() : Promise.resolve())
        .then(() => (current === entry ? loadBuffer(meta.file) : null))
        .then((buffer) => {
          if (!buffer || current !== entry) return; // успели переключиться на другой трек, пока этот грузился
          entry.buffer = buffer;
          startSource(entry);
          fadeGain(entry.gain, 1, dur);
          handOver();
          setTimeout(() => { if (current === entry) entry.fading = false; }, dur * 1000 + 50);
          // Фоновая докачка того, что понадобится следующим.
          if (trackId === 'menu') {
            setTimeout(() => prefetch(MUSIC_TRACKS.battle_theme && MUSIC_TRACKS.battle_theme.file), PREFETCH_DELAY_MS);
          } else if (MUSIC_TRACKS[trackId]) {
            setTimeout(() => { prefetch(EVENT_TRACKS.victory_sting.file); prefetch(EVENT_TRACKS.defeat_sting.file); }, PREFETCH_DELAY_MS);
          }
        })
        .catch((e) => {
          console.warn('[music] трек не загружен', meta.file, e);
          if (current === entry) handOver();
        });
    },
    // Фоновая докачка трека заранее (только байты, без декодирования).
    prefetch(trackId) { const meta = trackMeta(trackId); if (meta) prefetch(meta.file); },
    current() { return current ? current.trackId : null; },
    // Для живой диагностики (утренняя проверка баг-репортов) — реальное
    // состояние текущего трека, не только "назначенный" trackId.
    debugState() {
      if (!current) return null;
      return {
        trackId: current.trackId,
        paused: !!ctx && ctx.state === 'suspended',
        volume: current.gain ? current.gain.gain.value : 0,
        currentTime: currentOffset(current),
        loading: !current.buffer, // трек назначен, но ещё качается/декодируется
        playing: !!current.source && !current.stopped,
      };
    },
    stop() {
      if (!current) return;
      const a = current.audible;
      current.audible = null;
      if (a) retire(a, 0.05);
      stopSource(current); current.gain.disconnect(); current = null;
    },
    onEnded(cb) { endedCb = cb; },
    // Пауза/возобновление трека на время полноэкранной рекламы (требование
    // площадок — Яндекс п.4.7) и на время скрытой/неактивной вкладки
    // (требования модерации, п.1.3 — см. document.visibilitychange в
    // game.js). Раньше на <audio> это было .pause()/.play(); на Web Audio
    // самый надёжный аналог — suspend()/resume() всего контекста: это
    // замораживает буквально всё (currentTime, все запланированные
    // gain-автоматизации, позицию источника) одной операцией, без ручного
    // учёта смещения внутри буфера — и восстанавливает ровно с того же
    // места без щелчков и пересоздания узлов.
    pauseForAd() { if (ctx) ctx.suspend().catch(() => {}); },
    resumeAfterAd() { if (ctx) ctx.resume().catch(() => {}); },
  };
})();
