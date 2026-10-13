import { useState } from 'react';
import { Plus, Pencil, Archive, ArchiveRestore } from 'lucide-react';
import { Topbar } from '../components/layout/topbar.jsx';
import { FilterBar } from '../components/layout/filter-bar.jsx';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/state-blocks.jsx';
import { ProductFormModal } from '../components/products/product-form-modal.jsx';
import { useFilters } from '../context/filters-context.jsx';
import { useAsyncData } from '../hooks/use-async-data.js';
import { api } from '../lib/api-client.js';
import { formatMoney, formatNumber } from '../lib/format.js';
import { useAuth } from '../context/auth-context.jsx';

export function ProductsPage({ onMenu, onDataChanged }) {
  const { filters } = useFilters();
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const key = JSON.stringify(filters);
  const stats = useAsyncData(() => api.get('/products/stats', { ...filters, includeInactive: 1 }), [key], []);
  const [modalProduct, setModalProduct] = useState(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function toggleArchive(product) {
    if (!isAdmin) return;
    setError('');
    try {
      await api.post(`/products/${product.id}/${product.active ? 'archive' : 'restore'}`, {});
      await stats.reload();
      onDataChanged?.();
    } catch (requestError) { setError(requestError.message); }
  }

  async function submit(form) {
    setSubmitting(true);
    setError('');
    try {
      if (modalProduct?.id) await api.put(`/products/${modalProduct.id}`, form);
      else await api.post('/products', form);
      setModalProduct(undefined);
      await stats.reload();
      onDataChanged?.();
    } catch (requestError) { setError(requestError.message); }
    finally { setSubmitting(false); }
  }

  return <>
    <Topbar onMenu={onMenu} title="Типы груза" subtitle="Категории перевозок и базовые тарифы; архивные типы сохраняются в истории" actions={isAdmin ? <button className="btn btn-primary" onClick={() => { setError(''); setModalProduct(null); }}><Plus size={15}/> Добавить тип</button> : <span className="badge badge--team">Только просмотр</span>}/>
    <div className="content">
      <FilterBar/>
      <div className="panel">
        {error && <div className="form-error" role="alert">{error}</div>}
        {stats.error ? <ErrorState message="Не удалось загрузить типы груза" onRetry={() => stats.reload().catch(() => undefined)}/> : stats.loading ? <LoadingState/> : stats.data.length === 0 ? <EmptyState title="Типов груза пока нет"/> : <div className="data-table-wrap">
          <table className="data-table cargo-types-table"><caption className="sr-only">Типы груза и стоимость доставок</caption>
            <thead><tr><th>Тип груза</th><th>Условия перевозки</th><th className="data-table__numeric">Базовый тариф, USD</th><th className="data-table__numeric">Количество доставок</th><th className="data-table__numeric">Стоимость доставок, USD</th><th><span className="sr-only">Действия</span></th></tr></thead>
            <tbody>{stats.data.map((product) => <tr key={product.id}>
              <td data-label="Тип груза">{product.name}{!product.active && <span className="inactive-mark"> · архив</span>}</td>
              <td data-label="Условия перевозки">{product.category || '—'}</td>
              <td className="data-table__numeric" data-label="Базовый тариф, USD">{formatMoney(product.price)}</td>
              <td className="data-table__numeric" data-label="Количество доставок">{formatNumber(product.unitsSold)}</td>
              <td className="data-table__numeric" data-label="Стоимость доставок, USD">{formatMoney(product.revenue)}</td>
              <td data-label="Действия"><div className="row">{isAdmin && <><button className="icon-btn" title="Изменить" aria-label={`Изменить тип груза ${product.name}`} onClick={() => { setError(''); setModalProduct(product); }}><Pencil size={15}/></button><button className="icon-btn" title={product.active ? 'Архивировать' : 'Восстановить'} aria-label={product.active ? `Архивировать тип груза ${product.name}` : `Восстановить тип груза ${product.name}`} onClick={() => toggleArchive(product)}>{product.active ? <Archive size={15}/> : <ArchiveRestore size={15}/>}</button></>}</div></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </div>
    </div>
    {modalProduct !== undefined && <ProductFormModal product={modalProduct} submitting={submitting} errorMessage={error} onClose={() => { setModalProduct(undefined); setError(''); }} onSubmit={submit}/>}
  </>;
}
