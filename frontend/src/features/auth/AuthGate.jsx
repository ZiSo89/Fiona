import { useEffect, useState } from 'react';
import { clearCachedTickets, pruneCachedTickets } from '../tickets/ticketStorage.js';

const originalFetch = window.fetch.bind(window);
// Any 401 from the API (expired session) sends the user back to the login form.
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  const url = String(args[0]?.url ?? args[0]);
  if (response.status === 401 && url.startsWith('/api/') && !url.startsWith('/api/login') && !url.startsWith('/api/session')) {
    window.dispatchEvent(new Event('fiona-unauthorized'));
  }
  return response;
};

export default function AuthGate({ children }) {
  const [state, setState] = useState('checking');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    originalFetch('/api/session')
      .then((response) => {
        if (response.ok) {
          pruneCachedTickets();
          setState('in');
          return;
        }
        clearCachedTickets();
        setState('out');
      })
      .catch(() => {
        clearCachedTickets();
        setState('out');
      });
    const onUnauthorized = () => {
      clearCachedTickets();
      setState('out');
    };
    const onLogout = () => setState('out');
    window.addEventListener('fiona-unauthorized', onUnauthorized);
    window.addEventListener('fiona-logged-out', onLogout);
    return () => {
      window.removeEventListener('fiona-unauthorized', onUnauthorized);
      window.removeEventListener('fiona-logged-out', onLogout);
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await originalFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        setPassword('');
        setState('in');
      } else {
        const result = await response.json().catch(() => ({}));
        setError(result.message || 'Αποτυχία σύνδεσης');
      }
    } catch {
      setError('Δεν υπάρχει σύνδεση με τον server');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'checking') {
    return <main className="login-screen"><p className="auth-loading" role="status">Φόρτωση…</p></main>;
  }
  if (state === 'in') return children;

  return (
    <main className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <h1>Εισιτήρια Fiona</h1>
        <label htmlFor="password">Κωδικός εφαρμογής</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && <p className="login-error" role="alert">{error}</p>}
        <button type="submit" disabled={busy || !password}>{busy ? 'Σύνδεση…' : 'Είσοδος'}</button>
      </form>
    </main>
  );
}
