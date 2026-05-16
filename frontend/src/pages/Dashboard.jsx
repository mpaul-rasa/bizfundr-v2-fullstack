import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOfferings } from '../api';
import { TrendingUp, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

const STATUS = {
  active: { color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', icon: TrendingUp, label: 'Active' },
  funded: { color: 'text-blue-400 bg-blue-400/10 border-blue-400/20', icon: CheckCircle, label: 'Funded' },
  failed: { color: 'text-red-400 bg-red-400/10 border-red-400/20', icon: XCircle, label: 'Failed' },
  draft: { color: 'text-gray-400 bg-gray-400/10 border-gray-400/20', icon: Clock, label: 'Draft' },
  cancelled: { color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', icon: AlertTriangle, label: 'Cancelled' },
};

export default function Dashboard() {
  const [offerings, setOfferings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOfferings().then(r => setOfferings(r.data.offerings || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-20 text-gray-500">Loading offerings...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Offerings Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">{offerings.length} offering{offerings.length !== 1 ? 's' : ''} total</p>
        </div>
        <Link to="/create" className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
          + New Offering
        </Link>
      </div>

      {offerings.length === 0 ? (
        <div className="text-center py-20 bg-vault-card rounded-xl border border-vault-border">
          <p className="text-gray-400 text-lg">No offerings yet</p>
          <p className="text-gray-600 text-sm mt-1">Create your first offering to get started</p>
          <Link to="/create" className="inline-block mt-4 bg-brand text-white px-5 py-2 rounded-lg text-sm font-semibold">Create Offering</Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {offerings.map(o => {
            const s = STATUS[o.status] || STATUS.draft;
            const pct = o.max_cap_usdc > 0 ? Math.min(100, (parseFloat(o.min_goal_usdc) / parseFloat(o.max_cap_usdc)) * 100) : 0;
            return (
              <Link key={o.id} to={`/offering/${o.id}`} className="bg-vault-card rounded-xl border border-vault-border p-5 hover:border-brand/30 transition-all group">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-white group-hover:text-brand transition-colors truncate mr-2">{o.title}</h3>
                  <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${s.color}`}>
                    <s.icon size={12}/>{s.label}
                  </span>
                </div>
                <p className="text-gray-500 text-sm mb-3 truncate">{o.company_name}</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Goal: ${parseFloat(o.min_goal_usdc).toLocaleString()} USDC</span>
                    <span>Cap: ${parseFloat(o.max_cap_usdc).toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 bg-vault-border rounded-full overflow-hidden">
                    <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${pct}%` }}/>
                  </div>
                  {o.vault_address && (
                    <p className="text-[0.65rem] text-gray-600 font-mono truncate">Vault: {o.vault_address}</p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
