import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Zap, Search, X, History, Copy } from 'lucide-react';
import { useAuth } from '../context/auth-context.jsx';
import { Topbar } from '../components/layout/topbar.jsx';
import { FilterBar } from '../components/layout/filter-bar.jsx';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/state-blocks.jsx';
import { DealFormModal } from '../components/deals/deal-form-modal.jsx';
import { DealHistoryModal } from '../components/deals/deal-history-modal.jsx';
import { useFilters } from '../context/filters-context.jsx';
import { useAsyncData } from '../hooks/use-async-data.js';
import { useReferenceData } from '../hooks/use-reference-data.js';
import { api } from '../lib/api-client.js';
import { formatMoney, formatDate, SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_ORDER } from '../lib/format.js';

export function DealsPage({ onMenu, onDataChanged }) {
  const { filters } = useFilters();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const refs = useReferenceData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [modalDeal, setModalDeal] = useState(undefined);
  const [historyDeal, setHistoryDeal] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => { const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250); return () => window.clearTimeout(timer); }, [searchInput]);
  useEffect(() => setPage(1), [JSON.stringify(filters), status, search]);
  useEffect(() => {
    if (searchParams.get('new') === '1' && isAdmin) {
      setFormError(''); setModalDeal(null); setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, isAdmin]);

  const key = JSON.stringify({ ...filters, status, page, search });
  const loads = useAsyncData(() => api.get('/deals', { ...filters, shipmentStatus: status, page, pageSize: 20, q: search }), [key], { data: [], total: 0, page: 1, totalPages: 1 });

  async function submit(form) {
    setSubmitting(true); setFormError('');
    try {
      const payload = {
        title: form.title, dispatcherId: form.dispatcherId || null, driverId: form.driverId || null,
        productId: form.productId || null, pickupLocation: form.pickupLocation || null,
        deliveryLocation: form.deliveryLocation || null, region: form.deliveryLocation || null,
        shipmentStatus: form.shipmentStatus, amount: Number(form.amount), quantity: Number(form.quantity),
        weightKg: form.weightKg === '' ? null : Number(form.weightKg), vehicle: form.vehicle || null,
        expectedDeliveryAt: form.expectedDeliveryAt || null, paidAt: form.paidAt || null, notes: form.notes
      };
      if (modalDeal?.id) await api.put(`/deals/${modalDeal.id}`, payload);
      else await api.post('/deals', payload);
      setModalDeal(undefined); await loads.reload(); onDataChanged?.();
    } catch (error) { setFormError(error.message); }
    finally { setSubmitting(false); }
  }

  async function remove(load) {
    if (!window.confirm(`Удалить груз «${load.title}»? Он будет скрыт из отчётов, история сохранится.`)) return;
    try { await api.delete(`/deals/${load.id}`); await loads.reload(); onDataChanged?.(); }
    catch (error) { setFormError(error.message); }
  }

  async function changeStatus(load, shipmentStatus) {
    try { await api.patch(`/deals/${load.id}/stage`, { shipmentStatus }); await loads.reload(); onDataChanged?.(); }
    catch (error) { setFormError(error.message); }
  }

  function duplicate(load) {
    setFormError('');
    setModalDeal({ ...load, id: undefined, title: `Копия · ${load.title}`.slice(0, 200), shipment_status: 'new', delivered_at: null, paid_at: null });
  }

  return <>
    <Topbar onMenu={onMenu} title="Грузы" subtitle="Реестр заказов, назначений, маршрутов и доставки" actions={isAdmin ? <button className="btn btn-primary" onClick={() => { setFormError(''); setModalDeal(null); }}><Plus size={15}/> Новый груз</button> : <span className="badge badge--team">Режим наблюдателя</span>} />
    <div className="content">
      <FilterBar/>
      <section className="panel deals-toolbar" aria-label="Поиск и статусы грузов">
        <div className="deals-toolbar__search"><Search size={17} aria-hidden="true"/><input className="input" value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setPage(1); }} placeholder="Номер груза, маршрут, диспетчер, водитель…" aria-label="Поиск по грузам"/>{searchInput && <button className="icon-btn" aria-label="Очистить поиск" onClick={() => { setSearchInput(''); setSearch(''); }}><X size={15}/></button>}</div>
        <div className="stage-filter" role="group" aria-label="Фильтр по статусу"><button className={`stage-filter__item${status === '' ? ' is-active' : ''}`} aria-pressed={status === ''} onClick={() => { setStatus(''); setPage(1); }}>Все статусы</button>{SHIPMENT_STATUS_ORDER.map((item) => <button key={item} className={`stage-filter__item${status === item ? ' is-active' : ''}`} aria-pressed={status === item} onClick={() => { setStatus(item); setPage(1); }}>{SHIPMENT_STATUS_LABELS[item]}</button>)}</div>
      </section>
      <section className="panel deals-panel">
        <div className="panel__header"><div><div className="panel__title">Реестр грузов</div><div className="panel__subtitle">Маршрут, назначенный диспетчер и водитель, тип груза, статус и стоимость перевозки.</div></div>{!loads.loading && !loads.error && <span className="settings-count">{loads.data.total.toLocaleString('ru-RU')} грузов</span>}</div>
        {loads.error && <ErrorState message={formError || 'Не удалось загрузить грузы'} onRetry={() => loads.reload().catch(() => undefined)}/>}
        {loads.loading && !loads.error && <LoadingState/>}
        {!loads.loading && !loads.error && loads.data.data.length === 0 && <EmptyState title={search ? 'Ничего не найдено' : 'Грузов не найдено'} description={search ? 'Измените запрос или очистите поиск.' : isAdmin ? 'Измените фильтры или добавьте первый груз.' : 'В выбранном периоде нет грузов.'}/>}
        {!loads.loading && !loads.error && loads.data.data.length > 0 && <>
          <div className="data-table-wrap"><table className="data-table deals-table logistics-table"><caption className="sr-only">Реестр грузовых перевозок</caption><thead><tr><th>Груз</th><th>Маршрут</th><th>Диспетчер</th><th>Водитель</th><th>Тип груза</th><th>Статус</th><th className="data-table__numeric">Вес, кг</th><th className="data-table__numeric">Стоимость, USD</th><th>Доставка</th><th><span className="sr-only">Действия</span></th></tr></thead><tbody>{loads.data.data.map((load) => <tr key={load.id}>
            <td data-label="Груз"><strong>{load.title}</strong><span className="table-hint">№{load.id} · {formatDate(load.created_at)}</span></td>
            <td data-label="Маршрут"><span className="route-cell">{load.pickup_location || '—'}<span aria-hidden="true"> → </span>{load.delivery_location || load.region || '—'}</span>{load.vehicle && <span className="table-hint">{load.vehicle}</span>}</td>
            <td data-label="Диспетчер">{load.manager_name || load.manager_name_snapshot || 'Не назначен'}</td>
            <td data-label="Водитель">{load.driver_name || load.driver_name_snapshot || 'Не назначен'}</td>
            <td data-label="Тип груза">{load.product_name || load.product_name_snapshot || '—'}</td>
            <td data-label="Статус">{isAdmin ? <select className={`stage-select stage-select--${load.shipment_status}`} aria-label={`Статус груза ${load.title}`} value={load.shipment_status} onChange={(event) => changeStatus(load, event.target.value)}>{SHIPMENT_STATUS_ORDER.map((item) => <option key={item} value={item}>{SHIPMENT_STATUS_LABELS[item]}</option>)}</select> : <span className={`stage-badge stage-badge--${load.shipment_status}`}>{SHIPMENT_STATUS_LABELS[load.shipment_status] || 'Новый'}</span>}</td>
            <td className="data-table__numeric" data-label="Вес, кг">{load.weight_kg ? Number(load.weight_kg).toLocaleString('ru-RU') : '—'}</td>
            <td className="data-table__numeric" data-label="Стоимость, USD"><strong>{formatMoney(load.amount)}</strong></td>
            <td data-label="Доставка">{load.delivered_at ? formatDate(load.delivered_at) : load.expected_delivery_at ? `до ${formatDate(load.expected_delivery_at)}` : '—'}</td>
            <td data-label="Действия"><div className="row deals-actions"><button className="icon-btn" title="История груза" aria-label={`История груза ${load.title}`} onClick={() => setHistoryDeal(load)}><History size={15}/></button>{isAdmin && <><button className="icon-btn" title="Дублировать груз" aria-label={`Дублировать груз ${load.title}`} onClick={() => duplicate(load)}><Copy size={15}/></button><button className="icon-btn" title="Изменить груз" aria-label={`Изменить груз ${load.title}`} onClick={() => { setFormError(''); setModalDeal(load); }}><Pencil size={15}/></button><button className="icon-btn icon-btn--danger" title="Удалить груз" aria-label={`Удалить груз ${load.title}`} onClick={() => remove(load)}><Trash2 size={15}/></button></>}{load.source === 'api' && <span className="deals-source" title="Внесено через интеграцию" aria-label="Внесено через интеграцию"><Zap size={14}/></span>}</div></td>
          </tr>)}</tbody></table></div>
          <div className="deals-pagination"><span>Показаны {((loads.data.page - 1) * loads.data.pageSize) + 1}–{Math.min(loads.data.page * loads.data.pageSize, loads.data.total)} из {loads.data.total.toLocaleString('ru-RU')}</span><div className="row"><button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={15}/> Назад</button><span className="deals-pagination__page">{loads.data.page} / {loads.data.totalPages}</span><button className="btn btn-secondary btn-sm" disabled={page >= loads.data.totalPages} onClick={() => setPage((value) => value + 1)}>Далее <ChevronRight size={15}/></button></div></div>
        </>}
      </section>
    </div>
    {modalDeal !== undefined && isAdmin && <DealFormModal deal={modalDeal} managers={refs.managers} drivers={refs.drivers} products={refs.products} submitting={submitting} errorMessage={formError} onClose={() => { setModalDeal(undefined); setFormError(''); }} onSubmit={submit}/>}
    {historyDeal && <DealHistoryModal deal={historyDeal} onClose={() => setHistoryDeal(null)}/>}
  </>;
}
