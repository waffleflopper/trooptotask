import type { RequestEvent } from '@sveltejs/kit';
import { createSupabasePlatformAudit } from '$lib/audit/index.server';
import {
	createOrganizationSupportReader,
	createSupabaseOrganizationPlatformMembershipPort
} from '$features/organization/index.server';
import { createPersonnelSupportReader } from '$features/personnel/index.server';
import { createCalendarSupportReader } from '$features/calendar/index.server';
import { createOnboardingSupportReader } from '$features/onboarding/index.server';
import { createTrainingSupportReader } from '$features/training/index.server';
import { createRatingSchemeSupportReader } from '$features/rating-scheme/index.server';
import type { PlatformOrganizationLedgerInput } from '../organizationSupportTypes';
import { admitPlatformAdministrator } from './admission.server';
import { createPlatformMetrics } from './metrics.server';
import { createPlatformOrganizationLedger } from './organizationLedger.server';
import { createPlatformOrganizationDetail } from './organizationDetail.server';
import { createPlatformActivationHealth, createPlatformActivationHealthStore } from './activationHealth.server';

/** Used Organization support operations; privileged clients remain at this private delivery edge. */
export async function createPlatformOrganizationOperations(event: RequestEvent) {
	const { role, adminClient } = await admitPlatformAdministrator(event, ['super_admin', 'support']);
	const organizations = createOrganizationSupportReader(adminClient);
	const personnel = createPersonnelSupportReader(adminClient);
	const metrics = createPlatformMetrics({ store: { ...organizations, ...personnel } });
	const ledger = createPlatformOrganizationLedger({ store: organizations, metrics });
	const detail = createPlatformOrganizationDetail({
		adminRole: role,
		store: organizations,
		metrics,
		membershipReader: createSupabaseOrganizationPlatformMembershipPort(adminClient),
		audit: createSupabasePlatformAudit(adminClient)
	});
	const activation = createPlatformActivationHealth({
		store: createPlatformActivationHealthStore({
			organizations,
			personnel,
			calendar: createCalendarSupportReader(adminClient),
			onboarding: createOnboardingSupportReader(adminClient),
			training: createTrainingSupportReader(adminClient),
			ratingScheme: createRatingSchemeSupportReader(adminClient)
		})
	});
	return {
		async listOrganizations(input: PlatformOrganizationLedgerInput) {
			const [page, activationHealth] = await Promise.all([ledger.listOrganizations(input), activation.summarize()]);
			return { ...page, activationHealth };
		},
		getOrganizationDetail: detail.getOrganizationDetail
	};
}
