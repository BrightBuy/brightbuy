import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, setToken } from '../api.js';

const AuthContext = createContext(null);
export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const sessionVersion = useRef(0);
  const logout = useCallback(() => {
    sessionVersion.current += 1;
    setToken(null);
    setUser(null);
  }, []);
  useEffect(() => {
    window.addEventListener('session-expired', logout);
    return () => window.removeEventListener('session-expired', logout);
  }, [logout]);

  async function login(email, password) {
    const version = ++sessionVersion.current;
    const result = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (version !== sessionVersion.current) {
      throw new Error('This sign-in attempt is no longer current. Please sign in again.');
    }
    // Memory-only tokens intentionally disappear when the page reloads.
    setToken(result.accessToken);
    setUser(result.user);
    return result.user;
  }

  const updateUser = useCallback((updatedUser) => {
    setUser((prev) => (prev && prev.id === updatedUser?.id ? { ...prev, ...updatedUser } : prev));
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}
