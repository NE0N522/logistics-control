import { useState } from 'react';
import { Pencil, Target, Archive, ArchiveRestore } from 'lucide-react';
import { Topbar } from '../components/layout/topbar.jsx';
import { FilterBar } from '../components/layout/filter-bar.jsx';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/state-blocks.jsx';
import { ManagerFormModal } from '../components/team/manager-form-modal.jsx';
import { useFilters } from '../context/filters-context.jsx';
import { useAuth } from '../context/auth-context.jsx';
import { useAsyncData } from '../hooks/use-async-data.js';
import { api } from '../lib/api-client.js';
import { formatMoney, formatNumber, BUSINESS_TIMEZONE } from '../lib/format.js';
import { usdToKgs, kgsToUsdInput } from '../lib/currency.js';

function currentMonth(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:BUSINESS_TIMEZONE,year:'numeric',month:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return `${p.year}-${p.month}`;}
function monthLastDay(period){return new Date(Number(period.slice(0,4)),Number(period.slice(5,7)),0).getDate();}

export function TeamPage({onMenu,onDataChanged}){
  const {filters}=useFilters();
  const {user}=useAuth();
  const isAdmin=user.role==='admin';
  const [planPeriod,setPlanPeriod]=useState(currentMonth());
  const key=JSON.stringify({...filters,planPeriod});
  const stats=useAsyncData(()=>api.get('/managers/stats',{...filters,planPeriod}),[key],{planPeriod,data:[]});
  const managerStats=Array.isArray(stats.data) ? stats.data : (Array.isArray(stats.data?.data) ? stats.data.data : []);
  const employees=managerStats.filter((person)=>person.position==='dispatcher'||person.position==='driver');
  const logistics=useAsyncData(()=>api.get('/logistics/report',{...filters,pageSize:1}),[JSON.stringify(filters)],{byDispatcher:[],byDriver:[]});
  const companyPlan=useAsyncData(()=>api.get('/plans',{period:planPeriod}),[planPeriod],{period:planPeriod,company:null,byManager:[]});
  const lastDay=monthLastDay(planPeriod);
  const planSales=useAsyncData(()=>api.get('/logistics/report',{from:`${planPeriod}-01`,to:`${planPeriod}-${String(lastDay).padStart(2,'0')}`,pageSize:1}),[planPeriod],{summary:{deliveredValue:0}});
  const [companyValue,setCompanyValue]=useState('');
  const [modalManager,setModalManager]=useState(undefined);
  const [planTarget,setPlanTarget]=useState(null);
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState('');

  async function managerSubmit(form){
    setSubmitting(true);setError('');
    try{await api.put(`/managers/${modalManager.id}`,form);setModalManager(undefined);await stats.reload();onDataChanged?.();}
    catch(err){setError(err.message);}finally{setSubmitting(false);}
  }
  async function saveCompany(){
    if(!isAdmin)return;setError('');
    try{await api.put('/plans',{period:planPeriod,managerId:null,targetAmount:usdToKgs(companyValue)});setCompanyValue('');await companyPlan.reload();onDataChanged?.();}
    catch(err){setError(err.message);}
  }
  async function setManagerArchived(manager, archived){
    if(!isAdmin)return;setError('');
    try{await api.post(`/managers/${manager.id}/${archived?'archive':'restore'}`,{});await stats.reload();onDataChanged?.();}
    catch(err){setError(err.message);}
  }
  async function saveManagerPlan(managerId,value){
    if(!isAdmin)return;setError('');
    const amount=Number(value);if(!Number.isFinite(amount)||amount<0){setError('Цель должна быть неотрицательным числом');return;}
    const amountKgs=usdToKgs(amount);
    try{await api.put('/plans',{period:planPeriod,managerId,targetAmount:amountKgs});setPlanTarget(null);await stats.reload();onDataChanged?.();}
    catch(err){setError(err.message);}
  }

  return <>
    <Topbar onMenu={onMenu} title="Сотрудники" subtitle="Назначения диспетчеров, доставки водителей и цели перевозок"/>
    <div className="content">
      <FilterBar/>
      <div className="panel">
        <div className="panel__header">
          <div><div className="panel__title">Плановый месяц: {planPeriod}</div><div className="panel__subtitle">Цель и доставленные грузы рассчитаны по одному календарному месяцу.</div></div>
          <input className="input" type="month" value={planPeriod} onChange={e=>setPlanPeriod(e.target.value)} aria-label="Месяц плана" style={{width:160}}/>
        </div>
        {companyPlan.loading||planSales.loading?<LoadingState/>:companyPlan.error||planSales.error?<ErrorState message={error||'Не удалось загрузить план'} onRetry={()=>{companyPlan.reload().catch(()=>undefined);planSales.reload().catch(()=>undefined);}}/>:<div className="plan-summary">
          <div><span className="kpi-card__label">План перевозок</span><strong>{companyPlan.data?.company?formatMoney(companyPlan.data.company.target_amount):'Не задан'}</strong></div>
          <div><span className="kpi-card__label">Стоимость доставок</span><strong>{formatMoney(planSales.data.summary?.deliveredValue||0)}</strong></div>
          <div><span className="kpi-card__label">Выполнение плана</span><strong>{companyPlan.data?.company?companyPlan.data.company.target_amount===0?(planSales.data.summary?.deliveredValue>0?'Без % (цель 0)':'0%'):`${Math.round((planSales.data.summary?.deliveredValue||0)/companyPlan.data.company.target_amount*100)}%`:'—'}</strong></div>
          {isAdmin&&<div className="row"><input className="input" type="number" min="0" max="10000000" step="0.01" placeholder="Цель, USD" value={companyValue} onChange={e=>setCompanyValue(e.target.value)} aria-label="Цель перевозок, USD" style={{width:170}}/><button className="btn btn-primary" disabled={companyValue===''} onClick={saveCompany}><Target size={14}/> Сохранить</button></div>}
        </div>}
      </div>
      {error&&<div className="form-error" role="alert">{error}</div>}
      <div className="panel">
        <div className="panel__header"><div><div className="panel__title">Диспетчеры и водители</div><div className="panel__subtitle">Количество назначенных и доставленных грузов; цель по стоимости применяется к диспетчерам.</div></div></div>
        {stats.error||logistics.error?<ErrorState message="Не удалось загрузить статистику сотрудников" onRetry={()=>{stats.reload().catch(()=>undefined);logistics.reload().catch(()=>undefined);}}/>:stats.loading||logistics.loading?<LoadingState/>:employees.length===0?<EmptyState title="Сотрудников пока нет" description="Добавьте сотрудников в разделе «Настройки»."/>:<div className="data-table-wrap">
          <table className="data-table team-table"><caption className="sr-only">Статистика диспетчеров, водителей и план за {planPeriod}</caption><thead><tr><th>Сотрудник</th><th>Должность</th><th>Регион</th><th className="data-table__numeric data-table__count">Назначено</th><th className="data-table__numeric data-table__count">Доставлено</th><th style={{minWidth:220}}>План, USD · {planPeriod}</th><th></th></tr></thead>
          <tbody>{employees.map(m=>{
            const reportRow=(m.position==='driver'?logistics.data.byDriver:logistics.data.byDispatcher).find((row)=>row.name===m.name);
            return <tr key={m.id}>
            <td data-label="Сотрудник">{m.name}{!m.active&&<span className="inactive-mark"> · архив</span>}</td>
            <td data-label="Должность">{m.position==='driver'?'Водитель':'Диспетчер'}</td>
            <td data-label="Регион">{m.region||'—'}</td>
            <td className="data-table__numeric data-table__count" data-label="Назначено">{formatNumber(reportRow?.loads||0)}</td>
            <td className="data-table__numeric data-table__count" data-label="Доставлено">{formatNumber(reportRow?.delivered||0)}</td>
            <td data-label={`План, USD · ${planPeriod}`}>
              {m.position!=='dispatcher'?<span className="table-hint">—</span>:isAdmin&&planTarget?.managerId===m.id?<form className="row" onSubmit={e=>{e.preventDefault();saveManagerPlan(m.id,planTarget.value);}}>
                <input autoFocus type="number" min="0" max="10000000" step="0.01" className="input" style={{width:110,padding:'5px 8px'}} value={planTarget.value} onChange={e=>setPlanTarget({managerId:m.id,value:e.target.value})} aria-label={`План ${m.name}, USD`}/>
                <button className="btn btn-sm btn-primary" type="submit" aria-label="Сохранить план">✓</button>
                <button className="btn btn-sm btn-ghost" type="button" onClick={()=>setPlanTarget(null)} aria-label="Отменить ввод">×</button>
              </form>:m.hasPlan?<div className="stack" style={{gap:4}}>
                <div className="row" style={{justifyContent:'space-between'}}><span>{formatMoney(m.plan,{compact:true})}</span><span>{m.plan===0?(m.planSales>0?'—':'0%'):`${m.planCompletionPct}%`}</span></div>
                <div className="table-hint">Доставлено за месяц: {formatMoney(m.planSales,{compact:true})}</div>
                <div className="pill-progress" aria-label={`Выполнение плана ${m.name}`}><div className="pill-progress__fill" style={{width:m.plan>0?`${Math.min(100,m.planCompletionPct)}%`:'0%'}}/></div>
              </div>:isAdmin?<button className="btn btn-sm btn-ghost" onClick={()=>setPlanTarget({managerId:m.id,value:'3000'})}><Target size={13}/> Задать план</button>:<span className="table-hint">План не задан</span>}
            </td>
            <td data-label="Действия"><div className="row">{isAdmin&&<>{m.position==='dispatcher'&&<button className="icon-btn" title="Изменить план" aria-label={`Изменить план ${m.name}`} onClick={()=>setPlanTarget({managerId:m.id,value:kgsToUsdInput(m.plan??300000)})}><Target size={15}/></button>}<button className="icon-btn" title={m.active?'Архивировать':'Восстановить'} aria-label={m.active?`Архивировать сотрудника ${m.name}`:`Восстановить сотрудника ${m.name}`} onClick={()=>setManagerArchived(m,!m.active)}>{m.active?<Archive size={15}/>:<ArchiveRestore size={15}/>}</button><button className="icon-btn" title="Изменить профиль" aria-label={`Изменить профиль ${m.name}`} onClick={()=>{setError('');setModalManager(m);}}><Pencil size={15}/></button></>}</div></td>
          </tr>})}</tbody></table>
        </div>}
      </div>
    </div>
    {modalManager!==undefined&&<ManagerFormModal manager={modalManager} submitting={submitting} errorMessage={error} onClose={()=>{setModalManager(undefined);setError('')}} onSubmit={managerSubmit}/>} 
  </>;
}
