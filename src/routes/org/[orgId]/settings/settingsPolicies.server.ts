import { normalizeCriticalTasksSettings } from '$features/critical-tasks/utils/ictStatus';
import type { MembershipRole } from '$lib/access/memberAccessShape';
import type { UseCaseContext } from '$lib/server/core/ports';
import {
	ARCHIVE_RETENTION_CONSTRAINT,
	CRITICAL_TASKS_DEFAULT_EXPIRATION_CONSTRAINT,
	CRITICAL_TASKS_EXPIRING_SOON_WARNING_CONSTRAINT,
	DEFAULT_ARCHIVE_RETENTION_MONTHS,
	DEFAULT_LOSS_WARNING_WINDOW_DAYS,
	LOSS_WARNING_CONSTRAINT
} from './settingsPolicyConstraints';
import type { SettingsPoliciesSectionData } from './organizationSettingsWorkspaceModel';
import type { OrganizationSettingsRow } from './settingsRows.server';

export interface PoliciesSettingsData {
	currentMember: {
		role: MembershipRole;
		isOwner: boolean;
		isAdmin: boolean;
		canManageMembers: boolean;
	};
	sections: {
		policies: SettingsPoliciesSectionData;
	};
}

export async function loadPoliciesSettings(
	ctx: Pick<UseCaseContext, 'auth' | 'rawStore'>,
	input: { isAdmin: boolean }
): Promise<PoliciesSettingsData> {
	const organizationSettings = await ctx.rawStore.findOne<OrganizationSettingsRow>(
		'organizations',
		ctx.auth.orgId,
		{},
		'archive_retention_months, loss_warning_window_days, critical_tasks_default_expiration_months, critical_tasks_expiring_soon_warning_days'
	);

	return buildPoliciesSettingsData(ctx, {
		isAdmin: input.isAdmin,
		organizationSettings
	});
}

export function buildPoliciesSettingsData(
	ctx: Pick<UseCaseContext, 'auth'>,
	input: { isAdmin: boolean; organizationSettings: OrganizationSettingsRow | null }
): PoliciesSettingsData {
	const isOwner = ctx.auth.role === 'owner';
	const canManageMembers = isOwner || ctx.auth.role === 'admin';
	const criticalTasksSettings = normalizeCriticalTasksSettings({
		defaultExpirationMonths: input.organizationSettings?.critical_tasks_default_expiration_months ?? null,
		expiringSoonWarningDays: input.organizationSettings?.critical_tasks_expiring_soon_warning_days ?? null
	});

	return {
		currentMember: {
			role: ctx.auth.role,
			isOwner,
			isAdmin: input.isAdmin,
			canManageMembers
		},
		sections: {
			policies: {
				archiveRetention: {
					savedMonths: input.organizationSettings?.archive_retention_months ?? DEFAULT_ARCHIVE_RETENTION_MONTHS,
					constraints: ARCHIVE_RETENTION_CONSTRAINT
				},
				lossWarning: {
					savedDays: input.organizationSettings?.loss_warning_window_days ?? DEFAULT_LOSS_WARNING_WINDOW_DAYS,
					constraints: LOSS_WARNING_CONSTRAINT
				},
				criticalTasks: {
					savedDefaultExpirationMonths: criticalTasksSettings.defaultExpirationMonths,
					savedExpiringSoonWarningDays: criticalTasksSettings.expiringSoonWarningDays,
					defaultExpirationConstraints: CRITICAL_TASKS_DEFAULT_EXPIRATION_CONSTRAINT,
					expiringSoonWarningConstraints: CRITICAL_TASKS_EXPIRING_SOON_WARNING_CONSTRAINT
				},
				canUpdateRetention: canManageMembers,
				canUpdateCriticalTasksSettings: canManageMembers
			}
		}
	};
}
