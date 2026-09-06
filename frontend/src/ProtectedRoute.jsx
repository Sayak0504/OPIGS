import { Navigate } from "react-router-dom";
import { getToken, getRole } from "./api";

export default function ProtectedRoute({ allow, children }) {
  const token = getToken();
  const role = getRole();

  if (!token) return <Navigate to="/login" replace />;
  if (allow && !allow.includes(role)) return <Navigate to={"/" + role} replace />;

  return children;
}