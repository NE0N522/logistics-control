import { RotateCcw, BookmarkPlus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useFilters } from '../../context/filters-context.jsx';
import { useReferenceData } from '../../hooks/use-reference-data.js';
import { ErrorState } from '../ui/state-blocks.jsx';
const PRESETS=[{label:'3 мес',months:3},{label:'6 мес',months:6},{label:'12 мес',months:12}];
const SAVED_FILTERS_KEY='sales-control:saved-views:v1';

function readSavedViews(){
  try{const value=JSON.parse(localStorage.getItem(SAVED_FILTERS_KEY)||'[]');return Array.isArray(value)?value:[];}catch{return [];}
}
export function FilterBar(){
  const {filters,updateFilter,setRangePreset,resetFilters,setFilters}=useFilters();
  const {managers,drivers,products,regions,error,reload}=useReferenceData();
  const [savedViews,setSavedViews]=useState(readSavedViews);
  const [selectedView,setSelectedView]=useState('');
  function persist(next){setSavedViews(next);try{localStorage.setItem(SAVED_FILTERS_KEY,JSON.stringify(next));}catch{}}
  function saveView(){
    const name=window.prompt('Название сохранённого среза');
    if(!name?.trim())return;
    const next=[...savedViews.filter((view)=>view.name.toLocaleLowerCase('ru')!==name.trim().toLocaleLowerCase('ru')),{id:`${Date.now()}`,name:name.trim().slice(0,40),filters:{...filters}}];
    persist(next);setSelectedView(String(next.at(-1).id));
  }
  function selectView(value){setSelectedView(value);const view=savedViews.find((item)=>String(item.id)===value);if(view)setFilters({...view.filters});}
  function deleteSelectedView(){const next=savedViews.filter((item)=>String(item.id)!==selectedView);persist(next);setSelectedView('');}
  if(error) return <div className="panel panel--compact"><ErrorState message="Не удалось загрузить справочники фильтров" onRetry={reload}/></div>;
  return <div className="filter-bar" aria-label="Фильтры отчёта">
    <div className="filter-bar__field"><label htmlFor="filter-from">Период с</label><input id="filter-from" type="date" className="input" value={filters.from} onChange={(e)=>updateFilter('from',e.target.value)} max={filters.to||undefined}/></div>
    <div className="filter-bar__field"><label htmlFor="filter-to">по</label><input id="filter-to" type="date" className="input" value={filters.to} onChange={(e)=>updateFilter('to',e.target.value)} min={filters.from||undefined}/></div>
    <div className="filter-bar__presets" aria-label="Быстрые периоды"><span>Быстрый период</span><div className="row" style={{gap:4}}>{PRESETS.map(p=><button key={p.months} type="button" className="btn btn-ghost btn-sm" onClick={()=>setRangePreset(p.months)}>{p.label}</button>)}</div></div>
    <div className="filter-bar__field"><label htmlFor="filter-manager">Диспетчер</label><select id="filter-manager" className="select" value={filters.managerId} onChange={(e)=>updateFilter('managerId',e.target.value)}><option value="">Все диспетчеры</option>{managers.map(m=><option key={m.id} value={m.id}>{m.name}{!m.active?' · архив':' '}</option>)}</select></div>
    <div className="filter-bar__field"><label htmlFor="filter-driver">Водитель</label><select id="filter-driver" className="select" value={filters.driverId} onChange={(e)=>updateFilter('driverId',e.target.value)}><option value="">Все водители</option>{drivers.map(m=><option key={m.id} value={m.id}>{m.name}{!m.active?' · архив':' '}</option>)}</select></div>
    <div className="filter-bar__field"><label htmlFor="filter-product">Тип груза</label><select id="filter-product" className="select" value={filters.productId} onChange={(e)=>updateFilter('productId',e.target.value)}><option value="">Все типы</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}{!p.active?' · архив':' '}</option>)}</select></div>
    <div className="filter-bar__field"><label htmlFor="filter-region">Регион</label><select id="filter-region" className="select" value={filters.region} onChange={(e)=>updateFilter('region',e.target.value)}><option value="">Все регионы</option>{regions.map(r=><option key={r} value={r}>{r}</option>)}</select></div>
    <div className="filter-bar__saved"><label htmlFor="saved-view">Мои срезы</label><div className="row" style={{gap:4}}><select id="saved-view" className="select" value={selectedView} onChange={(event)=>selectView(event.target.value)}><option value="">Выбрать срез…</option>{savedViews.map((view)=><option key={view.id} value={view.id}>{view.name}</option>)}</select>{selectedView&&<button type="button" className="icon-btn" onClick={deleteSelectedView} aria-label="Удалить сохранённый срез" title="Удалить срез"><Trash2 size={15}/></button>}<button type="button" className="btn btn-ghost btn-sm" onClick={saveView}><BookmarkPlus size={14}/> Сохранить</button></div></div>
    <div className="filter-bar__spacer"/><button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters} title="Сбросить фильтры"><RotateCcw size={14} aria-hidden="true"/> Сбросить</button>
  </div>;
}
