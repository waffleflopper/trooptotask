import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPermissionContext, type FeatureArea } from './permissionContext';
import { getApiContext } from './supabase';
import { checkReadOnly } from './read-only-guard';
import { validateUUID } from './validation';

/**
 * Field mapping configuration for camelCase <-> snake_case conversion
 * Key: camelCase field name used in API
 * Value: snake_case column name in database
 */
export type FieldMapping = Record<string, string>;

/**
 * Configuration for a CRUD endpoint
 */
export interface CrudConfig<T> {
	/** Database table name */
	table: string;

	/** Permission type required for edit operations */
	permission: FeatureArea;

	/**
	 * Field mappings from camelCase (API) to snake_case (DB)
	 * Only include fields that need explicit mapping.
	 * Fields with same name in both are auto-handled.
	 */
	fields: FieldMapping;

	/** Fields to select when returning data (snake_case). Defaults to '*' */
	select?: string;

	/** Default values for insert (snake_case keys) */
	defaults?: Record<string, unknown>;

	/**
	 * Optional cascade delete handler.
	 * Called before the main delete to clean up related records.
	 */
	onDelete?: (supabase: SupabaseClient, orgId: string, id: string) => Promise<void>;

	/**
	 * Optional callback after successful delete.
	 * Called with context about what was deleted, for notifications etc.
	 */
	onAfterDelete?: (context: {
		orgId: string;
		userId: string | null;
		userEmail: string | undefined;
		id: string;
		deletedDetails: Record<string, unknown> | null;
	}) => Promise<void>;

	/**
	 * Transform the database row to API response format.
	 * If not provided, uses automatic field mapping.
	 */
	toResponse?: (row: Record<string, unknown>) => T;

	/**
	 * Transform API request body to database insert format.
	 * If not provided, uses automatic field mapping with defaults.
	 */
	toInsert?: (body: Record<string, unknown>, orgId: string) => Record<string, unknown>;

	/** DB column containing personnel_id for group scope enforcement */
	personnelIdField?: string;

	/** If set, audit log mutations with this resource type */
	auditResourceType?: string;

	/** DB column names to capture in audit details (e.g. ['name', 'color']) */
	auditDetailFields?: string[];

	/** When true, require full-editor/admin/owner instead of basic edit permission */
	requireFullEditor?: boolean;

	/** When true, non-privileged members must get approval before deleting */
	requireDeletionApproval?: boolean;
}

/**
 * Converts a camelCase string to snake_case
 */
function camelToSnake(str: string): string {
	return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Converts a snake_case string to camelCase
 */
function snakeToCamel(str: string): string {
	return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Creates a reverse mapping (snake_case -> camelCase)
 */
function reverseMapping(mapping: FieldMapping): FieldMapping {
	const reversed: FieldMapping = {};
	for (const [camel, snake] of Object.entries(mapping)) {
		reversed[snake] = camel;
	}
	return reversed;
}

/**
 * Transforms a database row to API response format using field mapping
 */
function dbToApi<T>(row: Record<string, unknown>, fields: FieldMapping): T {
	const reversed = reverseMapping(fields);
	const result: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(row)) {
		// Use explicit mapping if available, otherwise convert snake_case to camelCase
		const apiKey = reversed[key] ?? snakeToCamel(key);
		result[apiKey] = value;
	}

	return result as T;
}

/**
 * Transforms API request body to database format using field mapping
 */
function apiToDb(
	body: Record<string, unknown>,
	fields: FieldMapping,
	orgId: string,
	defaults?: Record<string, unknown>
): Record<string, unknown> {
	const result: Record<string, unknown> = {
		organization_id: orgId,
		...defaults
	};

	for (const [key, value] of Object.entries(body)) {
		if (key === 'id') continue; // Skip id field
		// Use explicit mapping if available, otherwise convert camelCase to snake_case
		const dbKey = fields[key] ?? camelToSnake(key);
		result[dbKey] = value;
	}

	return result;
}

/**
 * Transforms API request body to database update format
 */
function apiToDbUpdates(body: Record<string, unknown>, fields: FieldMapping): Record<string, unknown> {
	const updates: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(body)) {
		if (key === 'id') continue;
		if (value === undefined) continue;
		const dbKey = fields[key] ?? camelToSnake(key);
		updates[dbKey] = value;
	}

	return updates;
}

