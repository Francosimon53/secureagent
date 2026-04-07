/**
 * Supabase Client
 *
 * Lazy-initialized Supabase client for serverless use.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.warn('Supabase not configured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return null;
  }

  _client = createClient(url, key);
  return _client;
}
