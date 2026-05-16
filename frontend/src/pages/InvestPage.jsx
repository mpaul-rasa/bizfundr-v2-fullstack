import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getOffering, invest } from '../api';
import toast from 'react-hot-toast';
import { FileText, AlertTriangle, PenTool, Wallet, CheckCircle, ArrowRight, ArrowLeft, Lock } from 'lucide-react';

const STEPS = [
  { id: 1, title: 'Read Offering Document', subtitle: 'Form 45-110F1', icon: FileText, color: 'text-orange-400' },
  { id: 2, title: 'Acknowledge Risks', subtitle: 'Form 45-110F2', icon: AlertTriangle, color: 'text-red-400' },
  { id: 3, title: 'Sign Subscription Agreement', subtitle: 'Legal Agreement', icon: PenTool, color: 'text-purple-400' },
  { id: 4, title: 'Confirm Investment', subtitle: 'Send USDC', icon: Wallet, color: 'text-emerald-400' },
];

const RISKS = [
  'I understand I could lose ALL of my investment',
  'I understand these securities may not be easily resellable',
  'I am not investing more than $2,500 CAD in this offering',
  'I understand the issuer may not succeed and I accept all risks',
  'I have not been pressured or coerced into making this investment',
  'I understand I have 48 hours to withdraw after signing',
];

