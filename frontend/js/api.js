// If you run frontend and backend on different origins (different ports),
// you can define window.API_BASE in index.html, e.g.:
//   window.API_BASE = "http://localhost:8080/api";
export const API_BASE = (typeof window !== "undefined" && window.API_BASE) ? window.API_BASE : "/api";

const TOKEN_KEY = "auth_token";
let memoryToken = null;

function safeGet(key){
  try{ return localStorage.getItem(key); }catch{ return null; }
}
function safeSet(key, val){
  try{ localStorage.setItem(key, val); }catch{}
}
function safeRemove(key){
  try{ localStorage.removeItem(key); }catch{}
}

export function getToken(){
  return safeGet(TOKEN_KEY) || memoryToken;
}
export function setToken(token){
  memoryToken = token;
  safeSet(TOKEN_KEY, token);
}
export function clearToken(){
  memoryToken = null;
  safeRemove(TOKEN_KEY);
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

export async function login(username, password){
  // /api/token expects application/x-www-form-urlencoded (OAuth2PasswordRequestForm)
  const body = new URLSearchParams();
  body.set("username", username);
  body.set("password", password);

  const res = await fetch(`${API_BASE}/token`, {
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

  const data = await res.json(); // { access_token, token_type }
  setToken(data.access_token);
  return data;
}

export function logout(){
  clearToken();
}

export function register({ email, username, password, full_name=null }){
  return apiFetch("/register", {
    method: "POST",
    body: { email, username, password, full_name }
  });
}
