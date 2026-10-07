import { createSupabaseTrainingCatalogPersistence } from '$features/training/index.server';
import { createSupabaseSignInRosterRankReferenceReader } from '$features/sign-in-rosters/index.server';
import type { AdmittedOrganizationRequest } from '$lib/server/adapters/requestContexts.server';
import {
	createRequestRankCatalogContext,
	createRequestPersonnelRosterContext,
	createRequestGroupContext,
	createRequestNotificationContext,
	createRequestSensitiveActionContext,
	createRequestWriteContext
} from '$lib/server/adapters/requestContexts.server';
import {
	createSupabaseOrganizationInvitationSetupStateLookupPort,
	createSupabaseOrganizationSettingsReader
} from '$features/organization/index.server';
import type {
	loadDangerSettings,
	loadMembersSettings,
	loadPoliciesSettings
} from '$features/organization/index.server';
import type { listGroupCatalog } from '$features/personnel/index.server';
import { getAdminClient } from '$lib/server/supabase';
import type { loadSettingsShell } from './settingsShell.server';
import type { loadArchivesSettings } from './settingsArchives.server';

export function createSettingsShellContext(request: AdmittedOrganizationRequest): Parameters<
	typeof loadSettingsShell
>[0] & {
	auth: AdmittedOrganizationRequest['auth'];
	audit: AdmittedOrganizationRequest['audit'];
} {
	return {
		...createRequestWriteContext(request),
		...createRequestPersonnelRosterContext(request),
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
		...createRequestWriteContext(request),
		...createRequestGroupContext(request),
		organizationInvitationSetupStateLookup: createSupabaseOrganizationInvitationSetupStateLookupPort(getAdminClient)
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
	return { auth: request.auth, store: request.store };
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
