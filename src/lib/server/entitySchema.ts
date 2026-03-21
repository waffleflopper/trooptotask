import { z } from 'zod';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { apiRoute, type PermissionSpec, type AuditConfig } from './apiRoute';
import type { FeatureArea } from './permissionContext';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface FieldMeta {
	column: string | undefined;
	readOnly: boolean;
	insertDefault: unknown | undefined;
	isPersonnelId: boolean;
	nullDefault: unknown | undefined;
}

export interface EntityField<T extends z.ZodTypeAny = z.ZodTypeAny> {
	_zod: T;
	_meta: FieldMeta;
}

export function field<T extends z.ZodTypeAny>(zodType: T, meta?: Partial<FieldMeta>): EntityField<T> {
	return {
		_zod: zodType,
		_meta: {
			column: meta?.column,
			readOnly: meta?.readOnly ?? false,
			insertDefault: meta?.insertDefault,
			isPersonnelId: meta?.isPersonnelId ?? false,
			nullDefault: meta?.nullDefault
		}
	};
}

function camelToSnake(str: string): string {
	return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export type GroupScopeConfig = 'none' | { personnelColumn: string };

export type EntitySchema = Record<string, EntityField>;

export interface EntityConfig<T = unknown> {
	table: string;
	groupScope: GroupScopeConfig;
	schema: EntitySchema;
	customTransform?: (row: Record<string, unknown>) => T;
	permission?: FeatureArea;
	requireFullEditor?: boolean;
	audit?: string | AuditConfig;
	select?: string;
	onDelete?: (supabase: SupabaseClient, orgId: string, id: string) => Promise<void>;
	onAfterDelete?: (context: {
		orgId: string;
		userId: string | null;
		userEmail: string | undefined;
		id: string;
		deletedDetails: Record<string, unknown> | null;
	}) => Promise<void>;
	requireDeletionApproval?: boolean;
}

export interface EntityHandlers {
	POST: RequestHandler;
	PUT: RequestHandler;
	DELETE: RequestHandler;
}

export interface EntityDefinition<T = unknown> {
	table: string;
	groupScope: GroupScopeConfig;
	fieldMap: Record<string, string>;
	reverseMap: Record<string, string>;
	personnelIdField: string | null;
	fromDb: (row: Record<string, unknown>) => T;
	fromDbArray: (rows: Record<string, unknown>[]) => T[];
	toDbInsert: (body: Record<string, unknown>, orgId: string) => Record<string, unknown>;
	toDbUpdate: (body: Record<string, unknown>) => Record<string, unknown>;
	createSchema: z.ZodObject<z.ZodRawShape>;
	updateSchema: z.ZodObject<z.ZodRawShape>;
	handlers: EntityHandlers;
}

export function defineEntity<T = unknown>(config: EntityConfig<T>): EntityDefinition<T> {
	const { schema, table, groupScope } = config;

	// Build fieldMap: camelCase key → snake_case column
	const fieldMap: Record<string, string> = {};
	const reverseMap: Record<string, string> = {};

	for (const [key, entityField] of Object.entries(schema)) {
		const column = entityField._meta.column ?? camelToSnake(key);
		fieldMap[key] = column;
		reverseMap[column] = key;
	}

	// Detect personnelIdField
	let personnelIdField: string | null = null;
	for (const [key, entityField] of Object.entries(schema)) {
		if (entityField._meta.isPersonnelId) {
			personnelIdField = key;
			break;
		}
	}

	// fromDb: snake_case row → camelCase object
	function defaultFromDb(row: Record<string, unknown>): T {
		const result: Record<string, unknown> = {};
		for (const [column, value] of Object.entries(row)) {
			const key = reverseMap[column] ?? column;
			const entityField = schema[key];
			if (entityField && value === null && entityField._meta.nullDefault !== undefined) {
				result[key] = entityField._meta.nullDefault;
			} else {
				result[key] = value;
			}
		}
		return result as T;
	}

	const fromDb = config.customTransform ?? defaultFromDb;
	const fromDbArray = (rows: Record<string, unknown>[]) => rows.map(fromDb);

	// toDbInsert: camelCase body → snake_case insert with org_id + defaults
	function toDbInsert(body: Record<string, unknown>, orgId: string): Record<string, unknown> {
		const result: Record<string, unknown> = { organization_id: orgId };

		for (const [key, entityField] of Object.entries(schema)) {
			if (key === 'id') continue;
			if (entityField._meta.readOnly) continue;
			const column = fieldMap[key];
			if (body[key] !== undefined) {
				result[column] = body[key];
			} else if (entityField._meta.insertDefault !== undefined) {
				result[column] = entityField._meta.insertDefault;
			}
		}

		return result;
	}

	// toDbUpdate: camelCase body → snake_case updates (skip readOnly, id, undefined)
	function toDbUpdate(body: Record<string, unknown>): Record<string, unknown> {
		const result: Record<string, unknown> = {};

		for (const [key, entityField] of Object.entries(schema)) {
			if (key === 'id') continue;
			if (entityField._meta.readOnly) continue;
			if (body[key] === undefined) continue;
			result[fieldMap[key]] = body[key];
		}

		return result;
	}

	// createSchema: exclude readOnly, make insertDefault fields optional
	const createShape: Record<string, z.ZodTypeAny> = {};
	for (const [key, entityField] of Object.entries(schema)) {
		if (key === 'id') continue;
		if (entityField._meta.readOnly) continue;
		if (entityField._meta.insertDefault !== undefined) {
			createShape[key] = entityField._zod.optional();
		} else {
			createShape[key] = entityField._zod;
		}
	}
	const createSchema = z.object(createShape);

	// updateSchema: all non-readOnly optional, require id
	const updateShape: Record<string, z.ZodTypeAny> = { id: z.string() };
	for (const [key, entityField] of Object.entries(schema)) {
		if (key === 'id') continue;
		if (entityField._meta.readOnly) continue;
		updateShape[key] = entityField._zod.optional();
	}
	const updateSchema = z.object(updateShape);

	// Build handlers
	const permissionSpec: PermissionSpec = config.requireFullEditor
		? { fullEditor: true }
		: config.permission
			? { edit: config.permission }
			: { authenticated: true };

	const select = config.select ?? '*';

	// Determine scopeByPersonnel for POST group scope
	const scopeByPersonnel = groupScope !== 'none' && personnelIdField ? fieldMap[personnelIdField] : undefined;

	const POST = apiRoute(
		{
			permission: permissionSpec,
			schema: createSchema,
			audit: config.audit,
			scopeByPersonnel
		},
		async ({ supabase, orgId, body: validatedBody }) => {
			const insertData = toDbInsert(validatedBody ?? {}, orgId);

			const { data, error: dbError } = await supabase.from(table).insert(insertData).select(select).single();

			if (dbError) throw error(500, dbError.message);

			const row = data as unknown as Record<string, unknown>;
			return json(fromDb(row));
		}
	);

	const PUT = apiRoute(
		{
			permission: permissionSpec,
			schema: updateSchema,
			audit: config.audit
		},
		async ({ supabase, orgId, body: validatedBody, ctx }) => {
			const body = validatedBody ?? {};
			const { id } = body as { id: string };

			if (!id) throw error(400, 'Missing id');

			const { validateUUID } = await import('./validation');
			if (!validateUUID(id)) throw error(400, 'Invalid resource ID');

			// Group scope enforcement for PUT
			if (groupScope !== 'none' && personnelIdField) {
				await ctx.requireGroupAccessByRecord(supabase, table, id, orgId, groupScope.personnelColumn);
			}

			const updates = toDbUpdate(body);

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

			const row = data as unknown as Record<string, unknown>;
			return json(fromDb(row));
		}
	);

	const DELETE = apiRoute(
		{
			permission: permissionSpec,
			audit: config.audit
		},
		async ({ supabase, orgId, userId, ctx }, event) => {
			const body = await event.request.json();
			const { id } = body;

			if (!id) throw error(400, 'Missing id');

			const { validateUUID } = await import('./validation');
			if (!validateUUID(id)) throw error(400, 'Invalid resource ID');

			// Group scope enforcement for DELETE
			if (groupScope !== 'none' && personnelIdField) {
				await ctx.requireGroupAccessByRecord(supabase, table, id, orgId, groupScope.personnelColumn);
			}

			// Deletion approval check
			if (config.requireDeletionApproval && !ctx.isPrivileged && !ctx.isFullEditor) {
				return json({ requiresApproval: true }, { status: 202 });
			}

			// Cascade delete
			if (config.onDelete) {
				await config.onDelete(supabase, orgId, id);
			}

			const { error: dbError } = await supabase.from(table).delete().eq('id', id).eq('organization_id', orgId);

			if (dbError) throw error(500, dbError.message);

			// After-delete callback
			if (config.onAfterDelete) {
				await config.onAfterDelete({
					orgId,
					userId: userId ?? null,
					userEmail: event.locals.user?.email,
					id,
					deletedDetails: null
				});
			}

			return json({ success: true });
		}
	);

	const handlers: EntityHandlers = { POST, PUT, DELETE };

	return {
		table,
		groupScope,
		fieldMap,
		reverseMap,
		personnelIdField,
		fromDb,
		fromDbArray,
		toDbInsert,
		toDbUpdate,
		createSchema,
		updateSchema,
		handlers
	};
}
