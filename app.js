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
      item.after(ph);
      item.classList.add("dragging");
      Object.assign(item.style, { width: r.width + "px", left: r.left + "px", top: r.top + "px" });
      const dy0 = e.clientY - r.top;
      let lastY = e.clientY, raf = 0, done = false;
      try { h.setPointerCapture(e.pointerId); } catch (err) {}
      const scroller = o.scroller ? o.scroller() : null;
      const place = (x, y) => {
        item.style.transform = "translateY(" + (y - dy0 - r.top) + "px)";
        const el = document.elementFromPoint(x, y);
        if (!el || !root.contains(el)) return;
        const over = el.closest(o.item);
        if (over && over !== item && root.contains(over)) {
          const rr = over.getBoundingClientRect();
          const before = y < rr.top + rr.height / 2 && !(o.fixed && over.matches(o.fixed));
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
        if (v) { scroller.scrollTop += v; place(e.clientX, lastY); raf = requestAnimationFrame(tick); }
      };
      const move = (ev) => { lastY = ev.clientY; place(ev.clientX, ev.clientY); if (!raf) raf = requestAnimationFrame(tick); };
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
  const FADE_SEL = ".tab-panel, .stage-below, .t-list, .links-list, #links-menu-list, .pop-scroll, .tp-list, .ed-body, .presets, .notes";
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
  function toast(text) {
    const t = $("toast");
    t.textContent = text;
    animShow(t);
    replay(t, "toast-in");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => animHide(t, 180), 4000);
  }

  const fmtTime = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const fmtDate = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  const fmtShort = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  function tick() {
    const now = new Date();
    $("clock-time").textContent = fmtTime.format(now);
    const d = fmtDate.format(now);
    $("clock-date").textContent = d.charAt(0).toUpperCase() + d.slice(1);
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
  function renderUser() {
    const p = state.profile || {};
    const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.username || "Вы";
    $("user-name").textContent = name;
    $("user-handle").textContent = p.username ? "@" + p.username : "Telegram";
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
    state.notes = [];
    $("notes").textContent = "";
    showLogin("Вы вышли.");
  });

  /* ---------- Загрузка данных ---------- */
  async function loadAll() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return showLogin();
    state.user = user;
    $("notes-loading").hidden = false;
    $("notes-empty").hidden = true;

    const [prof, notes, sets] = await Promise.all([
      sb.from("profiles").select("first_name,last_name,username,photo_url").eq("id", user.id).maybeSingle(),
      sb.from("notes").select("id,body,color,pinned,updated_at").order("pinned", { ascending: false }).order("updated_at", { ascending: false }),
      sb.from("settings").select("wallpaper_preset,wallpaper_path,wallpaper_weekly,wallpaper_week_from,theme,cities").eq("user_id", user.id).maybeSingle(),
    ]);
    $("notes-loading").hidden = true;

    if (prof.error || !prof.data) {
      await sb.auth.signOut();
      return showLogin("Учётная запись не найдена. Войдите через Telegram ещё раз.");
    }
    state.profile = prof.data;
    renderUser();

    if (notes.error) toast("Не удалось загрузить заметки. Обновите страницу.");
    state.notes = notes.data || [];
    renderNotes();

    state.settings = sets.data || null;
    applyTheme(state.settings && state.settings.theme);
    loadReminders();
    loadLinks();
    await applyWallFromSettings();
  }

  /* ---------- Заметки ---------- */
  function sortNotes() {
    state.notes.sort((a, b) => (b.pinned - a.pinned) || (new Date(b.updated_at) - new Date(a.updated_at)));
  }

  const seenNotes = new Set();
  let notesFirstPaint = true;
  function renderNotes() {
    sortNotes();
    const box = $("notes");
    box.textContent = "";
    const frag = document.createDocumentFragment();
    for (const n of state.notes) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "note";
      el.dataset.color = n.color;
      el.dataset.id = n.id;
      if (!seenNotes.has(n.id)) { seenNotes.add(n.id); if (!notesFirstPaint) el.classList.add("fade-in"); }
      const lines = n.body.split("\n");
      const title = (lines[0] || "").trim() || "Без заголовка";
      const rest = lines.slice(1).join("\n").trim();
      const h = document.createElement("p");
      h.className = "note-title";
      h.textContent = title;
      el.append(h);
      if (rest) {
        const p = document.createElement("p");
        p.className = "note-text";
        p.textContent = rest;
        el.append(p);
      }
      const meta = document.createElement("div");
      meta.className = "note-meta";
      meta.textContent = fmtShort.format(new Date(n.updated_at));
      el.append(meta);
      if (n.pinned) {
        const pin = document.createElement("span");
        pin.className = "note-pin";
        pin.setAttribute("aria-label", "Закреплена");
        pin.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M9 3h6l-1 6 4 4H6l4-4zM11 13h2v8h-2z"/></svg>';
        el.append(pin);
      }
      el.addEventListener("click", () => openEditor(n.id));
      frag.append(el);
    }
    box.append(frag);
    notesFirstPaint = false;
    $("notes-empty").hidden = state.notes.length > 0;
    $("notes-count").textContent = state.notes.length ? String(state.notes.length) : "";
  }

  // Редактор: новая заметка сохраняется, когда в ней появился текст; дальше — автосохранение
  const ed = { id: null, color: "paper", pinned: false, timer: null, saving: null, dirty: false };

  function setEdColor(c) {
    ed.color = c;
    document.querySelector("#editor .note-sheet").dataset.color = c;
    document.querySelectorAll("#editor .dot").forEach((d) => d.setAttribute("aria-checked", String(d.dataset.color === c)));
  }
  document.querySelectorAll("#editor .dot").forEach((d) => {
    d.setAttribute("role", "radio");
    d.addEventListener("click", () => { setEdColor(d.dataset.color); queueSave(0); });
  });

  function openEditor(id) {
    const n = id ? state.notes.find((x) => x.id === id) : null;
    ed.id = n ? n.id : null;
    ed.pinned = n ? n.pinned : false;
    ed.dirty = false;
    $("ed-body").value = n ? n.body : "";
    $("ed-pin").setAttribute("aria-pressed", String(ed.pinned));
    $("ed-delete").hidden = !n;
    $("ed-confirm").hidden = true;
    $("ed-actions").hidden = false;
    $("ed-title").textContent = n ? "Заметка" : "Новая заметка";
    $("ed-status").textContent = n ? "Сохранено" : "";
    setEdColor(n ? n.color : "paper");
    animShow($("editor"));
    lockSheets(true);
    setTimeout(() => $("ed-body").focus(), 30);
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
    const body = $("ed-body").value;
    if (!ed.id && !body.trim()) { ed.dirty = false; $("ed-status").textContent = ""; return; }
    ed.dirty = false;
    ed.saving = (async () => {
      const row = { body, color: ed.color, pinned: ed.pinned };
      let res;
      if (ed.id) {
        res = await sb.from("notes").update(row).eq("id", ed.id).select("id,body,color,pinned,updated_at").single();
      } else {
        res = await sb.from("notes").insert(row).select("id,body,color,pinned,updated_at").single();
      }
      if (res.error) {
        console.error(res.error);
        ed.dirty = true;
        $("ed-status").textContent = "Не сохранилось — проверьте интернет";
        return;
      }
      const saved = res.data;
      const i = state.notes.findIndex((x) => x.id === saved.id);
      if (i >= 0) state.notes[i] = saved; else state.notes.push(saved);
      ed.id = saved.id;
      $("ed-delete").hidden = false;
      $("ed-status").textContent = "Сохранено";
      renderNotes();
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
      // пустая заметка не нужна
      if (ed.id && !$("ed-body").value.trim() && !(await deleteNote(true))) return;
      animHide($("editor"), 170);
      lockSheets(false);
    } finally {
      edClosing = false;
    }
  }

  async function deleteNote(silent) {
    if (!ed.id) return true;
    const { error } = await sb.from("notes").delete().eq("id", ed.id);
    if (error) { toast("Не удалось удалить. Попробуйте ещё раз."); return false; }
    state.notes = state.notes.filter((x) => x.id !== ed.id);
    ed.id = null;
    renderNotes();
    if (!silent) { animHide($("editor"), 170); lockSheets(false); toast("Заметка удалена"); }
    return true;
  }

  $("btn-new").addEventListener("click", () => openEditor(null));
  $("ed-body").addEventListener("input", () => queueSave());
  $("ed-pin").addEventListener("click", () => {
    ed.pinned = !ed.pinned;
    $("ed-pin").setAttribute("aria-pressed", String(ed.pinned));
    queueSave(0);
  });
  $("ed-delete").addEventListener("click", () => { $("ed-actions").hidden = true; $("ed-confirm").hidden = false; replay($("ed-confirm")); });
  $("ed-confirm-no").addEventListener("click", () => { $("ed-confirm").hidden = true; $("ed-actions").hidden = false; replay($("ed-actions")); });
  $("ed-confirm-yes").addEventListener("click", () => deleteNote(false));
  $("editor").querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeEditor));

  /* ---------- Заставка ---------- */
  function setWall(preset, url) {
    const wall = $("wall");
    if (!reduceMotion && document.body.dataset.wallReady) {
      const old = wall.cloneNode(false);
      old.removeAttribute("id");
      old.style.backgroundImage = getComputedStyle(wall).backgroundImage;
      old.classList.add("wall-old");
      wall.after(old);
      requestAnimationFrame(() => requestAnimationFrame(() => old.classList.add("go")));
      setTimeout(() => old.remove(), 450);
      colorFade();
    }
    document.body.dataset.wallReady = "1";
    if (url) {
      document.body.dataset.wall = "custom";
      wall.style.backgroundImage = 'url("' + url + '")';
    } else {
      const p = PRESETS.find((x) => x.id === preset) || PRESETS[0];
      document.body.dataset.wall = p.id;
      wall.style.backgroundImage = "";
      setAccent(p.h, p.s);
    }
    document.querySelectorAll(".preset").forEach((p) =>
      p.setAttribute("aria-checked", String(!url && p.dataset.preset === (preset || "dusk"))));
  }

  async function applyWallFromSettings() {
    const s = state.settings;
    if (s && s.wallpaper_path) {
      const { data, error } = await sb.storage.from("wallpapers").download(s.wallpaper_path);
      if (!error && data) {
        if (state.wallUrl) URL.revokeObjectURL(state.wallUrl);
        state.wallUrl = URL.createObjectURL(data);
        setWall(null, state.wallUrl);
        accentFromImage(data);
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
      if (old) await sb.storage.from("wallpapers").remove([old]);
    }, "Настройка не сохранилась. Попробуйте ещё раз.");
  });
  // наступила новая неделя, пока стол открыт
  setInterval(() => {
    const s = state.settings;
    if (s && s.wallpaper_weekly && !s.wallpaper_path && document.body.dataset.wall !== shownPreset()) setWall(shownPreset(), null);
  }, 60000);

  async function saveSettings(patch) {
    const row = Object.assign({ user_id: state.user.id }, state.settings || {}, patch);
    const { data, error } = await sb.from("settings").upsert(row, { onConflict: "user_id" })
      .select("wallpaper_preset,wallpaper_path,wallpaper_weekly,wallpaper_week_from,theme,cities").single();
    if (error) throw error;
    state.settings = data;
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
          if (old) await sb.storage.from("wallpapers").remove([old]);
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
    const was = document.body.dataset.wall;
    document.querySelectorAll(".preset").forEach((b) => {
      document.body.dataset.wall = b.dataset.preset;
      b.style.backgroundImage = getComputedStyle(probe).backgroundImage;
    });
    document.body.dataset.wall = was;
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
      if (old && old !== path) await sb.storage.from("wallpapers").remove([old]);
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

  function openTime(tab) {
    closeMenus(null);
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
      $("time-status").textContent = "";
      animHide($("timesheet"), 170);
      lockSheets(false);
    } finally { timeClosing = false; }
  }
  $("timesheet").querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeTime));

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
    const remDays = new Map();
    state.reminders.filter((r) => !r.sent_at && !r.failed_at).forEach((r) => { const k = dayKey(new Date(r.remind_at)); remDays.set(k, (remDays.get(k) || 0) + 1); });
    const now = new Date();
    $("cal-today").disabled = calMonth.getFullYear() === now.getFullYear() && calMonth.getMonth() === now.getMonth();
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cal-day" + (d.getMonth() !== calMonth.getMonth() ? " other" : "") + (d.getDay() % 6 === 0 ? " weekend" : "") + (dayKey(d) === today ? " today" : "");
      b.textContent = d.getDate();
      const n = remDays.get(dayKey(d));
      if (n) { const dot = document.createElement("i"); dot.className = "dot"; b.append(dot); b.dataset.tip = n + " " + plural(n, "напоминание", "напоминания", "напоминаний"); }
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
  async function loadReminders() {
    const { data, error } = await sb.from("reminders").select("id,text,remind_at,sent_at,failed_at,error")
      .gte("remind_at", new Date(Date.now() - 7 * 86400000).toISOString()).order("remind_at");
    if (!error) { state.reminders = data || []; renderReminders(); if (!$("timesheet").hidden && timeTab === "cal") renderCal(); }
  }
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
        cls: done(r) ? "past" : "", title: r.text, sub, val: fmtHM.format(d),
        tool: delBtn("Удалить", () => trackTime(async () => {
          const { error } = await sb.from("reminders").delete().eq("id", r.id);
          if (error) { toast("Не удалось удалить. Попробуйте ещё раз."); throw error; }
          state.reminders = state.reminders.filter((x) => x.id !== r.id);
          renderReminders();
        })),
      });
    };
    next.forEach((r) => ul.append(row(r)));
    if (past.length) { if (next.length) ul.append(tHead("Прошедшие")); past.forEach((r) => ul.append(row(r))); }
    $("rem-empty").hidden = state.reminders.length > 0;
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
      const { data, error } = await sb.from("reminders").insert({ text, remind_at: dt.toISOString() }).select("id,text,remind_at,sent_at,failed_at,error").single();
      if (error) throw error;
      state.reminders.push(data);
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
    for (const r of state.reminders) {
      if (r.sent_at || r.failed_at || shownRem.has(r.id)) continue;
      const t = new Date(r.remind_at).getTime();
      if (t <= now && now - t < 120000) { shownRem.add(r.id); beep(); toast("Напоминание: " + r.text); }
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
  function saveCities(list) {
    const prev = cities();
    state.settings = Object.assign({}, state.settings || {}, { cities: list });
    renderCities();
    trackTime(async () => {
      try { await saveSettings({ cities: list }); }
      catch (e) { state.settings.cities = prev; renderCities(); toast("Город не сохранился. Попробуйте ещё раз."); throw e; }
    });
  }

  /* ---------- Быстрые ссылки (с группами) ---------- */
  state.links = [];
  state.groups = [];
  function normUrl(u) {
    u = (u || "").trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    try { const x = new URL(u); return /^https?:$/.test(x.protocol) && x.hostname.includes(".") ? x.href : null; } catch (e) { return null; }
  }
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } };
  const groupName = (id) => { const g = state.groups.find((x) => x.id === id); return g ? g.name : ""; };
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
      sb.from("link_groups").select("id,name,position,color").order("position").order("created_at"),
      sb.from("links").select("id,title,url,position,group_id").order("position").order("created_at"),
    ]);
    if (!g.error) state.groups = g.data || [];
    if (!l.error) state.links = l.data || [];
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
      await Promise.all(dgroups.filter((g) => g.removed && !g.isNew).map((g) => sb.from("link_groups").delete().eq("id", g.id).then(chk)));
      await Promise.all(keepGroups.map(async (g, i) => {
        const name = g.name.trim().slice(0, 40);
        if (g.isNew) {
          const r = chk(await sb.from("link_groups").insert({ name, position: i, color: g.color || null }).select("id").single());
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
      for (const d of draft) if (d.removed && !d.isNew) ops.push(sb.from("links").delete().eq("id", d.id).then(chk));
      sorted.forEach(({ d, url, title }, i) => {
        const gid = d.gid && !String(d.gid).startsWith("new") ? d.gid : null;
        const o = state.links.find((l) => l.id === d.id);
        if (d.isNew) ops.push(sb.from("links").insert({ title, url, position: i, group_id: gid }).then(chk));
        else if (!o || o.title !== title || o.url !== url || o.position !== i || (o.group_id || null) !== gid)
          ops.push(sb.from("links").update({ title, url, position: i, group_id: gid }).eq("id", d.id).then(chk));
      });
      await Promise.all(ops);
      await loadLinks();
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

  /* ---------- Окно «Настройки»: вкладки «Оформление» и «Быстрые ссылки» ---------- */
  let setTabNow = "look", setClosing = false;
  function setSetTab(t) {
    setTabNow = t;
    document.querySelectorAll("#setsheet [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
    document.querySelectorAll("#setsheet [data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== t; if (!p.hidden) replay(p); });
    document.querySelectorAll("#setsheet .foot-tools").forEach((f) => (f.hidden = f.dataset.for !== t));
  }
  document.querySelectorAll("#setsheet [data-tab]").forEach((b) => b.addEventListener("click", () => { closeMenus(null); setSetTab(b.dataset.tab); }));
  function openSettings(tab) {
    closeMenus(null);
    $("set-status").textContent = "";
    prepareLinks();
    renderWeekly();
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
      $("set-status").textContent = "";
      animHide($("setsheet"), 170);
      lockSheets(false);
    } finally { setClosing = false; }
  }
  $("setsheet").querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeSettings));
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
    const notes = state.notes.filter((n) => norm(n.body).includes(q)).slice(0, 6).map((n) => {
      const lines = n.body.split("\n"); const title = (lines[0] || "").trim() || "Без заголовка";
      const rest = lines.slice(1).join(" ");
      const sub = norm(title).includes(q) ? snippet(rest, "") : snippet(rest, q);
      return resultEl("note", title, sub, q, () => openEditor(n.id));
    });
    if (notes.length) groups.push(["Заметки", notes]);
    const rems = (state.reminders || []).filter((r) => norm(r.text).includes(q)).slice(0, 5).map((r) =>
      resultEl("rem", r.text, fmtRem.format(new Date(r.remind_at)) + (r.sent_at ? " · отправлено" : ""), q, () => openTime("rem")));
    if (rems.length) groups.push(["Напоминания", rems]);
    const links = state.links.filter((l) => norm(l.title).includes(q) || norm(l.url).includes(q)).slice(0, 6).map((l) =>
      resultEl("link", l.title, (l.group_id && groupName(l.group_id) ? groupName(l.group_id) + " · " : "") + hostOf(l.url), q, null, l.url));
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
    else if (!$("setsheet").hidden) closeSettings();
    else if (!$("timesheet").hidden) closeTime();
  });

  // Клик по фону вокруг окна закрывает окно и не доходит до того, что под ним
  document.querySelectorAll(".sheet-backdrop").forEach((bd) =>
    ["pointerdown", "mousedown", "touchstart"].forEach((t) => bd.addEventListener(t, (e) => e.stopPropagation(), { passive: true })));
  document.querySelectorAll(".sheet-backdrop").forEach((bd) => bd.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); }));

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
