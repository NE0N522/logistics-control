import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const PreferencesContext = createContext(null);
const STORAGE_KEY = 'logistics-control:preferences:v1';

function readPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return {
      theme: ['system', 'light', 'dark'].includes(value?.theme) ? value.theme : 'system',
      compactTables: value?.compactTables === true
    };
  } catch {
    return { theme: 'system', compactTables: false };
  }
}

export function PreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState(readPreferences);
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const theme = preferences.theme === 'system' ? (media.matches ? 'dark' : 'light') : preferences.theme;
      root.dataset.theme = theme;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = theme === 'dark' ? '#101827' : '#f3f6fb';
    };
    applyTheme();
    if (preferences.theme === 'system') media.addEventListener?.('change', applyTheme);
    if (preferences.compactTables) root.dataset.density = 'compact';
    else root.removeAttribute('data-density');
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch { /* Browser storage is optional. */ }
    return () => media.removeEventListener?.('change', applyTheme);
  }, [preferences]);

  const updatePreferences = useCallback((changes) => setPreferences((current) => ({ ...current, ...changes })), []);
  const value = useMemo(() => ({ preferences, updatePreferences }), [preferences, updatePreferences]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences должен использоваться внутри PreferencesProvider');
  return value;
}
