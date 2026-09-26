import type {
	OrgProvisioningAssignmentTypeSeed,
	OrgProvisioningCreateResult,
	OrgProvisioningPort,
	OrgProvisioningSpecialDaySeed,
	OrgProvisioningStatusTypeSeed
} from '$lib/server/core/useCases/orgProvisioning';

export function createSupabaseOrgProvisioningPort(
	locals: Pick<App.Locals, 'supabase'>,
	seedGroups: OrgProvisioningPort['seedDefaultGroups'],
	seedRankCatalog: OrgProvisioningPort['seedDefaultRankCatalog']
): OrgProvisioningPort {
	const supabase = locals.supabase;

	return {
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
			return seedGroups(organizationId, groups);
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
		},

		async seedDefaultRankCatalog(organizationId) {
			return seedRankCatalog(organizationId);
		}
	};
}

function serializeStatusTypeSeed(organizationId: string, statusType: OrgProvisioningStatusTypeSeed) {
	return {
		organization_id: organizationId,
		name: statusType.name,
		color: statusType.color,
		text_color: statusType.textColor,

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
