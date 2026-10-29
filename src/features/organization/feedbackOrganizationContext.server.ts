import type { SupabaseClient } from '$lib/server/database';

export interface FeedbackOrganizationContext {
	organizationId: string;
	organizationName: string;
	organizationUrlSlug: string | null;
}

export interface FeedbackOrganizationContextPort {
	resolveOrganizationContext(input: {
		userId: string;
		organizationId: string;
	}): Promise<FeedbackOrganizationContext | null>;
}

interface MembershipOrganizationRow {
	organizations:
		| { id: string; name: string; url_slug?: string | null }
		| { id: string; name: string; url_slug?: string | null }[]
		| null;
}

/** Exact admitted-account membership context; Feedback never reads the membership table. */
export function createSupabaseFeedbackOrganizationContextPort(
	getClient: () => SupabaseClient
): FeedbackOrganizationContextPort {
	return {
		async resolveOrganizationContext(input) {
			const { data, error } = await getClient()
				.from('organization_memberships')
				.select('organizations(id, name, url_slug)')
				.eq('organization_id', input.organizationId)
				.eq('user_id', input.userId)
				.maybeSingle<MembershipOrganizationRow>();
			if (error) throw new Error('Failed to resolve feedback organization context', { cause: error });
			const organization = Array.isArray(data?.organizations) ? data.organizations[0] : data?.organizations;
			if (!organization) return null;
			return {
				organizationId: organization.id,
				organizationName: organization.name,
				organizationUrlSlug: organization.url_slug ?? null
			};
		}
	};
}
