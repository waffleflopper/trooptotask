import { z } from 'zod';
import { fail } from '$lib/server/core/errors';
import type { AdvancedDutyPersistencePort, QueryPorts, WritePorts } from '$lib/server/core/ports';
import { DutyTemplateEntity } from '$lib/server/entities/dutyTemplate';
import { DutyTemplateRotationBaselineEntity } from '$lib/server/entities/dutyTemplateRotationBaseline';
import { DutyTemplateSlotEntity } from '$lib/server/entities/dutyTemplateSlot';
import { requireAdvancedDutyAccess, requireAdvancedDutyTemplateManagement } from './advancedDutyAccess';
import type {
	DutyTemplate,
	DutyTemplateRecord,
	DutyTemplateRotationBaseline,
	DutyTemplateRotationBaselineInput,
	DutyTemplateSlot,
	DutyTemplateSlotInput,
	DutyTemplateWriteInput,
	SoftPreferenceConfig
} from '$features/duty-roster/duty-roster.types';
import { DEFAULT_SOFT_PREFERENCE_ORDER, cloneDefaultSoftPreferences } from '$features/duty-roster/duty-roster.types';

const softPreferenceConfigSchema = z.object({
	type: z.enum(DEFAULT_SOFT_PREFERENCE_ORDER),
	enabled: z.boolean()
});

const slotInputSchema = z.object({
	id: z.string().optional(),
	roleLabel: z.string().trim().min(1).max(80),
	quantity: z.number().int().min(1).max(99),
	allowedRanks: z.array(z.string()).optional().default([]),
	allowedGroupIds: z.array(z.string()).optional().default([]),
	preferredGroupIds: z.array(z.string()).optional().default([]),
	allowedMosValues: z.array(z.string()).optional().default([]),
	allowedRoleValues: z.array(z.string()).optional().default([]),
	rotationPoolKey: z.string().trim().min(1).max(120).optional(),
	blockingMode: z.enum(['inherit', 'blocking', 'non-blocking']).optional().default('inherit'),
	sortOrder: z.number().int().min(0).optional()
});

const rotationBaselineInputSchema = z.object({
	rotationPoolKey: z.string().trim().min(1).max(120),
	personId: z.string().trim().min(1),
	lastServedDate: z.string().trim().min(1)
});

const createTemplateSchema = z.object({
	mode: z.enum(['simple', 'advanced']).optional().default('advanced'),
	status: z.enum(['draft', 'active', 'archived']),
	name: z.string().trim().min(1).max(120),
	description: z.string().trim().nullable().optional().default(null),
	scopeType: z.enum(['organization', 'groups']).optional().default('organization'),
	scopeGroupIds: z.array(z.string()).optional().default([]),
	exemptPersonnelIds: z.array(z.string()).optional().default([]),
	exemptStatusTypeIds: z.array(z.string()).optional().default([]),
	coverageMode: z.enum(['all-day', 'timed']).optional().default('all-day'),
	startTime: z.string().nullable().optional().default(null),
	endTime: z.string().nullable().optional().default(null),
	spansMidnight: z.boolean().optional().default(false),
	isBlocking: z.boolean().optional().default(false),
	cooldownHours: z.number().int().min(0).max(168).optional().default(0),
	softPreferences: z.array(softPreferenceConfigSchema).optional().default(cloneDefaultSoftPreferences()),
	slots: z.array(slotInputSchema).optional().default([]),
	rotationBaselines: z.array(rotationBaselineInputSchema).optional().default([])
});

const updateTemplateSchema = createTemplateSchema.extend({
	id: z.string()
});

function parseOrFail<T>(schema: z.ZodType<T>, input: DutyTemplateWriteInput): T {
	const result = schema.safeParse(input);
	if (!result.success) {
		fail(400, result.error.issues.map((issue) => issue.message).join('; '));
	}
	return result.data;
}

function isMissingExemptPersonnelColumnError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	return error.message.includes('exempt_personnel_ids');
}

