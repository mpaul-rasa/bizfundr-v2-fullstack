import { Routes, Route, NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  PlusCircle,
  Wallet,
  Shield,
  Building,
} from "lucide-react";
import Dashboard from "./pages/Dashboard";
import CreateOffering from "./pages/CreateOffering";
import OfferingDetail from "./pages/OfferingDetail";
import InvestPage from "./pages/InvestPage";
import AdminPanel from "./pages/AdminPanel";
import IssuersPage from "./pages/IssuersPage";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/issuers", label: "Issuers", icon: Building },
  { to: "/create", label: "Create Offering", icon: PlusCircle },
  { to: "/admin", label: "Admin", icon: Shield },
];

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-vault-bg">
      <header className="border-b border-vault-border bg-vault-card/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-white font-bold text-sm">
              B
            </div>
            <span className="font-bold text-white text-lg">Bizfundr</span>
            <span className="text-[0.6rem] font-semibold text-brand bg-brand/10 px-2 py-0.5 rounded-full border border-brand/20">
              VAULT
            </span>
          </div>
          <nav className="flex gap-1">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${isActive ? "bg-brand/10 text-brand font-semibold" : "text-gray-400 hover:text-gray-200"}`
                }
              >
                <n.icon size={16} />
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/issuers" element={<IssuersPage />} />
        <Route path="/create" element={<CreateOffering />} />
        <Route path="/offering/:id" element={<OfferingDetail />} />
        <Route path="/invest/:id" element={<InvestPage />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Routes>
    </Layout>
  );
}
