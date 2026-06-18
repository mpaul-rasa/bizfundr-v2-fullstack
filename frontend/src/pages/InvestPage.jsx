import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { getOffering, invest } from '../api';
import toast from 'react-hot-toast';
import { FileText, AlertTriangle, PenTool, Wallet, CheckCircle, ArrowRight, ArrowLeft, Lock, Unplug, BadgeCheck } from 'lucide-react';

// ── Network config ────────────────────────────────────────────────────────────
// LOCAL DEV  → chainId 31337  (Hardhat)
// TESTNET    → chainId 80002  (Polygon Amoy)  ← switch here when testing live
// PRODUCTION → chainId 137    (Polygon)       ← switch here for mainnet
const REQUIRED_CHAIN = {
  id:        import.meta.env.VITE_CHAIN_ID   ? parseInt(import.meta.env.VITE_CHAIN_ID) : 31337,
  name:      import.meta.env.VITE_CHAIN_NAME || 'Hardhat Local',
  rpcUrl:    import.meta.env.VITE_RPC_URL    || 'http://127.0.0.1:8545',
  symbol:    import.meta.env.VITE_CHAIN_SYMBOL || 'ETH',
  explorer:  import.meta.env.VITE_BLOCK_EXPLORER || '',
};
// ─────────────────────────────────────────────────────────────────────────────

