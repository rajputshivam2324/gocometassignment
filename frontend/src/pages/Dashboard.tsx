import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCheck,
  ChevronRight,
  FileText,
  Gavel,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  Users,
  X,
} from "lucide-react";
import { usePolling } from "../lib/api";
import { auctionStatus, dateTime, money, shortDate } from "../lib/format";
import type { Auction } from "../lib/types";
import {
  EmptyState,
  ErrorMessage,
  LiveIndicator,
  LoadingState,
  StatCard,
  StatusBadge,
} from "../components/Shared";

type Filter = "all" | "active" | "scheduled" | "completed";

export default function Dashboard({ onCreate }: { onCreate: () => void }) {
  const { data, loading, error, updatedAt, refresh } =
    usePolling<Auction[]>("/auctions");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState("newest");
  const auctions = useMemo(
    () =>
      (data || []).map((item) => ({ ...item, status: auctionStatus(item) })),
    [data],
  );
  const counts = {
    all: auctions.length,
    active: auctions.filter((a) => a.status === "active").length,
    scheduled: auctions.filter((a) => a.status === "scheduled").length,
    completed: auctions.filter(
      (a) => a.status === "closed" || a.status === "force_closed",
    ).length,
  };
  const totalBids = auctions.reduce((sum, a) => sum + a.bid_count, 0);
  const visible = auctions
    .filter(
      (auction) =>
        (filter === "all" ||
          (filter === "completed"
            ? ["closed", "force_closed"].includes(auction.status)
            : auction.status === filter)) &&
        `${auction.name} ${auction.reference_id}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "closing"
        ? Date.parse(a.close_time) - Date.parse(b.close_time)
        : Date.parse(b.created_at) - Date.parse(a.created_at),
    );

  return (
    <div className="page dashboard-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR PROCUREMENT, IN FOCUS</div>
          <h1>
            RFQ workspace<span className="heading-dot">.</span>
          </h1>
          <p>Manage your auctions. Discover your best offer.</p>
        </div>
        <button className="button primary" onClick={onCreate}>
          <Plus size={18} />
          Create RFQ
        </button>
      </div>
      <div className="stats-grid">
        <StatCard
          label="Total RFQs"
          value={loading ? "—" : counts.all.toString().padStart(2, "0")}
          caption="Across your workspace"
          icon={<FileText size={19} />}
        />
        <StatCard
          label="Active auctions"
          value={loading ? "—" : counts.active.toString().padStart(2, "0")}
          caption="Open for supplier quotes"
          icon={<Gavel size={19} />}
          variant="accent"
        />
        <StatCard
          label="Total quotes"
          value={loading ? "—" : totalBids.toString().padStart(2, "0")}
          caption="Every offer, every improvement"
          icon={<ArrowDownLeft size={19} />}
        />
        <StatCard
          label="Completed RFQs"
          value={loading ? "—" : counts.completed.toString().padStart(2, "0")}
          caption="Closed bidding rounds"
          icon={<CheckCheck size={19} />}
        />
      </div>
      <div className="auctions-panel panel">
        <div className="panel-heading">
          <div className="panel-title">
            <h2>Your RFQs</h2>
            <span className="count-pill">{counts.all}</span>
          </div>
          <LiveIndicator updatedAt={updatedAt} error={!!error} />
        </div>
        <div className="filter-toolbar">
          <div className="tabs" aria-label="Filter RFQs by status">
            {(
              [
                ["all", "All RFQs"],
                ["active", "Active"],
                ["scheduled", "Scheduled"],
                ["completed", "Completed"],
              ] as const
            ).map(([key, label]) => (
              <button
                className={filter === key ? "active" : ""}
                key={key}
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
              >
                {label}
                <span>{counts[key]}</span>
              </button>
            ))}
          </div>
          <div className="table-tools">
            <div className="search-field">
              <Search size={16} />
              <input
                aria-label="Search RFQs"
                placeholder="Search RFQs…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button
                  className="icon-button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <label className="sort-control">
              <SlidersHorizontal size={15} />
              <select
                aria-label="Sort RFQs"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="newest">Newest first</option>
                <option value="closing">Closing soon</option>
              </select>
            </label>
          </div>
        </div>
        {error && (
          <div className="panel-error">
            <ErrorMessage message={error} onRetry={() => void refresh()} />
          </div>
        )}
        {loading ? (
          <LoadingState />
        ) : data && visible.length ? (
          <>
            <div className="table-scroll">
              <table className="rfq-table">
                <thead>
                  <tr>
                    <th>RFQ NAME / REFERENCE</th>
                    <th>LOWEST QUOTE</th>
                    <th>BID CLOSE TIME</th>
                    <th>FORCED CLOSE</th>
                    <th>STATUS</th>
                    <th aria-label="Open RFQ" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((auction) => (
                    <tr key={auction.id}>
                      <td>
                        <Link to={`/rfqs/${auction.id}`} className="rfq-name">
                          <span className="row-icon">
                            <FileText size={18} strokeWidth={1.7} />
                          </span>
                          <span>
                            <strong>{auction.name}</strong>
                            <small>{auction.reference_id}</small>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <strong className="table-money">
                          {money(auction.lowest_bid)}
                        </strong>
                        <small>
                          {auction.bid_count
                            ? `${auction.bid_count} quote${auction.bid_count !== 1 ? "s" : ""} · ${auction.supplier_count} supplier${auction.supplier_count !== 1 ? "s" : ""}`
                            : "Awaiting first quote"}
                        </small>
                      </td>
                      <td>
                        <span className="table-date">
                          {shortDate(auction.close_time)}
                        </span>
                        <small>
                          {new Date(auction.close_time).toLocaleTimeString(
                            "en-IN",
                            { hour: "2-digit", minute: "2-digit" },
                          )}
                          {auction.extension_count > 0 && (
                            <span
                              className="extension-dot"
                              title={`${auction.extension_count} extensions`}
                            />
                          )}
                        </small>
                      </td>
                      <td>
                        <span className="table-date">
                          {shortDate(auction.forced_close_time)}
                        </span>
                        <small>
                          {new Date(
                            auction.forced_close_time,
                          ).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </small>
                      </td>
                      <td>
                        <StatusBadge status={auction.status} />
                      </td>
                      <td>
                        <Link
                          className="row-open"
                          to={`/rfqs/${auction.id}`}
                          aria-label={`View ${auction.name}`}
                        >
                          <ArrowUpRight size={18} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>
                Showing {visible.length} of {auctions.length} RFQs
              </span>
              <span>
                <span className="tiny-dot" />
                All times in your local timezone
              </span>
            </div>
          </>
        ) : (
          data && (
            <EmptyState
              title={
                query || filter !== "all"
                  ? "No RFQs match your filters"
                  : "Your next great deal starts here"
              }
              description={
                query || filter !== "all"
                  ? "Try a different search or status to find the RFQ you’re looking for."
                  : "Create your first RFQ, collect competitive supplier quotes, and let fair competition do the rest."
              }
              action={
                query || filter !== "all" ? (
                  <button
                    className="button secondary"
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                    }}
                  >
                    Clear filters
                  </button>
                ) : (
                  <button className="button primary" onClick={onCreate}>
                    <Plus size={16} />
                    Create your first RFQ
                  </button>
                )
              }
            />
          )
        )}
      </div>
      <div className="dashboard-bottom">
        <div className="fairness-banner">
          <div className="banner-icon">
            <ShieldCheck size={28} strokeWidth={1.5} />
          </div>
          <div>
            <span className="eyebrow">A LEVEL PLAYING FIELD</span>
            <h3>Better offers deserve a little more time.</h3>
            <p>
              British auctions automatically extend when competition heats up,
              with a firm final deadline.
            </p>
          </div>
          <span className="banner-decoration">
            <Timer size={58} strokeWidth={1} />
          </span>
        </div>
        <div className="workflow-card">
          <span className="eyebrow">A SIMPLE WAY TO SOURCE</span>
          <div>
            <span>
              <FileText size={15} />
              Create RFQ
            </span>
            <ChevronRight size={14} />
            <span>
              <Users size={15} />
              Collect quotes
            </span>
            <ChevronRight size={14} />
            <span>
              <CheckCheck size={15} />
              Compare
            </span>
          </div>
          <button className="text-button" onClick={onCreate}>
            Start a new sourcing round
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
      <div className="workspace-caption">
        <CalendarDays size={14} />
        {dateTime(new Date().toISOString()).split(",")[0]}
        <span>•</span>Everything you need for your next sourcing decision.
      </div>
    </div>
  );
}
