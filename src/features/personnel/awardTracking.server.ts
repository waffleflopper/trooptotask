import type { PersonnelSheetPersistence } from './personnelSheetPersistence';
import type { PersonnelRecordPersistence } from './contracts';
import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { fail } from '$lib/errors';
import { featureOffMessage, type FeatureKey } from '$lib/access/featureSwitches';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';

interface PersonnelAwardTrackingContext {
	auth: OrganizationAccessGrant;
	audit: PolicyAuditSink;
	disabledFeatures: readonly FeatureKey[];
	scope: { requireGroupAccess(personnelId: string): Promise<void> };
	organizationPersonnel: Pick<PersonnelRecordPersistence, 'findGroupReference'>;
	personnelSheets: Pick<PersonnelSheetPersistence, 'findSheetForPerson' | 'createSheet' | 'setAwardAcknowledgedAt'>;
}

interface PersonnelAwardTrackingInput {
	personnelId: string;
	acknowledged: boolean;
}

interface PersonnelAwardTrackingResult {
	personnelId: string;
	awardTrackingAcknowledged: boolean;
}

export async function setPersonnelAwardTrackingAcknowledged(
	ctx: PersonnelAwardTrackingContext,
	input: PersonnelAwardTrackingInput
): Promise<PersonnelAwardTrackingResult> {
	const { personnelId, acknowledged } = input;
	if (!personnelId) fail(400, 'personnelId is required');
	if (ctx.disabledFeatures.includes('lossesAndAwards')) fail(403, featureOffMessage('lossesAndAwards'));

	const person = await ctx.organizationPersonnel.findGroupReference(personnelId);
	if (!person) fail(404, 'Personnel not found');

	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.manageRecords,
		policyResourceForGroup(person.groupId),
		'personnel',
		personnelId
	);
	await ctx.scope.requireGroupAccess(personnelId);

	const existing = await ctx.personnelSheets.findSheetForPerson(personnelId);

	if (acknowledged) {
		const acknowledgedAt = new Date().toISOString();
		if (existing) {
			await ctx.personnelSheets.setAwardAcknowledgedAt(existing.id, acknowledgedAt);
		} else {
			await ctx.personnelSheets.createSheet(personnelId, {
				award_tracking_acknowledged_at: acknowledgedAt
			});
		}
	} else if (existing) {
		await ctx.personnelSheets.setAwardAcknowledgedAt(existing.id, null);
	}

	ctx.audit.log({
		action: acknowledged ? 'personnel.award_tracking_acknowledged' : 'personnel.award_tracking_cleared',
		resourceType: 'personnel',
		resourceId: personnelId
	});

	return {
		personnelId,
		awardTrackingAcknowledged: acknowledged
	};
}
