import { useState, useEffect } from 'react';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';

export function App() {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem('admin_token')
  );
  const [verified, setVerified] = useState(false);

  /** On mount — verify if the stored token is still valid */
  useEffect(() => {
    if (!token) {
      setVerified(true);
      return;
    }

    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) {
          // Token expired or invalid — clear it
          localStorage.removeItem('admin_token');
          setToken(null);
        }
      })
      .catch(() => {
        // Server unreachable — clear token
        localStorage.removeItem('admin_token');
        setToken(null);
      })
      .finally(() => setVerified(true));
  }, [token]);

  /** Save token after successful login */
  const handleLogin = (newToken: string) => {
    localStorage.setItem('admin_token', newToken);
    setToken(newToken);
  };

  /** Remove token on logout */
  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    setToken(null);
  };

  // Wait until token verification completes
  if (!verified) {
    return null;
  }

  if (!token) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return <DashboardPage onLogout={handleLogout} />;
}
