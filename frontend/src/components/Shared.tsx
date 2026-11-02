import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Clock3,
  Gavel,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { statusLabels } from "../lib/format";
import type { AuctionStatus } from "../lib/types";

export function StatusBadge({ status }: { status: AuctionStatus }) {
  return (
    <span className={`status-badge ${status}`}>
      <span />
      {statusLabels[status]}
    </span>
  );
}

export function ErrorMessage({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="error-message" role="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
      {onRetry && (
        <button className="text-button" onClick={onRetry}>
          <RefreshCw size={14} /> Try again
        </button>
      )}
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="loading-state" role="status">
      <Loader2 className="spin" size={25} />
      <span>Loading your workspace…</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Gavel size={25} strokeWidth={1.6} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  caption,
  icon,
  variant = "",
}: {
  label: string;
  value: ReactNode;
  caption: string;
  icon: ReactNode;
  variant?: string;
}) {
  return (
    <div className={`stat-card ${variant}`}>
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <div className="stat-caption">
        {variant === "accent" ? <ArrowUpRight size={14} /> : null}
        {caption}
      </div>
    </div>
  );
}

export function LiveIndicator({
  updatedAt,
  error,
}: {
  updatedAt: Date | null;
  error?: boolean;
}) {
  return (
    <span
      className={`live-indicator ${error ? "offline" : ""}`}
      title={
        updatedAt
          ? `Last synced ${updatedAt.toLocaleTimeString()}. Updates every 5 seconds.`
          : "Connecting to the API"
      }
    >
      <span />
      {error
        ? "Connection interrupted"
        : updatedAt
          ? "Live updates"
          : "Connecting"}
    </span>
  );
}

export function Countdown({
  target,
  label,
  compact = false,
}: {
  target: string;
  label: string;
  compact?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((Date.parse(target) - now) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const value = `${days > 0 ? `${days}d ` : ""}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return (
    <div className={compact ? "countdown compact" : "countdown"}>
      <span className="countdown-label">
        <Clock3 size={14} />
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

export function SuccessNotice({ children }: { children: ReactNode }) {
  return (
    <div className="success-notice" role="status">
      <Check size={18} />
      {children}
    </div>
  );
}
