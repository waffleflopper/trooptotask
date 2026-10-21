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
import type {
	loadDangerSettings,
	loadMembersSettings,
	loadPoliciesSettings
} from '$features/organization/index.server';
import type { listGroupCatalog } from '$features/personnel/index.server';
import type { streamSettingsNavCounts } from './settingsShell.server';
import type { loadArchivesSettings } from './settingsArchives.server';
import type { GeneralSettingsPorts } from './settingsGeneral.server';
import type { FeaturesSettingsPorts } from './settingsFeatures.server';

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
	Parameters<typeof listGroupCatalog>[0] & {
		auth: AdmittedOrganizationRequest['auth'];
		audit: AdmittedOrganizationRequest['audit'];
	} {
	return {
		...createRequestGroupContext(request),
		organizationSettings: createSupabaseOrganizationSettingsReader(request.supabase),
		organizationInvitationSetupStateLookup: createOrganizationInvitationSetupStateLookup()
	};
}

export function createSettingsPoliciesContext(
	request: AdmittedOrganizationRequest
): Parameters<typeof loadPoliciesSettings>[0] {
	return {
		auth: request.auth,
		organizationSettings: createSupabaseOrganizationSettingsReader(request.supabase)
	};
}

export function createSettingsDangerContext(
	request: AdmittedOrganizationRequest
): Parameters<typeof loadDangerSettings>[0] {
	return { auth: request.auth, organizationSettings: createSupabaseOrganizationSettingsReader(request.supabase) };
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

export function createSettingsGeneralContext(request: AdmittedOrganizationRequest): GeneralSettingsPorts {
	return {
		auth: request.auth,
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
