import {
	ARCHIVE_RETENTION_CONSTRAINT,
	DEFAULT_ARCHIVE_RETENTION_MONTHS,
	DEFAULT_LOSS_WARNING_WINDOW_DAYS,
	LOSS_WARNING_CONSTRAINT
} from './policyConstraints';
import type { OrganizationPolicySettings } from './settingsTypes';
import type { PoliciesSettingsActor, PoliciesSettingsData } from './policiesSettingsTypes';

export function buildPoliciesSettingsData(
	ctx: { auth: PoliciesSettingsActor },
	input: { isAdmin: boolean; organizationSettings: OrganizationPolicySettings | null }
): PoliciesSettingsData {
	return {
		currentMember: {
			role: ctx.auth.role,
			isOwner: ctx.auth.role === 'owner',
			isAdmin: input.isAdmin,
			canManageMembers: ctx.auth.canManageMembers
		},
		sections: {
			policies: {
				archiveRetention: {
					savedMonths: input.organizationSettings?.archiveRetentionMonths ?? DEFAULT_ARCHIVE_RETENTION_MONTHS,
					constraints: ARCHIVE_RETENTION_CONSTRAINT
				},
				lossWarning: {
					savedDays: input.organizationSettings?.lossWarningWindowDays ?? DEFAULT_LOSS_WARNING_WINDOW_DAYS,
					constraints: LOSS_WARNING_CONSTRAINT
				},
				canUpdateRetention: ctx.auth.canManageMembers
			}
		}
	};
}
