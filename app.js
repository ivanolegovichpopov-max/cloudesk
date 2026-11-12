(() => {
  "use strict";

  const SB_URL = "https://kgfhwjiexhwtxczjkgic.supabase.co";
  // Публичный ключ: по нему ничего нельзя прочитать без входа, доступ закрыт правилами в базе
  const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnZmh3amlleGh3dHhjemprZ2ljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0NzU2MzIsImV4cCI6MjExMDA1MTYzMn0.gsIQN79Ca1gdO-e5PmYNEyZcvu1uJ9s1vqgYuOuiL2Q";
  const BOT_ID = 9064192591;
  const AUTH_FN = SB_URL + "/functions/v1/tg-auth";

  // Готовые заставки и их акцент (оттенок, насыщенность)
  const PRESETS = [
    { id: "dusk", name: "Закат", h: 20, s: .65 },
    { id: "apricot", name: "Абрикос", h: 16, s: .7 },
    { id: "lake", name: "Озеро", h: 192, s: .6 },
    { id: "peaks", name: "Горы", h: 280, s: .32 },
    { id: "moss", name: "Мох", h: 88, s: .42 },
    { id: "graphite", name: "Графит", h: 28, s: .18 },
    { id: "night", name: "Ночь", h: 228, s: .5 },
  ];

  const $ = (id) => document.getElementById(id);
  const sb = window.supabase.createClient(SB_URL, SB_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "cloudesk-auth" },
  });

  const state = { user: null, profile: null, notes: [], settings: null, wallUrl: null };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  /* ---------- Тема ---------- */
  function applyTheme(t) {
    t = t === "light" || t === "dark" ? t : "auto";
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    store.set("cloudesk-theme", t);
    document.querySelectorAll("[data-theme-set]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.themeSet === t)));
  }
  document.querySelectorAll("[data-theme-set]").forEach((b) =>
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      colorFade();
      applyTheme(b.dataset.themeSet);
      try { await saveSettings({ theme: b.dataset.themeSet }); }
      catch (err) { console.error(err); toast("Тема не сохранилась. Попробуйте ещё раз."); }
    }));

  /* ---------- Акцент из заставки ---------- */
  function hsl2hex(h, s, l) {
    const f = (n) => {
      const k = (n + h / 30) % 12;
      const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(c * 255).toString(16).padStart(2, "0");
    };
    return "#" + f(0) + f(8) + f(4);
  }
  function lum(hex) {
    const v = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  // Один оттенок — два цвета: потемнее для светлой темы, посветлее для тёмной; текст на кнопке подбирается по контрасту
  function setAccent(h, s) {
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const l = hsl2hex(h, clamp(s, .35, .72), .44);
    const d = hsl2hex(h, clamp(s, .4, .78), .7);
    const ink = (hex) => (lum(hex) > 0.36 ? "#24170c" : "#ffffff");
    const acc = { l, d, li: ink(l), di: ink(d) };
    const st = document.documentElement.style;
    st.setProperty("--acc-l", acc.l); st.setProperty("--acc-d", acc.d);
    st.setProperty("--acc-l-ink", acc.li); st.setProperty("--acc-d-ink", acc.di);
    store.set("cloudesk-accent", JSON.stringify(acc));
  }
  // Основной цвет фото: берём яркие средние тона и усредняем оттенок по кругу
  async function accentFromImage(blob) {
    try {
      const bmp = await createImageBitmap(blob, { resizeWidth: 48, resizeHeight: 48 });
      const c = document.createElement("canvas");
      c.width = c.height = 48;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0, 48, 48);
      bmp.close && bmp.close();
      const px = ctx.getImageData(0, 0, 48, 48).data;
      let x = 0, y = 0, ws = 0, ss = 0;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), L = (mx + mn) / 2, dl = mx - mn;
        if (dl < 0.04) continue;
        const S = dl / (1 - Math.abs(2 * L - 1));
        let H = mx === r ? ((g - b) / dl) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4;
        H = (H * 60 + 360) % 360;
        const w = S * (1 - Math.abs(L - 0.5) * 1.6);
        if (w <= 0) continue;
        x += Math.cos(H * Math.PI / 180) * w; y += Math.sin(H * Math.PI / 180) * w;
        ws += w; ss += S * w;
      }
      if (ws < 20) return setAccent(28, .2); // почти серое фото — тёплый нейтральный
      setAccent((Math.atan2(y, x) * 180 / Math.PI + 360) % 360, ss / ws);
    } catch (e) { setAccent(20, .65); }
  }

  /* ---------- Мелочи ---------- */
  /* ---------- Анимации: только прозрачность и сдвиг, коротко ---------- */
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Плавно скрыть: проигрываем уход (класс is-leaving), затем прячем
  function animHide(el, ms = 150) {
    if (!el || el.hidden) return;
    if (reduceMotion) { el.hidden = true; return; }
    el.classList.add("is-leaving");
    clearTimeout(el._leaveT);
    el._leaveT = setTimeout(() => { el.hidden = true; el.classList.remove("is-leaving"); }, ms);
  }
  function animShow(el) {
    if (!el) return;
    clearTimeout(el._leaveT);
    el.classList.remove("is-leaving");
    el.hidden = false;
  }
  // Перезапустить анимацию появления (например, при смене месяца)
  function replay(el, cls = "fade-in") {
    if (reduceMotion || !el) return;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  }
  // Плавная смена цветов (тема, акцент) на четверть секунды
  function colorFade() {
    if (reduceMotion) return;
    const r = document.documentElement;
    r.classList.add("color-fade");
    clearTimeout(r._cf);
    r._cf = setTimeout(() => r.classList.remove("color-fade"), 320);
  }

  // Кнопка-значок: меняем значок и подсказку (например, Старт ⇄ Пауза)
  const PATHS = { play: "M8 5v14l11-7z", pause: "M9 5v14M15 5v14" };
  function setIconBtn(btn, path, label) {
    if (btn.dataset.path === path && btn.dataset.tip === label) return;
    btn.dataset.path = path; btn.dataset.tip = label; btn.setAttribute("aria-label", label);
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="' + path + '"/></svg>';
  }

  /* ---------- Перетаскивание (общее для всего стола) ----------
     Тянем за ручку ⋮⋮; работает мышью и пальцем. На месте, куда упадёт элемент, — пунктирная рамка.
     Клавиатура: ручка в фокусе + стрелки вверх/вниз. Esc во время перетаскивания — отмена. */
  const GRIP = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01"/></svg>';
  function gripBtn(label) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "tool grip"; b.innerHTML = GRIP;
    b.dataset.tip = "Перетащите"; b.setAttribute("aria-label", label + " — перетащите или стрелки вверх/вниз");
    return b;
  }
  function sortable(root, o) {
    // o: item, handle, list (селектор списков, куда можно бросить), listFor(el) (список по элементу под пальцем),
    //    fixed (элементы, перед которыми бросать нельзя), scroller, onDrop(item), onKey(item, dir)
    root.addEventListener("keydown", (e) => {
      const h = e.target.closest && e.target.closest(o.handle);
      if (!h || !o.onKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      e.preventDefault(); e.stopPropagation();
      o.onKey(h.closest(o.item), e.key === "ArrowUp" ? -1 : 1);
    });
    root.addEventListener("pointerdown", (e) => {
      const h = e.target.closest(o.handle);
      if (!h || h.disabled || !root.contains(h) || e.button > 0) return;
      const item = h.closest(o.item);
      if (!item) return;
      e.preventDefault();
      closeMenus(null);
      const r = item.getBoundingClientRect();
      const home = { parent: item.parentNode, next: item.nextSibling };
      const ph = document.createElement(item.tagName === "LI" ? "li" : "div");
      ph.className = "drag-ph"; ph.style.height = r.height + "px";
      if (o.grid) { const cs = getComputedStyle(item); ph.style.gridColumn = cs.gridColumnStart + " / " + cs.gridColumnEnd; }
      item.after(ph);
      item.classList.add("dragging");
      Object.assign(item.style, { width: r.width + "px", left: r.left + "px", top: r.top + "px" });
      const dy0 = e.clientY - r.top, dx0 = e.clientX - r.left;
      let lastY = e.clientY, raf = 0, done = false;
      try { h.setPointerCapture(e.pointerId); } catch (err) {}
      const scroller = o.scroller ? o.scroller() : null;
      const place = (x, y) => {
        // в сетке (поля, карточки) элемент двигается свободно; в списке — только вверх-вниз
        item.style.transform = o.grid ? "translate(" + (x - dx0 - r.left) + "px," + (y - dy0 - r.top) + "px)" : "translateY(" + (y - dy0 - r.top) + "px)";
        const el = document.elementFromPoint(x, y);
        if (!el || !root.contains(el)) return;
        const over = el.closest(o.item);
        if (over && over !== item && root.contains(over)) {
          const rr = over.getBoundingClientRect();
          const before = !(o.fixed && over.matches(o.fixed)) && (o.grid
            ? (y < rr.top + rr.height * 0.25 || (y <= rr.bottom - rr.height * 0.25 && x < rr.left + rr.width / 2))
            : y < rr.top + rr.height / 2);
          if (before) { if (over.previousSibling !== ph) over.before(ph); }
          else if (over.nextSibling !== ph) over.after(ph);
          return;
        }
        const list = el.closest(o.list) || (o.listFor && o.listFor(el));
        if (list && list !== ph.parentNode && root.contains(list)) list.append(ph);
      };
      const tick = () => {
        raf = 0;
        if (!scroller || done) return;
        const sr = scroller.getBoundingClientRect();
        const v = lastY < sr.top + 40 ? -8 : lastY > sr.bottom - 40 ? 8 : 0;
        if (v) { scroller.scrollTop += v; place(lastX, lastY); raf = requestAnimationFrame(tick); }
      };
      let lastX = e.clientX;
      const move = (ev) => { lastY = ev.clientY; lastX = ev.clientX; place(ev.clientX, ev.clientY); if (!raf) raf = requestAnimationFrame(tick); };
      const finish = (cancel) => {
        if (done) return; done = true;
        cancelAnimationFrame(raf);
        h.removeEventListener("pointermove", move);
        h.removeEventListener("pointerup", up);
        h.removeEventListener("pointercancel", up);
        document.removeEventListener("keydown", esc, true);
        if (cancel) { ph.remove(); home.parent.insertBefore(item, home.next); } else ph.replaceWith(item);
        item.classList.remove("dragging");
        item.style.cssText = "";
        if (!cancel) { item.classList.add("dropped"); setTimeout(() => item.classList.remove("dropped"), 300); o.onDrop(item); }
      };
      const up = () => finish(false);
      const esc = (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); ev.preventDefault(); finish(true); } };
      h.addEventListener("pointermove", move);
      h.addEventListener("pointerup", up);
      h.addEventListener("pointercancel", up);
      document.addEventListener("keydown", esc, true);
    });
  }

  /* Подсказки: одна плашка на весь стол. Появляется у элемента с data-tip при наведении мышью,
     встаёт под элементом (или над ним, если снизу нет места) и всегда остаётся в пределах экрана. */
  const tipEl = document.createElement("div");
  tipEl.className = "tip"; tipEl.setAttribute("role", "tooltip"); tipEl.hidden = true;
  document.body.append(tipEl);
  let tipFor = null, tipT = 0;
  function hideTip() { clearTimeout(tipT); tipFor = null; tipEl.hidden = true; }
  function showTip(el) {
    if (!el.isConnected || el.getAttribute("aria-expanded") === "true" || document.querySelector(".dragging")) return;
    tipEl.textContent = el.dataset.tip;
    tipEl.hidden = false;
    const r = el.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight, m = 8;
    let x = r.left + r.width / 2 - w / 2;
    x = Math.max(m, Math.min(x, window.innerWidth - w - m));
    let y = r.bottom + 6;
    if (y + h > window.innerHeight - m) y = r.top - 6 - h;
    y = Math.max(m, y);
    tipEl.style.left = x + "px"; tipEl.style.top = y + "px";
  }
  document.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse") return;
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (el === tipFor) return;
    hideTip();
    if (!el || el.disabled) return;
    tipFor = el;
    tipT = setTimeout(() => showTip(el), 300);
  });
  ["pointerdown", "keydown", "wheel"].forEach((t) => document.addEventListener(t, hideTip, true));
  document.addEventListener("scroll", hideTip, true);
  window.addEventListener("blur", hideTip);

  // Полоса прокрутки показывается только пока прокручивают, потом прячется
  document.addEventListener("scroll", (e) => {
    const el = e.target === document ? document.documentElement : e.target;
    if (!el.classList) return;
    el.classList.add("is-scrolling");
    clearTimeout(el._scrollT);
    el._scrollT = setTimeout(() => el.classList.remove("is-scrolling"), 900);
  }, { capture: true, passive: true });

  // Мягкий край у всего, что прокручивается: содержимое плавно тает у края, за которым есть ещё
  const FADE_SEL = ".tab-panel, .stage-below, .t-list, .links-list, #links-menu-list, .pop-scroll, .tp-list, .ed-body, .presets, .fld-body";
  function fadeUpdate(el) {
    const over = el.scrollHeight - el.clientHeight > 1;
    const oy = over && getComputedStyle(el).overflowY;
    const on = over && (oy === "auto" || oy === "scroll");
    el.classList.toggle("fade-scroll", on);
    el.classList.toggle("fade-top", on && el.scrollTop > 1);
    el.classList.toggle("fade-bottom", on && el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }
  let fadeQ = 0;
  function fadeAll() {
    if (fadeQ) return;
    fadeQ = requestAnimationFrame(() => {
      fadeQ = 0;
      document.querySelectorAll(FADE_SEL).forEach((el) => { if (el.getClientRects().length) fadeUpdate(el); });
    });
  }
  document.addEventListener("scroll", (e) => { if (e.target.matches && e.target.matches(FADE_SEL)) fadeUpdate(e.target); }, { capture: true, passive: true });
  document.addEventListener("input", (e) => { if (e.target.matches && e.target.matches(FADE_SEL)) fadeUpdate(e.target); }, true);
  new MutationObserver(fadeAll).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  window.addEventListener("resize", fadeAll);

  let toastTimer;
  // уведомление; с действием (например «Вернуть») висит дольше
  function toast(text, actionLabel, onAction) {
    const t = $("toast");
    t.textContent = "";
    const s = document.createElement("span"); s.textContent = text; t.append(s);
    if (actionLabel) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "toast-act"; b.textContent = actionLabel;
      b.addEventListener("click", () => { clearTimeout(toastTimer); animHide(t, 180); onAction(); });
      t.append(b);
    }
    animShow(t);
    replay(t, "toast-in");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => animHide(t, 180), actionLabel ? 7000 : 4000);
  }

  const fmtTime = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const fmtDate = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  const fmtShort = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  function tick() {
    const now = new Date();
    $("clock-time").textContent = fmtTime.format(now);
    const d = fmtDate.format(now);
    $("clock-date").textContent = d.charAt(0).toUpperCase() + d.slice(1);
    if (typeof renderNextRem === "function" && state.reminders) renderNextRem();
  }

  function lockSheets(open) { document.documentElement.style.overflow = open ? "hidden" : ""; }

  /* ---------- Экраны ---------- */
  function showLogin(msg) {
    $("desk").hidden = true;
    $("login").hidden = false;
    $("login-msg").textContent = msg || "";
    $("tg-login").disabled = false;
    setWall("dusk", null);
  }

  async function showDesk() {
    $("login").hidden = true;
    $("desk").hidden = false;
    tick();
    await loadAll();
  }

  /* ---------- Вход через Telegram ---------- */
  $("tg-login").addEventListener("click", () => {
    if (!window.Telegram || !window.Telegram.Login) {
      $("login-msg").textContent = "Не загрузился модуль Telegram. Обновите страницу.";
      return;
    }
    $("tg-login").disabled = true;
    $("login-msg").textContent = "Подтвердите вход в окне Telegram…";
    window.Telegram.Login.auth({ bot_id: BOT_ID, request_access: "write", lang: "ru" }, async (tgUser) => {
      if (!tgUser) {
        showLogin("Вход отменён.");
        return;
      }
      try {
        $("login-msg").textContent = "Проверяю…";
        const r = await fetch(AUTH_FN, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SB_KEY },
          body: JSON.stringify(tgUser),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          const reasons = {
            bad_signature: "Telegram не подтвердил вход. Попробуйте ещё раз.",
            expired: "Данные входа устарели. Попробуйте ещё раз.",
            not_configured: "Вход ещё настраивается. Загляните чуть позже.",
          };
          showLogin(reasons[j.error] || "Не получилось войти. Попробуйте ещё раз.");
          return;
        }
        const { error } = await sb.auth.setSession({ access_token: j.access_token, refresh_token: j.refresh_token });
        if (error) throw error;
        await showDesk();
      } catch (e) {
        console.error(e);
        showLogin("Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.");
      }
    });
  });

  /* ---------- Пользователь ---------- */
  $("user-saved").addEventListener("click", () => setTimeout(() => closeMenus(null), 0));
  function renderUser() {
    const p = state.profile || {};
    const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.username || "Вы";
    $("user-name").textContent = name;
    $("user-handle").textContent = p.username ? "@" + p.username : "Telegram";
    // нажатие на себя — «Избранное» в Telegram (чат с самим собой)
    const tgId = ((state.user && state.user.email) || "").match(/^tg(\d+)@/);
    const saved = p.username && /^[A-Za-z0-9_]{4,32}$/.test(p.username) ? "https://t.me/" + p.username : tgId ? "tg://user?id=" + tgId[1] : "https://t.me/";
    $("user-saved").href = saved;
    const ava = $("user-ava");
    ava.textContent = "";
    ava.style.backgroundImage = "";
    if (p.photo_url && /^https:\/\/t\.me\//.test(p.photo_url)) {
      ava.style.backgroundImage = 'url("' + p.photo_url.replace(/["\\]/g, "") + '")';
    } else {
      ava.textContent = name.trim().charAt(0).toUpperCase();
    }
  }

  // Выпадающие меню верхней панели: открыто не больше одного, клик вне меню закрывает его
  function closeMenus(except) {
    document.querySelectorAll("[data-menu]").forEach((btn) => {
      if (btn === except) return;
      animHide($(btn.dataset.menu), 120);
      btn.setAttribute("aria-expanded", "false");
    });
    // список городов погоды открывается от поля ввода, а не от кнопки
    const wp = document.getElementById("weather-pop");
    if (wp && !wp.hidden) { animHide(wp, 120); document.getElementById("weather-city").setAttribute("aria-expanded", "false"); }
  }
  document.querySelectorAll("[data-menu]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const m = $(btn.dataset.menu);
      closeMenus(btn);
      const open = m.hidden || m.classList.contains("is-leaving");
      if (open) animShow(m); else animHide(m, 120);
      btn.setAttribute("aria-expanded", String(open));
    }));
  document.addEventListener("click", (e) => {
    // путь события запоминается в момент клика — работает, даже если кнопку внутри списка уже перерисовали
    const inside = e.composedPath().some((n) => n.classList && (n.classList.contains("menu") || n.classList.contains("pop")));
    if (!inside) closeMenus(null);
  });
  // Esc сначала закрывает открытый список/выбор, и только следующее нажатие — окно
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.querySelector('[data-menu][aria-expanded="true"]')) { closeMenus(null); e.stopImmediatePropagation(); }
  });
  $("btn-logout").addEventListener("click", async () => {
    closeMenus(null);
    await sb.auth.signOut();
    state.items = []; state.sections = []; state.desks = []; state.desk = null;
    $("desk-tabs").textContent = "";
    $("board").querySelectorAll(".fld, .fld-new").forEach((n) => n.remove());
    showLogin("Вы вышли.");
  });

  /* ---------- Столы: «Работа», «Личный», … — у каждого свои поля, ссылки и заставка ---------- */
  const DESK_COLS = "id,title,position,wallpaper_preset,wallpaper_path,wallpaper_weekly,wallpaper_week_from";
  const DESK_MAX = 10, DESK_TITLE = 20;
  state.desks = []; state.desk = null; state.base = null;
  const curDesk = () => state.desks.find((d) => d.id === state.desk) || null;
  async function loadDesks() {
    const r = await sb.from("desks").select(DESK_COLS).is("deleted_at", null).order("position").order("created_at");
    if (r.error) { toast("Не удалось загрузить стол. Обновите страницу."); return false; }
    state.desks = r.data || [];
    if (!state.desks.length) {
      const b = state.base || {};
      const c = await sb.from("desks").insert({ title: "Главный", position: 0, wallpaper_preset: b.wallpaper_preset || null, wallpaper_path: b.wallpaper_path || null, wallpaper_weekly: !!b.wallpaper_weekly, wallpaper_week_from: b.wallpaper_week_from ?? null }).select(DESK_COLS).single();
      if (c.error) { toast("Не удалось создать стол. Обновите страницу."); return false; }
      state.desks = [c.data];
    }
    const saved = store.get("cloudesk-desk");
    if (!state.desks.some((d) => d.id === state.desk)) { state.desk = state.desks.some((d) => d.id === saved) ? saved : state.desks[0].id; store.set("cloudesk-desk", state.desk); }
    return true;
  }
  // state.settings — общие настройки + заставка открытого стола (для всего кода оформления)
  function mergeSettings() {
    const d = curDesk() || {};
    const s = Object.assign({}, state.base || {});
    WALL_KEYS.forEach((k) => (s[k] = d[k] ?? (k === "wallpaper_weekly" ? false : null)));
    state.settings = s;
    const h = document.getElementById("wall-head");
    if (h) h.textContent = state.desks.length > 1 && d.title ? "Заставка стола «" + d.title + "»" : "Заставка";
  }
  function renderDeskTabs() {
    const nav = $("desk-tabs");
    const keep = nav.querySelector(".dtabs-scroll");
    const sl = keep ? keep.scrollLeft : 0;
    nav.textContent = "";
    const sc = document.createElement("div"); sc.className = "dtabs-scroll"; sc.setAttribute("role", "tablist"); sc.setAttribute("aria-label", "Столы");
    state.desks.forEach((d, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "dtab"; b.setAttribute("role", "tab"); b.dataset.id = d.id;
      b.setAttribute("aria-selected", String(d.id === state.desk));
      b.textContent = d.title;
      if (i < 9) b.dataset.tip = "Alt+" + (i + 1);
      b.addEventListener("click", () => switchDesk(d.id));
      sc.append(b);
    });
    const add = document.createElement("button");
    add.type = "button"; add.className = "dtab dtab-add";
    const full = state.desks.length >= DESK_MAX;
    add.dataset.tip = full ? "Не больше " + DESK_MAX + " столов" : "Новый стол";
    add.setAttribute("aria-label", "Новый стол");
    if (full) { add.setAttribute("aria-disabled", "true"); add.classList.add("off"); }
    add.innerHTML = svgIco(IC.plus, 16, 2);
    add.addEventListener("click", () => (full ? toast("Не больше " + DESK_MAX + " столов") : openSettings("desks", { newDesk: true })));
    sc.append(add);
    nav.append(sc);
    sc.scrollLeft = sl;
    const act = sc.querySelector('[aria-selected="true"]');
    if (act) requestAnimationFrame(() => { const l = act.offsetLeft, r = l + act.offsetWidth; if (l < sc.scrollLeft) sc.scrollLeft = l - 8; else if (r > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = r - sc.clientWidth + 8; });
  }
  async function switchDesk(id) {
    if (id === state.desk || !state.desks.some((d) => d.id === id)) return;
    closeMenus(null);
    state.desk = id;
    store.set("cloudesk-desk", id);
    mergeSettings();
    renderDeskTabs();
    scopeLinks(); renderLinks();
    const board = $("board");
    board.classList.remove("desk-in"); void board.offsetWidth; board.classList.add("desk-in");
    renderBoard();
    // проявление — только в момент смены стола; иначе каждая перерисовка (например, автосохранение) мигала бы
    clearTimeout(switchDesk.t); switchDesk.t = setTimeout(() => board.classList.remove("desk-in"), 250);
    await applyWallFromSettings();
  }
  // Alt+1…9 — быстрый переход между столами
  document.addEventListener("keydown", (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || $("desk").hidden) return;
    if ([...document.querySelectorAll(".sheet-wrap")].some((w) => !w.hidden)) return;
    const m = /^Digit([1-9])$/.exec(e.code);
    if (!m) return;
    const d = state.desks[Number(m[1]) - 1];
    if (d) { e.preventDefault(); switchDesk(d.id); }
  });

  /* ---------- Загрузка данных ---------- */
  async function loadAll() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return showLogin();
    state.user = user;

    const [prof, sets] = await Promise.all([
      sb.from("profiles").select("first_name,last_name,username,photo_url").eq("id", user.id).maybeSingle(),
      sb.from("settings").select("wallpaper_preset,wallpaper_path,wallpaper_weekly,wallpaper_week_from,theme,cities,weather_on,weather_city,weather_lat,weather_lon").eq("user_id", user.id).maybeSingle(),
    ]);

    if (prof.error || !prof.data) {
      await sb.auth.signOut();
      return showLogin("Учётная запись не найдена. Войдите через Telegram ещё раз.");
    }
    state.profile = prof.data;
    renderUser();


    state.base = sets.data || null;
    applyTheme(state.base && state.base.theme);
    if (!(await loadDesks())) return;
    mergeSettings();
    renderDeskTabs();
    loadItems();
    loadLinks();
    await applyWallFromSettings();
    if (wLast) renderWeather(wLast);
    loadWeather();
    renderOnline();
  }

  /* ---------- Стол: поля и приложения ----------
     Сетка из 3 колонок. Поле занимает 1, 2 или 3 колонки и фиксированную высоту; в поле — одно приложение.
     У каждого приложения свои допустимые ширины. Новое приложение = новая запись в APPS, стол под него не меняется.
     Записи приложений (заметки, напоминания и будущие) хранятся в общей таблице items с привязкой к полю. */
  const ITEM_COLS = "id,section_id,type,position,title,body,data,color,pinned,done,done_at,remind_at,sent_at,failed_at,error,created_at,updated_at,edited_at";
  const SEC_COLS = "id,title,app,span,settings,position,desk_id";
  state.items = []; state.sections = [];
  const IC = {
    note: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5",
    task: "M4 5h16v14H4zM8 12l3 3 5-6",
    plus: "M12 5v14M5 12h14",
    pin: "M9 3h6l-1 6 4 4H6l4-4zM11 13h2v8h-2z",
    set: "M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4",
  };
  const svgIco = (d, s = 16, w = 1.8) => '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round" d="' + d + '"/></svg>';
  // у заметки отдельные заголовок (title) и текст (body)
  const noteTitle = (it) => (it.title || "").trim() || "Без заголовка";
  const noteSub = (it) => stripMarks(it.body).replace(/\s+/g, " ").trim();

  // Приложения: name — название, spans — допустимые ширины, render — содержимое поля, add — действие «+»
  // Приложения: name — название, spans — допустимые ширины, render — содержимое поля, add — действие «+»,
  // opts — переключатели в окне поля (хранятся в настройках поля)
  const APPS = {
    notes: {
      name: "Заметки", icon: IC.note, spans: [2, 3], addTip: "Новая заметка",
      limit: 20, limitTip: "В поле уже 20 заметок — это предел. Удалите ненужные или создайте ещё одно поле «Заметки»",
      opts: [{ key: "manual", label: "Свой порядок — перетаскиванием" }],
      add: (f) => openEditor(null, f.id),
      render: (f, body) => {
        const manual = !!(f.settings && f.settings.manual);
        const list = state.items.filter((it) => it.type === "note" && it.section_id === f.id)
          .sort((a, b) => (!!b.pinned - !!a.pinned) || (manual ? a.position - b.position : 0) || (new Date(b.edited_at || b.created_at) - new Date(a.edited_at || a.created_at)));
        if (!list.length) { const e = document.createElement("div"); e.className = "fld-empty"; e.textContent = "Заметок нет"; body.append(e); return; }
        const grid = document.createElement("div"); grid.className = "notes"; grid.dataset.field = f.id;
        const hasPinned = list.some((n) => !!n.pinned), hasOther = list.some((n) => !n.pinned);
        list.forEach((n, i) => {
          if (hasPinned && hasOther && !n.pinned && list[i - 1] && list[i - 1].pinned) { const sep = document.createElement("div"); sep.className = "notes-sep"; sep.setAttribute("role", "separator"); grid.append(sep); }
          grid.append(noteCard(n, manual));
        });
        body.append(grid);
      },
      count: (f) => state.items.filter((it) => it.type === "note" && it.section_id === f.id).length,
    },
    tasks: {
      name: "Задачи", icon: IC.task, spans: [1, 2, 3], addTip: "Новая задача",
      limit: 100, limitTip: "В поле уже 100 задач — это предел. Удалите ненужные или создайте ещё одно поле «Задачи»",
      add: (f) => { const i = $("board").querySelector('.fld[data-id="' + f.id + '"] .tk-input'); if (i) { i.scrollIntoView({ block: "nearest" }); i.focus(); } },
      render: (f, body) => renderTasks(f, body),
      // в заголовке — сколько осталось сделать; предел считает все задачи поля
      count: (f) => state.items.filter((it) => it.type === "task" && it.section_id === f.id && !it.done).length,
      total: (f) => state.items.filter((it) => it.type === "task" && it.section_id === f.id).length,
    },
  };
  const APP_ORDER = ["notes", "tasks"];

  /* ---------- Приложение «Задачи» ----------
     Задача — запись items (type "task"): title — название, body — описание, done/done_at — выполнена,
     data: { due (ISO), allday, remind (минут до срока или null), repeat (day|weekdays|week|month), prio, subs: [{t, done}], tz },
     remind_at — когда прислать напоминание в Telegram (считается из срока и remind). */
  const TASK_LIM = { field: 100, title: 200, body: 1000, subs: 30, sub: 200 };
  const REMINDS = [[null, "Нет"], [0, "В срок"], [15, "За 15 мин"], [60, "За час"], [1440, "За день"]];
  const REPEATS = [[null, "Нет"], ["day", "День"], ["weekdays", "Будни"], ["week", "Неделя"], ["month", "Месяц"]];
  const REPEAT_TXT = { day: "каждый день", weekdays: "по будням", week: "каждую неделю", month: "каждый месяц" };
  const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { return ""; } })();
  const tData = (t) => t.data || {};
  const taskDue = (t) => (tData(t).due ? new Date(tData(t).due) : null);
  function remindAtFor(dueIso, allday, remind) {
    if (!dueIso || remind == null) return null;
    const base = new Date(dueIso);
    if (allday) base.setHours(9, 0, 0, 0); // задача «на день» — напоминание в 9 утра
    return new Date(base.getTime() - remind * 60000).toISOString();
  }
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  function stepRepeat(d, rep) {
    if (rep === "day") return addDays(d, 1);
    if (rep === "week") return addDays(d, 7);
    if (rep === "weekdays") { let x = addDays(d, 1); while (x.getDay() === 0 || x.getDay() === 6) x = addDays(x, 1); return x; }
    if (rep === "month") { const x = new Date(d), day = x.getDate(); x.setDate(1); x.setMonth(x.getMonth() + 1); x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); return x; }
    return null;
  }
  // следующий раз для повторяющейся задачи: от срока вперёд, но не в прошлое
  function nextDue(t) {
    const dt = tData(t);
    let d = taskDue(t) || new Date();
    const now = new Date(), today = dayKey(now);
    let guard = 0;
    do { d = stepRepeat(d, dt.repeat); guard++; } while (guard < 1000 && (dt.allday ? dayKey(d) < today : d <= now));
    return d;
  }
  // в какую группу попадает задача
  function taskGroup(t, now = new Date()) {
    const d = taskDue(t);
    if (!d) return "none";
    const k = dayKey(d), today = dayKey(now);
    if (tData(t).allday ? k < today : d < now) return "over";
    if (k === today) return "today";
    if (k === dayKey(addDays(now, 1))) return "tomorrow";
    return "later";
  }
  const TASK_GROUPS = [["over", "Просрочено"], ["today", "Сегодня"], ["tomorrow", "Завтра"], ["later", "Позже"], ["none", "Без срока"]];
  const fmtWdDate = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "short" });
  const fmtWdDateY = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  // «сегодня 15:00», «завтра», «вчера», «пт, 14 нояб.»
  function dueLabel(iso, allday) {
    const d = new Date(iso), now = new Date(), k = dayKey(d);
    let day = k === dayKey(now) ? "сегодня" : k === dayKey(addDays(now, 1)) ? "завтра" : k === dayKey(addDays(now, -1)) ? "вчера"
      : (d.getFullYear() === now.getFullYear() ? fmtWdDate : fmtWdDateY).format(d).replace(" г.", "");
    return allday ? day : day + " " + fmtHM.format(d);
  }

  /* Быстрый ввод: срок, повтор и важность — прямо словами в строке задачи.
     «Позвонить в банк завтра в 15:00» → задача «Позвонить в банк», срок завтра 15:00 */
  const WD = { "понедельник": 1, "пн": 1, "вторник": 2, "вт": 2, "среду": 3, "среда": 3, "ср": 3, "четверг": 4, "чт": 4, "пятницу": 5, "пятница": 5, "пт": 5, "субботу": 6, "суббота": 6, "сб": 6, "воскресенье": 0, "вс": 0 };
  const MON = { "января": 0, "февраля": 1, "марта": 2, "апреля": 3, "мая": 4, "июня": 5, "июля": 6, "августа": 7, "сентября": 8, "октября": 9, "ноября": 10, "декабря": 11 };
  function parseTask(src) {
    let s = " " + src.replace(/\s+/g, " ") + " ";
    const now = new Date();
    let day = null, time = null, abs = null, repeat = null, prio = false;
    const B = "(?<=\\s)", E = "(?=[\\s,.;])";
    const take = (re, fn) => { s = s.replace(new RegExp(B + re + E, "i"), (...m) => { fn(m); return " "; }); };
    take("!{1,3}", () => (prio = true));
    take("(?:важн(?:ое|ая|о))", () => (prio = true));
    take("(?:каждый день|ежедневно)", () => (repeat = "day"));
    take("(?:по будням|каждый будний день)", () => (repeat = "weekdays"));
    take("(?:каждую неделю|еженедельно)", () => (repeat = "week"));
    take("(?:каждый месяц|ежемесячно)", () => (repeat = "month"));
    take("кажд(?:ый|ую|ое) (понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)", (m) => { repeat = "week"; const w = WD[m[1].toLowerCase()]; day = addDays(now, ((w - now.getDay() + 7) % 7) || 0); });
    take("через (полчаса|час|(\\d{1,3}) ?(мин(?:ут[уы]?)?|час(?:а|ов)?|д(?:ень|ня|ней)|недел(?:ю|и|ь)))", (m) => {
      if (m[1] === "полчаса") abs = new Date(now.getTime() + 30 * 60000);
      else if (m[1] === "час") abs = new Date(now.getTime() + 3600000);
      else {
        const n = Number(m[2]), u = m[3].toLowerCase();
        if (u.startsWith("мин")) abs = new Date(now.getTime() + n * 60000);
        else if (u.startsWith("час")) abs = new Date(now.getTime() + n * 3600000);
        else if (u.startsWith("д")) day = addDays(now, n);
        else day = addDays(now, n * 7);
      }
    });
    take("(?:на )?(сегодня|послезавтра|завтра)", (m) => { const w = m[1].toLowerCase(); day = addDays(now, w === "сегодня" ? 0 : w === "завтра" ? 1 : 2); });
    take("(?:(?:в|во|к) )?(понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье|пн|вт|ср|чт|пт|сб|вс)", (m) => { const w = WD[m[1].toLowerCase()]; day = addDays(now, ((w - now.getDay() + 7) % 7) || 7); });
    take("(\\d{1,2})\\.(\\d{1,2})(?:\\.(\\d{2,4}))?", (m) => {
      const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : now.getFullYear();
      let d = new Date(y, Number(m[2]) - 1, Number(m[1]));
      if (!m[3] && dayKey(d) < dayKey(now)) d = new Date(y + 1, Number(m[2]) - 1, Number(m[1]));
      if (d.getMonth() === Number(m[2]) - 1) day = d;
    });
    take("(\\d{1,2}) (января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)", (m) => {
      const mo = MON[m[2].toLowerCase()];
      let d = new Date(now.getFullYear(), mo, Number(m[1]));
      if (dayKey(d) < dayKey(now)) d = new Date(now.getFullYear() + 1, mo, Number(m[1]));
      if (d.getMonth() === mo) day = d;
    });
    const setTime = (h, mi, part) => {
      h = Number(h); mi = Number(mi || 0);
      if (part) { part = part.toLowerCase(); if ((part === "дня" || part === "вечера") && h < 12) h += 12; if (part === "ночи" && h === 12) h = 0; }
      if (h < 24 && mi < 60) time = [h, mi];
    };
    take("(?:(?:в|к) )?(\\d{1,2}):(\\d{2})(?: (утра|дня|вечера|ночи))?", (m) => setTime(m[1], m[2], m[3]));
    if (!time) take("(?:в|к) (\\d{1,2})(?: ?ч(?:ас(?:а|ов)?)?)?(?: (утра|дня|вечера|ночи))?", (m) => setTime(m[1], 0, m[2]));
    if (!time) take("(\\d{1,2}) ?ч", (m) => setTime(m[1], 0));
    let due = null, allday = false;
    if (abs) due = abs;
    else if (day || time) {
      const d = new Date(day || now);
      if (time) {
        d.setHours(time[0], time[1], 0, 0);
        if (!day && d <= now) d.setDate(d.getDate() + 1); // только время и оно прошло — значит завтра
      } else { d.setHours(0, 0, 0, 0); allday = true; }
      due = d;
    } else if (repeat) { due = new Date(now); due.setHours(0, 0, 0, 0); allday = true; }
    const title = s.replace(/\s+/g, " ").replace(/\s+([,.;])/g, "$1").replace(/^[\s,.;-]+|[\s,;-]+$/g, "").trim();
    return { title: title || src.trim(), due: due ? due.toISOString() : null, allday, repeat, prio };
  }

  // строка задачи
  const seenTasks = new Set();
  function taskRow(t, opts) {
    const dt = tData(t);
    const li = document.createElement("li");
    li.className = "tk" + (t.done ? " is-done" : "") + (dt.prio && !t.done ? " prio" : "");
    li.dataset.id = t.id; li.tabIndex = 0; li.setAttribute("aria-label", "Задача «" + t.title + "»");
    if (!seenTasks.has(t.id)) { seenTasks.add(t.id); if (!boardFirst) li.classList.add("fade-in"); }
    if (!t.done && opts.drag) { const g = gripBtn("Задача «" + t.title + "»"); g.classList.add("tk-grip"); li.append(g); }
    const cb = document.createElement("button");
    cb.type = "button"; cb.className = "tk-check"; cb.setAttribute("role", "checkbox"); cb.setAttribute("aria-checked", String(!!t.done));
    cb.setAttribute("aria-label", t.done ? "Вернуть в работу" : "Выполнено"); cb.dataset.tip = t.done ? "Вернуть в работу" : dt.repeat ? "Выполнено — следующий раз " + REPEAT_TXT[dt.repeat] : "Выполнено";
    cb.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    cb.addEventListener("click", (e) => { e.stopPropagation(); toggleTask(t, li); });
    const main = document.createElement("div"); main.className = "tk-main";
    const title = document.createElement("div"); title.className = "tk-title"; title.textContent = t.title; main.append(title);
    const meta = document.createElement("div"); meta.className = "tk-meta";
    const ic = (path, tip) => { const s = document.createElement("span"); s.className = "tk-ic"; s.dataset.tip = tip; s.innerHTML = svgIco(path, 12, 2); return s; };
    if (dt.due && !t.done) {
      const d = document.createElement("span"); d.className = "tk-due" + (taskGroup(t) === "over" ? " over" : "");
      d.textContent = dueLabel(dt.due, dt.allday); meta.append(d);
    }
    if (t.done && t.done_at) { const d = document.createElement("span"); d.className = "tk-due"; d.textContent = "выполнено " + dueLabel(t.done_at, true); meta.append(d); }
    if (!t.done && dt.remind != null && dt.due) meta.append(ic("M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4", "Напоминание в Telegram"));
    if (dt.repeat) meta.append(ic("M17 2l4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3", "Повтор: " + REPEAT_TXT[dt.repeat]));
    const subs = dt.subs || [];
    if (subs.length) { const s = document.createElement("span"); s.className = "tk-subs" + (subs.every((x) => x.done) ? " full" : ""); s.textContent = subs.filter((x) => x.done).length + "/" + subs.length; s.dataset.tip = "Подпункты"; meta.append(s); }
    if ((t.body || "").trim()) meta.append(ic("M5 7h14M5 12h14M5 17h9", "Есть описание"));
    if (meta.childNodes.length) main.append(meta);
    li.append(cb, main);
    // при наведении: срок и удалить
    const acts = document.createElement("div"); acts.className = "tk-acts";
    const mk = (tip, path, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = "tool"; b.dataset.tip = tip; b.setAttribute("aria-label", tip); b.innerHTML = svgIco(path, 15); b.addEventListener("click", (e) => { e.stopPropagation(); fn(b); }); return b; };
    if (!t.done) acts.append(mk("Срок", "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4", (b) => openTaskDue(b, t)));
    acts.append(mk("Удалить", "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3", () => removeItem(t.id, "Задача удалена")));
    li.append(acts);
    li.addEventListener("click", (e) => { if (e.target.closest(".tk-acts, .tk-check, .grip")) return; openItem(t.id); });
    li.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === li) openItem(t.id); else if (e.key === " " && e.target === li) { e.preventDefault(); toggleTask(t, li); } });
    return li;
  }

  // галочка: обычная задача — в «Выполнено»; повторяющаяся — переезжает на следующий срок
  async function toggleTask(t, li) {
    const dt = tData(t);
    if (!t.done && dt.repeat && dt.due) {
      const nd = nextDue(t), iso = nd.toISOString();
      if (li) li.classList.add("checking");
      const subs = (dt.subs || []).map((x) => ({ t: x.t, done: false })); // подпункты на новый круг — снова пустые
      const data = Object.assign({}, dt, { due: iso, subs });
      setTimeout(async () => {
        if (await patchItem(t.id, { data, remind_at: remindAtFor(iso, dt.allday, dt.remind) })) toast("Следующий раз — " + dueLabel(iso, dt.allday));
      }, li ? 260 : 0);
      return;
    }
    if (li && !t.done) { li.classList.add("checking"); await new Promise((r) => setTimeout(r, 260)); }
    patchItem(t.id, { done: !t.done });
  }

  // быстрый выбор срока с карточки
  const tdPop = document.createElement("div");
  tdPop.className = "pop menu-pop task-due-pop"; tdPop.hidden = true; tdPop.setAttribute("role", "menu");
  document.body.append(tdPop);
  let tdFor = null, tdAt = 0;
  function closeTdPop() { if (!tdPop.hidden) animHide(tdPop, 120); tdFor = null; }
  function openTaskDue(btn, t) {
    if (!tdPop.hidden && tdFor === t.id) { closeTdPop(); return; }
    closeMenus(null); closeTdPop(); tdFor = t.id; tdAt = Date.now(); tdPop.textContent = "";
    const dt = tData(t), now = new Date();
    const keepTime = (d) => { // переносим день, время остаётся прежним (если было)
      const x = new Date(d);
      if (dt.due && !dt.allday) { const o = new Date(dt.due); x.setHours(o.getHours(), o.getMinutes(), 0, 0); return { due: x.toISOString(), allday: false }; }
      x.setHours(0, 0, 0, 0); return { due: x.toISOString(), allday: true };
    };
    const nextMon = addDays(now, ((8 - now.getDay()) % 7) || 7);
    const opts = [
      ["Сегодня", () => keepTime(now), "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2"],
      ["Завтра", () => keepTime(addDays(now, 1)), "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"],
      ["Следующий понедельник", () => keepTime(nextMon), "M9 6l6 6-6 6"],
      ["Без срока", () => ({ due: null, allday: false }), "M6 6l12 12M18 6 6 18"],
    ];
    opts.forEach(([label, fn, path]) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "menu-item"; b.setAttribute("role", "menuitem");
      b.innerHTML = svgIco(path, 16); b.append(document.createTextNode(label));
      b.addEventListener("click", (e) => {
        e.stopPropagation(); closeTdPop();
        const v = fn(), data = Object.assign({}, dt, v);
        if (!v.due) { data.repeat = null; }
        patchItem(t.id, { data, remind_at: remindAtFor(v.due, v.allday, dt.remind) });
      });
      tdPop.append(b);
    });
    const more = document.createElement("button"); more.type = "button"; more.className = "menu-item"; more.setAttribute("role", "menuitem");
    more.innerHTML = svgIco("M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M9 15h6", 16); more.append(document.createTextNode("Выбрать дату и время…"));
    more.addEventListener("click", (e) => { e.stopPropagation(); closeTdPop(); openItem(t.id); });
    tdPop.append(more);
    animShow(tdPop);
    const r = btn.getBoundingClientRect(), w = tdPop.offsetWidth, hh = tdPop.offsetHeight, m = 8;
    let x = Math.min(Math.max(m, r.right - w), window.innerWidth - w - m), y = r.bottom + 4;
    if (y + hh > window.innerHeight - m) y = r.top - 4 - hh;
    tdPop.style.left = x + "px"; tdPop.style.top = Math.max(m, y) + "px";
  }
  document.addEventListener("click", (e) => { if (!tdPop.hidden && !e.composedPath().includes(tdPop)) closeTdPop(); });
  window.addEventListener("scroll", () => { if (!tdPop.hidden && Date.now() - tdAt > 400) closeTdPop(); }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !tdPop.hidden) { e.stopImmediatePropagation(); closeTdPop(); } }, true);

  // поле «Задачи»: строка ввода, группы по срокам, свёрнутый блок «Выполнено»
  const doneOpen = (fid) => store.get("cloudesk-done-" + fid) === "1";
  function renderTasks(f, body) {
    const all = state.items.filter((it) => it.type === "task" && it.section_id === f.id);
    const wrap = document.createElement("div"); wrap.className = "tasks"; wrap.dataset.field = f.id;
    // строка ввода
    const form = document.createElement("form"); form.className = "tk-add";
    const plus = document.createElement("span"); plus.className = "tk-add-ico"; plus.innerHTML = svgIco(IC.plus, 16, 2);
    const inp = document.createElement("input"); inp.type = "text"; inp.className = "tk-input"; inp.maxLength = TASK_LIM.title + 60;
    inp.placeholder = "Новая задача"; inp.setAttribute("aria-label", "Новая задача: можно сразу написать срок, например «завтра в 15:00»"); inp.autocomplete = "off";
    inp.dataset.tip = "Срок можно написать словами: «завтра в 15:00», «в пятницу», «через 2 часа», «каждый день». «!» — важная";
    const hint = document.createElement("div"); hint.className = "tk-hint"; hint.hidden = true;
    const full = all.length >= TASK_LIM.field;
    if (full) { inp.disabled = true; inp.placeholder = "В поле уже " + TASK_LIM.field + " задач — это предел"; }
    const showHint = () => {
      const v = inp.value.trim();
      if (!v) { hint.hidden = true; return; }
      const p = parseTask(v), parts = [];
      if (p.due) parts.push(dueLabel(p.due, p.allday));
      if (p.repeat) parts.push(REPEAT_TXT[p.repeat]);
      if (p.prio) parts.push("важная");
      hint.textContent = parts.length ? parts.join(" · ") : "";
      hint.hidden = !parts.length;
    };
    inp.addEventListener("input", showHint);
    inp.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); inp.value = ""; showHint(); inp.blur(); } });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = inp.value.trim();
      if (!v) return;
      const p = parseTask(v);
      inp.value = ""; showHint();
      const minPos = all.reduce((m, x) => Math.min(m, x.position), 0);
      const data = { due: p.due, allday: p.allday, remind: p.due && !p.allday ? 0 : null, repeat: p.repeat, prio: p.prio, subs: [], tz: TZ };
      const r = await createItem({ type: "task", section_id: f.id, position: minPos - 1, title: p.title.slice(0, TASK_LIM.title), body: "", data, remind_at: remindAtFor(data.due, data.allday, data.remind) });
      if (!r) { inp.value = v; showHint(); }
    });
    form.append(plus, inp);
    wrap.append(form, hint);
    // группы
    const live = all.filter((t) => !t.done);
    const now = new Date();
    const byGroup = {};
    live.forEach((t) => { const g = taskGroup(t, now); (byGroup[g] = byGroup[g] || []).push(t); });
    TASK_GROUPS.forEach(([g, name]) => {
      const list = (byGroup[g] || []).sort((a, b) => (!!tData(b).prio - !!tData(a).prio) || a.position - b.position);
      if (!list.length) return;
      const sec = document.createElement("section"); sec.className = "tk-grp"; sec.dataset.g = g;
      const h = document.createElement("div"); h.className = "tk-gh" + (g === "over" ? " over" : "");
      h.append(name); const c = document.createElement("span"); c.className = "tk-gc"; c.textContent = list.length; h.append(c);
      const ol = document.createElement("ol"); ol.className = "tk-list"; ol.dataset.g = g;
      list.forEach((t) => ol.append(taskRow(t, { drag: true })));
      sec.append(h, ol); wrap.append(sec);
    });
    const done = all.filter((t) => t.done).sort((a, b) => new Date(b.done_at || b.updated_at) - new Date(a.done_at || a.updated_at));
    if (!live.length) {
      const e = document.createElement("div"); e.className = "tk-empty";
      e.textContent = done.length ? "Всё сделано" : "Задач нет";
      wrap.append(e);
    }
    if (done.length) {
      const sec = document.createElement("section"); sec.className = "tk-grp tk-done";
      const open = doneOpen(f.id);
      const h = document.createElement("button"); h.type = "button"; h.className = "tk-gh tk-done-btn"; h.setAttribute("aria-expanded", String(open));
      h.innerHTML = svgIco("M9 6l6 6-6 6", 14, 2); h.append("Выполнено"); const c = document.createElement("span"); c.className = "tk-gc"; c.textContent = done.length; h.append(c);
      const ol = document.createElement("ol"); ol.className = "tk-list done-list"; ol.hidden = !open;
      if (open) done.forEach((t) => ol.append(taskRow(t, { drag: false })));
      h.addEventListener("click", () => { store.set("cloudesk-done-" + f.id, open ? "0" : "1"); renderBoard(); });
      sec.append(h, ol); wrap.append(sec);
    }
    body.append(wrap);
  }
  // порядок внутри группы — перетаскиванием (между группами задачи не переносятся: группа зависит от срока)
  async function saveTaskOrder(ol) {
    const ops = [];
    [...ol.querySelectorAll(":scope > .tk")].forEach((el, i) => {
      const it = state.items.find((x) => x.id === el.dataset.id);
      if (!it || it.position === i) return;
      it.position = i;
      ops.push(sb.from("items").update({ position: i }).eq("id", it.id));
    });
    renderBoard();
    const res = await Promise.all(ops);
    if (res.some((r) => r.error)) { toast("Порядок не сохранился — проверьте интернет."); loadItems(); }
  }
  let tkDragFrom = null;
  $("board").addEventListener("pointerdown", (e) => { const g = e.target.closest && e.target.closest(".tk-grip"); tkDragFrom = g ? g.closest(".tk-list") : null; }, true);
  sortable($("board"), {
    item: ".tk:not(.is-done)", handle: ".tk-grip", list: ".tk-list:not(.done-list)",
    onDrop: (el) => {
      const ol = el.closest(".tk-list");
      if (tkDragFrom && ol !== tkDragFrom) { renderBoard(); toast("Задача попадает в группу по сроку — поменяйте срок, чтобы перенести"); return; }
      saveTaskOrder(ol);
    },
    onKey: (el, dir) => {
      const sib = dir < 0 ? el.previousElementSibling : el.nextElementSibling;
      if (!sib || !sib.matches(".tk")) return;
      if (dir < 0) sib.before(el); else sib.after(el);
      const id = el.dataset.id; saveTaskOrder(el.closest(".tk-list"));
      const g = $("board").querySelector('.tk[data-id="' + id + '"] .tk-grip'); if (g) g.focus();
    },
  });
  // задача сама переходит из «Сегодня» в «Просрочено» (и т. п.) — проверяем раз в минуту
  let taskSig = "";
  setInterval(() => {
    if ($("desk").hidden || !state.items) return;
    const now = new Date();
    const sig = state.items.filter((t) => t.type === "task" && !t.done).map((t) => t.id + taskGroup(t, now)).join("|") + dayKey(now);
    if (taskSig && sig !== taskSig) renderBoard();
    taskSig = sig;
  }, 30000);

  /* Списки дел в заметке: строка «[ ] …» (или «[] …») — пункт; «[x] …» — отмеченный */
  const CL_RE = /^(\s*)(\[\s?\]|\[[xXхХ✓]\])\s?(.*)$/;
  // **жирный** и _курсив_ → узлы (только текст и <b>/<i>, без вставки чужого HTML)
  function inlineNodes(text) {
    const frag = document.createDocumentFragment();
    const re = /\*\*([^*]+)\*\*|_([^_]+)_/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) frag.append(text.slice(last, m.index));
      const el = document.createElement(m[1] != null ? "b" : "i");
      el.append(inlineNodes(m[1] != null ? m[1] : m[2]));
      frag.append(el);
      last = re.lastIndex;
    }
    if (last < text.length) frag.append(text.slice(last));
    return frag;
  }
  const stripMarks = (s) => (s || "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/_([^_]+)_/g, "$1").replace(/^\s*\[[ xXхХ✓]?\]\s?/gm, "");
  function parseLine(line) {
    const m = line.match(CL_RE);
    return m ? { check: true, done: /[xXхХ✓]/.test(m[2]), text: m[3] } : { check: false, text: line };
  }
  function checklistStat(body) {
    let all = 0, done = 0;
    (body || "").split("\n").forEach((l) => { const p = parseLine(l); if (p.check) { all++; if (p.done) done++; } });
    return { all, done };
  }
  function toggleLine(n, lineIdx) {
    const lines = (n.body || "").split("\n");
    const m = lines[lineIdx] && lines[lineIdx].match(CL_RE);
    if (!m) return;
    const done = /[xXхХ✓]/.test(m[2]);
    lines[lineIdx] = m[1] + (done ? "[ ]" : "[x]") + " " + m[3];
    patchItem(n.id, { body: lines.join("\n") });
  }

  const seenNotes = new Set();
  let boardFirst = true;
  // цвета заметок — те же, что у групп ссылок в меню
  const NOTE_COLORS = [["paper", "Без цвета"], ["sky", "Синий"], ["mint", "Зелёный"], ["sand", "Жёлтый"], ["rose", "Розовый"], ["violet", "Фиолетовый"], ["ink", "Серый"]];
  function noteCard(n, manual) {
    const el = document.createElement("div");
    el.className = "note"; el.dataset.color = n.color || "paper"; el.dataset.id = n.id;
    el.tabIndex = 0; el.setAttribute("role", "button"); el.setAttribute("aria-label", "Заметка «" + noteTitle(n) + "»");
    if (!seenNotes.has(n.id)) { seenNotes.add(n.id); if (!boardFirst) el.classList.add("fade-in"); }
    // заголовок
    const head = document.createElement("div"); head.className = "note-head";
    const h = document.createElement("p"); h.className = "note-title"; h.textContent = noteTitle(n); head.append(h);
    if (n.pinned) { const pin = document.createElement("span"); pin.className = "note-pin"; pin.setAttribute("aria-label", "Закреплена"); pin.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="' + IC.pin + '"/></svg>'; head.append(pin); }
    el.append(head);
    // текст: до 3 строк; пункты списка — с галочками, которые ставятся прямо здесь
    const body = document.createElement("div"); body.className = "note-body";
    const lines = (n.body || "").split("\n");
    let shown = 0;
    for (let i = 0; i < lines.length && shown < 30; i++) { // всё по порядку; лишнее скроет высота карточки
      if (!lines[i].trim()) continue;
      const pl = parseLine(lines[i]);
      const row = document.createElement("div"); row.className = "note-line";
      if (pl.check) {
        row.classList.add("cl"); if (pl.done) row.classList.add("done");
        const cb = document.createElement("button"); cb.type = "button"; cb.className = "cl-box"; cb.setAttribute("role", "checkbox"); cb.setAttribute("aria-checked", String(pl.done));
        cb.setAttribute("aria-label", pl.text); cb.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
        const li = i; cb.addEventListener("click", (e) => { e.stopPropagation(); toggleLine(n, li); });
        const t = document.createElement("span"); t.append(inlineNodes(pl.text));
        row.append(cb, t);
      } else row.append(inlineNodes(lines[i]));
      body.append(row); shown++;
    }
    el.append(body);
    // низ: дата и прогресс списка — всегда на одной линии у всех карточек
    const foot = document.createElement("div"); foot.className = "note-foot";
    const meta = document.createElement("span"); meta.className = "note-meta"; meta.textContent = fmtShort.format(new Date(n.edited_at || n.created_at)); foot.append(meta);
    const st = checklistStat(n.body);
    const nf = ((n.data && n.data.files) || []).length;
    if (nf) { const cl = document.createElement("span"); cl.className = "note-files"; cl.dataset.tip = "Файлов: " + nf; cl.innerHTML = svgIco("M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9", 12); cl.append(String(nf)); foot.append(cl); }
    if (st.all) { const pr = document.createElement("span"); pr.className = "note-prog" + (st.done === st.all ? " full" : ""); pr.textContent = st.done + "/" + st.all; pr.dataset.tip = "Сделано пунктов"; foot.append(pr); }
    el.append(foot);
    // действия при наведении: закрепить, цвет, удалить
    const acts = document.createElement("div"); acts.className = "note-acts";
    const mk = (tip, path, fn, cls) => { const b = document.createElement("button"); b.type = "button"; b.className = "tool" + (cls ? " " + cls : ""); b.dataset.tip = tip; b.setAttribute("aria-label", tip); b.innerHTML = svgIco(path, 15); b.addEventListener("click", (e) => { e.stopPropagation(); fn(b); }); return b; };
    const pinB = mk(n.pinned ? "Открепить" : "Закрепить", "M9 3h6l-1 6 4 4H6l4-4zM12 13v8", () => patchItem(n.id, { pinned: !n.pinned }));
    pinB.setAttribute("aria-pressed", String(!!n.pinned));
    acts.append(pinB,
      mk("Цвет", "M12 3a9 9 0 1 0 0 18c1 0 1.6-.7 1.6-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.4 1.5-1.4H16a5 5 0 0 0 5-5c0-4.3-4-7.9-9-7.9zM7.5 12h.01M9.5 7.5h.01M14.5 7.5h.01", (b) => openNoteColor(b, n)),
      mk("Удалить", "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3", () => removeItem(n.id, "Заметка удалена")));
    el.append(acts);
    if (manual) { const g = gripBtn("Заметка «" + noteTitle(n) + "»"); g.classList.add("note-grip"); head.prepend(g); }
    el.addEventListener("click", (e) => { if (e.target.closest(".note-acts, .cl-box, .grip")) return; openEditor(n.id); });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === el) openEditor(n.id); });
    return el;
  }
  // Если заметок мало, карточки растягиваются по высоте и заполняют поле; если много — 136 px и прокрутка
  const NOTE_MIN = 112; // два ряда (и линия закреплённых) помещаются в поле без прокрутки
  function fitNotes() {
    document.querySelectorAll(".fld .notes").forEach((grid) => {
      const body = grid.closest(".fld-body");
      const cards = grid.querySelectorAll(":scope > .note");
      if (!body || !cards.length) return;
      const cs = getComputedStyle(grid);
      const cols = cs.gridTemplateColumns.split(" ").filter(Boolean).length || 1;
      const gap = parseFloat(cs.rowGap) || 10;
      const pinned = grid.querySelectorAll(":scope > .note .note-pin").length;
      const rows = Math.ceil(pinned / cols) + Math.ceil((cards.length - pinned) / cols);
      const sep = grid.querySelector(".notes-sep") ? 1 + gap : 0;
      const bs = getComputedStyle(body);
      const avail = body.clientHeight - (parseFloat(bs.paddingTop) || 0) - (parseFloat(bs.paddingBottom) || 0);
      const h = Math.max(NOTE_MIN, Math.floor((avail - sep - gap * (rows - 1)) / rows));
      grid.style.setProperty("--note-h", h + "px");
    });
  }
  window.addEventListener("resize", () => requestAnimationFrame(fitNotes));

  // выбор цвета заметки прямо с карточки
  const ncPop = document.createElement("div");
  ncPop.className = "pop note-color-pop"; ncPop.hidden = true; ncPop.setAttribute("role", "radiogroup"); ncPop.setAttribute("aria-label", "Цвет заметки");
  document.body.append(ncPop);
  let ncFor = null;
  function openNoteColor(btn, n) {
    if (!ncPop.hidden && ncFor === n.id) { animHide(ncPop, 120); ncFor = null; return; }
    closeMenus(null); ncFor = n.id; ncAt = Date.now(); ncPop.textContent = "";
    NOTE_COLORS.forEach(([c, name]) => {
      const d = document.createElement("button"); d.type = "button"; d.className = "dot"; d.dataset.color = c; d.setAttribute("role", "radio");
      d.setAttribute("aria-checked", String((n.color || "paper") === c)); d.setAttribute("aria-label", name); d.dataset.tip = name;
      d.addEventListener("click", (e) => { e.stopPropagation(); animHide(ncPop, 120); ncFor = null; if ((n.color || "paper") !== c) patchItem(n.id, { color: c }); });
      ncPop.append(d);
    });
    animShow(ncPop);
    const r = btn.getBoundingClientRect(), w = ncPop.offsetWidth, hh = ncPop.offsetHeight, m = 8;
    let x = Math.min(Math.max(m, r.right - w), window.innerWidth - w - m), y = r.bottom + 4;
    if (y + hh > window.innerHeight - m) y = r.top - 4 - hh;
    ncPop.style.left = x + "px"; ncPop.style.top = Math.max(m, y) + "px";
  }
  document.addEventListener("click", (e) => { if (!ncPop.hidden && !e.composedPath().includes(ncPop)) { animHide(ncPop, 120); ncFor = null; } });
  let ncAt = 0; // прокрутка в первые мгновения после открытия (фокус, автопрокрутка) список не закрывает
  window.addEventListener("scroll", () => { if (!ncPop.hidden && Date.now() - ncAt > 400) { animHide(ncPop, 120); ncFor = null; } }, true);

  // свой порядок заметок: перетаскивание внутри поля
  async function saveNoteOrder(grid) {
    const ops = [];
    const fid = grid.dataset.field; // заметку можно перетащить и в другое поле «Заметки»
    [...grid.querySelectorAll(":scope > .note")].forEach((el, i) => {
      const it = state.items.find((x) => x.id === el.dataset.id);
      if (!it || (it.position === i && it.section_id === fid)) return;
      it.position = i; it.section_id = fid;
      ops.push(sb.from("items").update({ position: i, section_id: fid }).eq("id", it.id));
    });
    renderBoard();
    const res = await Promise.all(ops);
    if (res.some((r) => r.error)) { toast(res.some((r) => r.error && String(r.error.message).includes("notes_limit")) ? "В том поле уже 20 заметок." : "Порядок не сохранился — проверьте интернет."); loadItems(); }
  }
  sortable($("board"), {
    item: ".note", handle: ".note-grip", list: ".notes", grid: true,
    onDrop: (el) => saveNoteOrder(el.closest(".notes")),
    onKey: (el, dir) => {
      const sib = dir < 0 ? el.previousElementSibling : el.nextElementSibling;
      if (!sib || !sib.matches(".note")) return;
      if (dir < 0) sib.before(el); else sib.after(el);
      const id = el.dataset.id; saveNoteOrder(el.closest(".notes"));
      const g = $("board").querySelector('.note[data-id="' + id + '"] .note-grip'); if (g) g.focus();
    },
  });

  // Напоминания (окно «Время») и всё, у чего есть время (календарь, плашка в шапке, сигнал)
  function syncReminders() {
    state.reminders = state.items.filter((i) => i.type === "reminder" && i.remind_at)
      .map((i) => ({ id: i.id, text: i.title, remind_at: i.remind_at, sent_at: i.sent_at, failed_at: i.failed_at, error: i.error }));
  }
  function dueList() {
    return state.items.filter((i) => i.remind_at && !i.done && (i.type === "reminder" || i.type === "task"))
      .map((i) => ({ id: i.id, text: i.title, remind_at: i.remind_at, sent_at: i.sent_at, failed_at: i.failed_at, type: i.type }));
  }
  function itemsChanged() {
    syncReminders();
    renderBoard();
    if (typeof renderReminders === "function") renderReminders();
    if (!$("timesheet").hidden && timeTab === "cal") renderCal();
  }

  async function loadItems() {
    const [secs, items] = await Promise.all([
      sb.from("sections").select(SEC_COLS).is("deleted_at", null).order("position"),
      sb.from("items").select(ITEM_COLS).is("deleted_at", null).order("position"),
    ]);
    if (secs.error || items.error) { toast("Не удалось загрузить стол. Обновите страницу."); return false; }
    state.sections = secs.data || [];
    state.items = items.data || [];
    $("board-loading").hidden = true;
    itemsChanged();
    return true;
  }
  const nextPos = (secId) => state.items.filter((it) => it.section_id === secId).reduce((m, it) => Math.max(m, it.position), -1) + 1;
  const orderedFields = () => state.sections.filter((f) => f.desk_id === state.desk).sort((a, b) => a.position - b.position);

  function renderBoard() {
    const board = $("board");
    const keep = {};
    board.querySelectorAll(".fld").forEach((f) => { const b = f.querySelector(".fld-body"); if (b) keep[f.dataset.id] = b.scrollTop; });
    // строка ввода задачи не теряет фокус и набранный текст, когда стол перерисовывается
    const ae = document.activeElement;
    const keepIn = ae && ae.classList && ae.classList.contains("tk-input") ? { fid: ae.closest(".fld").dataset.id, v: ae.value, a: ae.selectionStart, b: ae.selectionEnd } : null;
    board.querySelectorAll(".fld, .fld-new").forEach((n) => n.remove());
    const frag = document.createDocumentFragment();
    for (const f of orderedFields()) {
      const app = APPS[f.app];
      const el = document.createElement("section");
      el.className = "fld"; el.dataset.id = f.id; el.dataset.span = String(f.span);
      const head = document.createElement("div"); head.className = "fld-head";
      const g = gripBtn("Поле «" + f.title + "»"); g.classList.add("fld-grip");
      // заголовок — название приложения, просто текст; настройки — значок, появляется при наведении
      const title = document.createElement("h2"); title.className = "fld-title";
      const tt = document.createElement("span"); tt.className = "fld-name"; tt.textContent = app ? app.name : "Поле";
      title.append(tt);
      const n = app && app.count ? app.count(f) : 0;
      const tot = app && app.total ? app.total(f) : n;
      if (n) { const cnt = document.createElement("span"); cnt.className = "count"; cnt.textContent = app && app.limit && tot >= app.limit * 0.8 ? tot + " / " + app.limit : String(n); title.append(cnt); }
      const set = document.createElement("button");
      set.type = "button"; set.className = "tool fld-set"; set.dataset.tip = "Настройки поля"; set.setAttribute("aria-label", "Настройки поля «" + tt.textContent + "»");
      set.innerHTML = svgIco(IC.set, 18);
      set.addEventListener("click", () => openField(f.id));
      head.append(g, title, set);
      if (app && app.add) {
        const add = document.createElement("button");
        add.type = "button"; add.className = "icon-primary fld-add";
        add.dataset.tip = app.addTip; add.setAttribute("aria-label", app.addTip);
        add.innerHTML = svgIco(IC.plus, 18, 2.2);
        // предел записей в поле: «+» бледнеет, подсказка и нажатие объясняют почему
        const full = app.limit && tot >= app.limit;
        if (full) { add.setAttribute("aria-disabled", "true"); add.classList.add("off"); add.dataset.tip = app.limitTip; }
        add.addEventListener("click", () => (full ? toast(app.limitTip) : app.add(f)));
        head.append(add);
      }
      const body = document.createElement("div"); body.className = "fld-body";
      if (app) app.render(f, body);
      else { const e = document.createElement("div"); e.className = "fld-empty"; e.textContent = "Приложение недоступно"; body.append(e); }
      el.append(head, body);
      frag.append(el);
      if (keep[f.id]) requestAnimationFrame(() => { body.scrollTop = keep[f.id]; });
    }
    const nb = document.createElement("button");
    nb.type = "button"; nb.className = "fld-new"; nb.dataset.tip = "Новое поле"; nb.setAttribute("aria-label", "Новое поле");
    nb.innerHTML = svgIco(IC.plus, 22, 2);
    nb.addEventListener("click", () => openField(null));
    frag.append(nb);
    board.append(frag);
    if (keepIn) {
      const i = board.querySelector('.fld[data-id="' + keepIn.fid + '"] .tk-input');
      if (i) { i.value = keepIn.v; i.focus({ preventScroll: true }); try { i.setSelectionRange(keepIn.a, keepIn.b); } catch (e) {} if (keepIn.v) i.dispatchEvent(new Event("input")); }
    }
    boardFirst = false;
    requestAnimationFrame(fitNotes);
  }

  /* Поля переставляются перетаскиванием за ручку ⋮⋮ */
  async function saveFieldOrder() {
    const ops = [];
    [...$("board").querySelectorAll(":scope > .fld")].forEach((el, i) => {
      const f = state.sections.find((x) => x.id === el.dataset.id);
      if (!f || f.position === i) return;
      f.position = i;
      ops.push(sb.from("sections").update({ position: i }).eq("id", f.id));
    });
    renderBoard();
    const res = await Promise.all(ops);
    if (res.some((r) => r.error)) { toast("Порядок не сохранился — проверьте интернет."); loadItems(); }
  }
  sortable($("board"), {
    item: ".fld", handle: ".fld-grip", list: "#board", grid: true,
    onDrop: () => saveFieldOrder(),
    onKey: (el, dir) => {
      const sib = dir < 0 ? el.previousElementSibling : el.nextElementSibling;
      if (!sib || !sib.matches(".fld")) return;
      if (dir < 0) sib.before(el); else sib.after(el);
      const id = el.dataset.id; saveFieldOrder();
      const g = $("board").querySelector('.fld[data-id="' + id + '"] .fld-grip'); if (g) g.focus();
    },
  });

  /* ---------- Окно поля: приложение, ширина, название, удаление ---------- */
  const fd = { id: null, app: "notes", span: 3, settings: {} };
  APP_ORDER.forEach((key) => {
    const a = APPS[key];
    const b = document.createElement("button");
    b.type = "button"; b.className = "app-tile"; b.setAttribute("role", "radio"); b.dataset.app = key;
    b.innerHTML = svgIco(a.icon, 22);
    const t = document.createElement("span"); t.textContent = a.name; b.append(t);
    const s = document.createElement("small"); s.textContent = a.spans.join(" или ") + " кол."; b.append(s);
    b.addEventListener("click", () => { fd.app = key; if (!a.spans.includes(fd.span)) fd.span = a.spans[a.spans.length - 1]; renderFieldForm(); });
    $("sec-apps").append(b);
  });
  document.querySelectorAll("#sec-span [data-span]").forEach((b) => b.addEventListener("click", () => { fd.span = Number(b.dataset.span); renderFieldForm(); }));
  function renderFieldForm() {
    const a = APPS[fd.app];
    const box = $("sec-opts"); box.textContent = "";
    ((a && a.opts) || []).forEach((o) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "switch-row"; b.setAttribute("role", "switch"); b.setAttribute("aria-checked", String(!!fd.settings[o.key]));
      b.innerHTML = '<span></span><span class="switch" aria-hidden="true"></span>'; b.firstChild.textContent = o.label;
      b.addEventListener("click", () => { fd.settings = Object.assign({}, fd.settings, { [o.key]: !fd.settings[o.key] }); renderFieldForm(); });
      box.append(b);
    });
    $("sec-opts-h").hidden = !box.children.length;
    document.querySelectorAll("#sec-apps .app-tile").forEach((b) => {
      b.setAttribute("aria-checked", String(b.dataset.app === fd.app));
      b.disabled = !!fd.id && b.dataset.app !== fd.app; // приложение выбирается только при создании
    });
    document.querySelectorAll("#sec-span [data-span]").forEach((b) => {
      const n = Number(b.dataset.span), ok = !!a && a.spans.includes(n);
      b.disabled = !ok;
      b.dataset.tip = ok ? "" : (a ? a.name + ": только " + a.spans.join(" или ") + " кол." : "");
      if (!b.dataset.tip) delete b.dataset.tip;
      b.setAttribute("aria-checked", String(n === fd.span));
    });
  }
  function openField(id) {
    closeMenus(null);
    const f = id ? state.sections.find((x) => x.id === id) : null;
    fd.id = f ? f.id : null; fd.app = f ? f.app : APP_ORDER[0];
    const a = APPS[fd.app];
    fd.span = f ? f.span : a.spans[a.spans.length - 1];
    fd.settings = Object.assign({}, (f && f.settings) || {});
    $("sec-h").textContent = f ? "Поле: " + (APPS[f.app] ? APPS[f.app].name : "") : "Новое поле";
    $("sec-status").textContent = "";
    $("sec-delete").hidden = !f;
    $("sec-confirm").hidden = true; $("sec-actions").hidden = false;
    renderFieldForm();
    animShow($("secsheet"));
    lockSheets(true);
  }
  let fldClosing = false, fldCancel = false;
  async function closeField() {
    if (fldClosing) return;
    fldClosing = true;
    try {
      const f = fd.id ? state.sections.find((x) => x.id === fd.id) : null;
      const a = APPS[fd.app];
      const title = (a ? a.name : "Поле").slice(0, 40); // поле называется по приложению
      if (!f) {
        $("sec-status").textContent = "Сохраняю…";
        const pos = orderedFields().reduce((m, x) => Math.max(m, x.position), -1) + 1;
        const r = await sb.from("sections").insert({ title, app: fd.app, span: fd.span, position: pos, settings: fd.settings, desk_id: state.desk }).select(SEC_COLS).single();
        if (r.error) { $("sec-status").textContent = String(r.error.message).includes("sections_limit") ? "Не больше 30 полей на одном столе" : "Не сохранилось — проверьте интернет"; return; }
        state.sections.push(r.data);
        renderBoard();
      } else {
        const patch = {};
        if (fd.span !== f.span) patch.span = fd.span;
        if (JSON.stringify(fd.settings) !== JSON.stringify(f.settings || {})) patch.settings = fd.settings;
        if (Object.keys(patch).length) {
          $("sec-status").textContent = "Сохраняю…";
          const { error } = await sb.from("sections").update(patch).eq("id", f.id);
          if (error) { $("sec-status").textContent = "Не сохранилось — проверьте интернет"; return; }
          Object.assign(f, patch);
          renderBoard();
        }
      }
      $("sec-status").textContent = "";
      animHide($("secsheet"), 170);
      lockSheets(false);
    } finally { fldClosing = false; }
  }
  $("secsheet").querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeField));
  $("secsheet").querySelector("[data-cancel]").addEventListener("click", () => { closeMenus(null); animHide($("secsheet"), 170); lockSheets(false); });
  $("sec-delete").addEventListener("click", () => {
    const n = state.items.filter((it) => it.section_id === fd.id).length;
    $("sec-confirm-text").textContent = n ? "Удалить поле и " + n + " " + plural(n, "запись", "записи", "записей") + "?" : "Удалить поле?";
    $("sec-actions").hidden = true; $("sec-confirm").hidden = false; replay($("sec-confirm"));
  });
  $("sec-confirm-no").addEventListener("click", () => { $("sec-confirm").hidden = true; $("sec-actions").hidden = false; replay($("sec-actions")); });
  $("sec-confirm-yes").addEventListener("click", async () => {
    const id = fd.id;
    if (!id) return;
    $("sec-status").textContent = "Удаляю…";
    const mark = trashMark();
    const di = await sb.from("items").update(mark).eq("section_id", id).is("deleted_at", null);
    const del = di.error ? di : await sb.from("sections").update(mark).eq("id", id);
    if (del.error) { $("sec-status").textContent = "Не удалось — проверьте интернет"; return; }
    state.items = state.items.filter((it) => it.section_id !== id);
    state.sections = state.sections.filter((x) => x.id !== id);
    $("sec-status").textContent = "";
    animHide($("secsheet"), 170); lockSheets(false);
    itemsChanged();
    toast("Поле удалено", "Вернуть", () => restoreBatch(mark.deleted_batch));
  });

  async function createItem(row) {
    const r = await sb.from("items").insert(Object.assign({ position: row.section_id ? nextPos(row.section_id) : 0 }, row)).select(ITEM_COLS).single();
    if (r.error) { console.error(r.error); const m = String(r.error.message); toast(m.includes("items_limit") ? "Слишком много записей: удалите ненужные." : m.includes("tasks_limit") ? "В поле уже 100 задач — это предел." : "Не сохранилось — проверьте интернет."); return null; }
    state.items.push(r.data);
    itemsChanged();
    return r.data;
  }
  async function patchItem(id, patch) {
    const it = state.items.find((x) => x.id === id);
    if (!it) return false;
    const prev = Object.assign({}, it);
    Object.assign(it, patch);
    const r = await sb.from("items").update(patch).eq("id", id).select(ITEM_COLS).single();
    if (r.error) { console.error(r.error); Object.assign(it, prev); itemsChanged(); toast("Не сохранилось — проверьте интернет."); return false; }
    Object.assign(it, r.data);
    itemsChanged();
    return true;
  }
  // Удаление = в корзину (30 дней). label — что показать в уведомлении с «Вернуть»; без него — тихо
  async function removeItem(id, label) {
    const mark = trashMark();
    const { error } = await sb.from("items").update(mark).eq("id", id);
    if (error) { toast("Не удалось удалить. Попробуйте ещё раз."); return false; }
    state.items = state.items.filter((x) => x.id !== id);
    itemsChanged();
    if (label) toast(label, "Вернуть", () => restoreBatch(mark.deleted_batch));
    return true;
  }
  const newId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (Math.random() * 16) >> (c / 4)).toString(16)));
  function trashMark() { return { deleted_at: new Date().toISOString(), deleted_batch: newId() }; }
  const TRASH_TABLES = ["items", "sections", "links", "link_groups", "desks"];
  async function restoreBatch(batch) {
    // запись, чьё поле тоже в корзине, возвращается вместе с полем — иначе ей негде появиться
    const own = await sb.from("items").select("section_id").eq("deleted_batch", batch);
    const secIds = [...new Set(((own && own.data) || []).map((r) => r.section_id).filter(Boolean))];
    // и стол, на котором лежат возвращаемые поля и ссылки, если он тоже в корзине
    const [ps, pl, pg] = await Promise.all([
      secIds.length ? sb.from("sections").select("desk_id").in("id", secIds) : { data: [] },
      sb.from("sections").select("desk_id").eq("deleted_batch", batch),
      sb.from("links").select("desk_id").eq("deleted_batch", batch),
    ]);
    const pgr = await sb.from("link_groups").select("desk_id").eq("deleted_batch", batch);
    const deskIds = [...new Set([ps, pl, pg, pgr].flatMap((r) => (r && r.data) || []).map((r) => r.desk_id).filter(Boolean))];
    const dres = deskIds.length ? await sb.from("desks").update({ deleted_at: null, deleted_batch: null }).in("id", deskIds).not("deleted_at", "is", null) : {};
    if (secIds.length) await sb.from("sections").update({ deleted_at: null, deleted_batch: null }).in("id", secIds).not("deleted_at", "is", null);
    const res = await Promise.all(TRASH_TABLES.map((t) => sb.from(t).update({ deleted_at: null, deleted_batch: null }).eq("deleted_batch", batch)));
    res.push(dres);
    if (res.some((r) => r.error)) {
      const msg = res.map((r) => (r.error ? String(r.error.message) : "")).join(" ");
      toast(msg.includes("notes_limit") ? "Не вернуть: в поле уже 20 заметок. Освободите место."
        : msg.includes("tasks_limit") ? "Не вернуть: в поле уже 100 задач. Освободите место."
        : msg.includes("desks_limit") ? "Не вернуть: столов уже " + DESK_MAX + ". Удалите лишний."
        : "Не получилось вернуть — проверьте интернет.");
      return false;
    }
    if (await loadDesks()) { mergeSettings(); renderDeskTabs(); }
    await Promise.all([loadItems(), loadLinks()]);
    if (!$("setsheet").hidden) { if (!linksChanged()) prepareLinks(); if (!desksChanged()) prepareDesks(); renderTrash(); }
    return true;
  }

  /* ---------- Окно записи: задача и напоминание ---------- */
  const id_ = { id: null, type: "task", sec: null, date: "", time: "", done: false, remind: null, repeat: null, prio: false, subs: [] };
  let itDpMonth = new Date(); itDpMonth.setDate(1);
  function setItDate(v) {
    id_.date = v;
    if (!id_.time) $("it-time-label").textContent = id_.type === "task" && v ? "Весь день" : "Время";
    if (!v) { $("it-date-label").textContent = "Дата"; return; }
    const [y, m, d] = v.split("-").map(Number);
    $("it-date-label").textContent = v === dayKey(new Date()) ? "Сегодня" : fmtDay.format(new Date(y, m - 1, d));
    itDpMonth = new Date(y, m - 1, 1);
  }
  function setItTime(v) { id_.time = v; $("it-time-label").textContent = v || (id_.type === "task" && id_.date ? "Весь день" : "Время"); if (typeof renderItTask === "function") renderItTask(); }
  function renderItDP() {
    $("itdp-title").textContent = fmtMonth.format(itDpMonth).replace(" г.", "");
    const g = $("itdp-grid"); g.textContent = "";
    ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].forEach((d) => { const el = document.createElement("div"); el.className = "cal-dow"; el.textContent = d; g.append(el); });
    const start = new Date(itDpMonth); start.setDate(1 - ((itDpMonth.getDay() + 6) % 7));
    const today = dayKey(new Date());
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const k = dayKey(d);
      const b = document.createElement("button"); b.type = "button";
      b.className = "dp-day" + (d.getMonth() !== itDpMonth.getMonth() ? " other" : "") + (k === today ? " today" : "") + (k === id_.date ? " sel" : "");
      b.textContent = d.getDate(); b.disabled = k < today;
      b.addEventListener("click", () => { setItDate(k); if (!id_.time && id_.type !== "task") setItTime("09:00"); closeMenus(null); renderItTask(); });
      g.append(b);
    }
  }
  $("itdp-prev").addEventListener("click", () => { itDpMonth.setMonth(itDpMonth.getMonth() - 1); renderItDP(); replay($("itdp-grid")); });
  $("itdp-next").addEventListener("click", () => { itDpMonth.setMonth(itDpMonth.getMonth() + 1); renderItDP(); replay($("itdp-grid")); });
  $("it-date-btn").addEventListener("click", renderItDP);
  function renderItTP() {
    const [h, m] = (id_.time || "09:00").split(":");
    const mk = (box, vals, cur, onPick) => {
      box.textContent = "";
      vals.forEach((v) => { const b = document.createElement("button"); b.type = "button"; b.className = "tp-item" + (v === cur ? " sel" : ""); b.textContent = v; b.addEventListener("click", () => onPick(v)); box.append(b); });
      const sel = box.querySelector(".sel"); if (sel) box.scrollTop = sel.offsetTop - box.clientHeight / 2 + sel.clientHeight / 2;
    };
    const ensureDate = () => { if (!id_.date) setItDate(dayKey(new Date())); };
    mk($("ittp-hours"), Array.from({ length: 24 }, (_, i) => pad(i)), h, (v) => { ensureDate(); setItTime(v + ":" + m); renderItTP(); });
    mk($("ittp-mins"), Array.from({ length: 12 }, (_, i) => pad(i * 5)), m, (v) => { ensureDate(); setItTime(h + ":" + v); closeMenus(null); });
  }
  $("it-time-btn").addEventListener("click", () => setTimeout(renderItTP, 0));
  $("it-when-clear").addEventListener("click", () => {
    if (id_.type === "task" && id_.time) setItTime(""); // сначала убирается время — задача на весь день
    else { setItDate(""); setItTime(""); }
    renderItTask();
  });
  $("it-done").addEventListener("click", () => { id_.done = !id_.done; renderItTask(); });

  // окно задачи: напоминание, повтор, важная, подпункты
  // выбор из списка (свой, как в меню): строки одного вида, выбранная — с галочкой справа и жирная
  function pickList(box, list, cur, onPick) {
    box.textContent = "";
    list.forEach(([v, label]) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "menu-item"; b.setAttribute("role", "menuitemradio");
      b.setAttribute("aria-checked", String(v === cur));
      const t = document.createElement("span"); t.textContent = label;
      b.append(t); b.insertAdjacentHTML("beforeend", '<svg class="check" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7.5"/></svg>');
      b.addEventListener("click", (e) => { e.stopPropagation(); onPick(v); closeMenus(null); });
      box.append(b);
    });
  }
  const REMIND_FULL = [[null, "Не напоминать"], [0, "В срок"], [15, "За 15 минут"], [60, "За час"], [1440, "За день"]];
  const REPEAT_FULL = [[null, "Не повторять"], ["day", "Каждый день"], ["weekdays", "По будням"], ["week", "Каждую неделю"], ["month", "Каждый месяц"]];
  function renderItTask() {
    if (id_.type !== "task") return;
    const noDue = !id_.date;
    if (noDue) { id_.remind = null; id_.repeat = null; }
    // напоминание и повтор — «чипы» рядом со сроком: выключены — только значок, включены — значение
    const chip = (key, list, cur, onPick, tipOff) => {
      const btn = $("it-" + key + "-btn"), lab = $("it-" + key + "-label");
      const on = cur != null, item = list.find((x) => x[0] === cur);
      lab.textContent = on ? item[1] : ""; lab.hidden = !on;
      btn.classList.toggle("on", on); btn.classList.toggle("off", noDue);
      btn.dataset.tip = noDue ? "Сначала выберите дату" : on ? tipOff : tipOff;
      btn.setAttribute("aria-label", tipOff + (on ? ": " + item[1] : ""));
      if (noDue) btn.setAttribute("aria-disabled", "true"); else btn.removeAttribute("aria-disabled");
      pickList($("it-" + key + "-pop"), list, cur, onPick);
    };
    chip("remind", REMIND_FULL, id_.remind, (v) => { id_.remind = v; renderItTask(); }, id_.time ? "Напоминание в Telegram" : "Напоминание в Telegram (задача на весь день — в 9:00)");
    chip("repeat", REPEAT_FULL, id_.repeat, (v) => { id_.repeat = v; renderItTask(); }, "Повтор");
    $("it-prio").setAttribute("aria-pressed", String(id_.prio));
    $("it-prio").dataset.tip = id_.prio ? "Важная — снять отметку" : "Сделать важной — будет выше в своей группе";
    $("it-done").setAttribute("aria-pressed", String(id_.done));
    $("it-done").dataset.tip = id_.done ? "Вернуть в работу" : "Отметить выполненной";
    $("it-when-clear").dataset.tip = id_.time ? "Убрать время" : "Без срока";
    $("it-when-clear").setAttribute("aria-label", $("it-when-clear").dataset.tip);
    $("it-when-clear").disabled = !id_.date && !id_.time;
  }
  // без даты напоминание и повтор не открываются — подсказка объясняет почему
  ["it-remind-btn", "it-repeat-btn"].forEach((k) => $(k).addEventListener("click", (e) => {
    if (id_.date) return;
    e.stopImmediatePropagation(); closeMenus(null); toast("Сначала выберите дату");
  }, true));
  $("it-prio").addEventListener("click", () => { id_.prio = !id_.prio; renderItTask(); });
  // список открывается под чипом и не выходит за край окна: прижимается к той стороне, где есть место
  ["it-remind", "it-repeat"].forEach((k) => $(k + "-btn").addEventListener("click", () => {
    const pop = $(k + "-pop"); if (pop.hidden) return;
    pop.style.left = ""; pop.style.right = "";
    const sheet = pop.closest(".sheet").getBoundingClientRect(), r = pop.getBoundingClientRect();
    if (r.left < sheet.left + 8) { pop.style.left = "0"; pop.style.right = "auto"; }
  }));
  function renderSubs(focusIdx) {
    const ol = $("it-subs"); ol.textContent = "";
    id_.subs.forEach((x, i) => {
      const li = document.createElement("li"); li.className = "it-sub" + (x.done ? " done" : "");
      const cb = document.createElement("button"); cb.type = "button"; cb.className = "cl-box"; cb.setAttribute("role", "checkbox"); cb.setAttribute("aria-checked", String(!!x.done)); cb.setAttribute("aria-label", "Сделано");
      cb.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
      cb.addEventListener("click", () => { x.done = !x.done; renderSubs(); });
      const inp = document.createElement("input"); inp.type = "text"; inp.maxLength = TASK_LIM.sub; inp.value = x.t; inp.placeholder = "Подпункт"; inp.setAttribute("aria-label", "Подпункт " + (i + 1));
      inp.addEventListener("input", () => { x.t = inp.value; });
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); if (id_.subs.length < TASK_LIM.subs) { id_.subs.splice(i + 1, 0, { t: "", done: false }); renderSubs(i + 1); } }
        else if (e.key === "Backspace" && !inp.value) { e.preventDefault(); id_.subs.splice(i, 1); renderSubs(Math.max(0, i - 1)); }
      });
      const del = tool(P.x, "Убрать подпункт", () => { id_.subs.splice(i, 1); renderSubs(); });
      li.append(cb, inp, del);
      ol.append(li);
      if (focusIdx === i) setTimeout(() => { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }, 10);
    });
    const done = id_.subs.filter((x) => x.done).length;
    $("it-subs-count").textContent = id_.subs.length ? done + "/" + id_.subs.length : "";
    $("it-subs-box").hidden = !id_.subs.length;
    $("it-sub-add").disabled = id_.subs.length >= TASK_LIM.subs;
  }
  $("it-sub-add").addEventListener("click", () => { if (id_.subs.length >= TASK_LIM.subs) return; id_.subs.push({ t: "", done: false }); renderSubs(id_.subs.length - 1); });

  function openItem(id, type, secId) {
    closeMenus(null);
    const it = id ? state.items.find((x) => x.id === id) : null;
    id_.id = it ? it.id : null;
    id_.type = it ? it.type : type || "task";
    id_.sec = it ? it.section_id : secId || null;
    id_.done = !!(it && it.done);
    const isTask = id_.type === "task";
    $("it-h").textContent = (it ? "" : "Новое ") + (isTask ? (it ? "Задача" : "задача").replace(/^Новое з/, "Новая з") : (it ? "Напоминание" : "напоминание"));
    if (!it) $("it-h").textContent = isTask ? "Новая задача" : "Новое напоминание";
    $("it-title").placeholder = isTask ? "Задача" : "Напоминание";
    $("it-title").maxLength = isTask ? TASK_LIM.title : 500;
    $("it-title").value = it ? it.title : "";
    $("it-body").value = it ? it.body : "";
    $("it-body").hidden = !isTask;
    document.querySelectorAll("#itemsheet .it-ttool").forEach((b) => (b.hidden = !isTask));
    $("it-done").hidden = !isTask || !it;
    $("it-when-clear").hidden = !isTask;
    $("it-date-btn").closest(".it-when").dataset.tip = "";
    $("it-remind-f").hidden = !isTask; $("it-repeat-f").hidden = !isTask; $("it-subs-box").hidden = true;
    if (isTask) {
      const dt = it ? tData(it) : {};
      id_.remind = dt.remind ?? null; id_.repeat = dt.repeat || null; id_.prio = !!dt.prio;
      id_.subs = (dt.subs || []).map((x) => ({ t: x.t, done: !!x.done }));
      if (dt.due) { const d = new Date(dt.due); setItDate(dayKey(d)); setItTime(dt.allday ? "" : pad(d.getHours()) + ":" + pad(d.getMinutes())); }
      else { setItDate(""); setItTime(""); }
      renderSubs(); renderItTask();
    } else if (it && it.remind_at) { const d = new Date(it.remind_at); setItDate(dayKey(d)); setItTime(pad(d.getHours()) + ":" + pad(d.getMinutes())); }
    else { const d = new Date(Date.now() + 3600000); setItDate(dayKey(d)); setItTime(pad(d.getHours()) + ":00"); }
    $("it-status").textContent = it && it.sent_at ? "Отправлено в Telegram" : it && it.failed_at ? "Не доставлено" : "";
    $("it-delete").hidden = !it;
    $("it-confirm").hidden = true; $("it-actions").hidden = false;
    $("it-title").classList.remove("bad");
    animShow($("itemsheet"));
    lockSheets(true);
    setTimeout(() => $("it-title").focus(), 30);
  }
  let itClosing = false;
  async function closeItem() {
    if (itClosing) return;
    itClosing = true;
    try {
      closeMenus(null);
      const it = id_.id ? state.items.find((x) => x.id === id_.id) : null;
      const title = $("it-title").value.trim().slice(0, 500);
      const isTask = id_.type === "task";
      if (isTask) {
        if (!title) {
          if (!it) { animHide($("itemsheet"), 170); lockSheets(false); return; }
          $("it-title").classList.add("bad"); $("it-status").textContent = "Напишите название"; return;
        }
        const allday = !!id_.date && !id_.time;
        const due = id_.date ? new Date(id_.date + "T" + (id_.time || "00:00")).toISOString() : null;
        const old = it ? tData(it) : {};
        const subs = id_.subs.map((x) => ({ t: x.t.trim().slice(0, TASK_LIM.sub), done: !!x.done })).filter((x) => x.t);
        let data = Object.assign({}, old, { due, allday, remind: due ? id_.remind : null, repeat: due ? id_.repeat : null, prio: id_.prio, subs, tz: TZ });
        let done = id_.done, toastMsg = "";
        // повторяющаяся задача, отмеченная «Сделано», переезжает на следующий срок
        if (done && !(it && it.done) && data.repeat && due) {
          const nd = nextDue({ data }).toISOString();
          data = Object.assign({}, data, { due: nd, subs: subs.map((x) => ({ t: x.t, done: false })) });
          done = false; toastMsg = "Следующий раз — " + dueLabel(nd, allday);
        }
        let remind = remindAtFor(data.due, data.allday, data.remind);
        // напоминание, время которого уже прошло, не отправляем задним числом
        if (remind && new Date(remind).getTime() < Date.now() - 60000 && (!it || it.remind_at !== remind)) remind = null;
        const row = { title, body: $("it-body").value.slice(0, TASK_LIM.body), done, data, remind_at: remind };
        $("it-status").textContent = "Сохраняю…";
        let ok;
        if (it) {
          const patch = {};
          if (title !== it.title) patch.title = title;
          if (row.body !== (it.body || "")) patch.body = row.body;
          if (done !== !!it.done) patch.done = done;
          if (JSON.stringify(data) !== JSON.stringify(it.data || {})) patch.data = data;
          if ((remind || null) !== (it.remind_at ? new Date(it.remind_at).toISOString() : null)) patch.remind_at = remind;
          ok = Object.keys(patch).length ? await patchItem(it.id, patch) : true;
        } else {
          const sib = state.items.filter((x) => x.type === "task" && x.section_id === id_.sec);
          ok = !!(await createItem(Object.assign({ type: "task", section_id: id_.sec, position: sib.reduce((m, x) => Math.min(m, x.position), 0) - 1 }, row)));
        }
        if (!ok) { $("it-status").textContent = "Не сохранилось — проверьте интернет"; return; }
        $("it-status").textContent = "";
        animHide($("itemsheet"), 170);
        lockSheets(false);
        if (toastMsg) toast(toastMsg);
        return;
      }
      const when = id_.date && id_.time ? new Date(id_.date + "T" + id_.time) : null;
      if (!title) {
        if (!it) { animHide($("itemsheet"), 170); lockSheets(false); return; }
        $("it-title").classList.add("bad"); $("it-status").textContent = "Напишите название"; return;
      }
      if (!isTask && !when) { $("it-status").textContent = "Укажите дату и время"; return; }
      const remindIso = when ? when.toISOString() : null;
      const changedWhen = !it || (it.remind_at ? new Date(it.remind_at).getTime() : null) !== (when ? when.getTime() : null);
      if (when && changedWhen && when.getTime() < Date.now() - 60000 && !isTask) { $("it-status").textContent = "Это время уже прошло — выберите другое"; return; }
      const row = { title, remind_at: remindIso };
      if (isTask) { row.body = $("it-body").value; row.done = id_.done; }
      $("it-status").textContent = "Сохраняю…";
      let ok;
      if (it) {
        const patch = {};
        Object.keys(row).forEach((k) => { const a = row[k], b = it[k]; if (k === "remind_at" ? changedWhen : a !== b) patch[k] = a; });
        ok = Object.keys(patch).length ? await patchItem(it.id, patch) : true;
      } else ok = !!(await createItem(Object.assign({ type: id_.type, section_id: id_.sec }, row)));
      if (!ok) { $("it-status").textContent = "Не сохранилось — проверьте интернет"; return; }
      $("it-status").textContent = "";
      animHide($("itemsheet"), 170);
      lockSheets(false);
    } finally { itClosing = false; }
  }
  $("it-title").addEventListener("input", () => $("it-title").classList.remove("bad"));
  $("it-title").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); closeItem(); } });
  $("itemsheet").querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeItem));
  $("itemsheet").querySelector("[data-cancel]").addEventListener("click", () => { closeMenus(null); animHide($("itemsheet"), 170); lockSheets(false); });
  $("it-delete").addEventListener("click", async () => {
    if (id_.id && await removeItem(id_.id, id_.type === "task" ? "Задача удалена" : "Напоминание удалено")) { animHide($("itemsheet"), 170); lockSheets(false); }
  });
  $("it-confirm-no").addEventListener("click", () => { $("it-confirm").hidden = true; $("it-actions").hidden = false; replay($("it-actions")); });
  $("it-confirm-yes").addEventListener("click", async () => {
    if (id_.id && await removeItem(id_.id, "Напоминание удалено")) { animHide($("itemsheet"), 170); lockSheets(false); }
  });

  /* ---------- Заметка: свой редактор, автосохранение ----------
     Текст хранится простой разметкой: **жирный**, _курсив_, строки «[ ] …» / «[x] …» — пункты списка.
     В редакторе это видно как настоящий жирный, курсив и галочки. */
  const ed = { id: null, sec: null, color: "paper", pinned: false, files: [], filesNew: [], filesRemoved: [], timer: null, saving: null, dirty: false };
  const ED_LIM = { head: 20, body: 1000, files: 5, fileSize: 5 * 1024 * 1024 };
  const rich = $("ed-rich");

  function setEdColor(c) {
    ed.color = c;
    document.querySelector("#editor .note-sheet").dataset.color = c;
    document.querySelectorAll("#editor .dot").forEach((d) => d.setAttribute("aria-checked", String(d.dataset.color === c)));
  }
  document.querySelectorAll("#editor .dot").forEach((d) => {
    d.setAttribute("role", "radio");
    d.addEventListener("click", () => { setEdColor(d.dataset.color); queueSave(0); });
  });

  // разметка → строки редактора
  function cbxEl(done) {
    const c = document.createElement("span");
    c.className = "cbx"; c.contentEditable = "false"; c.setAttribute("role", "checkbox"); c.setAttribute("aria-checked", String(!!done));
    c.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    return c;
  }
  function lineEl(line) {
    const d = document.createElement("div"); d.className = "ln";
    const pl = parseLine(line);
    if (pl.check) { d.classList.add("cl"); if (pl.done) d.classList.add("done"); d.append(cbxEl(pl.done)); }
    const frag = inlineNodes(pl.check ? pl.text : line);
    if (frag.childNodes.length) d.append(frag); else d.append(document.createElement("br"));
    return d;
  }
  function setRich(body) {
    rich.textContent = "";
    (body || "").split("\n").forEach((l) => rich.append(lineEl(l)));
    richEmpty();
  }
  // строки редактора → разметка
  /* Строка редактора → разметка. Текст разбирается посимвольно (жирный? курсив?), затем
     собирается заново: метки всегда парные, не переходят на другую строку, пробелы — снаружи */
  function serInline(line) {
    const runs = [];
    (function walk(node, b, i) {
      node.childNodes.forEach((n) => {
        if (n.nodeType === 3) {
          const t = n.nodeValue.replace(/\u200b/g, "");
          if (!t) return;
          const last = runs[runs.length - 1];
          if (last && last.b === b && last.i === i) last.t += t; else runs.push({ t, b, i });
        } else if (n.nodeType === 1) {
          if (n.classList.contains("cbx") || n.tagName === "BR") return;
          const fw = n.style && n.style.fontWeight, fs = n.style && n.style.fontStyle;
          walk(n, b || n.tagName === "B" || n.tagName === "STRONG" || fw === "bold" || Number(fw) >= 600,
                  i || n.tagName === "I" || n.tagName === "EM" || fs === "italic");
        }
      });
    })(line, false, false);
    return runs.map(({ t, b, i }) => {
      const m = t.match(/^(\s*)([\s\S]*?)(\s*)$/);
      if (!m[2] || (!b && !i)) return t;
      let core = m[2];
      if (i) core = "_" + core + "_";
      if (b) core = "**" + core + "**";
      return m[1] + core + m[3];
    }).join("");
  }
  function getRich() {
    const out = [];
    rich.childNodes.forEach((n) => {
      if (n.nodeType === 3) { if (n.nodeValue) out.push(n.nodeValue); return; }
      if (n.nodeType !== 1) return;
      const t = serInline(n);
      out.push(n.classList.contains("cl") ? (n.classList.contains("done") ? "[x] " : "[ ] ") + t : t);
    });
    while (out.length > 1 && !out[out.length - 1].trim()) out.pop();
    return out.join("\n");
  }
  function richEmpty() { rich.classList.toggle("is-empty", !getRich().trim() && !rich.querySelector(".cl")); }
  // порядок в строках: всё — внутри строк, у пунктов есть галочка
  function normRich() {
    const sel = window.getSelection();
    [...rich.childNodes].forEach((n) => {
      if (n.nodeType === 3 && n.nodeValue) {
        const d = document.createElement("div"); d.className = "ln"; rich.insertBefore(d, n); d.append(n);
        if (sel.rangeCount && sel.anchorNode === n) { const r = document.createRange(); r.setStart(n, n.nodeValue.length); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); }
      } else if (n.nodeType === 1 && n.tagName !== "DIV") {
        const d = document.createElement("div"); d.className = "ln"; rich.insertBefore(d, n); d.append(n);
      } else if (n.nodeType === 1) {
        n.classList.add("ln");
        if (n.classList.contains("cl") && !n.querySelector(":scope > .cbx")) { n.classList.remove("done"); n.prepend(cbxEl(false)); }
        if (!n.classList.contains("cl")) n.querySelectorAll(":scope > .cbx").forEach((c) => c.remove());
      }
    });
    if (!rich.firstChild) rich.append(lineEl(""));
  }
  function curLine() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    let n = sel.anchorNode;
    while (n && n.parentNode !== rich) n = n.parentNode;
    return n && n.nodeType === 1 ? n : null;
  }
  function caretAtLineStart(line) {
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return false;
    const r = document.createRange(); r.selectNodeContents(line); r.setEnd(sel.anchorNode, sel.anchorOffset);
    return !r.toString().replace(/​/g, "");
  }
  rich.addEventListener("keydown", (e) => {
    const line = curLine();
    if (!line) return;
    // Enter в пустом пункте — выход из списка
    if (e.key === "Enter" && line.classList.contains("cl") && !serInline(line).trim()) {
      e.preventDefault(); line.classList.remove("cl", "done"); line.querySelector(".cbx")?.remove(); onRich(); return;
    }
    // Backspace в начале пункта — убирает галочку, текст остаётся
    if (e.key === "Backspace" && line.classList.contains("cl") && caretAtLineStart(line)) {
      e.preventDefault(); line.classList.remove("cl", "done"); line.querySelector(".cbx")?.remove(); onRich(); return;
    }
  });
  // галочка в редакторе — нажимается как на карточке
  rich.addEventListener("mousedown", (e) => { if (e.target.closest(".cbx")) e.preventDefault(); });
  rich.addEventListener("click", (e) => {
    const c = e.target.closest(".cbx");
    if (!c) return;
    const line = c.parentNode, done = !line.classList.contains("done");
    line.classList.toggle("done", done); c.setAttribute("aria-checked", String(done));
    onRich();
  });
  // вставка — только текст, без чужого оформления
  rich.addEventListener("paste", (e) => {
    e.preventDefault();
    const t = (e.clipboardData.getData("text/plain") || "").replace(/\r/g, "");
    const room = ED_LIM.body - getRich().length;
    if (room > 0) document.execCommand("insertText", false, t.slice(0, room));
  });
  // предел длины: дальше 1000 символов не печатается
  rich.addEventListener("beforeinput", (e) => {
    if (/^insert/.test(e.inputType) && e.inputType !== "insertFromPaste" && getRich().length >= ED_LIM.body) e.preventDefault();
  });
  function onRich() { normRich(); richEmpty(); edCount(); queueSave(); }
  rich.addEventListener("input", onRich);

  // кнопки оформления не уводят фокус из текста
  document.querySelectorAll("#editor .ed-fmt").forEach((b) => b.addEventListener("mousedown", (e) => e.preventDefault()));
  /* Жирный и курсив — своя логика (без встроенных команд браузера): работает построчно,
     пункты списка и галочки не задевает, повторное нажатие снимает оформление */
  const inMark = (node, tag) => { while (node && node !== rich) { if (node.nodeType === 1 && node.tagName === tag) return node; node = node.parentNode; } return null; };
  function splitAt(el, node, offset) {
    const r = document.createRange(); r.setStart(node, offset); r.setEnd(el, el.childNodes.length);
    const tail = r.extractContents();
    const el2 = el.cloneNode(false); el2.append(tail); el.after(el2);
    return el2;
  }
  function textNodesIn(range) {
    const out = [], w = document.createTreeWalker(rich, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (!range.intersectsNode(n) || n.parentNode.closest(".cbx")) continue;
      let s = 0, e = n.nodeValue.length;
      if (n === range.startContainer) s = range.startOffset;
      if (n === range.endContainer) e = range.endOffset;
      if (n.nodeValue.slice(s, e).replace(/\u200b/g, "").length) out.push(n);
    }
    return out;
  }
  function tidy() {
    rich.querySelectorAll("b, i").forEach((e) => {
      if (!e.textContent.replace(/\u200b/g, "") && !(window.getSelection().anchorNode && e.contains(window.getSelection().anchorNode))) e.remove();
    });
    rich.querySelectorAll("b, i").forEach((e) => {
      e.querySelectorAll(e.tagName).forEach((inner) => inner.replaceWith(...inner.childNodes));
      const nx = e.nextSibling;
      if (nx && nx.nodeType === 1 && nx.tagName === e.tagName) { e.append(...nx.childNodes); nx.remove(); }
    });
    rich.normalize();
  }
  function placeCaret(node, offset) { const r = document.createRange(); r.setStart(node, offset); r.collapse(true); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
  function toggleMark(tag) {
    if (document.activeElement !== rich) rich.focus();
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    if (!rich.contains(r.commonAncestorContainer)) return;
    if (r.collapsed) {
      // без выделения: дальше печатается жирным/курсивом — или наоборот, выходим из него
      const m = inMark(r.startContainer, tag);
      if (m) {
        // выходим из одного оформления, остальные (например, курсив внутри жирного) сохраняем
        const keep = [];
        for (let n = r.startContainer; n && n !== m; n = n.parentNode) if (n.nodeType === 1 && (n.tagName === "B" || n.tagName === "I") && n.tagName !== tag) keep.push(n.tagName);
        splitAt(m, r.startContainer, r.startOffset);
        const z = document.createTextNode("\u200b");
        let wrap = z;
        keep.forEach((t) => { const el = document.createElement(t); el.append(wrap); wrap = el; });
        m.after(wrap); placeCaret(z, 1);
      }
      else { const el = document.createElement(tag); const z = document.createTextNode("\u200b"); el.append(z); r.insertNode(el); placeCaret(z, 1); }
      updFmt(); return;
    }
    const nodes = textNodesIn(r);
    const all = nodes.length > 0 && nodes.every((n) => inMark(n, tag));
    const lines = [...rich.children].filter((l) => r.intersectsNode(l));
    let first = null, last = null;
    lines.forEach((line) => {
      const lr = document.createRange(); lr.selectNodeContents(line);
      const cb = line.querySelector(":scope > .cbx"); if (cb) lr.setStartAfter(cb);
      if (r.compareBoundaryPoints(Range.START_TO_START, lr) > 0) lr.setStart(r.startContainer, r.startOffset);
      if (r.compareBoundaryPoints(Range.END_TO_END, lr) < 0) lr.setEnd(r.endContainer, r.endOffset);
      if (lr.collapsed) return;
      const frag = lr.extractContents();
      frag.querySelectorAll(tag).forEach((e) => e.replaceWith(...e.childNodes));
      const host = inMark(lr.startContainer, tag);
      if (host) { splitAt(host, lr.startContainer, lr.startOffset); lr.setStartAfter(host); lr.collapse(true); }
      let node = frag;
      if (!all) { const el = document.createElement(tag); el.append(frag); node = el; }
      const a = node.nodeType === 11 ? node.firstChild : node, b = node.nodeType === 11 ? node.lastChild : node;
      lr.insertNode(node);
      if (a) { first = first || a; last = b; }
    });
    tidy();
    if (first && first.isConnected && last && last.isConnected) {
      const nr = document.createRange(); nr.setStartBefore(first); nr.setEndAfter(last);
      sel.removeAllRanges(); sel.addRange(nr);
    }
    onRich(); updFmt();
  }
  // значки «Ж» и «К» подсвечены, когда курсор в жирном / курсиве
  function updFmt() {
    const s = window.getSelection();
    const n = s.rangeCount && rich.contains(s.anchorNode) ? s.anchorNode : null;
    $("ed-bold").setAttribute("aria-pressed", String(!!(n && inMark(n, "B"))));
    $("ed-italic").setAttribute("aria-pressed", String(!!(n && inMark(n, "I"))));
  }
  document.addEventListener("selectionchange", () => { if (!$("editor").hidden) updFmt(); });
  $("ed-bold").addEventListener("click", () => toggleMark("B"));
  $("ed-italic").addEventListener("click", () => toggleMark("I"));
  rich.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "b" || k === "и") { e.preventDefault(); toggleMark("B"); }
    else if (k === "i" || k === "ш") { e.preventDefault(); toggleMark("I"); }
  });
  // «Список»: строки с курсором или выделенные становятся пунктами (и обратно)
  $("ed-list").addEventListener("click", () => {
    if (document.activeElement !== rich) { rich.focus(); const r = document.createRange(); r.selectNodeContents(rich.lastChild || rich); r.collapse(false); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const rg = sel.getRangeAt(0);
    const lines = [...rich.children].filter((l) => rg.intersectsNode(l));
    if (!lines.length) return;
    const all = lines.every((l) => l.classList.contains("cl"));
    lines.forEach((l) => {
      if (all) { l.classList.remove("cl", "done"); l.querySelector(".cbx")?.remove(); }
      else if (!l.classList.contains("cl")) { l.classList.add("cl"); l.prepend(cbxEl(false)); }
    });
    onRich();
  });

  /* Вложения: до 5 файлов по 5 МБ, хранятся закрыто, открываются по временной ссылке */
  const fmtSize = (b) => (b < 1024 ? b + " Б" : b < 1048576 ? Math.round(b / 1024) + " КБ" : (b / 1048576).toFixed(1).replace(".", ",") + " МБ");
  const CLIP = "M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9";
  function renderEdFiles() {
    const box = $("ed-files");
    box.textContent = "";
    box.hidden = !ed.files.length;
    ed.files.forEach((f) => {
      const row = document.createElement("div"); row.className = "ed-file";
      const open = document.createElement("button");
      open.type = "button"; open.className = "ed-file-open"; open.dataset.tip = "Скачать"; open.setAttribute("aria-label", "Скачать " + f.name);
      open.innerHTML = svgIco(CLIP, 14);
      const nm = document.createElement("span"); nm.className = "ed-file-name"; nm.textContent = f.name;
      const sz = document.createElement("span"); sz.className = "ed-file-size"; sz.textContent = fmtSize(f.size);
      open.append(nm, sz);
      open.addEventListener("click", () => downloadFile(f));
      const del = document.createElement("button");
      del.type = "button"; del.className = "tool"; del.dataset.tip = "Открепить"; del.setAttribute("aria-label", "Открепить " + f.name);
      del.innerHTML = svgIco("M6 6l12 12M18 6 6 18", 14);
      del.addEventListener("click", () => {
        ed.files = ed.files.filter((x) => x.path !== f.path);
        if (ed.filesNew.includes(f.path)) { ed.filesNew = ed.filesNew.filter((p) => p !== f.path); sb.storage.from("attachments").remove([f.path]); }
        else ed.filesRemoved.push(f.path);
        renderEdFiles(); queueSave(0);
      });
      row.append(open, del);
      box.append(row);
    });
    $("ed-attach").disabled = ed.files.length >= ED_LIM.files;
  }
  async function downloadFile(f) {
    const { data, error } = await sb.storage.from("attachments").createSignedUrl(f.path, 60, { download: f.name });
    if (error || !data) { toast("Не удалось открыть файл — проверьте интернет."); return; }
    const a = document.createElement("a"); a.href = data.signedUrl; a.rel = "noopener"; a.download = f.name;
    document.body.append(a); a.click(); a.remove();
  }
  $("ed-attach").addEventListener("click", () => $("ed-file").click());
  $("ed-file").addEventListener("change", async (e) => {
    const list = [...e.target.files]; e.target.value = "";
    for (const file of list) {
      if (ed.files.length >= ED_LIM.files) { toast("К заметке можно прикрепить не больше " + ED_LIM.files + " файлов."); break; }
      if (file.size > ED_LIM.fileSize) { toast("«" + file.name + "» больше 5 МБ — такой файл не прикрепить."); continue; }
      const ext = (file.name.match(/\.([A-Za-z0-9]{1,8})$/) || [, "bin"])[1].toLowerCase();
      const path = state.user.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
      $("ed-status").textContent = "Загружаю файл…";
      const up = await sb.storage.from("attachments").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (up.error) { console.error(up.error); toast("Файл не загрузился — проверьте интернет."); $("ed-status").textContent = ""; continue; }
      ed.files.push({ path, name: file.name.slice(0, 120), size: file.size, type: (file.type || "").slice(0, 80) });
      ed.filesNew.push(path);
      renderEdFiles(); queueSave(0);
    }
  });

  function openEditor(id, secId) {
    closeMenus(null);
    const n = id ? state.items.find((x) => x.id === id) : null;
    ed.id = n ? n.id : null;
    ed.sec = n ? n.section_id : secId || (orderedFields().find((f) => f.app === "notes") || {}).id || null;
    ed.pinned = !!(n && n.pinned);
    ed.files = ((n && n.data && n.data.files) || []).map((f) => Object.assign({}, f));
    ed.filesNew = []; ed.filesRemoved = [];
    ed.snap = n ? { title: n.title || "", body: n.body, color: n.color, pinned: !!n.pinned, data: Object.assign({}, n.data || {}), edited_at: n.edited_at || n.created_at } : null; // для «Отменить»
    $("ed-pin").setAttribute("aria-pressed", String(ed.pinned));
    ed.dirty = false;
    $("ed-head").value = n ? n.title || "" : "";
    setRich(n ? n.body : "");
    renderEdFiles();
    edCount();
    $("ed-delete").hidden = !n;
    $("ed-confirm").hidden = true;
    $("ed-actions").hidden = false;
    $("ed-title").textContent = n ? "Заметка" : "Новая заметка";
    $("ed-status").textContent = n ? "Изменено " + fmtShort.format(new Date(n.edited_at || n.created_at)) : "";
    setEdColor(n ? n.color || "paper" : "paper");
    animShow($("editor"));
    lockSheets(true);
    setTimeout(() => {
      if (!n) { $("ed-head").focus(); return; }
      rich.focus(); const r = document.createRange(); r.selectNodeContents(rich.lastChild || rich); r.collapse(false);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    }, 30);
  }

  function queueSave(delay = 700) {
    ed.dirty = true;
    $("ed-status").textContent = "…";
    clearTimeout(ed.timer);
    ed.timer = setTimeout(saveNote, delay);
  }

  async function saveNote() {
    clearTimeout(ed.timer);
    if (!ed.dirty) return;
    if (ed.saving) await ed.saving;
    const body = getRich().slice(0, ED_LIM.body), title = $("ed-head").value.trim().slice(0, ED_LIM.head);
    if (!ed.id && !body.trim() && !title && !ed.files.length) { ed.dirty = false; $("ed-status").textContent = ""; return; }
    ed.dirty = false;
    ed.saving = (async () => {
      const cur = ed.id ? state.items.find((x) => x.id === ed.id) : null;
      const data = Object.assign({}, (cur && cur.data) || {}, { files: ed.files });
      if (!ed.files.length) delete data.files;
      const row = { title, body, color: ed.color, pinned: ed.pinned, data, edited_at: new Date().toISOString() };
      let res;
      if (ed.id) res = await sb.from("items").update(row).eq("id", ed.id).select(ITEM_COLS).single();
      else res = await sb.from("items").insert(Object.assign({ type: "note", section_id: ed.sec, position: nextPos(ed.sec) }, row)).select(ITEM_COLS).single();
      if (res.error) {
        console.error(res.error);
        if (String(res.error.message).includes("notes_limit")) { ed.dirty = false; $("ed-status").textContent = "В поле уже 20 заметок — эта не сохранится"; return; }
        ed.dirty = true;
        $("ed-status").textContent = "Не сохранилось — проверьте интернет";
        return;
      }
      const saved = res.data;
      const i = state.items.findIndex((x) => x.id === saved.id);
      if (i >= 0) state.items[i] = saved; else state.items.push(saved);
      ed.id = saved.id;
      $("ed-delete").hidden = false;
      $("ed-status").textContent = "Сохранено";
      itemsChanged();
    })();
    await ed.saving;
    ed.saving = null;
  }

  // Окно закрывается только после сохранения: если сохранить не удалось — остаётся открытым
  let edClosing = false;
  async function closeEditor() {
    if (edClosing) return;
    edClosing = true;
    try {
      await saveNote();
      if (ed.saving) await ed.saving;
      if (ed.dirty) {
        $("ed-status").textContent = "Не сохранилось — проверьте интернет и нажмите «Готово» ещё раз";
        return;
      }
      // откреплённые файлы удаляются только теперь — до «Готово» их можно вернуть
      if (ed.filesRemoved.length) { sb.storage.from("attachments").remove(ed.filesRemoved); ed.filesRemoved = []; }
      // пустая заметка не нужна
      if (ed.id && !getRich().trim() && !$("ed-head").value.trim() && !ed.files.length && !(await deleteNote(true))) return;
      animHide($("editor"), 170);
      lockSheets(false);
    } finally {
      edClosing = false;
    }
  }

  async function deleteNote(silent) {
    if (!ed.id) return true;
    const ok = await removeItem(ed.id, silent ? null : "Заметка удалена");
    if (!ok) return false;
    ed.id = null;
    if (!silent) { animHide($("editor"), 170); lockSheets(false); }
    return true;
  }

  $("ed-head").addEventListener("input", () => { queueSave(); edCount(); });
  // ограничения заметки: заголовок 20, текст 1000 символов; счётчик появляется ближе к пределу
  function edCount() {
    const h = $("ed-head").value.length, b = getRich().length;
    const parts = [];
    if (h >= ED_LIM.head * 0.75) parts.push("Заголовок " + h + " / " + ED_LIM.head);
    if (b >= ED_LIM.body * 0.8) parts.push("Текст " + b.toLocaleString("ru-RU") + " / " + ED_LIM.body.toLocaleString("ru-RU"));
    const el = $("ed-count");
    el.textContent = parts.join(" · ");
    el.classList.toggle("full", h >= ED_LIM.head || b >= ED_LIM.body);
  }
  // Enter в заголовке — к тексту
  $("ed-head").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault(); rich.focus();
    const r = document.createRange(); r.selectNodeContents(rich.firstChild || rich); r.collapse(true);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  $("ed-pin").addEventListener("click", () => {
    ed.pinned = !ed.pinned;
    $("ed-pin").setAttribute("aria-pressed", String(ed.pinned));
    queueSave(0);
  });
  // удаление без подтверждения: заметка уходит в корзину, в уведомлении — «Вернуть»
  $("ed-delete").addEventListener("click", async () => { clearTimeout(ed.timer); if (ed.dirty) await saveNote(); deleteNote(false); });
  $("ed-confirm-no").addEventListener("click", () => { $("ed-confirm").hidden = true; $("ed-actions").hidden = false; replay($("ed-actions")); });
  $("ed-confirm-yes").addEventListener("click", () => deleteNote(false));
  $("editor").querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeEditor));
  // «Отменить»: заметка возвращается к виду до открытия (и файлы тоже); новая — не создаётся
  async function cancelEditor() {
    if (edClosing) return;
    edClosing = true;
    try {
      clearTimeout(ed.timer); ed.dirty = false;
      if (ed.saving) await ed.saving;
      if (ed.id && !ed.snap) { if (!(await removeItem(ed.id))) return; ed.id = null; }
      else if (ed.id && ed.snap) {
        const it = state.items.find((x) => x.id === ed.id);
        if (it && ((it.title || "") !== ed.snap.title || it.body !== ed.snap.body || it.color !== ed.snap.color || !!it.pinned !== ed.snap.pinned || JSON.stringify(it.data || {}) !== JSON.stringify(ed.snap.data))) {
          const r = await sb.from("items").update(ed.snap).eq("id", ed.id).select(ITEM_COLS).single();
          if (r.error) { $("ed-status").textContent = "Не получилось отменить — проверьте интернет"; return; }
          Object.assign(it, r.data); itemsChanged();
        }
      }
      if (ed.filesNew.length) sb.storage.from("attachments").remove(ed.filesNew);
      ed.filesNew = []; ed.filesRemoved = [];
      animHide($("editor"), 170);
      lockSheets(false);
    } finally { edClosing = false; }
  }
  $("editor").querySelector("[data-cancel]").addEventListener("click", cancelEditor);


  /* ---------- Заставка ---------- */
  function setWall(preset, url) {
    const wall = $("wall");
    if (!reduceMotion && document.documentElement.dataset.wallReady) {
      const old = wall.cloneNode(false);
      old.removeAttribute("id");
      old.style.backgroundImage = getComputedStyle(wall).backgroundImage;
      old.classList.add("wall-old");
      wall.after(old);
      requestAnimationFrame(() => requestAnimationFrame(() => old.classList.add("go")));
      setTimeout(() => old.remove(), 450);
      colorFade();
    }
    document.documentElement.dataset.wallReady = "1";
    if (url) {
      document.documentElement.dataset.wall = "custom";
      store.set("cloudesk-wall", "custom");
      wall.style.backgroundImage = 'url("' + url + '")';
    } else {
      const p = PRESETS.find((x) => x.id === preset) || PRESETS[0];
      document.documentElement.dataset.wall = p.id;
      store.set("cloudesk-wall", p.id);
      wall.style.backgroundImage = "";
      setAccent(p.h, p.s);
    }
    document.querySelectorAll(".preset").forEach((p) =>
      p.setAttribute("aria-checked", String(!url && p.dataset.preset === (preset || "dusk"))));
  }

  const wallCache = new Map();
  async function applyWallFromSettings() {
    const s = state.settings;
    if (s && s.wallpaper_path) {
      // фото столов запоминаются: переключение между столами — без повторной загрузки
      let blob = wallCache.get(s.wallpaper_path);
      if (!blob) {
        const { data, error } = await sb.storage.from("wallpapers").download(s.wallpaper_path);
        if (!error && data) { blob = data; wallCache.set(s.wallpaper_path, data); }
      }
      if (state.settings !== s) return; // пока грузилось, переключили стол
      if (blob) {
        if (state.wallUrl) URL.revokeObjectURL(state.wallUrl);
        state.wallUrl = URL.createObjectURL(blob);
        setWall(null, state.wallUrl);
        accentFromImage(blob);
        return;
      }
    }
    setWall(shownPreset(), null);
  }
  // Смена заставки раз в неделю: от выбранной заставки по кругу, новая — каждый понедельник
  const weekIndex = (d = new Date()) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1970, 0, 5)) / 604800000);
  function shownPreset() {
    const s = state.settings || {};
    const base = Math.max(0, PRESETS.findIndex((p) => p.id === s.wallpaper_preset));
    if (!s.wallpaper_weekly || s.wallpaper_path) return PRESETS[base].id;
    const k = weekIndex() - (s.wallpaper_week_from == null ? weekIndex() : s.wallpaper_week_from);
    return PRESETS[(((base + k) % PRESETS.length) + PRESETS.length) % PRESETS.length].id;
  }
  function renderWeekly() {
    const on = !!(state.settings && state.settings.wallpaper_weekly && !state.settings.wallpaper_path);
    $("wall-weekly").setAttribute("aria-checked", String(on));
  }
  $("wall-weekly").addEventListener("click", () => {
    const s = state.settings || {};
    const on = !(s.wallpaper_weekly && !s.wallpaper_path);
    const cur = shownPreset(), old = s.wallpaper_path;
    state.settings = Object.assign({}, s, { wallpaper_weekly: on, wallpaper_preset: cur, wallpaper_path: null, wallpaper_week_from: weekIndex() });
    renderWeekly();
    if (old) setWall(cur, null);
    trackWall(async () => {
      await saveSettings({ wallpaper_weekly: on, wallpaper_preset: cur, wallpaper_path: null, wallpaper_week_from: weekIndex() });
      if (old) wallTrash.add(old);
    }, "Настройка не сохранилась. Попробуйте ещё раз.");
  });
  // наступила новая неделя, пока стол открыт
  setInterval(() => {
    const s = state.settings;
    if (s && s.wallpaper_weekly && !s.wallpaper_path && document.documentElement.dataset.wall !== shownPreset()) setWall(shownPreset(), null);
  }, 60000);

  // Заставка — у каждого стола своя (таблица desks), остальное — общие настройки
  const WALL_KEYS = ["wallpaper_preset", "wallpaper_path", "wallpaper_weekly", "wallpaper_week_from"];
  async function saveSettings(patch) {
    const wall = {}, rest = {};
    Object.keys(patch).forEach((k) => ((WALL_KEYS.includes(k) ? wall : rest)[k] = patch[k]));
    if (Object.keys(wall).length) {
      const { data, error } = await sb.from("desks").update(wall).eq("id", state.desk).select(DESK_COLS).single();
      if (error) throw error;
      const i = state.desks.findIndex((d) => d.id === data.id);
      if (i >= 0) state.desks[i] = data;
    }
    if (Object.keys(rest).length) {
      const row = Object.assign({ user_id: state.user.id }, state.base || {}, rest);
      WALL_KEYS.forEach((k) => delete row[k]);
      const { data, error } = await sb.from("settings").upsert(row, { onConflict: "user_id" })
        .select("theme,cities,weather_on,weather_city,weather_lat,weather_lon").single();
      if (error) throw error;
      state.base = data;
    }
    mergeSettings();
  }

  function buildPresets() {
    const box = $("presets");
    for (const p of PRESETS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "preset";
      b.dataset.preset = p.id;
      b.setAttribute("role", "radio");
      b.dataset.tip = p.name; b.setAttribute("aria-label", p.name);
      b.addEventListener("click", () => {
        const old = state.settings && state.settings.wallpaper_path;
        setWall(p.id, null);
        trackWall(async () => {
          await saveSettings({ wallpaper_preset: p.id, wallpaper_path: null, wallpaper_week_from: weekIndex() });
          if (old) wallTrash.add(old);
        }, "Заставка не сохранилась. Попробуйте ещё раз.");
      });
      box.append(b);
    }
  }
  // превью пресетов: используем те же градиенты, что и для фона
  function paintPresetPreviews() {
    const probe = document.createElement("div");
    probe.className = "wall";
    probe.style.visibility = "hidden";
    document.body.append(probe);
    const was = document.documentElement.dataset.wall;
    document.querySelectorAll(".preset").forEach((b) => {
      document.documentElement.dataset.wall = b.dataset.preset;
      b.style.backgroundImage = getComputedStyle(probe).backgroundImage;
    });
    document.documentElement.dataset.wall = was;
    probe.remove();
  }

  // Сохранение заставки отслеживается: окно не закроется, пока оно не завершится
  let wallJob = null, wallFailed = false;
  function trackWall(fn, errText) {
    const job = (async () => {
      try { await fn(); wallFailed = false; $("set-status").textContent = ""; }
      catch (e) { console.error(e); wallFailed = true; $("set-status").textContent = ""; toast(errText); }
    })();
    wallJob = job;
    job.finally(() => { if (wallJob === job) wallJob = null; });
    return job;
  }

  // Уменьшаем фото до размера экрана: быстрее грузится и меньше места
  async function shrinkImage(file) {
    const bmp = await createImageBitmap(file);
    const max = 2560;
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    return await new Promise((res) => c.toBlob(res, "image/jpeg", 0.85));
  }

  $("wall-file").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast("Подойдёт фото в формате JPG, PNG или WEBP."); return; }
    if (file.size > 30 * 1024 * 1024) { toast("Фото слишком большое: максимум 30 МБ."); return; }
    const st = $("set-status");
    st.textContent = "Загружаю…";
    trackWall(async () => {
      const blob = await shrinkImage(file);
      const path = state.user.id + "/" + Date.now() + ".jpg";
      const up = await sb.storage.from("wallpapers").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (up.error) throw up.error;
      const old = state.settings && state.settings.wallpaper_path;
      await saveSettings({ wallpaper_path: path, wallpaper_weekly: false });
      renderWeekly();
      wallNew.add(path); wallCache.set(path, blob);
      if (old && old !== path) wallTrash.add(old);
      if (state.wallUrl) URL.revokeObjectURL(state.wallUrl);
      state.wallUrl = URL.createObjectURL(blob);
      setWall(null, state.wallUrl);
      accentFromImage(blob);
    }, "Не получилось загрузить фото. Попробуйте другое или повторите позже.");
  });

  /* ---------- Окно «Время» ---------- */
  const CITY_LIST = [
    ["Europe/Moscow", "Москва"], ["Asia/Yerevan", "Ереван"], ["Europe/Minsk", "Минск"], ["Europe/Kiev", "Киев"],
    ["Asia/Tbilisi", "Тбилиси"], ["Asia/Almaty", "Алматы"], ["Asia/Tashkent", "Ташкент"], ["Asia/Yekaterinburg", "Екатеринбург"],
    ["Asia/Novosibirsk", "Новосибирск"], ["Asia/Vladivostok", "Владивосток"], ["Europe/Kaliningrad", "Калининград"], ["Europe/Samara", "Самара"],
    ["Europe/Istanbul", "Стамбул"], ["Asia/Dubai", "Дубай"], ["Europe/London", "Лондон"], ["Europe/Berlin", "Берлин"],
    ["Europe/Paris", "Париж"], ["America/New_York", "Нью-Йорк"], ["America/Los_Angeles", "Лос-Анджелес"], ["Asia/Bangkok", "Бангкок"],
    ["Asia/Shanghai", "Пекин"], ["Asia/Tokyo", "Токио"],
  ];
  const cityName = (tz) => (CITY_LIST.find((c) => c[0] === tz) || [tz, tz.split("/").pop().replace(/_/g, " ")])[1];
  const pad = (n) => String(n).padStart(2, "0");
  const fmtMS = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(s / 3600); return (h ? h + ":" + pad(Math.floor(s / 60) % 60) : pad(Math.floor(s / 60))) + ":" + pad(s % 60); };
  const fmtSW = (ms) => { const t = Math.floor(ms / 100); const s = Math.floor(t / 10); const h = Math.floor(s / 3600); return (h ? h + ":" : "") + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60) + "," + (t % 10); };
  // Одна строка списка для всего окна «Время»: [ручка] название/пояснение — время — [действие]
  const X_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/></svg>';
  function tRow(o) {
    const li = document.createElement("li");
    li.className = "t-row" + (o.cls ? " " + o.cls : "") + (o.tool === undefined ? " no-tool" : "");
    if (o.lead) li.append(o.lead);
    const main = document.createElement("div"); main.className = "t-main";
    const t = document.createElement("div"); t.className = "t-title" + (o.titleCls ? " " + o.titleCls : ""); t.textContent = o.title;
    const s = document.createElement("div"); s.className = "t-sub" + (o.subCls ? " " + o.subCls : "");
    if (o.sub) s.append(o.sub);
    main.append(t, s);
    const v = document.createElement("div"); v.className = "t-val" + (o.valCls ? " " + o.valCls : ""); v.textContent = o.val || "";
    li.append(main, v);
    if (o.tool) li.append(o.tool);
    else if (o.tool === null) { const ph = document.createElement("span"); ph.className = "t-ph"; li.append(ph); }
    return li;
  }
  function delBtn(tip, onClick) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "tool"; b.dataset.tip = tip; b.setAttribute("aria-label", tip);
    b.innerHTML = X_SVG; b.addEventListener("click", onClick);
    return b;
  }
  function tHead(text) { const li = document.createElement("li"); li.className = "t-head"; li.textContent = text; return li; }
  const HINTS = {
    cal: "Нажмите на день, чтобы поставить на него напоминание.",
    timer: "Когда время выйдет, прозвучит сигнал. Таймер идёт, даже если окно закрыть.",
    sw: "Секундомер продолжает идти, даже если окно закрыть.",
    rem: "Напоминание придёт сообщением от бота в Telegram.",
    cities: "Время в выбранных городах, разница — относительно вашего.",
  };

  let timeTab = "cal";
  function setTab(t) {
    timeTab = t;
    document.querySelectorAll("#timesheet [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
    document.querySelectorAll("#timesheet [data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== t; if (!p.hidden) replay(p); });
    $("time-hint").textContent = HINTS[t];
    document.querySelectorAll("#timesheet .foot-tools").forEach((f) => (f.hidden = f.dataset.for !== t));
    $("time-status").textContent = "";
    if (t === "cal") renderCal();
    if (t === "rem") { loadReminders(); renderBotHint(); }
    if (t === "cities") renderCities();
    if (t === "timer") renderTimer();
    if (t === "sw") { renderSW(); swTick(); }
  }
  document.querySelectorAll("#timesheet [data-tab]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

  const remDel = new Set(); // напоминания, отмеченные к удалению (удаляются по «Готово»)
  let citiesSnap = null, citiesDirty = false;
  function openTime(tab) {
    closeMenus(null);
    remDel.clear();
    citiesSnap = cities().slice(); citiesDirty = false;
    animShow($("timesheet"));
    lockSheets(true);
    setTab(tab || (timer.end || timer.left ? "timer" : sw.start || sw.acc ? "sw" : timeTab));
  }
  $("btn-clock").addEventListener("click", () => openTime());

  // Закрытие: сначала сохраняем то, что введено; если не вышло — окно остаётся открытым
  let timeJob = null, timeClosing = false;
  function trackTime(fn) {
    const job = (async () => { try { await fn(); return true; } catch (e) { console.error(e); return false; } })();
    timeJob = job;
    job.finally(() => { if (timeJob === job) timeJob = null; });
    return job;
  }
  async function closeTime() {
    if (timeClosing) return;
    timeClosing = true;
    try {
      if (timeJob && !(await timeJob)) { $("time-status").textContent = "Не сохранилось — проверьте интернет"; return; }
      if ($("rem-text").value.trim()) {
        const ok = await addReminder();
        if (!ok) return;
      }
      if (citiesDirty) {
        $("time-status").textContent = "Сохраняю…";
        try { await saveSettings({ cities: cities() }); citiesDirty = false; }
        catch (e) { console.error(e); setTab("cities"); $("time-status").textContent = "Города не сохранились — проверьте интернет"; return; }
      }
      if (remDel.size) {
        const ids = [...remDel], mark = trashMark();
        const { error } = await sb.from("items").update(mark).in("id", ids);
        if (error) { setTab("rem"); $("time-status").textContent = "Не удалось удалить — проверьте интернет"; return; }
        state.items = state.items.filter((x) => !remDel.has(x.id));
        remDel.clear(); itemsChanged();
        toast(ids.length === 1 ? "Напоминание удалено" : "Удалено напоминаний: " + ids.length, "Вернуть", () => restoreBatch(mark.deleted_batch));
      }
      $("time-status").textContent = "";
      animHide($("timesheet"), 170);
      lockSheets(false);
    } finally { timeClosing = false; }
  }
  $("timesheet").querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeTime));
  // «Отменить»: введённое напоминание не добавляется, удаления и изменения городов не применяются
  $("timesheet").querySelector("[data-cancel]").addEventListener("click", () => {
    closeMenus(null);
    resetRemForm();
    remDel.clear();
    if (citiesDirty && citiesSnap) { state.settings = Object.assign({}, state.settings || {}, { cities: citiesSnap }); citiesDirty = false; }
    renderReminders(); renderCities();
    $("time-status").textContent = "";
    animHide($("timesheet"), 170);
    lockSheets(false);
  });

  const plural = (n, a, b, c) => { const m = n % 100, k = n % 10; return m > 10 && m < 20 ? c : k === 1 ? a : k >= 2 && k <= 4 ? b : c; };
  /* Календарь */
  let calMonth = new Date(); calMonth.setDate(1);
  const fmtMonth = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" });
  const dayKey = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  function renderCal() {
    $("cal-title").textContent = fmtMonth.format(calMonth).replace(" г.", "");
    const g = $("cal-grid");
    g.textContent = "";
    ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].forEach((d) => { const el = document.createElement("div"); el.className = "cal-dow"; el.textContent = d; g.append(el); });
    const first = new Date(calMonth);
    const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
    const today = dayKey(new Date());
    const remDays = new Map(), taskDays = new Map();
    dueList().filter((r) => r.type === "reminder" && !r.sent_at && !r.failed_at).forEach((r) => { const k = dayKey(new Date(r.remind_at)); remDays.set(k, (remDays.get(k) || 0) + 1); });
    state.items.filter((t) => t.type === "task" && !t.done && tData(t).due).forEach((t) => { const k = dayKey(new Date(tData(t).due)); taskDays.set(k, (taskDays.get(k) || 0) + 1); });
    const now = new Date();
    $("cal-today").disabled = calMonth.getFullYear() === now.getFullYear() && calMonth.getMonth() === now.getMonth();
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cal-day" + (d.getMonth() !== calMonth.getMonth() ? " other" : "") + (d.getDay() % 6 === 0 ? " weekend" : "") + (dayKey(d) === today ? " today" : "");
      b.textContent = d.getDate();
      const n = remDays.get(dayKey(d)) || 0, nt = taskDays.get(dayKey(d)) || 0;
      if (n || nt) {
        const dot = document.createElement("i"); dot.className = "dot"; b.append(dot);
        const tip = [];
        if (n) tip.push(n + " " + plural(n, "напоминание", "напоминания", "напоминаний"));
        if (nt) tip.push(nt + " " + plural(nt, "задача", "задачи", "задач") + " со сроком");
        b.dataset.tip = tip.join(", ");
      }
      b.addEventListener("click", () => { setTab("rem"); if (dayKey(d) >= dayKey(new Date())) setRemDate(dayKey(d)); $("rem-text").focus(); });
      g.append(b);
    }
  }
  $("cal-prev").addEventListener("click", () => { calMonth.setMonth(calMonth.getMonth() - 1); renderCal(); replay($("cal-grid")); });
  $("cal-next").addEventListener("click", () => { calMonth.setMonth(calMonth.getMonth() + 1); renderCal(); replay($("cal-grid")); });
  $("cal-today").addEventListener("click", () => { calMonth = new Date(); calMonth.setDate(1); renderCal(); replay($("cal-grid")); });

  /* Сигнал */
  let audioCtx = null;
  function beep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.35, 0.7].forEach((t) => {
        const o = audioCtx.createOscillator(), gn = audioCtx.createGain();
        o.frequency.value = 880; o.connect(gn); gn.connect(audioCtx.destination);
        const at = audioCtx.currentTime + t;
        gn.gain.setValueAtTime(0.0001, at); gn.gain.exponentialRampToValueAtTime(0.3, at + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
        o.start(at); o.stop(at + 0.3);
      });
    } catch (e) {}
  }

  /* Таймер (живёт в браузере: переживает закрытие окна и перезагрузку) */
  const timer = (() => { try { return JSON.parse(store.get("cloudesk-timer")) || {}; } catch (e) { return {}; } })();
  timer.total = timer.total || 5 * 60000;
  const saveTimer = () => store.set("cloudesk-timer", JSON.stringify(timer));
  [1, 5, 10, 15, 25, 30, 60].forEach((m) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = m + " мин"; b.dataset.min = m;
    b.addEventListener("click", () => { if (timer.end) return; timer.total = m * 60000; timer.left = 0; $("timer-min").value = ""; saveTimer(); renderTimer(); });
    $("timer-presets").insertBefore(b, $("timer-min"));
  });
  // своё время: пока поле в фокусе — только число, после — «7 мин»
  $("timer-min").addEventListener("focus", () => { $("timer-min").value = $("timer-min").value.replace(/\D/g, ""); });
  $("timer-min").addEventListener("blur", () => renderTimer());
  $("timer-min").addEventListener("input", () => {
    $("timer-min").value = $("timer-min").value.replace(/\D/g, "").slice(0, 3);
    const m = Number($("timer-min").value);
    if (!timer.end && m >= 1 && m <= 600) { timer.total = m * 60000; timer.left = 0; saveTimer(); renderTimer(); }
  });
  function timerLeft() { return timer.end ? timer.end - Date.now() : timer.left || timer.total; }
  function renderTimer() {
    $("timer-display").textContent = fmtMS(timerLeft());
    setIconBtn($("timer-go"), timer.end ? PATHS.pause : PATHS.play, timer.end ? "Пауза" : timer.left ? "Продолжить" : "Старт");
    const preset = [1, 5, 10, 15, 25, 30, 60].includes(timer.total / 60000);
    document.querySelectorAll("#timer-presets button").forEach((b) => { b.setAttribute("aria-pressed", String(Number(b.dataset.min) * 60000 === timer.total)); b.disabled = !!timer.end; });
    $("timer-min").disabled = !!timer.end;
    $("timer-min").classList.toggle("on", !preset);
    if (document.activeElement !== $("timer-min")) $("timer-min").value = preset ? "" : Math.round(timer.total / 60000) + " мин";
    $("timer-reset").disabled = !timer.end && !timer.left && !timer.done;
  }
  $("timer-go").addEventListener("click", () => {
    if (timer.end) { timer.left = timer.end - Date.now(); timer.end = 0; }
    else { timer.end = Date.now() + (timer.left || timer.total); timer.left = 0; timer.done = false; }
    saveTimer(); renderTimer(); renderRun();
    if (audioCtx === null) try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  });
  $("timer-reset").addEventListener("click", () => { timer.end = 0; timer.left = 0; timer.done = false; saveTimer(); renderTimer(); renderRun(); });

  /* Секундомер */
  const sw = (() => { try { return JSON.parse(store.get("cloudesk-sw")) || {}; } catch (e) { return {}; } })();
  sw.acc = sw.acc || 0; sw.laps = sw.laps || [];
  const saveSW = () => store.set("cloudesk-sw", JSON.stringify(sw));
  const swNow = () => sw.acc + (sw.start ? Date.now() - sw.start : 0);
  function renderSW() {
    $("sw-display").textContent = fmtSW(swNow());
    setIconBtn($("sw-go"), sw.start ? PATHS.pause : PATHS.play, sw.start ? "Пауза" : sw.acc ? "Продолжить" : "Старт");
    $("sw-lap").disabled = !sw.start;
    const ol = $("sw-laps");
    ol.textContent = "";
    $("sw-reset").disabled = !sw.start && !sw.acc && !sw.laps.length;
    for (let i = sw.laps.length - 1; i >= 0; i--) {
      const split = sw.laps[i] - (i ? sw.laps[i - 1] : 0);
      ol.append(tRow({ title: "Круг " + (i + 1), sub: "+" + fmtSW(split), val: fmtSW(sw.laps[i]) }));
    }
  }
  $("sw-go").addEventListener("click", () => {
    if (sw.start) { sw.acc += Date.now() - sw.start; sw.start = 0; } else sw.start = Date.now();
    saveSW(); renderSW(); renderRun(); swTick();
  });
  $("sw-lap").addEventListener("click", () => { if (sw.start) { sw.laps.push(swNow()); sw.laps = sw.laps.slice(-50); saveSW(); renderSW(); } });
  $("sw-reset").addEventListener("click", () => { sw.start = 0; sw.acc = 0; sw.laps = []; saveSW(); renderSW(); renderRun(); });

  /* Метка в шапке: идёт таймер или секундомер */
  function renderRun() {
    const el = $("clock-run");
    el.classList.toggle("done", !!timer.done);
    const show = (txt) => { el.textContent = txt; if (el.hidden || el.classList.contains("is-leaving")) animShow(el); };
    if (timer.done) show("Таймер: время вышло");
    else if (timer.end) show("Таймер " + fmtMS(timerLeft()));
    else if (sw.start) show("Секундомер " + fmtSW(swNow()).replace(/,\d$/, ""));
    else animHide(el, 150);
  }
  function timeLoop() {
    if (timer.end && Date.now() >= timer.end) {
      timer.end = 0; timer.left = 0; timer.done = true; saveTimer();
      beep(); toast("Таймер: время вышло");
      if (!$("timesheet").hidden && timeTab === "timer") renderTimer();
    }
    if (!$("timesheet").hidden) {
      if (timeTab === "timer") renderTimer();
      if (timeTab === "cities") renderCityTimes();
    }
    renderRun();
    checkDueReminders();
  }
  setInterval(timeLoop, 100 * 2.5);
  // Табло секундомера — по кадрам экрана, чтобы десятые шли ровно; работает только пока его видно и он идёт
  let swRaf = 0;
  function swFrame() {
    swRaf = 0;
    if ($("timesheet").hidden || timeTab !== "sw" || !sw.start) return;
    const t = fmtSW(swNow());
    if ($("sw-display").textContent !== t) $("sw-display").textContent = t;
    swRaf = requestAnimationFrame(swFrame);
  }
  function swTick() { if (!swRaf) swRaf = requestAnimationFrame(swFrame); }
  $("clock-run").addEventListener("click", (e) => {
    if (timer.done) { e.stopPropagation(); timer.done = false; saveTimer(); renderRun(); openTime("timer"); }
  });

  /* Напоминания */
  state.reminders = [];
  const fmtRem = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  function loadReminders() { return loadItems(); }
  const fmtHM = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const fmtDM = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "short" });
  function relDay(d) {
    const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(new Date().toDateString())) / 86400000);
    return diff === 0 ? "Сегодня" : diff === 1 ? "Завтра" : diff === -1 ? "Вчера" : fmtDM.format(d);
  }
  function renderReminders() {
    const ul = $("rem-list");
    ul.textContent = "";
    const done = (r) => !!(r.sent_at || r.failed_at);
    const next = state.reminders.filter((r) => !done(r)).sort((a, b) => new Date(a.remind_at) - new Date(b.remind_at));
    const past = state.reminders.filter(done).sort((a, b) => new Date(b.remind_at) - new Date(a.remind_at));
    const row = (r) => {
      const d = new Date(r.remind_at);
      const sub = document.createDocumentFragment();
      sub.append(relDay(d));
      if (r.sent_at) sub.append(" · отправлено");
      if (r.failed_at) {
        const bad = document.createElement("span"); bad.className = "bad";
        bad.textContent = r.error === "bot_blocked" ? " · не доставлено: откройте бота и нажмите «Старт»" : " · не доставлено";
        sub.append(bad);
      }
      return tRow({
        title: r.text, sub, val: fmtHM.format(d),
        tool: remDel.has(r.id)
          ? Object.assign(delBtn("Вернуть", () => { remDel.delete(r.id); renderReminders(); }), { innerHTML: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"/></svg>' })
          : delBtn("Удалить", () => { remDel.add(r.id); renderReminders(); }),
        cls: (done(r) ? "past" : "") + (remDel.has(r.id) ? " removed" : ""),
      });
    };
    next.forEach((r) => ul.append(row(r)));
    if (past.length) { if (next.length) ul.append(tHead("Прошедшие")); past.forEach((r) => ul.append(row(r))); }
    $("rem-empty").hidden = state.reminders.length > 0;
    renderNextRem();
  }
  /* Свои поля даты и времени вместо системных */
  const fmtDay = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "short" });
  function setRemDate(v) {
    $("rem-date").value = v;
    const [y, m, d] = v.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    $("rem-date-label").textContent = v === dayKey(new Date()) ? "Сегодня" : fmtDay.format(dt);
    dpMonth = new Date(y, m - 1, 1);
  }
  function setRemTime(v) { $("rem-time").value = v; $("rem-time-label").textContent = v; }
  let dpMonth = new Date(); dpMonth.setDate(1);
  function renderDP() {
    $("dp-title").textContent = fmtMonth.format(dpMonth).replace(" г.", "");
    const g = $("dp-grid");
    g.textContent = "";
    ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].forEach((d) => { const el = document.createElement("div"); el.className = "cal-dow"; el.textContent = d; g.append(el); });
    const start = new Date(dpMonth); start.setDate(1 - ((dpMonth.getDay() + 6) % 7));
    const today = dayKey(new Date());
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const k = dayKey(d);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dp-day" + (d.getMonth() !== dpMonth.getMonth() ? " other" : "") + (k === today ? " today" : "") + (k === $("rem-date").value ? " sel" : "");
      b.textContent = d.getDate();
      b.disabled = k < today;
      b.addEventListener("click", () => { setRemDate(k); closeMenus(null); });
      g.append(b);
    }
  }
  $("dp-prev").addEventListener("click", () => { dpMonth.setMonth(dpMonth.getMonth() - 1); renderDP(); replay($("dp-grid")); });
  $("dp-next").addEventListener("click", () => { dpMonth.setMonth(dpMonth.getMonth() + 1); renderDP(); replay($("dp-grid")); });
  $("rem-date-btn").addEventListener("click", renderDP);
  function renderTP() {
    const [h, m] = ($("rem-time").value || "09:00").split(":");
    const mk = (box, vals, cur, onPick) => {
      box.textContent = "";
      vals.forEach((v) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "tp-item" + (v === cur ? " sel" : ""); b.textContent = v;
        b.addEventListener("click", () => onPick(v));
        box.append(b);
      });
      const sel = box.querySelector(".sel"); if (sel) box.scrollTop = sel.offsetTop - box.clientHeight / 2 + sel.clientHeight / 2;
    };
    mk($("tp-hours"), Array.from({ length: 24 }, (_, i) => pad(i)), h, (v) => { setRemTime(v + ":" + m); renderTP(); });
    mk($("tp-mins"), Array.from({ length: 12 }, (_, i) => pad(i * 5)), m, (v) => { setRemTime(h + ":" + v); closeMenus(null); });
  }
  $("rem-time-btn").addEventListener("click", () => setTimeout(renderTP, 0));

  function resetRemForm() {
    $("rem-text").value = "";
    const d = new Date(Date.now() + 60 * 60000);
    setRemDate(dayKey(d));
    setRemTime(pad(d.getHours()) + ":00");
  }
  async function addReminder() {
    const text = $("rem-text").value.trim();
    const dt = new Date($("rem-date").value + "T" + $("rem-time").value);
    if (!text) { $("time-status").textContent = "Напишите, о чём напомнить"; return false; }
    if (isNaN(dt)) { setTab("rem"); $("time-status").textContent = "Укажите дату и время"; return false; }
    if (dt.getTime() < Date.now() - 60000) { setTab("rem"); $("time-status").textContent = "Это время уже прошло — выберите другое"; return false; }
    $("time-status").textContent = "Сохраняю…";
    const ok = await trackTime(async () => {
      const r = await sb.from("items").insert({ type: "reminder", title: text, remind_at: dt.toISOString(), section_id: null, position: 0 }).select(ITEM_COLS).single();
      if (r.error) throw r.error;
      state.items.push(r.data);
      itemsChanged();
    });
    if (!ok) { setTab("rem"); $("time-status").textContent = "Не сохранилось — проверьте интернет"; return false; }
    resetRemForm(); renderReminders();
    $("time-status").textContent = "Сохранено";
    return true;
  }
  $("rem-form").addEventListener("submit", (e) => { e.preventDefault(); addReminder(); });
  $("rem-add").addEventListener("click", () => addReminder());
  resetRemForm();

  // Если стол открыт в момент напоминания — показываем и здесь
  const shownRem = new Set();
  function checkDueReminders() {
    const now = Date.now();
    for (const r of dueList()) {
      if (r.sent_at || r.failed_at || shownRem.has(r.id)) continue;
      const t = new Date(r.remind_at).getTime();
      if (t <= now && now - t < 120000) { shownRem.add(r.id); beep(); toast((r.type === "task" ? "Задача: " : "Напоминание: ") + r.text); }
    }
  }

  let botUser = null;
  async function renderBotHint() {
    if (!botUser) {
      try { const r = await fetch(AUTH_FN, { headers: { apikey: SB_KEY } }); const j = await r.json(); botUser = j.username || null; } catch (e) {}
    }
    if (botUser) $("rem-add").dataset.tip = "Добавить — придёт сообщением от @" + botUser;
  }

  /* Города */
  function cities() { return (state.settings && state.settings.cities) || []; }
  function tzOffsetMin(tz, d) {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
    const g = (t) => Number(p.find((x) => x.type === t).value);
    return Math.round((Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute")) - Math.floor(d.getTime() / 60000) * 60000) / 60000);
  }
  function renderCities() {
    const ul = $("city-list");
    ul.textContent = "";
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const rows = [[localTz, true]].concat(cities().map((c) => [c, false]));
    const many = rows.length > 1;
    for (const [tz, local] of rows) {
      const lead = local ? (many ? Object.assign(document.createElement("span"), { className: "t-ph g" }) : null) : gripBtn("Город " + cityName(tz));
      const li = tRow({
        cls: "city-item" + (local ? " local" : ""), lead,
        title: local ? "Ваше время" : cityName(tz), subCls: "city-diff", valCls: "city-time",
        tool: local ? (many ? null : undefined) : delBtn("Убрать город", () => saveCities(cities().filter((c) => c !== tz))),
      });
      li.dataset.tz = tz;
      ul.append(li);
    }
    const pop = $("city-pop-list");
    pop.textContent = "";
    const chosen = new Set(cities().concat(localTz));
    const left = CITY_LIST.filter((c) => !chosen.has(c[0]));
    left.forEach(([tz, n]) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "menu-item"; b.setAttribute("role", "option"); b.textContent = n;
      b.addEventListener("click", () => { closeMenus(null); if (cities().length < 8) saveCities(cities().concat(tz)); });
      pop.append(b);
    });
    $("city-add").disabled = cities().length >= 8 || !left.length;
    renderCityTimes();
  }
  function renderCityTimes() {
    const now = new Date();
    const localOff = -now.getTimezoneOffset();
    document.querySelectorAll("#city-list .city-item").forEach((li) => {
      const tz = li.dataset.tz;
      li.querySelector(".city-time").textContent = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(now);
      if (li.classList.contains("local")) { li.querySelector(".city-diff").textContent = cityName(tz); return; }
      const d = (tzOffsetMin(tz, now) - localOff) / 60;
      const day = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, weekday: "short" }).format(now);
      li.querySelector(".city-diff").textContent = (d === 0 ? "как у вас" : (d > 0 ? "+" : "−") + Math.abs(d).toString().replace(".", ",") + " ч") + " · " + day;
    });
  }
  sortable($("city-list"), {
    item: ".city-item", handle: ".grip", fixed: ".city-item.local",
    onDrop: () => saveCities([...$("city-list").querySelectorAll(".city-item:not(.local)")].map((li) => li.dataset.tz)),
    onKey: (li, dir) => {
      const list = cities().slice(), i = list.indexOf(li.dataset.tz), j = i + dir;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]]; saveCities(list);
      const g = $("city-list").querySelector('.city-item[data-tz="' + li.dataset.tz + '"] .grip'); if (g) g.focus();
    },
  });
  // города сохраняются по «Готово» (до этого их можно отменить)
  function saveCities(list) {
    state.settings = Object.assign({}, state.settings || {}, { cities: list });
    citiesDirty = true;
    renderCities();
  }

  /* ---------- Быстрые ссылки (с группами) ---------- */
  state.links = []; state.groups = []; state.allLinks = []; state.allGroups = [];
  // ссылки у каждого стола свои: state.links / state.groups — ссылки открытого стола
  function scopeLinks() {
    state.groups = state.allGroups.filter((g) => g.desk_id === state.desk);
    state.links = state.allLinks.filter((l) => l.desk_id === state.desk);
  }
  function normUrl(u) {
    u = (u || "").trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    try { const x = new URL(u); return /^https?:$/.test(x.protocol) && x.hostname.includes(".") ? x.href : null; } catch (e) { return null; }
  }
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } };
  const groupName = (id) => { const g = state.allGroups.find((x) => x.id === id); return g ? g.name : ""; };
  function linkEl(l, cls) {
    const a = document.createElement("a");
    a.className = cls;
    a.href = l.url; a.target = "_blank"; a.rel = "noopener noreferrer";
    const ico = document.createElement("span"); ico.className = "link-ico"; ico.textContent = (l.title.trim()[0] || "•").toUpperCase();
    const t = document.createElement("span"); t.className = "link-title"; t.textContent = l.title;
    a.append(ico, t);
    a.addEventListener("click", () => closeMenus(null));
    return a;
  }
  // Список «Ссылки»: сначала без группы, затем группы с заголовками (пустые группы не показываем)
  function renderLinks() {
    const list = $("links-menu-list");
    list.textContent = "";
    if (!state.links.length) {
      const e = document.createElement("div");
      e.className = "menu-empty";
      e.textContent = "Ссылок нет";
      list.append(e);
      return;
    }
    const sections = [[null, ""]].concat(state.groups.map((g) => [g.id, g.name]));
    sections.forEach(([gid, name]) => {
      const items = state.links.filter((l) => (l.group_id || null) === gid);
      if (!items.length) return;
      const box = document.createElement("div"); box.className = "links-sec";
      const gc = gid ? (state.groups.find((g) => g.id === gid) || {}).color : null;
      if (gid) {
        const h = document.createElement("div"); h.className = "menu-label group-label";
        const dot = document.createElement("i"); dot.className = "gdot"; if (gc) dot.dataset.gcolor = gc;
        h.append(dot, document.createTextNode(name)); box.append(h);
      }
      items.forEach((l) => { const a = linkEl(l, "menu-item link-item"); a.setAttribute("role", "menuitem"); if (gc) a.dataset.gcolor = gc; box.append(a); });
      list.append(box);
    });
  }

  async function loadLinks() {
    const [g, l] = await Promise.all([
      sb.from("link_groups").select("id,name,position,color,desk_id").is("deleted_at", null).order("position").order("created_at"),
      sb.from("links").select("id,title,url,position,group_id,desk_id").is("deleted_at", null).order("position").order("created_at"),
    ]);
    if (!g.error) state.allGroups = g.data || [];
    if (!l.error) state.allLinks = l.data || [];
    scopeLinks();
    renderLinks();
  }

  /* Окно настройки: правим черновик, сохраняем при закрытии */
  let draft = [], dgroups = [], newSeq = 0, focusNext = null;
  const tmp = () => "new" + ++newSeq;
  function prepareLinks() {
    dgroups = state.groups.map((g) => ({ id: g.id, name: g.name, color: g.color || null, removed: false }));
    draft = state.links.map((l) => ({ id: l.id, title: l.title, url: l.url, gid: l.group_id || null, removed: false }));
    if (!draft.length && !dgroups.length) { const d = { id: tmp(), title: "", url: "", gid: null, removed: false, isNew: true }; draft.push(d); focusNext = d.id; }
    $("set-status").textContent = "";
    lastGid = null;
    renderDraft();
  }

  const ICON = (d, size = 16) => '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="' + d + '"/></svg>';
  const P = { up: "M6 15l6-6 6 6", down: "M6 9l6 6 6-6", x: "M6 6l12 12M18 6 6 18", undo: "M9 14l-4-4 4-4M5 10h9a5 5 0 0 1 0 10h-2", folder: "M3 7h6l2 2h10v10H3z", plus: "M12 5v14M5 12h14", check: "M5 12.5l4.5 4.5L19 7.5" };
  function tool(path, tip, onClick, disabled) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "tool"; b.innerHTML = ICON(path);
    b.dataset.tip = tip; b.setAttribute("aria-label", tip); b.disabled = !!disabled;
    if (onClick) b.addEventListener("click", onClick);
    return b;
  }
  const liveGroups = () => dgroups.filter((g) => !g.removed);

  function renderDraft() {
    const box = $("links-list");
    const keepScroll = box.scrollTop;
    box.textContent = "";
    const hasGroups = liveGroups().length > 0;
    const sections = [{ id: null, name: "Без группы" }].concat(dgroups);
    sections.forEach((g, gi) => {
      const sec = document.createElement("section");
      sec.className = "lg-sec" + (g.removed ? " removed" : "");
      sec.dataset.gid = g.id || "";
      const links = draft.filter((d) => d.gid === g.id);
      if (g.id === null && !hasGroups && !links.length) return;
      // заголовок секции
      if (g.id === null) {
        if (hasGroups) { const h = document.createElement("div"); h.className = "lg-head plain"; h.textContent = "Без группы"; sec.append(h); }
      } else {
        const h = document.createElement("div"); h.className = "lg-head" + (g.bad ? " bad" : "");
        const idx = dgroups.indexOf(g);
        const move = gripBtn("Группа «" + (g.name || "без названия") + "»"); move.classList.add("g-grip"); move.disabled = g.removed;
        const name = document.createElement("input");
        name.type = "text"; name.maxLength = 40; name.placeholder = "Название группы"; name.value = g.name; name.disabled = g.removed;
        name.className = "lg-name"; name.setAttribute("aria-label", "Название группы");
        name.addEventListener("input", () => { g.name = name.value; g.bad = false; h.classList.remove("bad"); });
        const count = document.createElement("span"); count.className = "lg-count"; count.textContent = links.length ? String(links.length) : "";
        const act = g.removed
          ? tool(P.undo, "Вернуть группу", () => { g.removed = false; (g.moved || []).forEach((id) => { const d = draft.find((x) => x.id === id); if (d) d.gid = g.id; }); g.moved = []; renderDraft(); })
          : tool(P.x, "Удалить группу", () => {
              if (g.isNew && !links.length) { dgroups.splice(idx, 1); renderDraft(); return; }
              g.removed = true; g.moved = links.map((d) => d.id); links.forEach((d) => (d.gid = null)); renderDraft();
            });
        const sw = document.createElement("button");
        sw.type = "button"; sw.className = "tool gswatch"; sw.disabled = g.removed;
        sw.dataset.tip = "Цвет группы"; sw.setAttribute("aria-label", "Цвет группы"); sw.setAttribute("aria-haspopup", "listbox"); sw.setAttribute("aria-expanded", "false");
        sw.dataset.menu = "lg-pop";
        const dot = document.createElement("i"); dot.className = "gdot big"; if (g.color) dot.dataset.gcolor = g.color; sw.append(dot);
        sw.addEventListener("click", (e) => { e.stopPropagation(); openColorPick(sw, g); });
        h.append(move, sw, name, count, act);
        sec.append(h);
        if (g.id === focusNext) setTimeout(() => name.focus(), 20);
      }
      if (!g.removed) {
        const ol = document.createElement("ol"); ol.className = "lg-links";
        links.forEach((d, li) => ol.append(linkRow(d, links, li)));
        sec.append(ol);
      }
      box.append(sec);
    });
    box.scrollTop = keepScroll;
    $("groups-new").disabled = liveGroups().length >= 15;
    $("links-new").disabled = draft.filter((x) => !x.removed).length >= 30;
    focusNext = null;
  }

  function linkRow(d, siblings, li) {
    const row = document.createElement("li");
    row.className = "link-row" + (d.removed ? " removed" : "") + (d.bad ? " bad" : "");
    if (d.id === focusNext) row.classList.add("fade-in");
    row.dataset.id = d.id;
    const move = gripBtn("Ссылка «" + (d.title || d.url || "новая") + "»"); move.classList.add("l-grip");
    const fields = document.createElement("div"); fields.className = "link-fields";
    const t = document.createElement("input"); t.type = "text"; t.maxLength = 40; t.placeholder = "Название"; t.value = d.title; t.disabled = d.removed; t.setAttribute("aria-label", "Название ссылки");
    const u = document.createElement("input"); u.type = "text"; u.maxLength = 500; u.placeholder = "Адрес, например rentikacrm.com"; u.value = d.url; u.disabled = d.removed;
    u.setAttribute("aria-label", "Адрес ссылки"); u.inputMode = "url"; u.autocomplete = "off"; u.spellcheck = false;
    t.addEventListener("input", () => { d.title = t.value; });
    u.addEventListener("input", () => { d.url = u.value; d.bad = false; row.classList.remove("bad"); });
    fields.append(t, u);
        const acts = document.createElement("div"); acts.className = "link-acts";
    if (!d.removed) {
      acts.append(tool(P.x, "Удалить", () => { if (d.isNew) draft.splice(draft.indexOf(d), 1); else d.removed = true; renderDraft(); }));
    } else acts.append(tool(P.undo, "Вернуть", () => { d.removed = false; renderDraft(); }));
    row.append(move, fields, acts);
    if (d.id === focusNext) setTimeout(() => (d.title ? u : t).focus(), 20);
    return row;
  }

  // Цвет группы: свой выбор из готовых цветов, открывается у кружка в заголовке группы
  const GCOLORS = [[null, "Без цвета"], ["sky", "Синий"], ["mint", "Зелёный"], ["sand", "Жёлтый"], ["rose", "Розовый"], ["violet", "Фиолетовый"], ["ink", "Серый"]];
  function openColorPick(btn, g) {
    const pop = $("lg-pop");
    const wasOpen = !pop.hidden && pop._for === g.id;
    closeMenus(null);
    if (wasOpen) return;
    pop._for = g.id;
    pop.textContent = "";
    const h = document.createElement("div"); h.className = "menu-label"; h.textContent = "Цвет группы"; pop.append(h);
    const grid = document.createElement("div"); grid.className = "gcolors";
    GCOLORS.forEach(([c, label]) => {
      const it = document.createElement("button");
      it.type = "button"; it.className = "gcolor"; it.setAttribute("role", "option");
      it.setAttribute("aria-checked", String((g.color || null) === c)); it.setAttribute("aria-label", label); it.dataset.tip = label;
      const dot = document.createElement("i"); dot.className = "gdot big"; if (c) dot.dataset.gcolor = c; it.append(dot);
      it.addEventListener("click", () => { closeMenus(null); g.color = c; renderDraft(); });
      grid.append(it);
    });
    pop.append(grid);
    const r = btn.getBoundingClientRect();
    animShow(pop);
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8)) + "px";
    const below = r.bottom + 4 + ph < window.innerHeight - 8;
    pop.style.top = (below ? r.bottom + 4 : Math.max(8, r.top - 4 - ph)) + "px";
    btn.setAttribute("aria-expanded", "true");
  }
  $("links-list").addEventListener("scroll", () => closeMenus(null), { passive: true });

  // Перетаскивание ссылок (в том числе между группами) и групп
  function syncFromDom() {
    const order = [];
    $("links-list").querySelectorAll(".lg-sec").forEach((sec) => {
      const gid = sec.dataset.gid || null;
      sec.querySelectorAll(".link-row").forEach((row) => { const d = draft.find((x) => x.id === row.dataset.id); if (d) { d.gid = gid; order.push(d); } });
    });
    draft.filter((d) => !order.includes(d)).forEach((d) => order.push(d));
    draft = order;
    const gorder = [...$("links-list").querySelectorAll(".lg-sec")].map((sec) => sec.dataset.gid).filter(Boolean);
    dgroups.sort((a, b) => gorder.indexOf(a.id) - gorder.indexOf(b.id));
  }
  sortable($("links-list"), {
    item: ".link-row", handle: ".l-grip", list: ".lg-links",
    listFor: (el) => { const sec = el.closest(".lg-sec:not(.removed)"); return sec && sec.querySelector(".lg-links"); },
    scroller: () => $("links-list"),
    onDrop: (row) => { syncFromDom(); lastGid = draft.find((x) => x.id === row.dataset.id).gid; renderDraft(); },
    onKey: (row, dir) => {
      const d = draft.find((x) => x.id === row.dataset.id);
      const sib = draft.filter((x) => x.gid === d.gid);
      const other = sib[sib.indexOf(d) + dir];
      if (!other) return;
      const a = draft.indexOf(d), b = draft.indexOf(other); [draft[a], draft[b]] = [draft[b], draft[a]];
      renderDraft(); const g = $("links-list").querySelector('.link-row[data-id="' + d.id + '"] .l-grip'); if (g) g.focus();
    },
  });
  sortable($("links-list"), {
    item: ".lg-sec", handle: ".g-grip", fixed: '.lg-sec[data-gid=""]',
    scroller: () => $("links-list"),
    onDrop: () => { syncFromDom(); renderDraft(); },
    onKey: (sec, dir) => {
      const i = dgroups.findIndex((g) => g.id === sec.dataset.gid), j = i + dir;
      if (j < 0 || j >= dgroups.length) return;
      [dgroups[i], dgroups[j]] = [dgroups[j], dgroups[i]];
      renderDraft(); const g = $("links-list").querySelector('.lg-sec[data-gid="' + sec.dataset.gid + '"] .g-grip'); if (g) g.focus();
    },
  });

  // Новая ссылка — в группу, с которой работали последней (иначе «Без группы»)
  let lastGid = null;
  $("links-list").addEventListener("focusin", (e) => { const sec = e.target.closest(".lg-sec"); if (sec) lastGid = sec.dataset.gid || null; });
  $("links-new").addEventListener("click", () => {
    const gid = lastGid && liveGroups().some((g) => g.id === lastGid) ? lastGid : null;
    const d = { id: tmp(), title: "", url: "", gid, removed: false, isNew: true };
    draft.push(d); focusNext = d.id; renderDraft();
  });
  $("groups-new").addEventListener("click", () => {
    const g = { id: tmp(), name: "", color: null, removed: false, isNew: true };
    dgroups.push(g); focusNext = g.id; renderDraft();
    const box = $("links-list"); box.scrollTop = box.scrollHeight;
  });

  // Сохранение ссылок при закрытии настроек; false — окно остаётся открытым
  async function saveLinks() {
    {
      closeMenus(null);
      // 1) проверка
      let bad = 0;
      const keepLinks = [];
      for (const d of draft) {
        d.bad = false;
        if (d.removed) continue;
        if (!d.title.trim() && !d.url.trim()) continue; // пустая строка — не сохраняем
        const url = normUrl(d.url);
        if (!url) { d.bad = true; bad++; continue; }
        keepLinks.push({ d, url, title: (d.title.trim() || hostOf(url)).slice(0, 40) });
      }
      const keepGroups = [];
      for (const g of dgroups) {
        g.bad = false;
        if (g.removed) continue;
        const used = keepLinks.some((k) => k.d.gid === g.id);
        if (!g.name.trim()) {
          if (used || !g.isNew) { g.bad = true; bad++; }
          continue; // новая пустая группа без названия — просто не создаём
        }
        keepGroups.push(g);
      }
      if (bad) { renderDraft(); $("set-status").textContent = "Заполните отмеченное красным"; return false; }
      $("set-status").textContent = "Сохраняю…";

      // 2) группы: удаление, создание (нужны настоящие id), переименование и порядок
      const idMap = {};
      const errs = [];
      const chk = (r) => { if (r && r.error) errs.push(r.error); return r; };
      const lmark = trashMark();
      await Promise.all(dgroups.filter((g) => g.removed && !g.isNew).map((g) => sb.from("link_groups").update(lmark).eq("id", g.id).then(chk)));
      await Promise.all(keepGroups.map(async (g, i) => {
        const name = g.name.trim().slice(0, 40);
        if (g.isNew) {
          const r = chk(await sb.from("link_groups").insert({ name, position: i, color: g.color || null, desk_id: state.desk }).select("id").single());
          if (r.data) { idMap[g.id] = r.data.id; g.id = r.data.id; g.isNew = false; }
        } else {
          const o = state.groups.find((x) => x.id === g.id);
          if (!o || o.name !== name || o.position !== i || (o.color || null) !== (g.color || null)) chk(await sb.from("link_groups").update({ name, position: i, color: g.color || null }).eq("id", g.id));
        }
      }));
      draft.forEach((d) => { if (d.gid && idMap[d.gid]) d.gid = idMap[d.gid]; });

      // 3) ссылки: порядок — сначала «Без группы», затем по группам
      const order = [null].concat(keepGroups.map((g) => g.id));
      const sorted = [];
      order.forEach((gid) => keepLinks.filter((k) => k.d.gid === gid).forEach((k) => sorted.push(k)));
      keepLinks.filter((k) => !order.includes(k.d.gid)).forEach((k) => { k.d.gid = null; sorted.push(k); });
      const ops = [];
      for (const d of draft) if (d.removed && !d.isNew) ops.push(sb.from("links").update(lmark).eq("id", d.id).then(chk));
      sorted.forEach(({ d, url, title }, i) => {
        const gid = d.gid && !String(d.gid).startsWith("new") ? d.gid : null;
        const o = state.links.find((l) => l.id === d.id);
        if (d.isNew) ops.push(sb.from("links").insert({ title, url, position: i, group_id: gid, desk_id: state.desk }).then(chk));
        else if (!o || o.title !== title || o.url !== url || o.position !== i || (o.group_id || null) !== gid)
          ops.push(sb.from("links").update({ title, url, position: i, group_id: gid }).eq("id", d.id).then(chk));
      });
      await Promise.all(ops);
      await loadLinks();
      const nRemoved = draft.filter((d) => d.removed && !d.isNew).length + dgroups.filter((g) => g.removed && !g.isNew).length;
      if (nRemoved && !errs.length) toast("Удалено из ссылок: " + nRemoved, "Вернуть", () => restoreBatch(lmark.deleted_batch));
      if (errs.length) {
        console.error(errs[0]);
        dgroups = state.groups.map((g) => ({ id: g.id, name: g.name, color: g.color || null, removed: false }));
        draft = state.links.map((l) => ({ id: l.id, title: l.title, url: l.url, gid: l.group_id || null, removed: false }));
        renderDraft();
        $("set-status").textContent = "Сохранилось не всё — проверьте интернет и нажмите «Готово» ещё раз";
        return false;
      }
      return true;
    }
  }
  function linksChanged() {
    const live = draft.filter((d) => !d.removed && (d.title.trim() || d.url.trim()));
    if (dgroups.some((g) => g.removed || g.isNew) || draft.some((d) => d.removed)) return true;
    if (live.length !== state.links.length || dgroups.length !== state.groups.length) return true;
    if (dgroups.some((g, i) => { const o = state.groups[i]; return !o || o.id !== g.id || o.name !== g.name.trim() || (o.color || null) !== (g.color || null); })) return true;
    const order = [null].concat(dgroups.map((g) => g.id));
    const sorted = [];
    order.forEach((gid) => live.filter((d) => d.gid === gid).forEach((d) => sorted.push(d)));
    return sorted.some((d, i) => { const o = state.links[i]; return !o || o.id !== d.id || o.title !== d.title.trim() || o.url !== d.url.trim() || (o.group_id || null) !== d.gid; });
  }

  /* ---------- Настройки → «Столы»: название, порядок, новый стол, удаление в корзину ---------- */
  let ddesks = [], deskFocus = null, deskSwitchTo = null;
  function prepareDesks(opts) {
    ddesks = state.desks.map((d) => ({ id: d.id, title: d.title, removed: false }));
    deskSwitchTo = null;
    if (opts && opts.newDesk && state.desks.length < DESK_MAX) addDeskDraft();
    renderDesksDraft();
  }
  function addDeskDraft() {
    const d = { id: tmp(), title: "", removed: false, isNew: true };
    ddesks.push(d); deskFocus = d.id; deskSwitchTo = d.id;
  }
  const liveDesks = () => ddesks.filter((d) => !d.removed);
  function deskStat(id) {
    const secs = state.sections.filter((f) => f.desk_id === id);
    const inDesk = state.items.filter((it) => secs.some((f) => f.id === it.section_id));
    const notes = inDesk.filter((it) => it.type === "note").length, tasks = inDesk.filter((it) => it.type === "task" && !it.done).length;
    const links = state.allLinks.filter((l) => l.desk_id === id).length;
    const parts = [secs.length + " " + plural(secs.length, "поле", "поля", "полей")];
    if (notes) parts.push(notes + " " + plural(notes, "заметка", "заметки", "заметок"));
    if (tasks) parts.push(tasks + " " + plural(tasks, "задача", "задачи", "задач"));
    if (links) parts.push(links + " " + plural(links, "ссылка", "ссылки", "ссылок"));
    return parts.join(" · ");
  }
  function renderDesksDraft() {
    const ol = $("desks-list");
    const keep = ol.scrollTop;
    ol.textContent = "";
    const live = liveDesks().length;
    ddesks.forEach((d) => {
      const li = document.createElement("li");
      li.className = "t-row desk-row" + (d.removed ? " removed" : "") + (d.bad ? " bad" : "") + (d.id === deskFocus ? " fade-in" : "");
      li.dataset.id = d.id;
      const g = gripBtn("Стол «" + (d.title || "новый") + "»"); g.classList.add("d-grip"); g.disabled = d.removed;
      const main = document.createElement("div"); main.className = "t-main";
      const inp = document.createElement("input");
      inp.type = "text"; inp.className = "desk-name"; inp.maxLength = DESK_TITLE; inp.placeholder = "Название стола";
      inp.value = d.title; inp.disabled = d.removed; inp.setAttribute("aria-label", "Название стола");
      inp.addEventListener("input", () => { d.title = inp.value; d.bad = false; li.classList.remove("bad"); });
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); inp.blur(); } });
      const sub = document.createElement("div"); sub.className = "t-sub";
      sub.textContent = d.isNew ? "Новый стол" : (d.id === state.desk ? "Открыт сейчас · " : "") + deskStat(d.id);
      main.append(inp, sub);
      let act;
      if (d.removed) act = tool(P.undo, "Вернуть стол", () => { d.removed = false; renderDesksDraft(); });
      else if (live <= 1) { act = tool(P.x, "Хотя бы один стол нужен"); act.setAttribute("aria-disabled", "true"); act.classList.add("off"); act.addEventListener("click", () => toast("Хотя бы один стол должен остаться")); }
      else act = tool(P.x, "Удалить стол", () => {
        if (d.isNew) { ddesks.splice(ddesks.indexOf(d), 1); if (deskSwitchTo === d.id) deskSwitchTo = null; }
        else d.removed = true;
        renderDesksDraft();
      });
      li.append(g, main, act);
      ol.append(li);
      if (d.id === deskFocus) setTimeout(() => inp.focus(), 20);
    });
    ol.scrollTop = keep;
    const nb = $("desks-new");
    const full = live >= DESK_MAX;
    nb.classList.toggle("off", full); nb.setAttribute("aria-disabled", String(full));
    nb.dataset.tip = full ? "Не больше " + DESK_MAX + " столов" : "Новый стол";
    deskFocus = null;
  }
  $("desks-new").addEventListener("click", () => {
    if (liveDesks().length >= DESK_MAX) { toast("Не больше " + DESK_MAX + " столов"); return; }
    addDeskDraft(); renderDesksDraft();
    const ol = $("desks-list"); ol.scrollTop = ol.scrollHeight;
  });
  sortable($("desks-list"), {
    item: ".desk-row", handle: ".d-grip", scroller: () => $("desks-list"),
    onDrop: () => { const order = [...$("desks-list").querySelectorAll(".desk-row")].map((li) => li.dataset.id); ddesks.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); renderDesksDraft(); },
    onKey: (li, dir) => {
      const i = ddesks.findIndex((d) => d.id === li.dataset.id), j = i + dir;
      if (j < 0 || j >= ddesks.length) return;
      [ddesks[i], ddesks[j]] = [ddesks[j], ddesks[i]];
      renderDesksDraft(); const g = $("desks-list").querySelector('.desk-row[data-id="' + li.dataset.id + '"] .d-grip'); if (g) g.focus();
    },
  });
  function desksChanged() {
    const keep = ddesks.filter((d) => !d.removed && !(d.isNew && !d.title.trim()));
    if (ddesks.some((d) => d.removed) || keep.length !== state.desks.length) return true;
    return keep.some((d, i) => { const o = state.desks[i]; return !o || o.id !== d.id || o.title !== d.title.trim(); });
  }
  // Удаление стола: поле, заметки, ссылки и группы этого стола — в корзину одной пачкой
  async function trashDesk(id) {
    const mark = trashMark();
    const secIds = state.sections.filter((f) => f.desk_id === id).map((f) => f.id);
    const chk = (r) => { if (r.error) throw r.error; return r; };
    if (secIds.length) chk(await sb.from("items").update(mark).in("section_id", secIds).is("deleted_at", null));
    chk(await sb.from("sections").update(mark).eq("desk_id", id).is("deleted_at", null));
    chk(await sb.from("links").update(mark).eq("desk_id", id).is("deleted_at", null));
    chk(await sb.from("link_groups").update(mark).eq("desk_id", id).is("deleted_at", null));
    chk(await sb.from("desks").update(mark).eq("id", id));
    return mark.deleted_batch;
  }
  async function saveDesks() {
    closeMenus(null);
    let bad = 0;
    ddesks.forEach((d) => { d.bad = !d.removed && !d.isNew && !d.title.trim(); if (d.bad) bad++; });
    if (bad) { renderDesksDraft(); $("set-status").textContent = "Дайте столу название"; return false; }
    $("set-status").textContent = "Сохраняю…";
    const removed = ddesks.filter((d) => d.removed && !d.isNew);
    const keep = ddesks.filter((d) => !d.removed && !(d.isNew && !d.title.trim()));
    const batches = [];
    try {
      for (const d of removed) batches.push({ title: d.title || (state.desks.find((x) => x.id === d.id) || {}).title || "", batch: await trashDesk(d.id) });
      for (let i = 0; i < keep.length; i++) {
        const d = keep[i], title = d.title.trim().slice(0, DESK_TITLE);
        if (d.isNew) {
          const r = await sb.from("desks").insert({ title, position: i }).select("id").single();
          if (r.error) throw r.error;
          if (deskSwitchTo === d.id) deskSwitchTo = r.data.id;
          d.id = r.data.id; d.isNew = false;
        } else {
          const o = state.desks.find((x) => x.id === d.id);
          if (!o || o.title !== title || o.position !== i) { const r = await sb.from("desks").update({ title, position: i }).eq("id", d.id); if (r.error) throw r.error; }
        }
      }
    } catch (e) {
      console.error(e);
      await reloadDesks();
      prepareDesks();
      $("set-status").textContent = String(e.message || "").includes("desks_limit") ? "Не больше " + DESK_MAX + " столов" : "Сохранилось не всё — проверьте интернет и нажмите «Готово» ещё раз";
      return false;
    }
    if (removed.some((d) => d.id === state.desk) && !deskSwitchTo) deskSwitchTo = keep[0] && keep[0].id;
    await reloadDesks(deskSwitchTo);
    deskSwitchTo = null;
    if (batches.length) {
      const label = batches.length === 1 ? "Стол «" + batches[0].title + "» удалён" : "Удалено столов: " + batches.length;
      toast(label, "Вернуть", async () => { let ok = true; for (const b of batches) ok = (await restoreBatch(b.batch)) && ok; if (ok) toast("Восстановлено"); });
    }
    return true;
  }
  // перечитать столы и всё, что на них, и показать нужный (или текущий) стол
  async function reloadDesks(openId) {
    if (!(await loadDesks())) return;
    if (openId && state.desks.some((d) => d.id === openId)) { state.desk = openId; store.set("cloudesk-desk", openId); }
    mergeSettings();
    renderDeskTabs();
    await Promise.all([loadItems(), loadLinks()]);
    await applyWallFromSettings();
  }

  /* ---------- Окно «Настройки»: вкладки «Оформление» и «Быстрые ссылки» ---------- */
  let setTabNow = "look", setClosing = false, setSnap = null;
  // старые фото заставки удаляются только по «Готово»; загруженные и отменённые — по «Отменить»
  const wallTrash = new Set(), wallNew = new Set();
  const SNAP_KEYS = ["theme", "wallpaper_preset", "wallpaper_path", "wallpaper_weekly", "wallpaper_week_from", "weather_on", "weather_city", "weather_lat", "weather_lon"];
  function purgeWalls(paths) {
    const keep = state.settings && state.settings.wallpaper_path;
    const list = [...paths].filter((x) => x && x !== keep);
    if (list.length) sb.storage.from("wallpapers").remove(list).then((r) => { if (r && r.error) console.error(r.error); });
  }
  function setSetTab(t) {
    setTabNow = t;
    document.querySelectorAll("#setsheet [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
    document.querySelectorAll("#setsheet [data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== t; if (!p.hidden) replay(p); });
    document.querySelectorAll("#setsheet .foot-tools").forEach((f) => (f.hidden = f.dataset.for !== t));
    if (t === "trash") renderTrash();
  }
  document.querySelectorAll("#setsheet [data-tab]").forEach((b) => b.addEventListener("click", () => { closeMenus(null); setSetTab(b.dataset.tab); }));
  function openSettings(tab, opts) {
    closeMenus(null);
    $("set-status").textContent = "";
    prepareLinks();
    prepareDesks(opts);
    setSnap = {}; SNAP_KEYS.forEach((k) => (setSnap[k] = state.settings ? state.settings[k] : undefined));
    setSnap.theme = setSnap.theme || store.get("cloudesk-theme") || "auto";
    wallTrash.clear(); wallNew.clear();
    renderWeekly();
    renderWeatherSettings();
    setSetTab(tab || setTabNow);
    animShow($("setsheet"));
    lockSheets(true);
  }
  async function closeSettings() {
    if (setClosing) return;
    setClosing = true;
    try {
      closeMenus(null);
      if (wallJob) { $("set-status").textContent = "Сохраняю…"; await wallJob; }
      if (wallFailed) { setSetTab("look"); $("set-status").textContent = "Не сохранилось — выберите заставку ещё раз."; return; }
      if (linksChanged()) {
        $("set-status").textContent = "Сохраняю…";
        if (!(await saveLinks())) { setSetTab("links"); return; }
      }
      if (desksChanged()) {
        if (!(await saveDesks())) { setSetTab("desks"); return; }
      }
      $("set-status").textContent = "";
      purgeWalls(wallTrash); wallTrash.clear(); wallNew.clear();
      animHide($("setsheet"), 170);
      lockSheets(false);
    } finally { setClosing = false; }
  }
  $("setsheet").querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeSettings));
  async function cancelSettings() {
    if (setClosing) return;
    setClosing = true;
    try {
      closeMenus(null);
      if (wallJob) { $("set-status").textContent = "Отменяю…"; await wallJob; }
      const cur = state.settings || {};
      const patch = {};
      SNAP_KEYS.forEach((k) => { if (setSnap && (cur[k] ?? null) !== (setSnap[k] ?? null)) patch[k] = setSnap[k] ?? null; });
      if (Object.keys(patch).length) {
        try { await saveSettings(patch); }
        catch (e) { console.error(e); $("set-status").textContent = "Не получилось отменить — проверьте интернет"; return; }
        if ("theme" in patch) { colorFade(); applyTheme(setSnap.theme); }
        if ("wallpaper_preset" in patch || "wallpaper_path" in patch || "wallpaper_weekly" in patch || "wallpaper_week_from" in patch) await applyWallFromSettings();
        if (Object.keys(patch).some((k) => k.startsWith("weather"))) loadWeather(true);
      }
      purgeWalls(wallNew); wallTrash.clear(); wallNew.clear();
      prepareLinks(); // черновики ссылок и столов отбрасываются
      prepareDesks();
      $("set-status").textContent = "";
      animHide($("setsheet"), 170);
      lockSheets(false);
    } finally { setClosing = false; }
  }
  $("setsheet").querySelector("[data-cancel]").addEventListener("click", cancelSettings);

  /* ---------- Корзина: удалённое за 30 дней, восстановление пачкой ---------- */
  const TRASH_DAYS = 30;
  const TRASH_ICO = { field: "M4 5h16v14H4zM4 10h16", note: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5", reminder: "M6 10a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6zM10 20a2 2 0 0 0 4 0", link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1", group: "M3 7h6l2 2h10v10H3z", task: "M4 5h16v14H4zM8 12l3 3 5-6", desk: "M3 5h8v6H3zM13 5h8v6h-8zM3 13h8v6H3zM13 13h8v6h-8z" };
  const UNDO_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"/></svg>';
  const q_ = (s) => "«" + (s.length > 40 ? s.slice(0, 40) + "…" : s) + "»";
  async function renderTrash() {
    const since = new Date(Date.now() - TRASH_DAYS * 86400000).toISOString();
    const pick = (t, cols) => sb.from(t).select(cols + ",deleted_at,deleted_batch").not("deleted_at", "is", null).gte("deleted_at", since).order("deleted_at", { ascending: false }).limit(300);
    const [it, se, li, gr, dk] = await Promise.all([pick("items", "id,type,title,body"), pick("sections", "id,app"), pick("links", "id,title"), pick("link_groups", "id,name"), pick("desks", "id,title")]);
    if ([it, se, li, gr, dk].some((r) => r.error)) { $("set-status").textContent = "Не удалось открыть корзину — проверьте интернет"; return; }
    const batches = new Map();
    const add = (kind, row) => {
      const b = batches.get(row.deleted_batch) || { at: row.deleted_at, rows: [] };
      b.rows.push(Object.assign({ kind }, row)); if (row.deleted_at > b.at) b.at = row.deleted_at;
      batches.set(row.deleted_batch, b);
    };
    se.data.forEach((r) => add("field", r)); it.data.forEach((r) => add(r.type, r)); li.data.forEach((r) => add("link", r)); gr.data.forEach((r) => add("group", r)); dk.data.forEach((r) => add("desk", r));
    const ul = $("trash-list"); ul.textContent = "";
    const list = [...batches.entries()].sort((a, b) => (a[1].at < b[1].at ? 1 : -1));
    for (const [batch, b] of list) {
      const by = (k) => b.rows.filter((r) => r.kind === k);
      const f = by("field"), notes = by("note"), rems = by("reminder"), links = by("link"), groups = by("group"), desks = by("desk"), tasks = by("task");
      const recs = () => { const p = []; if (notes.length) p.push(notes.length + " " + plural(notes.length, "заметка", "заметки", "заметок")); if (tasks.length) p.push(tasks.length + " " + plural(tasks.length, "задача", "задачи", "задач")); return p; };
      let kind, title;
      if (desks.length) {
        kind = "desk"; title = "Стол " + q_(desks[0].title || "");
        const parts = [];
        if (f.length) parts.push(f.length + " " + plural(f.length, "поле", "поля", "полей"));
        parts.push(...recs());
        if (links.length) parts.push(links.length + " " + plural(links.length, "ссылка", "ссылки", "ссылок"));
        if (parts.length) title += " · " + parts.join(", ");
      } else if (f.length) { kind = "field"; const app = APPS[f[0].app]; title = "Поле " + q_(app ? app.name : "Поле") + (recs().length ? " и " + recs().join(", ") : ""); }
      else if (notes.length) { kind = "note"; title = notes.length === 1 ? "Заметка " + q_(noteTitle(notes[0])) : notes.length + " " + plural(notes.length, "заметка", "заметки", "заметок"); }
      else if (tasks.length) { kind = "task"; title = tasks.length === 1 ? "Задача " + q_(tasks[0].title || "") : tasks.length + " " + plural(tasks.length, "задача", "задачи", "задач"); }
      else if (rems.length) { kind = "reminder"; title = rems.length === 1 ? "Напоминание " + q_(rems[0].title || "") : "Напоминаний: " + rems.length; }
      else if (links.length || groups.length) {
        kind = links.length ? "link" : "group";
        const parts = [];
        if (links.length) parts.push(links.length === 1 ? "Ссылка " + q_(links[0].title) : links.length + " " + plural(links.length, "ссылка", "ссылки", "ссылок"));
        if (groups.length) parts.push(groups.length === 1 ? "группа " + q_(groups[0].name) : groups.length + " " + plural(groups.length, "группа", "группы", "групп"));
        title = parts.join(", "); title = title.charAt(0).toUpperCase() + title.slice(1);
      } else { kind = "note"; title = "Запись"; }
      const left = Math.max(1, Math.ceil((new Date(b.at).getTime() + TRASH_DAYS * 86400000 - Date.now()) / 86400000));
      const lead = document.createElement("span"); lead.className = "trash-ico"; lead.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="' + TRASH_ICO[kind] + '"/></svg>';
      const btn = delBtn("Восстановить", async () => { btn.disabled = true; if (!(await restoreBatch(batch))) btn.disabled = false; else toast("Восстановлено"); });
      btn.innerHTML = UNDO_SVG; btn.classList.add("accent");
      const sub = document.createDocumentFragment(); sub.append("Удалено " + fmtShort.format(new Date(b.at)) + " · ещё " + left + " " + plural(left, "день", "дня", "дней"));
      ul.append(tRow({ lead, title, sub, tool: btn }));
    }
    $("trash-empty").hidden = list.length > 0;
    $("trash-clear").disabled = !list.length;
  }
  $("trash-clear").addEventListener("click", () => { $("trash-clear").hidden = true; $("trash-ask").hidden = false; replay($("trash-ask")); });
  $("trash-no").addEventListener("click", () => { $("trash-ask").hidden = true; $("trash-clear").hidden = false; });
  $("trash-yes").addEventListener("click", async () => {
    $("trash-ask").hidden = true; $("trash-clear").hidden = false;
    // файлы удалённых навсегда заметок стираем из хранилища
    const gone = await sb.from("items").select("data").not("deleted_at", "is", null);
    const paths = ((gone && gone.data) || []).flatMap((r) => ((r.data && r.data.files) || []).map((f) => f.path)).filter(Boolean);
    if (paths.length) await sb.storage.from("attachments").remove(paths);
    // и фото заставок удалённых столов
    const gd = await sb.from("desks").select("wallpaper_path").not("deleted_at", "is", null);
    const walls = ((gd && gd.data) || []).map((r) => r.wallpaper_path).filter(Boolean);
    if (walls.length) await sb.storage.from("wallpapers").remove(walls);
    const res = [];
    for (const t of TRASH_TABLES) res.push(await sb.from(t).delete().not("deleted_at", "is", null));
    if (res.some((r) => r.error)) toast("Очистилось не всё — проверьте интернет.");
    else toast("Корзина очищена");
    renderTrash();
  });
  $("btn-settings").addEventListener("click", () => openSettings("look"));
  $("links-edit-btn").addEventListener("click", () => openSettings("links"));

  /* ---------- Поиск по столу ---------- */
  const S = { items: [], active: -1 };
  const norm = (t) => (t || "").toLowerCase().replace(/ё/g, "е");
  // текст с подсветкой найденного; только текстовые узлы — без вставки HTML
  function hl(text, q) {
    const frag = document.createDocumentFragment();
    const nt = norm(text);
    let i = 0, k;
    while (q && (k = nt.indexOf(q, i)) !== -1) {
      if (k > i) frag.append(text.slice(i, k));
      const m = document.createElement("mark"); m.textContent = text.slice(k, k + q.length); frag.append(m);
      i = k + q.length;
    }
    frag.append(text.slice(i));
    return frag;
  }
  function snippet(text, q) {
    const flat = text.replace(/\s+/g, " ").trim();
    const k = norm(flat).indexOf(q);
    if (k < 0) return flat.slice(0, 80);
    const from = Math.max(0, k - 30);
    return (from ? "…" : "") + flat.slice(from, from + 90) + (flat.length > from + 90 ? "…" : "");
  }
  const ICO = {
    note: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5",
    rem: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
    task: "M4 5h16v14H4zM8 12l3 3 5-6",
    link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  };
  function resultEl(kind, title, sub, q, onPick, href) {
    const el = document.createElement(href ? "a" : "button");
    if (href) { el.href = href; el.target = "_blank"; el.rel = "noopener noreferrer"; } else el.type = "button";
    el.className = "menu-item search-item";
    el.setAttribute("role", "option");
    el.innerHTML = '<svg class="search-ico" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="' + ICO[kind] + '"/></svg>';
    const box = document.createElement("span"); box.className = "search-text";
    const t = document.createElement("span"); t.className = "search-title"; t.append(hl(title, q));
    box.append(t);
    if (sub) { const s2 = document.createElement("span"); s2.className = "search-sub"; s2.append(hl(sub, q)); box.append(s2); }
    el.append(box);
    el.addEventListener("click", () => { closeSearch(true); if (onPick) onPick(); });
    return el;
  }
  function runSearch() {
    const raw = $("search-input").value;
    const q = norm(raw.trim());
    $("search-clear").hidden = !raw;
    const pop = $("search-list");
    pop.textContent = "";
    S.items = []; S.active = -1;
    if (!q) { hidePop(); return; }
    const groups = [];
    // заметки; во второй строке — поле и фрагмент текста
    // если столов несколько — во второй строке название стола; выбор открывает нужный стол
    const many = state.desks.length > 1;
    const deskOf = (secId) => { const f = state.sections.find((x) => x.id === secId); return f ? state.desks.find((d) => d.id === f.desk_id) : null; };
    const fieldName = (it) => { const d = many && deskOf(it.section_id); return d ? d.title : ""; };
    const notes = state.items.filter((it) => it.type === "note" && norm((it.title || "") + " " + stripMarks(it.body)).includes(q)).slice(0, 6).map((it) => {
      const title = noteTitle(it);
      const extra = norm(title).includes(q) ? snippet(noteSub(it), "") : snippet(noteSub(it), q);
      return resultEl("note", title, [fieldName(it), extra].filter(Boolean).join(" · "), q, async () => { const d = deskOf(it.section_id); if (d && d.id !== state.desk) await switchDesk(d.id); openEditor(it.id); });
    });
    if (notes.length) groups.push(["Заметки", notes]);
    const tasks = state.items.filter((it) => it.type === "task" && norm(it.title + " " + (it.body || "") + " " + ((tData(it).subs || []).map((x) => x.t).join(" "))).includes(q))
      .sort((a, b) => !!a.done - !!b.done).slice(0, 6).map((it) => {
        const dt = tData(it);
        const sub = [fieldName(it), it.done ? "выполнено" : dt.due ? dueLabel(dt.due, dt.allday) : "", norm(it.title).includes(q) ? "" : snippet(it.body || "", q)].filter(Boolean).join(" · ");
        return resultEl("task", it.title, sub, q, async () => { const d = deskOf(it.section_id); if (d && d.id !== state.desk) await switchDesk(d.id); openItem(it.id); });
      });
    if (tasks.length) groups.push(["Задачи", tasks]);
    const rems = (state.reminders || []).filter((r) => norm(r.text).includes(q)).slice(0, 5).map((r) =>
      resultEl("rem", r.text, fmtRem.format(new Date(r.remind_at)) + (r.sent_at ? " · отправлено" : ""), q, () => openItem(r.id)));
    if (rems.length) groups.push(["Напоминания", rems]);
    const linkDesk = (l) => { const d = many && state.desks.find((x) => x.id === l.desk_id); return d ? d.title + " · " : ""; };
    const links = state.allLinks.filter((l) => norm(l.title).includes(q) || norm(l.url).includes(q)).slice(0, 6).map((l) =>
      resultEl("link", l.title, linkDesk(l) + (l.group_id && groupName(l.group_id) ? groupName(l.group_id) + " · " : "") + hostOf(l.url), q, null, l.url));
    if (links.length) groups.push(["Ссылки", links]);
    if (!groups.length) {
      const e = document.createElement("div"); e.className = "menu-empty";
      e.textContent = "Ничего не найдено";
      pop.append(e);
    }
    groups.forEach(([name, els]) => {
      const g = document.createElement("div"); g.className = "menu-group";
      const h = document.createElement("div"); h.className = "menu-label"; h.textContent = name;
      g.append(h, ...els); pop.append(g);
      S.items.push(...els);
    });
    if (S.items.length) setActive(0);
    showPop();
  }
  function setActive(i) {
    S.items.forEach((el) => el.classList.remove("active"));
    S.active = i;
    const el = S.items[i];
    if (el) { el.classList.add("active"); el.scrollIntoView({ block: "nearest" }); }
  }
  function showPop() { if ($("search-pop").hidden) animShow($("search-pop")); $("search-input").setAttribute("aria-expanded", "true"); }
  function hidePop() { animHide($("search-pop"), 120); $("search-input").setAttribute("aria-expanded", "false"); }
  function closeSearch(clear) {
    hidePop();
    if (clear) { $("search-input").value = ""; $("search-clear").hidden = true; }
    $("search-input").blur();
    collapseSearch();
  }
  // поле сворачивается обратно в лупу — плавно тает в сторону значка
  let collapseT = 0;
  function collapseSearch() {
    const top = document.querySelector(".top"), inner = document.querySelector(".search-inner");
    if (!top.classList.contains("searching")) return;
    inner.classList.add("is-leaving");
    clearTimeout(collapseT);
    collapseT = setTimeout(() => { inner.classList.remove("is-leaving"); top.classList.remove("searching"); }, 120);
  }
  $("search-input").addEventListener("input", runSearch);
  $("search-input").addEventListener("focus", () => { closeMenus(null); if ($("search-input").value.trim()) runSearch(); });
  $("search-input").addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && S.items.length) { e.preventDefault(); setActive((S.active + 1) % S.items.length); }
    else if (e.key === "ArrowUp" && S.items.length) { e.preventDefault(); setActive((S.active - 1 + S.items.length) % S.items.length); }
    else if (e.key === "Enter") { e.preventDefault(); const el = S.items[S.active]; if (el) el.click(); }
    else if (e.key === "Escape") { e.stopPropagation(); if ($("search-input").value) { $("search-input").value = ""; runSearch(); } else closeSearch(false); }
  });
  $("search-clear").addEventListener("click", () => { $("search-input").value = ""; runSearch(); $("search-input").focus(); });
  // клик мимо поиска закрывает список результатов
  document.addEventListener("click", (e) => { if (!e.composedPath().includes($("search"))) { hidePop(); if (!$("search-input").value) collapseSearch(); } });
  // лупа разворачивает поле (на телефоне — на всю шапку)
  $("search-open").addEventListener("click", () => { closeMenus(null); clearTimeout(collapseT); document.querySelector(".search-inner").classList.remove("is-leaving"); document.querySelector(".top").classList.add("searching"); $("search-input").focus(); });
  $("search-cancel").addEventListener("click", () => closeSearch(true));
  // «/» или Ctrl+K — сразу в поиск (если не печатаете в поле и не открыто окно)
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName);
    const sheetOpen = [...document.querySelectorAll(".sheet-wrap")].some((w) => !w.hidden);
    if (sheetOpen || $("desk").hidden) return;
    if ((e.key === "/" && !typing) || ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "л"))) {
      e.preventDefault();
      $("search-open").click();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("editor").hidden) closeEditor();
    else if (!$("itemsheet").hidden) closeItem();
    else if (!$("secsheet").hidden) closeField();
    else if (!$("setsheet").hidden) closeSettings();
    else if (!$("timesheet").hidden) closeTime();
  });

  // Клик по фону вокруг окна закрывает окно и не доходит до того, что под ним
  document.querySelectorAll(".sheet-backdrop").forEach((bd) =>
    ["pointerdown", "mousedown", "touchstart"].forEach((t) => bd.addEventListener(t, (e) => e.stopPropagation(), { passive: true })));
  document.querySelectorAll(".sheet-backdrop").forEach((bd) => bd.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); }));

  /* ---------- Шапка: ближайшее напоминание сегодня ---------- */
  function renderNextRem() {
    const now = new Date(), today = now.toDateString();
    const tasks = state.items.filter((t) => t.type === "task" && !t.done && tData(t).due && !tData(t).allday)
      .map((t) => ({ id: t.id, text: t.title, remind_at: tData(t).due, type: "task" }));
    const next = dueList().filter((r) => r.type === "reminder" && !r.sent_at && !r.failed_at).concat(tasks)
      .filter((r) => new Date(r.remind_at) > now && new Date(r.remind_at).toDateString() === today)
      .sort((a, b) => new Date(a.remind_at) - new Date(b.remind_at))[0];
    nextRemFor = next || null;
    const el = $("next-rem");
    if (!next) { if (!el.hidden) animHide(el, 150); return; }
    const t = fmtHM.format(new Date(next.remind_at));
    if ($("next-rem-text").textContent !== next.text) $("next-rem-text").textContent = next.text;
    if ($("next-rem-time").textContent !== t) $("next-rem-time").textContent = t;
    el.setAttribute("aria-label", (next.type === "task" ? "Ближайшая задача: " : "Ближайшее напоминание: ") + next.text + ", " + t);
    el.dataset.tip = next.type === "task" ? "Задача на сегодня" : "Напоминание";
    if (el.hidden || el.classList.contains("is-leaving")) animShow(el);
  }
  let nextRemFor = null;
  $("next-rem").addEventListener("click", async () => {
    if (nextRemFor && nextRemFor.type === "task") {
      const it = state.items.find((x) => x.id === nextRemFor.id);
      const f = it && state.sections.find((x) => x.id === it.section_id);
      if (f && f.desk_id !== state.desk) await switchDesk(f.desk_id);
      openItem(nextRemFor.id);
    } else openTime("rem");
  });

  /* ---------- Шапка: нет интернета ---------- */
  function renderOnline() {
    const el = $("offline");
    if (navigator.onLine) { if (!el.hidden) animHide(el, 150); }
    else if (el.hidden || el.classList.contains("is-leaving")) animShow(el);
  }
  window.addEventListener("offline", renderOnline);
  window.addEventListener("online", () => { renderOnline(); loadWeather(true); if (state.user) loadReminders(); });

  /* ---------- Шапка: погода (Open-Meteo, без ключей и без данных о вас — только координаты города) ---------- */
  const W_ICO = {
    sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
    moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
    part: "M8 2.5v1.5M3 7.5h1.5M4.5 4l1 1M11.5 5a4 4 0 0 0-6.6 4M9 20h8a3.5 3.5 0 0 0 .5-7 5 5 0 0 0-9.6 1.2A3 3 0 0 0 9 20z",
    cloud: "M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z",
    fog: "M4 9h16M6 13h12M4 17h16M8 5h8",
    rain: "M7 15h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 6.5 4.3 4.3 0 0 0 7 15zM8 18l-1 3M12 18l-1 3M16 18l-1 3",
    snow: "M7 15h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 6.5 4.3 4.3 0 0 0 7 15zM8 19h.01M12 19h.01M16 19h.01M10 21.5h.01M14 21.5h.01",
    storm: "M7 15h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 6.5 4.3 4.3 0 0 0 7 15zM13 14l-2 4h3l-2 4",
  };
  function wmo(code, day) {
    if (code === 0) return [day ? "sun" : "moon", "ясно"];
    if (code === 1 || code === 2) return [day ? "part" : "moon", code === 1 ? "малооблачно" : "переменная облачность"];
    if (code === 3) return ["cloud", "пасмурно"];
    if (code === 45 || code === 48) return ["fog", "туман"];
    if (code >= 51 && code <= 57) return ["rain", "морось"];
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ["rain", code >= 80 ? "ливень" : "дождь"];
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ["snow", "снег"];
    if (code >= 95) return ["storm", "гроза"];
    return ["cloud", "облачно"];
  }
  const wIco = (k, size) => '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="' + W_ICO[k] + '"/></svg>';
  const fmtTemp = (t) => { const v = Math.round(t); return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v) + "°"; };
  const weatherOn = () => !(state.settings && state.settings.weather_on === false);
  // город по умолчанию — по часовому поясу устройства
  const autoCity = () => cityName(Intl.DateTimeFormat().resolvedOptions().timeZone);
  let wLast = null;
  function renderWeather(w) {
    const el = $("weather");
    if (!w || !weatherOn()) { el.hidden = true; renderWeatherNow(); return; }
    wLast = w;
    const [k, label] = wmo(w.code, w.day);
    $("weather-ico").innerHTML = wIco(k, 16);
    $("weather-t").textContent = fmtTemp(w.t);
    el.dataset.tip = w.city + ": " + label + " · ощущается " + fmtTemp(w.feels);
    el.setAttribute("aria-label", "Погода: " + w.city + ", " + fmtTemp(w.t) + ", " + label);
    if (el.hidden) animShow(el);
    renderWeatherNow();
  }
  function renderWeatherNow() {
    const box = $("weather-now");
    box.textContent = "";
    if (!wLast || !weatherOn()) return;
    const [k, label] = wmo(wLast.code, wLast.day);
    box.innerHTML = '<span class="wn-ico">' + wIco(k, 40) + '</span><span class="wn-t"></span><span class="wn-d"><b></b><span></span></span>';
    box.querySelector(".wn-t").textContent = fmtTemp(wLast.t);
    box.querySelector(".wn-d b").textContent = wLast.city;
    box.querySelector(".wn-d span").textContent = label.charAt(0).toUpperCase() + label.slice(1) + " · ощущается " + fmtTemp(wLast.feels);
  }
  async function geocode(name, count) {
    const r = await fetch("https://geocoding-api.open-meteo.com/v1/search?count=" + count + "&language=ru&format=json&name=" + encodeURIComponent(name));
    if (!r.ok) throw new Error("geo " + r.status);
    return ((await r.json()).results || []).map((g) => ({ name: g.name, lat: g.latitude, lon: g.longitude, sub: [g.admin1, g.country].filter(Boolean).join(", ") }));
  }
  let wTimer = 0;
  async function loadWeather(force) {
    clearTimeout(wTimer);
    wTimer = setTimeout(() => loadWeather(true), 30 * 60000);
    if (!weatherOn()) { renderWeather(null); return; }
    const s = state.settings || {};
    let place = s.weather_lat != null && s.weather_lon != null ? { name: s.weather_city || autoCity(), lat: s.weather_lat, lon: s.weather_lon } : null;
    try {
      if (!place) {
        const want = autoCity();
        let cached = null; try { cached = JSON.parse(store.get("cloudesk-wgeo")); } catch (e) {}
        if (cached && cached.q === want) place = cached;
        else { const g = (await geocode(want, 1))[0]; if (!g) return; place = { q: want, name: g.name, lat: g.lat, lon: g.lon }; store.set("cloudesk-wgeo", JSON.stringify(place)); }
      }
      let c = null; try { c = JSON.parse(store.get("cloudesk-weather")); } catch (e) {}
      if (!force && c && c.lat === place.lat && c.lon === place.lon && Date.now() - c.at < 30 * 60000) { renderWeather(c); return; }
      const r = await fetch("https://api.open-meteo.com/v1/forecast?current=temperature_2m,apparent_temperature,weather_code,is_day&timezone=auto&latitude=" + place.lat + "&longitude=" + place.lon);
      if (!r.ok) throw new Error("weather " + r.status);
      const cur = (await r.json()).current;
      const w = { city: place.name, lat: place.lat, lon: place.lon, t: cur.temperature_2m, feels: cur.apparent_temperature, code: cur.weather_code, day: !!cur.is_day, at: Date.now() };
      store.set("cloudesk-weather", JSON.stringify(w));
      renderWeather(w);
    } catch (e) { console.error(e); }
  }
  // сразу показываем погоду из прошлого раза (если свежая — до 3 часов), потом обновляем
  (() => { try { const c = JSON.parse(store.get("cloudesk-weather")); if (c && Date.now() - c.at < 3 * 3600000) wLast = c; } catch (e) {} })();
  $("weather").addEventListener("click", () => openSettings("weather"));

  /* Настройки → Погода */
  function renderWeatherSettings() {
    const s = state.settings || {};
    $("weather-on").setAttribute("aria-checked", String(weatherOn()));
    $("weather-city").value = s.weather_city || "";
    $("weather-city").placeholder = autoCity() + " — по часовому поясу";
    $("weather-city").disabled = !weatherOn();
    renderWeatherNow();
  }
  async function saveWeather(patch) {
    const prev = state.settings;
    state.settings = Object.assign({}, prev || {}, patch);
    renderWeatherSettings();
    loadWeather(true);
    try { await saveSettings(patch); }
    catch (e) { console.error(e); state.settings = prev; renderWeatherSettings(); loadWeather(true); toast("Настройка погоды не сохранилась. Попробуйте ещё раз."); }
  }
  $("weather-on").addEventListener("click", () => saveWeather({ weather_on: !weatherOn() }));
  $("weather-refresh").addEventListener("click", () => loadWeather(true));
  let wq = 0;
  $("weather-city").addEventListener("input", () => {
    clearTimeout(wq);
    const q = $("weather-city").value.trim();
    if (q.length < 2) { closeMenus(null); return; }
    wq = setTimeout(async () => {
      let list = [];
      try { list = await geocode(q, 8); } catch (e) { console.error(e); }
      if ($("weather-city").value.trim() !== q) return;
      const box = $("weather-list");
      box.textContent = "";
      if (!list.length) { const e = document.createElement("div"); e.className = "menu-empty"; e.textContent = "Ничего не найдено"; box.append(e); }
      list.forEach((g) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "menu-item search-item"; b.setAttribute("role", "option");
        const tx = document.createElement("span"); tx.className = "search-text";
        const t1 = document.createElement("span"); t1.className = "search-title"; t1.textContent = g.name;
        const t2 = document.createElement("span"); t2.className = "search-sub"; t2.textContent = g.sub;
        tx.append(t1, t2); b.append(tx);
        b.addEventListener("click", () => {
          closeMenus(null);
          $("weather-city").value = g.name;
          saveWeather({ weather_city: g.name.slice(0, 80), weather_lat: g.lat, weather_lon: g.lon });
        });
        box.append(b);
      });
      const pop = $("weather-pop");
      if (pop.hidden) { closeMenus(null); animShow(pop); $("weather-city").setAttribute("aria-expanded", "true"); }
    }, 300);
  });
  // поле очистили — снова город по часовому поясу
  $("weather-city").addEventListener("change", () => {
    if (!$("weather-city").value.trim() && (state.settings || {}).weather_city) saveWeather({ weather_city: null, weather_lat: null, weather_lon: null });
  });
  $("weather-city").addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("weather-pop").hidden) { e.stopPropagation(); closeMenus(null); } });

  /* ---------- Старт ---------- */
  buildPresets();
  paintPresetPreviews();
  applyTheme(store.get("cloudesk-theme"));
  setInterval(tick, 20000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });

  sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT" && !$("desk").hidden) showLogin("Сессия закончилась. Войдите снова.");
  });

  sb.auth.getSession().then(({ data }) => {
    if (data.session) showDesk(); else showLogin();
  });
})();
