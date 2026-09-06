const BASE_URL = "http://127.0.0.1:8000";

export function saveAuth(data) {
  localStorage.setItem("token", data.access_token);
  localStorage.setItem("role", data.role);
  localStorage.setItem("full_name", data.full_name);
}

export const getToken = () => localStorage.getItem("token");
export const getRole  = () => localStorage.getItem("role");
export const getName  = () => localStorage.getItem("full_name");

export function logout() {
  localStorage.clear();
  window.location.href = "/login";
}

export async function api(path, options = {}) {
  const token = getToken();

  const res = await fetch(BASE_URL + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    logout();
    throw new Error("Session expired, please log in again");
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = Array.isArray(data.detail)
      ? data.detail.map((e) => e.msg).join(", ")
      : data.detail || "Something went wrong";
    throw new Error(msg);
  }
  return data;
}