/**
 * Creates CRUD request handlers for a database table
 */
export function createCrudHandlers<T>(config: CrudConfig<T>): {
	POST: RequestHandler;
	PUT: RequestHandler;
	DELETE: RequestHandler;
} {
	const { table, permission, fields, select = '*', defaults, onDelete, toResponse, toInsert } = config;

	const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
		const { orgId } = params;
		if (!orgId) throw error(400, 'Missing orgId');
		if (!validateUUID(orgId)) throw error(400, 'Invalid organization ID');

		const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

		const ctx = !isSandbox ? await createPermissionContext(supabase, userId!, orgId) : null;

		if (ctx) {
			if (config.requireFullEditor) {
				ctx.requireFullEditor();
			} else {
				ctx.requireEdit(permission);
			}
		}

		const blocked = await checkReadOnly(supabase, orgId);
		if (blocked) return blocked;

		const body = await request.json();

		if (config.personnelIdField && ctx?.scopedGroupId) {
			const personnelId = body[snakeToCamel(config.personnelIdField)] ?? body[config.personnelIdField];
			if (personnelId) {
				const { data: person } = await supabase.from('personnel').select('group_id').eq('id', personnelId).single();
				if (person && person.group_id !== ctx.scopedGroupId) {
					throw error(403, 'You do not have access to personnel outside your group');
				}
			}
		}

		const insertData = toInsert ? toInsert(body, orgId) : apiToDb(body, fields, orgId, defaults);

		const { data, error: dbError } = await supabase.from(table).insert(insertData).select(select).single();

		if (dbError) throw error(500, dbError.message);

		const row = data as unknown as Record<string, unknown>;

		if (config.auditResourceType) {
			const { auditLog } = await import('./auditLog');
			const details: Record<string, unknown> = { actor: locals.user?.email ?? userId };
			if (config.auditDetailFields) {
				for (const col of config.auditDetailFields) {
					if (row[col] !== undefined) details[col] = row[col];
				}
			}
			auditLog(
				{
					action: `${config.auditResourceType}.created`,
					resourceType: config.auditResourceType,
					resourceId: row.id as string,
					orgId,
					details
				},
				{ userId }
			);
		}
		const response = toResponse ? toResponse(row) : dbToApi<T>(row, fields);
		return json(response);
	};

	const PUT: RequestHandler = async ({ params, request, locals, cookies }) => {
		const { orgId } = params;
		if (!orgId) throw error(400, 'Missing orgId');
		if (!validateUUID(orgId)) throw error(400, 'Invalid organization ID');

		const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

		const ctx = !isSandbox ? await createPermissionContext(supabase, userId!, orgId) : null;

		if (ctx) {
			if (config.requireFullEditor) {
				ctx.requireFullEditor();
			} else {
				ctx.requireEdit(permission);
			}
		}

		const blocked = await checkReadOnly(supabase, orgId);
		if (blocked) return blocked;

		const body = await request.json();
		const { id } = body;

		if (!id) throw error(400, 'Missing id');
		if (!validateUUID(id)) throw error(400, 'Invalid resource ID');

		if (config.personnelIdField && ctx?.scopedGroupId) {
			const { data: existing } = await supabase
				.from(table)
				.select(config.personnelIdField)
				.eq('id', id)
				.eq('organization_id', orgId)
				.single();
			const personnelId = (existing as Record<string, unknown> | null)?.[config.personnelIdField!];
			if (personnelId) {
				const { data: person } = await supabase.from('personnel').select('group_id').eq('id', personnelId).single();
				if (person && person.group_id !== ctx.scopedGroupId) {
					throw error(403, 'You do not have access to personnel outside your group');
				}
			}
		}

		const updates = apiToDbUpdates(body, fields);

		if (Object.keys(updates).length === 0) {
			throw error(400, 'No fields to update');
		}

		const { data, error: dbError } = await supabase
			.from(table)
			.update(updates)
			.eq('id', id)
			.eq('organization_id', orgId)
			.select(select)
			.single();

		if (dbError) throw error(500, dbError.message);

		if (config.auditResourceType) {
			const { auditLog } = await import('./auditLog');
			const details: Record<string, unknown> = { actor: locals.user?.email ?? userId };
			const updatedRow = data as unknown as Record<string, unknown>;
			if (config.auditDetailFields) {
				for (const col of config.auditDetailFields) {
					if (updatedRow[col] !== undefined) details[col] = updatedRow[col];
				}
			}
			auditLog(
				{
					action: `${config.auditResourceType}.updated`,
					resourceType: config.auditResourceType,
					resourceId: id,
					orgId,
					details
				},
				{ userId }
			);
		}

		const row = data as unknown as Record<string, unknown>;
		const response = toResponse ? toResponse(row) : dbToApi<T>(row, fields);
		return json(response);
	};

	const DELETE: RequestHandler = async ({ params, request, locals, cookies }) => {
		const { orgId } = params;
		if (!orgId) throw error(400, 'Missing orgId');
		if (!validateUUID(orgId)) throw error(400, 'Invalid organization ID');

		const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

		const ctx = !isSandbox ? await createPermissionContext(supabase, userId!, orgId) : null;

		if (ctx) {
			if (config.requireFullEditor) {
				ctx.requireFullEditor();
			} else {
				ctx.requireEdit(permission);
			}
		}

		const blocked = await checkReadOnly(supabase, orgId);
		if (blocked) return blocked;

		const body = await request.json();
		const { id } = body;

		if (!id) throw error(400, 'Missing id');
		if (!validateUUID(id)) throw error(400, 'Invalid resource ID');

		if (config.personnelIdField && ctx?.scopedGroupId) {
			const { data: existing } = await supabase
				.from(table)
				.select(config.personnelIdField)
				.eq('id', id)
				.eq('organization_id', orgId)
				.single();
			const personnelId = (existing as Record<string, unknown> | null)?.[config.personnelIdField!];
			if (personnelId) {
				const { data: person } = await supabase.from('personnel').select('group_id').eq('id', personnelId).single();
				if (person && person.group_id !== ctx.scopedGroupId) {
					throw error(403, 'You do not have access to personnel outside your group');
				}
			}
		}

		if (config.requireDeletionApproval && ctx && !ctx.isPrivileged && !ctx.isFullEditor) {
			return json({ requiresApproval: true }, { status: 202 });
		}

		// Capture record details before deletion for audit log
		let deletedDetails: Record<string, unknown> | null = null;
		if (config.auditResourceType && config.auditDetailFields?.length) {
			const { data: existing } = await supabase
				.from(table)
				.select(config.auditDetailFields.join(', '))
				.eq('id', id)
				.eq('organization_id', orgId)
				.single();
			if (existing) deletedDetails = existing as unknown as Record<string, unknown>;
		}

		// Run cascade delete if configured
		if (onDelete) {
			await onDelete(supabase, orgId, id);
		}

		const { error: dbError } = await supabase.from(table).delete().eq('id', id).eq('organization_id', orgId);

		if (dbError) throw error(500, dbError.message);

		if (config.auditResourceType) {
			const { auditLog } = await import('./auditLog');
			const details: Record<string, unknown> = { actor: locals.user?.email ?? userId };
			if (deletedDetails) {
				Object.assign(details, deletedDetails);
			}
			auditLog(
				{
					action: `${config.auditResourceType}.deleted`,
					resourceType: config.auditResourceType,
					resourceId: id,
					orgId,
					details
				},
				{ userId }
			);
		}

		if (config.onAfterDelete) {
			await config.onAfterDelete({
				orgId,
				userId: userId ?? null,
				userEmail: locals.user?.email,
				id,
				deletedDetails
			});
		}

		return json({ success: true });
	};

	return { POST, PUT, DELETE };
}
