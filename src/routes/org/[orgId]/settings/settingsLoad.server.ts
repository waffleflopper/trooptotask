import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import type { RequestContextBuilder } from '$lib/server/adapters/requestContexts.server';
import type { AppShellRouteData } from '$features/app-shell/contracts';

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
	const parentData = await event.parent();
	if (parentData.shell.kind === 'suspended') return {};

	const common = buildCommonSettingsPageData(parentData);
	const organization = buildSettingsPageOrganization(parentData);

	return loadWithContext(event.locals, event.cookies, common.orgId, {
		context,
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
		urlSegment: orgUrlSegment
	};
}
