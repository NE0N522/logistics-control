import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api-client.js';

export function useReferenceData() {
  const [managers, setManagers] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [products, setProducts] = useState([]);
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(() => {
    setLoading(true); setError(null);
    return Promise.all([
      api.get('/managers', { includeInactive: 1 }),
      api.get('/products', { includeInactive: 1 }),
      api.get('/dashboard/regions')
    ]).then(([m,p,r])=>{
      const dispatchers = m.filter((person) => person.position === 'dispatcher');
      const availableDrivers = m.filter((person) => person.position === 'driver');
      setManagers(dispatchers); setDrivers(availableDrivers); setProducts(p); setRegions(r); setLoading(false);
      return { managers:dispatchers, drivers:availableDrivers, products:p, regions:r };
    }).catch((err)=>{setError(err); setLoading(false); throw err;});
  }, []);

  useEffect(()=>{reload().catch(()=>undefined);}, [reload]);
  return { managers, drivers, products, regions, loading, error, reload };
}
