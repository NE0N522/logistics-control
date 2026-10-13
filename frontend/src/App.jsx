import { Navigate, Outlet, Route, Routes, useOutletContext } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Sidebar } from './components/layout/sidebar.jsx';
import { CommandPalette } from './components/layout/command-palette.jsx';
import { FiltersProvider } from './context/filters-context.jsx';
import { AuthProvider, useAuth } from './context/auth-context.jsx';
import { PreferencesProvider } from './context/preferences-context.jsx';
import { SystemSettingsProvider } from './context/system-settings-context.jsx';
import { useNotifications } from './hooks/use-notifications.js';
import { OverviewPage } from './pages/overview-page.jsx';
import { DealsPage } from './pages/deals-page.jsx';
import { TeamPage } from './pages/team-page.jsx';
import { ProductsPage } from './pages/products-page.jsx';
import { ReportsPage } from './pages/reports-page.jsx';
import { AlertsPage } from './pages/alerts-page.jsx';
import { SettingsPage } from './pages/settings-page.jsx';
import { PayrollPage } from './pages/payroll-page.jsx';
import { LoginPage, NotFoundPage } from './pages/login-page.jsx';
import { LoadingState, ErrorState } from './components/ui/state-blocks.jsx';

function ProtectedShell(){
  const {user,logout}=useAuth();
  const {data}=useNotifications();
  const [menuOpen,setMenuOpen]=useState(false);
  const [commandsOpen,setCommandsOpen]=useState(false);
  useEffect(()=>{
    const onKeyDown=(event)=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLocaleLowerCase()==='k'){
        event.preventDefault();setCommandsOpen((open)=>!open);
      }
    };
    window.addEventListener('keydown',onKeyDown);
    return ()=>window.removeEventListener('keydown',onKeyDown);
  },[]);
  if(!user) return <Navigate to="/login" replace />;
  return <div className="app-shell">
    <Sidebar alertsCount={data.length} open={menuOpen} onClose={()=>setMenuOpen(false)} user={user} onLogout={logout} onOpenCommands={()=>setCommandsOpen(true)}/>
    <div className="main-column"><Outlet context={{onMenu:()=>setMenuOpen(true),onDataChanged:()=>window.dispatchEvent(new Event('sales-data-changed'))}}/></div>
    {commandsOpen&&<CommandPalette user={user} onClose={()=>setCommandsOpen(false)}/>}
  </div>;
}

function AdminOnly({children}){
  const {user}=useAuth();
  return user?.role==='admin' ? children : <Navigate to="/" replace />;
}

function RoutedPage({Component}){
  const {onMenu,onDataChanged}=useOutletContext();
  return <Component onMenu={onMenu} onDataChanged={onDataChanged}/>;
}

function AppRouter(){
  const {user,loading,error,refresh}=useAuth();
  if(loading) return <LoadingState label="Проверяем сессию…"/>;
  if(error) return <div className="content"><div className="panel"><ErrorState message="Не удалось проверить сессию" onRetry={()=>refresh().catch(()=>undefined)}/></div></div>;
  return <Routes>
    <Route path="/login" element={user?<Navigate to="/" replace/>:<LoginPage/>}/>
    <Route element={<ProtectedShell/>}>
      <Route path="/" element={<RoutedPage Component={OverviewPage}/>}/>
      <Route path="/deals" element={<RoutedPage Component={DealsPage}/>}/>
      <Route path="/team" element={<RoutedPage Component={TeamPage}/>}/>
      <Route path="/products" element={<RoutedPage Component={ProductsPage}/>}/>
      <Route path="/reports" element={<RoutedPage Component={ReportsPage}/>}/>
      <Route path="/payroll" element={<RoutedPage Component={PayrollPage}/>}/>
      <Route path="/alerts" element={<RoutedPage Component={AlertsPage}/>}/>
      <Route path="/settings" element={<AdminOnly><RoutedPage Component={SettingsPage}/></AdminOnly>}/>
      <Route path="*" element={<RoutedPage Component={NotFoundPage}/>}/>
    </Route>
    <Route path="*" element={<Navigate to={user?'/':'/login'} replace/>}/>
  </Routes>;
}

export default function App(){
  return <PreferencesProvider><AuthProvider><SystemSettingsProvider><FiltersProvider><AppRouter/></FiltersProvider></SystemSettingsProvider></AuthProvider></PreferencesProvider>;
}
