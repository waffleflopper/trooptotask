import type { Session, SupabaseClient } from '@supabase/supabase-js';

declare global {
	namespace App {
		interface Locals {
			supabase: SupabaseClient;
			safeGetSession: () => Promise<{ session: Session | null; user: import('@supabase/supabase-js').User | null }>;
			session: Session | null;
			user: import('@supabase/supabase-js').User | null;
		}
		interface PageData {
			session: Session | null;
		}
	}
}

export {};
