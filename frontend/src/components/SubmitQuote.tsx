import { useCallback, useState, type FormEvent } from "react";
import { ArrowRight, Info, Loader2 } from "lucide-react";
import Modal from "./Modal";
import { ErrorMessage } from "./Shared";
import { request } from "../lib/api";
import { money } from "../lib/format";
import type { AuctionDetail, BidInput } from "../lib/types";

interface Props {
  auction: AuctionDetail;
  onClose: () => void;
  onSubmitted: (auction: AuctionDetail) => void;
}

export default function SubmitQuote({ auction, onClose, onSubmitted }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [charges, setCharges] = useState<Record<string, string>>({
    freight_charges: "",
    origin_charges: "",
    destination_charges: "",
  });
  const close = useCallback(onClose, [onClose]);
  const minimumValidity = [
    auction.service_date,
    new Date().toISOString().slice(0, 10),
  ].sort()[1];
  const total =
    Object.values(charges).reduce(
      (sum, value) => sum + Math.round(Number(value || 0) * 100),
      0,
    ) / 100;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) || "").trim();
    const input: BidInput = {
      supplier_name: value("supplier_name"),
      carrier_name: value("carrier_name"),
      freight_charges: value("freight_charges"),
      origin_charges: value("origin_charges"),
      destination_charges: value("destination_charges"),
      transit_days: Number(value("transit_days")),
      valid_until: value("valid_until"),
    };
    if (!input.supplier_name || !input.carrier_name) {
      setError("Enter the supplier and carrier names.");
      return;
    }
    if (total <= 0) {
      setError("The total quote amount must be greater than zero.");
      return;
    }
    setBusy(true);
    try {
      onSubmitted(
        await request<AuctionDetail>(`/auctions/${auction.id}/bids`, {
          method: "POST",
          body: JSON.stringify(input),
        }),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to submit quote.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Submit a quote"
      description={auction.name}
      onClose={close}
      busy={busy}
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          {error && <ErrorMessage message={error} />}
          <div className="form-grid">
            <label className="field">
              Supplier name{" "}
              <input
                name="supplier_name"
                placeholder="Your company name"
                required
                maxLength={200}
                autoComplete="organization"
              />
            </label>
            <label className="field">
              Carrier name{" "}
              <input
                name="carrier_name"
                placeholder="e.g. Maersk"
                required
                maxLength={200}
              />
            </label>
          </div>
          <div className="form-section-title">
            <span>₹</span>
            <h3>Quote breakdown</h3>
            <small>Currency: INR</small>
          </div>
          <div className="form-grid three">
            {(
              [
                ["freight_charges", "Freight charges"],
                ["origin_charges", "Origin charges"],
                ["destination_charges", "Destination charges"],
              ] as const
            ).map(([key, label]) => (
              <label className="field" key={key}>
                {label}
                <div className="input-with-unit prefix">
                  <span>₹</span>
                  <input
                    type="number"
                    name={key}
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    required
                    value={charges[key]}
                    onChange={(event) =>
                      setCharges({ ...charges, [key]: event.target.value })
                    }
                  />
                </div>
              </label>
            ))}
          </div>
          <div className="quote-total">
            <span>Total quote amount</span>
            <strong>{money(total)}</strong>
          </div>
          <div className="form-grid">
            <label className="field">
              Transit time{" "}
              <div className="input-with-unit">
                <input
                  type="number"
                  name="transit_days"
                  min="1"
                  max="2147483647"
                  step="1"
                  placeholder="e.g. 12"
                  required
                />
                <span>days</span>
              </div>
            </label>
            <label className="field">
              Quote valid until{" "}
              <input
                type="date"
                name="valid_until"
                min={minimumValidity}
                defaultValue={minimumValidity}
                required
              />
            </label>
          </div>
          <div className="info-box">
            <Info size={18} />
            <p>
              Already quoted? Use the same supplier name and submit a lower
              total to update your offer. Your latest quote determines your
              ranking.
            </p>
          </div>
          <p className="form-note">
            Demo workspace: supplier names identify quotes; no supplier sign-in
            is required.
          </p>
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="button secondary"
            onClick={close}
            disabled={busy}
          >
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? <Loader2 size={17} className="spin" /> : null}
            {busy ? "Submitting…" : "Submit quote"}
            {!busy && <ArrowRight size={17} />}
          </button>
        </div>
      </form>
    </Modal>
  );
}
