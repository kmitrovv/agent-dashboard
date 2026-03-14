"use client";
import { useState, useEffect } from "react";
import { Cpu, LogIn, ExternalLink, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";

interface AuthStatus {
  loggedIn: boolean;
  email?: string;
  orgName?: string;
  subscriptionType?: string;
  authMethod?: string;
  error?: string;
}

interface Props {
  children: React.ReactNode;
}

export function AuthGate({ children }: Props) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginStream, setLoginStream] = useState<string[]>([]);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const checkAuth = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth");
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ loggedIn: false, error: "Failed to check auth" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { checkAuth(); }, []);

  const startLogin = async () => {
    setLoginLoading(true);
    setLoginStream([]);
    setLoginUrl(null);

    const response = await fetch("/api/auth", { method: "POST" });
    if (!response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "url") {
            setLoginUrl(event.url);
            // Try to open the URL automatically
            window.open(event.url, "_blank");
          }
          if (event.message) {
            setLoginStream((prev) => [...prev, event.message]);
          }
          if (event.type === "success") {
            setLoginLoading(false);
            await checkAuth();
            return;
          }
          if (event.type === "error") {
            setLoginLoading(false);
          }
        } catch {}
      }
    }
    setLoginLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: "#08080f" }}>
        <div className="flex items-center gap-2.5 text-sm" style={{ color: "#404060" }}>
          <RefreshCw size={14} className="animate-spin" />
          Checking authentication…
        </div>
      </div>
    );
  }

  if (!status?.loggedIn) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ background: "#08080f" }}
      >
        <div
          className="w-full max-w-md rounded-2xl overflow-hidden"
          style={{ background: "#0e0e1a", border: "1px solid #2a2a48" }}
        >
          <div
            className="px-6 py-5"
            style={{ borderBottom: "1px solid #1e1e35", background: "linear-gradient(to right, #1a1040, #0e0e1a)" }}
          >
            <div className="flex items-center gap-3 mb-1">
              <Cpu size={20} style={{ color: "#6644ff" }} />
              <span className="font-bold text-base" style={{ color: "#e0e0ff" }}>Agent Dashboard</span>
            </div>
            <p className="text-xs" style={{ color: "#50508a" }}>
              Sign in with your Claude account to continue
            </p>
          </div>

          <div className="p-6 space-y-4">
            {status?.error && (
              <div
                className="flex items-start gap-2.5 p-3 rounded-lg text-xs"
                style={{ background: "#ff220015", border: "1px solid #ff220030", color: "#ff7788" }}
              >
                <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                <span>{status.error}</span>
              </div>
            )}

            {/* Login stream output */}
            {loginStream.length > 0 && (
              <div
                className="terminal rounded-lg p-3 text-xs space-y-1 max-h-32 overflow-y-auto"
                style={{ border: "1px solid #1e1e35" }}
              >
                {loginStream.map((msg, i) => (
                  <div key={i} style={{ color: "#6060a0" }}>{msg}</div>
                ))}
                {loginLoading && (
                  <div className="flex items-center gap-1.5" style={{ color: "#404060" }}>
                    <span className="inline-block w-1 h-1 rounded-full animate-pulse" style={{ background: "#5555a0" }} />
                    waiting for browser login…
                  </div>
                )}
              </div>
            )}

            {loginUrl && (
              <a
                href={loginUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-xs transition-colors"
                style={{
                  background: "#6644ff20",
                  border: "1px solid #6644ff40",
                  color: "#9977ff",
                }}
              >
                <ExternalLink size={12} />
                Open login page manually
              </a>
            )}

            <button
              onClick={startLogin}
              disabled={loginLoading}
              className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl font-semibold text-sm transition-all"
              style={{
                background: loginLoading ? "#1e1e35" : "linear-gradient(135deg, #5533ff, #8844ff)",
                color: loginLoading ? "#404060" : "#fff",
                boxShadow: loginLoading ? "none" : "0 0 20px rgba(85,51,255,0.35)",
                cursor: loginLoading ? "not-allowed" : "pointer",
              }}
            >
              {loginLoading ? (
                <><RefreshCw size={14} className="animate-spin" /> Waiting for login…</>
              ) : (
                <><LogIn size={14} /> Sign in with Claude</>
              )}
            </button>

            <p className="text-center text-xs" style={{ color: "#35355a" }}>
              Uses your <code style={{ color: "#50508a" }}>claude</code> CLI session — same account as your terminal
            </p>

            <button
              onClick={checkAuth}
              className="w-full py-1.5 rounded-lg text-xs transition-colors"
              style={{ color: "#404060", border: "1px solid #1e1e35" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#a0a0cc")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#404060")}
            >
              Already logged in? Refresh status
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// Small badge for use in header
export function AuthBadge() {
  const [status, setStatus] = useState<AuthStatus | null>(null);

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  if (!status?.loggedIn) return null;

  return (
    <div className="flex items-center gap-1.5 text-xs" style={{ color: "#404060" }}>
      <CheckCircle size={11} style={{ color: "#00cc88" }} />
      <span className="truncate max-w-[140px]">{status.email}</span>
    </div>
  );
}
