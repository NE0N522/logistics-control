import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth-context.jsx';
import { api } from '../lib/api-client.js';
import { setExchangeRateKgsPerUsd } from '../lib/currency.js';

const DEFAULT_SETTINGS = Object.freeze({
  currency: 'USD', exchangeRateKgsPerUsd: 87.45, exchangeRateSource: 'НБКР', exchangeRateDate: '2026-10-10',
  rates: { dispatcher: 1.5, driver: 10 }, updatedAt: null
});
const STORAGE_KEY = 'logistics-control:system-settings:v1';
const SystemSettingsContext = createContext(null);

function readCachedSettings() {
  try {
    const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!cached || !Number.isFinite(Number(cached.exchangeRateKgsPerUsd))) return DEFAULT_SETTINGS;
    const value = { ...DEFAULT_SETTINGS, ...cached, rates: { ...DEFAULT_SETTINGS.rates, ...cached.rates } };
    setExchangeRateKgsPerUsd(value.exchangeRateKgsPerUsd);
    return value;
  } catch { return DEFAULT_SETTINGS; }
}

export function SystemSettingsProvider({ children }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState(readCachedSettings);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const applySettings = useCallback((next) => {
    const merged = { ...DEFAULT_SETTINGS, ...next, rates: { ...DEFAULT_SETTINGS.rates, ...next?.rates } };
    setExchangeRateKgsPerUsd(merged.exchangeRateKgsPerUsd);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch { /* Server settings remain authoritative. */ }
    setSettings(merged);
    return merged;
  }, []);

  const reload = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try { applySettings(await api.get('/settings')); setError(''); }
    catch (requestError) { setError(requestError.message || 'Не удалось загрузить настройки'); }
    finally { setLoading(false); }
  }, [user?.id, applySettings]);

  useEffect(() => {
    if (!user) return;
    reload();
  }, [user?.id, reload, applySettings]);

  const saveSettings = useCallback(async (changes) => {
    const saved = await api.patch('/settings', changes);
    return applySettings(saved);
  }, [applySettings]);

  const value = useMemo(() => ({ settings, loading, error, reload, saveSettings }), [settings, loading, error, reload, saveSettings]);
  return <SystemSettingsContext.Provider value={value}>{children}</SystemSettingsContext.Provider>;
}

export function useSystemSettings() {
  const value = useContext(SystemSettingsContext);
  if (!value) throw new Error('useSystemSettings должен использоваться внутри SystemSettingsProvider');
  return value;
}
