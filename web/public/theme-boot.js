// Applies the saved day/night choice before first paint, so there's no flash.
(function () {
  try {
    var t = localStorage.getItem('ustudy.theme');
    if (t === 'day' || t === 'night') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    /* storage unavailable: follow the system setting */
  }
})();
