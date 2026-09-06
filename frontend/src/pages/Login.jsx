import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, saveAuth } from "../api";

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    full_name: "", email: "", password: "", role: "student", company_name: "",
  });

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit() {
    setMsg("");
    setBusy(true);
    try {
      if (mode === "signup") {
        await api("/api/auth/signup", {
          method: "POST",
          body: JSON.stringify({
            full_name: form.full_name,
            email: form.email,
            password: form.password,
            role: form.role,
            company_name: form.role === "recruiter" ? form.company_name : null,
          }),
        });

        if (form.role === "recruiter") {
          setMode("login");
          setMsg("Account created. An institute admin must approve it before you can log in.");
          return;
        }
      }

      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: form.email, password: form.password }),
      });

      saveAuth(data);
      navigate("/" + data.role, { replace: true });
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={S.page} onKeyDown={(e) => e.key === "Enter" && submit()}>
      <div style={S.card}>
        <h1 style={S.title}>OPIGS</h1>
        <p style={S.sub}>Online Placement Information Gathering System</p>

        {mode === "signup" && (
          <input style={S.input} placeholder="Full name"
                 value={form.full_name} onChange={set("full_name")} />
        )}

        <input style={S.input} placeholder="Email" type="email"
               value={form.email} onChange={set("email")} />

        <input style={S.input} placeholder="Password" type="password"
               value={form.password} onChange={set("password")} />

        {mode === "signup" && (
          <select style={S.input} value={form.role} onChange={set("role")}>
            <option value="student">Student</option>
            <option value="admin">Institute Admin</option>
            <option value="recruiter">Company Recruiter</option>
            <option value="alumni">Alumni</option>
          </select>
        )}

        {mode === "signup" && form.role === "recruiter" && (
          <input style={S.input} placeholder="Company name"
                 value={form.company_name} onChange={set("company_name")} />
        )}

        {msg && <div style={S.msg}>{msg}</div>}

        <button style={S.button} onClick={submit} disabled={busy}>
          {busy ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}
        </button>

        <div style={S.switch} onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMsg(""); }}>
          {mode === "login" ? "New here? Create an account" : "Already registered? Log in"}
        </div>
      </div>
    </div>
  );
}

const S = {
  page:   { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9" },
  card:   { width: 360, padding: 32, background: "#fff", borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,.08)" },
  title:  { margin: 0, fontSize: 28, fontWeight: 700, color: "#1e293b" },
  sub:    { margin: "4px 0 24px", fontSize: 13, color: "#64748b" },
  input:  { width: "100%", padding: "10px 12px", marginBottom: 12, border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 14, boxSizing: "border-box" },
  button: { width: "100%", padding: 11, background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" },
  switch: { marginTop: 14, textAlign: "center", fontSize: 13, color: "#2563eb", cursor: "pointer" },
  msg:    { padding: 10, marginBottom: 12, background: "#fef2f2", color: "#b91c1c", borderRadius: 8, fontSize: 13 },
};