import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';

export function CustomerRoute() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'customer') return <Navigate to="/" replace />;
  return <Outlet />;
}
