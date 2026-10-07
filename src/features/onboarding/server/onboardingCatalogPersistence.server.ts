import type { SupabaseClient } from '@supabase/supabase-js';
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
		async createSteps(rows) {
			if (rows.length === 0) return [];
			const { data, error } = await client
				.from('onboarding_template_steps')
				.insert(rows.map((row) => ({ ...stepPatch(row), organization_id: orgId })))
				.select(STEP_FIELDS)
				.returns<StepRow[]>();
			if (error) throw new Error(error.message);
			return (data ?? []).map(toStep);
		},
		async deleteTemplate(id) {
			const { error } = await client.from('onboarding_templates').delete().eq('organization_id', orgId).eq('id', id);
			if (error) throw new Error(error.message);
		},
		async deleteStep(id) {
			const { error } = await client
				.from('onboarding_template_steps')
				.delete()
				.eq('organization_id', orgId)
				.eq('id', id);
			if (error) throw new Error(error.message);
		},
		async deleteStepsForTemplate(templateId) {
			const { error } = await client
				.from('onboarding_template_steps')
				.delete()
				.eq('organization_id', orgId)
				.eq('template_id', templateId);
			if (error) throw new Error(error.message);
		}
	};
}
