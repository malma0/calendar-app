import {
  getToken,
  clearToken,
  login,
  register,
  requestPasswordReset,
  confirmPasswordReset,
  apiFetch,
} from "./api.js?v=5015";

function $(id){ return document.getElementById(id); }

function showError(msg){
  const el = $("authError");
  if(!el) return;
  if(!msg){
    el.textContent = "";
    el.classList.add("hidden");
    return;
  }
  el.textContent = msg;
  el.classList.remove("hidden");
}
function clearError(){ showError(""); }

function showOverlay(){
  const ov = $("authOverlay");
  if(!ov) return;
  ov.classList.remove("hidden");
  ov.setAttribute("aria-hidden", "false");
}
function hideOverlay(){
  const ov = $("authOverlay");
  if(!ov) return;
  ov.classList.add("hidden");
  ov.setAttribute("aria-hidden", "true");
}

let currentTab = "login";
let resetFlow = { email: "", token: "", step: "request" };
let registerDraft = { username: "", email: "", full_name: "" };

function getResetLinksWrap(){
  return document.querySelector("#resetStepVerify .auth-links-col, #resetStepVerify .auth-links-row, #resetStepVerify .auth-links");
}

function styleResetLinks(){
  const wrap = getResetLinksWrap();
  const resend = $("resetResendBtn");
  const changeEmail = $("resetChangeEmailBtn");
  if(!wrap) return;

  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.alignItems = "flex-start";
  wrap.style.gap = "8px";
  wrap.style.marginTop = "12px";
  wrap.style.width = "100%";

  if(resend){
    resend.style.display = "inline-block";
    resend.style.margin = "0";
    resend.style.textAlign = "left";
  }
  if(changeEmail){
    changeEmail.style.display = "inline-block";
    changeEmail.style.margin = "0";
    changeEmail.style.textAlign = "left";
  }
}

function setRegisterStep(step){
  $("registerStep1")?.classList.toggle("hidden", step !== 1);
  $("registerStep2")?.classList.toggle("hidden", step !== 2);
}

function resetToEmailStep(){
  resetFlow.token = "";
  if($("resetToken")) $("resetToken").value = "";
  if($("resetNewPassword")) $("resetNewPassword").value = "";
  if($("resetNewPassword2")) $("resetNewPassword2").value = "";
  setResetStep("request");
  $("resetEmail")?.focus();
}

function setResetStep(step){
  resetFlow.step = step;
  $("resetStepRequest")?.classList.toggle("hidden", step !== "request");
  $("resetStepVerify")?.classList.toggle("hidden", step !== "verify");
  $("resetStepSet")?.classList.toggle("hidden", step !== "set");

  const sub = $("resetSubtext");
  if (sub) {
    if (step === "request") {
      sub.textContent = "Введите email, указанный при регистрации.";
      sub.classList.remove("hidden");
    } else if (step === "verify") {
      sub.textContent = "Код отправлен. Введите его ниже.";
      sub.classList.remove("hidden");
    } else {
      sub.classList.add("hidden");
    }
  }
  styleResetLinks();
}

function switchTab(tab){
  currentTab = tab;
  document.querySelectorAll(".auth-panel").forEach((p) => {
    p.classList.toggle("hidden", p.dataset.panel !== tab);
  });
  clearError();
  if(tab === "reset") setResetStep("request");
  if(tab === "register") setRegisterStep(1);
}

async function verifyToken(){
  const t = getToken();
  if(!t) return false;
  try{
    await apiFetch("/users/me");
    return true;
  }catch(err){
    const msg = String(err?.message || "");
    if(msg.includes("401") || msg.includes("403") || msg.toLowerCase().includes("not authenticated")){
      clearToken();
      return false;
    }
    return true;
  }
}

function markAuthReady(){
  window.__authReady = true;
  hideOverlay();
  window.dispatchEvent(new Event("auth:ready"));
}

async function onLoginSubmit(){
  clearError();
  const identifier = $("loginIdentifier")?.value.trim();
  const password = $("loginPassword")?.value || "";
  const persist = !!$("rememberMe")?.checked;
  if(!identifier || !password) return showError("Введите логин/email и пароль");
  try{
    await login(identifier, password, persist);
    markAuthReady();
  }catch(err){
    showError(err?.message || "Ошибка входа");
  }
}

async function onRegisterNext(){
  clearError();
  const username = $("regUsername")?.value.trim();
  const email = $("regEmail")?.value.trim();
  const full_name = $("regFullName")?.value.trim();
  if(!username || !email || !full_name) return showError("Заполните login, email и имя");
  registerDraft = { username, email, full_name };
  setRegisterStep(2);
  $("regPassword")?.focus();
}

