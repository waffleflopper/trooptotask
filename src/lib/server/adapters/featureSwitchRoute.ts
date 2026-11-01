import { error } from '@sveltejs/kit';
import { requireActiveOrganization } from '$features/organization/index.server';
import { featureOffMessage, type FeatureKey } from '$lib/access/featureSwitches';

export async function requireFeatureOn(
	event: { locals: App.Locals; params: { orgId: string } },
	feature: FeatureKey
): Promise<void> {
	const organization = await requireActiveOrganization(event.locals, event.params.orgId);
	if (organization.disabledFeatures.includes(feature)) {
		error(403, featureOffMessage(feature), { featureOff: feature });
	}
}