function isMissingStatusOrSoftPreferenceColumnError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	return error.message.includes('soft_preferences') || error.message.includes('exempt_status_type_ids');
}

function isHttpLikeError(error: unknown): error is { status: number } {
	return Boolean(error && typeof error === 'object' && 'status' in error);
}

function logDutyTemplateError(message: string, error: unknown): void {
	console.error(message, error);
}

function normalizeList(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeSlots(slots: DutyTemplateSlotInput[]): Omit<DutyTemplateSlot, 'id' | 'templateId'>[] {
	return slots
		.map((slot, index) => ({
			roleLabel: slot.roleLabel.trim(),
			quantity: slot.quantity,
			allowedRanks: normalizeList(slot.allowedRanks ?? []),
			allowedGroupIds: normalizeList(slot.allowedGroupIds ?? []),
			preferredGroupIds: normalizeList(slot.preferredGroupIds ?? []),
			allowedMosValues: normalizeList(slot.allowedMosValues ?? []),
			allowedRoleValues: normalizeList(slot.allowedRoleValues ?? []),
			rotationPoolKey: slot.rotationPoolKey?.trim() || `slot-${index + 1}`,
			blockingMode: slot.blockingMode ?? 'inherit',
			sortOrder: slot.sortOrder ?? index
		}))
		.sort((a, b) => a.sortOrder - b.sortOrder);
}

function normalizeRotationBaselines(
	values: DutyTemplateRotationBaselineInput[]
): Omit<DutyTemplateRotationBaseline, 'id' | 'templateId'>[] {
	return values
		.map((value) => ({
			rotationPoolKey: value.rotationPoolKey.trim(),
			personId: value.personId.trim(),
			lastServedDate: value.lastServedDate.trim()
		}))
		.filter((value) => value.rotationPoolKey && value.personId && value.lastServedDate)
		.sort(
			(a, b) =>
				a.rotationPoolKey.localeCompare(b.rotationPoolKey) ||
				a.lastServedDate.localeCompare(b.lastServedDate) ||
				a.personId.localeCompare(b.personId)
		);
}

function normalizeSoftPreferences(values: SoftPreferenceConfig[] | undefined): SoftPreferenceConfig[] {
	const provided = values ?? cloneDefaultSoftPreferences();
	const byType = new Map<SoftPreferenceConfig['type'], SoftPreferenceConfig>();
	const orderedTypes: SoftPreferenceConfig['type'][] = [];

	for (const preference of provided) {
		if (byType.has(preference.type)) {
			byType.set(preference.type, { type: preference.type, enabled: preference.enabled });
			continue;
		}
		orderedTypes.push(preference.type);
		byType.set(preference.type, { type: preference.type, enabled: preference.enabled });
	}

	for (const type of DEFAULT_SOFT_PREFERENCE_ORDER) {
		if (byType.has(type)) {
			continue;
		}
		orderedTypes.push(type);
		byType.set(type, { type, enabled: true });
	}

	return orderedTypes.map((type) => byType.get(type) as SoftPreferenceConfig);
}

function normalizeTemplateInput(
	input: z.infer<typeof createTemplateSchema> | z.infer<typeof updateTemplateSchema>
): Omit<z.infer<typeof createTemplateSchema>, 'slots' | 'rotationBaselines'> & {
	slots: Omit<DutyTemplateSlot, 'id' | 'templateId'>[];
	rotationBaselines: Omit<DutyTemplateRotationBaseline, 'id' | 'templateId'>[];
} {
	const coverageMode = input.coverageMode;
	const slots = normalizeSlots(input.slots);
	const rotationBaselines = normalizeRotationBaselines(input.rotationBaselines);
	const softPreferences = normalizeSoftPreferences(input.softPreferences);
	const scopeGroupIds = input.scopeType === 'organization' ? [] : normalizeList(input.scopeGroupIds);
	const exemptPersonnelIds = normalizeList(input.exemptPersonnelIds);
	const exemptStatusTypeIds = normalizeList(input.exemptStatusTypeIds);
	const normalized = {
		mode: input.mode,
		status: input.status,
		name: input.name.trim(),
		description: input.description?.trim() || null,
		scopeType: input.scopeType,
		scopeGroupIds,
		exemptPersonnelIds,
		exemptStatusTypeIds,
		coverageMode,
		startTime: coverageMode === 'timed' ? input.startTime : null,
		endTime: coverageMode === 'timed' ? input.endTime : null,
		spansMidnight: coverageMode === 'timed' ? input.spansMidnight : false,
		isBlocking: input.isBlocking,
		cooldownHours: input.cooldownHours,
		softPreferences,
		slots,
		rotationBaselines
	};

	if (normalized.status === 'active' && normalized.slots.length === 0) {
		fail(400, 'Active duty templates must include at least one slot.');
	}

	if (normalized.status === 'active' && normalized.scopeType === 'groups' && normalized.scopeGroupIds.length === 0) {
		fail(400, 'Group-scoped active duty templates must target at least one group.');
	}

	if (normalized.coverageMode === 'timed' && (!normalized.startTime || !normalized.endTime)) {
		fail(400, 'Timed duty templates require both a start time and end time.');
	}

	return normalized;
}

function hydrateSlots(rows: Record<string, unknown>[]): DutyTemplateSlot[] {
	return DutyTemplateSlotEntity.fromDbArray(rows).sort((a, b) => a.sortOrder - b.sortOrder);
}

function hydrateTemplate(
	templateRow: Record<string, unknown>,
	slotRows: Record<string, unknown>[] | DutyTemplateSlot[],
	baselineRows: Record<string, unknown>[] | DutyTemplateRotationBaseline[] = []
): DutyTemplate {
	const template = DutyTemplateEntity.fromDb(templateRow);
	const normalizedTemplate: DutyTemplate = {
		...template,
		scopeGroupIds: Array.isArray(template.scopeGroupIds) ? template.scopeGroupIds : [],
		exemptPersonnelIds: Array.isArray(template.exemptPersonnelIds) ? template.exemptPersonnelIds : [],
		exemptStatusTypeIds: Array.isArray(template.exemptStatusTypeIds) ? template.exemptStatusTypeIds : [],
		softPreferences:
			Array.isArray(template.softPreferences) && template.softPreferences.length > 0
				? template.softPreferences
				: cloneDefaultSoftPreferences(),
		slots: [],
		rotationBaselines: []
	};
	const slots =
		Array.isArray(slotRows) && slotRows.length > 0 && 'templateId' in slotRows[0]
			? ([...slotRows] as DutyTemplateSlot[]).sort((a, b) => a.sortOrder - b.sortOrder)
			: hydrateSlots(slotRows as Record<string, unknown>[]);
	const rotationBaselines =
		Array.isArray(baselineRows) && baselineRows.length > 0 && 'templateId' in baselineRows[0]
			? ([...baselineRows] as DutyTemplateRotationBaseline[]).sort(
					(a, b) =>
						a.rotationPoolKey.localeCompare(b.rotationPoolKey) ||
						a.lastServedDate.localeCompare(b.lastServedDate) ||
						a.personId.localeCompare(b.personId)
				)
			: DutyTemplateRotationBaselineEntity.fromDbArray(baselineRows as Record<string, unknown>[]).sort(
					(a, b) =>
						a.rotationPoolKey.localeCompare(b.rotationPoolKey) ||
						a.lastServedDate.localeCompare(b.lastServedDate) ||
						a.personId.localeCompare(b.personId)
				);

	return {
		...normalizedTemplate,
		slots,
		rotationBaselines
	};
}

async function createSlotRows(
	ctx: WritePorts,
	templateId: string,
	slots: Omit<DutyTemplateSlot, 'id' | 'templateId'>[]
): Promise<DutyTemplateSlot[]> {
	if (slots.length === 0) {
		return [];
	}

	const inserted = await ctx.store.insertMany<Record<string, unknown>>(
		'duty_template_slots',
		ctx.auth.orgId,
		buildDutyTemplateSlotRows(ctx.auth.orgId, templateId, slots)
	);

	return hydrateSlots(inserted);
}

function buildDutyTemplateSlotRows(
	orgId: string,
	templateId: string,
	slots: Omit<DutyTemplateSlot, 'id' | 'templateId'>[]
): Record<string, unknown>[] {
	if (slots.length === 0) {
		return [];
	}

	return slots.map((slot) => ({
		...DutyTemplateSlotEntity.toDbInsert(
			{
				templateId,
				roleLabel: slot.roleLabel,
				quantity: slot.quantity,
				allowedRanks: slot.allowedRanks,
				allowedGroupIds: slot.allowedGroupIds,
				preferredGroupIds: slot.preferredGroupIds,
				allowedMosValues: slot.allowedMosValues,
				allowedRoleValues: slot.allowedRoleValues,
				rotationPoolKey: slot.rotationPoolKey,
				blockingMode: slot.blockingMode,
				sortOrder: slot.sortOrder
			},
			orgId
		),
		template_id: templateId
	}));
}

async function createRotationBaselineRows(
	ctx: WritePorts,
	templateId: string,
	baselines: Omit<DutyTemplateRotationBaseline, 'id' | 'templateId'>[]
): Promise<DutyTemplateRotationBaseline[]> {
	if (baselines.length === 0) {
		return [];
	}

	const inserted = await ctx.store.insertMany<Record<string, unknown>>(
		'duty_template_rotation_baselines',
		ctx.auth.orgId,
		buildDutyTemplateRotationBaselineRows(ctx.auth.orgId, templateId, baselines)
	);

	return DutyTemplateRotationBaselineEntity.fromDbArray(inserted).sort(
		(a, b) =>
			a.rotationPoolKey.localeCompare(b.rotationPoolKey) ||
			a.lastServedDate.localeCompare(b.lastServedDate) ||
			a.personId.localeCompare(b.personId)
	);
}

function buildDutyTemplateRotationBaselineRows(
	orgId: string,
	templateId: string,
	baselines: Omit<DutyTemplateRotationBaseline, 'id' | 'templateId'>[]
): Record<string, unknown>[] {
	if (baselines.length === 0) {
		return [];
	}

	const now = new Date().toISOString();
	return baselines.map((baseline) => ({
		...DutyTemplateRotationBaselineEntity.toDbInsert(
			{
				templateId,
				rotationPoolKey: baseline.rotationPoolKey,
				personId: baseline.personId,
				lastServedDate: baseline.lastServedDate
			},
			orgId
		),
		template_id: templateId,
		created_at: now
	}));
}

export async function createDutyTemplate(ctx: WritePorts, input: DutyTemplateWriteInput): Promise<DutyTemplate> {
	requireAdvancedDutyTemplateManagement(ctx.auth);

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}

	try {
		const parsed = parseOrFail(createTemplateSchema, input);
		const normalized = normalizeTemplateInput(parsed);
		const now = new Date().toISOString();
		const templateData = {
			...DutyTemplateEntity.toDbInsert(normalized, ctx.auth.orgId),
			created_at: now,
			updated_at: now
		};
		let row: Record<string, unknown>;
		try {
			row = await ctx.store.insert<Record<string, unknown>>('duty_templates', ctx.auth.orgId, templateData);
		} catch (error) {
			if (isMissingExemptPersonnelColumnError(error)) {
				const fallbackData: Record<string, unknown> = { ...templateData };
				delete fallbackData.exempt_personnel_ids;
				row = await ctx.store.insert<Record<string, unknown>>('duty_templates', ctx.auth.orgId, fallbackData);
			} else if (isMissingStatusOrSoftPreferenceColumnError(error)) {
				logDutyTemplateError('Failed to save duty template policy settings', error);
				fail(
					500,
					'Duty template policy settings could not be saved. Verify duty template migrations are current and retry.'
				);
			} else {
				logDutyTemplateError('Failed to save duty template', error);
				fail(500, 'Failed to save duty template.');
			}
		}
		const slots = await createSlotRows(ctx, row.id as string, normalized.slots);
		const rotationBaselines = await createRotationBaselineRows(ctx, row.id as string, normalized.rotationBaselines);

		ctx.audit.log({
			action: 'duty_template.created',
			resourceType: 'duty_template',
			resourceId: row.id as string
		});

		return hydrateTemplate(row, slots, rotationBaselines);
	} catch (error) {
		if (isHttpLikeError(error)) {
			throw error;
		}
		logDutyTemplateError('Failed to save duty template', error);
		fail(500, 'Failed to save duty template.');
	}
}

