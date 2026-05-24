import type { SupabaseClient } from '@supabase/supabase-js';
import { isBillingEnabled } from '$lib/config/billing';
import {
	checkCanCreateOrganizationForPlanPolicies,
	readEffectivePlanPolicy
} from '$lib/server/core/useCases/planPolicy';
import type {
	OrgProvisioningAssignmentTypeSeed,
	OrgProvisioningCreateResult,
	OrgProvisioningGroupSeed,
	OrgProvisioningPort,
	OrgProvisioningSpecialDaySeed,
	OrgProvisioningStatusTypeSeed
} from '$lib/server/core/useCases/orgProvisioning';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';
import { createSupabaseDataStore } from './supabaseDataStore';

interface OwnedOrganizationRow {
	id: string;
}

export function createSupabaseOrgProvisioningPort(locals: Pick<App.Locals, 'supabase'>): OrgProvisioningPort {
	const supabase = locals.supabase;

	return {
		async canCreateOrganization(userId) {
			return canCreateOrganizationFromPlanPolicies(supabase, userId);
		},

		async createOrganizationWithOwner(name): Promise<OrgProvisioningCreateResult> {
			const { data, error } = await supabase.rpc('create_org_with_owner', { p_name: name });

			return {
				orgId: data ?? null,
				errorMessage: error?.message ?? null
			};
		},

		async updateOwnerMembershipEmail(input) {
			const { error } = await supabase
				.from('organization_memberships')
				.update({ email: input.email })
				.eq('organization_id', input.organizationId)
				.eq('user_id', input.userId);

			return error?.message ?? null;
		},

		async seedDefaultGroups(organizationId, groups) {
			const { error } = await supabase
				.from('groups')
				.insert(groups.map((group) => serializeGroupSeed(organizationId, group)));

			return error?.message ?? null;
		},

		async seedDefaultStatusTypes(organizationId, statusTypes) {
			const { error } = await supabase
				.from('status_types')
				.insert(statusTypes.map((statusType) => serializeStatusTypeSeed(organizationId, statusType)));

			return error?.message ?? null;
		},

		async seedDefaultAssignmentTypes(organizationId, assignmentTypes) {
			const { error } = await supabase
				.from('assignment_types')
				.insert(assignmentTypes.map((assignmentType) => serializeAssignmentTypeSeed(organizationId, assignmentType)));

			return error?.message ?? null;
		},

		async seedFederalHolidays(organizationId, specialDays) {
			let firstErrorMessage: string | null = null;

			for (let index = 0; index < specialDays.length; index += 50) {
				const batch = specialDays
					.slice(index, index + 50)
					.map((specialDay) => serializeSpecialDaySeed(organizationId, specialDay));
				const { error } = await supabase.from('special_days').insert(batch);

				if (error && !firstErrorMessage) {
					firstErrorMessage = error.message;
				}
			}

			return firstErrorMessage;
		}
	};
}

async function canCreateOrganizationFromPlanPolicies(supabase: SupabaseClient, userId: string) {
	if (!isBillingEnabled) return { allowed: true };

	const result = await selectAllSupabaseRows<OwnedOrganizationRow>(
		(from, to) =>
			supabase
				.from('organizations')
				.select('id', { count: 'exact' })
				.eq('created_by', userId)
				.range(from, to) as unknown as Promise<{
				data: OwnedOrganizationRow[] | null;
				error: unknown;
				count: number | null;
			}>
	);

	if (result.error) {
		throw result.error;
	}

	const ownedOrganizations = result.data ?? [];
	const store = createSupabaseDataStore(supabase);
	// Organization ownership caps are currently small (unit allows 3), so fresh per-org policy reads
	// preserve gift and billing-state precedence without adding a second batching contract here.
	const policies = await Promise.all(
		ownedOrganizations.map((org) => readEffectivePlanPolicy({ auth: { orgId: org.id }, store }))
	);

	return checkCanCreateOrganizationForPlanPolicies({
		ownedOrganizationCount: result.count ?? ownedOrganizations.length,
		policies
	});
}

function serializeGroupSeed(organizationId: string, group: OrgProvisioningGroupSeed) {
	return {
		organization_id: organizationId,
		name: group.name,
		sort_order: group.sortOrder
	};
}

function serializeStatusTypeSeed(organizationId: string, statusType: OrgProvisioningStatusTypeSeed) {
	return {
		organization_id: organizationId,
		name: statusType.name,
		color: statusType.color,
		text_color: statusType.textColor,
		da6_availability_treatment: statusType.da6AvailabilityTreatment ?? null,
		da6_treatment_reviewed: statusType.da6TreatmentReviewed ?? false,
		sort_order: statusType.sortOrder
	};
}

function serializeAssignmentTypeSeed(organizationId: string, assignmentType: OrgProvisioningAssignmentTypeSeed) {
	return {
		organization_id: organizationId,
		name: assignmentType.name,
		short_name: assignmentType.shortName,
		assign_to: assignmentType.assignTo,
		color: assignmentType.color,
		sort_order: assignmentType.sortOrder
	};
}

function serializeSpecialDaySeed(organizationId: string, specialDay: OrgProvisioningSpecialDaySeed) {
	return {
		organization_id: organizationId,
		date: specialDay.date,
		name: specialDay.name,
		type: specialDay.type
	};
}
