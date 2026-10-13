import { useEffect, useMemo, useState } from 'react';
import { Calculator, KeyRound, LockKeyhole, Palette, Pencil, Plus, Search, ShieldCheck, TableProperties, Trash2, UserCheck, UserRoundPlus, UserX, Users, X, Save } from 'lucide-react';
import { Topbar } from '../components/layout/topbar.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/state-blocks.jsx';
import { Modal } from '../components/ui/modal.jsx';
import { ManagerFormModal } from '../components/team/manager-form-modal.jsx';
import { useAsyncData } from '../hooks/use-async-data.js';
import { useAuth } from '../context/auth-context.jsx';
import { usePreferences } from '../context/preferences-context.jsx';
import { useSystemSettings } from '../context/system-settings-context.jsx';
import { api } from '../lib/api-client.js';

const EMPTY_FORM = { managerId: '', name: '', email: '', role: 'user', position: 'dispatcher', region: '' };
const ROLE_LABEL = { admin: 'Администратор', user: 'Наблюдатель' };
const POSITION_LABEL = { dispatcher: 'Диспетчер', driver: 'Водитель', staff: 'Сотрудник' };

function describePosition(employee) {
  return POSITION_LABEL[employee.manager_position] || 'Сотрудник';
}

export function SettingsPage({ onMenu }) {
  const { user } = useAuth();
  const { preferences, updatePreferences } = usePreferences();
  const { settings, saveSettings, loading: settingsLoading } = useSystemSettings();
  const users = useAsyncData(() => api.get('/users'), [], []);
  const [activeTab, setActiveTab] = useState('accounts');
  const [query, setQuery] = useState('');
  const [userForm, setUserForm] = useState(EMPTY_FORM);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [profileTarget, setProfileTarget] = useState(null);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [credential, setCredential] = useState(null);
  const [copyLabel, setCopyLabel] = useState('Скопировать пароль');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [financeForm, setFinanceForm] = useState({ exchangeRateKgsPerUsd: '87.45', dispatcher: '1.5', driver: '10' });
  const [financeBusy, setFinanceBusy] = useState(false);
  const [financeSaved, setFinanceSaved] = useState(false);

  useEffect(() => {
    setFinanceForm({ exchangeRateKgsPerUsd: String(settings.exchangeRateKgsPerUsd), dispatcher: String(settings.rates.dispatcher), driver: String(settings.rates.driver) });
  }, [settings]);

  const filteredEmployees = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru');
    if (!normalized) return users.data;
    return users.data.filter((employee) => [employee.name, employee.email, employee.manager_region, employee.manager_position]
      .some((value) => String(value || '').toLocaleLowerCase('ru').includes(normalized)));
  }, [users.data, query]);
  const accountCount = users.data.filter((employee) => employee.has_account).length;
  const profileCount = users.data.filter((employee) => employee.has_manager).length;

  function openAdd(employee = null) {
    setError('');
    setUserForm(employee ? {
      ...EMPTY_FORM,
      managerId: employee.employee_id ? String(employee.employee_id) : '',
      name: employee.name || '',
      email: employee.email || '',
      position: employee.manager_position || 'staff',
      region: employee.manager_region || '',
    } : EMPTY_FORM);
    setAddOpen(true);
  }

  async function createUser(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.post('/users', { ...userForm, managerId: userForm.managerId || undefined });
      setAddOpen(false);
      setCredential({ name: result.name, email: result.email, password: result.temporaryPassword });
      await users.reload().catch(() => undefined);
    } catch (requestError) {
      setError(requestError.message || 'Не удалось добавить сотрудника. Проверьте email.');
    } finally {
      setBusy(false);
    }
  }

  function openEdit(employee) {
    setError('');
    setEditTarget(employee);
    setEditForm({
      name: employee.name || '',
      email: employee.email || '',
      role: employee.role || 'user',
      position: employee.manager_position || 'staff',
      region: employee.manager_region || '',
      active: Boolean(employee.active),
    });
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editTarget || !editForm) return;
    setBusy(true);
    setError('');
    try {
      await api.patch(`/users/${editTarget.id}`, editForm);
      setEditTarget(null);
      setEditForm(null);
      await users.reload();
    } catch (requestError) {
      setError(requestError.message || 'Не удалось сохранить изменения.');
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(form) {
    if (!profileTarget?.id) return;
    setProfileSubmitting(true);
    setError('');
    try {
      await api.put(`/managers/${profileTarget.id}`, form);
      setProfileTarget(null);
      await users.reload();
    } catch (requestError) {
      setError(requestError.message || 'Не удалось изменить профиль сотрудника.');
    } finally {
      setProfileSubmitting(false);
    }
  }

  async function toggleUser(employee) {
    if (!employee.has_account || employee.id === user.id) return;
    setError('');
    try {
      await api.patch(`/users/${employee.id}/status`, { active: !employee.active });
      await users.reload();
    } catch (requestError) { setError(requestError.message); }
  }

  async function resetPassword(employee) {
    if (!employee.has_account || employee.id === user.id) return;
    if (!window.confirm(`Сбросить пароль для ${employee.name}? Все его активные сеансы завершатся.`)) return;
    setError('');
    try {
      const result = await api.post(`/users/${employee.id}/reset-password`, {});
      setCredential({ name: employee.name, email: employee.email, password: result.temporaryPassword });
    } catch (requestError) { setError(requestError.message); }
  }

  async function deleteAccount(employee) {
    if (!employee.has_account || employee.id === user.id) return;
    if (!window.confirm(`Удалить доступ для ${employee.name}? История грузов и профиль сотрудника сохранятся, аккаунт можно будет создать снова.`)) return;
    setError('');
    try {
      await api.delete(`/users/${employee.id}`);
      await users.reload();
    } catch (requestError) { setError(requestError.message); }
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(credential.password);
      setCopyLabel('Пароль скопирован');
    } catch {
      setCopyLabel('Выделите пароль и скопируйте');
    }
  }

  async function saveFinanceSettings(event) {
    event.preventDefault();
    const exchangeRateKgsPerUsd = Number(financeForm.exchangeRateKgsPerUsd);
    const dispatcher = Number(financeForm.dispatcher);
    const driver = Number(financeForm.driver);
    if (!Number.isFinite(exchangeRateKgsPerUsd) || exchangeRateKgsPerUsd < 1 || exchangeRateKgsPerUsd > 100000 || !Number.isFinite(dispatcher) || dispatcher < 0 || dispatcher > 100 || !Number.isFinite(driver) || driver < 0 || driver > 100) {
      setError('Проверьте курс и ставки: курс от 1 до 100 000, ставка от 0 до 100%.');
      return;
    }
    setFinanceBusy(true); setError(''); setFinanceSaved(false);
    try {
      await saveSettings({ exchangeRateKgsPerUsd, rates: { dispatcher, driver } });
      setFinanceSaved(true);
    } catch (requestError) { setError(requestError.message || 'Не удалось сохранить настройки расчётов.'); }
    finally { setFinanceBusy(false); }
  }

  return <>
    <Topbar onMenu={onMenu} title="Настройки" subtitle="Учётные записи сотрудников и оформление системы" actions={<span className="settings-role-chip"><ShieldCheck size={14}/> Администратор</span>} />
    <div className="content settings-page">
      {error && <div className="form-error" role="alert">{error}<button className="icon-btn" type="button" aria-label="Скрыть сообщение" onClick={() => setError('')}><X size={15}/></button></div>}

      <section className="settings-hero">
        <div className="settings-hero__icon"><ShieldCheck size={21}/></div>
        <div className="settings-hero__copy"><strong>Панель администратора</strong><span>Администраторы управляют грузами и доступами. У остальных сотрудников режим наблюдателя без изменения данных.</span></div>
        <div className="settings-hero__stats"><span><strong>{accountCount}</strong> аккаунтов</span><span><strong>{profileCount}</strong> профилей</span></div>
      </section>

      <nav className="settings-tabs" aria-label="Разделы настроек">
        <button className={`settings-tab${activeTab === 'accounts' ? ' is-active' : ''}`} type="button" aria-pressed={activeTab === 'accounts'} onClick={() => setActiveTab('accounts')}><Users size={16}/> Учётные записи <span>{users.data.length}</span></button>
        <button className={`settings-tab${activeTab === 'appearance' ? ' is-active' : ''}`} type="button" aria-pressed={activeTab === 'appearance'} onClick={() => setActiveTab('appearance')}><Palette size={16}/> Внешний вид</button>
        <button className={`settings-tab${activeTab === 'calculations' ? ' is-active' : ''}`} type="button" aria-pressed={activeTab === 'calculations'} onClick={() => setActiveTab('calculations')}><Calculator size={16}/> Расчёты</button>
      </nav>

      {activeTab === 'accounts' ? <section className="panel settings-card settings-accounts">
        <div className="panel__header settings-accounts__header">
          <div><div className="panel__title"><Users size={16}/> Сотрудники и доступ</div><div className="panel__subtitle">Список включает сотрудников из базы даже без аккаунта для входа.</div></div>
          <button className="btn btn-primary" type="button" onClick={() => openAdd()}><Plus size={15}/> Добавить сотрудника</button>
        </div>
        <div className="settings-account-toolbar">
          <label className="settings-search"><Search size={16}/><input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти сотрудника, email или регион" aria-label="Поиск сотрудников"/><span>{filteredEmployees.length}</span></label>
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => users.reload().catch(() => undefined)} disabled={users.loading}><Users size={14}/> Обновить список</button>
        </div>
        {users.loading ? <LoadingState/> : users.error ? <ErrorState message="Не удалось загрузить сотрудников" onRetry={() => users.reload().catch(() => undefined)}/> : filteredEmployees.length === 0 ? <EmptyState title={query ? 'Совпадений нет' : 'Сотрудников пока нет'}/> : <div className="data-table-wrap settings-table-wrap"><table className="data-table settings-table">
          <thead><tr><th>Сотрудник</th><th>Должность</th><th>Учётная запись</th><th>Доступ</th><th><span className="sr-only">Действия</span></th></tr></thead>
          <tbody>{filteredEmployees.map((employee) => {
            const isSelf = employee.id === user.id;
            return <tr key={`${employee.has_account ? 'account' : 'profile'}-${employee.employee_id || employee.id}`}>
              <td data-label="Сотрудник"><strong>{employee.name || 'Без имени'}</strong>{employee.manager_region && <span className="table-hint">{employee.manager_region}</span>}{isSelf && <span className="table-hint">Ваша учётная запись</span>}</td>
              <td data-label="Должность">{describePosition(employee)}</td>
              <td data-label="Учётная запись">{employee.has_account ? <><span className="settings-account-email">{employee.email}</span><span className={`settings-role-badge${employee.role === 'admin' ? ' is-admin' : ''}`}>{ROLE_LABEL[employee.role] || 'Наблюдатель'}</span></> : <span className="settings-no-account">Нет аккаунта для входа</span>}</td>
              <td data-label="Доступ">{employee.has_account ? <span className={`status-dot${employee.active ? ' status-dot--active' : ''}`}>{employee.active ? 'Включён' : 'Отключён'}</span> : <span className="status-dot">Не создан</span>}</td>
              <td data-label="Действия"><div className="settings-row-actions">
                {employee.has_account ? <>
                  <button className="icon-btn" type="button" title="Изменить данные" aria-label={`Изменить данные ${employee.name}`} onClick={() => openEdit(employee)}><Pencil size={15}/></button>
                  <button className="icon-btn" type="button" title="Сбросить пароль" aria-label={`Сбросить пароль ${employee.name}`} disabled={isSelf} onClick={() => resetPassword(employee)}><KeyRound size={15}/></button>
                  <button className="icon-btn" type="button" title={employee.active ? 'Отключить доступ' : 'Включить доступ'} aria-label={employee.active ? `Отключить доступ ${employee.name}` : `Включить доступ ${employee.name}`} disabled={isSelf} onClick={() => toggleUser(employee)}>{employee.active ? <UserX size={15}/> : <UserCheck size={15}/>}</button>
                  <button className="icon-btn icon-btn--danger" type="button" title="Удалить доступ" aria-label={`Удалить доступ ${employee.name}`} disabled={isSelf} onClick={() => deleteAccount(employee)}><Trash2 size={15}/></button>
                </> : <><button className="btn btn-secondary btn-sm" type="button" onClick={() => openAdd(employee)}><UserRoundPlus size={14}/> Создать доступ</button>{employee.employee_id && <button className="icon-btn" type="button" title="Изменить профиль сотрудника" aria-label={`Изменить профиль ${employee.name}`} onClick={() => { setError(''); setProfileTarget({ id: employee.employee_id, name: employee.name, email: employee.email || '', region: employee.manager_region || '', position: employee.manager_position || 'staff', active: employee.manager_active }); }}><Pencil size={15}/></button>}</>}
              </div></td>
            </tr>;
          })}</tbody>
        </table></div>}
        <div className="settings-account-note"><LockKeyhole size={14}/><span>Пароли не хранятся в открытом виде. Для забытого пароля задайте новый: временный пароль будет показан один раз.</span></div>
      </section> : activeTab === 'appearance' ? <section className="panel settings-card settings-appearance">
        <div className="panel__header"><div><div className="panel__title"><Palette size={16}/> Оформление интерфейса</div><div className="panel__subtitle">Настройки сохраняются в этом браузере и применяются ко всем разделам.</div></div></div>
        <div className="settings-preferences">
          <label className="field"><span>Цветовая тема</span><select className="select" value={preferences.theme} onChange={(event) => updatePreferences({ theme: event.target.value })}>
            <option value="system">Как на устройстве</option><option value="light">Светлая</option><option value="dark">Тёмная</option>
          </select><small className="field-hint">В системном режиме тема автоматически меняется вместе с устройством.</small></label>
          <label className="settings-switch"><input type="checkbox" checked={preferences.compactTables} onChange={(event) => updatePreferences({ compactTables: event.target.checked })}/><span><strong><TableProperties size={15}/> Компактные таблицы</strong><small>Уменьшить высоту строк, чтобы видеть больше грузов на экране.</small></span></label>
        </div>
        <div className="settings-appearance-tip"><ShieldCheck size={17}/><span><strong>Доступ сотрудников</strong> задаётся во вкладке «Учётные записи». Наблюдатель может просматривать перевозки и отчёты, а изменение данных доступно только администраторам.</span></div>
      </section> : <section className="panel settings-card settings-finance">
        <div className="panel__header"><div><div className="panel__title"><Calculator size={16}/> Валюта и начисления</div><div className="panel__subtitle">Единые правила отображения стоимости перевозок, тарифов и зарплаты.</div></div></div>
        <form className="settings-finance-form" onSubmit={saveFinanceSettings}>
          <label className="field"><span>Курс сомов за 1 USD</span><div className="settings-currency-input"><span>1 USD =</span><input className="input" type="number" min="1" max="100000" step="0.0001" value={financeForm.exchangeRateKgsPerUsd} onChange={(event) => { setFinanceForm((value) => ({ ...value, exchangeRateKgsPerUsd: event.target.value })); setFinanceSaved(false); }} required/><span>сом</span></div><small className="field-hint">Курс применяется ко всем старым и новым суммам. Последний источник: {settings.exchangeRateSource}, {settings.exchangeRateDate}.</small></label>
          <div className="form-grid settings-commission-grid">
            <label className="field"><span>Комиссия диспетчера, %</span><input className="input" type="number" min="0" max="100" step="0.01" value={financeForm.dispatcher} onChange={(event) => { setFinanceForm((value) => ({ ...value, dispatcher: event.target.value })); setFinanceSaved(false); }} required/><small className="field-hint">От стоимости каждого доставленного груза.</small></label>
            <label className="field"><span>Комиссия водителя, %</span><input className="input" type="number" min="0" max="100" step="0.01" value={financeForm.driver} onChange={(event) => { setFinanceForm((value) => ({ ...value, driver: event.target.value })); setFinanceSaved(false); }} required/><small className="field-hint">Начисляется водителю после фактической доставки.</small></label>
          </div>
          <div className="settings-finance-note"><LockKeyhole size={15}/><span>Стоимость сохраняется с точностью до тийына исходной валюты, а зарплата показывается с точностью до цента. Изменение курса меняет отображение и ввод, но не перезаписывает историю.</span></div>
          <div className="settings-finance-actions"><span role="status">{financeSaved ? 'Настройки сохранены' : settingsLoading ? 'Загружаем настройки…' : 'Новые параметры применятся сразу во всех разделах'}</span><button className="btn btn-primary" type="submit" disabled={financeBusy || settingsLoading}><Save size={15}/>{financeBusy ? 'Сохраняем…' : 'Сохранить расчёты'}</button></div>
        </form>
      </section>}
    </div>

    {addOpen && <Modal title={userForm.managerId ? 'Создать доступ сотруднику' : 'Новый сотрудник'} onClose={() => setAddOpen(false)} footer={<><button className="btn btn-secondary" type="button" onClick={() => setAddOpen(false)}>Отмена</button><button className="btn btn-primary" type="submit" form="settings-add-user" disabled={busy}><Plus size={15}/>{busy ? 'Создаём…' : 'Создать аккаунт'}</button></>}>
      <form id="settings-add-user" className="settings-modal-form" onSubmit={createUser}>
        <p className="settings-modal-intro">После сохранения появится временный пароль. Передайте его сотруднику, а при необходимости сбросьте позже.</p>
        <div className="field"><label htmlFor="settings-user-name">Имя и фамилия</label><input id="settings-user-name" className="input" autoComplete="name" maxLength={160} value={userForm.name} onChange={(event) => setUserForm({ ...userForm, name: event.target.value })} placeholder="Например, Айбек Токтосунов" required/></div>
        <div className="field"><label htmlFor="settings-user-email">Email для входа</label><input id="settings-user-email" type="email" className="input" autoComplete="email" maxLength={254} value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} placeholder="name@company.com" required/></div>
        <div className="form-grid">
          <div className="field"><label htmlFor="settings-user-position">Должность</label><select id="settings-user-position" className="select" value={userForm.position} onChange={(event) => setUserForm({ ...userForm, position: event.target.value })}><option value="dispatcher">Диспетчер</option><option value="driver">Водитель</option><option value="staff">Другой сотрудник</option></select></div>
          <div className="field"><label htmlFor="settings-user-region">Регион</label><input id="settings-user-region" className="input" maxLength={120} value={userForm.region} onChange={(event) => setUserForm({ ...userForm, region: event.target.value })} placeholder="Бишкек"/></div>
        </div>
        <div className="field"><label htmlFor="settings-user-role">Уровень доступа</label><select id="settings-user-role" className="select" value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}><option value="user">Наблюдатель</option><option value="admin">Администратор</option></select><small className="field-hint">Администратор может изменять данные и настройки системы.</small></div>
        {error && <div className="form-error" role="alert">{error}</div>}
      </form>
    </Modal>}

    {editTarget && editForm && <Modal title="Данные учётной записи" onClose={() => { setEditTarget(null); setEditForm(null); }} footer={<><button className="btn btn-secondary" type="button" onClick={() => { setEditTarget(null); setEditForm(null); }}>Отмена</button><button className="btn btn-primary" type="submit" form="settings-edit-user" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить изменения'}</button></>}>
      <form id="settings-edit-user" className="settings-modal-form" onSubmit={saveEdit}>
        <div className="field"><label htmlFor="edit-user-name">Имя и фамилия</label><input id="edit-user-name" className="input" maxLength={160} value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} required/></div>
        <div className="field"><label htmlFor="edit-user-email">Email для входа</label><input id="edit-user-email" type="email" className="input" maxLength={254} value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} required/></div>
        <div className="form-grid"><div className="field"><label htmlFor="edit-user-position">Должность</label><select id="edit-user-position" className="select" value={editForm.position} onChange={(event) => setEditForm({ ...editForm, position: event.target.value })}><option value="dispatcher">Диспетчер</option><option value="driver">Водитель</option><option value="staff">Другой сотрудник</option></select></div><div className="field"><label htmlFor="edit-user-region">Регион</label><input id="edit-user-region" className="input" maxLength={120} value={editForm.region} onChange={(event) => setEditForm({ ...editForm, region: event.target.value })} placeholder="Не указан"/></div></div>
        <div className="field"><label htmlFor="edit-user-role">Уровень доступа</label><select id="edit-user-role" className="select" value={editForm.role} disabled={editTarget.id === user.id} onChange={(event) => setEditForm({ ...editForm, role: event.target.value })}><option value="user">Наблюдатель</option><option value="admin">Администратор</option></select>{editTarget.id === user.id && <small className="field-hint">Свою роль можно изменить через другого администратора.</small>}</div>
        <label className="settings-switch settings-switch--inline"><input type="checkbox" checked={editForm.active} disabled={editTarget.id === user.id} onChange={(event) => setEditForm({ ...editForm, active: event.target.checked })}/><span><strong>Разрешить вход</strong><small>Отключение завершит активные сеансы сотрудника.</small></span></label>
        {error && <div className="form-error" role="alert">{error}</div>}
      </form>
    </Modal>}

    {profileTarget && <ManagerFormModal manager={profileTarget} onClose={() => setProfileTarget(null)} onSubmit={saveProfile} submitting={profileSubmitting} errorMessage={error}/>}

    {credential && <Modal title="Временный пароль создан" onClose={() => { setCredential(null); setCopyLabel('Скопировать пароль'); }} footer={<button className="btn btn-primary" type="button" onClick={() => { setCredential(null); setCopyLabel('Скопировать пароль'); }}>Готово</button>}>
      <div className="credential-result"><div className="credential-result__icon"><KeyRound size={18}/></div><div><strong>{credential.name}</strong><span>{credential.email}</span></div></div>
      <p className="settings-modal-intro">Сохраните пароль сейчас: после закрытия окна его нельзя будет посмотреть, только сбросить снова.</p>
      <label className="field"><span>Временный пароль</span><input className="input credential-result__password" type="text" readOnly value={credential.password} onFocus={(event) => event.target.select()} aria-label="Временный пароль"/></label>
      <button className="btn btn-secondary credential-result__copy" type="button" onClick={copyPassword}><KeyRound size={14}/>{copyLabel}</button>
    </Modal>}
  </>;
}
