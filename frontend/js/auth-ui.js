import {
  getToken,
  clearToken,
  login,
  register,
  requestPasswordReset,
  confirmPasswordReset,
  apiFetch,
} from "./api.js?v=5007";

function $(id){ return document.getElementById(id); }

function showError(msg){
  const el = $("authError");
  el.textContent = msg;
  el.classList.remove("hidden");
}
function clearError(){
  const el = $("authError");
  el.textContent = "";
  el.classList.add("hidden");
}

function showOverlay(){
  const ov = $("authOverlay");
  ov.classList.remove("hidden");
  ov.setAttribute("aria-hidden", "false");
}
function hideOverlay(){
  const ov = $("authOverlay");
  ov.classList.add("hidden");
  ov.setAttribute("aria-hidden", "true");
}

let currentTab = "login";

function switchTab(tab){
  currentTab = tab;
  document.querySelectorAll(".auth-panel").forEach(p => {
    p.classList.toggle("hidden", p.dataset.panel !== tab);
  });
  clearError();
}

async function verifyToken(){
  const t = getToken();
  if(!t) return false;
  try{
    await apiFetch("/users/me");
    return true;
  }catch{
    clearToken();
    return false;
  }
}

async function onLogin(){
  clearError();
  const id = $("loginIdentifier").value.trim();
  const pass = $("loginPassword").value;
  const persist = $("rememberMe").checked;
  if(!id || !pass){
    showError("Введите логин/email и пароль");
    return;
  }
  try{
    await login(id, pass, persist);
    hideOverlay();
    window.dispatchEvent(new Event("auth:ready"));
  }catch(e){
    showError(e.message || "Ошибка входа");
  }
}

async function onRegister(){
  clearError();
  const username = $("regUsername").value.trim();
  const email = $("regEmail").value.trim();
  const password = $("regPassword").value;
  if(!username || !email || !password){
    showError("Заполните логин, email и пароль");
    return;
  }
  try{
    await register(username, email, password);
    // after successful registration: auto-login
    await login(email, password, true);
    hideOverlay();
    window.dispatchEvent(new Event("auth:ready"));
  }catch(e){
    showError(e.message || "Ошибка регистрации");
  }
}


// --- Пошаговый сброс пароля ---
let resetFlow = { email: "", token: "", step: "request" }; // request | verify | set

function setResetStep(step){
  resetFlow.step = step;
  const req = $("resetStepRequest");
  const ver = $("resetStepVerify");
  const set = $("resetStepSet");

  if(req) req.classList.toggle("hidden", step !== "request");
  if(ver) ver.classList.toggle("hidden", step !== "verify");
  if(set) set.classList.toggle("hidden", step !== "set");
}

function resetClearTokenUI(){
  const box = $("resetTokenBox");
  if(box){
    box.textContent = "";
    box.classList.add("hidden");
  }
  const tokenInput = $("resetToken");
  if(tokenInput) tokenInput.value = "";
}

async function onResetRequest(){
  try{
    showError(null);

    const email = $("resetEmail").value.trim();
    if(!email) return showError("Введите email");

    resetFlow.email = email;

    const res = await apiPasswordRequest(email);
    // backend возвращает { ok: true, token: "..." } (в демо токен показываем)
    resetFlow.token = res?.token || "";

    // Переходим к шагу ввода кода
    const tokenBox = $("resetTokenBox");
    if(tokenBox){
      if(resetFlow.token){
        tokenBox.textContent = `Код отправлен на почту. Демо‑код: ${resetFlow.token}`;
        tokenBox.classList.remove("hidden");
      }else{
        tokenBox.textContent = "Код отправлен на почту. Введите его ниже.";
        tokenBox.classList.remove("hidden");
      }
    }

    resetClearTokenUI();
    setResetStep("verify");

    // Фокус на поле кода
    $("resetToken")?.focus();
  }catch(err){
    showError(err?.message || "Ошибка");
  }
}

async function onResetResend(){
  try{
    showError(null);
    const email = resetFlow.email || $("resetEmail").value.trim();
    if(!email) return showError("Введите email");

    resetFlow.email = email;
    const res = await apiPasswordRequest(email);
    resetFlow.token = res?.token || "";

    const tokenBox = $("resetTokenBox");
    if(tokenBox){
      tokenBox.textContent = resetFlow.token
        ? `Код отправлен ещё раз. Демо‑код: ${resetFlow.token}`
        : "Код отправлен ещё раз. Введите его ниже.";
      tokenBox.classList.remove("hidden");
    }

    resetClearTokenUI();
    setResetStep("verify");
    $("resetToken")?.focus();
  }catch(err){
    showError(err?.message || "Ошибка");
  }
}

