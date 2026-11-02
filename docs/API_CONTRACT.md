# British auction API contract

Stack: Python FastAPI + SQLAlchemy + PostgreSQL, React + TypeScript + Vite. No Docker. DATABASE_URL configured by user for cloud PostgreSQL. API prefix /api. JSON uses snake_case, UUID/string ids, UTC ISO dates. Amounts decimal strings in responses (INR), JSON numbers or strings accepted in requests. Errors follow FastAPI detail. CORS localhost:5173. No auth required by assignment: supplier_name is supplied per bid. Document demo limitation.

GET /api/health -> {status:"ok"}
GET /api/auctions -> Auction[] (latest created first)
POST /api/auctions -> Auction (201)
GET /api/auctions/{id} -> AuctionDetail
POST /api/auctions/{id}/bids -> AuctionDetail (201)

Auction input: {name, reference_id, start_time, close_time, forced_close_time, service_date:"YYYY-MM-DD", british_auction:true, trigger_window_minutes:10, extension_minutes:5, extension_trigger:"bid_received"|"rank_change"|"l1_change"}
Auction output: input fields plus {id, original_close_time, status:"scheduled"|"active"|"closed"|"force_closed", lowest_bid:string|null, bid_count:number, supplier_count:number, extension_count:number, created_at}
AuctionDetail: Auction fields plus {bids:Bid[], activity:Activity[]}. bids is latest quote per supplier sorted ascending total, with ranks 1..N; bid_count includes history. activity newest first, including creation, bids, extension reasons. GET /api/auctions/{id}/bid-history -> Bid[] optional, implement if useful.
Bid input: {supplier_name, carrier_name, freight_charges, origin_charges, destination_charges, transit_days, valid_until:"YYYY-MM-DD"}
Bid output: input plus {id, auction_id, total_amount:string, rank:number|null, created_at}
Activity: {id, event_type:"created"|"bid_submitted"|"extended", message, created_at, previous_close_time:string|null, new_close_time:string|null}

Rules: start < initial close < forced close; service_date >= start calendar date; positive integer X/Y. Bid allowed start <= now < close AND now < forced. Supplier names case insensitive identity. All charges nonnegative, total positive, integer positive transit_days; valid_until >= current UTC date and >= service_date. Subsequent quote from same supplier must strictly decrease total; ties allowed between different suppliers, tie-break by earlier submission then id. Row lock auction for every bid transaction, compare latest supplier rank maps before/after. First bidder counts as L1 change. Within inclusive window close-X <= now < close, extend exactly once per qualifying submission: min(close+Y,forced). rank_change means any supplier rank mapping changes, including new entrants. l1_change compares supplier identity, not price. British option false disables extensions. Status derived at read time: before start scheduled, before close active, at/after close closed unless close==forced then force_closed. Persist bid and activity and close update in single transaction. Scheduled and expired reject with 409. Unknown id 404. Duplicate reference 409. Bad payload 422. Amount precision max 2 decimals.

Frontend: polished procurement dashboard with list/search/status filters, create RFQ form, detail/ranking/config/activity, quote form, countdown + polling (5 seconds), responsive. Use same-origin /api via Vite proxy localhost:8000. Empty and error/loading states. No fake records unless explicit opt-in seed script. Frontend owns frontend/ only, backend owns backend/ only, tester owns tests/ only. Orchestrator owns root docs/config. Never edit other agent files without coordination.
