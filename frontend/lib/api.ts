const B = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

export async function api<T = any>(path: string, opt: RequestInit = {}): Promise<T> {
  const headers = new Headers(opt.headers);
  if (typeof FormData !== "undefined" && opt.body instanceof FormData) {
    headers.delete("Content-Type");
  } else {
    headers.set("Content-Type", "application/json");
  }
  if (typeof window !== "undefined") {
    const token = window.sessionStorage.getItem("workspace_access_token");
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const r = await fetch(B + "/api" + path, { ...opt, headers });
  if (r.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.assign("/login");
  }
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText);
  return r.status === 204 ? (null as T) : r.json();
}

export const exportUrl = (id: number, f: string) => `${B}/api/meetings/${id}/export?format=${f}`;

export async function downloadExport(id: number, format: string) {
  const headers = new Headers();
  const token = window.sessionStorage.getItem("workspace_access_token");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(exportUrl(id, format), { headers });
  if (response.status === 401) {
    window.location.assign("/login");
    throw new Error("Workspace access required.");
  }
  if (!response.ok) throw new Error("Could not export this meeting.");
  const file = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = file;
  link.download = `meeting-${id}.${format}`;
  link.click();
  URL.revokeObjectURL(file);
}

export const fmtDur = (s: number) => `${Math.max(1, Math.round(s / 60))} mins`;

export const fmtT = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

export const toast = (m: string) => window.dispatchEvent(new CustomEvent("toast", { detail: m }));

const COLORS = [
  "#6c47ff", "#00b894", "#e17055", "#0984e3", "#fd79a8",
  "#6c5ce7", "#00cec9", "#d63031", "#e84393", "#fdcb6e"
];

export function speakerColor(name: string): string {
  if (!name) return "#6c47ff";
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}
