import { json, error } from '@sveltejs/kit';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { getApiContext } from '$lib/server/supabase';
import {
	createPermissionContext,
	createSandboxContext,
	type PermissionContext,
	type FeatureArea
} from '$lib/server/permissionContext';
import { checkReadOnly } from '$lib/server/read-only-guard';
import { validateUUID } from '$lib/server/validation';
import { auditLog, getRequestInfo } from '$lib/server/auditLog';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ZodType } from 'zod';

export type PermissionSpec =
	| { edit: FeatureArea }
	| { view: FeatureArea }
	| { fullEditor: true }
	| { privileged: true }
	| { owner: true }
	| { manageMembers: true }
	| { authenticated: true }
	| { custom: (ctx: PermissionContext) => void };

export interface AuditConfig {
	resourceType: string;
	action?: string;
	detailFields?: string[];
}

export interface ApiRouteConfig {
	permission: PermissionSpec;
	readOnly?: boolean;
	blockSandbox?: boolean;
	groupScope?: {
		resolvePersonnelId: (event: RequestEvent) => Promise<string | null>;
	};
	audit?: string | AuditConfig;
	schema?: ZodType;
	scopeByPersonnel?: string;
}

export interface ApiRouteContext {
	supabase: SupabaseClient;
	orgId: string;
	userId: string | null;
	isSandbox: boolean;
	ctx: PermissionContext;
	body?: Record<string, unknown>;
	setAuditResourceId: (id: string) => void;
	audit: (action: string, details?: Record<string, unknown>, resourceId?: string) => void;
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
	} else if ('manageMembers' in spec) {
		ctx.requireManageMembers();
	} else if ('custom' in spec) {
		spec.custom(ctx);
	}
	// 'authenticated' — no permission check needed
}

export function snakeToCamel(str: string): string {
	return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function resolveAuditConfig(audit: string | AuditConfig): AuditConfig {
	if (typeof audit === 'string') {
		return { resourceType: audit };
	}
	return audit;
}

function methodToAction(method: string): string {
	switch (method) {
		case 'POST':
			return 'created';
		case 'PUT':
		case 'PATCH':
			return 'updated';
		case 'DELETE':
			return 'deleted';
		default:
			return 'accessed';
	}
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

		let ctx: PermissionContext;

		if (isSandbox) {
			ctx = createSandboxContext();
		} else {
			if (!userId) {
				throw error(401, 'Unauthorized');
			}
			ctx = await createPermissionContext(supabase, userId, orgId);
			applyPermission(config.permission, ctx);
		}

		if (config.groupScope) {
			const personnelId = await config.groupScope.resolvePersonnelId(event);
			if (personnelId) {
				await ctx.requireGroupAccess(supabase, personnelId);
			}
		}

		const readOnly = config.readOnly ?? true;
		if (readOnly) {
			const blocked = await checkReadOnly(supabase, orgId);
			if (blocked) return blocked;
		}

		let auditResourceId: string | undefined;
		let manualAuditCalled = false;
		let parsedBody: Record<string, unknown> | undefined;

		const auditConfig = config.audit ? resolveAuditConfig(config.audit) : undefined;
		const needsBodyParse = config.schema || config.scopeByPersonnel || auditConfig?.detailFields?.length;

		if (needsBodyParse) {
			let rawBody: unknown;
			try {
				rawBody = await event.request.clone().json();
			} catch {
				if (config.schema) {
					return json({ error: 'Invalid JSON in request body' }, { status: 400 });
				}
				// Body parsing failure is not fatal for audit-only
			}

			if (config.schema && rawBody !== undefined) {
				const result = config.schema.safeParse(rawBody);
				if (!result.success) {
					const issues = result.error.issues.map((i) => ({
						path: i.path.join('.'),
						message: i.message
					}));
					return json({ error: 'Validation error', issues }, { status: 400 });
				}
				parsedBody = result.data as Record<string, unknown>;
			} else if (rawBody !== undefined) {
				parsedBody = rawBody as Record<string, unknown>;
			}
		}

		if (config.scopeByPersonnel && ctx.scopedGroupId) {
			const camelField = snakeToCamel(config.scopeByPersonnel);
			const personnelId = parsedBody?.[camelField] ?? parsedBody?.[config.scopeByPersonnel];
			if (!personnelId || typeof personnelId !== 'string') {
				return json({ error: 'Missing required personnel ID for group scope check' }, { status: 400 });
			}
			await ctx.requireGroupAccess(supabase, personnelId);
		}

		const setAuditResourceId = (id: string) => {
			auditResourceId = id;
		};

		const manualAudit = (action: string, details?: Record<string, unknown>, resourceId?: string) => {
			manualAuditCalled = true;
			try {
				const requestInfo = getRequestInfo(event);
				auditLog(
					{
						action,
						resourceType: auditConfig?.resourceType ?? action.split('.')[0],
						resourceId,
						orgId,
						details
					},
					{ userId: requestInfo.userId, ip: requestInfo.ip, userAgent: requestInfo.userAgent }
				);
			} catch {
				// fire-and-forget: manual audit failure must never break the response
			}
		};

		const routeCtx: ApiRouteContext = {
			supabase,
			orgId,
			userId,
			isSandbox,
			ctx,
			body: parsedBody,
			setAuditResourceId,
			audit: manualAudit
		};

		const response = await handler(routeCtx, event);

		if (config.audit && !manualAuditCalled && response.status >= 200 && response.status < 300) {
			const action = auditConfig!.action ?? `${auditConfig!.resourceType}.${methodToAction(event.request.method)}`;
			const requestInfo = getRequestInfo(event);

			let details: Record<string, unknown> | undefined;
			if (auditConfig!.detailFields?.length && parsedBody) {
				details = {};
				for (const field of auditConfig!.detailFields!) {
					if (parsedBody[field] !== undefined) {
						details[field] = parsedBody[field];
					}
				}
			}

			try {
				auditLog(
					{
						action,
						resourceType: auditConfig!.resourceType,
						resourceId: auditResourceId,
						orgId,
						details
					},
					{ userId: requestInfo.userId, ip: requestInfo.ip, userAgent: requestInfo.userAgent }
				);
			} catch {
				// fire-and-forget: audit failure must never break the response
			}
		}

		return response;
	};
}
