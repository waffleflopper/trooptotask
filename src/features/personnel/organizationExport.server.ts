import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluatePolicyDecision, POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';
import type { PersonnelOrganizationExportPort, PersonnelRosterActor } from './contracts';
import { isPersonnelOrganizationExportTable, type PersonnelOrganizationExportTable } from './contracts';

function assertPersonnelOrganizationExportAccess(
	actor: PersonnelRosterActor,
	table: string
): asserts table is PersonnelOrganizationExportTable {
	if (!isPersonnelOrganizationExportTable(table))
		throw Object.assign(new Error('Unsupported Personnel export table'), { status: 400 });
	const decision = evaluatePolicyDecision({
		decisionKind: 'server-authoritative',
		actor: { membershipRole: actor.role, canManageMembers: actor.canManageMembers, userId: actor.userId },
		action: POLICY_ACTION_CATALOG.organization.exportData,
		capabilityMap: actor.capabilityMap,
		scopeSet: { kind: 'organization' },
		resource: { kind: 'organization' }
	});
	if (!actor.userId || !actor.orgId || !decision.allowed) {
		throw Object.assign(new Error('Organization export access denied'), { status: 403 });
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
