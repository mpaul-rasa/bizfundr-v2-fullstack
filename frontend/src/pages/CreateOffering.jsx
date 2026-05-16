import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createOffering } from '../api';
import toast from 'react-hot-toast';

export default function CreateOffering() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    issuer_id: '1', title: '', description: '', min_goal_usdc: '', max_cap_usdc: '',
    issuer_wallet: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', duration_days: '90',
    confirmed_no_other_platforms: false, acknowledged_lying_is_crime: false,
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.confirmed_no_other_platforms) return toast.error('You must confirm no other active crowdfunding campaigns');
    if (!form.acknowledged_lying_is_crime) return toast.error('You must acknowledge that providing false information is a crime');
    setLoading(true);
    try {
      const { data } = await createOffering(form);
      toast.success(`Offering created! Vault: ${data.vault_address}`);
      navigate(`/offering/${data.offering_id}`);
    } catch {} finally { setLoading(false); }
  };

  const Field = ({ label, name, type = 'text', placeholder, required = true }) => (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      <input type={type} value={form[name]} onChange={e => set(name, e.target.value)} placeholder={placeholder}
        required={required} className="w-full bg-vault-bg border border-vault-border rounded-lg px-3 py-2 text-white text-sm focus:border-brand focus:outline-none"/>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">Create New Offering</h1>
      <p className="text-gray-500 text-sm mb-6">Deploy a vault smart contract for a new crowdfunding campaign</p>

      <form onSubmit={submit} className="space-y-6">
        <div className="bg-vault-card rounded-xl border border-vault-border p-6 space-y-4">
          <h2 className="font-bold text-white">Offering Details</h2>
          <Field label="Title" name="title" placeholder="e.g., TechStartup Series A"/>
          <Field label="Description" name="description" placeholder="Brief description..." required={false}/>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Minimum Goal (USDC)" name="min_goal_usdc" type="number" placeholder="1000"/>
            <Field label="Maximum Cap (USDC)" name="max_cap_usdc" type="number" placeholder="10000"/>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Issuer Wallet Address" name="issuer_wallet" placeholder="0x..."/>
            <Field label="Duration (days, max 90)" name="duration_days" type="number" placeholder="90"/>
          </div>
          <Field label="Issuer ID" name="issuer_id" type="number" placeholder="1"/>
        </div>

        {/* ═══════ ISSUER COMPLIANCE ═══════ */}
        <div className="bg-vault-card rounded-xl border border-red-500/20 p-6 space-y-4">
          <h2 className="font-bold text-red-400">⚠️ Issuer Compliance (Required)</h2>
          <p className="text-sm text-gray-400">Canadian Securities Law — National Instrument 45-110</p>

          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4 text-sm text-amber-200">
            <p className="font-semibold mb-1">$1,500,000 CAD Limit</p>
            <p className="text-gray-400">Maximum raise per issuer group in any 12-month period across ALL platforms.</p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={form.confirmed_no_other_platforms} onChange={e => set('confirmed_no_other_platforms', e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-brand"/>
            <span className="text-sm text-gray-300">I confirm this issuer does <strong>NOT</strong> have any other active crowdfunding campaigns on any platform.</span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={form.acknowledged_lying_is_crime} onChange={e => set('acknowledged_lying_is_crime', e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-red-500"/>
            <span className="text-sm text-gray-300">I acknowledge that <strong className="text-red-400">providing false information is a criminal offence</strong> under Canadian securities law.</span>
          </label>
        </div>

        <button type="submit" disabled={loading}
          className="w-full bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors">
          {loading ? 'Deploying Vault...' : '🚀 Create Offering & Deploy Vault'}
        </button>
      </form>
    </div>
  );
}
