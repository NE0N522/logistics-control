import { Clock3, History } from 'lucide-react';
import { Modal } from '../ui/modal.jsx';
import { LoadingState, ErrorState, EmptyState } from '../ui/state-blocks.jsx';
import { useAsyncData } from '../../hooks/use-async-data.js';
import { api } from '../../lib/api-client.js';
import { formatDateTime, STAGE_LABELS, SHIPMENT_STATUS_LABELS } from '../../lib/format.js';

function describeChange(item) {
  const changes = [];
  if (item.old_stage !== item.new_stage) changes.push(`${STAGE_LABELS[item.old_stage]||'Начальный этап'} → ${STAGE_LABELS[item.new_stage]||item.new_stage}`);
  if (item.old_amount !== item.new_amount) changes.push('изменена стоимость перевозки');
  if (item.old_manager_id !== item.new_manager_id) changes.push('изменён диспетчер');
  if (item.old_paid_at !== item.new_paid_at) changes.push('обновлена дата доставки');
  return changes.length ? changes.join(' · ') : `Создан груз: ${STAGE_LABELS[item.new_stage]||item.new_stage}`;
}

function describeShipmentChange(item) {
  if (item.event_type === 'status') return `Статус груза: ${SHIPMENT_STATUS_LABELS[item.old_value] || '—'} → ${SHIPMENT_STATUS_LABELS[item.new_value] || item.new_value}`;
  const title = item.event_type === 'dispatcher' ? 'Диспетчер' : 'Водитель';
  return `${title}: ${item.old_value || 'не назначен'} → ${item.new_value || 'не назначен'}`;
}

export function DealHistoryModal({ deal, onClose }) {
  const history = useAsyncData(async () => {
    const [changes, shipmentChanges] = await Promise.all([api.get(`/deals/${deal.id}/history`), api.get(`/deals/${deal.id}/shipment-history`)]);
    return [...changes.map((item) => ({ ...item, kind: 'deal' })), ...shipmentChanges.map((item) => ({ ...item, kind: 'shipment' }))].sort((a, b) => a.changed_at.localeCompare(b.changed_at));
  }, [deal.id], []);
  return <Modal title="История груза" onClose={onClose} width="620px">
    <div className="history-deal"><span className="history-deal__icon"><History size={18}/></span><div><strong>{deal.title}</strong><span>Груз №{deal.id}</span></div></div>
    {history.error?<ErrorState message="Не удалось загрузить историю груза" onRetry={()=>history.reload().catch(()=>undefined)}/>:history.loading?<LoadingState label="Загружаем историю…"/>:history.data.length===0?<EmptyState title="История пока пуста"/>:<ol className="history-list">{history.data.map((item,index)=><li key={`${item.kind}-${item.id||index}`} className="history-item"><span className="history-item__dot"/><div className="history-item__body"><strong>{item.kind === 'shipment' ? describeShipmentChange(item) : describeChange(item)}</strong><span>{item.changed_by_name||item.changed_by_email||'Система'} · {item.kind === 'shipment' ? 'изменение перевозки' : item.source === 'api' ? 'интеграция' : 'учётная запись'}</span><small><Clock3 size={12}/>{formatDateTime(item.changed_at)}</small></div></li>)}</ol>}
  </Modal>;
}
