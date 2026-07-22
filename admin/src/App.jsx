import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Acquirers from './pages/Acquirers';
import Transactions from './pages/Transactions';
import Logs from './pages/Logs';
import Agent from './pages/Agent';
import Login from './pages/Login';
import { getSocket } from './services/socket';

import GlobalToast from './components/GlobalToast';

function ProtectedRoute() {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;

  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    setWsConnected(socket.connected);
    socket.on('connect', () => setWsConnected(true));
    socket.on('disconnect', () => setWsConnected(false));
    return () => {
      socket.off('connect');
      socket.off('disconnect');
    };
  }, []);

  return (
    <div className="admin-layout">
      <GlobalToast />
      <Sidebar wsConnected={wsConnected} />
      <Outlet />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/acquirers" element={<Acquirers />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/agent" element={<Agent />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
