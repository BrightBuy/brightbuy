import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setToken } from '../api.js';

const AuthContext = createContext(null);
export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);
  useEffect(() => {
    window.addEventListener('session-expired', logout);
    return () => window.removeEventListener('session-expired', logout);
  }, [logout]);

  async function login(email, password) {
    const result = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    // Memory-only tokens intentionally disappear when the page reloads.
    setToken(result.accessToken);
    setUser(result.user);
    return result.user;
  }
  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}