export async function updateDutyTemplate(
	ctx: WritePorts & { advancedDutyPersistence: AdvancedDutyPersistencePort },
	input: DutyTemplateWriteInput
): Promise<DutyTemplate> {
	requireAdvancedDutyTemplateManagement(ctx.auth);

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}

	try {
		const parsed = parseOrFail(updateTemplateSchema, input);
		const existing = await ctx.store.findOne<Record<string, unknown>>('duty_templates', ctx.auth.orgId, {
			id: parsed.id,
			mode: 'advanced'
		});
		if (!existing) {
			fail(404, 'Duty template not found');
		}

		const normalized = normalizeTemplateInput(parsed);
		const templateUpdate = {
			...DutyTemplateEntity.toDbUpdate(normalized),
			updated_at: new Date().toISOString()
		};
		const slotRows = buildDutyTemplateSlotRows(ctx.auth.orgId, parsed.id, normalized.slots);
		const rotationBaselineRows = buildDutyTemplateRotationBaselineRows(
			ctx.auth.orgId,
			parsed.id,
			normalized.rotationBaselines
		);
		const persistAggregate = (templateData: Record<string, unknown>) =>
			ctx.advancedDutyPersistence.updateDutyTemplateAggregate({
				orgId: ctx.auth.orgId,
				templateId: parsed.id,
				templateData,
				slotRows,
				rotationBaselineRows
			});
		try {
			let aggregate;
			try {
				aggregate = await persistAggregate(templateUpdate);
			} catch (error) {
				if (!isMissingExemptPersonnelColumnError(error)) {
					throw error;
				}

				const fallbackUpdate: Record<string, unknown> = { ...templateUpdate };
				delete fallbackUpdate.exempt_personnel_ids;
				aggregate = await persistAggregate(fallbackUpdate);
			}

			ctx.audit.log({
				action: 'duty_template.updated',
				resourceType: 'duty_template',
				resourceId: parsed.id
			});

			return hydrateTemplate(
				aggregate.templateRow,
				hydrateSlots(aggregate.slotRows),
				DutyTemplateRotationBaselineEntity.fromDbArray(aggregate.rotationBaselineRows).sort(
					(a, b) =>
						a.rotationPoolKey.localeCompare(b.rotationPoolKey) ||
						a.lastServedDate.localeCompare(b.lastServedDate) ||
						a.personId.localeCompare(b.personId)
				)
			);
		} catch (error) {
			if (isMissingStatusOrSoftPreferenceColumnError(error)) {
				logDutyTemplateError('Failed to update duty template policy settings', error);
				fail(
					500,
					'Duty template policy settings could not be saved. Verify duty template migrations are current and retry.'
				);
			} else if (error instanceof Error && error.message.includes('update_advanced_duty_template_aggregate')) {
				logDutyTemplateError('Failed to update duty template aggregate', error);
				fail(500, 'Failed to update duty template. Verify duty template migrations are current and retry.');
			} else {
				logDutyTemplateError('Failed to update duty template', error);
				fail(500, 'Failed to update duty template.');
			}
		}
	} catch (error) {
		if (isHttpLikeError(error)) {
			throw error;
		}
		logDutyTemplateError('Failed to update duty template', error);
		fail(500, 'Failed to update duty template.');
	}
}

