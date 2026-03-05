(() => {
  "use strict";

  const STORAGE_KEY = "auth_token";

  function lsGet(key){ try{ return localStorage.getItem(key); } catch { return null; } }
  function lsSet(key,val){ try{ localStorage.setItem(key,val); } catch {} }
  function lsRemove(key){ try{ localStorage.removeItem(key); } catch {} }

  function $(id){ return document.getElementById(id); }

  function getApiBase(){
    // If user defined window.API_BASE use it, else default to same host:8080/api (works when frontend served on 5500)
    if (window.API_BASE) return window.API_BASE;
    const { protocol, hostname } = window.location;
    // If frontend is opened from same port as backend, use /api
    if (window.location.port === "8080") return `${protocol}//${hostname}:8080/api`;
    return `${protocol}//${hostname}:8080/api`;
  }

  async function apiFetch(path, opts={}){
    const apiBase = getApiBase();
    const url = `${apiBase}${path.startsWith("/") ? "" : "/"}${path}`;
    const headers = Object.assign({}, opts.headers || {});
    const token = lsGet(STORAGE_KEY);
    if(token) headers["Authorization"] = `Bearer ${token}`;
    if(opts.json){
      headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.json);
    }
    const res = await fetch(url, { ...opts, headers });
    return res;
  }

  function showAuth(){
    const s = $("authScreen");
    if(s) s.hidden = false;
  }
  function hideAuth(){
    const s = $("authScreen");
    if(s) s.hidden = true;
  }

  async function checkToken(){
    const token = lsGet(STORAGE_KEY);
    if(!token) return false;
    try{
      const res = await apiFetch("/users/me", { method: "GET" });
      return res.ok;
    }catch{
      return false;
    }
  }

  async function doLogin(username, password){
    const apiBase = getApiBase();
    const body = new URLSearchParams();
    body.set("username", username);
    body.set("password", password);

    const res = await fetch(`${apiBase}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    if(!res.ok){
      let msg = `HTTP ${res.status}`;
      try{
        const data = await res.json();
        if(data?.detail) msg = data.detail;
      }catch{}
      throw new Error(msg);
    }
    const data = await res.json();
    const token = data.access_token;
    if(!token) throw new Error("Не получили токен");
    lsSet(STORAGE_KEY, token);
    return true;
  }

  async function doRegister(email, username, password, full_name=null){
    const res = await apiFetch("/register", {
      method: "POST",
      json: { email, username, password, full_name }
    });
    if(!res.ok){
      let msg = `HTTP ${res.status}`;
      try{
        const data = await res.json();
        if(data?.detail) msg = (typeof data.detail === "string") ? data.detail : JSON.stringify(data.detail);
      }catch{}
      throw new Error(msg);
    }
    return true;
  }

  async function initAuth(){
    const screen = $("authScreen");
    if(!screen) return true; // no auth UI in DOM, don't block

    const title = $("authTitle");
    const err = $("authError");
    const u = $("authUsername");
    const eLabel = $("authEmailLabel");
    const e = $("authEmail");
    const p = $("authPassword");
    const submit = $("authSubmitBtn");
    const toggle = $("authToggleModeBtn");

    let mode = "login";

    function setError(msg){
      if(!err) return;
      err.textContent = msg || "";
      err.style.display = msg ? "" : "none";
    }

    function setMode(next){
      mode = next;
      setError("");
      const isReg = mode === "register";
      if(title) title.textContent = isReg ? "Регистрация" : "Вход";
      if(submit) submit.textContent = isReg ? "Создать аккаунт" : "Войти";
      if(toggle) toggle.textContent = isReg ? "Уже есть аккаунт? Вход" : "Нет аккаунта? Регистрация";
      if(eLabel) eLabel.style.display = isReg ? "" : "none";
      if(e) e.style.display = isReg ? "" : "none";
    }

    // bootstrap
    const ok = await checkToken();
    if(ok){
      hideAuth();
      return true;
    } else {
      lsRemove(STORAGE_KEY);
      showAuth();
    }

    toggle?.addEventListener("click", () => setMode(mode === "login" ? "register" : "login"));
    submit?.addEventListener("click", async () => {
      try{
        setError("");
        const username = (u?.value || "").trim();
        const password = (p?.value || "").trim();
        if(!username || !password) throw new Error("Заполни username и пароль");

        if(mode === "register"){
          const email = (e?.value || "").trim();
          if(!email) throw new Error("Заполни email");
          await doRegister(email, username, password);
        }
        await doLogin(username, password);
        hideAuth();
        window.dispatchEvent(new CustomEvent("auth:changed"));
      }catch(ex){
        setError(ex?.message || "Ошибка");
      }
    });

    // allow Enter key
    screen.addEventListener("keydown", (ev) => {
      if(ev.key === "Enter"){
        submit?.click();
      }
    });

    // expose helpers
    window.logout = () => { lsRemove(STORAGE_KEY); window.dispatchEvent(new CustomEvent("auth:changed")); showAuth(); };

    return false;
  }

  document.addEventListener("DOMContentLoaded", () => { initAuth(); });

  // also expose if other scripts need it
  window.initAuth = initAuth;
})();
