import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Lightbulb, Sparkles } from 'lucide-react';
import { formatMoney, formatPercent } from '../../lib/format.js';

const STORAGE_KEY='sales-control:auto-insights:v1';
function initiallyEnabled(){try{return localStorage.getItem(STORAGE_KEY)==='on';}catch{return false;}}

export function AutoInsights({summary,forecast,topManagers,topProducts}) {
  const [enabled,setEnabled]=useState(initiallyEnabled);
  function toggle(){const next=!enabled;setEnabled(next);try{localStorage.setItem(STORAGE_KEY,next?'on':'off');}catch{/* Browser storage can be disabled. */}}
  const items=[];
  if(summary?.revenueChangePct!==null&&summary?.revenueChangePct!==undefined){
    const positive=summary.revenueChangePct>=0;
    items.push({tone:positive?'positive':'warning',icon:positive?ArrowUpRight:ArrowDownRight,title:`Стоимость доставок ${positive?'выросла':'снизилась'} на ${formatPercent(Math.abs(summary.revenueChangePct))}`,text:'Сравнение с предыдущим равным периодом по дате доставки.'});
  }
  if(forecast?.trendPctPerMonth!==null&&forecast?.trendPctPerMonth!==undefined){
    const positive=forecast.trendPctPerMonth>=0;
    items.push({tone:positive?'positive':'warning',icon:positive?ArrowUpRight:ArrowDownRight,title:`Линейный тренд ${formatPercent(Math.abs(forecast.trendPctPerMonth))} в месяц`,text:'Расчёт по завершённым месяцам. Это ориентир, а не гарантия результата.'});
  }
  if(topManagers?.[0])items.push({tone:'neutral',icon:Lightbulb,title:`Диспетчер с наибольшей стоимостью доставок — ${topManagers[0].name}`,text:`${formatMoney(topManagers[0].revenue)} за выбранный период.`});
  if(topProducts?.[0])items.push({tone:'neutral',icon:Lightbulb,title:`Популярный тип груза — ${topProducts[0].name}`,text:`${formatMoney(topProducts[0].revenue)} доставленных грузов за выбранный период.`});

  return <section className={`insights-panel${enabled?' is-enabled':''}`} aria-label="Автоматические аналитические подсказки">
    <div className="insights-panel__intro"><span className="insights-panel__icon"><Sparkles size={18}/></span><div><div className="insights-panel__title">Авто-инсайты</div><p>{enabled?'Короткий разбор показателей текущего среза.':'Дополнительный разбор включается по вашему выбору.'}</p></div></div>
    <button type="button" className={`insights-toggle${enabled?' is-on':''}`} role="switch" aria-checked={enabled} onClick={toggle}><span className="insights-toggle__track"><span/></span><span>{enabled?'Включено':'Включить'}</span></button>
    {enabled&&<div className="insights-list">{items.length?items.slice(0,3).map(({tone,icon:Icon,title,text})=><div key={title} className={`insight insight--${tone}`}><Icon size={16}/><div><strong>{title}</strong><span>{text}</span></div></div>):<div className="insights-empty">Для выбранного периода пока недостаточно данных для подсказок.</div>}</div>}
  </section>;
}
