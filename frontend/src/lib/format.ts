import type { Auction, AuctionStatus, ExtensionTrigger } from "./types";

export const money = (value: string | number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(Number(value));

export const dateTime = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

export const shortDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value.length === 10 ? `${value}T00:00:00` : value));

export const timeOnly = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));

export const statusLabels: Record<AuctionStatus, string> = {
  active: "Active",
  scheduled: "Scheduled",
  closed: "Closed",
  force_closed: "Force closed",
};

export const triggerLabels: Record<ExtensionTrigger, string> = {
  bid_received: "Any bid received",
  rank_change: "Any supplier rank changes",
  l1_change: "Lowest bidder changes",
};

export function auctionStatus(
  auction: Auction,
  now = Date.now(),
): AuctionStatus {
  if (now < Date.parse(auction.start_time)) return "scheduled";
  if (
    now < Date.parse(auction.close_time) &&
    now < Date.parse(auction.forced_close_time)
  )
    return "active";
  return Date.parse(auction.close_time) >= Date.parse(auction.forced_close_time)
    ? "force_closed"
    : "closed";
}

export function localDateTime(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