async function onRegisterSubmit(){
  clearError();
  const password = $("regPassword")?.value || "";
  const password2 = $("regPassword2")?.value || "";
  if(!registerDraft.username || !registerDraft.email || !registerDraft.full_name){
    return showError("Сначала заполните первый шаг регистрации");
  }
  if(!password || !password2) return showError("Введите пароль и повторите его");
  if(password !== password2) return showError("Пароли не совпадают");
  try{
    await register(registerDraft.username, registerDraft.email, registerDraft.full_name, password);
    await login(registerDraft.email, password, true);
    markAuthReady();
  }catch(err){
    showError(err?.message || "Ошибка регистрации");
  }
}

async function onResetRequest(){
  clearError();
  const email = $("resetEmail")?.value.trim();
  if(!email) return showError("Введите email");
  try{
    resetFlow.email = email;
    const res = await requestPasswordReset(email);
    resetFlow.token = res?.token || "";
    $("resetToken").value = "";
    setResetStep("verify");
    $("resetToken")?.focus();
  }catch(err){
    showError(err?.message || "Ошибка");
  }
}

async function onResetResend(){
  clearError();
  const email = resetFlow.email || $("resetEmail")?.value.trim();
  if(!email) return showError("Введите email");
  try{
    const res = await requestPasswordReset(email);
    resetFlow.token = res?.token || "";
    setResetStep("verify");
  }catch(err){
    showError(err?.message || "Ошибка");
  }
}

function onResetVerify(){
  clearError();
  const typed = $("resetToken")?.value.trim() || "";
  if(!typed) return showError("Введите код");
  setResetStep("set");
  $("resetNewPassword")?.focus();
}

async function onResetConfirm(){
  clearError();
  const p1 = $("resetNewPassword")?.value || "";
  const p2 = $("resetNewPassword2")?.value || "";
  if(!p1) return showError("Введите новый пароль");
  if(p1 !== p2) return showError("Пароли не совпадают");
  const token = resetFlow.token || $("resetToken")?.value.trim() || "";
  if(!token) return showError("Сначала запросите код");
  confirmPasswordReset(token, p1)
    .then(() => {
      resetFlow = { email: "", token: "", step: "request" };
      $("resetEmail").value = "";
      $("resetToken").value = "";
      $("resetNewPassword").value = "";
      $("resetNewPassword2").value = "";
      switchTab("login");
      $("loginIdentifier")?.focus();
    })
    .catch((err) => showError(err?.message || "Ошибка"));
}

function wireUI(){
  $("loginBtn")?.addEventListener("click", onLoginSubmit);
  $("registerNextBtn")?.addEventListener("click", onRegisterNext);
  $("registerBtn")?.addEventListener("click", onRegisterSubmit);
  $("backToRegisterStep1")?.addEventListener("click", (e) => { e.preventDefault(); setRegisterStep(1); });

  $("openRegisterLink")?.addEventListener("click", (e) => { e.preventDefault(); switchTab("register"); });
  $("backToLoginFromRegister")?.addEventListener("click", (e) => { e.preventDefault(); switchTab("login"); });
  $("openResetLink")?.addEventListener("click", (e) => { e.preventDefault(); switchTab("reset"); });
  $("backToLoginFromReset")?.addEventListener("click", (e) => { e.preventDefault(); switchTab("login"); });
  $("backToLoginFromReset2")?.addEventListener("click", (e) => { e.preventDefault(); switchTab("login"); });

  $("resetRequestBtn")?.addEventListener("click", onResetRequest);
  $("resetVerifyBtn")?.addEventListener("click", onResetVerify);
  $("resetResendBtn")?.addEventListener("click", (e) => { e.preventDefault(); onResetResend(); });
  $("resetChangeEmailBtn")?.addEventListener("click", (e) => { e.preventDefault(); resetToEmailStep(); });
  $("resetConfirmBtn")?.addEventListener("click", onResetConfirm);
  $("logoutBtn")?.addEventListener("click", () => {
    clearToken();
    location.reload();
  });

  ["loginIdentifier","loginPassword"].forEach((id) => $(id)?.addEventListener("keydown", (e) => { if(e.key === "Enter") onLoginSubmit(); }));
  ["regUsername","regEmail","regFullName"].forEach((id) => $(id)?.addEventListener("keydown", (e) => { if(e.key === "Enter") onRegisterNext(); }));
  ["regPassword","regPassword2"].forEach((id) => $(id)?.addEventListener("keydown", (e) => { if(e.key === "Enter") onRegisterSubmit(); }));
  $("resetEmail")?.addEventListener("keydown", (e) => { if(e.key === "Enter") onResetRequest(); });
  $("resetToken")?.addEventListener("keydown", (e) => { if(e.key === "Enter") onResetVerify(); });
  $("resetNewPassword")?.addEventListener("keydown", (e) => { if(e.key === "Enter") onResetConfirm(); });
  $("resetNewPassword2")?.addEventListener("keydown", (e) => { if(e.key === "Enter") onResetConfirm(); });
}

(async function init(){
  wireUI();
  styleResetLinks();
  const ok = await verifyToken();
  if(ok) markAuthReady();
  else { showOverlay(); switchTab("login"); }
})();
