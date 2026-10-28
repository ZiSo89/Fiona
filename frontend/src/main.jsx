import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AuthGate from './features/auth/AuthGate.jsx';
import { applyTheme, readStoredTheme } from './shared/theme.js';
import './styles.css';

applyTheme(readStoredTheme());

if ('serviceWorker' in navigator) {
  // A controller change on a page that already had one means a newer version took over.
  const hadController = Boolean(navigator.serviceWorker.controller);
  if (!import.meta.env.DEV) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) window.dispatchEvent(new Event('app-update-available'));
    });
  }
  window.addEventListener('load', () => {
    const appScope = new URL(import.meta.env.BASE_URL, window.location.origin).href;

    if (import.meta.env.DEV) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(
          registrations
            .filter((registration) => registration.scope === `${window.location.origin}/`
              || registration.scope === appScope)
            .map((registration) => registration.unregister())
        ))
        .then(() => caches.keys())
        .then((cacheNames) => Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith('fiona-dispatch-'))
            .map((cacheName) => caches.delete(cacheName))
        ))
        .catch((error) => console.warn('Service worker cleanup failed:', error));
      return;
    }

    const rootScope = `${window.location.origin}/`;
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(
        registrations
          .filter((registration) => {
            const worker = registration.active || registration.waiting || registration.installing;
            return registration.scope === rootScope
              && worker
              && new URL(worker.scriptURL).pathname === '/sw.js';
          })
          .map((registration) => registration.unregister())
      ))
      .then(() => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      }))
      .then((registration) => {
        window.setInterval(() => { void registration.update().catch(() => {}); }, 60 * 60 * 1000);
      })
      .catch((error) => {
        console.warn('Service worker registration failed:', error);
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>
);
