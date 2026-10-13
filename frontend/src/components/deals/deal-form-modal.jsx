import { useState } from 'react';
import { Modal } from '../ui/modal.jsx';
import { SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_ORDER, toInputDate } from '../../lib/format.js';
import { kgsToUsdInput, usdToKgs } from '../../lib/currency.js';

export function DealFormModal({ deal, managers, drivers = [], products, onClose, onSubmit, submitting, errorMessage }) {
  const isEdit = Boolean(deal?.id);
  const [form, setForm] = useState({
    title: deal?.title || '', dispatcherId: deal?.manager_id || '', driverId: deal?.driver_id || '',
    productId: deal?.product_id || '', pickupLocation: deal?.pickup_location || '', deliveryLocation: deal?.delivery_location || deal?.region || '',
    shipmentStatus: deal?.shipment_status || 'new', amount: deal ? kgsToUsdInput(deal.amount) : '', quantity: deal?.quantity ?? 1,
    weightKg: deal?.weight_kg ?? '', vehicle: deal?.vehicle || '',
    expectedDeliveryAt: deal?.expected_delivery_at ? toInputDate(deal.expected_delivery_at) : '',
    paidAt: deal?.delivered_at || deal?.paid_at ? toInputDate(deal.delivered_at || deal.paid_at) : '', notes: deal?.notes || ''
  });
  const [clientError, setClientError] = useState('');
  function set(key, value) { setForm((current) => ({ ...current, [key]: value })); }

  function handleSubmit(event) {
    event.preventDefault();
    setClientError('');
    if (!form.title.trim()) { setClientError('Укажите номер или название груза'); return; }
    if (!Number.isFinite(Number(form.amount)) || Number(form.amount) < 0) { setClientError('Стоимость перевозки должна быть неотрицательным числом'); return; }
    if (!Number.isInteger(Number(form.quantity)) || Number(form.quantity) < 1) { setClientError('Количество грузовых мест должно быть целым числом не меньше 1'); return; }
    if (form.weightKg !== '' && (!Number.isFinite(Number(form.weightKg)) || Number(form.weightKg) <= 0)) { setClientError('Вес должен быть положительным числом'); return; }
    if (form.shipmentStatus === 'delivered' && !form.paidAt) { setClientError('Укажите фактическую дату доставки'); return; }
    onSubmit({ ...form, amount: usdToKgs(form.amount), region: form.deliveryLocation });
  }

  return <Modal title={isEdit ? 'Изменить груз' : 'Новый груз'} onClose={onClose}>
    <form className="stack" onSubmit={handleSubmit}>
      <div className="field"><label htmlFor="load-title">Номер / название груза</label><input id="load-title" className="input" maxLength={200} value={form.title} onChange={(event) => set('title', event.target.value)} placeholder="Например, Заказ № 6042" required/></div>
      <div className="form-grid">
        <div className="field"><label htmlFor="load-dispatcher">Диспетчер</label><select id="load-dispatcher" className="select" value={form.dispatcherId} onChange={(event) => set('dispatcherId', event.target.value)}><option value="">Не назначен</option>{managers.filter((person) => person.active || String(person.id) === String(form.dispatcherId)).map((person) => <option key={person.id} value={person.id}>{person.name}{!person.active ? ' · архив' : ''}</option>)}</select></div>
        <div className="field"><label htmlFor="load-driver">Водитель</label><select id="load-driver" className="select" value={form.driverId} onChange={(event) => set('driverId', event.target.value)}><option value="">Не назначен</option>{drivers.filter((person) => person.active || String(person.id) === String(form.driverId)).map((person) => <option key={person.id} value={person.id}>{person.name}{!person.active ? ' · архив' : ''}</option>)}</select></div>
      </div>
      <div className="form-grid">
        <div className="field"><label htmlFor="load-cargo">Тип груза</label><select id="load-cargo" className="select" value={form.productId} onChange={(event) => set('productId', event.target.value)}><option value="">Не выбран</option>{products.filter((item) => item.active || String(item.id) === String(form.productId)).map((item) => <option key={item.id} value={item.id}>{item.name}{!item.active ? ' · архив' : ''}</option>)}</select></div>
        <div className="field"><label htmlFor="load-status">Статус перевозки</label><select id="load-status" className="select" value={form.shipmentStatus} onChange={(event) => set('shipmentStatus', event.target.value)}>{SHIPMENT_STATUS_ORDER.map((status) => <option key={status} value={status}>{SHIPMENT_STATUS_LABELS[status]}</option>)}</select></div>
      </div>
      <div className="form-grid">
        <div className="field"><label htmlFor="load-origin">Откуда забрать</label><input id="load-origin" className="input" maxLength={240} value={form.pickupLocation} onChange={(event) => set('pickupLocation', event.target.value)} placeholder="Адрес или город"/></div>
        <div className="field"><label htmlFor="load-destination">Куда доставить</label><input id="load-destination" className="input" maxLength={240} value={form.deliveryLocation} onChange={(event) => set('deliveryLocation', event.target.value)} placeholder="Адрес или город"/></div>
      </div>
      <div className="form-grid">
        <div className="field"><label htmlFor="load-weight">Вес, кг</label><input id="load-weight" type="number" min="0.1" max="100000000" step="0.1" className="input" value={form.weightKg} onChange={(event) => set('weightKg', event.target.value)} placeholder="Например, 1200"/></div>
        <div className="field"><label htmlFor="load-vehicle">Транспорт</label><input id="load-vehicle" className="input" maxLength={120} value={form.vehicle} onChange={(event) => set('vehicle', event.target.value)} placeholder="Номер машины или тип"/></div>
      </div>
      <div className="form-grid">
        <div className="field"><label htmlFor="load-amount">Стоимость перевозки, USD</label><input id="load-amount" type="number" min="0" max="1000000000000" step="0.01" className="input" value={form.amount} onChange={(event) => set('amount', event.target.value)} required/></div>
        <div className="field"><label htmlFor="load-quantity">Грузовых мест</label><input id="load-quantity" type="number" min="1" max="100000" step="1" className="input" value={form.quantity} onChange={(event) => set('quantity', event.target.value)}/></div>
      </div>
      <div className="form-grid">
        <div className="field"><label htmlFor="load-due">Плановая доставка</label><input id="load-due" type="date" className="input" value={form.expectedDeliveryAt} onChange={(event) => set('expectedDeliveryAt', event.target.value)}/></div>
        {form.shipmentStatus === 'delivered' && <div className="field"><label htmlFor="load-delivered">Фактическая доставка</label><input id="load-delivered" type="date" className="input" value={form.paidAt} onChange={(event) => set('paidAt', event.target.value)} required/></div>}
      </div>
      <div className="field"><label htmlFor="load-notes">Примечания к заказу</label><textarea id="load-notes" className="textarea" maxLength={4000} value={form.notes} onChange={(event) => set('notes', event.target.value)} placeholder="Особые условия, документы, контакт получателя"/></div>
      {(clientError || errorMessage) && <div className="form-error" role="alert">{clientError || errorMessage}</div>}
      <div className="modal__footer"><button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button><button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Сохранение…' : isEdit ? 'Сохранить груз' : 'Создать груз'}</button></div>
    </form>
  </Modal>;
}
