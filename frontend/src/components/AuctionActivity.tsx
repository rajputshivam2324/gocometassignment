import { useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  FilePlus2,
  Gavel,
  History,
  TimerReset,
} from "lucide-react";
import { dateTime, timeOnly } from "../lib/format";
import type { Activity } from "../lib/types";

export default function AuctionActivity({
  activity,
}: {
  activity: Activity[];
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? activity : activity.slice(0, 6);
  return (
    <section className="panel activity-panel">
      <div className="panel-heading">
        <div className="panel-title">
          <History size={18} />
          <h2>Auction activity</h2>
        </div>
        <span className="subtle-label">Latest first</span>
      </div>
      {!activity.length ? (
        <p className="activity-empty">
          Activity will appear as the auction progresses.
        </p>
      ) : (
        <div className="activity-list">
          {visible.map((event) => (
            <div className={`activity-item ${event.event_type}`} key={event.id}>
              <span className="activity-icon">
                {event.event_type === "extended" ? (
                  <TimerReset size={15} />
                ) : event.event_type === "created" ? (
                  <FilePlus2 size={15} />
                ) : (
                  <Gavel size={15} />
                )}
              </span>
              <div>
                <div className="activity-line">
                  <strong>
                    {event.event_type === "extended"
                      ? "Auction extended"
                      : event.event_type === "created"
                        ? "RFQ created"
                        : "Quote submitted"}
                  </strong>
                  <time dateTime={event.created_at}>
                    {dateTime(event.created_at)}
                  </time>
                </div>
                <p>{event.message}</p>
                {event.previous_close_time && event.new_close_time && (
                  <div className="extension-times">
                    <span>{timeOnly(event.previous_close_time)}</span>
                    <ArrowRight size={13} />
                    <strong>{timeOnly(event.new_close_time)}</strong>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {activity.length > 6 && (
        <button
          className="activity-show text-button"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll
            ? "Show less activity"
            : `View all ${activity.length} events`}
          <ArrowDown size={14} className={showAll ? "rotate" : ""} />
        </button>
      )}
    </section>
  );
}
