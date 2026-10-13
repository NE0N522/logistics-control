import { Inbox, AlertTriangle, RotateCcw } from 'lucide-react';

export function LoadingState({label='Загрузка данных…'}){return <div className="state-block" role="status" aria-live="polite"><span className="spinner" aria-hidden="true"/><span>{label}</span></div>}
export function EmptyState({title='Пока нет данных',description,icon:Icon=Inbox}){return <div className="state-block"><Icon size={26} strokeWidth={1.5} aria-hidden="true"/><span className="state-block__title">{title}</span>{description&&<span>{description}</span>}</div>}
export function ErrorState({message='Не удалось загрузить данные',onRetry}){return <div className="state-block" role="alert"><AlertTriangle size={26} strokeWidth={1.5} color="var(--danger)" aria-hidden="true"/><span className="state-block__title">{message}</span><span>Проверьте доступность сервера и повторите попытку.</span>{onRetry&&<button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}><RotateCcw size={14}/> Повторить</button>}</div>}
