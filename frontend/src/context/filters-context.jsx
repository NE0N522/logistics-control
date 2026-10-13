import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { BUSINESS_TIMEZONE } from '../lib/format.js';

const FiltersContext=createContext(null);
function businessDateParts(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:BUSINESS_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  return Object.fromEntries(parts.map(p=>[p.type,p.value]));
}
export function defaultRange(months=6){
  const now=businessDateParts();
  const to=`${now.year}-${now.month}-${now.day}`;
  const fromDate=new Date(Date.UTC(Number(now.year),Number(now.month)-1-(months-1),1));
  const from=`${fromDate.getUTCFullYear()}-${String(fromDate.getUTCMonth()+1).padStart(2,'0')}-01`;
  return {from,to};
}
export function FiltersProvider({children}){
  const [filters,setFilters]=useState(()=>({...defaultRange(6),managerId:'',driverId:'',productId:'',region:''}));
  const updateFilter=useCallback((key,value)=>setFilters(prev=>({...prev,[key]:value})),[]);
  const setRangePreset=useCallback((months)=>setFilters(prev=>({...prev,...defaultRange(months)})),[]);
  const resetFilters=useCallback(()=>setFilters({...defaultRange(6),managerId:'',driverId:'',productId:'',region:''}),[]);
  const value=useMemo(()=>({filters,updateFilter,setRangePreset,resetFilters,setFilters}),[filters,updateFilter,setRangePreset,resetFilters]);
  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}
export function useFilters(){const ctx=useContext(FiltersContext);if(!ctx)throw new Error('useFilters должен использоваться внутри FiltersProvider');return ctx;}
