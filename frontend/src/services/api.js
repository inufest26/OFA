import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const api = axios.create({ baseURL: API_URL });

export async function processPayment(payload) {
  const { data } = await api.post('/api/payment', payload);
  return data;
}

export default api;
