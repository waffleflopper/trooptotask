import { error, type Cookies } from '@sveltejs/kit';
import { resolveOrganizationRouteIdentity } from '$features/organization/index.server';
import { getPreferredOrganizationUrlSegment } from '$features/organization/contracts';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { AuditLogEntry } from '$lib/audit/contracts';
import type { OrganizationUnitCountsPort } from '$features/organization/index.server';
import { evaluatePolicyDecision, POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { buildLayoutRequest, type RequestContextBuilder } from '$lib/server/adapters/requestContexts.server';
import type { OrganizationRouteIdentity } from '$features/organization/contracts';

export interface SettingsSubrouteLoadEvent {
	locals: App.Locals;
	cookies: Cookies;
	params: { orgId: string };
	depends: (...deps: string[]) => void;
}

export interface SettingsPageOrganization {
	id: string;
	name: string | null;
	urlSlug: string | null;
	urlSegment: string;
}

export interface CommonSettingsPageData {
	orgId: string;
	orgUrlSegment: string;
	orgUrlSlug: string | null;
	orgName: string | null;
	isAdmin: boolean;
}

export interface SettingsLoadContext {
	common: CommonSettingsPageData;
	organization: SettingsPageOrganization;
}

export type SettingsSectionLoader<TContext, TSectionData extends Record<string, unknown>> = (
	ctx: TContext,
	context: SettingsLoadContext
) => Promise<TSectionData> | TSectionData;

export async function loadSettingsPage<TContext, TSectionData extends Record<string, unknown>>(
	event: SettingsSubrouteLoadEvent,
	context: RequestContextBuilder<TContext>,
	loadSectionData: SettingsSectionLoader<TContext, TSectionData>
): Promise<(CommonSettingsPageData & TSectionData) | Record<string, never>> {
	event.depends('app:org-core');
	const identity = await loadSettingsOrganization(event);
	if (identity.suspendedAt) return {};
	const organization = buildSettingsPageOrganization(identity);
	const request = await buildLayoutRequest(event.locals, identity.id);
	const common = buildCommonSettingsPageData(identity, request.auth);

	return loadWithContext(event.locals, event.cookies, identity.id, {
		context,
		policyAction: POLICY_ACTION_CATALOG.organization.accessGovernance,
		policyResource: { kind: 'organization' },
		fn: async (ctx) => ({ ...common, ...(await loadSectionData(ctx, { common, organization })) })
	});
}

export async function loadSettingsOrganization(
	event: Pick<SettingsSubrouteLoadEvent, 'locals' | 'params'>
): Promise<OrganizationRouteIdentity> {
	const organization = await resolveOrganizationRouteIdentity(event.locals, event.params.orgId);
	if (!organization) error(404, 'Organization not found');
	return organization;
}

export function buildCommonSettingsPageData(
	organization: OrganizationRouteIdentity,
	auth: Pick<OrganizationAccessGrant, 'role'>
): CommonSettingsPageData {
	const orgUrlSegment = getPreferredOrganizationUrlSegment(organization);
	return {
		orgId: organization.id,
		orgUrlSegment,
		orgUrlSlug: orgUrlSegment !== organization.id ? orgUrlSegment : null,
		orgName: organization.name ?? 'Organization',
		isAdmin: auth.role === 'admin'
	};
}

export function buildSettingsPageOrganization(organization: OrganizationRouteIdentity): SettingsPageOrganization {
	const urlSegment = getPreferredOrganizationUrlSegment(organization);
	return {
		id: organization.id,
		name: organization.name ?? 'Organization',
		urlSlug: urlSegment !== organization.id ? urlSegment : null,
		urlSegment
	};
}

export type SettingsAuditReader = Pick<OrganizationAccessGrant, 'role' | 'userId' | 'capabilityMap' | 'scopeSet'>;

/** What a page with unit counts and an audit-derived line reads: General and Exports. */
export interface SettingsUnitSummaryPorts {
	auth: SettingsAuditReader;
	unitCounts: OrganizationUnitCountsPort;
	/** Reads the audit log with privileged access, so it runs only after the audit-log policy admits the member. */
	readLatestAuditEvent: (action: string) => Promise<AuditLogEntry | null>;
}

/** Audit-derived lines such as "Last changed" show only to members the audit-log policy admits. */
export function canReadAuditLog(auth: SettingsAuditReader): boolean {
	return evaluatePolicyDecision({
		decisionKind: 'server-authoritative',
		actor: { membershipRole: auth.role, userId: auth.userId },
		action: POLICY_ACTION_CATALOG.organization.accessAuditLogs,
		capabilityMap: auth.capabilityMap,
		scopeSet: auth.scopeSet,
		resource: { kind: 'organization' }
	}).allowed;
}
