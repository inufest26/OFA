import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { getSocket } from '../services/socket';
import { getAllTimelines } from '../services/api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const COLORS = {
  acquirer_garanti: '#10b981', // green
  acquirer_yapikredi: '#3b82f6', // blue
  acquirer_isbank: '#f59e0b', // yellow
};

const NAMES = {
  acquirer_garanti: 'Garanti',
  acquirer_yapikredi: 'Yapı Kredi',
  acquirer_isbank: 'İş Bankası',
};

export default function SuccessRateChart() {
  const [timelineData, setTimelineData] = useState({});

  useEffect(() => {
    // Initial fetch
    getAllTimelines().then((data) => {
      setTimelineData(data);
    }).catch(console.error);

    // Real-time updates
    const socket = getSocket();
    const handleUpdate = () => {
      getAllTimelines().then(setTimelineData).catch(console.error);
    };

    socket.on('acquirer:update', handleUpdate);
    return () => socket.off('acquirer:update', handleUpdate);
  }, []);

  // Format data for Chart.js
  const datasets = Object.keys(timelineData).map((acqId) => {
    const snapshots = timelineData[acqId] || [];
    // Sort chronologically
    snapshots.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    return {
      label: NAMES[acqId] || acqId,
      data: snapshots.map(s => (s.success_rate * 100).toFixed(1)),
      borderColor: COLORS[acqId] || '#cbd5e1',
      backgroundColor: COLORS[acqId] || '#cbd5e1',
      tension: 0.3,
      pointRadius: 2,
    };
  });

  // Generate labels from the longest timeline
  let labels = [];
  if (Object.keys(timelineData).length > 0) {
    const firstAcq = Object.keys(timelineData)[0];
    if (timelineData[firstAcq]) {
      const sorted = [...timelineData[firstAcq]].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      labels = sorted.map(s => {
        const d = new Date(s.created_at);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      });
    }
  }

  const data = { labels, datasets };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { color: '#cbd5e1' } },
      title: { display: true, text: 'Acquirer Başarı Oranı (%)', color: '#f8fafc' },
    },
    scales: {
      y: { min: 0, max: 100, ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
      x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
    },
    animation: { duration: 0 }
  };

  return (
    <div style={{ height: '300px', width: '100%', backgroundColor: 'var(--surface)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)', marginTop: '20px', marginBottom: '20px' }}>
      <Line options={options} data={data} />
    </div>
  );
}
