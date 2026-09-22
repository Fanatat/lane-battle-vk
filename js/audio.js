// Все SFX — синтез через WebAudio, без внешних сэмплов (см. ГДД, «Аудио»).
'use strict';

const SFX = (() => {
  let ctx = null;
  let master = null;
  let muted = false;
  // Приоритет площадки (CrazyGames SDK.game.settings.muteAudio, см.
  // js/platform.js, initCrazyGames()) над собственным тумблером звука игры
  // — независимый флаг, не пишется в progress/save.js (эфемерное состояние
  // площадки, не выбор игрока).
  let platformMuted = false;

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function env(gainNode, t0, attack, hold, release, peak) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + attack);
    g.setValueAtTime(peak, t0 + attack + hold);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  }

  function tone({ freq = 440, freq2 = null, dur = 0.15, type = 'sine', peak = 0.5, delay = 0 }) {
    if (muted || platformMuted) return;
    const c = ensure();
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freq2 !== null) osc.frequency.exponentialRampToValueAtTime(freq2, t0 + dur);
    env(gain, t0, 0.005, dur * 0.3, dur * 0.7, peak);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noiseBurst({ dur = 0.12, peak = 0.4, filterFreq = 1200, delay = 0 }) {
    if (muted || platformMuted) return;
    const c = ensure();
    const t0 = c.currentTime + delay;
    const bufferSize = Math.floor(c.sampleRate * dur);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    const gain = c.createGain();
    env(gain, t0, 0.002, dur * 0.2, dur * 0.8, peak);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  return {
    setMuted(v) { muted = v; },
    isMuted() { return muted; },
    // Площадка (CrazyGames muteAudio) — приоритет над muted выше, но не
    // подменяет/не сбрасывает его: оба флага независимы, звук глушится, если
    // сработал хотя бы один (см. tone()/noiseBurst()).
    setPlatformMuted(v) { platformMuted = v; },
    unlock() { ensure(); },
    // Скрытая/неактивная вкладка (модерация, п.1.3 — см. document.
    // visibilitychange в game.js) — тем же способом, что MUSIC.pauseForAd:
    // suspend() всего контекста замораживает любой SFX, который случайно
    // доигрывает в момент сворачивания, вместо того чтобы дать ему дозвучать
    // в фоне.
    suspend() { if (ctx) ctx.suspend().catch(() => {}); },
    resume() { if (ctx) ctx.resume().catch(() => {}); },
    // роль атакующего задаёт тембр удара — тяжёлый глухой, копьё резкое,
    // герой отдельно узнаваем (см. ГДД, «Аудио: звук на все события мира»)
    hitMelee(role) {
      const cfg = {
        melee: { filterFreq: 900, dur: 0.09 },
        spear: { filterFreq: 1300, dur: 0.07 },
        heavy: { filterFreq: 480, dur: 0.16 },
        hero: { filterFreq: 750, dur: 0.11 },
        hero_special: { filterFreq: 550, dur: 0.15 },
      }[role] || { filterFreq: 900, dur: 0.09 };
      noiseBurst({ dur: cfg.dur, peak: 0.5, filterFreq: cfg.filterFreq });
    },
    hitRanged() { tone({ freq: 900, freq2: 300, dur: 0.08, type: 'triangle', peak: 0.3 }); },
    shoot() { tone({ freq: 500, freq2: 700, dur: 0.08, type: 'sine', peak: 0.2 }); },
    death() { noiseBurst({ dur: 0.22, peak: 0.45, filterFreq: 400 }); tone({ freq: 220, freq2: 80, dur: 0.25, type: 'sawtooth', peak: 0.2, delay: 0.02 }); },
    spawn() { tone({ freq: 300, freq2: 500, dur: 0.12, type: 'square', peak: 0.18 }); },
    buyDenied() { tone({ freq: 160, dur: 0.1, type: 'square', peak: 0.25 }); },
    upgrade() { tone({ freq: 400, freq2: 900, dur: 0.25, type: 'sine', peak: 0.3 }); tone({ freq: 600, freq2: 1200, dur: 0.25, type: 'sine', peak: 0.2, delay: 0.06 }); },
    mine() { noiseBurst({ dur: 0.06, peak: 0.35, filterFreq: 2200 }); tone({ freq: 1400, freq2: 1900, dur: 0.12, type: 'triangle', peak: 0.25, delay: 0.05 }); },
    heroSpecial() { noiseBurst({ dur: 0.3, peak: 0.5, filterFreq: 600 }); tone({ freq: 150, freq2: 60, dur: 0.35, type: 'sawtooth', peak: 0.3 }); },
    heroHurt() { tone({ freq: 250, freq2: 100, dur: 0.15, type: 'square', peak: 0.3 }); },
    // Отдельный, более тревожный сигнал именно на смерть героя (не просто
    // урон) — стадия 2, баг-репорт: игрок должен заметить это, даже глядя
    // в другой конец арены, не только по надписи в углу HUD.
    heroDown() {
      noiseBurst({ dur: 0.35, peak: 0.5, filterFreq: 250 });
      [220, 160, 110].forEach((f, i) => tone({ freq: f, dur: 0.4, type: 'sawtooth', peak: 0.3, delay: i * 0.14 }));
    },
    click() { tone({ freq: 700, dur: 0.05, type: 'sine', peak: 0.2 }); },
    coreHit() { noiseBurst({ dur: 0.18, peak: 0.4, filterFreq: 300 }); },
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
  let current = null; // { trackId, buffer, source, gain, startedAt, offset, pausedOffset, adPaused, fading, manualStop, ended }
  let endedCb = null;
  const bufferCache = new Map(); // file -> Promise<AudioBuffer>, чтобы не перекачивать/передекодировать один трек на каждый play()

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
  function loadBuffer(file) {
    if (!bufferCache.has(file)) {
      bufferCache.set(file, fetch(file)
        .then((r) => r.arrayBuffer())
        .then((data) => ensureCtx().decodeAudioData(data)));
    }
    return bufferCache.get(file);
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
      };
      entry.gain.gain.value = 0;
      entry.gain.connect(masterGain);
      const old = current;
      current = entry;
      loadBuffer(meta.file).then((buffer) => {
        if (current !== entry) return; // успели переключиться на другой трек, пока этот декодировался
        entry.buffer = buffer;
        startSource(entry);
        fadeGain(entry.gain, 1, dur);
        setTimeout(() => { if (current === entry) entry.fading = false; }, dur * 1000 + 50);
      });
      if (old) {
        fadeGain(old.gain, 0, dur);
        setTimeout(() => { stopSource(old); old.gain.disconnect(); }, dur * 1000 + 50);
      }
    },
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
      };
    },
    stop() { if (current) { stopSource(current); current.gain.disconnect(); current = null; } },
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
