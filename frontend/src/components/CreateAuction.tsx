import { useCallback, useState, type FormEvent } from "react";
import { ArrowRight, Info, Loader2, ShieldCheck, Timer } from "lucide-react";
import Modal from "./Modal";
import { ErrorMessage } from "./Shared";
import { request } from "../lib/api";
import { localDateTime } from "../lib/format";
import type { Auction, AuctionInput, ExtensionTrigger } from "../lib/types";

interface Props {
  onClose: () => void;
  onCreated: (auction: Auction) => void;
}

export default function CreateAuction({ onClose, onCreated }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [british, setBritish] = useState(true);
  const close = useCallback(onClose, [onClose]);
  const [defaults] = useState(() => {
    const now = new Date();
    return {
      start: localDateTime(now),
      close: localDateTime(new Date(+now + 3600000)),
      forced: localDateTime(new Date(+now + 7200000)),
      service: new Date(+now + 86400000).toISOString().slice(0, 10),
    };
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) || "").trim();
    const start = new Date(value("start_time"));
    const end = new Date(value("close_time"));
    const forced = new Date(value("forced_close_time"));
    if (+start >= +end) {
      setError("Bid close time must be later than the start time.");
      return;
    }
    if (+end >= +forced) {
      setError("Forced close time must be later than the bid close time.");
      return;
    }
    if (value("service_date") < start.toISOString().slice(0, 10)) {
      setError("Service date must be on or after the bid start date (UTC).");
      return;
    }
    const input: AuctionInput = {
      name: value("name"),
      reference_id: value("reference_id"),
      start_time: start.toISOString(),
      close_time: end.toISOString(),
      forced_close_time: forced.toISOString(),
      service_date: value("service_date"),
      british_auction: british,
      trigger_window_minutes: british
        ? Number(value("trigger_window_minutes"))
        : 10,
      extension_minutes: british ? Number(value("extension_minutes")) : 5,
      extension_trigger: british
        ? (value("extension_trigger") as ExtensionTrigger)
        : "bid_received",
    };
    if (!input.name || !input.reference_id) {
      setError("Enter an RFQ name and reference ID.");
      return;
    }
    setBusy(true);
    try {
      onCreated(
        await request<Auction>("/auctions", {
          method: "POST",
          body: JSON.stringify(input),
        }),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to create RFQ.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Create a new RFQ"
      description="Set your schedule. Invite competitive quotes. Find your best deal."
      onClose={close}
      busy={busy}
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          {error && <ErrorMessage message={error} />}
          <div className="form-section-title">
            <span>01</span>
            <h3>RFQ details</h3>
          </div>
          <div className="form-grid">
            <label className="field">
              RFQ name{" "}
              <input
                name="name"
                placeholder="e.g. Mumbai to Singapore — Ocean freight"
                required
                maxLength={200}
              />
            </label>
            <label className="field">
              Reference ID{" "}
              <input
                name="reference_id"
                placeholder="e.g. RFQ-2026-001"
                required
                maxLength={100}
              />
            </label>
          </div>
          <div className="form-section-title">
            <span>02</span>
            <h3>Auction schedule</h3>
            <small>Times in your local timezone</small>
          </div>
          <div className="form-grid">
            <label className="field">
              Bid start date & time{" "}
              <input
                type="datetime-local"
                name="start_time"
                defaultValue={defaults.start}
                required
              />
            </label>
            <label className="field">
              Bid close date & time{" "}
              <input
                type="datetime-local"
                name="close_time"
                defaultValue={defaults.close}
                required
              />
            </label>
            <label className="field">
              Forced close date & time{" "}
              <input
                type="datetime-local"
                name="forced_close_time"
                defaultValue={defaults.forced}
                required
              />
              <small>The final deadline, even if bidding is extended.</small>
            </label>
            <label className="field">
              Pickup / service date{" "}
              <input
                type="date"
                name="service_date"
                defaultValue={defaults.service}
                required
              />
            </label>
          </div>
          <div className="auction-toggle">
            <div className="toggle-icon">
              <Timer size={21} />
            </div>
            <div>
              <strong>British auction</strong>
              <p>Keep competition fair with automatic time extensions.</p>
            </div>
            <button
              type="button"
              className={`switch ${british ? "on" : ""}`}
              role="switch"
              aria-checked={british}
              aria-label="Enable British auction"
              onClick={() => setBritish(!british)}
            >
              <span />
            </button>
          </div>
          {british && (
            <div className="auction-options">
              <div className="form-grid">
                <label className="field">
                  Trigger window{" "}
                  <div className="input-with-unit">
                    <input
                      type="number"
                      name="trigger_window_minutes"
                      min="1"
                      max="2147483647"
                      step="1"
                      defaultValue="10"
                      required
                    />
                    <span>minutes</span>
                  </div>
                  <small>Monitor activity before the auction closes.</small>
                </label>
                <label className="field">
                  Extension duration{" "}
                  <div className="input-with-unit">
                    <input
                      type="number"
                      name="extension_minutes"
                      min="1"
                      max="2147483647"
                      step="1"
                      defaultValue="5"
                      required
                    />
                    <span>minutes</span>
                  </div>
                  <small>Extra time added when a trigger occurs.</small>
                </label>
              </div>
              <label className="field">
                Extend the auction when
                <select name="extension_trigger" defaultValue="bid_received">
                  <option value="bid_received">Any bid is received</option>
                  <option value="rank_change">
                    Any supplier ranking changes
                  </option>
                  <option value="l1_change">
                    The lowest bidder (L1) changes
                  </option>
                </select>
              </label>
              <p className="form-note">
                <ShieldCheck size={16} /> Extensions always stop at the forced
                close time.
              </p>
            </div>
          )}
          <p className="form-note">
            <Info size={15} /> All quotes are collected in Indian rupees (INR).
          </p>
        </div>
        <div className="modal-footer">
          <button
            className="button secondary"
            type="button"
            onClick={close}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? <Loader2 size={17} className="spin" /> : null}
            {busy ? "Creating RFQ…" : "Create RFQ"}
            {!busy && <ArrowRight size={17} />}
          </button>
        </div>
      </form>
    </Modal>
  );
}
