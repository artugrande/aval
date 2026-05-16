import {createClient, type SupabaseClient} from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
    if (_client) return _client;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    _client = createClient(url, key);
    return _client;
}

/// Returns the base URL of the Supabase Edge Functions endpoint, or null if Supabase isn't configured.
export function functionsBaseUrl(): string | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) return null;
    return `${url.replace(/\/+$/, "")}/functions/v1`;
}
