import { useMemo, useState } from 'react';
import { Coins, Truck, Users, Package, DollarSign, Wallet } from 'lucide-react';
import { Topbar } from '../components/layout/topbar.jsx';
import { KpiCard } from '../components/ui/kpi-card.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/state-blocks.jsx';
import { useAuth } from '../context/auth-context.jsx';
import { useAsyncData } from '../hooks/use-async-data.js';
import { api } from '../lib/api-client.js';
import { BUSINESS_TIMEZONE, formatDate, formatMoney, formatNumber } from '../lib/format.js';

function todayDate() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function monthStart(date) { return `${date.slice(0, 7)}-01`; }
function subtractDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}
function rangeTitle(from, to) { return `${formatDate(`${from}T12:00:00Z`)} — ${formatDate(`${to}T12:00:00Z`)}`; }

const POSITION_LABEL = { dispatcher: 'Диспетчер', driver: 'Водитель' };

export function PayrollPage({ onMenu }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const today = todayDate();
  const [from, setFrom] = useState(() => monthStart(today));
  const [to, setTo] = useState(today);
  const [selectedEmployee, setSelectedEmployee] = useState('all');
  const report = useAsyncData(() => api.get('/payroll', { from, to }), [from, to]);
  const data = report.data;
  const payments = useMemo(() => {
    if (!data || selectedEmployee === 'all') return data?.payments || [];
    return data.payments.filter((payment) => String(payment.employeeId) === selectedEmployee);
  }, [data, selectedEmployee]);
  const activeEmployee = data?.staff?.find((employee) => String(employee.employeeId) === selectedEmployee);
  const label = rangeTitle(from, to);

  function setStart(value) {
    if (!value) return;
    setFrom(value);
    if (value > to) setTo(value);
  }
  function setEnd(value) {
    if (!value) return;
    setTo(value);
    if (value < from) setFrom(value);
  }
  function selectCurrentMonth() { setFrom(monthStart(today)); setTo(today); }
  function selectLast30Days() { setFrom(subtractDays(today, 29)); setTo(today); }

  return <>
    <Topbar onMenu={onMenu} title="Зарплата" subtitle={isAdmin ? 'Начисления диспетчерам и водителям за выбранный период' : 'Ваши начисления за выбранный период'} />
    <div className="content payroll-page">
      <section className="panel payroll-period-panel">
        <div><div className="panel__title">Период начислений</div><div className="panel__subtitle">{label}</div></div>
        <div className="payroll-period-controls" aria-label="Выбор периода зарплаты">
          <label className="payroll-date-field"><span>С</span><input className="input payroll-date-input" type="date" value={from} max={to} onChange={(event) => setStart(event.target.value)} aria-label="Начало периода"/></label>
          <label className="payroll-date-field"><span>По</span><input className="input payroll-date-input" type="date" value={to} min={from} max={today} onChange={(event) => setEnd(event.target.value)} aria-label="Конец периода"/></label>
          <button className="btn btn-secondary btn-sm" type="button" onClick={selectCurrentMonth}>Этот месяц</button>
          <button className="btn btn-secondary btn-sm" type="button" onClick={selectLast30Days}>30 дней</button>
        </div>
      </section>

      {report.error ? <section className="panel"><ErrorState message="Не удалось загрузить начисления" onRetry={() => report.reload().catch(() => undefined)}/></section> : report.loading && !data ? <section className="panel"><LoadingState label="Рассчитываем начисления…"/></section> : data && <>
        {!data.employeeLinked && <section className="payroll-notice" role="status"><Users size={18}/><span>Эта учётная запись не привязана к профилю диспетчера или водителя. Попросите администратора связать ваш профиль с должностью.</span></section>}

        <div className="kpi-strip payroll-kpis">
          <KpiCard icon={Coins} hero label={isAdmin ? 'Начислено сотрудникам' : 'Ваше начисление'} value={formatMoney(data.summary.totalPayout)} hint={isAdmin ? `${formatNumber(data.staff.length)} диспетчеров и водителей` : label}/>
          <KpiCard icon={Package} label="Доставлено грузов" value={formatNumber(data.summary.deliveredLoads)} hint={label}/>
          <KpiCard icon={DollarSign} label="Стоимость доставок" value={formatMoney(data.summary.deliveredValue,{compact:true})} hint="по фактической дате доставки"/>
          {isAdmin && <KpiCard icon={Wallet} label="Начисления водителям" value={formatMoney(data.summary.driverPayout)} hint={`диспетчерам: ${formatMoney(data.summary.dispatcherPayout)}`}/>}
        </div>

        <section className="payroll-rules panel">
          <span className="payroll-rules__icon"><Coins size={19}/></span>
          <div className="payroll-rules__copy"><strong>Правила начисления</strong><span>Комиссия начисляется после доставки и считается от стоимости заказа.</span></div>
          <div className="payroll-rate"><span>Диспетчер</span><strong>{data.rates.dispatcher}%</strong></div>
          <div className="payroll-rate"><span>Водитель</span><strong>{data.rates.driver}%</strong></div>
        </section>

        {isAdmin && <section className="panel">
          <div className="panel__header"><div><div className="panel__title">Сводка по сотрудникам</div><div className="panel__subtitle">Доставки и начисления за период: {label}.</div></div><span className="settings-count"><Users size={14}/> {formatNumber(data.staff.length)}</span></div>
          {data.staff.length === 0 ? <EmptyState title="Нет диспетчеров и водителей"/> : <div className="data-table-wrap"><table className="data-table payroll-staff-table"><thead><tr><th>Сотрудник</th><th>Должность</th><th className="data-table__numeric data-table__count">Доставлено</th><th className="data-table__numeric">Стоимость грузов</th><th className="data-table__numeric">Начислено</th></tr></thead><tbody>{data.staff.map((employee) => <tr key={employee.employeeId}>
            <td data-label="Сотрудник"><strong>{employee.name}</strong>{!employee.active && <span className="table-hint">Архивный профиль</span>}</td>
            <td data-label="Должность">{POSITION_LABEL[employee.position] || 'Сотрудник'}</td>
            <td className="data-table__numeric data-table__count" data-label="Доставлено">{formatNumber(employee.deliveredLoads)}</td>
            <td className="data-table__numeric" data-label="Стоимость грузов">{formatMoney(employee.deliveredValue)}</td>
            <td className="data-table__numeric payroll-amount" data-label="Начислено">{formatMoney(employee.payout)}</td>
          </tr>)}</tbody></table></div>}
        </section>}

        <section className="panel">
          <div className="panel__header payroll-records-header"><div><div className="panel__title">{isAdmin ? 'Начисления по доставкам' : 'Мои доставки и начисления'}</div><div className="panel__subtitle">Каждая строка показывает сумму в USD и применённую ставку.</div></div>
            {isAdmin && <label className="payroll-employee-filter"><span className="sr-only">Сотрудник</span><select className="select" value={selectedEmployee} onChange={(event) => setSelectedEmployee(event.target.value)}><option value="all">Все сотрудники</option>{data.staff.map((employee) => <option key={employee.employeeId} value={employee.employeeId}>{employee.name} · {POSITION_LABEL[employee.position]}</option>)}</select></label>}
          </div>
          {payments.length === 0 ? <EmptyState title={data.employeeLinked ? 'Начислений за этот период пока нет' : 'Нет данных для расчёта'}/> : <div className="data-table-wrap"><table className="data-table payroll-records-table"><caption className="sr-only">Начисления за доставленные грузы: {label}</caption><thead><tr>{isAdmin && <th>Сотрудник</th>}<th>Дата доставки</th><th>Груз и маршрут</th><th>Должность</th><th className="data-table__numeric">Стоимость заказа, USD</th><th className="data-table__numeric">Ставка</th><th className="data-table__numeric">Начисление, USD</th></tr></thead><tbody>{payments.map((payment) => <tr key={`${payment.employeeId}-${payment.position}-${payment.loadId}`}>
            {isAdmin && <td data-label="Сотрудник"><strong>{payment.employeeName}</strong></td>}
            <td data-label="Дата доставки">{formatDate(payment.deliveredAt)}</td>
            <td data-label="Груз и маршрут"><strong>{payment.title}</strong><span className="table-hint">{payment.route || 'Маршрут не указан'} · №{payment.loadId}</span></td>
            <td data-label="Должность"><span className="payroll-position"><Truck size={13}/>{POSITION_LABEL[payment.position]}</span></td>
            <td className="data-table__numeric" data-label="Стоимость заказа">{formatMoney(payment.amount)}</td>
            <td className="data-table__numeric" data-label="Ставка">{payment.rate}%</td>
            <td className="data-table__numeric payroll-amount" data-label="Начисление">{formatMoney(payment.payout)}</td>
          </tr>)}</tbody></table></div>}
          {isAdmin && activeEmployee && <div className="payroll-selected-total"><span>{activeEmployee.name} за {label}</span><strong>{formatMoney(activeEmployee.payout)}</strong></div>}
        </section>
      </>}
    </div>
  </>;
}
