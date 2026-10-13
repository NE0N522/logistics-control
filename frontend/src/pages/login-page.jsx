import { useState } from 'react';
import { useAuth } from '../context/auth-context.jsx';

export function LoginPage() {
  const { login } = useAuth();
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [error,setError]=useState('');
  const [submitting,setSubmitting]=useState(false);
  async function submit(event){
    event.preventDefault(); setSubmitting(true); setError('');
    try{await login(email,password);}catch(err){setError(err.message);}finally{setSubmitting(false);}
  }
  return <main className="login-screen">
    <div className="login-card">
      <div className="login-brand"><span className="sidebar__brand-mark">Logistics Control</span></div>
      <h1>Вход в Logistics Control</h1>
      <p className="login-subtitle">Управление грузами, рейсами и отчётами команды.</p>
      <form className="stack" onSubmit={submit}>
        <div className="field"><label htmlFor="login-email">Email</label><input id="login-email" className="input" type="email" autoComplete="username" value={email} onChange={(e)=>setEmail(e.target.value)} required /></div>
        <div className="field"><label htmlFor="login-password">Пароль</label><input id="login-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e)=>setPassword(e.target.value)} required /></div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting?'Вход…':'Войти'}</button>
      </form>
      <p className="login-hint">Учётную запись создаёт администратор в разделе «Настройки».</p>
    </div>
  </main>;
}

export function NotFoundPage({ onMenu }) {
  return <><div className="topbar"><div><div className="topbar__title">Страница не найдена</div><div className="topbar__meta">Проверьте адрес или выберите раздел в меню.</div></div>{onMenu && <button className="topbar__menu" onClick={onMenu} aria-label="Открыть меню">☰</button>}</div><div className="content"><div className="panel"><div className="state-block"><strong className="state-block__title">404</strong><span>Такого раздела нет.</span></div></div></div></>;
}
