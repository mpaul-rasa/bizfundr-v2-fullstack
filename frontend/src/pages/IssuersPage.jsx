import { useEffect, useState } from 'react';
import { Building, AlertTriangle, CheckCircle } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({ baseURL: '/api' });

export default function IssuersPage() {
  const [issuers, setIssuers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    company_name: '', wallet_address: '', email: '',
    confirmed_no_other_platforms: false, acknowledged_lying_is_crime: false,
  });

  useEffect(() => { loadIssuers(); }, []);
  const loadIssuers = () => api.get('/issuers').then(r => setIssuers(r.data.issuers || [])).catch(() => {});
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.confirmed_no_other_platforms || !form.acknowledged_lying_is_crime) {
      return toast.error('You must check both compliance boxes');
    }
    setLoading(true);
    try {
      await api.post('/issuers', form);
      toast.success('Issuer registered!');
      setShowForm(false);
      setForm({ company_name: '', wallet_address: '', email: '', confirmed_no_other_platforms: false, acknowledged_lying_is_crime: false });
      loadIssuers();
    } catch (err) {
      const msg = err.response?.data?.errors ? Object.values(err.response.data.errors).flat().join(', ') : err.response?.data?.message || 'Registration failed';
      toast.error(msg);
    } finally { setLoading(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Issuers (Startups)</h1>
          <p className="text-gray-500 text-sm mt-1">{issuers.length} registered issuer{issuers.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">
          {showForm ? 'Cancel' : '+ Register Issuer'}
        </button>
      </div>

      {/* ═══════ REGISTRATION FORM ═══════ */}
      {showForm && (
        <form onSubmit={submit} className="bg-vault-card rounded-xl border border-purple-500/20 p-6 mb-6 space-y-4">
          <h2 className="font-bold text-purple-400 flex items-center gap-2"><Building size={18}/>Register New Issuer</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Company Name</label>
              <input value={form.company_name} onChange={e => set('company_name', e.target.value)} required
                className="w-full bg-vault-bg border border-vault-border rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none" placeholder="TechStartup Inc."/>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required
                className="w-full bg-vault-bg border border-vault-border rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none" placeholder="founder@company.com"/>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Founder Wallet Address (Ethereum)</label>
            <input value={form.wallet_address} onChange={e => set('wallet_address', e.target.value)} required
              className="w-full bg-vault-bg border border-vault-border rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-purple-500 focus:outline-none" placeholder="0x..."/>
          </div>

          {/* ═══════ $1.5M LIMIT WARNING ═══════ */}
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
            <p className="text-sm text-amber-300 font-semibold mb-1">⚠️ Issuer Raise Limit: $1,500,000 CAD</p>
            <p className="text-xs text-gray-400">Maximum per issuer group in any 12-month period across ALL platforms (National Instrument 45-110).</p>
          </div>

          {/* ═══════ COMPLIANCE CHECKBOXES ═══════ */}
          <label className="flex items-start gap-3 cursor-pointer bg-vault-bg rounded-lg p-3 border border-vault-border">
            <input type="checkbox" checked={form.confirmed_no_other_platforms} onChange={e => set('confirmed_no_other_platforms', e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-purple-500"/>
            <span className="text-sm text-gray-300">I confirm this issuer does <strong className="text-white">NOT</strong> have any other active crowdfunding campaigns on any platform.</span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer bg-red-500/5 rounded-lg p-3 border border-red-500/20">
            <input type="checkbox" checked={form.acknowledged_lying_is_crime} onChange={e => set('acknowledged_lying_is_crime', e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-red-500"/>
            <span className="text-sm text-gray-300">
              <strong className="text-red-400">⚠️ I acknowledge that providing false information is a criminal offence</strong> under Canadian securities law (Section 122 of the Securities Act).
            </span>
          </label>

          <button type="submit" disabled={loading}
            className="w-full bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm">
            {loading ? 'Registering...' : '✅ Register Issuer'}
          </button>
        </form>
      )}

      {/* ═══════ ISSUER LIST ═══════ */}
      <div className="space-y-3">
        {issuers.map(iss => (
          <div key={iss.id} className="bg-vault-card rounded-xl border border-vault-border p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Building size={18} className="text-purple-400"/>
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">{iss.company_name}</h3>
                <p className="text-gray-500 text-xs">{iss.email}</p>
                <code className="text-[0.65rem] text-gray-600">{iss.wallet_address}</code>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Raised (12mo)</p>
              <p className="font-bold text-white">${parseFloat(iss.total_raised_12m || 0).toLocaleString()}</p>
              <p className="text-[0.6rem] text-gray-600">of $1,500,000 limit</p>
            </div>
          </div>
        ))}
        {issuers.length === 0 && (
          <div className="text-center py-12 text-gray-500">No issuers registered yet. Click "Register Issuer" to add one.</div>
        )}
      </div>
    </div>
  );
}
