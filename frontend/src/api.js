import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({ baseURL: '/api', headers: { 'Content-Type': 'application/json' } });

// Global error interceptor
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const data = error.response?.data;
    const msg = data?.message || data?.errors ? Object.values(data.errors).flat().join(', ') : error.message || 'Connection failed';
    const hint = data?.hint || '';
    toast.error(`${msg}${hint ? `\n💡 ${hint}` : ''}`, { duration: 5000 });
    return Promise.reject(error);
  }
);

// ═══════════ OFFERINGS ═══════════
export const getOfferings = () => api.get('/offerings');
export const getOffering = (id) => api.get(`/offerings/${id}`);
export const createOffering = (data) => api.post('/offerings', data);
export const getVaultStatus = (id) => api.get(`/offerings/${id}/vault`);
export const getHistory = (id) => api.get(`/offerings/${id}/history`);

// ═══════════ INVEST ═══════════
export const invest = (data) => api.post('/offerings/invest', data);
export const refund = (data) => api.post('/offerings/refund', data);
export const release = (data) => api.post('/offerings/release', data);
export const failOffering = (data) => api.post('/offerings/fail', data);
export const emergencyRefund = (data) => api.post('/offerings/emergency-refund', data);
export const amendOffering = (data) => api.post('/offerings/amend', data);

// ═══════════ TESTING ═══════════
export const rechargeWallet = (data) => api.post('/test/recharge', data);
export const advanceTime = (data) => api.post('/test/advance-time', data);

export default api;
