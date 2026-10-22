import { error } from '@sveltejs/kit';
import { requireActiveOrganization } from '$features/organization/index.server';
import { featureOffMessage, type FeatureKey } from '$lib/access/featureSwitches';

/**
 * Stops a switched feature's routes before any of their data loads. The switch is read fresh for this
 * request, so a tab whose shell still shows the feature lands on the off state too.
 */
export async function requireFeatureOn(
	event: { locals: App.Locals; params: { orgId: string } },
	feature: FeatureKey
): Promise<void> {
	const organization = await requireActiveOrganization(event.locals, event.params.orgId);
	if (organization.disabledFeatures.includes(feature)) {
		error(403, { message: featureOffMessage(feature), featureOff: feature });
	}
}
