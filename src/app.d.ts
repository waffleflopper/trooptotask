import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { PendingAuthFlow } from '$lib/server/mfaGate';
import type { MembershipRow } from '$lib/server/permissionContext';

declare global {
	namespace App {
		interface Locals {
			supabase: SupabaseClient;
			safeGetSession: () => Promise<{ session: Session | null; user: import('@supabase/supabase-js').User | null }>;
			session: Session | null;
			user: import('@supabase/supabase-js').User | null;
			mfaPending: boolean;
			authFlow: PendingAuthFlow;
			membershipContextCache?: Map<string, Promise<MembershipRow>>;
		}
		interface PageData {
			session: Session | null;
		}
	}
}

export {};
