import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import type { UseCaseContext } from '$lib/server/core/ports';
import type { EffectiveTier } from '$lib/types/subscription';
import type { AppShellRouteData } from '$lib/server/core/orgShell';

export type SettingsSubrouteParentData = AppShellRouteData;

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
	if (parentData.shell.kind === 'suspended') return {};

	const common = buildCommonSettingsPageData(parentData);
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

export function buildCommonSettingsPageData(parentData: SettingsSubrouteParentData): CommonSettingsPageData {
	if (parentData.shell.kind !== 'ready') {
		throw new Error('Settings page data requires a ready app shell');
	}

	const shell = parentData.shell;
	const orgUrlSegment = shell.org.urlSegment;

	return {
		orgId: shell.org.id,
		orgUrlSegment,
		orgUrlSlug: orgUrlSegment !== shell.org.id ? orgUrlSegment : null,
		orgName: shell.org.name,
		effectiveTier: shell.state.effectiveTier,
		isAdmin: shell.member.isAdmin
	};
}

export function buildSettingsPageOrganization(parentData: SettingsSubrouteParentData): SettingsPageOrganization {
	if (parentData.shell.kind !== 'ready') {
		throw new Error('Settings organization data requires a ready app shell');
	}

	const shell = parentData.shell;
	const orgUrlSegment = shell.org.urlSegment;

	return {
		id: shell.org.id,
		name: shell.org.name,
		urlSlug: orgUrlSegment !== shell.org.id ? orgUrlSegment : null,
		urlSegment: orgUrlSegment,
		effectiveTier: shell.state.effectiveTier
	};
}