export async function listDutyTemplates(ctx: QueryPorts): Promise<DutyTemplate[]> {
	requireAdvancedDutyAccess(ctx.auth);

	const templateRows = await ctx.store.findMany<Record<string, unknown>>(
		'duty_templates',
		ctx.auth.orgId,
		{ mode: 'advanced' },
		{
			orderBy: [{ column: 'name', ascending: true }]
		}
	);
	if (templateRows.length === 0) {
		return [];
	}

	const ids = templateRows.map((row) => row.id as string);
	const slotRows = await ctx.store.findMany<Record<string, unknown>>(
		'duty_template_slots',
		ctx.auth.orgId,
		{},
		{
			inFilters: { template_id: ids },
			orderBy: [{ column: 'sort_order', ascending: true }]
		}
	);
	const baselineRows = await ctx.store.findMany<Record<string, unknown>>(
		'duty_template_rotation_baselines',
		ctx.auth.orgId,
		{},
		{
			inFilters: { template_id: ids },
			orderBy: [
				{ column: 'rotation_pool_key', ascending: true },
				{ column: 'last_served_date', ascending: true },
				{ column: 'person_id', ascending: true }
			]
		}
	);

	const slotsByTemplate = new Map<string, DutyTemplateSlot[]>();
	for (const slot of hydrateSlots(slotRows)) {
		const existing = slotsByTemplate.get(slot.templateId) ?? [];
		existing.push(slot);
		slotsByTemplate.set(slot.templateId, existing);
	}
	const baselinesByTemplate = new Map<string, DutyTemplateRotationBaseline[]>();
	for (const baseline of DutyTemplateRotationBaselineEntity.fromDbArray(baselineRows)) {
		const existing = baselinesByTemplate.get(baseline.templateId) ?? [];
		existing.push(baseline);
		baselinesByTemplate.set(baseline.templateId, existing);
	}

	return templateRows.map((row) =>
		hydrateTemplate(row, slotsByTemplate.get(row.id as string) ?? [], baselinesByTemplate.get(row.id as string) ?? [])
	);
}

