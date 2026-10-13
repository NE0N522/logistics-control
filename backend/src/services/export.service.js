import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../db/connection.js';
import { buildFilterClause } from './query-filters.js';
import { getSummary, getTopManagers, getTopProducts } from './analytics.service.js';
import { ApiError } from '../middleware/error-handler.js';
import { BUSINESS_TIMEZONE, toDateOnly } from '../utils/date-utils.js';
import { getSystemSettings } from './settings.service.js';

const STATUS_LABELS = { new: 'Новый', assigned: 'Назначен', in_transit: 'В пути', delivered: 'Доставлен', issue: 'Проблема', cancelled: 'Отменён' };
const MAX_EXPORT_ROWS = 50000;

async function fetchDeals(filters) {
  const { clause, params } = buildFilterClause(filters, { dateColumn: 'deals.created_at' });
  const rows = (await (db.prepare(`
    SELECT deals.id, deals.title,
           COALESCE(deals.manager_name_snapshot, managers.name, 'Не назначен') AS dispatcher,
           COALESCE(deals.driver_name_snapshot, drivers.name, 'Не назначен') AS driver,
           COALESCE(deals.product_name_snapshot, products.name, '—') AS cargo_type,
           deals.region, deals.stage, deals.shipment_status, deals.amount, deals.quantity, deals.weight_kg,
           deals.currency, deals.source, deals.pickup_location, deals.delivery_location, deals.vehicle,
           deals.dispatcher_assigned_at, deals.driver_assigned_at, deals.expected_delivery_at,
           deals.created_at, deals.paid_at, deals.delivered_at
    FROM deals
    LEFT JOIN managers ON managers.id=deals.manager_id
    LEFT JOIN managers drivers ON drivers.id=deals.driver_id
    LEFT JOIN products ON products.id=deals.product_id
    ${clause}
    ORDER BY deals.created_at DESC LIMIT @maxRows
  `).all({ ...params, maxRows: MAX_EXPORT_ROWS + 1 })));
  if (rows.length > MAX_EXPORT_ROWS) throw new ApiError(413, `Слишком большой экспорт: максимум ${MAX_EXPORT_ROWS} грузов`);
  return rows;
}

async function getAllManagerPerformance(filters = {}) {
  const { clause, params } = buildFilterClause(filters, { dateColumn: 'deals.paid_at' });
  const managerScope = params.managerId !== undefined ? "WHERE managers.id=@managerId AND managers.position='dispatcher'" : "WHERE managers.position='dispatcher'";
  return (await (db.prepare(`
    SELECT managers.id, managers.name, managers.region,
           COALESCE(sales.revenue, 0) AS revenue, COALESCE(sales.deals, 0) AS deals
    FROM managers
    LEFT JOIN (
      SELECT deals.manager_id, SUM(deals.amount) AS revenue, COUNT(*) AS deals
      FROM deals
      ${clause} AND deals.paid_at IS NOT NULL AND deals.manager_id IS NOT NULL
      GROUP BY deals.manager_id
    ) sales ON sales.manager_id = managers.id
    ${managerScope}
    ORDER BY revenue DESC, managers.name ASC
  `).all(params)));
}

async function getAllProductPerformance(filters = {}) {
  const { clause, params } = buildFilterClause(filters, { dateColumn: 'deals.paid_at' });
  const productScope = params.productId !== undefined ? 'WHERE products.id=@productId' : '';
  return (await (db.prepare(`
    SELECT products.id, products.name,
           COALESCE(sales.revenue, 0) AS revenue, COALESCE(sales.deals, 0) AS deals, COALESCE(sales.unitsSold, 0) AS unitsSold
    FROM products
    LEFT JOIN (
      SELECT deals.product_id, SUM(deals.amount) AS revenue, COUNT(*) AS deals, SUM(deals.quantity) AS unitsSold
      FROM deals
      ${clause} AND deals.paid_at IS NOT NULL AND deals.product_id IS NOT NULL
      GROUP BY deals.product_id
    ) sales ON sales.product_id = products.id
    ${productScope}
    ORDER BY revenue DESC, products.name ASC
  `).all(params)));
}

