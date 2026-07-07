import React, { useEffect, useState } from 'react';
import { getTransactions } from '../services/api';

const ACQUIRER_NAMES = {
  acquirer_garanti:   'Garanti',
  acquirer_yapikredi: 'Yapı Kredi',
  acquirer_isbank:    'İş Bankası',
};

export default function Transactions() {
  const [data, setData] = useState({ transactions: [], total: 0, page: 1, limit: 20 });
  const [filters, setFilters] = useState({ status: '', acquirer: '' });

  useEffect(() => {
    load(1);
  }, [filters]);

  async function load(page) {
    try {
      const res = await getTransactions({ page, limit: 20, ...filters });
      setData(res);
    } catch (e) { console.error(e); }
  }

  return (
    <div className="admin-main">
      <div className="page-header">
        <div>
          <h1>İşlemler</h1>
          <p>Tüm ödeme işlemlerinin geçmişi</p>
        </div>
      </div>

      <div className="card">
        <div className="filters">
          <select className="filter-select" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
            <option value="">Tüm Durumlar</option>
            <option value="success">Başarılı</option>
            <option value="failed">Hatalı</option>
            <option value="retried">Retried</option>
          </select>
          <select className="filter-select" value={filters.acquirer} onChange={e => setFilters({...filters, acquirer: e.target.value})}>
            <option value="">Tüm Acquirerlar</option>
            <option value="acquirer_garanti">Garanti</option>
            <option value="acquirer_yapikredi">Yapı Kredi</option>
            <option value="acquirer_isbank">İş Bankası</option>
          </select>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Tarih</th>
                <th>Acquirer</th>
                <th>Tutar</th>
                <th>Durum</th>
                <th>Hata Kodu</th>
                <th>Süre</th>
                <th>Retry</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((t) => (
                <tr key={t.id}>
                  <td className="mono">{t.id.slice(0,8)}</td>
                  <td>{new Date(t.created_at).toLocaleString('tr-TR')}</td>
                  <td>{ACQUIRER_NAMES[t.acquirer_id] || t.acquirer_id}</td>
                  <td>₺{t.amount}</td>
                  <td><span className={`badge ${t.status}`}>{t.status}</span></td>
                  <td>{t.error_code || '—'}</td>
                  <td>{t.response_time_ms}ms</td>
                  <td>{t.retry_count > 0 ? <span className="badge retried">{t.retry_count}</span> : '0'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <button className="page-btn" disabled={data.page === 1} onClick={() => load(data.page - 1)}>Önceki</button>
          <span className="page-info">Sayfa {data.page} / {Math.ceil(data.total / data.limit) || 1}</span>
          <button className="page-btn" disabled={data.page >= Math.ceil(data.total / data.limit)} onClick={() => load(data.page + 1)}>Sonraki</button>
        </div>
      </div>
    </div>
  );
}
