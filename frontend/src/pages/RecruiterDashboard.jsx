import { getName, logout } from "../api";

export default function RecruiterDashboard() {
  return (
    <div style={{ padding: 40 }}>
      <h1>Recruiter Dashboard</h1>
      <p>Signed in as {getName()}</p>
      <button onClick={logout}>Log out</button>
    </div>
  );
}