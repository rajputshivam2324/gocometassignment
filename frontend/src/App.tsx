import { useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  CircleHelp,
  FileText,
  Layers3,
  Menu,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Dashboard from "./pages/Dashboard";
import AuctionPage from "./pages/AuctionPage";
import CreateAuction from "./components/CreateAuction";
import Modal from "./components/Modal";
import type { Auction } from "./lib/types";

export default function App() {
  const [creating, setCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const navigate = useNavigate();

  function created(auction: Auction) {
    setCreating(false);
    navigate(`/rfqs/${auction.id}`, { state: { created: true } });
  }

  return (
    <div className="app-shell">
      {menuOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <Link to="/" className="brand" onClick={() => setMenuOpen(false)}>
          <span className="brand-icon">
            <Layers3 size={23} strokeWidth={2.2} />
          </span>
          <span>
            tender<span className="brand-period">.</span>
          </span>
        </Link>
        <div className="workspace-picker" title="Procurement workspace">
          <span className="workspace-avatar">P</span>
          <span>
            <strong>Procurement</strong>
            <small>Workspace</small>
          </span>
          <ShieldCheck size={14} />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `nav-item ${isActive ? "selected" : ""}`
            }
            onClick={() => setMenuOpen(false)}
          >
            <FileText size={19} />
            RFQ workspace
            <span className="nav-dot" />
          </NavLink>
        </nav>
        <button
          className="sidebar-create"
          onClick={() => {
            setCreating(true);
            setMenuOpen(false);
          }}
        >
          <Plus size={17} />
          Create new RFQ
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-card">
            <span className="sidebar-card-icon">
              <Sparkles size={18} />
            </span>
            <h3>Fair bids. Better outcomes.</h3>
            <p>Give every supplier a fair chance with British auctions.</p>
            <span>
              <ShieldCheck size={13} />
              Transparent by design
            </span>
          </div>
          <div className="sidebar-footer">
            <span className="avatar">PW</span>
            <div>
              <strong>Procurement team</strong>
              <small>Buyer workspace</small>
            </div>
            <span className="team-online" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button menu-button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={22} />
            </button>
            <span className="topbar-title">Workspace</span>
            <span className="topbar-divider">/</span>
            <span>Requests for quotation</span>
          </div>
          <div className="topbar-right">
            <span className="workspace-mode">
              <span />
              Buyer view
            </span>
            <span className="header-separator" />
            <button
              className="icon-button help-button"
              title="About British auctions"
              aria-label="About British auctions"
              onClick={() => setAboutOpen(true)}
            >
              <CircleHelp size={19} />
            </button>
            <span className="avatar header-avatar">PW</span>
          </div>
        </header>
        <main id="main-content">
          <Routes>
            <Route
              path="/"
              element={<Dashboard onCreate={() => setCreating(true)} />}
            />
            <Route path="/rfqs/:id" element={<AuctionPage />} />
            <Route
              path="*"
              element={
                <div className="not-found">
                  <h1>This page isn’t here.</h1>
                  <Link className="button primary" to="/">
                    Back to workspace
                    <ArrowUpRight size={16} />
                  </Link>
                </div>
              }
            />
          </Routes>
        </main>
        <footer className="page-footer">
          <span>
            © {new Date().getFullYear()} Tender. Built for better procurement.
          </span>
          <span>
            <ShieldCheck size={13} />
            Transparent auctions, fair competition
          </span>
        </footer>
      </div>
      {creating && (
        <CreateAuction onClose={() => setCreating(false)} onCreated={created} />
      )}
      {aboutOpen && (
        <Modal
          title="Better competition, by design."
          description="A transparent way to find your best offer."
          onClose={() => setAboutOpen(false)}
        >
          <div className="modal-body about-content">
            <div className="empty-icon">
              <ShieldCheck size={24} />
            </div>
            <p>
              A British auction extends the bidding window when qualifying
              activity happens near closing time. Suppliers can improve their
              quotes until the close; the forced close is always the final
              deadline.
            </p>
            <p>
              This demo uses supplier names to identify bids. All prices are in
              INR and times are displayed in your local timezone.
            </p>
          </div>
          <div className="modal-footer">
            <button
              className="button primary"
              onClick={() => setAboutOpen(false)}
            >
              Got it
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
