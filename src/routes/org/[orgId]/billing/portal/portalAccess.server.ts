import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';
import { readBillingOrganization } from '$lib/server/core/useCases/billingOrganization';
import type { BillingSnapshotSource } from '$lib/types/subscription';

interface PortalBillingSnapshotRow {
	source: BillingSnapshotSource;
	stripe_customer_id: string | null;
}

export async function resolvePortalCustomerId(ctx: Pick<UseCaseContext, 'auth' | 'rawStore'>): Promise<string> {
	const [org, snapshot] = await Promise.all([
		readBillingOrganization({ auth: ctx.auth, store: ctx.rawStore }),
		ctx.rawStore.findOne<PortalBillingSnapshotRow>(
			'organization_billing_snapshots',
			ctx.auth.orgId,
			{},
			'source, stripe_customer_id'
		)
	]);

	const organizationCustomerId = org.stripeCustomerId?.trim() || null;
	const snapshotCustomerId = snapshot?.stripe_customer_id?.trim() || null;

	if (!snapshot) {
		if (organizationCustomerId) {
			fail(409, 'Billing customer state needs support review before opening the portal');
		}

		fail(400, 'No active subscription found for this organization');
	}

	if (snapshot.source === 'legacy_organization') {
		fail(409, 'Billing customer state needs support review before opening the portal');
	}

	if (!snapshotCustomerId) {
		fail(400, 'No active subscription found for this organization');
	}

	// The billing snapshot is the authoritative customer source; the organization mirror can lag behind it.
	if (organizationCustomerId && organizationCustomerId !== snapshotCustomerId) {
		fail(409, 'Billing customer state needs support review before opening the portal');
	}

	return snapshotCustomerId;
}
