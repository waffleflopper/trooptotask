import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import type { UseCaseContext } from '$lib/server/core/ports';
import type { OrganizationMemberPermissions } from '$lib/types';
import type { EffectiveTier } from '$lib/types/subscription';
import { getSettingsPermissions } from './settingsPermissions.server';

export interface SettingsSubrouteParentData {
	orgSuspended?: boolean;
	orgId: string;
	orgName: string | null;
	orgUrlSegment?: string | null;
	allOrgs?: Array<{ id: string; name: string; role: string; urlSegment?: string }>;
	isAdmin?: boolean;
	effectiveTier?: EffectiveTier | null;
	permissions?: OrganizationMemberPermissions;
}

export interface SettingsSubrouteLoadEvent {
	locals: App.Locals;
	cookies: Cookies;
	parent: () => Promise<SettingsSubrouteParentData>;
}

export interface SettingsPageOrganization {
	id: string;
	name: string | null;
	urlSlug: string | null;
	urlSegment: string;
	effectiveTier: EffectiveTier | null;
}

export interface CommonSettingsPageData {
	orgId: string;
	orgUrlSegment: string;
	orgUrlSlug: string | null;
	orgName: string | null;
	effectiveTier: EffectiveTier | null;
	permissions: OrganizationMemberPermissions;
	allOrgs: NonNullable<SettingsSubrouteParentData['allOrgs']>;
	isAdmin: boolean;
}

export interface SettingsLoadContext {
	common: CommonSettingsPageData;
	organization: SettingsPageOrganization;
}

export type SettingsSectionLoader<TSectionData extends Record<string, unknown>> = (
	ctx: UseCaseContext,
	context: SettingsLoadContext
) => Promise<TSectionData> | TSectionData;

export async function loadSettingsPage<TSectionData extends Record<string, unknown>>(
	event: SettingsSubrouteLoadEvent,
	loadSectionData: SettingsSectionLoader<TSectionData>
): Promise<(CommonSettingsPageData & TSectionData) | Record<string, never>> {
	const parentData = await event.parent();
	const permissions = getSettingsPermissions(parentData);
	if (!permissions) return {};

	const common = buildCommonSettingsPageData(parentData, permissions);
	const organization = buildSettingsPageOrganization(parentData);

	return loadWithContext(event.locals, event.cookies, common.orgId, {
		policyAction: POLICY_ACTION_CATALOG.organization.accessGovernance,
		policyResource: { kind: 'organization' },
		fn: async (ctx) => ({
			...common,
			...(await loadSectionData(ctx, { common, organization }))
		})
	});
}

export function buildCommonSettingsPageData(
	parentData: SettingsSubrouteParentData,
	permissions: OrganizationMemberPermissions
): CommonSettingsPageData {
	const orgUrlSegment = parentData.orgUrlSegment ?? parentData.orgId;

	return {
		orgId: parentData.orgId,
		orgUrlSegment,
		orgUrlSlug:
			parentData.orgUrlSegment && parentData.orgUrlSegment !== parentData.orgId ? parentData.orgUrlSegment : null,
		orgName: parentData.orgName,
		effectiveTier: parentData.effectiveTier ?? null,
		permissions,
		allOrgs: parentData.allOrgs ?? [],
		isAdmin: Boolean(parentData.isAdmin)
	};
}

export function buildSettingsPageOrganization(parentData: SettingsSubrouteParentData): SettingsPageOrganization {
	const orgUrlSegment = parentData.orgUrlSegment ?? parentData.orgId;

	return {
		id: parentData.orgId,
		name: parentData.orgName,
		urlSlug:
			parentData.orgUrlSegment && parentData.orgUrlSegment !== parentData.orgId ? parentData.orgUrlSegment : null,
		urlSegment: orgUrlSegment,
		effectiveTier: parentData.effectiveTier ?? null
	};
}
