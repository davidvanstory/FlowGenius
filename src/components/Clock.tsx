// Clock.tsx
// This component displays a live-updating clock at the top of the application.
// It uses React hooks to update the time every second and logs lifecycle events.

import { useState, useEffect } from 'react';

/**
 * Clock component that displays the current local time and updates every second.
 * Logs mount, update, and unmount events for debugging.
 */
function Clock() {
  // State to hold the current time string
  const [time, setTime] = useState(() => new Date().toLocaleTimeString());

  useEffect(() => {
    console.log('[Clock] Mounted');
    // Update the time every second
    const intervalId = setInterval(() => {
      const now = new Date();
      setTime(now.toLocaleTimeString());
      console.log(`[Clock] Updated: ${now.toLocaleTimeString()}`);
    }, 1000);
    // Cleanup on unmount
    return () => {
      clearInterval(intervalId);
      console.log('[Clock] Unmounted');
    };
  }, []);

  return (
    <div style={{ width: '100%', textAlign: 'center', fontWeight: 600, fontSize: '1.5em', marginBottom: '1em', letterSpacing: '0.05em' }}>
      🕒 {time}
    </div>
  );
}

export default Clock; 
