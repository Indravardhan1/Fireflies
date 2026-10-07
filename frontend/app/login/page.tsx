"use client";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [required, setRequired] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ auth_required: boolean }>("/health").then(status => {
      setRequired(status.auth_required);
      if (!status.auth_required) router.replace("/");
    }).catch((reason: Error) => setError(reason.message));
  }, [router]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    window.sessionStorage.setItem("workspace_access_token", token);
    try {
      await api("/auth/check", { method: "POST", body: JSON.stringify({ token }) });
      router.replace("/");
    } catch (reason: any) {
      window.sessionStorage.removeItem("workspace_access_token");
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pad feature-container" style={{ maxWidth: 440, margin: "10vh auto" }}>
      <div className="card-panel">
        <KeyRound size={24} />
        <h2>Workspace access</h2>
        <p className="muted">Enter the access token configured for this deployment.</p>
        <form onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="access-token">Access token</label>
            <input id="access-token" type="password" autoComplete="current-password" value={token} onChange={event => setToken(event.target.value)} required />
          </div>
          {error && <p role="alert" className="muted">{error}</p>}
          <button className="btn primary" type="submit" disabled={loading || required === false} style={{ marginTop: 16 }}>
            {loading ? "Checking..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
