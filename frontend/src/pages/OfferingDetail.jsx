import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getOffering, getHistory, release, failOffering } from "../api";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Clock,
  Users,
  Target,
  Wallet,
  Rocket,
  AlertTriangle,
} from "lucide-react";

export default function OfferingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([
      getOffering(id).then((r) => setData(r.data)),
      getHistory(id)
        .then((r) => setHistory(r.data.history || []))
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [id]);

  if (loading)
    return <div className="text-center py-20 text-gray-500">Loading...</div>;
  if (!data?.offering)
    return (
      <div className="text-center py-20 text-red-400">Offering not found</div>
    );

  const o = data.offering;
  const v = data.vault;
  const inv = data.investments || [];

  // ═══════ ACTION HANDLERS ═══════
  const handleRelease = async () => {
    if (
      !confirm(
        `Release ${v.total_deposited_usdc} USDC to issuer ${o.issuer_wallet}?\n\nThis is PERMANENT and cannot be undone.`,
      )
    )
      return;
    setActionLoading("release");
    try {
      const { data: res } = await release({
        offering_id: parseInt(id),
        issuer_wallet: o.issuer_wallet,
      });
      toast.success(res.message || "Funds released to issuer!");
      load();
    } catch {
    } finally {
      setActionLoading("");
    }
  };

  const handleFail = async () => {
    if (
      !confirm(
        `Fail this offering and refund ALL ${v.investor_count} investor(s)?\n\nThis is PERMANENT and cannot be undone.`,
      )
    )
      return;
    setActionLoading("fail");
    try {
      const { data: res } = await failOffering({ offering_id: parseInt(id) });
      toast.success(res.message || "Offering failed, all investors refunded!");
      load();
    } catch {
    } finally {
      setActionLoading("");
    }
  };

  // ═══════ DETERMINE WHICH BUTTONS TO SHOW ═══════
  const canInvest = v?.is_active && !v?.deadline_passed;
  const canRelease = v?.is_active && v?.deadline_passed && v?.goal_reached;
  const canFail = v?.is_active && v?.deadline_passed && !v?.goal_reached;
  const isFinished = v?.is_released || v?.is_failed;

  const Stat = ({ icon: Icon, label, value, color = "text-white" }) => (
    <div className="bg-vault-bg rounded-lg p-4 border border-vault-border">
      <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
        <Icon size={14} />
        {label}
      </div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );

  return (
    <div>
      <Link
        to="/"
        className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-sm mb-4"
      >
        <ArrowLeft size={16} />
        Back
      </Link>

      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{o.title}</h1>
          <p className="text-gray-500 text-sm">
            {o.company_name} · Status:{" "}
            <span className="font-semibold text-brand">
              {o.status.toUpperCase()}
            </span>
          </p>
        </div>
        <div className="flex flex-col gap-2 items-end">
          {canInvest && (
            <Link
              to={`/invest/${id}`}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-bold whitespace-nowrap"
            >
              💰 Invest Now
            </Link>
          )}
          {canRelease && (
            <button
              onClick={handleRelease}
              disabled={actionLoading === "release"}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-bold whitespace-nowrap"
            >
              <Rocket size={16} />
              {actionLoading === "release"
                ? "Releasing..."
                : "Release Funds to Issuer"}
            </button>
          )}
          {canFail && (
            <button
              onClick={handleFail}
              disabled={actionLoading === "fail"}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-bold whitespace-nowrap"
            >
              <AlertTriangle size={16} />
              {actionLoading === "fail"
                ? "Failing..."
                : "Fail Offering & Refund All"}
            </button>
          )}
          {isFinished && (
            <span
              className={`px-4 py-2 rounded-lg text-sm font-bold ${v.is_released ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}
            >
              {v.is_released ? "✅ FUNDED" : "❌ FAILED"} · CLOSED
            </span>
          )}
        </div>
      </div>

      {/* ═══════ STATUS BANNER (helpful guidance) ═══════ */}
      {v && !isFinished && (
        <div className="mb-6 p-4 rounded-lg border bg-vault-card border-vault-border">
          {canInvest && (
            <p className="text-sm text-cyan-300">
              🟢 <strong>Active</strong> — Accepting investments. Deadline:{" "}
              {new Date(v.deadline).toLocaleString()}
            </p>
          )}
          {canRelease && (
            <p className="text-sm text-amber-300">
              🟡 <strong>Ready to release</strong> — Deadline passed and goal
              reached (${v.total_deposited_usdc} ≥ ${v.min_goal_usdc}). Click
              "Release Funds" above.
            </p>
          )}
          {canFail && (
            <p className="text-sm text-red-300">
              🔴 <strong>Ready to fail</strong> — Deadline passed but goal NOT
              reached (${v.total_deposited_usdc} &lt; ${v.min_goal_usdc}). Click
              "Fail Offering" above.
            </p>
          )}
          {v.is_active && !v.deadline_passed && (
            <p className="text-xs text-gray-500 mt-1">
              ⏱️ Time remaining until deadline. Use Admin Panel → Advance Time
              to skip forward in testing.
            </p>
          )}
        </div>
      )}

      {/* Vault Stats */}
      {v && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Stat
            icon={Target}
            label="Total Raised"
            value={`$${parseFloat(v.total_deposited_usdc).toLocaleString()}`}
            color="text-emerald-400"
          />
          <Stat
            icon={Target}
            label="Goal"
            value={`$${parseFloat(v.min_goal_usdc).toLocaleString()}`}
          />
          <Stat icon={Users} label="Investors" value={v.investor_count} />
          <Stat
            icon={Clock}
            label="Deadline"
            value={new Date(v.deadline).toLocaleDateString()}
            color={v.deadline_passed ? "text-red-400" : "text-blue-400"}
          />
        </div>
      )}

      {/* Vault Info */}
      {o.vault_address && (
        <div className="bg-vault-card rounded-xl border border-vault-border p-5 mb-6">
          <h2 className="font-bold text-white mb-3 flex items-center gap-2">
            <Wallet size={18} className="text-brand" />
            Vault Contract
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500">Address:</span>{" "}
              <code className="text-brand text-xs">{o.vault_address}</code>
            </div>
            <div>
              <span className="text-gray-500">Issuer:</span>{" "}
              <code className="text-purple-400 text-xs">
                {v?.issuer || o.issuer_wallet}
              </code>
            </div>
            <div>
              <span className="text-gray-500">Status:</span>{" "}
              <span className="font-semibold">{v?.summary || o.status}</span>
            </div>
            <div>
              <span className="text-gray-500">Goal Reached:</span>{" "}
              <span
                className={
                  v?.goal_reached ? "text-emerald-400" : "text-red-400"
                }
              >
                {v?.goal_reached ? "YES ✅" : "NO"}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Remaining:</span> $
              {parseFloat(v?.remaining_capacity_usdc || 0).toLocaleString()}{" "}
              USDC
            </div>
            <div>
              <span className="text-gray-500">Per-Investor Cap:</span> $
              {parseFloat(v?.max_per_investor_usdc || 2500).toLocaleString()}{" "}
              USDC
            </div>
          </div>
        </div>
      )}

      {/* Investments */}
      <div className="bg-vault-card rounded-xl border border-vault-border p-5 mb-6">
        <h2 className="font-bold text-white mb-3">
          Investments ({inv.length})
        </h2>
        {inv.length === 0 ? (
          <p className="text-gray-500 text-sm">No investments yet</p>
        ) : (
          <div className="space-y-2">
            {inv.map((i) => (
              <div
                key={i.id}
                className="flex items-center justify-between bg-vault-bg rounded-lg px-4 py-2 text-sm border border-vault-border"
              >
                <code className="text-gray-400 text-xs">
                  {i.wallet_address}
                </code>
                <span className="text-white font-semibold">
                  ${parseFloat(i.amount_usdc).toLocaleString()}
                </span>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    i.status === "locked"
                      ? "bg-amber-400/10 text-amber-400"
                      : i.status === "funded"
                        ? "bg-emerald-400/10 text-emerald-400"
                        : i.status === "refunded"
                          ? "bg-blue-400/10 text-blue-400"
                          : "bg-red-400/10 text-red-400"
                  }`}
                >
                  {i.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Event History */}
      <div className="bg-vault-card rounded-xl border border-vault-border p-5">
        <h2 className="font-bold text-white mb-3">
          On-Chain Event History ({history.length})
        </h2>
        {history.length === 0 ? (
          <p className="text-gray-500 text-sm">No events yet</p>
        ) : (
          <div className="space-y-1">
            {history.map((e, i) => (
              <div
                key={i}
                className="flex items-center gap-3 text-xs bg-vault-bg rounded px-3 py-2 border border-vault-border"
              >
                <span
                  className={`font-bold w-20 ${
                    e.type === "deposit"
                      ? "text-emerald-400"
                      : e.type === "refund"
                        ? "text-blue-400"
                        : e.type === "release"
                          ? "text-amber-400"
                          : e.type === "fail"
                            ? "text-red-400"
                            : "text-purple-400"
                  }`}
                >
                  {e.type.toUpperCase()}
                </span>
                <span className="text-gray-400 font-mono">
                  {e.tx_hash?.substring(0, 16)}...
                </span>
                {e.amount_usdc && (
                  <span className="text-white font-semibold">
                    ${e.amount_usdc}
                  </span>
                )}
                {e.investor && (
                  <span className="text-gray-500">
                    {e.investor.substring(0, 10)}...
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
