-- PostgreSQL initial schema, equivalent to python -m backend.app.init_db.
-- Run once on an empty database; use a versioned migration tool for later schema changes.

CREATE TABLE auctions (
	id VARCHAR(36) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	reference_id VARCHAR(100) NOT NULL, 
	start_time TIMESTAMP WITH TIME ZONE NOT NULL, 
	close_time TIMESTAMP WITH TIME ZONE NOT NULL, 
	original_close_time TIMESTAMP WITH TIME ZONE NOT NULL, 
	forced_close_time TIMESTAMP WITH TIME ZONE NOT NULL, 
	service_date DATE NOT NULL, 
	british_auction BOOLEAN NOT NULL, 
	trigger_window_minutes INTEGER NOT NULL, 
	extension_minutes INTEGER NOT NULL, 
	extension_trigger VARCHAR(20) NOT NULL, 
	extension_count INTEGER NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT auction_start_before_close CHECK (start_time < original_close_time), 
	CONSTRAINT auction_initial_before_forced CHECK (original_close_time < forced_close_time), 
	CONSTRAINT auction_close_bounds CHECK (close_time >= original_close_time AND close_time <= forced_close_time), 
	CONSTRAINT auction_positive_windows CHECK (trigger_window_minutes > 0 AND extension_minutes > 0), 
	CONSTRAINT auction_nonnegative_extensions CHECK (extension_count >= 0), 
	CONSTRAINT auction_valid_trigger CHECK (extension_trigger IN ('bid_received', 'rank_change', 'l1_change')), 
	UNIQUE (reference_id)
);

CREATE TABLE bids (
	id VARCHAR(36) NOT NULL, 
	auction_id VARCHAR(36) NOT NULL, 
	supplier_name VARCHAR(200) NOT NULL, 
	supplier_key VARCHAR(600) NOT NULL, 
	carrier_name VARCHAR(200) NOT NULL, 
	freight_charges NUMERIC(18, 2) NOT NULL, 
	origin_charges NUMERIC(18, 2) NOT NULL, 
	destination_charges NUMERIC(18, 2) NOT NULL, 
	total_amount NUMERIC(18, 2) NOT NULL, 
	transit_days INTEGER NOT NULL, 
	valid_until DATE NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT bid_nonnegative_charges CHECK (freight_charges >= 0 AND origin_charges >= 0 AND destination_charges >= 0), 
	CONSTRAINT bid_positive_total CHECK (total_amount > 0), 
	CONSTRAINT bid_total_matches CHECK (total_amount = freight_charges + origin_charges + destination_charges), 
	CONSTRAINT bid_positive_transit CHECK (transit_days > 0), 
	FOREIGN KEY(auction_id) REFERENCES auctions (id) ON DELETE CASCADE
);

CREATE INDEX ix_bids_auction_supplier_created ON bids (auction_id, supplier_key, created_at);

CREATE TABLE activities (
	sequence SERIAL NOT NULL, 
	id VARCHAR(36) NOT NULL, 
	auction_id VARCHAR(36) NOT NULL, 
	event_type VARCHAR(30) NOT NULL, 
	message TEXT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	previous_close_time TIMESTAMP WITH TIME ZONE, 
	new_close_time TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (sequence), 
	UNIQUE (id), 
	FOREIGN KEY(auction_id) REFERENCES auctions (id) ON DELETE CASCADE
);

CREATE INDEX ix_activities_auction_id ON activities (auction_id);
