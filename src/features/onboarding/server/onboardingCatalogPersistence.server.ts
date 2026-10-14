import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { fail } from '$lib/errors';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { OnboardingCatalogPersistence } from '../contracts';
import {
	TEMPLATE_FIELDS,
	STEP_FIELDS,
	toTemplate,
	toStep,
	templatePatch,
	stepPatch,
	type TemplateRow,
	type StepRow
} from './onboardingPersistenceMapping.server';

export const TEMPLATE_CHANGE_NOT_SAVED_MESSAGE =
	'Another change was saving at the same time, so this change was not saved. Try again.';
export const TEMPLATE_CHANGE_UNCONFIRMED_MESSAGE = "We couldn't confirm this change. Try again; repeating it is safe.";

const templateRow = z.object({
	id: z.string(),
	organization_id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	created_at: z.string().nullable()
});
const stepRow = z.object({
	id: z.string(),
	organization_id: z.string(),
	template_id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	step_type: z.enum(['training', 'paperwork', 'checkbox']),
	training_type_id: z.string().nullable(),
	stages: z.array(z.string()).nullable(),
	sort_order: z.number().int(),
	created_at: z.string()
});
const duplicateResult = z.object({ template: templateRow, steps: z.array(stepRow), created: z.boolean() });

async function templateCommand<T>(
	client: SupabaseClient,
	name: string,
	args: Record<string, unknown>,
	result: z.ZodType<T>
): Promise<T> {
	const { data, error } = await client.rpc(name, args);
	if (error) {
		if (error.code === '42501') fail(403, error.message);
		if (error.code === 'P0002') fail(404, error.message);
		if (error.code === 'OTR01' || error.code === 'OTD01' || error.code === 'OTD02') fail(409, error.message);
		if (error.code === '22023' || error.code === '22P02') fail(400, error.message);
		if (error.code === '40P01' || error.code === '40001' || error.code === '55P03')
			fail(503, TEMPLATE_CHANGE_NOT_SAVED_MESSAGE, { publicMessage: true });
		// supabase-js reports a lost or unreadable response without a database code.
		if (!error.code) fail(503, TEMPLATE_CHANGE_UNCONFIRMED_MESSAGE, { publicMessage: true });
		throw new Error(error.message);
	}
	const parsed = result.safeParse(data);
	if (!parsed.success) throw new Error(`${name} returned an unexpected result`);
	return parsed.data;
}

