import { useMemo } from 'react';

export function useAuth() {
  const token = localStorage.getItem('admin_token');
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  return { token, headers };
}
