import { useEffect, useState } from 'react';
import { api } from '../lib/api-client.js';

function notificationSettings(){
  try{return JSON.parse(localStorage.getItem('sales-control:notification-thresholds:v1')||'null')||{};}catch{return {};}
}
export function useNotifications() {
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);
  const load = () => api.get('/notifications',notificationSettings()).then((result)=>{setData(result.data || []); setError(null);}).catch(setError);
  useEffect(()=>{
    load();
    const interval = setInterval(load, 60000);
    const onFocus = () => load();
    const onChanged = () => load();
    const onSettingsChanged = () => load();
    window.addEventListener('focus', onFocus);
    window.addEventListener('sales-data-changed', onChanged);
    window.addEventListener('sales-notification-settings-changed',onSettingsChanged);
    return ()=>{clearInterval(interval);window.removeEventListener('focus',onFocus);window.removeEventListener('sales-data-changed',onChanged);window.removeEventListener('sales-notification-settings-changed',onSettingsChanged);};
  },[]);
  return { data, error, reload: load };
}
