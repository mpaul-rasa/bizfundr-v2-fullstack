import { useState } from 'react';
import { failOffering, emergencyRefund, amendOffering, rechargeWallet, advanceTime } from '../api';
import toast from 'react-hot-toast';
import { Shield, AlertTriangle, Clock, Wallet, FileText } from 'lucide-react';

function ActionCard({ icon: Icon, title, color, children }) {
  return (
    <div className="bg-vault-card rounded-xl border border-vault-border p-5">
      <div className={`flex items-center gap-2 mb-4 ${color}`}><Icon size={18}/><h3 className="font-bold text-sm">{title}</h3></div>
      {children}
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-gray-400 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-vault-bg border border-vault-border rounded-lg px-3 py-2 text-white text-sm focus:border-brand focus:outline-none"/>
    </div>
  );
}

export default function AdminPanel() {
  const [fail, setFail] = useState({ offering_id: '' });
  const [emerg, setEmerg] = useState({ offering_id: '', investor_wallet: '', reason: '' });
  const [amend, setAmend] = useState({ offering_id: '' });
  const [recharge, setRecharge] = useState({ wallet_address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', amount_usdc: '5000' });
  const [time, setTime] = useState({ seconds: '130' });
  const [loading, setLoading] = useState('');

  const act = async (key, fn, data) => {
    setLoading(key);
    try {
      const { data: res } = await fn(data);
      toast.success(res.message || 'Success!');
    } catch {} finally { setLoading(''); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">Admin Panel</h1>
      <p className="text-gray-500 text-sm mb-6">Admin-only operations. Handle with care.</p>

      <div className="grid md:grid-cols-2 gap-4">
        {/* FAIL OFFERING */}
        <ActionCard icon={AlertTriangle} title="Fail Offering (Bulk Refund)" color="text-red-400">
          <p className="text-xs text-gray-500 mb-3">Must be called within 5 business days after the 90-day deadline. Refunds ALL investors automatically.</p>
          <Input label="Offering ID" value={fail.offering_id} onChange={v => setFail({ offering_id: v })} placeholder="1" type="number"/>
          <button onClick={() => act('fail', failOffering, fail)} disabled={loading === 'fail'}
            className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
            {loading === 'fail' ? 'Processing...' : '💥 Fail Offering & Refund All'}
          </button>
        </ActionCard>

        {/* EMERGENCY REFUND */}
        <ActionCard icon={Shield} title="Emergency Refund (Fraud/Suspicious)" color="text-amber-400">
          <p className="text-xs text-gray-500 mb-3">Admin-only. Bypasses 48hr window. Use only for fraud or suspicious activity.</p>
          <Input label="Offering ID" value={emerg.offering_id} onChange={v => setEmerg(p => ({ ...p, offering_id: v }))} placeholder="1" type="number"/>
          <Input label="Investor Wallet" value={emerg.investor_wallet} onChange={v => setEmerg(p => ({ ...p, investor_wallet: v }))} placeholder="0x..."/>
          <Input label="Reason (required, min 10 chars)" value={emerg.reason} onChange={v => setEmerg(p => ({ ...p, reason: v }))} placeholder="Suspected fraudulent identity documents"/>
          <button onClick={() => act('emerg', emergencyRefund, emerg)} disabled={loading === 'emerg' || emerg.reason.length < 10}
            className="w-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
            {loading === 'emerg' ? 'Processing...' : '🚨 Emergency Refund'}
          </button>
        </ActionCard>

        {/* AMEND OFFERING */}
        <ActionCard icon={FileText} title="Amend Offering Document" color="text-purple-400">
          <p className="text-xs text-gray-500 mb-3">When the issuer changes their offering document, this resets ALL investor refund windows to 48 hours from now.</p>
          <Input label="Offering ID" value={amend.offering_id} onChange={v => setAmend({ offering_id: v })} placeholder="1" type="number"/>
          <button onClick={() => act('amend', amendOffering, amend)} disabled={loading === 'amend'}
            className="w-full bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
            {loading === 'amend' ? 'Processing...' : '📄 Trigger Amendment Window'}
          </button>
        </ActionCard>

        {/* TIME ADVANCE */}
        <ActionCard icon={Clock} title="⏩ Advance Blockchain Time (Testing)" color="text-cyan-400">
          <p className="text-xs text-gray-500 mb-3">Hardhat only. Skips blockchain clock forward for testing deadlines.</p>
          <Input label="Seconds to skip" value={time.seconds} onChange={v => setTime({ seconds: v })} placeholder="130" type="number"/>
          <button onClick={() => act('time', advanceTime, time)} disabled={loading === 'time'}
            className="w-full bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
            {loading === 'time' ? 'Advancing...' : `⏩ Skip ${time.seconds}s`}
          </button>
        </ActionCard>

        {/* RECHARGE */}
        <ActionCard icon={Wallet} title="💰 Recharge Wallet (Testing)" color="text-emerald-400">
          <p className="text-xs text-gray-500 mb-3">Send test USDC to any wallet. Hardhat only.</p>
          <Input label="Wallet Address" value={recharge.wallet_address} onChange={v => setRecharge(p => ({ ...p, wallet_address: v }))} placeholder="0x..."/>
          <Input label="Amount (USDC)" value={recharge.amount_usdc} onChange={v => setRecharge(p => ({ ...p, amount_usdc: v }))} placeholder="5000" type="number"/>
          <button onClick={() => act('recharge', rechargeWallet, recharge)} disabled={loading === 'recharge'}
            className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
            {loading === 'recharge' ? 'Sending...' : `💰 Send ${recharge.amount_usdc} USDC`}
          </button>
        </ActionCard>
      </div>
    </div>
  );
}
