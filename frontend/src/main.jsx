import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AuthGate from './AuthGate';
import './styles.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (import.meta.env.DEV) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(
          registrations
            .filter((registration) => registration.scope === `${window.location.origin}/`)
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

    navigator.serviceWorker.register('/sw.js').catch((error) => {
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
