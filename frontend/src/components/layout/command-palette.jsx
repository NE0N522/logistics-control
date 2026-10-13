import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, Handshake, LayoutDashboard, Search, Users, Package, BellRing, Settings2, ArrowRight, WalletCards } from 'lucide-react';
import { Modal } from '../ui/modal.jsx';

const COMMANDS = [
  { label: 'Открыть дашборд', detail: 'Обзор показателей и прогноз', path: '/', icon: LayoutDashboard },
  { label: 'Новый груз', detail: 'Создать запись о перевозке', path: '/deals?new=1', icon: Handshake, adminOnly: true },
  { label: 'Реестр грузов', detail: 'Маршруты, назначения и статусы', path: '/deals', icon: Handshake },
  { label: 'Сотрудники', detail: 'Диспетчеры и водители', path: '/team', icon: Users },
  { label: 'Типы груза', detail: 'Категории и тарифы', path: '/products', icon: Package },
  { label: 'Отчёты по рейсам', detail: 'Диспетчеры, водители, Excel и PDF', path: '/reports', icon: FileSpreadsheet },
  { label: 'Зарплата', detail: 'Начисления за доставленные грузы', path: '/payroll', icon: WalletCards },
  { label: 'Уведомления', detail: 'План перевозок и отклонения', path: '/alerts', icon: BellRing },
  { label: 'Настройки', detail: 'Сотрудники, доступ и внешний вид', path: '/settings', icon: Settings2, adminOnly: true },
];

export function CommandPalette({ onClose, user }) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru');
    return COMMANDS.filter((item) => (!item.adminOnly||user?.role==='admin') && (!normalized || `${item.label} ${item.detail}`.toLocaleLowerCase('ru').includes(normalized)));
  }, [query,user]);

  function open(path) {
    navigate(path);
    onClose();
  }

  return <Modal title="Быстрые команды" onClose={onClose} width="620px">
    <div className="command-search"><Search size={17} aria-hidden="true"/><input autoFocus className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти раздел или действие…" aria-label="Найти команду"/></div>
    <div className="command-list" role="listbox" aria-label="Команды">
      {filtered.map(({ label, detail, path, icon: Icon }) => <button key={path} className="command-item" type="button" onClick={() => open(path)}>
        <span className="command-item__icon"><Icon size={17}/></span><span className="command-item__copy"><strong>{label}</strong><small>{detail}</small></span><ArrowRight className="command-item__arrow" size={15}/>
      </button>)}
      {filtered.length===0&&<div className="command-empty">Ничего не найдено. Попробуйте другое слово.</div>}
    </div>
    <div className="command-hint"><span><kbd>↑</kbd><kbd>↓</kbd> навигация по меню</span><span><kbd>Esc</kbd> закрыть</span></div>
  </Modal>;
}
