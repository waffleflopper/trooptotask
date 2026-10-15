import type { createInMemoryDataStore } from '$lib/server/adapters/inMemory';
type OnboardingMemoryStore = Pick<
	ReturnType<typeof createInMemoryDataStore>,
	'findOne' | 'findMany' | 'findManyWithCount' | 'insert' | 'insertMany' | 'update' | 'delete' | 'deleteWhere'
>;
import { fail } from '$lib/errors';
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
	type ProgressRow,
	TEMPLATE_NAME_EXISTS_MESSAGE
} from './onboardingPersistenceMapping.server';

interface DuplicateReceiptRow {
	id: string;
	source_template_id: string;
	result_template_id: string;
}

export function createInMemoryOnboardingCatalogPersistence(
	store: OnboardingMemoryStore,
	orgId: string
): OnboardingCatalogPersistence {
	async function requireUniqueTemplateName(name: string | undefined, id?: string) {
		if (name === undefined) return;
		const existing = await store.findOne<TemplateRow>('onboarding_templates', orgId, { name });
		if (existing && existing.id !== id) fail(409, TEMPLATE_NAME_EXISTS_MESSAGE);
	}
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
			await requireUniqueTemplateName(data.name);
			return toTemplate(await store.insert<TemplateRow>('onboarding_templates', orgId, templatePatch(data)));
		},
		async updateTemplate(id, data) {
			await requireUniqueTemplateName(data.name, id);
			return toTemplate(await store.update<TemplateRow>('onboarding_templates', orgId, id, templatePatch(data)));
		},
		async duplicateTemplate(sourceTemplateId, requestId) {
			const receipt = await store.findOne<DuplicateReceiptRow>('onboarding_template_duplicate_receipts', orgId, {
				id: requestId
			});
			if (receipt && receipt.source_template_id !== sourceTemplateId)
				fail(409, 'This duplicate request was made for another template');
			const copyId = receipt?.result_template_id;
			if (copyId) {
				const template = await this.findTemplate(copyId);
				if (!template) fail(409, 'The copy from this request was deleted');
				return { template, steps: await this.listSteps(copyId), created: false };
			}
			const source = await this.findTemplate(sourceTemplateId);
			if (!source) fail(404, 'Onboarding template not found');
			const names = new Set((await this.listTemplates()).map((template) => template.name));
			let name = `${source.name} Copy`;
			for (let copy = 2; names.has(name); copy += 1) name = `${source.name} Copy ${copy}`;
			const template = await this.createTemplate({ name, description: source.description });
			const sourceSteps = await this.listSteps(sourceTemplateId);
			await store.insertMany(
				'onboarding_template_steps',
				orgId,
				sourceSteps.map((step, index) => stepPatch({ ...step, templateId: template.id, sortOrder: index }))
			);
			await store.insert('onboarding_template_duplicate_receipts', orgId, {
				id: requestId,
				source_template_id: sourceTemplateId,
				result_template_id: template.id
			});
			return { template, steps: await this.listSteps(template.id), created: true };
		},
		async deleteTemplate(id) {
			if (!(await this.findTemplate(id))) return false;
			await store.deleteWhere('onboarding_template_steps', orgId, { template_id: id });
			await store.delete('onboarding_templates', orgId, id);
			return true;
		},
		async createStep(data) {
			return toStep(
				await store.insert<StepRow>('onboarding_template_steps', orgId, {
					...stepPatch(data),
					...(data.id ? { id: data.id } : {})
				})
			);
		},
		async updateStep(id, data) {
			return toStep(await store.update<StepRow>('onboarding_template_steps', orgId, id, stepPatch(data)));
		},
		deleteStep(id) {
			return store.delete('onboarding_template_steps', orgId, id);
		},
		async reorderSteps(templateId, orderedStepIds) {
			if (!(await this.findTemplate(templateId))) fail(404, 'Onboarding template not found');
			const current = (await this.listSteps(templateId)).map((step) => step.id).sort();
			if (
				new Set(orderedStepIds).size !== orderedStepIds.length ||
				[...orderedStepIds].sort().join() !== current.join()
			)
				fail(409, 'Step order does not match the selected onboarding template');
			for (const [sortOrder, id] of orderedStepIds.entries())
				await store.update('onboarding_template_steps', orgId, id, { sort_order: sortOrder });
			return this.listSteps(templateId);
		}
	};
}
export function createInMemoryOnboardingWorkflowPersistence(
	store: OnboardingMemoryStore,
	orgId: string
): OnboardingWorkflowPersistence {
	/** Mirrors the database trigger that moves `progress_changed_at` only on real progress. */
	async function saveProgress(stepId: string, patch: Pick<ProgressRow, 'completed'> & Partial<ProgressRow>) {
		const before = await store.findOne<ProgressRow>('onboarding_step_progress', orgId, { id: stepId });
		const moved =
			!before ||
			before.completed !== patch.completed ||
			('current_stage' in patch && (before.current_stage ?? null) !== patch.current_stage);
		return store.update<ProgressRow>('onboarding_step_progress', orgId, stepId, {
			...patch,
			...(moved ? { progress_changed_at: new Date().toISOString() } : {})
		});
	}
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
		async listCompletionsSince(since) {
			return (await store.findMany<PacketRow>('personnel_onboardings', orgId, { status: 'completed' }))
				.filter((row): row is PacketRow & { completed_at: string } => !!row.completed_at && row.completed_at >= since)
				.map((row) => ({ startedAt: row.started_at, completedAt: row.completed_at }));
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
			const row = await saveProgress(stepId, { completed });
			return {
				id: row.id,
				onboardingId: row.onboarding_id,
				stepName: row.step_name,
				stepType: row.step_type,
				completed: row.completed,
				currentStage: row.current_stage ?? null,
				progressChangedAt: row.progress_changed_at
			};
		},
		async savePaperworkProgress(stepId, currentStage, completed) {
			const row = await saveProgress(stepId, { current_stage: currentStage, completed });
			return {
				id: row.id,
				onboardingId: row.onboarding_id,
				stepName: row.step_name,
				stepType: row.step_type,
				completed: row.completed,
				currentStage: row.current_stage ?? null,
				progressChangedAt: row.progress_changed_at
			};
		},
		async countActivePacketsByTemplate() {
			const [templates, packets] = await Promise.all([
				store.findMany<{ id: string }>('onboarding_templates', orgId),
				store.findMany<{ template_id: string | null }>('personnel_onboardings', orgId, { status: 'in_progress' })
			]);
			return Object.fromEntries(
				templates.map((template) => [
					template.id,
					packets.filter((packet) => packet.template_id === template.id).length
				])
			);
		}
	};
}
