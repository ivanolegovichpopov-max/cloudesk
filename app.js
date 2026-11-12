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
      sb.from("settings").select("wallpaper_preset,wallpaper_path,theme,cities").eq("user_id", user.id).maybeSingle(),
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
    setWall(s && s.wallpaper_preset, null);
  }

  async function saveSettings(patch) {
    const row = Object.assign({ user_id: state.user.id }, state.settings || {}, patch);
    const { data, error } = await sb.from("settings").upsert(row, { onConflict: "user_id" })
      .select("wallpaper_preset,wallpaper_path,theme,cities").single();
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
      const s = document.createElement("span");
      s.textContent = p.name;
      b.append(s);
      b.addEventListener("click", () => {
        const old = state.settings && state.settings.wallpaper_path;
        setWall(p.id, null);
        trackWall(async () => {
          await saveSettings({ wallpaper_preset: p.id, wallpaper_path: null });
          if (old) await sb.storage.from("wallpapers").remove([old]);
        }, "Заставка не сохранилась. Попробуйте ещё раз.");
      });
      box.insertBefore(b, box.querySelector(".upload-tile"));
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

  $("btn-wall").addEventListener("click", () => {
    closeMenus(null);
    animShow($("wallsheet"));
    lockSheets(true);
  });
  // Сохранение заставки отслеживается: окно не закроется, пока оно не завершится
  let wallJob = null, wallFailed = false, wallClosing = false;
  function trackWall(fn, errText) {
    const job = (async () => {
      try { await fn(); wallFailed = false; $("wall-status").textContent = ""; }
      catch (e) { console.error(e); wallFailed = true; $("wall-status").textContent = ""; toast(errText); }
    })();
    wallJob = job;
    job.finally(() => { if (wallJob === job) wallJob = null; });
    return job;
  }
  async function closeWall() {
    if (wallClosing) return;
    wallClosing = true;
    try {
      if (wallJob) { $("wall-status").textContent = "Сохраняю…"; await wallJob; }
      if (wallFailed) { $("wall-status").textContent = "Не сохранилось — выберите заставку ещё раз."; return; }
      $("wall-status").textContent = "";
      animHide($("wallsheet"), 170);
      lockSheets(false);
    } finally {
      wallClosing = false;
    }
  }
  $("wallsheet").querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeWall));

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
    const st = $("wall-status");
    st.textContent = "Загружаю…";
    trackWall(async () => {
      const blob = await shrinkImage(file);
      const path = state.user.id + "/" + Date.now() + ".jpg";
      const up = await sb.storage.from("wallpapers").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (up.error) throw up.error;
      const old = state.settings && state.settings.wallpaper_path;
      await saveSettings({ wallpaper_path: path });
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
    $("time-status").textContent = "";
    if (t === "cal") renderCal();
    if (t === "rem") { loadReminders(); renderBotHint(); }
    if (t === "cities") renderCities();
    if (t === "timer") renderTimer();
    if (t === "sw") renderSW();
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
    const remDays = new Set(state.reminders.filter((r) => !r.sent_at && !r.failed_at).map((r) => dayKey(new Date(r.remind_at))));
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cal-day" + (d.getMonth() !== calMonth.getMonth() ? " other" : "") + (d.getDay() % 6 === 0 ? " weekend" : "") + (dayKey(d) === today ? " today" : "");
      b.textContent = d.getDate();
      if (remDays.has(dayKey(d))) { const dot = document.createElement("i"); dot.className = "dot";  b.append(dot); }
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
    $("timer-presets").append(b);
  });
  $("timer-min").addEventListener("input", () => {
    const m = Math.round(Number($("timer-min").value));
    if (!timer.end && m >= 1 && m <= 600) { timer.total = m * 60000; timer.left = 0; saveTimer(); renderTimer(); }
  });
  function timerLeft() { return timer.end ? timer.end - Date.now() : timer.left || timer.total; }
  function renderTimer() {
    $("timer-display").textContent = fmtMS(timerLeft());
    $("timer-go").textContent = timer.end ? "Пауза" : timer.left ? "Продолжить" : "Старт";
    document.querySelectorAll("#timer-presets button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.min) * 60000 === timer.total)));
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
    $("sw-go").textContent = sw.start ? "Пауза" : sw.acc ? "Продолжить" : "Старт";
    $("sw-lap").disabled = !sw.start;
    const ol = $("sw-laps");
    ol.textContent = "";
    sw.laps.slice().reverse().forEach((t, i) => {
      const li = document.createElement("li");
      const a = document.createElement("span"); a.textContent = "Круг " + (sw.laps.length - i);
      const b = document.createElement("span"); b.textContent = fmtSW(t);
      li.append(a, b); ol.append(li);
    });
  }
  $("sw-go").addEventListener("click", () => {
    if (sw.start) { sw.acc += Date.now() - sw.start; sw.start = 0; } else sw.start = Date.now();
    saveSW(); renderSW(); renderRun();
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
      if (timeTab === "sw") $("sw-display").textContent = fmtSW(swNow());
      if (timeTab === "cities") renderCityTimes();
    }
    renderRun();
    checkDueReminders();
  }
  setInterval(timeLoop, 100 * 2.5);
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
  function renderReminders() {
    const ul = $("rem-list");
    ul.textContent = "";
    const list = state.reminders.slice().sort((a, b) => (!!a.sent_at - !!b.sent_at) || (new Date(a.remind_at) - new Date(b.remind_at)));
    for (const r of list) {
      const li = document.createElement("li");
      li.className = "rem-item" + (r.sent_at || r.failed_at ? " past" : "");
      const main = document.createElement("div"); main.className = "rem-main";
      const t = document.createElement("div"); t.className = "rem-text"; t.textContent = r.text;
      const m = document.createElement("div"); m.className = "rem-meta";
      m.textContent = fmtRem.format(new Date(r.remind_at));
      if (r.sent_at) m.append(" · отправлено");
      if (r.failed_at) {
        const bad = document.createElement("span"); bad.className = "bad";
        bad.textContent = r.error === "bot_blocked" ? " · не доставлено: откройте бота и нажмите «Старт»" : " · не доставлено";
        m.append(bad);
      }
      main.append(t, m);
      const del = document.createElement("button");
      del.type = "button"; del.className = "tool"; del.dataset.tip = "Удалить"; del.setAttribute("aria-label", "Удалить");
      del.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/></svg>';
      del.addEventListener("click", () => trackTime(async () => {
        const { error } = await sb.from("reminders").delete().eq("id", r.id);
        if (error) { toast("Не удалось удалить. Попробуйте ещё раз."); throw error; }
        state.reminders = state.reminders.filter((x) => x.id !== r.id);
        renderReminders();
      }));
      li.append(main, del);
      ul.append(li);
    }
    $("rem-empty").hidden = list.length > 0;
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
    if (botUser) $("time-hint").textContent = "Напоминание придёт сообщением от бота @" + botUser + ". Если сообщения не приходят, откройте бота в Telegram и нажмите «Старт».";
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
    for (const [tz, local] of rows) {
      const li = document.createElement("li");
      li.className = "city-item" + (local ? " local" : "");
      li.dataset.tz = tz;
      const name = document.createElement("div"); name.className = "city-name";
      name.textContent = local ? "Ваше время" : cityName(tz);
      const diff = document.createElement("div"); diff.className = "city-diff";
      name.append(diff);
      const time = document.createElement("div"); time.className = "city-time";
      li.append(name, time);
      if (!local) {
        const del = document.createElement("button");
        del.type = "button"; del.className = "tool"; del.dataset.tip = "Убрать город"; del.setAttribute("aria-label", "Убрать город");
        del.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/></svg>';
        del.addEventListener("click", () => saveCities(cities().filter((c) => c !== tz)));
        li.append(del);
      }
      ul.append(li);
    }
    const pop = $("city-pop");
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
  function saveCities(list) {
    const prev = cities();
    state.settings = Object.assign({}, state.settings || {}, { cities: list });
    renderCities();
    trackTime(async () => {
      try { await saveSettings({ cities: list }); }
      catch (e) { state.settings.cities = prev; renderCities(); toast("Город не сохранился. Попробуйте ещё раз."); throw e; }
    });
  }

  /* ---------- Быстрые ссылки ---------- */
  state.links = [];
  function normUrl(u) {
    u = (u || "").trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    try { const x = new URL(u); return /^https?:$/.test(x.protocol) && x.hostname.includes(".") ? x.href : null; } catch (e) { return null; }
  }
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } };
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
  // Ссылки — в выпадающем списке у кнопки «Ссылки»
  function renderLinks() {
    const list = $("links-menu-list");
    list.textContent = "";
    if (!state.links.length) {
      const e = document.createElement("div");
      e.className = "menu-empty";
      e.textContent = "Ссылок пока нет. Добавьте первую в настройке ниже.";
      list.append(e);
      return;
    }
    state.links.forEach((l) => { const a = linkEl(l, "menu-item link-item"); a.setAttribute("role", "menuitem"); list.append(a); });
  }

  async function loadLinks() {
    const { data, error } = await sb.from("links").select("id,title,url,position").order("position").order("created_at");
    if (!error) { state.links = data || []; renderLinks(); }
  }

  // Окно настройки: правим черновик, сохраняем при закрытии
  let draft = [], linksClosing = false, newSeq = 0;
  function openLinks() {
    closeMenus(null);
    draft = state.links.map((l) => ({ id: l.id, title: l.title, url: l.url, removed: false }));
    if (!draft.length) draft.push({ id: "new" + ++newSeq, title: "", url: "", removed: false, isNew: true });
    $("links-status").textContent = "";
    renderDraft();
    animShow($("linksheet"));
    lockSheets(true);
  }
  $("links-edit-btn").addEventListener("click", openLinks);
  $("btn-links").addEventListener("click", openLinks);

  const ICON = (d, size = 16) => '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="' + d + '"/></svg>';
  function renderDraft(focusId) {
    const ol = $("links-list");
    ol.textContent = "";
    draft.forEach((d, i) => {
      const li = document.createElement("li");
      li.className = "link-row" + (d.removed ? " removed" : "") + (d.bad ? " bad" : "");
      if (d.isNew && d.id === focusId) li.classList.add("fade-in");
      const move = document.createElement("div"); move.className = "link-move";
      const up = document.createElement("button"); up.type = "button"; up.className = "tool"; up.innerHTML = ICON("M6 15l6-6 6 6"); up.dataset.tip = "Выше"; up.setAttribute("aria-label", "Выше"); up.disabled = i === 0;
      const dn = document.createElement("button"); dn.type = "button"; dn.className = "tool"; dn.innerHTML = ICON("M6 9l6 6 6-6"); dn.dataset.tip = "Ниже"; dn.setAttribute("aria-label", "Ниже"); dn.disabled = i === draft.length - 1;
      up.addEventListener("click", () => { [draft[i - 1], draft[i]] = [draft[i], draft[i - 1]]; renderDraft(); });
      dn.addEventListener("click", () => { [draft[i + 1], draft[i]] = [draft[i], draft[i + 1]]; renderDraft(); });
      move.append(up, dn);
      const fields = document.createElement("div"); fields.className = "link-fields";
      const t = document.createElement("input"); t.type = "text"; t.maxLength = 40; t.placeholder = "Название"; t.value = d.title; t.disabled = d.removed;
      t.setAttribute("aria-label", "Название ссылки");
      const u = document.createElement("input"); u.type = "text"; u.maxLength = 500; u.placeholder = "Адрес, например rentikacrm.com"; u.value = d.url; u.disabled = d.removed;
      u.setAttribute("aria-label", "Адрес ссылки"); u.inputMode = "url"; u.autocomplete = "off"; u.spellcheck = false;
      t.addEventListener("input", () => { d.title = t.value; d.bad = false; li.classList.remove("bad"); });
      u.addEventListener("input", () => { d.url = u.value; d.bad = false; li.classList.remove("bad");
        if (!d.title.trim() && !d.titleTouched) { /* название подставим из адреса при сохранении */ } });
      t.addEventListener("change", () => (d.titleTouched = true));
      fields.append(t, u);
      const act = document.createElement("button"); act.type = "button"; act.className = "tool";
      if (d.removed) { act.innerHTML = ICON("M9 14l-4-4 4-4M5 10h9a5 5 0 0 1 0 10h-2"); act.dataset.tip = "Вернуть"; act.setAttribute("aria-label", "Вернуть"); act.addEventListener("click", () => { d.removed = false; renderDraft(); }); }
      else { act.innerHTML = ICON("M6 6l12 12M18 6 6 18"); act.dataset.tip = "Удалить"; act.setAttribute("aria-label", "Удалить"); act.addEventListener("click", () => { if (d.isNew) draft.splice(i, 1); else d.removed = true; renderDraft(); }); }
      li.append(move, fields, act);
      if (d.removed) { const note = document.createElement("div"); note.className = "link-removed-note"; note.textContent = "Будет удалена при закрытии"; fields.append(note); }
      ol.append(li);
      if (d.id === focusId) setTimeout(() => (d.title ? u : t).focus(), 20);
    });
    $("links-new").disabled = draft.filter((d) => !d.removed).length >= 30;
  }
  $("links-new").addEventListener("click", () => {
    const d = { id: "new" + ++newSeq, title: "", url: "", removed: false, isNew: true };
    draft.push(d); renderDraft(d.id);
    const ol = $("links-list"); ol.scrollTop = ol.scrollHeight;
  });

  async function closeLinks() {
    if (linksClosing) return;
    linksClosing = true;
    try {
      // проверка: у каждой заполненной строки должен быть правильный адрес
      let bad = 0;
      const keep = [];
      for (const d of draft) {
        if (d.removed) continue;
        if (!d.title.trim() && !d.url.trim()) continue; // пустая строка — просто не сохраняем
        const url = normUrl(d.url);
        if (!url) { d.bad = true; bad++; continue; }
        keep.push({ d, url, title: (d.title.trim() || hostOf(url)).slice(0, 40) });
      }
      if (bad) { renderDraft(); $("links-status").textContent = bad === 1 ? "Проверьте адрес ссылки" : "Проверьте адреса ссылок"; return; }
      $("links-status").textContent = "Сохраняю…";
      const ops = [];
      for (const d of draft) if (d.removed && !d.isNew) ops.push(sb.from("links").delete().eq("id", d.id));
      keep.forEach(({ d, url, title }, i) => {
        const orig = state.links.find((l) => l.id === d.id);
        if (d.isNew) ops.push(sb.from("links").insert({ title, url, position: i }));
        else if (!orig || orig.title !== title || orig.url !== url || orig.position !== i) ops.push(sb.from("links").update({ title, url, position: i }).eq("id", d.id));
      });
      const res = await Promise.all(ops);
      const err = res.find((r) => r.error);
      await loadLinks();
      if (err) {
        console.error(err.error);
        draft = state.links.map((l) => ({ id: l.id, title: l.title, url: l.url, removed: false }));
        renderDraft();
        $("links-status").textContent = "Сохранилось не всё — проверьте интернет и нажмите «Готово» ещё раз";
        return;
      }
      $("links-status").textContent = "";
      animHide($("linksheet"), 170);
      lockSheets(false);
    } finally { linksClosing = false; }
  }
  $("linksheet").querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeLinks));

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
    const pop = $("search-pop");
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
      resultEl("link", l.title, hostOf(l.url), q, null, l.url));
    if (links.length) groups.push(["Ссылки", links]);
    if (!groups.length) {
      const e = document.createElement("div"); e.className = "menu-empty";
      e.textContent = "Ничего не найдено в заметках, напоминаниях и ссылках";
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
    document.querySelector(".top").classList.remove("searching");
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
  document.addEventListener("click", (e) => { if (!e.composedPath().includes($("search"))) { hidePop(); if (!$("search-input").value) document.querySelector(".top").classList.remove("searching"); } });
  // телефон: лупа разворачивает поле на всю шапку
  $("search-open").addEventListener("click", () => { closeMenus(null); document.querySelector(".top").classList.add("searching"); setTimeout(() => $("search-input").focus(), 30); });
  $("search-cancel").addEventListener("click", () => closeSearch(true));
  // «/» или Ctrl+K — сразу в поиск (если не печатаете в поле и не открыто окно)
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName);
    const sheetOpen = [...document.querySelectorAll(".sheet-wrap")].some((w) => !w.hidden);
    if (sheetOpen || $("desk").hidden) return;
    if ((e.key === "/" && !typing) || ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "л"))) {
      e.preventDefault();
      if (window.matchMedia("(max-width: 560px)").matches) $("search-open").click(); else $("search-input").focus();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("editor").hidden) closeEditor();
    else if (!$("wallsheet").hidden) closeWall();
    else if (!$("timesheet").hidden) closeTime();
    else if (!$("linksheet").hidden) closeLinks();
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
