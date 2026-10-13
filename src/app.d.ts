import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { AdmittedActor, IdentityViewer, PendingAuthFlow } from '$features/identity/contracts';
import type { MembershipRequestCache } from '$lib/access/requestMembershipCache.server';

declare global {
	namespace App {
		interface Locals extends MembershipRequestCache {
			actor: AdmittedActor | null;
			supabase: SupabaseClient;
			session: Session | null;
			user: import('@supabase/supabase-js').User | null;
			mfaPending: boolean;
			authFlow: PendingAuthFlow;
		}
		interface PageData {
			viewer?: IdentityViewer | null;
		}
	}
}

export {};
