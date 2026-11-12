// Применяем сохранённую тему и цвет акцента до отрисовки, чтобы страница не мигала
(function () {
  try {
    var t = localStorage.getItem("cloudesk-theme");
    // заставка, которая была в прошлый раз, — сразу, без мелькания первой картинки
    var w = localStorage.getItem("cloudesk-wall");
    document.documentElement.setAttribute("data-wall", /^[a-z]{3,12}$/.test(w || "") ? w : "dusk");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    var a = JSON.parse(localStorage.getItem("cloudesk-accent") || "null");
    if (a && /^#[0-9a-f]{6}$/i.test(a.l) && /^#[0-9a-f]{6}$/i.test(a.d)) {
      var s = document.documentElement.style;
      s.setProperty("--acc-l", a.l); s.setProperty("--acc-d", a.d);
      s.setProperty("--acc-l-ink", a.li); s.setProperty("--acc-d-ink", a.di);
    }
  } catch (e) {}
})();
