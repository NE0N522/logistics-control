import { useState } from 'react';
import { Modal } from '../ui/modal.jsx';
import { kgsToUsdInput, usdToKgs } from '../../lib/currency.js';
export function ProductFormModal({product,onClose,onSubmit,submitting,errorMessage}){
  const isEdit=Boolean(product?.id); const [form,setForm]=useState({name:product?.name||'',category:product?.category||'',price:product?kgsToUsdInput(product.price):'',active:product?.active??1}); const [error,setError]=useState('');
  const set=(k,v)=>setForm(p=>({...p,[k]:v}));
  function submit(e){e.preventDefault();if(!form.name.trim()){setError('Укажите название типа груза');return;}if(!Number.isFinite(Number(form.price))||Number(form.price)<0){setError('Тариф должен быть неотрицательным');return;}setError('');onSubmit({...form,price:usdToKgs(form.price)});}
  return <Modal title={isEdit?'Изменить тип груза':'Новый тип груза'} onClose={onClose}><form className="stack" onSubmit={submit}>
    <div className="field"><label htmlFor="product-name">Название типа груза</label><input id="product-name" maxLength={160} className="input" value={form.name} onChange={e=>set('name',e.target.value)} required/></div>
    <div className="form-grid"><div className="field"><label htmlFor="product-category">Условия перевозки</label><input id="product-category" maxLength={120} className="input" value={form.category} onChange={e=>set('category',e.target.value)} placeholder="Например, с температурным режимом"/></div><div className="field"><label htmlFor="product-price">Базовый тариф, USD</label><input id="product-price" type="number" min="0" max="1000000000000" step="0.01" className="input" value={form.price} onChange={e=>set('price',e.target.value)} required/></div></div>
    {isEdit&&<label className="checkbox-row"><input type="checkbox" checked={Boolean(form.active)} onChange={e=>set('active',e.target.checked)}/> Активен для новых перевозок</label>}
    {(error||errorMessage)&&<div className="form-error" role="alert">{error||errorMessage}</div>}
    <div className="modal__footer"><button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button><button type="submit" className="btn btn-primary" disabled={submitting}>{submitting?'Сохранение…':isEdit?'Сохранить':'Добавить'}</button></div>
  </form></Modal>;
}
