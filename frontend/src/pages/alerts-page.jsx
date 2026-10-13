import { useState } from 'react';
import { AlertTriangle, TrendingDown, CheckCircle2, SlidersHorizontal, BellRing } from 'lucide-react';
import { Topbar } from '../components/layout/topbar.jsx';
import { LoadingState, ErrorState } from '../components/ui/state-blocks.jsx';
import { useAsyncData } from '../hooks/use-async-data.js';
import { api } from '../lib/api-client.js';
import { formatDateTime } from '../lib/format.js';
import { useAuth } from '../context/auth-context.jsx';

const ICONS={plan:AlertTriangle,drop:TrendingDown};
const SETTINGS_KEY='sales-control:notification-thresholds:v1';
function readSettings(){
  try{const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null');return{planPacePct:Number(saved?.planPacePct)||85,salesDropPct:Number(saved?.salesDropPct)||15};}catch{return{planPacePct:85,salesDropPct:15};}
}

export function AlertsPage({onMenu}){
  const {user}=useAuth();
  const isAdmin=user?.role==='admin';
  const [draft,setDraft]=useState(readSettings);
  const [applied,setApplied]=useState(readSettings);
  const key=JSON.stringify(applied);
  const notifications=useAsyncData(()=>api.get('/notifications',applied),[key],{data:[]});
  const rows=notifications.data?.data||notifications.data||[];
  function applySettings(event){event.preventDefault();setApplied({...draft});try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(draft));}catch{/* Browser storage can be disabled. */}window.dispatchEvent(new Event('sales-notification-settings-changed'));}

  return <>
    <Topbar onMenu={onMenu} title="Уведомления" subtitle="Контроль плана перевозок и стоимости доставленных грузов" actions={<span className="alert-live"><span/> Активный контроль</span>}/>
    <div className="content">
      <section className="alerts-hero"><span className="alerts-hero__icon"><BellRing size={19}/></span><div><strong>Ранние сигналы по перевозкам</strong><p>Сервис проверяет выполнение плана и сравнивает стоимость доставок за завершённые месяцы. Уведомления появляются здесь и в меню.</p></div></section>
      {isAdmin&&<details className="panel alert-settings">
        <summary><span className="alert-settings__title"><SlidersHorizontal size={16}/> Чувствительность уведомлений</span><span className="alert-settings__current">План: {applied.planPacePct}% · Падение: {applied.salesDropPct}%</span></summary>
        <form className="alert-settings__form" onSubmit={applySettings}>
          <label className="threshold-control"><span><strong>Минимальный темп плана</strong><small>Сигнал появится, если стоимость доставленных грузов будет ниже этого процента от ожидаемого результата.</small></span><output>{draft.planPacePct}%</output><input aria-label="Минимальный темп выполнения плана" type="range" min="50" max="100" step="5" value={draft.planPacePct} onChange={(event)=>setDraft((value)=>({...value,planPacePct:Number(event.target.value)}))}/></label>
          <label className="threshold-control"><span><strong>Падение стоимости доставок</strong><small>Сигнал появится, когда стоимость доставленных грузов за завершённый месяц снизится сильнее этого значения.</small></span><output>{draft.salesDropPct}%</output><input aria-label="Порог падения стоимости доставок" type="range" min="5" max="50" step="5" value={draft.salesDropPct} onChange={(event)=>setDraft((value)=>({...value,salesDropPct:Number(event.target.value)}))}/></label>
          <button className="btn btn-secondary" type="submit"><SlidersHorizontal size={14}/> Применить пороги</button>
        </form>
      </details>}
      <section className="panel alerts-panel">
        <div className="panel__header"><div><div className="panel__title">Требуют внимания</div><div className="panel__subtitle">Пороговые значения применяются к вашему просмотру уведомлений.</div></div>{!notifications.loading&&!notifications.error&&<span className="settings-count">{rows.length} активных</span>}</div>
        {notifications.error?<ErrorState message="Не удалось загрузить уведомления" onRetry={()=>notifications.reload().catch(()=>undefined)}/>:notifications.loading?<LoadingState label="Проверяем показатели…"/>:rows.length===0?<div className="state-block"><CheckCircle2 size={27} strokeWidth={1.6} color="var(--success)" aria-hidden="true"/><span className="state-block__title">Отклонений не найдено</span><span>Темп перевозок и динамика стоимости доставок сейчас в пределах выбранных порогов.</span></div>:<div className="stack">{rows.map((n)=>{const Icon=ICONS[n.type]||AlertTriangle;return <article className={`alert alert--${n.severity}`} key={n.id}><Icon className="alert__icon" aria-hidden="true"/><div><div className="alert__title">{n.title}</div><div className="alert__message">{n.message}</div><div className="table-hint">Период: {n.period||'—'} · рассчитано {formatDateTime(n.createdAt)}</div></div></article>})}</div>}
      </section>
      <p className="alerts-footnote">Доставка — внутри приложения. Автоотправка по email или в мессенджеры не настроена.</p>
    </div>
  </>;
}
