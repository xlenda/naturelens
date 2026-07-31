import { useState, useCallback } from 'react';

export function useAppAlert() {
  const [config, setConfig] = useState(null);

  const showAlert = useCallback((title, message, buttons) => {
    setConfig({ title, message, buttons });
  }, []);

  const hideAlert = useCallback(() => setConfig(null), []);

  return { alertConfig: config, showAlert, hideAlert };
}