function onResetVerify(){
  showError(null);
  const typed = ($("resetToken")?.value || "").trim();
  if(!typed) return showError("Введите код");

  // В демо сравниваем введённый код с токеном, который вернул backend
  if(resetFlow.token && typed !== resetFlow.token){
    return showError("Неверный код. Попробуйте ещё раз.");
  }

  setResetStep("set");
  $("resetNewPassword")?.focus();
}

async function onResetConfirm(){
  try{
    showError(null);

    const p1 = $("resetNewPassword").value;
    const p2 = $("resetNewPassword2")?.value ?? p1;

    if(!p1) return showError("Введите новый пароль");
    if(p2 !== p1) return showError("Пароли не совпадают");

    const token = resetFlow.token || ($("resetToken")?.value || "").trim();
    if(!token) return showError("Сначала запросите код");

    await apiPasswordReset(token, p1);

    // Готово — возвращаем к входу
    setResetStep("request");
    $("resetEmail").value = "";
    resetFlow = { email: "", token: "", step: "request" };
    location.hash = "#login";
  }catch(err){
    showError(err?.message || "Ошибка");
  }
}

function wireUI(){
  $("btnLogin").addEventListener("click", onLoginSubmit);
  $("btnLogout").addEventListener("click", onLogout);

  $("toRegister").addEventListener("click", (e)=>{ e.preventDefault(); location.hash = "#register"; });
  $("toLoginFromRegister").addEventListener("click", (e)=>{ e.preventDefault(); location.hash = "#login"; });

  $("forgotPassword").addEventListener("click", (e)=>{ e.preventDefault(); location.hash = "#reset"; });
  $("backToLoginFromReset").addEventListener("click", (e)=>{ e.preventDefault(); location.hash = "#login"; });
  const back2 = $("backToLoginFromReset2");
  if(back2) back2.addEventListener("click", (e)=>{ e.preventDefault(); location.hash = "#login"; });

  $("btnRegister").addEventListener("click", onRegisterSubmit);

  // Reset flow (пошагово)
  $("resetRequestBtn").addEventListener("click", onResetRequest);

  const verifyBtn = $("resetVerifyBtn");
  if(verifyBtn) verifyBtn.addEventListener("click", onResetVerify);

  const resend = $("resetResendBtn");
  if(resend) resend.addEventListener("click", (e)=>{ e.preventDefault(); onResetResend(); });

  const changeEmail = $("resetChangeEmailBtn");
  if(changeEmail) changeEmail.addEventListener("click", (e)=>{ e.preventDefault(); showError(null); setResetStep("request"); $("resetEmail")?.focus(); });

  $("resetConfirmBtn").addEventListener("click", onResetConfirm);

  // Enter key shortcuts
  ["loginEmail","loginPassword"].forEach(id=>{
    $(id).addEventListener("keydown",(e)=>{ if(e.key === "Enter") onLoginSubmit(); });
  });

  ["regLogin","regEmail","regPassword"].forEach(id=>{
    $(id).addEventListener("keydown",(e)=>{ if(e.key === "Enter") onRegisterSubmit(); });
  });

  $("resetEmail").addEventListener("keydown",(e)=>{ if(e.key === "Enter") onResetRequest(); });
  const rt = $("resetToken");
  if(rt) rt.addEventListener("keydown",(e)=>{ if(e.key === "Enter") onResetVerify(); });
  const rnp = $("resetNewPassword");
  if(rnp) rnp.addEventListener("keydown",(e)=>{ if(e.key === "Enter") onResetConfirm(); });
  const rnp2 = $("resetNewPassword2");
  if(rnp2) rnp2.addEventListener("keydown",(e)=>{ if(e.key === "Enter") onResetConfirm(); });
}

(async function init(async function init(){
  wireUI();
  const ok = await verifyToken();
  if(ok){
    hideOverlay();
    window.dispatchEvent(new Event("auth:ready"));
  }else{
    showOverlay();
    switchTab("login");
  }
})();
