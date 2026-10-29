import type { Session } from '@supabase/supabase-js';
import type { SupabaseClient } from '$lib/server/database';
import type { AdmittedActor, IdentityViewer, PendingAuthFlow } from '$features/identity/contracts';
import type { MembershipRequestCache } from '$lib/access/requestMembershipCache.server';
import type { OrganizationAdmissionRequest } from '$features/organization/index.server';
import type { FeatureKey } from '$lib/access/featureSwitches';

declare global {
	namespace App {
		interface Error {
			message: string;
			/** Set when a route stopped because its Organization turned the feature off. */
			featureOff?: FeatureKey;
		}
		interface Locals extends MembershipRequestCache, OrganizationAdmissionRequest {
			actor: AdmittedActor | null;
			supabase: SupabaseClient;
			session: Session | null;
			user: import('@supabase/supabase-js').User | null;
			mfaPending: boolean;
			/** Whether the account has a verified factor; null when this request read no session. */
			hasTwoFactor: boolean | null;
			authFlow: PendingAuthFlow;
		}
		interface PageData {
			viewer?: IdentityViewer | null;
		}
		interface PageState {
			importStep?: 'columns' | 'review' | 'done';
			/** The Training record sheet was opened from this page, so closing it steps back one entry. */
			trainingRecord?: boolean;
			/** The Event dates a save just changed, so Back from a Tasking's edit returns to the same review list. */
			eventDateReview?: { before: { startsOn: string; endsOn: string }; after: { startsOn: string; endsOn: string } };
		}
	}
}

export {};
