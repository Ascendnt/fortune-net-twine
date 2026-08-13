-- Fortune Net & Twine Export Sales ERP: Phase 1 starter schema
-- Maps directly onto the TypeScript types in src/lib/types.ts so the Phase 0
-- mock data can be seeded in with minimal transformation.
-- This is a STARTING POINT for discovery, not a final schema. Business rules
-- (approval thresholds, configurable payment terms, etc.) still need client sign-off.

create extension if not exists "uuid-ossp";

-- ---------- Master data ----------

create table customers (
  id                text primary key,               -- e.g. CUST-001
  name              text not null,
  consignee         text not null,
  country           text not null,
  address           text not null,
  contact_person    text,
  email             text,
  phone             text,
  default_payment_terms text,
  default_currency  text not null default 'USD',
  since             date not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table item_master (
  code              text primary key,
  description       text not null,
  material          text,
  ply_size          text,
  mesh_size         text,
  mesh_depth        text,
  color             text,
  uom               text not null check (uom in ('PCS','KGS')),
  unit_price        numeric(12,2) not null,
  unit_weight_kg    numeric(12,3) not null,
  created_at        timestamptz not null default now()
);

-- ---------- Quotations (Proforma Invoices) ----------

create table quotations (
  id                text primary key,               -- e.g. PI-33012
  revision_no       int not null default 0,
  customer_id       text not null references customers(id),
  consignee         text not null,
  status            text not null default 'draft',
  currency          text not null default 'USD',
  validity_days     int not null default 7,
  issue_date        date not null default current_date,
  payment_terms     text,
  moq               text,
  lead_time_weeks   int,
  estimated_shipment_date date,
  freight           numeric(12,2) not null default 0,
  discount          numeric(12,2) not null default 0,
  tax               numeric(12,2) not null default 0,
  deposit_percent   numeric(5,2) not null default 30,
  assigned_salesperson text,
  remarks           text,
  approver          text,
  approved_date     date,
  customer_response_note text,
  sales_order_id    text,                            -- set once converted
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table quotation_revisions (
  id                uuid primary key default uuid_generate_v4(),
  quotation_id      text not null references quotations(id) on delete cascade,
  revision_no       int not null,
  changed_by        text not null,
  note              text,
  created_at        timestamptz not null default now()
);

create table quotation_items (
  id                uuid primary key default uuid_generate_v4(),
  quotation_id      text not null references quotations(id) on delete cascade,
  item_code         text references item_master(code),
  description       text not null,
  specification     text,
  qty_pcs           numeric(12,2) not null,
  unit              text not null,
  unit_price        numeric(12,2) not null,
  weight_kg         numeric(12,3) not null,
  total_price       numeric(14,2) generated always as (qty_pcs * unit_price) stored
);

-- ---------- Sales Orders ----------

create table sales_orders (
  id                text primary key,               -- e.g. SO-1041
  quotation_id      text not null references quotations(id),
  customer_id       text not null references customers(id),
  consignee         text not null,
  country           text,
  currency          text not null default 'USD',
  order_value       numeric(14,2) not null,
  order_date        date not null default current_date,
  requested_delivery_date date,
  current_stage     text not null default 'quotation',
  priority          text not null default 'standard',
  assigned_salesperson text,
  production_status text not null default 'not_started',
  production_qty_ordered   numeric(12,2) default 0,
  production_qty_completed numeric(12,2) default 0,
  production_qty_rejected  numeric(12,2) default 0,
  planned_completion_date  date,
  actual_completion_date   date,
  delay_reason      text,
  invoice_id        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- One row per lifecycle stage per order, mirroring ORDER_STAGES in the prototype.
create table order_stage_records (
  id                uuid primary key default uuid_generate_v4(),
  sales_order_id    text not null references sales_orders(id) on delete cascade,
  stage             text not null,
  status            text not null default 'pending',   -- pending | in_progress | blocked | completed
  completed_date    date,
  responsible_role  text,
  pending_action    text,
  blocker           text,
  unique (sales_order_id, stage)
);

-- ---------- Payments ----------

create table payments (
  id                text primary key,               -- e.g. PMT-5001
  sales_order_id    text not null references sales_orders(id) on delete cascade,
  type              text not null check (type in ('deposit','balance','adjustment')),
  expected_amount   numeric(14,2) not null,
  amount_received   numeric(14,2) not null default 0,
  date_received     date,
  bank_ref          text,
  method            text,
  remittance_attached boolean default false,
  verified_by       text,
  verification_date date,
  status            text not null default 'expected',
  due_date          date,
  remarks           text,
  created_at        timestamptz not null default now()
);

-- ---------- Commercial Invoices ----------

create table commercial_invoices (
  id                text primary key,               -- e.g. CI-9041
  sales_order_id    text not null references sales_orders(id),
  quotation_id      text not null references quotations(id),
  customer_id       text not null references customers(id),
  issue_date        date not null default current_date,
  currency          text not null default 'USD',
  freight           numeric(12,2) not null default 0,
  discount          numeric(12,2) not null default 0,
  tax               numeric(12,2) not null default 0,
  status            text not null default 'draft',
  shipped_weight_kg numeric(12,3),
  bill_of_lading_no text,
  container_no      text,
  created_at        timestamptz not null default now()
);

create table commercial_invoice_items (
  id                uuid primary key default uuid_generate_v4(),
  invoice_id        text not null references commercial_invoices(id) on delete cascade,
  item_code         text references item_master(code),
  description       text not null,
  qty_pcs           numeric(12,2) not null,
  unit              text not null,
  unit_price        numeric(12,2) not null,
  weight_kg         numeric(12,3) not null
);

-- ---------- Documents ----------

create table documents (
  id                uuid primary key default uuid_generate_v4(),
  name              text not null,
  type              text not null,
  related_order_id  text references sales_orders(id),
  version           int not null default 1,
  uploaded_by       text,
  upload_date       date not null default current_date,
  approval_status   text not null default 'n/a',
  is_current        boolean not null default true,
  storage_key       text                             -- object storage pointer (S3/GCS/etc.)
);

-- ---------- Approvals ----------

create table approvals (
  id                text primary key,               -- e.g. APR-001
  type              text not null,
  reference_id      text not null,
  customer_id       text references customers(id),
  requested_by      text,
  requested_date    date not null default current_date,
  due_date          date,
  level             text,
  status            text not null default 'pending',
  reason            text
);

-- ---------- Activity / audit log (append-only, per the Framework doc) ----------

create table activity_log (
  id                uuid primary key default uuid_generate_v4(),
  occurred_at       timestamptz not null default now(),
  user_name         text not null,
  department        text not null,
  action            text not null,
  previous_status   text,
  new_status        text,
  record_type       text not null,
  record_id         text not null,
  comment           text,
  attachment_key    text
);
-- Append-only: revoke UPDATE/DELETE grants for the application role once
-- roles are introduced, so the audit trail matches the Framework's intent.

create index idx_activity_record on activity_log (record_type, record_id);
create index idx_payments_order on payments (sales_order_id);
create index idx_orders_customer on sales_orders (customer_id);
create index idx_quotations_customer on quotations (customer_id);
