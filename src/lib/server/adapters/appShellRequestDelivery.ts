import { error, redirect, type Cookies } from '@sveltejs/kit';
import { getAdmittedRequestClient } from '$lib/server/adapters/requestContexts.server';
import { getOrLoadRequestMembership } from '$lib/access/index.server';
import { resolveOrganizationRouteIdentity } from '$features/organization/index.server';
import { getPreferredOrganizationUrlSegment } from '$features/organization/contracts';
import type { AppShellRequest, AppShellDeferredChromePort } from '$features/app-shell/contracts';
import {
	createSupabaseOrgAccessPort,
	createSupabaseAppShellFirstPaintChromePort,
	createSupabaseAppShellDeferredChromePort,
	loadAppShellFirstPaint,
	loadAppShellDeferredChrome,
	type AppShellFirstPaintRequest
} from '$features/app-shell/index.server';

export interface AppShellRequestDeps {
	getAdmittedRequestClient?: typeof getAdmittedRequestClient;
	createOrgAccessPort?: typeof createSupabaseOrgAccessPort;
	createFirstPaintChromePort?: typeof createSupabaseAppShellFirstPaintChromePort;
	createDeferredChromePort?: typeof createSupabaseAppShellDeferredChromePort;
}

export function createAppShellRequest(
	config: {
		locals: App.Locals;
		cookies: Cookies;
		orgSegment: string;
		url?: URL;
	},
	deps: AppShellRequestDeps = {}
): AppShellRequest {
	const getAdmittedRequestClientFn = deps.getAdmittedRequestClient ?? getAdmittedRequestClient;
	const createOrgAccessPortFn = deps.createOrgAccessPort ?? createSupabaseOrgAccessPort;
	const createFirstPaintChromePortFn = deps.createFirstPaintChromePort ?? createSupabaseAppShellFirstPaintChromePort;
	const createDeferredChromePortFn = deps.createDeferredChromePort ?? createSupabaseAppShellDeferredChromePort;

	async function resolveOrgRoute() {
		const { supabase } = getAdmittedRequestClientFn(config.locals);
		const org = await resolveOrganizationRouteIdentity(supabase, config.orgSegment);

		if (!org) {
			throw error(404, 'Organization not found');
		}

		const orgUrlSegment = getPreferredOrganizationUrlSegment({ id: org.id, urlSlug: org.urlSlug });

		if (config.url && org.urlSlug && config.orgSegment !== org.urlSlug) {
			const currentBase = `/org/${config.orgSegment}`;
			const canonicalBase = `/org/${org.urlSlug}`;
			const pathname = config.url.pathname.startsWith(currentBase)
				? `${canonicalBase}${config.url.pathname.slice(currentBase.length)}`
				: canonicalBase;
			throw redirect(308, `${pathname}${config.url.search}`);
		}

		return { supabase, org, orgUrlSegment };
	}

	async function resolveFirstPaintRequest(): Promise<AppShellFirstPaintRequest> {
		const { supabase, org, orgUrlSegment } = await resolveOrgRoute();

		if (org.suspendedAt) {
			return {
				kind: 'suspended',
				orgId: org.id,
				orgName: org.name ?? 'Organization',
				orgUrlSegment
			};
		}

		if (!config.locals.actor) {
			throw redirect(303, '/auth/login');
		}

		const actor = config.locals.actor;

		return {
			kind: 'ready',
			orgUrlSegment,
			access: createOrgAccessPortFn({
				orgId: org.id,
				userId: actor.userId,
				userSupabase: config.locals.supabase,
				orgName: org.name ?? 'Organization',
				disabledFeatures: org.disabledFeatures,
				wrapMembershipLoad: (loadMembershipRow) =>
					getOrLoadRequestMembership(config.locals, actor.userId, org.id, loadMembershipRow)
			}),
			chrome: createFirstPaintChromePortFn({
				orgId: org.id,
				userId: actor.userId,
				email: config.locals.user?.email ?? null,
				hasTwoFactor: config.locals.hasTwoFactor,
				userSupabase: config.locals.supabase,
				supabase
			})
		};
	}

	async function resolveDeferredChromePort(): Promise<AppShellDeferredChromePort> {
		const { org } = await resolveOrgRoute();

		if (!config.locals.actor) {
			throw redirect(303, '/auth/login');
		}

		return createDeferredChromePortFn({
			orgId: org.id,
			userId: config.locals.actor.userId,
			userSupabase: config.locals.supabase
		});
	}

	return {
		async loadFirstPaint() {
			return loadAppShellFirstPaint(await resolveFirstPaintRequest());
		},
		async loadDeferredChrome(part) {
			return loadAppShellDeferredChrome(part, await resolveDeferredChromePort());
		}
	};
}
