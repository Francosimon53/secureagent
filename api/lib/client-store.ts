/**
 * Client Memory Store
 *
 * CRUD operations for BCBA client profiles stored in Supabase.
 * Gracefully degrades if Supabase is unavailable.
 */

import { getSupabase } from './supabase.js';

export interface Client {
  id: string;
  telegram_user_id: number;
  name: string;
  age: number | null;
  diagnosis: string | null;
  current_goals: string | null;
  insurance: string | null;
  hours_authorized: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Add a new client for a BCBA (identified by telegram user ID).
 */
export async function addClient(
  telegramUserId: number,
  data: {
    name: string;
    age?: number | null;
    diagnosis?: string | null;
    current_goals?: string | null;
    insurance?: string | null;
    hours_authorized?: number | null;
    notes?: string | null;
  }
): Promise<Client | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data: row, error } = await sb
    .from('clients')
    .insert({
      telegram_user_id: telegramUserId,
      name: data.name,
      age: data.age ?? null,
      diagnosis: data.diagnosis ?? null,
      current_goals: data.current_goals ?? null,
      insurance: data.insurance ?? null,
      hours_authorized: data.hours_authorized ?? null,
      notes: data.notes ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('addClient error:', error.message);
    return null;
  }
  return row as Client;
}

/**
 * List all clients for a BCBA, ordered by name.
 */
export async function listClients(telegramUserId: number): Promise<Client[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from('clients')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .order('name');

  if (error) {
    console.error('listClients error:', error.message);
    return [];
  }
  return (data ?? []) as Client[];
}

/**
 * Get a single client by name (case-insensitive prefix match).
 * Returns all matches so the caller can disambiguate.
 */
export async function findClientsByName(
  telegramUserId: number,
  name: string
): Promise<Client[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from('clients')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .ilike('name', `${name}%`);

  if (error) {
    console.error('findClientsByName error:', error.message);
    return [];
  }
  return (data ?? []) as Client[];
}

/**
 * Get a single client by exact name (case-insensitive).
 */
export async function getClientByName(
  telegramUserId: number,
  name: string
): Promise<Client | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from('clients')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .ilike('name', name)
    .limit(1)
    .single();

  if (error) {
    // PGRST116 = no rows found, which is expected
    if (error.code !== 'PGRST116') {
      console.error('getClientByName error:', error.message);
    }
    return null;
  }
  return data as Client;
}

/**
 * Update a client record.
 */
export async function updateClient(
  clientId: string,
  updates: Partial<Pick<Client, 'name' | 'age' | 'diagnosis' | 'current_goals' | 'insurance' | 'hours_authorized' | 'notes'>>
): Promise<Client | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from('clients')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', clientId)
    .select()
    .single();

  if (error) {
    console.error('updateClient error:', error.message);
    return null;
  }
  return data as Client;
}

/**
 * Remove a client by name for a specific BCBA.
 */
export async function removeClient(
  telegramUserId: number,
  name: string
): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  const { error, count } = await sb
    .from('clients')
    .delete({ count: 'exact' })
    .eq('telegram_user_id', telegramUserId)
    .ilike('name', name);

  if (error) {
    console.error('removeClient error:', error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

/**
 * Detect a client name mentioned in free text.
 * Compares against the BCBA's client list.
 * Returns the matching client, or null if none/ambiguous.
 */
export async function detectClientInText(
  telegramUserId: number,
  text: string
): Promise<{ client: Client | null; ambiguous?: Client[] }> {
  const clients = await listClients(telegramUserId);
  if (clients.length === 0) return { client: null };

  const lower = text.toLowerCase();
  const matches: Client[] = [];

  for (const c of clients) {
    // Match full name or first name as a whole word
    const namePattern = new RegExp(`\\b${escapeRegex(c.name)}\\b`, 'i');
    if (namePattern.test(text)) {
      matches.push(c);
    }
  }

  if (matches.length === 1) {
    return { client: matches[0] };
  }
  if (matches.length > 1) {
    return { client: null, ambiguous: matches };
  }
  return { client: null };
}

/**
 * Build a context string for a client to prepend to prompts.
 */
export function buildClientContext(client: Client): string {
  const parts = [`Client context: ${client.name}`];
  if (client.age) parts.push(`${client.age} years old`);
  if (client.diagnosis) parts.push(`diagnosed with ${client.diagnosis}`);
  if (client.current_goals) parts.push(`Current goals: ${client.current_goals}`);
  if (client.insurance) parts.push(`Insurance: ${client.insurance}`);
  if (client.hours_authorized) parts.push(`${client.hours_authorized} hours authorized`);
  if (client.notes) parts.push(`Notes: ${client.notes}`);
  return parts.join('. ') + '.';
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
