-- Aval initial schema
-- Off-chain identity (KYB) + credit scoring lives here.
-- On-chain, only the EIP-712 attestation signed by a whitelisted issuer is verified.

set check_function_bodies = off;

-- ============================================================================
-- business_profiles
-- ============================================================================

create table public.business_profiles (
    id uuid primary key default gen_random_uuid(),
    owner_wallet text not null,
    tax_id_hash text not null,
    country_code text not null,
    legal_name text,
    sector text,
    revenue_band text,
    age_months integer,
    kyb_status text not null default 'pending',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint business_profiles_owner_wallet_format check (owner_wallet ~ '^0x[a-fA-F0-9]{40}$'),
    constraint business_profiles_owner_wallet_unique unique (owner_wallet),
    constraint business_profiles_country_code_check check (country_code in ('MX', 'AR', 'BR', 'CO', 'PE', 'CL', 'UY')),
    constraint business_profiles_revenue_band_check check (revenue_band is null or revenue_band in ('lt_50k', '50k_500k', '500k_5m', 'gt_5m')),
    constraint business_profiles_kyb_status_check check (kyb_status in ('pending', 'approved', 'rejected')),
    constraint business_profiles_age_months_check check (age_months is null or age_months >= 0)
);

create index business_profiles_owner_wallet_idx on public.business_profiles (lower(owner_wallet));
create index business_profiles_kyb_status_idx on public.business_profiles (kyb_status);

-- ============================================================================
-- score_snapshots
-- ============================================================================

create table public.score_snapshots (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.business_profiles(id) on delete cascade,
    -- 0..1000 normalized score (higher = better)
    score integer not null,
    -- Max outstanding principal allowed at this moment, denominated in USDC micro-units (6 decimals)
    max_cap_micro bigint not null,
    -- bumped nonce we'll sign into the attestation to prevent replay across snapshots
    issuer_nonce bigint not null default 0,
    version text not null default 'v0',
    computed_at timestamptz not null default now(),
    constraint score_snapshots_score_check check (score >= 0 and score <= 1000),
    constraint score_snapshots_max_cap_check check (max_cap_micro >= 0)
);

create index score_snapshots_business_id_idx on public.score_snapshots (business_id, computed_at desc);

-- ============================================================================
-- kyb_documents
-- ============================================================================

create table public.kyb_documents (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.business_profiles(id) on delete cascade,
    doc_type text not null,
    storage_path text not null,
    sha256 text,
    uploaded_at timestamptz not null default now(),
    constraint kyb_documents_doc_type_check check (doc_type in ('tax_id', 'incorporation', 'bank_statement', 'invoice_sample', 'other'))
);

create index kyb_documents_business_id_idx on public.kyb_documents (business_id);

-- ============================================================================
-- attestation_log: audit trail of every signed EIP-712 attestation we hand out
-- ============================================================================

create table public.attestation_log (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.business_profiles(id) on delete cascade,
    snapshot_id uuid not null references public.score_snapshots(id) on delete cascade,
    borrower_wallet text not null,
    max_cap_micro bigint not null,
    expires_at timestamptz not null,
    issuer_nonce bigint not null,
    signature text not null,
    issued_at timestamptz not null default now()
);

create index attestation_log_business_id_idx on public.attestation_log (business_id, issued_at desc);
create index attestation_log_borrower_idx on public.attestation_log (lower(borrower_wallet), issued_at desc);

-- ============================================================================
-- updated_at trigger for business_profiles
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger business_profiles_set_updated_at
    before update on public.business_profiles
    for each row execute function public.set_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================
-- v1 strategy: the edge functions run with the service_role key and gate access
-- via wallet-signed nonces (SIWE-style). End-user clients never read these
-- tables directly. We still enable RLS so anon/authenticated keys see nothing.

alter table public.business_profiles enable row level security;
alter table public.score_snapshots enable row level security;
alter table public.kyb_documents enable row level security;
alter table public.attestation_log enable row level security;

-- service_role bypasses RLS by default, so no explicit policy is needed for it.
-- We deliberately do NOT add policies for anon/authenticated → effective deny-all.
