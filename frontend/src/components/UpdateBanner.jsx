import { useEffect, useState } from 'react';

// main.jsx dispatches 'app-update-available' when a new service worker takes over an open page.
export default function UpdateBanner() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const show = () => setAvailable(true);
    window.addEventListener('app-update-available', show);
    return () => window.removeEventListener('app-update-available', show);
  }, []);
  if (!available) return null;
  return (
    <div className="update-banner" role="status">
      <span>Υπάρχει νέα έκδοση της εφαρμογής.</span>
      <button type="button" onClick={() => window.location.reload()}>Ανανέωση</button>
    </div>
  );
}
