import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluatePolicyDecision, POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { PersonnelOrganizationExportPort, PersonnelRosterActor } from './contracts';
import { isPersonnelOrganizationExportTable, type PersonnelOrganizationExportTable } from './contracts';
import { RequestFailure } from '$lib/errors';

function assertPersonnelOrganizationExportAccess(
	actor: PersonnelRosterActor,
	table: string
): asserts table is PersonnelOrganizationExportTable {
	if (!isPersonnelOrganizationExportTable(table)) throw new RequestFailure(400, 'Unsupported Personnel export table');
	const decision = evaluatePolicyDecision({
		decisionKind: 'server-authoritative',
		actor: { membershipRole: actor.role, canManageMembers: actor.canManageMembers, userId: actor.userId },
		action: POLICY_ACTION_CATALOG.organization.exportData,
		capabilityMap: actor.capabilityMap,
		scopeSet: { kind: 'organization' },
		resource: { kind: 'organization' }
	});
	if (!actor.userId || !actor.orgId || !decision.allowed) {
		throw new RequestFailure(403, 'Organization export access denied');
	}
}

/** Read all retained Personnel history after the Organization export policy admits the actor. */
export function createSupabasePersonnelOrganizationExportPort(
	getAdminClient: () => SupabaseClient
): PersonnelOrganizationExportPort {
	return {
		async listRows(actor, table) {
			assertPersonnelOrganizationExportAccess(actor, table);
			const admin = getAdminClient();
			const result = await selectAllSupabaseRows<Record<string, unknown>>(async (from, to) => {
				const { data, error } = await admin
					.from(table)
					.select('*')
					.eq('organization_id', actor.orgId)
					.order('id', { ascending: true })
					.range(from, to);
				return { data, error };
			});
			if (result.error) {
				throw new Error((result.error as { message?: string }).message ?? 'Personnel export read failed');
			}
			return result.data ?? [];
		}
	};
}