export function createSupabaseOnboardingCatalogPersistence(
	client: SupabaseClient,
	orgId: string
): OnboardingCatalogPersistence {
	return {
		async listTemplates() {
			const result = await selectAllSupabaseRows<TemplateRow>(async (from, to) => {
				const query = client.from('onboarding_templates').select(TEMPLATE_FIELDS).eq('organization_id', orgId);

				const { data, error } = await query
					.order('name', { ascending: true })
					.order('id', { ascending: true })
					.range(from, to)
					.returns<TemplateRow[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map(toTemplate);
		},
		async listSteps(templateId) {
			const result = await selectAllSupabaseRows<StepRow>(async (from, to) => {
				let query = client.from('onboarding_template_steps').select(STEP_FIELDS).eq('organization_id', orgId);
				if (templateId) query = query.eq('template_id', templateId);
				const { data, error } = await query
					.order('sort_order', { ascending: true })
					.order('id', { ascending: true })
					.range(from, to)
					.returns<StepRow[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map(toStep);
		},
		async findTemplate(id) {
			const { data, error } = await client
				.from('onboarding_templates')
				.select(TEMPLATE_FIELDS)
				.eq('organization_id', orgId)
				.eq('id', id)
				.single<TemplateRow>();
			if (error?.code === 'PGRST116') return null;
			if (error) throw new Error(error.message);
			return data ? toTemplate(data) : null;
		},
		async findTemplateByName(name) {
			const { data, error } = await client
				.from('onboarding_templates')
				.select(TEMPLATE_FIELDS)
				.eq('organization_id', orgId)
				.eq('name', name)
				.single<TemplateRow>();
			if (error?.code === 'PGRST116') return null;
			if (error) throw new Error(error.message);
			return data ? toTemplate(data) : null;
		},
		async findStep(id) {
			const { data, error } = await client
				.from('onboarding_template_steps')
				.select(STEP_FIELDS)
				.eq('organization_id', orgId)
				.eq('id', id)
				.single<StepRow>();
			if (error?.code === 'PGRST116') return null;
			if (error) throw new Error(error.message);
			return data ? toStep(data) : null;
		},
		async findStepByTemplateAndName(templateId, name) {
			const { data, error } = await client
				.from('onboarding_template_steps')
				.select(STEP_FIELDS)
				.eq('organization_id', orgId)
				.eq('template_id', templateId)
				.eq('name', name)
				.single<StepRow>();
			if (error?.code === 'PGRST116') return null;
			if (error) throw new Error(error.message);
			return data ? toStep(data) : null;
		},
		async readStarterReadiness(templateName, stepNames) {
			const [template, templates, steps] = await Promise.all([
				this.findTemplateByName(templateName),
				client.from('onboarding_templates').select('id').eq('organization_id', orgId).limit(1),
				client.from('onboarding_template_steps').select('id').eq('organization_id', orgId).limit(1)
			]);
			if (templates.error) throw new Error(templates.error.message);
			if (steps.error) throw new Error(steps.error.message);
			let names: string[] = [];
			if (template && stepNames.length > 0) {
				const result = await selectAllSupabaseRows<{ name: string }>(async (from, to) => {
					const { data, error } = await client
						.from('onboarding_template_steps')
						.select('name')
						.eq('organization_id', orgId)
						.eq('template_id', template.id)
						.in('name', [...stepNames])
						.order('id', { ascending: true })
						.range(from, to)
						.returns<{ name: string }[]>();
					return { data, error };
				});
				if (result.error) throw new Error((result.error as { message: string }).message);
				names = (result.data ?? []).map((row) => row.name);
			}
			return {
				template,
				hasAnyTemplate: (templates.data?.length ?? 0) > 0,
				hasAnyStep: (steps.data?.length ?? 0) > 0,
				stepNames: names
			};
		},
		async countEstimatedSteps() {
			const { count, error } = await client
				.from('onboarding_template_steps')
				.select('id', { count: 'estimated' })
				.eq('organization_id', orgId)
				.range(0, 0);
			if (error) throw new Error(error.message);
			return count ?? 0;
		},
		async createTemplate(input) {
			const { data, error } = await client
				.from('onboarding_templates')
				.insert({ ...templatePatch(input), organization_id: orgId })
				.select(TEMPLATE_FIELDS)
				.single<TemplateRow>();
			if (error) throw new Error(error.message);
			return toTemplate(data);
		},
		async updateTemplate(id, input) {
			const { data, error } = await client
				.from('onboarding_templates')
				.update(templatePatch(input))
				.eq('organization_id', orgId)
				.eq('id', id)
				.select(TEMPLATE_FIELDS)
				.single<TemplateRow>();
			if (error) throw new Error(error.message);
			return toTemplate(data);
		},
		async createStep(input) {
			const { data, error } = await client
				.from('onboarding_template_steps')
				.insert({ ...stepPatch(input), organization_id: orgId, ...(input.id !== undefined ? { id: input.id } : {}) })
				.select(STEP_FIELDS)
				.single<StepRow>();
			if (error) throw new Error(error.message);
			return toStep(data);
		},
		async updateStep(id, input) {
			const { data, error } = await client
				.from('onboarding_template_steps')
				.update(stepPatch(input))
				.eq('organization_id', orgId)
				.eq('id', id)
				.select(STEP_FIELDS)
				.single<StepRow>();
			if (error) throw new Error(error.message);
			return toStep(data);
		},
		async duplicateTemplate(sourceTemplateId, requestId) {
			const copy = await templateCommand(
				client,
				'duplicate_onboarding_template',
				{ p_organization_id: orgId, p_source_template_id: sourceTemplateId, p_request_id: requestId },
				duplicateResult
			);
			return { template: toTemplate(copy.template), steps: copy.steps.map(toStep), created: copy.created };
		},
		async reorderSteps(templateId, orderedStepIds) {
			const steps = await templateCommand(
				client,
				'reorder_onboarding_template_steps',
				{ p_organization_id: orgId, p_template_id: templateId, p_step_ids: [...orderedStepIds] },
				z.array(stepRow)
			);
			return steps.map(toStep);
		},
		deleteTemplate(id) {
			return templateCommand(
				client,
				'delete_onboarding_template',
				{ p_organization_id: orgId, p_template_id: id },
				z.boolean()
			);
		},
		async deleteStep(id) {
			const { error } = await client
				.from('onboarding_template_steps')
				.delete()
				.eq('organization_id', orgId)
				.eq('id', id);
			if (error) throw new Error(error.message);
		}
	};
}
