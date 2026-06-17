/**
 * SubscriptionPort implementation backed by Supabase.
 * Handles personnel seat limits, tier compatibility lookups, and monthly export quotas.
 *
 * Personnel and tier compatibility reads use the plan-policy path and fetch fresh usage.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isBillingEnabled } from '$lib/config/billing';
import type { SubscriptionPort } from '$lib/server/core/ports';
import { invalidateTierCache, getMonthlyExportCount } from '$lib/server/subscription';
import {
	checkCanAddPersonnelForPlanPolicy,
	getAvailablePersonnelSlotsForPlanPolicy,
	readEffectivePlanPolicy,
	toEffectiveTierFromPlanPolicy,
	type EffectivePlanPolicy
} from '$lib/server/core/useCases/planPolicy';
import { readOrganizationPlanUsage, type OrganizationPlanUsage } from '$lib/server/core/useCases/organizationPlanUsage';
import { createSupabaseDataStore } from './supabaseDataStore';

export function createSupabaseSubscriptionAdapter(supabase: SupabaseClient, orgId: string): SubscriptionPort {
	const store = createSupabaseDataStore(supabase);

	async function readPolicyAndUsage(): Promise<{ policy: EffectivePlanPolicy; usage: OrganizationPlanUsage }> {
		const auth = { orgId };
		if (!isBillingEnabled) {
			return {
				policy: await readEffectivePlanPolicy({ auth, store }),
				usage: emptyUsage(orgId)
			};
		}

		const [policy, usage] = await Promise.all([
			readEffectivePlanPolicy({ auth, store }),
			readOrganizationPlanUsage({ auth, store })
		]);
		return { policy, usage };
	}

	return {
		async canAddPersonnel() {
			const { policy, usage } = await readPolicyAndUsage();
			return checkCanAddPersonnelForPlanPolicy(policy, usage);
		},
		async getAvailablePersonnelSlots() {
			const { policy, usage } = await readPolicyAndUsage();
			return getAvailablePersonnelSlotsForPlanPolicy(policy, usage);
		},
		invalidateTierCache() {
			invalidateTierCache(orgId);
		},
		async getEffectiveTier() {
			const { policy, usage } = await readPolicyAndUsage();
			return toEffectiveTierFromPlanPolicy(policy, usage);
		},
		async getMonthlyExportCount() {
			return getMonthlyExportCount(supabase, orgId);
		}
	};
}

function emptyUsage(orgId: string): OrganizationPlanUsage {
	const now = new Date().toISOString();
	return {
		organizationId: orgId,
		asOf: now,
		activePersonnelCount: 0,
		activeOrganizationMemberCount: 0,
		pendingUnexpiredInvitationCount: 0,
		monthlyExportCount: 0,
		sources: {
			activePersonnel: { table: 'personnel', included: [], excluded: ['billing disabled'] },
			activeOrganizationMembers: { table: 'organization_memberships', included: [], excluded: ['billing disabled'] },
			pendingUnexpiredInvitations: {
				table: 'organization_invitations',
				included: [],
				excluded: ['billing disabled']
			},
			monthlyExports: {
				table: 'data_exports',
				included: [],
				excluded: ['billing disabled'],
				period: { start: now, endExclusive: now }
			}
		}
	};
}
