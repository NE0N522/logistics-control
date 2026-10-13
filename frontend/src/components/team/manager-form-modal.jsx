import { useState } from 'react';
import { Modal } from '../ui/modal.jsx';
export function ManagerFormModal({manager,onClose,onSubmit,submitting,errorMessage}){
  const isEdit=Boolean(manager?.id); const [form,setForm]=useState({name:manager?.name||'',email:manager?.email||'',region:manager?.region||'',position:manager?.position||'dispatcher',active:manager?.active??1}); const [error,setError]=useState('');
  const set=(k,v)=>setForm(p=>({...p,[k]:v}));
  function submit(e){e.preventDefault();if(!form.name.trim()){setError('Укажите имя сотрудника');return;}setError('');onSubmit(form);}
  return <Modal title={isEdit?'Изменить профиль сотрудника':'Новый сотрудник'} onClose={onClose}><form className="stack" onSubmit={submit}>
    <div className="field"><label htmlFor="manager-name">Имя</label><input id="manager-name" className="input" maxLength={160} value={form.name} onChange={e=>set('name',e.target.value)} required/></div>
    <div className="form-grid"><div className="field"><label htmlFor="manager-email">Email</label><input id="manager-email" type="email" maxLength={254} className="input" value={form.email} onChange={e=>set('email',e.target.value)}/></div><div className="field"><label htmlFor="manager-region">Регион</label><input id="manager-region" maxLength={120} className="input" value={form.region} onChange={e=>set('region',e.target.value)}/></div></div>
    <div className="field"><label htmlFor="manager-position">Должность</label><select id="manager-position" className="select" value={form.position} onChange={e=>set('position',e.target.value)}><option value="dispatcher">Диспетчер</option><option value="driver">Водитель</option><option value="staff">Другой сотрудник</option></select></div>
    {isEdit&&<label className="checkbox-row"><input type="checkbox" checked={Boolean(form.active)} onChange={e=>set('active',e.target.checked)}/> Активен для назначения на грузы</label>}
    {(error||errorMessage)&&<div className="form-error" role="alert">{error||errorMessage}</div>}
    <div className="modal__footer"><button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button><button type="submit" className="btn btn-primary" disabled={submitting}>{submitting?'Сохранение…':isEdit?'Сохранить':'Добавить'}</button></div>
  </form></Modal>;
}
