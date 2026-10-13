import { useEffect, useState } from 'react';
import { FileSpreadsheet, FileText, ChevronLeft, ChevronRight, Package, CheckCircle2, Truck, CircleAlert } from 'lucide-react';
import { Topbar } from '../components/layout/topbar.jsx';
import { FilterBar } from '../components/layout/filter-bar.jsx';
import { KpiCard } from '../components/ui/kpi-card.jsx';
import { LoadingState, ErrorState, EmptyState } from '../components/ui/state-blocks.jsx';
import { useFilters } from '../context/filters-context.jsx';
import { useAsyncData } from '../hooks/use-async-data.js';
import { api } from '../lib/api-client.js';
import { formatDate, formatMoney, formatNumber, SHIPMENT_STATUS_LABELS } from '../lib/format.js';

function StaffSummary({ title, rows, type }) {
  return <section className="panel"><div className="panel__header"><div><div className="panel__title">{title}</div><div className="panel__subtitle">Назначено, доставлено и грузы с проблемами</div></div></div>{rows?.length ? <div className="data-table-wrap"><table className="data-table staff-summary-table"><thead><tr><th>Сотрудник</th><th className="data-table__numeric data-table__count">Назначено</th><th className="data-table__numeric data-table__count">Доставлено</th><th className="data-table__numeric data-table__count">Проблемы</th></tr></thead><tbody>{rows.map((row) => <tr key={`${type}-${row.name}`}><td data-label="Сотрудник"><strong>{row.name}</strong></td><td className="data-table__numeric data-table__count" data-label="Назначено">{formatNumber(row.loads)}</td><td className="data-table__numeric data-table__count" data-label="Доставлено">{formatNumber(row.delivered)}</td><td className="data-table__numeric data-table__count" data-label="Проблемы">{formatNumber(row.problems)}</td></tr>)}</tbody></table></div> : <EmptyState title="Нет данных за выбранный период"/>}</section>;
}

export function ReportsPage({ onMenu }) {
  const { filters } = useFilters();
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [JSON.stringify(filters)]);
  const key = JSON.stringify({ ...filters, page });
  const report = useAsyncData(() => api.get('/logistics/report', { ...filters, page, pageSize: 20 }), [key]);
  const period = `${filters.from || '—'} — ${filters.to || '—'}`;
  const data = report.data;

  return <>
    <Topbar onMenu={onMenu} title="Отчёты по рейсам" subtitle="Назначения диспетчеров, результаты водителей и история доставки"/>
    <div className="content"><FilterBar/>
      <div className="panel report-export"><div><div className="panel__title">Экспорт отчёта</div><div className="panel__subtitle">Период: {period}. В файле есть маршрут, диспетчер, водитель, статус, вес, стоимость и даты назначения.</div></div><div className="row"><a className="btn btn-primary" href={api.downloadUrl('/export/excel', filters)} download><FileSpreadsheet size={15}/> Скачать Excel</a><a className="btn btn-secondary" href={api.downloadUrl('/export/pdf', filters)} download><FileText size={15}/> Скачать PDF</a></div></div>
      {report.error ? <div className="panel"><ErrorState message="Не удалось загрузить отчёт по перевозкам" onRetry={() => report.reload().catch(() => undefined)}/></div> : report.loading && !data ? <div className="panel"><LoadingState/></div> : data && <>
        <div className="kpi-strip logistics-report-kpis"><KpiCard icon={Package} hero label="Грузов за период" value={formatNumber(data.summary.totalLoads)} hint="Все статусы перевозки"/><KpiCard icon={CheckCircle2} label="Доставлено" value={formatNumber(data.summary.deliveredLoads)} hint="Подтверждённая доставка"/><KpiCard icon={Truck} label="В пути" value={formatNumber(data.summary.inTransitLoads)} hint="Назначены и перевозятся"/><KpiCard icon={CircleAlert} label="Проблемы / отмены" value={formatNumber(data.summary.problemLoads)} hint="Нужны внимание или разбор"/></div>
        <div className="report-value panel"><span>Стоимость доставленных грузов</span><strong>{formatMoney(data.summary.deliveredValue)}</strong></div>
        <div className="two-col-grid"><StaffSummary title="Работа диспетчеров" rows={data.byDispatcher} type="dispatcher"/><StaffSummary title="Работа водителей" rows={data.byDriver} type="driver"/></div>
        <section className="panel">
          <div className="panel__header"><div><div className="panel__title">Реестр доставок и назначений</div><div className="panel__subtitle">Для каждого груза показаны диспетчер, который принял заказ, и водитель доставки.</div></div><span className="settings-count">{formatNumber(data.total)} грузов</span></div>
          {data.data.length === 0 ? <EmptyState title="В выбранном периоде нет грузов"/> : <div className="data-table-wrap"><table className="data-table logistics-report-table"><caption className="sr-only">Отчёт по диспетчерам, водителям и доставкам</caption><thead><tr><th>Груз</th><th>Маршрут</th><th>Диспетчер</th><th>Водитель</th><th>Статус</th><th className="data-table__numeric">Вес, кг</th><th className="data-table__numeric">Стоимость, USD</th><th>Назначен</th><th>Доставка</th></tr></thead><tbody>{data.data.map((load) => <tr key={load.id}>
            <td data-label="Груз"><strong>{load.title}</strong><span className="table-hint">{load.cargo_type} · №{load.id}</span></td>
            <td data-label="Маршрут"><span className="route-cell">{load.pickup_location || '—'} → {load.delivery_location || '—'}</span></td>
            <td data-label="Диспетчер">{load.dispatcher_name}<span className="table-hint">{load.dispatcher_assigned_at ? formatDate(load.dispatcher_assigned_at) : 'Не назначен'}</span></td>
            <td data-label="Водитель">{load.driver_name}<span className="table-hint">{load.driver_assigned_at ? formatDate(load.driver_assigned_at) : 'Не назначен'}</span></td>
            <td data-label="Статус"><span className={`stage-badge stage-badge--${load.shipment_status}`}>{SHIPMENT_STATUS_LABELS[load.shipment_status] || load.shipment_status}</span></td>
            <td className="data-table__numeric" data-label="Вес, кг">{load.weight_kg ? Number(load.weight_kg).toLocaleString('ru-RU') : '—'}</td>
            <td className="data-table__numeric" data-label="Стоимость, USD">{formatMoney(load.amount)}</td>
            <td data-label="Назначен">{formatDate(load.created_at)}</td><td data-label="Доставка">{load.delivered_at ? formatDate(load.delivered_at) : load.expected_delivery_at ? `до ${formatDate(load.expected_delivery_at)}` : '—'}</td>
          </tr>)}</tbody></table></div>}
          {data.totalPages > 1 && <div className="deals-pagination"><span>Страница {data.page} из {data.totalPages}</span><div className="row"><button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={15}/> Назад</button><span className="deals-pagination__page">{data.page} / {data.totalPages}</span><button className="btn btn-secondary btn-sm" disabled={page >= data.totalPages} onClick={() => setPage((value) => value + 1)}>Далее <ChevronRight size={15}/></button></div></div>}
        </section>
      </>}
    </div>
  </>;
}
