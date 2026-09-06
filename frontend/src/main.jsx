import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import App from "./App.jsx";
import Login from "./pages/Login.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import RecruiterDashboard from "./pages/RecruiterDashboard.jsx";
import AlumniDashboard from "./pages/AlumniDashboard.jsx";
import ProtectedRoute from "./ProtectedRoute.jsx";
import { getToken, getRole } from "./api";



function Home() {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <Navigate to={"/" + getRole()} replace />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />

        <Route path="/student" element={
          <ProtectedRoute allow={["student"]}><App /></ProtectedRoute>} />

        <Route path="/admin" element={
          <ProtectedRoute allow={["admin"]}><AdminDashboard /></ProtectedRoute>} />

        <Route path="/recruiter" element={
          <ProtectedRoute allow={["recruiter"]}><RecruiterDashboard /></ProtectedRoute>} />

        <Route path="/alumni" element={
          <ProtectedRoute allow={["alumni"]}><AlumniDashboard /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);