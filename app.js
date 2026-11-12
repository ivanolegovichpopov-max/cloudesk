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
  let toastTimer;
  function toast(text) {
    const t = $("toast");
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 4000);
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
    window.Telegram.Login.auth({ bot_id: BOT_ID, request_access: false, lang: "ru" }, async (tgUser) => {
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
      $(btn.dataset.menu).hidden = true;
      btn.setAttribute("aria-expanded", "false");
    });
  }
  document.querySelectorAll("[data-menu]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const m = $(btn.dataset.menu);
      closeMenus(btn);
      m.hidden = !m.hidden;
      btn.setAttribute("aria-expanded", String(!m.hidden));
    }));
  document.addEventListener("click", (e) => {
    if (!e.target.closest || !e.target.closest(".menu")) closeMenus(null);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenus(null); });
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
      sb.from("settings").select("wallpaper_preset,wallpaper_path,theme").eq("user_id", user.id).maybeSingle(),
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
    await applyWallFromSettings();
  }

  /* ---------- Заметки ---------- */
  function sortNotes() {
    state.notes.sort((a, b) => (b.pinned - a.pinned) || (new Date(b.updated_at) - new Date(a.updated_at)));
  }

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
    $("editor").hidden = false;
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
      $("editor").hidden = true;
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
    if (!silent) { $("editor").hidden = true; lockSheets(false); toast("Заметка удалена"); }
    return true;
  }

  $("btn-new").addEventListener("click", () => openEditor(null));
  $("ed-body").addEventListener("input", () => queueSave());
  $("ed-pin").addEventListener("click", () => {
    ed.pinned = !ed.pinned;
    $("ed-pin").setAttribute("aria-pressed", String(ed.pinned));
    queueSave(0);
  });
  $("ed-delete").addEventListener("click", () => { $("ed-confirm").hidden = false; $("ed-actions").hidden = true; });
  $("ed-confirm-no").addEventListener("click", () => { $("ed-confirm").hidden = true; $("ed-actions").hidden = false; });
  $("ed-confirm-yes").addEventListener("click", () => deleteNote(false));
  $("editor").querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeEditor));

  /* ---------- Заставка ---------- */
  function setWall(preset, url) {
    const wall = $("wall");
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
      .select("wallpaper_preset,wallpaper_path,theme").single();
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
    $("wallsheet").hidden = false;
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
      $("wallsheet").hidden = true;
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

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("editor").hidden) closeEditor();
    else if (!$("wallsheet").hidden) closeWall();
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
