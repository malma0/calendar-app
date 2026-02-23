export const API_BASE = "/api";

const TOKEN_KEY = "auth_token";

export function getToken(){
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token){
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(){
  localStorage.removeItem(TOKEN_KEY);
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
export async function updateMyColor(color){
  return await apiFetch("/api/users/me/color", {
    method: "PUT",
    body: JSON.stringify({ color }),
  });
}