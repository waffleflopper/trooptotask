import { fail } from '$lib/server/core/errors';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { QueryPorts, UseCaseContext } from '$lib/server/core/ports';
import { policyResourceForGroup, requireFeaturePolicy } from './featurePolicy';

export interface PersonnelAwardTrackingInput {
	personnelId: string;
	acknowledged: boolean;
}

export interface PersonnelAwardTrackingResult {
	personnelId: string;
	awardTrackingAcknowledged: boolean;
}

interface PersonnelExtendedInfoRow {
	id: string;
	personnel_id: string;
	award_tracking_acknowledged_at?: string | null;
}

export async function listAwardTrackingAcknowledgedPersonnelIds(ctx: QueryPorts): Promise<string[]> {
	if (!ctx.personnelAwardAcknowledgement) throw new Error('Personnel award acknowledgement port is required');
	return ctx.personnelAwardAcknowledgement.listAcknowledgedPersonnelIds(ctx.auth);
}

export async function setPersonnelAwardTrackingAcknowledged(
	ctx: UseCaseContext,
	input: PersonnelAwardTrackingInput
): Promise<PersonnelAwardTrackingResult> {
	const { personnelId, acknowledged } = input;
	if (!personnelId) fail(400, 'personnelId is required');

	const person = await ctx.rawStore.findOne<{ id: string; group_id: string | null }>('personnel', ctx.auth.orgId, {
		id: personnelId
	});
	if (!person) fail(404, 'Personnel not found');

	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.manageRecords,
		policyResourceForGroup(person.group_id),
		'personnel',
		personnelId
	);
	await ctx.scope.requireGroupAccess(personnelId);

	const existing = await ctx.rawStore.findOne<PersonnelExtendedInfoRow>('personnel_extended_info', ctx.auth.orgId, {
		personnel_id: personnelId
	});

	if (acknowledged) {
		const acknowledgedAt = new Date().toISOString();
		if (existing) {
			await ctx.rawStore.update('personnel_extended_info', ctx.auth.orgId, existing.id, {
				award_tracking_acknowledged_at: acknowledgedAt
			});
		} else {
			await ctx.rawStore.insert('personnel_extended_info', ctx.auth.orgId, {
				personnel_id: personnelId,
				award_tracking_acknowledged_at: acknowledgedAt
			});
		}
	} else if (existing) {
		await ctx.rawStore.update('personnel_extended_info', ctx.auth.orgId, existing.id, {
			award_tracking_acknowledged_at: null
		});
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
