import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Handshake, Users, Package, FileDown, BellRing, Settings, X, LogOut, Search, ChevronRight, WalletCards } from 'lucide-react';
import { useState } from 'react';

const GROUPS=[
  {label:'ПЕРЕВОЗКИ',links:[
    {to:'/',label:'Обзор',icon:LayoutDashboard,end:true},
    {to:'/deals',label:'Грузы',icon:Handshake},
    {to:'/team',label:'Сотрудники',icon:Users},
    {to:'/products',label:'Типы груза',icon:Package}
  ]},
  {label:'АНАЛИТИКА',links:[
    {to:'/reports',label:'Отчёты по рейсам',icon:FileDown},
    {to:'/alerts',label:'Уведомления',icon:BellRing,badgeKey:'alerts'}
  ]},
  {label:'КОМАНДА',links:[{to:'/payroll',label:'Зарплата',icon:WalletCards}]},
  {label:'СИСТЕМА',links:[{to:'/settings',label:'Настройки',icon:Settings,adminOnly:true}]}
];
export function Sidebar({alertsCount=0,open=false,onClose,user,onLogout,onOpenCommands}){
  const [loggingOut,setLoggingOut]=useState(false);
  async function logout(){setLoggingOut(true);try{await onLogout();}finally{setLoggingOut(false);}}
  return <>
    {open&&<div className="sidebar__scrim" onClick={onClose} aria-hidden="true"/>}
    <aside className={`sidebar${open?' is-open':''}`} aria-label="Основная навигация">
      <div className="sidebar__brand"><span className="sidebar__brand-icon"><span/></span><div><strong>Logistics Control</strong><small>УПРАВЛЕНИЕ ПЕРЕВОЗКАМИ</small></div><button className="icon-btn sidebar__close" onClick={onClose} aria-label="Закрыть меню"><X size={18}/></button></div>
      <button className="sidebar__command" type="button" onClick={onOpenCommands}><Search size={16}/><span>Быстрые команды</span><kbd>⌘ K</kbd></button>
      <nav className="sidebar__nav">
        {GROUPS.map((group)=><div className="sidebar__group" key={group.label}>
          <div className="sidebar__group-label">{group.label}</div>
          {group.links.filter((link)=>!link.adminOnly || user?.role==='admin').map(({to,label,icon:Icon,end,badgeKey})=><NavLink key={to} to={to} end={end} onClick={onClose} className={({isActive})=>`sidebar__link${isActive?' is-active':''}`}>
            <Icon className="sidebar__link-icon" strokeWidth={1.8} aria-hidden="true"/><span className="sidebar__link-label">{label}</span>{badgeKey==='alerts'&&alertsCount>0&&<span className="sidebar__link-badge" aria-label={`${alertsCount} уведомлений`}>{alertsCount}</span>}<ChevronRight className="sidebar__link-chevron" size={14}/>
          </NavLink>)}
        </div>)}
      </nav>
      <div className="sidebar__footer">
        <div className="sidebar__account"><span className="sidebar__avatar">{(user?.name||user?.email||'LC').trim().slice(0,1).toLocaleUpperCase('ru')}</span><div className="sidebar__user"><strong>{user?.name || user?.email}</strong><span>{user?.role==='admin'?'Администратор':'Наблюдатель'}</span></div><button className="sidebar__logout" onClick={logout} disabled={loggingOut} title={loggingOut?'Выход…':'Выйти'} aria-label={loggingOut?'Выход…':'Выйти'}><LogOut size={15}/></button></div>
        <div className="sidebar__version"><span className="sidebar__status-dot"/> Logistics Control · 2.1</div>
      </div>
    </aside>
  </>;
}
