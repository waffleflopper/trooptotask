import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { AdmittedActor, PendingAuthFlow } from '$features/identity/contracts';
import type { MembershipRow } from '$lib/server/permissionContext';

declare global {
	namespace App {
		interface Locals {
			actor: AdmittedActor | null;
			supabase: SupabaseClient;
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
