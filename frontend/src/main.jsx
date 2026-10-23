import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AuthGate from './features/auth/AuthGate.jsx';
import './styles.css';

if ('serviceWorker' in navigator) {
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
