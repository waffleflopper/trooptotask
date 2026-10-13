import { getAdminClient } from '$lib/server/supabase';
import { cleanupAuditLogs } from '$lib/audit/index.server';
import { createSupabaseAssignmentTypeRetention } from '$features/calendar/index.server';
import { createSupabaseCriticalTaskRetentionSource } from '$features/critical-tasks/index.server';
import { createSupabaseNotificationDelivery } from '$features/notifications/index.server';
import { createSupabaseOnboardingRetentionSource } from '$features/onboarding/index.server';
import {
	createSupabaseOrganizationAdministratorRecipients,
	createSupabaseOrganizationRetentionSettingsReader,
	drainRetiredOrganizationFiles
} from '$features/organization/index.server';
import {
	createSupabasePersonnelArtifactRetentionSource,
	createSupabasePersonnelRetentionSource
} from '$features/personnel/index.server';

// Scheduled maintenance runs without a member session. Call these only after cron authorization;
// each binds service-role retention sources for one admitted job.

function createRequiredNotificationDelivery(admin: ReturnType<typeof getAdminClient>) {
	return createSupabaseNotificationDelivery({
		getAdminClient: () => admin,
		resolveAdministratorRecipients: createSupabaseOrganizationAdministratorRecipients(() => admin),
		failureMode: 'required'
	});
}

export function createArchiveRetentionSources() {
	const admin = getAdminClient();
	return {
		settings: createSupabaseOrganizationRetentionSettingsReader(admin),
		criticalTasks: createSupabaseCriticalTaskRetentionSource(admin),
		assignmentTypes: createSupabaseAssignmentTypeRetention(admin),
		artifacts: createSupabasePersonnelArtifactRetentionSource(admin),
		personnel: createSupabasePersonnelRetentionSource(admin),
		files: { drainRetiredFiles: () => drainRetiredOrganizationFiles(admin) },
		notifications: createRequiredNotificationDelivery(admin)
	};
}

export function createOnboardingRetentionSources() {
	const admin = getAdminClient();
	return {
		settings: createSupabaseOrganizationRetentionSettingsReader(admin),
		store: createSupabaseOnboardingRetentionSource(admin),
		notifications: createRequiredNotificationDelivery(admin)
	};
}

export function cleanupRetainedAuditLogs() {
	return cleanupAuditLogs(getAdminClient());
}
