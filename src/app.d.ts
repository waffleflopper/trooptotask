import type { Session } from '@supabase/supabase-js';
import type { SupabaseClient } from '$lib/server/database';
import type { AdmittedActor, IdentityViewer, PendingAuthFlow } from '$features/identity/contracts';
import type { MembershipRequestCache } from '$lib/access/requestMembershipCache.server';
import type { OrganizationAdmissionRequest } from '$features/organization/index.server';
import type { FeatureKey } from '$lib/access/featureSwitches';

declare global {
	const __APP_ROUTE_IDS__: readonly string[];
	namespace App {
		interface Error {
			message: string;
			/** Set when a route stopped because its Organization turned the feature off. */
			featureOff?: FeatureKey;
			/** Names the captured failure behind this error, so a report can point at exactly it. */
			errorReference?: string;
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
			/**
			 * Help was opened from this page: `null` closed, `guide: null` the guide list, otherwise one guide. `depth` counts
			 * the history entries Help pushed, so closing steps back over all of them.
			 */
			help?: { guide: string | null; depth: number } | null;
			/** The Event dates a save just changed, so Back from a Tasking's edit returns to the same review list. */
			eventDateReview?: { before: { startsOn: string; endsOn: string }; after: { startsOn: string; endsOn: string } };
		}
	}
}

export {};