export async function archiveDutyTemplate(ctx: WritePorts, input: { templateId: string }): Promise<DutyTemplate> {
	requireAdvancedDutyTemplateManagement(ctx.auth);

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}

	const existing = await ctx.store.findOne<Record<string, unknown>>('duty_templates', ctx.auth.orgId, {
		id: input.templateId,
		mode: 'advanced'
	});
	if (!existing) {
		fail(404, 'Duty template not found');
	}

	const now = new Date().toISOString();
	const row = await ctx.store.update<Record<string, unknown>>('duty_templates', ctx.auth.orgId, input.templateId, {
		status: 'archived',
		updated_at: now
	});
	const slotRows = await ctx.store.findMany<Record<string, unknown>>(
		'duty_template_slots',
		ctx.auth.orgId,
		{ template_id: input.templateId },
		{ orderBy: [{ column: 'sort_order', ascending: true }] }
	);
	const baselineRows = await ctx.store.findMany<Record<string, unknown>>(
		'duty_template_rotation_baselines',
		ctx.auth.orgId,
		{ template_id: input.templateId },
		{
			orderBy: [
				{ column: 'rotation_pool_key', ascending: true },
				{ column: 'last_served_date', ascending: true },
				{ column: 'person_id', ascending: true }
			]
		}
	);

	ctx.audit.log({
		action: 'duty_template.archived',
		resourceType: 'duty_template',
		resourceId: input.templateId
	});

	return hydrateTemplate(row, slotRows, baselineRows);
}
