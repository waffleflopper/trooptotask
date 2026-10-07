import type { createInMemoryDataStore } from '$lib/server/adapters/inMemory';
type OnboardingMemoryStore = Pick<
	ReturnType<typeof createInMemoryDataStore>,
	'findOne' | 'findMany' | 'findManyWithCount' | 'insert' | 'insertMany' | 'update' | 'delete' | 'deleteWhere'
>;
import type { OnboardingCatalogPersistence, OnboardingWorkflowPersistence } from '../contracts';
import {
	toTemplate,
	toStep,
	toPacket,
	templatePatch,
	stepPatch,
	type TemplateRow,
	type StepRow,
	type PacketRow,
	type ProgressRow
} from './onboardingPersistenceMapping.server';

export function createInMemoryOnboardingCatalogPersistence(
	store: OnboardingMemoryStore,
	orgId: string
): OnboardingCatalogPersistence {
	return {
		async listTemplates() {
			return (
				await store.findMany<TemplateRow>('onboarding_templates', orgId, undefined, {
					orderBy: [
						{ column: 'name', ascending: true },
						{ column: 'id', ascending: true }
					]
				})
			).map(toTemplate);
		},
		async listSteps(templateId) {
			return (
				await store.findMany<StepRow>(
					'onboarding_template_steps',
					orgId,
					templateId ? { template_id: templateId } : undefined,
					{
						orderBy: [
							{ column: 'sort_order', ascending: true },
							{ column: 'id', ascending: true }
						]
					}
				)
			).map(toStep);
		},
		async findTemplate(id) {
			const row = await store.findOne<TemplateRow>('onboarding_templates', orgId, { id });
			return row ? toTemplate(row) : null;
		},
		async findTemplateByName(name) {
			const row = await store.findOne<TemplateRow>('onboarding_templates', orgId, { name });
			return row ? toTemplate(row) : null;
		},
		async findStep(id) {
			const row = await store.findOne<StepRow>('onboarding_template_steps', orgId, { id });
			return row ? toStep(row) : null;
		},
		async findStepByTemplateAndName(templateId, name) {
			const row = await store.findOne<StepRow>('onboarding_template_steps', orgId, { template_id: templateId, name });
			return row ? toStep(row) : null;
		},
		async readStarterReadiness(templateName, stepNames) {
			const template = await this.findTemplateByName(templateName);
			const [templates, steps] = await Promise.all([
				store.findMany<{ id: string }>('onboarding_templates', orgId, {}, { select: 'id', limit: 1 }),
				store.findMany<{ id: string }>('onboarding_template_steps', orgId, {}, { select: 'id', limit: 1 })
			]);
			const names = template
				? await store.findMany<{ name: string }>(
						'onboarding_template_steps',
						orgId,
						{ template_id: template.id },
						{ inFilters: { name: [...stepNames] }, select: 'name' }
					)
				: [];
			return {
				template,
				hasAnyTemplate: templates.length > 0,
				hasAnyStep: steps.length > 0,
				stepNames: names.map((row) => row.name)
			};
		},
		async countEstimatedSteps() {
			return (
				(
					await store.findManyWithCount('onboarding_template_steps', orgId, undefined, {
						select: 'id',
						range: { from: 0, to: 0 },
						count: 'estimated'
					})
				).count ?? 0
			);
		},
		async createTemplate(data) {
			return toTemplate(await store.insert<TemplateRow>('onboarding_templates', orgId, templatePatch(data)));
		},
		async updateTemplate(id, data) {
			return toTemplate(await store.update<TemplateRow>('onboarding_templates', orgId, id, templatePatch(data)));
		},
		deleteTemplate(id) {
			return store.delete('onboarding_templates', orgId, id);
		},
		async createStep(data) {
			return toStep(
				await store.insert<StepRow>('onboarding_template_steps', orgId, {
					...stepPatch(data),
					...(data.id ? { id: data.id } : {})
				})
			);
		},
		async createSteps(data) {
			return (await store.insertMany<StepRow>('onboarding_template_steps', orgId, data.map(stepPatch))).map(toStep);
		},
		async updateStep(id, data) {
			return toStep(await store.update<StepRow>('onboarding_template_steps', orgId, id, stepPatch(data)));
		},
		deleteStep(id) {
			return store.delete('onboarding_template_steps', orgId, id);
		},
		deleteStepsForTemplate(templateId) {
			return store.deleteWhere('onboarding_template_steps', orgId, { template_id: templateId });
		}
	};
}
export function createInMemoryOnboardingWorkflowPersistence(
	store: OnboardingMemoryStore,
	orgId: string
): OnboardingWorkflowPersistence {
	return {
		async listPackets(mode) {
			return (
				await store.findMany<PacketRow>(
					'personnel_onboardings',
					orgId,
					mode === 'active' ? { status: 'in_progress' } : undefined,
					{
						select: '*, onboarding_step_progress(*)',
						...(mode === 'history' ? { inFilters: { status: ['completed', 'cancelled'] } } : {}),
						orderBy: [{ column: 'id', ascending: true }]
					}
				)
			).map(toPacket);
		},
		async listSavedActivePackets() {
			return this.listPackets('active');
		},
		async findPacketReference(id) {
			const row = await store.findOne<PacketRow>('personnel_onboardings', orgId, { id });
			return row
				? { id: row.id, personnelId: row.personnel_id, status: row.status, templateId: row.template_id ?? null }
				: null;
		},
		async findStepReference(id) {
			const row = await store.findOne<ProgressRow>('onboarding_step_progress', orgId, { id });
			return row
				? {
						id: row.id,
						onboardingId: row.onboarding_id,
						stepName: row.step_name,
						stepType: row.step_type,
						stages: row.stages ?? null,
						completed: row.completed,
						currentStage: row.current_stage ?? null,
						active: row.active ?? true
					}
				: null;
		},
		async listActivePacketIdsForPersonnel(personnelId) {
			return (
				await store.findMany<{ id: string }>('personnel_onboardings', orgId, {
					personnel_id: personnelId,
					status: 'in_progress'
				})
			).map((row) => row.id);
		},
		async listIncompleteActiveStepIds(onboardingId) {
			return (
				await store.findMany<{ id: string }>('onboarding_step_progress', orgId, {
					onboarding_id: onboardingId,
					active: true,
					completed: false
				})
			).map((row) => row.id);
		},
		async saveCheckboxCompletion(stepId, completed) {
			const row = await store.update<ProgressRow>('onboarding_step_progress', orgId, stepId, { completed });
			return {
				id: row.id,
				onboardingId: row.onboarding_id,
				stepName: row.step_name,
				stepType: row.step_type,
				completed: row.completed,
				currentStage: row.current_stage ?? null
			};
		},
		async savePaperworkProgress(stepId, currentStage, completed) {
			const row = await store.update<ProgressRow>('onboarding_step_progress', orgId, stepId, {
				current_stage: currentStage,
				completed
			});
			return {
				id: row.id,
				onboardingId: row.onboarding_id,
				stepName: row.step_name,
				stepType: row.step_type,
				completed: row.completed,
				currentStage: row.current_stage ?? null
			};
		},
		async listPacketIdsUsingTemplate(templateId) {
			return (await store.findMany<{ id: string }>('personnel_onboardings', orgId, { template_id: templateId })).map(
				(row) => row.id
			);
		},
		async clearPacketTemplate(id) {
			await store.update('personnel_onboardings', orgId, id, { template_id: null });
		}
	};
}
