import React, { useEffect, useState } from 'react';

export const UpdateNotification: React.FC = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!navigator.serviceWorker) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'sw-updated') setShow(true);
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, []);

  if (!show) return null;

  return (
    <div className="update-toast">
      <span>アプリが更新されました</span>
      <button className="update-reload-btn" onClick={() => window.location.reload()}>
        更新
      </button>
      <button className="update-dismiss-btn" onClick={() => setShow(false)}>
        ✕
      </button>
    </div>
  );
};
