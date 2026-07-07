import React, { useEffect, useState } from 'react';
import { getLogs } from '../services/api';

const ACQUIRER_NAMES = {
  acquirer_garanti:   'Garanti',
  acquirer_yapikredi: 'Yapı Kredi',
  acquirer_isbank:    'İş Bankası',
};

export default function Logs() {
  const [data, setData] = useState({ logs: [], total: 0, page: 1, limit: 50 });
  const [filters, setFilters] = useState({ acquirer: '', errorCode: '' });

  useEffect(() => {
    load(1);
  }, [filters]);

  async function load(page) {
    try {
      const res = await getLogs({ page, limit: 50, ...filters });
      setData(res);
    } catch (e) { console.error(e); }
  }

  return (
    <div className="admin-main">
      <div className="page-header">
        <div>
          <h1>Hata Logları</h1>
          <p>Sistemdeki tüm hata ve retry kayıtları</p>
        </div>
      </div>

      <div className="card">
        <div className="filters">
          <select className="filter-select" value={filters.acquirer} onChange={e => setFilters({...filters, acquirer: e.target.value})}>
            <option value="">Tüm Acquirerlar</option>
            <option value="acquirer_garanti">Garanti</option>
            <option value="acquirer_yapikredi">Yapı Kredi</option>
            <option value="acquirer_isbank">İş Bankası</option>
          </select>
          <input
            type="text" className="filter-input" placeholder="Hata Kodu (örn. E101)"
            value={filters.errorCode} onChange={e => setFilters({...filters, errorCode: e.target.value})}
          />
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>İşlem ID</th>
                <th>Acquirer</th>
                <th>Hata Kodu</th>
                <th>Açıklama</th>
                <th>Retry Atıldı Mı?</th>
              </tr>
            </thead>
            <tbody>
              {data.logs.map((l) => (
                <tr key={l.id}>
                  <td>{new Date(l.created_at).toLocaleString('tr-TR')}</td>
                  <td className="mono">{(l.transaction_id || '').slice(0,8)}</td>
                  <td>{ACQUIRER_NAMES[l.acquirer_id] || l.acquirer_id}</td>
                  <td><span className="badge failed">{l.error_code}</span></td>
                  <td>{l.error_message}</td>
                  <td>{l.retry_attempted ? <span className="badge retried">Evet</span> : 'Hayır'}</td>
                </tr>
              ))}
              {data.logs.length === 0 && (
                <tr><td colSpan="6" className="empty-state">Kayıt bulunamadı</td></tr>
              )}
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
