/* ============================================================
   i18n.js — RU + EN (ТЗ №19). Формат/приём — byte-для-byte эталон
   game3/color_sort/i18n.js (I18N/currentLang/setLanguage/t/applyStrings),
   не изобретён заново. Язык берётся из Platform.getLang() (main.js),
   фолбэк — ru. Только техническая проводка видимого языка — ТЗ №19,
   контент НЕ расширен, переведён существующий текст 1:1.

   Строки с {n}/{m}/{s}/{total}/{icon}/{label} — плейсхолдеры, подставляются
   вызывающим кодом через .replace(), как в эталоне (t() их не парсит).
   ============================================================ */
const I18N = {
  ru: {
    // ТЗ №15 п.6/P-12: имя игры «Битва линий» решено за основателя для
    // русской версии — здесь ТОЛЬКО перевод для EN (ТЗ №19), не новое
    // решение об имени (вопрос финального имени остаётся открытым).
    title: 'Битва линий',
    play: 'Играть',
    continueLabel: 'Продолжить',
    subtitle: 'Копи еду — выставляй бойцов — разноси базу врага',
    howToPlay: 'Тапни по карточке юнита внизу — он выйдет на полосу и будет сражаться сам. Кнопка ×1 наверху ускоряет бой, ⏸ — пауза.',
    feedbackPrefix: 'Связь с разработчиком:',
    pauseTitle: 'Пауза',
    pauseMenu: 'Выйти в меню',
    roleA: 'Боец',
    roleB: 'Стрелок',
    roleC: 'Щит',
    battleLabel: 'Битва {n}',
    player: 'ИГРОК',
    enemy: 'ВРАГ',
    secShort: 'с',
    win: 'Победа',
    lose: 'Поражение',
    milestoneLine: '🎉 Рубеж: битва {n} позади. Дальше сложнее.\n\n',
    statsDuration: 'Длительность боя: {s} с',
    statsSpawned: 'Юнитов заспавнено: {n}',
    statsKilled: 'Юнитов убито: {n}',
    statsGained: 'Получено {icon} {n} (всего {total})',
    restartNext: 'Начать битву {n}',
    rewardedBonus: '🏆 Бонус за просмотр рекламы: +{n}',
    rewardedGranted: 'Начислено +{n} {icon}',
    dailyBonus: '🔥 Серия {n} — забрать {icon} {m}',
    unlocksHeader: 'Разблокировки',
    upgradesHeader: 'Апгрейды',
    needsUnlock: 'нужно: {label}',
    upgradeLevel: 'уровень {n}',
    maxedSuffix: ' (макс.)',
    // Контент апгрейдов/разблокировок (существующие label из balance.json,
    // ключи по campaign.unlocks/campaign.upgrades) — balance.json структуру
    // не трогаем (ТЗ №19), перевод живёт здесь, main.js берёт текст отсюда.
    upg_unlock_B: 'Открыть стрелка (B)',
    upg_unlock_C: 'Открыть щит (C)',
    upg_income: 'Доход еды',
    upg_base_hp: 'HP базы',
    upg_damage_A: 'Урон бойца A',
    upg_damage_B: 'Урон стрелка B',
    upg_damage_C: 'Урон щита C'
  },
  en: {
    title: 'Line Battle',
    play: 'Play',
    continueLabel: 'Continue',
    subtitle: 'Gather food — deploy fighters — smash the enemy base',
    howToPlay: 'Tap a unit card below — it enters the lane and fights on its own. The ×1 button speeds up the battle, ⏸ pauses it.',
    feedbackPrefix: 'Contact the developer:',
    pauseTitle: 'Paused',
    pauseMenu: 'Exit to menu',
    roleA: 'Fighter',
    roleB: 'Archer',
    roleC: 'Shield',
    battleLabel: 'Battle {n}',
    player: 'PLAYER',
    enemy: 'ENEMY',
    secShort: 's',
    win: 'Victory',
    lose: 'Defeat',
    milestoneLine: '🎉 Milestone: battle {n} done. It gets harder from here.\n\n',
    statsDuration: 'Battle duration: {s}s',
    statsSpawned: 'Units spawned: {n}',
    statsKilled: 'Units killed: {n}',
    statsGained: 'Earned {icon} {n} (total {total})',
    restartNext: 'Start battle {n}',
    rewardedBonus: '🏆 Bonus for watching an ad: +{n}',
    rewardedGranted: 'Credited +{n} {icon}',
    dailyBonus: '🔥 Streak {n} — claim {icon} {m}',
    unlocksHeader: 'Unlocks',
    upgradesHeader: 'Upgrades',
    needsUnlock: 'requires: {label}',
    upgradeLevel: 'level {n}',
    maxedSuffix: ' (max)',
    upg_unlock_B: 'Unlock the archer (B)',
    upg_unlock_C: 'Unlock the shield (C)',
    upg_income: 'Food income',
    upg_base_hp: 'Base HP',
    upg_damage_A: 'Fighter A damage',
    upg_damage_B: 'Archer B damage',
    upg_damage_C: 'Shield C damage'
  }
};

let currentLang = 'ru';

function setLanguage(lang) {
  // ru/be/kk/uk/uz → русский интерфейс; остальное → en (тот же приём,
  // что у эталона game3/color_sort/i18n.js).
  const ruFamily = ['ru', 'be', 'kk', 'uk', 'uz'];
  currentLang = ruFamily.includes(lang) ? 'ru' : (I18N[lang] ? lang : 'en');
  document.documentElement.lang = currentLang;
  applyStrings();
}

function t(key) {
  return (I18N[currentLang] && I18N[currentLang][key]) || I18N.ru[key] || key;
}

function applyStrings() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.title = t('title');
}
