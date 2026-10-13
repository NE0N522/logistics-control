import { getExchangeRateKgsPerUsd } from './currency.js';
export const BUSINESS_TIMEZONE=import.meta.env.VITE_BUSINESS_TIMEZONE||'Asia/Bishkek';

function partsToDateOnly(date){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:BUSINESS_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function formatMoney(value,{compact=false}={}){const n=(Number(value)||0)/getExchangeRateKgsPerUsd();const options=compact?{notation:'compact',maximumFractionDigits:1}:{minimumFractionDigits:2,maximumFractionDigits:2};return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',...options}).format(n);}
export function formatNumber(value){return new Intl.NumberFormat('ru-RU').format(Number(value)||0);}
export function formatPercent(value,{withSign=false}={}){if(value===null||value===undefined||Number.isNaN(Number(value)))return '—';const sign=withSign&&value>0?'+':'';return `${sign}${Number(value).toFixed(1)}%`;}
export function formatDate(iso){if(!iso)return '—';const d=new Date(iso);if(Number.isNaN(d.getTime()))return '—';return new Intl.DateTimeFormat('ru-RU',{timeZone:BUSINESS_TIMEZONE,day:'2-digit',month:'short',year:'numeric'}).format(d);}
export function formatDateTime(iso){if(!iso)return '—';const d=new Date(iso);if(Number.isNaN(d.getTime()))return '—';return new Intl.DateTimeFormat('ru-RU',{timeZone:BUSINESS_TIMEZONE,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d);}
export function toInputDate(iso){if(!iso)return '';const d=new Date(iso);if(Number.isNaN(d.getTime()))return '';return partsToDateOnly(d);}
export const STAGE_LABELS={lead:'Новый',negotiation:'Назначен',deal:'В пути',paid:'Доставлен',lost:'Проблема / отменён'};
export const STAGE_ORDER=['lead','negotiation','deal','paid','lost'];
export const SHIPMENT_STATUS_LABELS={new:'Новый',assigned:'Назначен',in_transit:'В пути',delivered:'Доставлен',issue:'Проблема',cancelled:'Отменён'};
export const SHIPMENT_STATUS_ORDER=['new','assigned','in_transit','delivered','issue','cancelled'];
