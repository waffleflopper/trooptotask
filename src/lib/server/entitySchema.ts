import { z } from 'zod';
import type { FeatureArea } from './permissionContext';
import { createRepository, type Repository } from './repositoryFactory';

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

export type EntityMethod = 'POST' | 'PUT' | 'DELETE';

export type EntitySchema = Record<string, EntityField>;

export interface EntityConfig<T = unknown> {
	table: string;
	groupScope: GroupScopeConfig;
	schema: EntitySchema;
	customTransform?: (row: Record<string, unknown>) => T;
	permission?: FeatureArea;
	requireFullEditor?: boolean;
	audit?: string | { resourceType: string; action?: string; detailFields?: string[] };
	select?: string;
	methods?: EntityMethod[];
	orderBy?: Array<{ column: string; ascending?: boolean }>;
}

export interface EntityDefinition<T = unknown> {
	table: string;
	groupScope: GroupScopeConfig;
	methods: EntityMethod[];
	fieldMap: Record<string, string>;
	reverseMap: Record<string, string>;
	personnelIdField: string | null;
	fromDb: (row: Record<string, unknown>) => T;
	fromDbArray: (rows: Record<string, unknown>[]) => T[];
	toDbInsert: (body: Record<string, unknown>, orgId: string) => Record<string, unknown>;
	toDbUpdate: (body: Record<string, unknown>) => Record<string, unknown>;
	createSchema: z.ZodObject<z.ZodRawShape>;
	updateSchema: z.ZodObject<z.ZodRawShape>;
	select: string;
	repo: Repository<T>;
}

export function defineEntity<T = unknown>(config: EntityConfig<T>): EntityDefinition<T> {
	const { schema, table, groupScope } = config;

	const allowedMethods: EntityMethod[] = config.methods ?? ['POST', 'PUT', 'DELETE'];

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

	// Validate groupScope.personnelColumn matches isPersonnelId field
	if (groupScope !== 'none') {
		if (!personnelIdField) {
			throw new Error(`Entity "${table}": groupScope has personnelColumn but no field is marked isPersonnelId`);
		}
		const expectedColumn = fieldMap[personnelIdField];
		if (groupScope.personnelColumn !== expectedColumn) {
			throw new Error(
				`Entity "${table}": groupScope.personnelColumn mismatch — ` +
					`got "${groupScope.personnelColumn}" but isPersonnelId field "${personnelIdField}" maps to "${expectedColumn}"`
			);
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

	const select = config.select ?? '*';

	// Build repository
	const repo = createRepository<T>({
		table,
		transform: fromDbArray,
		select,
		orderBy: config.orderBy
	});

	return {
		table,
		groupScope,
		methods: allowedMethods,
		fieldMap,
		reverseMap,
		personnelIdField,
		fromDb,
		fromDbArray,
		toDbInsert,
		toDbUpdate,
		createSchema,
		updateSchema,
		select,
		repo
	};
}
