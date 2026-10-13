import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { AdmittedActor, IdentityViewer, PendingAuthFlow } from '$features/identity/contracts';
import type { MembershipRequestCache } from '$lib/access/requestMembershipCache.server';
import type { OrganizationAdmissionRequest } from '$features/organization/index.server';

declare global {
	namespace App {
		interface Locals extends MembershipRequestCache, OrganizationAdmissionRequest {
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
