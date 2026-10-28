import { useEffect, useRef, useState } from 'react';

// Distance after damping (half the finger movement).
const TRIGGER_PX = 50;
const MAX_PX = 110;

// Pulling down from the very top of the page past the threshold triggers a refresh, like native apps.
export default function usePullToRefresh(onRefresh, disabled = false) {
  const [distance, setDistance] = useState(0);
  const startY = useRef(null);
  const distanceRef = useRef(0);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    if (disabled) return undefined;
    const update = (value) => {
      distanceRef.current = value;
      setDistance(value);
    };
    const onStart = (event) => {
      startY.current = window.scrollY <= 0 && event.touches.length === 1 ? event.touches[0].clientY : null;
    };
    const onMove = (event) => {
      if (startY.current === null) return;
      const delta = event.touches[0].clientY - startY.current;
      if (delta <= 0 || window.scrollY > 0) {
        if (distanceRef.current) update(0);
        return;
      }
      update(Math.min(MAX_PX, delta * 0.5));
    };
    const onEnd = () => {
      if (distanceRef.current >= TRIGGER_PX) refreshRef.current();
      startY.current = null;
      update(0);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [disabled]);

  return { distance, ready: distance >= TRIGGER_PX };
}
