const API_PORT = 8080;
const API_ORIGIN = `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
export const API_BASE = `${API_ORIGIN}/api`;

const TOKEN_KEY = "auth_token";

export function getToken(){
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token, persist = true){
  if(persist){
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(TOKEN_KEY);
  }else{
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function clearToken(){
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path, { method="GET", body, headers={} } = {}){
  const token = getToken();
  const h = { ...headers };

  if(token) h["Authorization"] = `Bearer ${token}`;
  if(body && !(body instanceof FormData)) h["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: h,
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });

  if(!res.ok){
    let msg = `HTTP ${res.status}`;
    try{
      const data = await res.json();
      if(data?.detail) msg = data.detail;
    }catch{}
    throw new Error(msg);
  }

  // если пустое тело
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ===== AUTH =====
export async function login(identifier, password, persist = true){
  const form = new URLSearchParams();
  // backend принимает username ИЛИ email в поле "username"
  form.set("username", identifier);
  form.set("password", password);

  const res = await fetch(`${API_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  if(!res.ok){
    let msg = `HTTP ${res.status}`;
    try{ const data = await res.json(); if(data?.detail) msg = data.detail; }catch{}
    throw new Error(msg);
  }

  const data = await res.json();
  setToken(data.access_token, persist);
  return data;
}

export function register(username, email, password){
  return apiFetch("/register", { method:"POST", body:{ username, email, password } });
}

export function requestPasswordReset(email){
  return apiFetch("/password/request", { method:"POST", body:{ email } });
}

export function confirmPasswordReset(token, new_password){
  return apiFetch("/password/reset", { method:"POST", body:{ token, new_password } });
}

export function getMyGroups(){
  return apiFetch("/groups");
}

export function getGroupMembers(groupId){
  return apiFetch(`/groups/${groupId}/members`);
}

export function renameGroup(groupId, name){
  return apiFetch(`/groups/${groupId}`, { method:"PUT", body:{ name } });
}

export function updateMyColor(color){
  return apiFetch(`/users/me/color`, { method:"PUT", body:{ color } });
}

export function getMe(){
  return apiFetch("/users/me");
}


export function createGroup(name, description=null){
  return apiFetch('/groups', { method:'POST', body:{ name, description } });
}
