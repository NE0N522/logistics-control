import { Topbar } from '../components/layout/topbar.jsx';
import { DollarSign, Package, Truck, Percent } from 'lucide-react';
import { FilterBar } from '../components/layout/filter-bar.jsx';
import { KpiCard } from '../components/ui/kpi-card.jsx';
import { RevenueChart } from '../components/charts/revenue-chart.jsx';
import { ForecastChart } from '../components/charts/forecast-chart.jsx';
import { Funnel } from '../components/ui/funnel.jsx';
import { RankedBarList } from '../components/ui/ranked-bar-list.jsx';
import { AutoInsights } from '../components/dashboard/auto-insights.jsx';
import { LoadingState, ErrorState } from '../components/ui/state-blocks.jsx';
import { useFilters } from '../context/filters-context.jsx';
import { useAsyncData } from '../hooks/use-async-data.js';
import { api } from '../lib/api-client.js';
import { formatMoney, formatNumber, formatPercent } from '../lib/format.js';

export function OverviewPage({onMenu,onDataChanged}){
  const {filters}=useFilters(); const key=JSON.stringify(filters);
  const summary=useAsyncData(()=>api.get('/dashboard/summary',filters),[key]);
  const revenue=useAsyncData(()=>api.get('/dashboard/revenue-by-month',filters),[key],[]);
  const funnel=useAsyncData(()=>api.get('/dashboard/funnel',filters),[key],{stages:[],pipelineAmount:0});
  const topManagers=useAsyncData(()=>api.get('/dashboard/top-managers',{...filters,limit:5}),[key],[]);
  const topProducts=useAsyncData(()=>api.get('/dashboard/top-products',{...filters,limit:5}),[key],[]);
  const forecast=useAsyncData(()=>api.get('/forecast',{...filters,historyMonths:9,forecastMonths:3}),[key]);
  return <>
    <Topbar onMenu={onMenu} title="Обзор перевозок" subtitle="Стоимость доставок и состояние грузов за выбранный период"/>
    <div className="content"><FilterBar/>
      <div className="kpi-strip">
        {summary.loading&&!summary.data?<LoadingState label="Загрузка KPI…"/>:summary.error&&!summary.data?<ErrorState message="Не удалось загрузить KPI" onRetry={()=>summary.reload().catch(()=>undefined)}/>:<>
          <KpiCard icon={DollarSign} hero label="Стоимость доставленных грузов" value={formatMoney(summary.data.revenue)} delta={summary.data.revenueChangePct} hint="По фактической дате доставки"/>
          <KpiCard icon={Package} label="Зарегистрировано грузов" value={formatNumber(summary.data.totalDeals)} hint={`${summary.data.lostDeals} требуют внимания или отменены`}/>
          <KpiCard icon={Truck} label="Средняя стоимость доставки" value={formatMoney(summary.data.avgCheck,{compact:true})} hint={`${summary.data.paidDeals} доставлено`}/>
          <KpiCard icon={Percent} label="Доля доставленных грузов" value={formatPercent(summary.data.conversionRate)} hint={`${summary.data.wonDeals} доставлено из зарегистрированных`}/>
        </>}
      </div>
      <AutoInsights summary={summary.data} forecast={forecast.data} topManagers={topManagers.data} topProducts={topProducts.data}/>
      <div className="two-col-grid">
        <div className="panel"><div className="panel__header"><div><div className="panel__title">Стоимость доставок по месяцам</div><div className="panel__subtitle">По фактической дате доставки, часовой пояс {summary.data?.definitions?.timezone || 'приложения'}</div></div></div>{revenue.loading?<LoadingState/>:revenue.error?<ErrorState onRetry={()=>revenue.reload().catch(()=>undefined)}/>:<figure aria-label="График стоимости доставленных грузов" className="chart-figure"><RevenueChart data={revenue.data}/><figcaption>Сумма тарифов по грузам, доставленным в каждом календарном месяце.</figcaption></figure>}</div>
        <div className="panel"><div className="panel__header"><div><div className="panel__title">Текущие статусы грузов</div><div className="panel__subtitle">Состояние грузов, зарегистрированных в выбранном периоде</div></div></div>{funnel.loading?<LoadingState/>:funnel.error?<ErrorState onRetry={()=>funnel.reload().catch(()=>undefined)}/>:<figure aria-label="Распределение грузов по статусам" className="chart-figure"><Funnel stages={funnel.data.stages}/><figcaption>Стоимость незавершённых перевозок: {formatMoney(funnel.data.pipelineAmount)}.</figcaption></figure>}</div>
      </div>
      <div className="two-col-grid">
        <div className="panel"><div className="panel__header"><div><div className="panel__title">Прогноз стоимости доставок</div><div className="panel__subtitle">По завершённым месяцам и выбранному срезу</div></div></div>{forecast.loading?<LoadingState/>:forecast.error?<ErrorState onRetry={()=>forecast.reload().catch(()=>undefined)}/>:<><figure aria-label="График прогноза стоимости доставок" className="chart-figure"><ForecastChart history={forecast.data.history} forecast={forecast.data.forecast}/><figcaption>Окно истории: {forecast.data.model.historyMonths} мес. Линейная модель без сезонности.</figcaption></figure></>}</div>
        <div className="stack">
          <div className="panel"><div className="panel__header"><div className="panel__title">Диспетчеры по стоимости доставок</div></div>{topManagers.loading?<LoadingState/>:topManagers.error?<ErrorState onRetry={()=>topManagers.reload().catch(()=>undefined)}/>:<figure aria-label="Диспетчеры по стоимости доставленных грузов"><RankedBarList items={topManagers.data}/><figcaption>Учитываются грузы, доставленные в выбранном периоде.</figcaption></figure>}</div>
          <div className="panel"><div className="panel__header"><div className="panel__title">Типы груза по стоимости доставок</div></div>{topProducts.loading?<LoadingState/>:topProducts.error?<ErrorState onRetry={()=>topProducts.reload().catch(()=>undefined)}/>:<figure aria-label="Типы груза по стоимости доставок"><RankedBarList items={topProducts.data}/><figcaption>Суммарная стоимость доставленных грузов по категориям.</figcaption></figure>}</div>
        </div>
      </div>
    </div>
  </>;
}
