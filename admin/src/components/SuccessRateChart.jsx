import React, { useEffect, useState, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { getSocket } from '../services/socket';
import { getAllTimelines } from '../services/api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Title, Tooltip, Legend);

const ACQUIRER_CONFIG = {
  acquirer_garanti:   { name: 'Garanti',     color: '#34d399' },
  acquirer_yapikredi: { name: 'Yapı Kredi',  color: '#60a5fa' },
  acquirer_isbank:    { name: 'İş Bankası',  color: '#fbbf24' },
};

const MAX_POINTS = 30;

function buildDatasets(timelineData) {
  return Object.keys(ACQUIRER_CONFIG).map((acqId) => {
    const cfg = ACQUIRER_CONFIG[acqId];
    const snapshots = (timelineData[acqId] || []).slice(-MAX_POINTS);
    return {
      label: cfg.name,
      data: snapshots.map(s => parseFloat((s.success_rate * 100).toFixed(1))),
      borderColor: cfg.color,
      backgroundColor: cfg.color + '18',
      fill: true,
      tension: 0.4,
      pointRadius: 0,
      pointHoverRadius: 4,
      borderWidth: 2,
    };
  });
}

function buildLabels(timelineData) {
  const firstKey = Object.keys(ACQUIRER_CONFIG).find(k => timelineData[k]?.length > 0);
  if (!firstKey) return [];
  return (timelineData[firstKey] || []).slice(-MAX_POINTS).map(s => {
    // API returns `time` field (period_end aliased as `time`)
    const d = new Date(s.time);
    if (isNaN(d)) return '';
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  });
}

export default function SuccessRateChart() {
  const [timelineData, setTimelineData] = useState({});
  const lastFetch = useRef(0);

  function fetchTimelines() {
    const now = Date.now();
    // Debounce: don't refetch more than once per 3 seconds
    if (now - lastFetch.current < 3000) return;
    lastFetch.current = now;
    getAllTimelines().then(setTimelineData).catch(console.error);
  }

  useEffect(() => {
    fetchTimelines();
    const socket = getSocket();
    socket.on('acquirer:update', fetchTimelines);
    // Also poll every 5 seconds to keep chart fresh even without traffic
    const interval = setInterval(fetchTimelines, 5000);
    return () => {
      socket.off('acquirer:update', fetchTimelines);
      clearInterval(interval);
    };
  }, []);

  const labels = buildLabels(timelineData);
  const datasets = buildDatasets(timelineData);
  const hasData = labels.length > 0;

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#94a3b8',
          font: { size: 11, family: "'Inter', sans-serif" },
          usePointStyle: true,
          pointStyleWidth: 8,
          boxHeight: 6,
        },
      },
      title: { display: false },
      tooltip: {
        backgroundColor: '#1e293b',
        borderColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        titleColor: '#e2e8f0',
        bodyColor: '#94a3b8',
        callbacks: {
          label: ctx => ` ${ctx.dataset.label}: %${ctx.parsed.y}`,
        },
      },
    },
    scales: {
      y: {
        min: 0,
        max: 100,
        ticks: { color: '#a1a1aa', font: { size: 10 }, callback: v => `%${v}` },
        grid: { color: 'rgba(255,255,255,0.06)' },
        border: { color: 'transparent' },
      },
      x: {
        ticks: { color: '#a1a1aa', font: { size: 10 }, maxTicksLimit: 8, maxRotation: 0 },
        grid: { display: false },
        border: { color: 'transparent' },
      },
    },
    animation: { duration: 300 },
  };

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border2)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px 24px',
      marginBottom: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>Başarı Oranı Trendi</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 2 }}>Son {MAX_POINTS} ölçüm noktası • 5 saniyede bir güncellenir</div>
        </div>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: '#22c55e',
          boxShadow: '0 0 0 3px rgba(34,197,94,0.2)',
          animation: 'pulse-dot 2s ease-in-out infinite',
        }} />
      </div>
      <div style={{ height: 240 }}>
        {hasData
          ? <Line options={options} data={{ labels, datasets }} />
          : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>Veri bekleniyor...</div>
        }
      </div>
    </div>
  );
}
