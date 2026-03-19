import { json, error } from '@sveltejs/kit';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { getApiContext } from '$lib/server/supabase';
import { createPermissionContext, type PermissionContext, type FeatureArea } from '$lib/server/permissionContext';
import { checkReadOnly } from '$lib/server/read-only-guard';
import { validateUUID } from '$lib/server/validation';
import type { SupabaseClient } from '@supabase/supabase-js';

export type PermissionSpec =
	| { edit: FeatureArea }
	| { view: FeatureArea }
	| { fullEditor: true }
	| { privileged: true }
	| { owner: true }
	| { custom: (ctx: PermissionContext) => void }
	| { none: true };

export interface ApiRouteConfig {
	permission: PermissionSpec;
	readOnly?: boolean;
	blockSandbox?: boolean;
}

export interface ApiRouteContext {
	supabase: SupabaseClient;
	orgId: string;
	userId: string | null;
	isSandbox: boolean;
	ctx: PermissionContext | null;
}

function applyPermission(spec: PermissionSpec, ctx: PermissionContext): void {
	if ('edit' in spec) {
		ctx.requireEdit(spec.edit);
	} else if ('view' in spec) {
		ctx.requireView(spec.view);
	} else if ('fullEditor' in spec) {
		ctx.requireFullEditor();
	} else if ('privileged' in spec) {
		ctx.requirePrivileged();
	} else if ('owner' in spec) {
		ctx.requireOwner();
	} else if ('custom' in spec) {
		spec.custom(ctx);
	}
	// 'none' — no permission check needed
}

export function apiRoute(
	config: ApiRouteConfig,
	handler: (routeCtx: ApiRouteContext, event: RequestEvent) => Promise<Response>
): RequestHandler {
	return async (event: RequestEvent) => {
		const orgId = event.params.orgId as string;

		if (!validateUUID(orgId)) {
			return json({ error: 'Invalid organization ID' }, { status: 400 });
		}

		const { supabase, userId, isSandbox } = getApiContext(event.locals, event.cookies, orgId);

		if (isSandbox && config.blockSandbox) {
			return json({ error: 'This action is not available in sandbox mode' }, { status: 403 });
		}

		let ctx: PermissionContext | null = null;

		if (!isSandbox) {
			if (!userId) {
				throw error(401, 'Unauthorized');
			}
			ctx = await createPermissionContext(supabase, userId, orgId);
			applyPermission(config.permission, ctx);
		}

		const readOnly = config.readOnly ?? true;
		if (readOnly) {
			const blocked = await checkReadOnly(supabase, orgId);
			if (blocked) return blocked;
		}

		return handler({ supabase, orgId, userId, isSandbox, ctx }, event);
	};
}