const USDC_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
];
const VAULT_ABI = [
  "function deposit(uint256 amount)",
  "function usdc() view returns (address)",
  "function recordComplianceHash(bytes32 hash)",
];

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
  const [mmConnected, setMmConnected] = useState(false);
  const [mmLoading, setMmLoading] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState(null);
  const [complianceHashTx, setComplianceHashTx] = useState(null);
  const [form, setForm] = useState({
    docConfirmed: false,
    risks: RISKS.map(() => false),
    subscriptionSigned: false,
    investorWallet: '',
    amount: '',
  });

  useEffect(() => { getOffering(id).then(r => setOffering(r.data.offering)).catch(() => {}); }, [id]);

  if (!offering) return <div className="text-center py-20 text-gray-500">Loading...</div>;

  const allRisksChecked = form.risks.every(Boolean);
  const canProceed = {
    1: form.docConfirmed,
    2: allRisksChecked,
    3: !!complianceHashTx,
    4: form.amount > 0 && form.investorWallet && mmConnected,
  };

  // ═══════════ METAMASK CONNECT ═══════════
  const connectMetaMask = async () => {
    if (!window.ethereum) {
      toast.error('MetaMask not installed. Please install it from metamask.io');
      return;
    }
    setMmLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send('eth_requestAccounts', []);

      // ── Chain guard: switch MetaMask to the required network automatically ──
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== REQUIRED_CHAIN.id) {
        const hexChainId = '0x' + REQUIRED_CHAIN.id.toString(16);
        try {
          await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexChainId }] });
        } catch (switchErr) {
          if (switchErr.code === 4902) {
            // Network not in MetaMask yet — add it automatically
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: hexChainId,
                chainName: REQUIRED_CHAIN.name,
                rpcUrls: [REQUIRED_CHAIN.rpcUrl],
                nativeCurrency: { name: REQUIRED_CHAIN.symbol, symbol: REQUIRED_CHAIN.symbol, decimals: 18 },
                blockExplorerUrls: REQUIRED_CHAIN.explorer ? [REQUIRED_CHAIN.explorer] : [],
              }],
            });
          } else {
            throw switchErr;
          }
        }
      }
      // ────────────────────────────────────────────────────────────────────────

      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setForm(p => ({ ...p, investorWallet: address }));
      setMmConnected(true);

      // Load USDC balance from vault's own usdc() pointer
      if (offering?.vault_address) {
        try {
          const vault = new ethers.Contract(offering.vault_address, VAULT_ABI, provider);
          const usdcAddr = await vault.usdc();
          const usdc = new ethers.Contract(usdcAddr, USDC_ABI, provider);
          const bal = await usdc.balanceOf(address);
          setUsdcBalance(parseFloat(ethers.formatUnits(bal, 6)).toFixed(2));
        } catch { /* vault not reachable on this network */ }
      }

      toast.success(`Connected: ${address.slice(0, 6)}...${address.slice(-4)} on ${REQUIRED_CHAIN.name}`);
    } catch (e) {
      toast.error(e.message?.includes('rejected') ? 'MetaMask connection rejected' : (e.message || 'MetaMask error'));
    } finally {
      setMmLoading(false);
    }
  };

  // ═══════════ RECORD COMPLIANCE HASH ON-CHAIN ═══════════
  const handleSignOnChain = async () => {
    if (!window.ethereum || !mmConnected) {
      toast.error('Connect MetaMask first (Step 4)');
      return;
    }
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const subscriptionTimestamp = Math.floor(Date.now() / 1000);

      // Hash = keccak256(investor wallet + offering id + subscription timestamp)
      const hash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'uint256', 'uint256'],
          [form.investorWallet, parseInt(id), subscriptionTimestamp]
        )
      );

      toast.loading('Recording compliance on blockchain...', { id: 'compliance-tx' });
      const vault = new ethers.Contract(offering.vault_address, VAULT_ABI, signer);
      const tx = await vault.recordComplianceHash(hash);
      const receipt = await tx.wait();
      toast.dismiss('compliance-tx');

      setComplianceHashTx(receipt.hash);
      setForm(p => ({ ...p, subscriptionSigned: true }));
      toast.success('Subscription signed on-chain!');
    } catch (e) {
      toast.dismiss('compliance-tx');
      toast.error(e.reason || e.shortMessage || e.message || 'Signing failed');
    } finally {
      setLoading(false);
    }
  };

  // ═══════════ INVEST VIA METAMASK ═══════════
  const handleInvest = async () => {
    if (!window.ethereum || !mmConnected) {
      toast.error('Connect MetaMask first');
      return;
    }
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const amount = ethers.parseUnits(form.amount.toString(), 6);

      // Resolve USDC address from the vault contract itself
      const vaultRo = new ethers.Contract(offering.vault_address, VAULT_ABI, provider);
      const usdcAddress = await vaultRo.usdc();

      // MetaMask popup 1 — Approve USDC spending
      toast.loading('Step 1/2 — Approve USDC in MetaMask...', { id: 'invest-tx' });
      const usdcContract = new ethers.Contract(usdcAddress, USDC_ABI, signer);
      const approveTx = await usdcContract.approve(offering.vault_address, amount);
      await approveTx.wait();

      // MetaMask popup 2 — Deposit into vault
      toast.loading('Step 2/2 — Confirm deposit in MetaMask...', { id: 'invest-tx' });
      const vaultContract = new ethers.Contract(offering.vault_address, VAULT_ABI, signer);
      const depositTx = await vaultContract.deposit(amount);
      const receipt = await depositTx.wait();
      toast.dismiss('invest-tx');

      // Notify backend — compliance record only, blockchain already done
      await invest({
        offering_id: parseInt(id),
        investor_wallet: form.investorWallet,
        amount_usdc: parseFloat(form.amount),
        risk_acknowledgement_completed: true,
        offering_document_confirmed: true,
        subscription_agreement_signed: true,
        subscription_timestamp: new Date().toISOString(),
        tx_hash: receipt.hash,
      });

      toast.success(`Invested $${form.amount} USDC! Tx: ${receipt.hash.slice(0, 16)}...`);
      navigate(`/offering/${id}`);
    } catch (e) {
      toast.dismiss('invest-tx');
      toast.error(e.reason || e.shortMessage || e.message || 'Transaction failed');
    } finally {
      setLoading(false);
    }
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
            <input type="checkbox" checked={form.docConfirmed} onChange={e => setForm(p => ({ ...p, docConfirmed: e.target.checked }))} className="mt-0.5 w-5 h-5 accent-orange-500"/>
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
                <input type="checkbox" checked={form.risks[i]} onChange={() => setForm(p => { const r = [...p.risks]; r[i] = !r[i]; return { ...p, risks: r }; })} className="mt-0.5 w-4 h-4 accent-red-500"/>
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
          {complianceHashTx ? (
            <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle size={18} className="text-emerald-400 shrink-0"/>
              <div>
                <p className="text-sm text-emerald-300 font-medium">Subscription signed on-chain</p>
                <p className="text-xs text-gray-500 font-mono mt-1">Tx: {complianceHashTx.slice(0, 20)}...</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Your signature will be permanently recorded on the blockchain as proof of compliance.</p>
              <button
                onClick={handleSignOnChain}
                disabled={loading || !mmConnected}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg text-sm font-bold w-full justify-center"
              >
                <PenTool size={15}/>
                {loading ? 'Signing...' : 'Sign Subscription Agreement on Blockchain'}
              </button>
              {!mmConnected && (
                <p className="text-xs text-yellow-400">⚠ Connect MetaMask in Step 4 first, then come back to sign</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════ STEP 4: CONFIRM INVESTMENT ═══════ */}
      {step === 4 && (
        <div className="bg-vault-card rounded-xl border border-emerald-500/20 p-6">
          <div className="flex items-center gap-2 mb-4"><Wallet className="text-emerald-400"/><h2 className="font-bold text-emerald-400 text-lg">Step 4: Confirm Investment</h2></div>

          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 mb-4 text-sm text-emerald-300 flex items-center gap-2">
            <CheckCircle size={16}/> All compliance forms completed
          </div>

          {/* MetaMask Connect */}
          {!mmConnected ? (
            <div className="bg-vault-bg border border-yellow-500/30 rounded-lg p-4 mb-4">
              <p className="text-sm text-yellow-300 mb-3 font-medium">Connect your MetaMask wallet to invest directly on-chain.</p>
              <button
                onClick={connectMetaMask}
                disabled={mmLoading}
                className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black px-4 py-2 rounded-lg text-sm font-bold w-full justify-center"
              >
                <Unplug size={16}/>
                {mmLoading ? 'Connecting...' : 'Connect MetaMask'}
              </button>
            </div>
          ) : (
            <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-lg p-3 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-emerald-300">
                <BadgeCheck size={16}/> MetaMask connected
              </div>
              <span className="font-mono text-xs text-gray-400">{form.investorWallet.slice(0, 8)}...{form.investorWallet.slice(-6)}</span>
              {usdcBalance !== null && (
                <span className="text-xs text-gray-400">Balance: <strong className="text-white">${usdcBalance} USDC</strong></span>
              )}
            </div>
          )}

          {/* Amount input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Amount (USDC) — max $2,500</label>
            <input
              type="number"
              value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              min="1" max="2500" step="0.01" placeholder="1500"
              className="w-full bg-vault-bg border border-vault-border rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="mt-4 bg-vault-bg border border-vault-border rounded-lg p-3 text-xs text-gray-500 space-y-1">
            <p>🔒 Two MetaMask popups — approve USDC, then deposit</p>
            <p>⏱️ You have 48 hours to request a refund after investing</p>
            <p>📋 All compliance forms completed and recorded</p>
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
            <Lock size={16}/>{loading ? 'Confirming...' : `Invest $${form.amount || '0'} USDC via MetaMask`}
          </button>
        )}
      </div>
    </div>
  );
}
