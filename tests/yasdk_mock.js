// Мок YaGames для приёмочного прогона платформенного слоя (ТЗ №10).
// Стейтфул по образцу студийного стандарта (сверено чтением
// game3/color_sort/tests/yasdk_mock.js, G-01): getData() после setData()
// отражает реальную запись, а не статичный сид — иначе тест «сохранил →
// вернулся» получает ложный зелёный на моке, который сам себя обнуляет
// при перезагрузке (T-07).
//
// window.__seedSave — засеять сейв ДО init(), как будто площадка уже что-то
// хранила (нужно для теста «поднять чистый старт на реально записанном
// объекте» — T-07, а не выдумывать состояние заново).
// window.__mockHang === true — YaGames.init() никогда не резолвится
// («платформа МОЛЧИТ», S-10).
// window.__mockThrowAfterInit === true — init() проходит успешно, но
// getPlayer() бросает («платформа НЕ УМЕЕТ метод» уже после init, S-10).
(function () {
  window.__saveLog = [];
  window.__interstitialLog = [];
  window.__rewardedLog = [];
  var saveStore = window.__seedSave ? JSON.parse(JSON.stringify(window.__seedSave)) : null;

  var fakePlayer = {
    setData: function (data) {
      saveStore = JSON.parse(JSON.stringify(data));
      window.__saveLog.push(JSON.parse(JSON.stringify(data)));
      return Promise.resolve();
    },
    getData: function () {
      return Promise.resolve(saveStore ? JSON.parse(JSON.stringify(saveStore)) : {});
    }
  };
  var fakeYsdk = {
    features: { LoadingAPI: { ready: function () { window.__gameReadyCalled = true; } } },
    environment: { i18n: { lang: 'ru' } },
    getPlayer: function () {
      if (window.__mockThrowAfterInit) return Promise.reject(new Error('mock: getPlayer недоступен на этой платформе'));
      return Promise.resolve(fakePlayer);
    },
    adv: {
      showFullscreenAdv: function (opts) {
        window.__interstitialLog.push({ atMs: Date.now() });
        var cb = (opts && opts.callbacks) || {};
        if (cb.onOpen) cb.onOpen();
        setTimeout(function () { if (cb.onClose) cb.onClose(true); }, 20);
      },
      showRewardedVideo: function (opts) {
        window.__rewardedLog.push({ atMs: Date.now() });
        var cb = (opts && opts.callbacks) || {};
        if (cb.onOpen) cb.onOpen();
        setTimeout(function () {
          if (cb.onRewarded) cb.onRewarded();
          if (cb.onClose) cb.onClose();
        }, 20);
      }
    }
  };
  window.YaGames = {
    init: function () {
      if (window.__mockHang) return new Promise(function () {}); // никогда не резолвится — S-10 «платформа МОЛЧИТ»
      return Promise.resolve(fakeYsdk);
    }
  };
})();
