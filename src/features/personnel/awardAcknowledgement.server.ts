import type { SupabaseClient } from '@supabase/supabase-js';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { evaluateFeaturePolicy } from '$lib/access/index.server';
import type { PersonnelAwardAcknowledgementPort } from './contracts';

/** Keep Dashboard optional for actors without Personnel while SQL enforces scoped access. */
export function createSupabasePersonnelAwardAcknowledgementPort(
	supabase: SupabaseClient
): PersonnelAwardAcknowledgementPort {
	return {
		async listAcknowledgedPersonnelIds(actor) {
			const decision = await evaluateFeaturePolicy({ auth: actor }, POLICY_ACTION_CATALOG.personnel.viewRoster, {
				kind: 'unscoped'
			});
			if (!decision.allowed || (actor.scopeSet.kind === 'groups' && actor.scopeSet.groupIds.length === 0)) return [];

			const { data, error } = await supabase.rpc('list_personnel_award_tracking_acknowledged', {
				p_organization_id: actor.orgId
			});
			if (error) throw new Error(error.message);
			return ((data ?? []) as { personnel_id: string }[]).map((row) => row.personnel_id);
		}
	};
}
