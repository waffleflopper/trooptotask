import { createSupabaseTrainingCatalogPersistence } from '$features/training/index.server';
import { createSupabaseSignInRosterRankReferenceReader } from '$features/sign-in-rosters/index.server';
import {
	createOrganizationInvitationSetupStateLookup,
	type AdmittedOrganizationRequest
} from '$lib/server/adapters/requestContexts.server';
import {
	createRequestRankCatalogContext,
	createRequestPersonnelRosterContext,
	createRequestGroupContext,
	createRequestNotificationContext,
	createRequestSensitiveActionContext,
	createRequestActorContext,
	createRequestOrganizationAuditLogContext,
	createRequestUnitCountsContext
} from '$lib/server/adapters/requestContexts.server';
import { fetchLatestAuditEvent } from '$lib/audit/index.server';
import { createSupabaseOrganizationSettingsReader } from '$features/organization/index.server';
import type { loadMembersSettings } from '$features/organization/index.server';
import { fetchTrainingBriefingReport } from '$features/training/index.server';
import { createRequestTrainingBriefingContext } from '$lib/server/adapters/featureRequestContexts.server';
import type { listScopeGroups } from '$features/personnel/index.server';
import type { streamSettingsNavCounts } from './settingsShell.server';
import type { loadArchivesSettings } from './settingsArchives.server';
import type { FeaturesSettingsPorts } from './settingsFeatures.server';
import type { DangerSettingsPorts } from './settingsDanger.server';
import type { SettingsExportsPorts } from './settingsExports.server';
import type { PoliciesSettingsPorts } from './settingsPolicies.server';

export function createSettingsShellContext(request: AdmittedOrganizationRequest): Parameters<
	typeof streamSettingsNavCounts
>[0] & {
	auth: AdmittedOrganizationRequest['auth'];
	audit: AdmittedOrganizationRequest['audit'];
} {
	return {
		...createRequestActorContext(request),
		organizationSettings: createSupabaseOrganizationSettingsReader(request.supabase)
	};
}

export function createSettingsArchivesContext(
	request: AdmittedOrganizationRequest
): Parameters<typeof loadArchivesSettings>[0] {
	return {
		...createRequestPersonnelRosterContext(request),
		organizationSettings: createSupabaseOrganizationSettingsReader(request.supabase)
	};
}

export function createSettingsMembersContext(request: AdmittedOrganizationRequest): Parameters<
	typeof loadMembersSettings
>[0] &
	Parameters<typeof listScopeGroups>[0] & {
		auth: AdmittedOrganizationRequest['auth'];
		audit: AdmittedOrganizationRequest['audit'];
	} {
	return {
		...createRequestGroupContext(request),
		disabledFeatures: request.disabledFeatures,
		organizationSettings: createSupabaseOrganizationSettingsReader(request.supabase),
		organizationInvitationSetupStateLookup: createOrganizationInvitationSetupStateLookup()
	};
}

export function createSettingsPoliciesContext(request: AdmittedOrganizationRequest): PoliciesSettingsPorts {
	return {
		...createRequestPersonnelRosterContext(request),
		disabledFeatures: request.disabledFeatures,
		organizationSettings: createSupabaseOrganizationSettingsReader(request.supabase),
		readTrainingBriefing: (input, asOf) =>
			fetchTrainingBriefingReport(createRequestTrainingBriefingContext(request), input, asOf)
	};
}

export function createSettingsDangerContext(request: AdmittedOrganizationRequest): DangerSettingsPorts {
	return {
		auth: request.auth,
		organizationSettings: createSupabaseOrganizationSettingsReader(request.supabase),
		...createRequestUnitCountsContext(request)
	};
}

export function createSettingsApprovalsContext(request: AdmittedOrganizationRequest) {
	return { auth: request.auth, audit: request.audit };
}

export function createSettingsSensitiveNotificationContext(request: AdmittedOrganizationRequest) {
	return {
		...createRequestNotificationContext(request),
		...createRequestSensitiveActionContext(request)
	};
}

export function createSettingsRanksContext(request: AdmittedOrganizationRequest) {
	return {
		...createRequestRankCatalogContext(request),
		trainingCatalog: createSupabaseTrainingCatalogPersistence(request.supabase, request.auth.orgId),
		readSignInRosterRankReferences: createSupabaseSignInRosterRankReferenceReader(request.supabase, request.auth.orgId)
	};
}

export function createSettingsUnitSummaryContext(request: AdmittedOrganizationRequest): SettingsExportsPorts {
	return {
		auth: request.auth,
		disabledFeatures: request.disabledFeatures,
		...createRequestUnitCountsContext(request),
		readLatestAuditEvent: (action) => {
			const { auditStore, auditLabels } = createRequestOrganizationAuditLogContext(request);
			return fetchLatestAuditEvent(request.auth.orgId, auditStore, action, auditLabels);
		}
	};
}

export function createSettingsFeaturesContext(request: AdmittedOrganizationRequest): FeaturesSettingsPorts {
	return {
		auth: request.auth,
		disabledFeatures: request.disabledFeatures,
		organizationSettings: createSupabaseOrganizationSettingsReader(request.supabase),
		...createRequestUnitCountsContext(request)
	};
}
