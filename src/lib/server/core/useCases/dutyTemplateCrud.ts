import { z } from 'zod';
import { fail } from '$lib/server/core/errors';
import type { QueryPorts, WritePorts } from '$lib/server/core/ports';
import { DutyTemplateEntity } from '$lib/server/entities/dutyTemplate';
import { DutyTemplateSlotEntity } from '$lib/server/entities/dutyTemplateSlot';
import type {
	DutyTemplate,
	DutyTemplateRecord,
	DutyTemplateSlot,
	DutyTemplateSlotInput,
	DutyTemplateWriteInput
} from '$features/duty-roster/duty-roster.types';

const slotInputSchema = z.object({
	id: z.string().optional(),
	roleLabel: z.string().trim().min(1).max(80),
	quantity: z.number().int().min(1).max(99),
	allowedRanks: z.array(z.string()).optional().default([]),
	allowedGroupIds: z.array(z.string()).optional().default([]),
	allowedMosValues: z.array(z.string()).optional().default([]),
	allowedRoleValues: z.array(z.string()).optional().default([]),
	sortOrder: z.number().int().min(0).optional()
});

const createTemplateSchema = z.object({
	mode: z.enum(['simple', 'advanced']).optional().default('advanced'),
	status: z.enum(['draft', 'active', 'archived']),
	name: z.string().trim().min(1).max(120),
	description: z.string().trim().nullable().optional().default(null),
	scopeType: z.enum(['organization', 'groups']).optional().default('organization'),
	scopeGroupIds: z.array(z.string()).optional().default([]),
	coverageMode: z.enum(['all-day', 'timed']).optional().default('all-day'),
	startTime: z.string().nullable().optional().default(null),
	endTime: z.string().nullable().optional().default(null),
	isBlocking: z.boolean().optional().default(false),
	cooldownHours: z.number().int().min(0).max(168).optional().default(0),
	slots: z.array(slotInputSchema).optional().default([])
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
			allowedMosValues: normalizeList(slot.allowedMosValues ?? []),
			allowedRoleValues: normalizeList(slot.allowedRoleValues ?? []),
			sortOrder: slot.sortOrder ?? index
		}))
		.sort((a, b) => a.sortOrder - b.sortOrder);
}

function normalizeTemplateInput(
	input: z.infer<typeof createTemplateSchema> | z.infer<typeof updateTemplateSchema>
): Omit<z.infer<typeof createTemplateSchema>, 'slots'> & { slots: Omit<DutyTemplateSlot, 'id' | 'templateId'>[] } {
	const coverageMode = input.coverageMode;
	const slots = normalizeSlots(input.slots);
	const scopeGroupIds = input.scopeType === 'organization' ? [] : normalizeList(input.scopeGroupIds);
	const normalized = {
		mode: input.mode,
		status: input.status,
		name: input.name.trim(),
		description: input.description?.trim() || null,
		scopeType: input.scopeType,
		scopeGroupIds,
		coverageMode,
		startTime: coverageMode === 'timed' ? input.startTime : null,
		endTime: coverageMode === 'timed' ? input.endTime : null,
		isBlocking: input.isBlocking,
		cooldownHours: input.cooldownHours,
		slots
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
	slotRows: Record<string, unknown>[] | DutyTemplateSlot[]
): DutyTemplate {
	const template = DutyTemplateEntity.fromDb(templateRow);
	const slots = Array.isArray(slotRows) && slotRows.length > 0 && 'templateId' in slotRows[0]
		? ([...slotRows] as DutyTemplateSlot[]).sort((a, b) => a.sortOrder - b.sortOrder)
		: hydrateSlots(slotRows as Record<string, unknown>[]);

	return {
		...template,
		slots
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
		slots.map((slot) => ({
			...DutyTemplateSlotEntity.toDbInsert(
				{
					templateId,
					roleLabel: slot.roleLabel,
					quantity: slot.quantity,
					allowedRanks: slot.allowedRanks,
					allowedGroupIds: slot.allowedGroupIds,
					allowedMosValues: slot.allowedMosValues,
					allowedRoleValues: slot.allowedRoleValues,
					sortOrder: slot.sortOrder
				},
				ctx.auth.orgId
			),
			template_id: templateId
		}))
	);

	return hydrateSlots(inserted);
}

export async function createDutyTemplate(ctx: WritePorts, input: DutyTemplateWriteInput): Promise<DutyTemplate> {
	ctx.auth.requirePrivileged();

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}

	const parsed = parseOrFail(createTemplateSchema, input);
	const normalized = normalizeTemplateInput(parsed);
	const now = new Date().toISOString();
	const templateData = {
		...DutyTemplateEntity.toDbInsert(normalized, ctx.auth.orgId),
		created_at: now,
		updated_at: now
	};
	const row = await ctx.store.insert<Record<string, unknown>>('duty_templates', ctx.auth.orgId, templateData);
	const slots = await createSlotRows(ctx, row.id as string, normalized.slots);

	ctx.audit.log({
		action: 'duty_template.created',
		resourceType: 'duty_template',
		resourceId: row.id as string
	});

	return hydrateTemplate(row, slots);
}

export async function updateDutyTemplate(ctx: WritePorts, input: DutyTemplateWriteInput): Promise<DutyTemplate> {
	ctx.auth.requirePrivileged();

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}

	const parsed = parseOrFail(updateTemplateSchema, input);
	const existing = await ctx.store.findOne<Record<string, unknown>>('duty_templates', ctx.auth.orgId, {
		id: parsed.id,
		mode: 'advanced'
	});
	if (!existing) {
		fail(404, 'Duty template not found');
	}

	const normalized = normalizeTemplateInput(parsed);
	const row = await ctx.store.update<Record<string, unknown>>(
		'duty_templates',
		ctx.auth.orgId,
		parsed.id,
		{
			...DutyTemplateEntity.toDbUpdate(normalized),
			updated_at: new Date().toISOString()
		}
	);

	await ctx.store.deleteWhere('duty_template_slots', ctx.auth.orgId, { template_id: parsed.id });
	const slots = await createSlotRows(ctx, parsed.id, normalized.slots);

	ctx.audit.log({
		action: 'duty_template.updated',
		resourceType: 'duty_template',
		resourceId: parsed.id
	});

	return hydrateTemplate(row, slots);
}

export async function listDutyTemplates(ctx: QueryPorts): Promise<DutyTemplate[]> {
	ctx.auth.requireView('calendar');

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

	const slotsByTemplate = new Map<string, DutyTemplateSlot[]>();
	for (const slot of hydrateSlots(slotRows)) {
		const existing = slotsByTemplate.get(slot.templateId) ?? [];
		existing.push(slot);
		slotsByTemplate.set(slot.templateId, existing);
	}

	return templateRows.map((row) => hydrateTemplate(row, slotsByTemplate.get(row.id as string) ?? []));
}