export default function InvestPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [offering, setOffering] = useState(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    docConfirmed: false,
    risks: RISKS.map(() => false),
    subscriptionSigned: false,
    investorWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    amount: '',
  });

  useEffect(() => { getOffering(id).then(r => setOffering(r.data.offering)).catch(() => {}); }, [id]);

  if (!offering) return <div className="text-center py-20 text-gray-500">Loading...</div>;

  const allRisksChecked = form.risks.every(Boolean);
  const canProceed = {
    1: form.docConfirmed,
    2: allRisksChecked,
    3: form.subscriptionSigned,
    4: form.amount > 0 && form.investorWallet,
  };

  const handleInvest = async () => {
    setLoading(true);
    try {
      const { data } = await invest({
        offering_id: parseInt(id),
        investor_wallet: form.investorWallet,
        amount_usdc: parseFloat(form.amount),
        risk_acknowledgement_completed: true,
        offering_document_confirmed: true,
        subscription_agreement_signed: true,
        subscription_timestamp: new Date().toISOString(),
      });
      toast.success(`Invested $${form.amount} USDC! Tx: ${data.tx_hash?.substring(0, 16)}...`);
      navigate(`/offering/${id}`);
    } catch {} finally { setLoading(false); }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => navigate(`/offering/${id}`)} className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-sm mb-4"><ArrowLeft size={16}/>Back</button>
      <h1 className="text-xl font-bold text-white mb-1">Invest in: {offering.title}</h1>
      <p className="text-gray-500 text-sm mb-6">Complete all 4 steps to invest. Canadian securities law requires this.</p>

      {/* ═══════ STEP PROGRESS ═══════ */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2 flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
              step > s.id ? 'bg-emerald-500 border-emerald-500 text-white' :
              step === s.id ? 'border-brand text-brand' : 'border-vault-border text-gray-600'
            }`}>{step > s.id ? <CheckCircle size={16}/> : s.id}</div>
            {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 ${step > s.id ? 'bg-emerald-500' : 'bg-vault-border'}`}/>}
          </div>
        ))}
      </div>

      {/* ═══════ STEP 1: OFFERING DOCUMENT (F1) ═══════ */}
      {step === 1 && (
        <div className="bg-vault-card rounded-xl border border-orange-500/20 p-6">
          <div className="flex items-center gap-2 mb-4"><FileText className="text-orange-400"/><h2 className="font-bold text-orange-400 text-lg">Step 1: Read the Offering Document</h2></div>
          <p className="text-gray-400 text-sm mb-4">Form 45-110F1 — The issuer has prepared this document describing their business, financials, risks, and how they plan to use your investment.</p>

          <div className="bg-vault-bg border border-vault-border rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><FileText size={16} className="text-orange-400"/><span className="text-sm text-white">Offering_Document_{offering.title?.replace(/\s/g, '_')}.pdf</span></div>
              <button className="text-xs bg-orange-500/10 text-orange-400 px-3 py-1 rounded border border-orange-500/20 hover:bg-orange-500/20">📥 Download</button>
            </div>
            <p className="text-xs text-gray-600 mt-2">This document contains: business description, use of funds, risk factors, financial statements, founder information, and terms of the offering.</p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer bg-vault-bg rounded-lg p-4 border border-vault-border hover:border-orange-500/30 transition-colors">
            <input type="checkbox" checked={form.docConfirmed} onChange={e => setForm(p => ({ ...p, docConfirmed: e.target.checked }))}
              className="mt-0.5 w-5 h-5 accent-orange-500"/>
            <span className="text-sm text-gray-300">I confirm I have <strong className="text-white">read and understood</strong> the Offering Document (Form 45-110F1) for this investment opportunity.</span>
          </label>
        </div>
      )}

      {/* ═══════ STEP 2: RISK ACKNOWLEDGEMENT (F2) ═══════ */}
      {step === 2 && (
        <div className="bg-vault-card rounded-xl border border-red-500/20 p-6">
          <div className="flex items-center gap-2 mb-4"><AlertTriangle className="text-red-400"/><h2 className="font-bold text-red-400 text-lg">Step 2: Acknowledge the Risks</h2></div>
          <p className="text-gray-400 text-sm mb-4">Form 45-110F2 — You must acknowledge each risk before investing. Check every box.</p>

          <div className="space-y-2">
            {RISKS.map((risk, i) => (
              <label key={i} className="flex items-start gap-3 cursor-pointer bg-vault-bg rounded-lg p-3 border border-vault-border hover:border-red-500/20 transition-colors">
                <input type="checkbox" checked={form.risks[i]} onChange={() => setForm(p => {
                  const r = [...p.risks]; r[i] = !r[i]; return { ...p, risks: r };
                })} className="mt-0.5 w-4 h-4 accent-red-500"/>
                <span className="text-sm text-gray-300">{risk}</span>
              </label>
            ))}
          </div>

          {!allRisksChecked && <p className="text-xs text-red-400 mt-3">⚠️ You must acknowledge ALL risks to proceed</p>}
        </div>
      )}

      {/* ═══════ STEP 3: SUBSCRIPTION AGREEMENT ═══════ */}
      {step === 3 && (
        <div className="bg-vault-card rounded-xl border border-purple-500/20 p-6">
          <div className="flex items-center gap-2 mb-4"><PenTool className="text-purple-400"/><h2 className="font-bold text-purple-400 text-lg">Step 3: Sign Subscription Agreement</h2></div>
          <p className="text-gray-400 text-sm mb-4">This is a binding legal agreement between you and the issuer.</p>

          <div className="bg-vault-bg border border-vault-border rounded-lg p-4 mb-4 text-sm text-gray-400 space-y-2">
            <p>By signing below, I agree to:</p>
            <p>• Subscribe for securities in <strong className="text-white">{offering.title}</strong></p>
            <p>• Invest up to <strong className="text-white">${form.amount || '___'} USDC</strong></p>
            <p>• Accept the terms described in the Offering Document</p>
            <p>• Understand I have <strong className="text-cyan-400">48 hours</strong> from this moment to withdraw</p>
            <p className="text-xs text-gray-600 mt-3">Signing timestamp: {new Date().toISOString()}</p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer bg-vault-bg rounded-lg p-4 border border-vault-border hover:border-purple-500/30 transition-colors">
            <input type="checkbox" checked={form.subscriptionSigned} onChange={e => setForm(p => ({ ...p, subscriptionSigned: e.target.checked }))}
              className="mt-0.5 w-5 h-5 accent-purple-500"/>
            <span className="text-sm text-gray-300">I <strong className="text-white">digitally sign</strong> this Subscription Agreement and understand this starts my 48-hour withdrawal window.</span>
          </label>
        </div>
      )}

      {/* ═══════ STEP 4: CONFIRM INVESTMENT ═══════ */}
      {step === 4 && (
        <div className="bg-vault-card rounded-xl border border-emerald-500/20 p-6">
          <div className="flex items-center gap-2 mb-4"><Wallet className="text-emerald-400"/><h2 className="font-bold text-emerald-400 text-lg">Step 4: Confirm Investment</h2></div>

          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 mb-4 text-sm text-emerald-300 flex items-center gap-2">
            <CheckCircle size={16}/> All compliance forms completed ✅
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Your Wallet Address</label>
              <input type="text" value={form.investorWallet} onChange={e => setForm(p => ({ ...p, investorWallet: e.target.value }))}
                className="w-full bg-vault-bg border border-vault-border rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-emerald-500 focus:outline-none"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Amount (USDC) — max $2,500</label>
              <input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                min="1" max="2500" step="0.01" placeholder="1500"
                className="w-full bg-vault-bg border border-vault-border rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none"/>
            </div>
          </div>

          <div className="mt-4 bg-vault-bg border border-vault-border rounded-lg p-3 text-xs text-gray-500 space-y-1">
            <p>🔒 Your USDC will be locked in the vault smart contract</p>
            <p>⏱️ You have 48 hours to request a refund after investing</p>
            <p>📋 Risk acknowledged, offering document read, subscription signed</p>
          </div>
        </div>
      )}

      {/* ═══════ NAVIGATION ═══════ */}
      <div className="flex items-center justify-between mt-6">
        <button onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}
          className="flex items-center gap-1 text-gray-400 hover:text-white disabled:opacity-30 text-sm"><ArrowLeft size={16}/>Back</button>

        {step < 4 ? (
          <button onClick={() => setStep(s => s + 1)} disabled={!canProceed[step]}
            className="flex items-center gap-1 bg-brand hover:bg-brand-dark disabled:opacity-30 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-semibold">
            Next Step <ArrowRight size={16}/>
          </button>
        ) : (
          <button onClick={handleInvest} disabled={loading || !canProceed[4]}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-30 text-white px-6 py-2.5 rounded-lg text-sm font-bold">
            <Lock size={16}/>{loading ? 'Investing...' : `Invest $${form.amount || '0'} USDC`}
          </button>
        )}
      </div>
    </div>
  );
}
