import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Gavel,
  IndianRupee,
  Info,
  Plus,
  ShieldCheck,
  TimerReset,
  Users,
} from "lucide-react";
import { usePolling } from "../lib/api";
import {
  auctionStatus,
  dateTime,
  money,
  shortDate,
  triggerLabels,
} from "../lib/format";
import type { AuctionDetail } from "../lib/types";
import {
  Countdown,
  ErrorMessage,
  LiveIndicator,
  LoadingState,
  StatCard,
  StatusBadge,
  SuccessNotice,
} from "../components/Shared";
import QuoteTable from "../components/QuoteTable";
import AuctionActivity from "../components/AuctionActivity";
import SubmitQuote from "../components/SubmitQuote";

export default function AuctionPage() {
  const { id } = useParams();
  const location = useLocation();
  const {
    data: auction,
    setData,
    loading,
    error,
    updatedAt,
    refresh,
  } = usePolling<AuctionDetail>(`/auctions/${encodeURIComponent(id || "")}`);
  const [quoting, setQuoting] = useState(false);
  const [notice, setNotice] = useState<string | null>(
    location.state?.created
      ? "Your RFQ is ready. Suppliers can submit quotes when bidding opens."
      : null,
  );

  if (loading)
    return (
      <div className="page">
        <LoadingState />
      </div>
    );
  if (!auction)
    return (
      <div className="page">
        <Link to="/" className="back-link">
          <ArrowLeft size={15} />
          Back to RFQs
        </Link>
        {error && (
          <ErrorMessage message={error} onRetry={() => void refresh()} />
        )}
      </div>
    );
  const status = auctionStatus(auction);
  const active = status === "active";
  const scheduled = status === "scheduled";
  const completed = status === "closed" || status === "force_closed";

  return (
    <div className="page detail-page">
      <div className="detail-breadcrumb">
        <Link to="/">
          <ArrowLeft size={15} />
          All RFQs
        </Link>
        <ChevronRight size={13} />
        <span>{auction.reference_id}</span>
      </div>
      <div className="page-heading detail-heading">
        <div>
          <div className="detail-eyebrow">
            <span className="eyebrow">REQUEST FOR QUOTATION</span>
            <StatusBadge status={status} />
          </div>
          <h1>{auction.name}</h1>
          <p>
            <span>{auction.reference_id}</span>
            <span className="text-dot">·</span>
            <CalendarDays size={14} />
            Service date: {shortDate(auction.service_date)}
          </p>
        </div>
        <button
          className="button primary"
          disabled={!active}
          onClick={() => setQuoting(true)}
        >
          {completed ? <CheckCircle2 size={17} /> : <Plus size={18} />}
          {completed
            ? "Bidding closed"
            : scheduled
              ? "Bidding opens soon"
              : "Submit quote"}
        </button>
      </div>
      {notice && (
        <div className="notice-row">
          <SuccessNotice>{notice}</SuccessNotice>
          <button
            className="text-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice(null)}
          >
            Dismiss
          </button>
        </div>
      )}
      {error && <ErrorMessage message={error} onRetry={() => void refresh()} />}
      <div className={`auction-clock-banner ${completed ? "ended" : ""}`}>
        <div className="clock-banner-left">
          <span className="clock-symbol">
            {completed ? <CheckCircle2 size={24} /> : <Clock3 size={24} />}
          </span>
          <div>
            <strong>
              {completed
                ? "This bidding round is complete"
                : scheduled
                  ? "A new opportunity is on the way"
                  : "The auction is live. Every offer counts."}
            </strong>
            <p>
              {completed
                ? "Review the final supplier rankings and quote details below."
                : scheduled
                  ? `Bidding opens ${dateTime(auction.start_time)}.`
                  : auction.british_auction
                    ? "Qualifying activity near closing may extend the auction."
                    : "Submit your best offer before the bidding window closes."}
            </p>
          </div>
        </div>
        {completed ? (
          <div className="closed-time">
            <span>FINAL CLOSE TIME</span>
            <strong>{dateTime(auction.close_time)}</strong>
          </div>
        ) : (
          <Countdown
            target={scheduled ? auction.start_time : auction.close_time}
            label={scheduled ? "BIDDING STARTS IN" : "BIDDING CLOSES IN"}
          />
        )}
      </div>
      <div className="stats-grid detail-stats">
        <StatCard
          label="Lowest quote"
          value={money(auction.lowest_bid)}
          caption={
            auction.bids[0]
              ? auction.bids[0].supplier_name
              : "Awaiting the first quote"
          }
          icon={<IndianRupee size={19} />}
          variant="accent"
        />
        <StatCard
          label="Participating suppliers"
          value={String(auction.supplier_count).padStart(2, "0")}
          caption="Competing for your business"
          icon={<Users size={19} />}
        />
        <StatCard
          label="Quotes received"
          value={String(auction.bid_count).padStart(2, "0")}
          caption="Including revised offers"
          icon={<Gavel size={19} />}
        />
        <StatCard
          label="Time extensions"
          value={String(auction.extension_count).padStart(2, "0")}
          caption={
            auction.british_auction
              ? `${auction.extension_minutes} minutes per qualifying event`
              : "Automatic extensions disabled"
          }
          icon={<TimerReset size={19} />}
        />
      </div>
      <div className="detail-layout">
        <div className="detail-main">
          <section className="panel supplier-panel">
            <div className="panel-heading">
              <div>
                <div className="panel-title">
                  <h2>Supplier rankings</h2>
                  <span className="count-pill">{auction.supplier_count}</span>
                </div>
                <p>Latest quotes, ranked from lowest to highest.</p>
              </div>
              <LiveIndicator updatedAt={updatedAt} error={!!error} />
            </div>
            <QuoteTable bids={auction.bids} />
            {auction.bids.length > 0 && (
              <div className="table-footer">
                <span>
                  <Info size={13} />
                  Expand a quote to see the charge breakdown.
                </span>
                <span>All amounts in INR</span>
              </div>
            )}
          </section>
          <AuctionActivity activity={auction.activity} />
        </div>
        <aside className="detail-aside">
          <section className="panel config-panel">
            <div className="panel-heading">
              <div className="panel-title">
                <ShieldCheck size={18} />
                <h2>Auction rules</h2>
              </div>
            </div>
            <div className="config-body">
              <div className="config-type">
                <span className="config-type-icon">
                  <Gavel size={21} />
                </span>
                <div>
                  <strong>
                    {auction.british_auction
                      ? "British auction"
                      : "Standard RFQ"}
                  </strong>
                  <small>
                    {auction.british_auction
                      ? "Automatic extensions enabled"
                      : "Fixed bidding deadline"}
                  </small>
                </div>
                <span
                  className={`enabled-dot ${auction.british_auction ? "" : "disabled"}`}
                />
              </div>
              {auction.british_auction && (
                <>
                  <dl className="config-list">
                    <div>
                      <dt>Trigger window</dt>
                      <dd>{auction.trigger_window_minutes} minutes</dd>
                    </div>
                    <div>
                      <dt>Extension duration</dt>
                      <dd>{auction.extension_minutes} minutes</dd>
                    </div>
                  </dl>
                  <div className="trigger-rule">
                    <span>EXTENSION TRIGGER</span>
                    <p>
                      <ArrowUpRight size={16} />
                      {triggerLabels[auction.extension_trigger]}
                    </p>
                  </div>
                </>
              )}
              <div className="config-safety">
                <ShieldCheck size={16} />
                <p>
                  The auction will never extend beyond its forced close time.
                </p>
              </div>
            </div>
          </section>
          <section className="panel schedule-panel">
            <div className="panel-heading">
              <div className="panel-title">
                <CalendarDays size={17} />
                <h2>The schedule</h2>
              </div>
            </div>
            <div className="schedule-list">
              <div>
                <span className="schedule-dot" />
                <span>
                  Bid opens<strong>{dateTime(auction.start_time)}</strong>
                </span>
              </div>
              <div className="current">
                <span className="schedule-dot" />
                <span>
                  Current bid close
                  <strong>{dateTime(auction.close_time)}</strong>
                  {auction.extension_count > 0 && (
                    <small>
                      Extended {auction.extension_count} time
                      {auction.extension_count !== 1 ? "s" : ""}
                    </small>
                  )}
                </span>
              </div>
              <div className="forced">
                <span className="schedule-dot" />
                <span>
                  Forced close
                  <strong>{dateTime(auction.forced_close_time)}</strong>
                  <small>Final, non-extendable deadline</small>
                </span>
              </div>
            </div>
            <div className="schedule-footer">
              <Clock3 size={13} />
              Times shown in your local timezone
            </div>
          </section>
          <div className="detail-note">
            <FileText size={17} />
            <p>
              Quotes are transparent. Suppliers can revise their own offer by
              submitting a lower total.
            </p>
          </div>
        </aside>
      </div>
      {quoting && (
        <SubmitQuote
          auction={auction}
          onClose={() => setQuoting(false)}
          onSubmitted={(updated) => {
            setData(updated);
            setQuoting(false);
            setNotice(
              "Quote submitted successfully. Supplier rankings are up to date.",
            );
            void refresh();
          }}
        />
      )}
    </div>
  );
}
