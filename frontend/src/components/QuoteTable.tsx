import { Fragment, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Medal,
  PackageCheck,
  Truck,
} from "lucide-react";
import { dateTime, initials, money, shortDate } from "../lib/format";
import type { Bid } from "../lib/types";
import { EmptyState } from "./Shared";

export default function QuoteTable({ bids }: { bids: Bid[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!bids.length)
    return (
      <EmptyState
        title="The competition starts with a quote"
        description="Supplier offers will appear here, automatically ranked from lowest to highest. Submit the first quote to get started."
      />
    );
  return (
    <div className="table-scroll">
      <table className="quotes-table">
        <thead>
          <tr>
            <th>RANK</th>
            <th>SUPPLIER / CARRIER</th>
            <th>TRANSIT</th>
            <th>TOTAL QUOTE</th>
            <th aria-label="Quote details" />
          </tr>
        </thead>
        <tbody>
          {bids.map((bid) => (
            <Fragment key={bid.id}>
              <tr
                className={`${bid.rank === 1 ? "leading-quote" : ""} ${expanded === bid.id ? "expanded" : ""}`}
              >
                <td>
                  <span className={`rank ${bid.rank === 1 ? "first" : ""}`}>
                    {bid.rank === 1 && <Medal size={14} />}L{bid.rank}
                  </span>
                </td>
                <td>
                  <div className="supplier-cell">
                    <span
                      className={`supplier-avatar color-${(bid.rank || 1) % 4}`}
                    >
                      {initials(bid.supplier_name)}
                    </span>
                    <div>
                      <strong>{bid.supplier_name}</strong>
                      <small>
                        <Truck size={12} />
                        {bid.carrier_name}
                      </small>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="transit-days">
                    {bid.transit_days} <small>days</small>
                  </span>
                </td>
                <td>
                  <strong
                    className={bid.rank === 1 ? "best-price" : "table-money"}
                  >
                    {money(bid.total_amount)}
                  </strong>
                  {bid.rank === 1 && (
                    <small className="lowest-label">Lowest quote</small>
                  )}
                </td>
                <td>
                  <button
                    className="expand-button"
                    aria-label={`${expanded === bid.id ? "Hide" : "Show"} ${bid.supplier_name} quote breakdown`}
                    aria-expanded={expanded === bid.id}
                    onClick={() =>
                      setExpanded(expanded === bid.id ? null : bid.id)
                    }
                  >
                    {expanded === bid.id ? (
                      <ChevronUp size={17} />
                    ) : (
                      <ChevronDown size={17} />
                    )}
                  </button>
                </td>
              </tr>
              {expanded === bid.id && (
                <tr className="quote-breakdown-row">
                  <td colSpan={5}>
                    <div className="quote-breakdown">
                      <div className="breakdown-heading">
                        <PackageCheck size={15} />
                        <strong>Quote details</strong>
                        <span>Submitted {dateTime(bid.created_at)}</span>
                      </div>
                      <dl>
                        <div>
                          <dt>Freight charges</dt>
                          <dd>{money(bid.freight_charges)}</dd>
                        </div>
                        <div>
                          <dt>Origin charges</dt>
                          <dd>{money(bid.origin_charges)}</dd>
                        </div>
                        <div>
                          <dt>Destination charges</dt>
                          <dd>{money(bid.destination_charges)}</dd>
                        </div>
                        <div>
                          <dt>Quote validity</dt>
                          <dd>{shortDate(bid.valid_until)}</dd>
                        </div>
                      </dl>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
