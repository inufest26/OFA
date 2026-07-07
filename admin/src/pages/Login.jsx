import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/api';

export default function Login() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await login(username, password);
      localStorage.setItem('token', res.token);
      nav('/');
    } catch (err) {
      setError('Geçersiz kullanıcı adı veya şifre');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <h1>Smart<span>Pay</span></h1>
          <p>Admin Dashboard</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label>Kullanıcı Adı</label>
            <input
              type="text" className="login-input"
              value={username} onChange={e => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="login-field">
            <label>Şifre</label>
            <input
              type="password" className="login-input"
              value={password} onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>
      </div>
    </div>
  );
}
