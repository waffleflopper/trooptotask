import type { PersonnelRecordPersistence } from './contracts';
import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { fail } from '$lib/errors';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';

interface PersonnelAwardTrackingContext {
	auth: OrganizationAccessGrant;
	audit: PolicyAuditSink;
	scope: { requireGroupAccess(personnelId: string): Promise<void> };
	organizationPersonnel: Pick<PersonnelRecordPersistence, 'findGroupReference'>;
	rawStore: {
		findOne<T>(table: 'personnel_extended_info', orgId: string, filters: Record<string, unknown>): Promise<T | null>;
		insert<T>(table: 'personnel_extended_info', orgId: string, data: Record<string, unknown>): Promise<T>;
		update<T>(table: 'personnel_extended_info', orgId: string, id: string, data: Record<string, unknown>): Promise<T>;
	};
}

interface PersonnelAwardTrackingInput {
	personnelId: string;
	acknowledged: boolean;
}

interface PersonnelAwardTrackingResult {
	personnelId: string;
	awardTrackingAcknowledged: boolean;
}

interface PersonnelExtendedInfoRow {
	id: string;
	personnel_id: string;
	award_tracking_acknowledged_at?: string | null;
}

export async function setPersonnelAwardTrackingAcknowledged(
	ctx: PersonnelAwardTrackingContext,
	input: PersonnelAwardTrackingInput
): Promise<PersonnelAwardTrackingResult> {
	const { personnelId, acknowledged } = input;
	if (!personnelId) fail(400, 'personnelId is required');

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