function filterDescription(filters) {
  return {
    period: `${filters.from || 'без начала'} — ${filters.to || 'без конца'}`,
    dateBasis: 'Стоимость доставленных грузов — дата доставки; новые грузы и реестр — дата регистрации',
    timezone: BUSINESS_TIMEZONE,
    dispatcherId: filters.managerId || 'все',
    driverId: filters.driverId || 'все',
    cargoTypeId: filters.productId || 'все',
    region: filters.region || 'все'
  };
}

function styleSheet(sheet) {
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF142033' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

export async function buildExcelReport(filters = {}) {
  const [deals, summary, allManagers, allProducts, settings] = await Promise.all([
    fetchDeals(filters), getSummary(filters), getAllManagerPerformance(filters), getAllProductPerformance(filters), getSystemSettings()
  ]);
  const meta = filterDescription(filters);
  const exchangeRate = settings.exchangeRateKgsPerUsd;
  const toUsd = (amount) => Number(amount || 0) / exchangeRate;
  meta.currency = 'USD';
  meta.exchangeRate = `1 USD = ${exchangeRate} KGS`;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Logistics Control';
  workbook.created = new Date();

  const info = workbook.addWorksheet('Параметры');
  info.columns = [{ header: 'Параметр', key: 'key', width: 38 }, { header: 'Значение', key: 'value', width: 70 }];
  info.addRows(Object.entries(meta).map(([key, value]) => ({ key, value: String(value) })));
  styleSheet(info);

  const summarySheet = workbook.addWorksheet('Сводка');
  summarySheet.columns = [{ header: 'Показатель', key: 'metric', width: 50 }, { header: 'Значение', key: 'value', width: 22 }];
  summarySheet.addRows([
    { metric: 'Стоимость доставленных грузов (дата доставки), USD', value: toUsd(summary.revenue) },
    { metric: 'Зарегистрировано грузов (дата создания)', value: summary.totalDeals },
    { metric: 'Доставлено грузов (дата доставки)', value: summary.paidDeals },
    { metric: 'Доля доставленных грузов, %', value: Number(summary.conversionRate.toFixed(1)) },
    { metric: 'Проблемы и отмены', value: summary.lostDeals },
    { metric: 'Средняя стоимость доставки, USD', value: toUsd(summary.avgCheck) }
  ]);
  styleSheet(summarySheet);
  summarySheet.getColumn('value').numFmt = '#,##0';
  summarySheet.getCell('B2').numFmt = '$#,##0.00';
  summarySheet.getCell('B7').numFmt = '$#,##0.00';
  summarySheet.getCell('B5').numFmt = '0.0"%"';
  summarySheet.addRow({ metric: 'Итого', value: '' }).font = { bold: true };

  const dealsSheet = workbook.addWorksheet('Грузы и назначения');
  dealsSheet.columns = [
    { header: 'ID', key: 'id', width: 8 }, { header: 'Груз', key: 'title', width: 32 },
    { header: 'Диспетчер', key: 'dispatcher', width: 24 }, { header: 'Водитель', key: 'driver', width: 24 },
    { header: 'Тип груза', key: 'cargo_type', width: 25 }, { header: 'Статус', key: 'shipment_status', width: 16 },
    { header: 'Откуда', key: 'pickup_location', width: 22 }, { header: 'Куда', key: 'delivery_location', width: 22 },
    { header: 'Вес, кг', key: 'weight_kg', width: 12 }, { header: 'Транспорт', key: 'vehicle', width: 22 },
    { header: 'Стоимость, USD', key: 'amount', width: 18 }, { header: 'Назначен диспетчер', key: 'dispatcher_assigned_at', width: 20 },
    { header: 'Назначен водитель', key: 'driver_assigned_at', width: 20 }, { header: 'План доставки', key: 'expected_delivery_at', width: 20 },
    { header: 'Создан', key: 'created_at', width: 20 }, { header: 'Доставлен', key: 'delivered_at', width: 20 }
  ];
  deals.forEach((load) => dealsSheet.addRow({ ...load, amount: toUsd(load.amount), shipment_status: STATUS_LABELS[load.shipment_status] || load.shipment_status, dispatcher_assigned_at: toDateOnly(load.dispatcher_assigned_at) || '', driver_assigned_at: toDateOnly(load.driver_assigned_at) || '', expected_delivery_at: toDateOnly(load.expected_delivery_at) || '', created_at: toDateOnly(load.created_at), delivered_at: toDateOnly(load.delivered_at) || '' }));
  styleSheet(dealsSheet);
  dealsSheet.autoFilter = `A1:P${Math.max(1, dealsSheet.rowCount)}`;
  dealsSheet.getColumn('amount').numFmt = '$#,##0.00';
  ['dispatcher_assigned_at','driver_assigned_at','expected_delivery_at','created_at','delivered_at'].forEach((key) => { dealsSheet.getColumn(key).numFmt = 'yyyy-mm-dd'; });

  const managersSheet = workbook.addWorksheet('Диспетчеры');
  managersSheet.columns = [{ header: 'Диспетчер', key: 'name', width: 30 }, { header: 'Регион', key: 'region', width: 18 }, { header: 'Стоимость доставок, USD', key: 'revenue', width: 24 }, { header: 'Доставлено грузов', key: 'deals', width: 20 }];
  allManagers.forEach((row) => managersSheet.addRow({ ...row, revenue: toUsd(row.revenue) }));
  styleSheet(managersSheet); managersSheet.getColumn('revenue').numFmt = '$#,##0.00';
  managersSheet.addRow({ name: 'Итого', revenue: toUsd(allManagers.reduce((sum, row) => sum + Number(row.revenue || 0), 0)), deals: allManagers.reduce((sum, row) => sum + Number(row.deals || 0), 0) }).font = { bold: true };

  const productsSheet = workbook.addWorksheet('Типы груза');
  productsSheet.columns = [{ header: 'Тип груза', key: 'name', width: 34 }, { header: 'Стоимость доставок, USD', key: 'revenue', width: 24 }, { header: 'Доставлено грузов', key: 'deals', width: 20 }, { header: 'Грузовых мест', key: 'unitsSold', width: 16 }];
  allProducts.forEach((row) => productsSheet.addRow({ ...row, revenue: toUsd(row.revenue) }));
  styleSheet(productsSheet); productsSheet.getColumn('revenue').numFmt = '$#,##0.00';
  productsSheet.addRow({ name: 'Итого', revenue: toUsd(allProducts.reduce((sum, row) => sum + Number(row.revenue || 0), 0)), deals: allProducts.reduce((sum, row) => sum + Number(row.deals || 0), 0), unitsSold: allProducts.reduce((sum, row) => sum + Number(row.unitsSold || 0), 0) }).font = { bold: true };

  return workbook.xlsx.writeBuffer();
}

export async function buildPdfReport(filters = {}) {
  const [deals, summary, topManagers, topProducts, settings] = await Promise.all([
    fetchDeals(filters), getSummary(filters), getTopManagers(filters, 10), getTopProducts(filters, 10), getSystemSettings()
  ]);
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const regularFont = path.resolve(__dirname, '../../assets/DejaVuSans.ttf');
  const boldFont = path.resolve(__dirname, '../../assets/DejaVuSans-Bold.ttf');
  const doc = new PDFDocument({ margin: 42, size: 'A4', bufferPages: true });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  const exchangeRate = settings.exchangeRateKgsPerUsd;
  const formatMoney = (n) => `$${(Number(n || 0) / exchangeRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatDate = (v) => v ? new Date(v).toLocaleDateString('ru-RU', { timeZone: BUSINESS_TIMEZONE }) : '—';
  const filterParts = [`Период: ${filters.from || '—'} — ${filters.to || '—'}`, 'Деньги: USD', `Курс: 1 USD = ${exchangeRate} сом`, 'Стоимость доставок: дата доставки', 'Реестр: дата создания груза', `Часовой пояс: ${BUSINESS_TIMEZONE}`];
  if (filters.managerId) { const manager = (await (db.prepare('SELECT name FROM managers WHERE id=?').get(Number(filters.managerId)))); filterParts.push(`Диспетчер: ${manager?.name || 'не найден'}`); }
  if (filters.driverId) { const driver = (await (db.prepare('SELECT name FROM managers WHERE id=?').get(Number(filters.driverId)))); filterParts.push(`Водитель: ${driver?.name || 'не найден'}`); }
  if (filters.productId) { const product = (await (db.prepare('SELECT name FROM products WHERE id=?').get(Number(filters.productId)))); filterParts.push(`Тип груза: ${product?.name || 'не найден'}`); }
  if (filters.region) filterParts.push(`Регион: ${filters.region}`);
  const addHeader = () => {
    doc.font(boldFont).fontSize(17).fillColor('#142033').text('Отчёт по перевозкам');
    doc.font(regularFont).fontSize(8.5).fillColor('#667085').text(`Logistics Control · сформирован ${new Date().toLocaleString('ru-RU', { timeZone: BUSINESS_TIMEZONE })}`);
    doc.text(filterParts.join(' · ')); doc.moveDown(0.7);
  };
  const ensure = (height = 40) => { if (doc.y + height > doc.page.height - 45) { doc.addPage(); addHeader(); } };
  doc.font(regularFont); addHeader();
  doc.font(boldFont).fontSize(12).fillColor('#142033').text('Ключевые показатели'); doc.moveDown(0.3);
  [['Стоимость доставок',formatMoney(summary.revenue)],['Зарегистрировано грузов',String(summary.totalDeals)],['Доставлено',String(summary.paidDeals)],['Доля доставок',`${summary.conversionRate.toFixed(1)}%`],['Проблемы и отмены',String(summary.lostDeals)],['Средняя стоимость доставки',formatMoney(summary.avgCheck)]].forEach(([k,v])=>{ensure(18);doc.font(boldFont).fontSize(9.5).fillColor('#344054').text(`${k}: `,{continued:true});doc.font(regularFont).text(v);});
  ensure(40); doc.moveDown(0.6); doc.font(boldFont).fontSize(12).text('Диспетчеры по стоимости доставок'); topManagers.forEach((m,i)=>{ensure(18);doc.font(regularFont).fontSize(9.5).text(`${i+1}. ${m.name || '—'} — ${formatMoney(m.revenue)} · ${m.deals} доставлено`);});
  ensure(40); doc.moveDown(0.6); doc.font(boldFont).fontSize(12).text('Типы груза'); topProducts.forEach((p,i)=>{ensure(18);doc.font(regularFont).fontSize(9.5).text(`${i+1}. ${p.name || '—'} — ${formatMoney(p.revenue)} · ${p.deals} доставлено`);});
  ensure(34); doc.moveDown(0.6); doc.font(boldFont).fontSize(12).text(`Реестр грузов и назначений · ${deals.length}`); doc.moveDown(0.3);
  const columns=[{title:'ID',x:42,width:25},{title:'Груз',x:67,width:110},{title:'Диспетчер',x:177,width:88},{title:'Водитель',x:265,width:80},{title:'Статус',x:345,width:72},{title:'Стоимость',x:417,width:93}];
  const drawHead=()=>{ensure(28);const y=doc.y;doc.rect(42,y-2,468,20).fill('#eef3f8');columns.forEach(c=>doc.font(boldFont).fontSize(7).fillColor('#475467').text(c.title,c.x+3,y+3,{width:c.width-6,lineBreak:false}));doc.y=y+22;};
  drawHead();
  deals.forEach((load,index)=>{if(doc.y+48>doc.page.height-42){doc.addPage();addHeader();drawHead();}const y=doc.y;if(index%2===1)doc.rect(42,y-2,468,46).fill('#fafbfc');const vals=[String(load.id),load.title||'—',load.dispatcher||'Не назначен',load.driver||'Не назначен',STATUS_LABELS[load.shipment_status]||load.shipment_status,formatMoney(load.amount)];vals.forEach((v,i)=>{const c=columns[i];doc.font(regularFont).fontSize(7).fillColor('#344054').text(v,c.x+3,y+3,{width:c.width-6,height:22,ellipsis:true,lineBreak:false});});const route=`${load.pickup_location||'—'} → ${load.delivery_location||'—'} · ${load.cargo_type||'—'} · ${load.weight_kg||'—'} кг`;const dates=`Назначен: ${formatDate(load.dispatcher_assigned_at)} · Водитель: ${formatDate(load.driver_assigned_at)} · Доставлен: ${formatDate(load.delivered_at)}`;doc.font(regularFont).fontSize(6.5).fillColor('#667085').text(route,70,y+19,{width:438,lineBreak:false,ellipsis:true});doc.text(dates,70,y+29,{width:438,lineBreak:false});doc.moveTo(42,y+45).lineTo(510,y+45).strokeColor('#e4e7ec').stroke();doc.y=y+46;});
  doc.end();
  return done;
}
