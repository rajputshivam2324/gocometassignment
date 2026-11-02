export type AuctionStatus = "scheduled" | "active" | "closed" | "force_closed";
export type ExtensionTrigger = "bid_received" | "rank_change" | "l1_change";

export interface AuctionInput {
  name: string;
  reference_id: string;
  start_time: string;
  close_time: string;
  forced_close_time: string;
  service_date: string;
  british_auction: boolean;
  trigger_window_minutes: number;
  extension_minutes: number;
  extension_trigger: ExtensionTrigger;
}

export interface Auction extends AuctionInput {
  id: string;
  original_close_time: string;
  status: AuctionStatus;
  lowest_bid: string | null;
  bid_count: number;
  supplier_count: number;
  extension_count: number;
  created_at: string;
}

export interface BidInput {
  supplier_name: string;
  carrier_name: string;
  freight_charges: number | string;
  origin_charges: number | string;
  destination_charges: number | string;
  transit_days: number;
  valid_until: string;
}

export interface Bid extends BidInput {
  id: string;
  auction_id: string;
  total_amount: string;
  rank: number | null;
  created_at: string;
}

export interface Activity {
  id: string;
  event_type: "created" | "bid_submitted" | "extended";
  message: string;
  created_at: string;
  previous_close_time: string | null;
  new_close_time: string | null;
}

export interface AuctionDetail extends Auction {
  bids: Bid[];
  activity: Activity[];
}
