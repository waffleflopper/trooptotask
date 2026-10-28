import type { SupabaseClient as Client } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type { Database };
export type SupabaseClient = Client<Database>;
