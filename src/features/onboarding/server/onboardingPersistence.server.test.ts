import { describe, it, expect } from 'vitest';
import { onboardingProvider } from './test-support/onboardingProvider.server';
import { createSupabaseOnboardingCatalogPersistence } from './onboardingCatalogPersistence.server';
import { createSupabaseOnboardingWorkflowPersistence } from './onboardingWorkflowPersistence.server';
const ORG = 'org-a';
const TIME = '2026-10-07T12:00:00.123456Z';
function ports(initial: Parameters<typeof onboardingProvider>[0]) {
	const provider = onboardingProvider(initial);
	return {
		...provider,
		catalog: createSupabaseOnboardingCatalogPersistence(provider.client, ORG),
		workflow: createSupabaseOnboardingWorkflowPersistence(provider.client, ORG)
	};
}
const template = { id: 'template', organization_id: ORG, name: 'Arrival', description: null, created_at: null };
const step = {
	id: 'step',
	organization_id: ORG,
	template_id: 'template',
	name: 'Paperwork',
	description: null,
	step_type: 'paperwork',
	training_type_id: null,
	stages: ['Issued', 'Filed'],
	sort_order: 0,
	created_at: TIME
};
const packet = {
	id: 'packet',
	organization_id: ORG,
	personnel_id: 'person',
	started_at: '2026-03-01',
	completed_at: null,
	cancelled_at: null,
	status: 'in_progress',
	template_id: null,
	created_at: TIME
};
const progress = {
	id: 'progress',
	organization_id: ORG,
	onboarding_id: 'packet',
	step_name: 'Paperwork',
	step_type: 'paperwork',
	sort_order: 0,
	completed: false,
	notes: [{ text: 'Legacy', timestamp: '2026-03-01' }],
	updated_at: TIME
};
describe('ordinary Onboarding persistence', () => {
	it('preserves nullable template time, step raw metadata and exact packet/progress projections', async () => {
		const { catalog, workflow } = ports({
			onboarding_templates: [template],
			onboarding_template_steps: [step],
			personnel_onboardings: [packet],
			onboarding_step_progress: [progress]
		});
		expect(await catalog.listTemplates()).toEqual([
			{ id: 'template', orgId: ORG, name: 'Arrival', description: null, createdAt: null }
		]);
		expect(await catalog.listSteps()).toEqual([
			{
				id: 'step',
				organization_id: ORG,
				templateId: 'template',
				name: 'Paperwork',
				description: null,
				stepType: 'paperwork',
				trainingTypeId: null,
				stages: ['Issued', 'Filed'],
				sortOrder: 0,
				created_at: TIME
			}
		]);
		expect(await workflow.listPackets('active')).toEqual([
			{
				id: 'packet',
				personnelId: 'person',
				startedAt: '2026-03-01',
				completedAt: null,
				cancelledAt: null,
				status: 'in_progress',
				templateId: null,
				steps: [
					{
						id: 'progress',
						onboardingId: 'packet',
						stepName: 'Paperwork',
						stepType: 'paperwork',
						sortOrder: 0,
						completed: false,
						trainingTypeId: null,
						stages: null,
						currentStage: null,
						notes: [{ text: 'Legacy', timestamp: '2026-03-01' }],
						templateStepId: null,
						active: true
					}
				]
			}
		]);
		expect(await workflow.findStepReference('progress')).toEqual({
			id: 'progress',
			onboardingId: 'packet',
			stepName: 'Paperwork',
			stepType: 'paperwork',
			stages: null,
			completed: false,
			currentStage: null,
			active: true
		});
	});
	it('maps same-org singular references and preserves unavailable/error distinctions', async () => {
		const { catalog, workflow, state } = ports({
			onboarding_templates: [template],
			onboarding_template_steps: [step],
			personnel_onboardings: [packet],
			onboarding_step_progress: [{ ...progress, notes: { legacy: true }, active: false }]
		});
		expect(await catalog.findTemplate('template')).toEqual({
			id: 'template',
			orgId: ORG,
			name: 'Arrival',
			description: null,
			createdAt: null
		});
		expect((await catalog.findStepByTemplateAndName('template', 'Paperwork'))?.id).toBe('step');
		expect(await catalog.findStepByTemplateAndName('other', 'Paperwork')).toBeNull();
		expect(await workflow.findPacketReference('packet')).toEqual({
			id: 'packet',
			personnelId: 'person',
			status: 'in_progress',
			templateId: null
		});
		expect((await workflow.listPackets('active'))[0].steps[0]).toMatchObject({ notes: [], active: false });
		state.failure = () => ({ code: '42501', message: 'Provider denied', status: 403 });
		await expect(catalog.findStep('step')).rejects.toEqual(new Error('Provider denied'));
		await expect(workflow.findStepReference('progress')).rejects.toEqual(new Error('Provider denied'));
	});
	it('retains 1001 exact scoped identities through physical page drift in every ordinary collection', async () => {
		const ids = Array.from({ length: 1001 }, (_, i) => `id-${String(i).padStart(4, '0')}`);
		const { catalog, workflow, state } = ports({
			onboarding_templates: [
				...ids.map((id) => ({ ...template, id })),
				{ ...template, id: 'foreign', organization_id: 'org-b' }
			],
			onboarding_template_steps: ids.map((id) => ({ ...step, id })),
			personnel_onboardings: ids.map((id) => ({ ...packet, id })),
			onboarding_step_progress: ids.map((id) => ({ ...progress, id, onboarding_id: 'packet', active: true }))
		});
		state.unstablePages = true;
		expect((await catalog.listTemplates()).map((row) => row.id)).toEqual(ids);
		expect((await catalog.listSteps('template')).map((row) => row.id)).toEqual(ids);
		expect((await workflow.listPackets('active')).map((row) => row.id)).toEqual(ids);
		expect((await workflow.listSavedActivePackets()).map((row) => row.id)).toEqual(ids);
		expect(await workflow.listActivePacketIdsForPersonnel('person')).toEqual(ids);
		expect(await workflow.listIncompleteActiveStepIds('packet')).toEqual(ids);
		state.rows.onboarding_templates = [template];
		expect(await catalog.readStarterReadiness('Arrival', ['Paperwork'])).toMatchObject({
			stepNames: Array(1001).fill('Paperwork'),
			hasAnyTemplate: true,
			hasAnyStep: true
		});
	});
	it('rejects the complete read on a later page and preserves PGRST116 null and empty/null reads', async () => {
		const { catalog, workflow, state } = ports({
			onboarding_templates: Array.from({ length: 1001 }, (_, i) => ({ ...template, id: `${i}` })),
			personnel_onboardings: Array.from({ length: 1001 }, (_, i) => ({ ...packet, id: `${i}` }))
		});
		state.failure = (req) =>
			req.offset === 1000 ? { code: 'XX000', message: 'Later page rejected', status: 500 } : null;
		await expect(catalog.listTemplates()).rejects.toThrow('Later page rejected');
		await expect(workflow.listSavedActivePackets()).rejects.toThrow('Later page rejected');
		state.failure = null;
		expect(await catalog.findStep('missing')).toBeNull();
		expect(await workflow.findPacketReference('missing')).toBeNull();
		state.nullData = true;
		expect(await catalog.listSteps()).toEqual([]);
		expect(await workflow.listPackets('history')).toEqual([]);
	});
	it('keeps count and starter readiness bounded to the current template and strict requested names', async () => {
		const { catalog, state } = ports({
			onboarding_templates: [template],
			onboarding_template_steps: [
				step,
				{ ...step, id: 'other', template_id: 'other', name: 'Confirm' },
				{ ...step, id: 'extra', name: 'Unrelated' }
			]
		});
		expect(await catalog.countEstimatedSteps()).toBe(3);
		state.countNull = true;
		expect(await catalog.countEstimatedSteps()).toBe(0);
		expect(await catalog.readStarterReadiness('Arrival', ['Paperwork', 'Confirm'])).toEqual({
			template: { id: 'template', orgId: ORG, name: 'Arrival', description: null, createdAt: null },
			hasAnyTemplate: true,
			hasAnyStep: true,
			stepNames: ['Paperwork']
		});
		const count = state.requests.filter(
			(req) => req.url.searchParams.get('select') === 'id' && req.url.searchParams.has('offset')
		);
		expect(count.map((req) => [req.offset, req.url.searchParams.get('limit')])).toEqual([
			[0, '1'],
			[0, '1']
		]);
	});
	it('counts only in-progress packets of this Organization per template in one request, 0 for the rest', async () => {
		const { workflow, state } = ports({
			onboarding_templates: [
				{ ...template, id: 'template' },
				{ ...template, id: 'other' },
				{ ...template, id: 'empty' },
				{ ...template, id: 'foreign', organization_id: 'org-b' }
			],
			personnel_onboardings: [
				{ ...packet, id: 'a1', template_id: 'template' },
				{ ...packet, id: 'a2', template_id: 'template' },
				{ ...packet, id: 'done', template_id: 'template', status: 'completed' },
				{ ...packet, id: 'cancelled', template_id: 'template', status: 'cancelled' },
				{ ...packet, id: 'b1', template_id: 'other' },
				{ ...packet, id: 'none', template_id: null },
				{ ...packet, id: 'foreign', template_id: 'template', organization_id: 'org-b' }
			]
		});
		expect(await workflow.countActivePacketsByTemplate()).toEqual({ template: 2, other: 1, empty: 0 });
		expect(state.requests.map((request) => request.table)).toEqual(['onboarding_templates']);
	});
	it('returns saved acknowledgements and preserves omitted fields while explicit null clears', async () => {
		const { catalog, workflow, state } = ports({
			onboarding_templates: [{ ...template, description: 'Keep' }],
			onboarding_template_steps: [step],
			personnel_onboardings: [packet],
			onboarding_step_progress: [{ ...progress, stages: ['Issued', 'Filed'], current_stage: 'Issued', active: true }]
		});
		expect(await catalog.updateTemplate('template', { name: 'Renamed' })).toEqual({
			id: 'template',
			orgId: ORG,
			name: 'Renamed',
			description: 'Keep',
			createdAt: null
		});
		expect((await catalog.updateTemplate('template', { description: null })).description).toBeNull();
		expect((await catalog.updateStep('step', { name: 'Renamed step' })).stages).toEqual(['Issued', 'Filed']);
		expect(await workflow.saveCheckboxCompletion('progress', true)).toEqual({
			id: 'progress',
			onboardingId: 'packet',
			stepName: 'Paperwork',
			stepType: 'paperwork',
			completed: true,
			currentStage: 'Issued'
		});
		expect(await workflow.savePaperworkProgress('progress', 'Filed', true)).toEqual({
			id: 'progress',
			onboardingId: 'packet',
			stepName: 'Paperwork',
			stepType: 'paperwork',
			completed: true,
			currentStage: 'Filed'
		});
		expect(state.rows.onboarding_step_progress[0]).toEqual({
			...progress,
			stages: ['Issued', 'Filed'],
			current_stage: 'Filed',
			active: true,
			completed: true
		});
	});
	it('uses canonical ordinary authority for creates, prepared IDs and step deletes', async () => {
		const { catalog, state } = ports({ onboarding_templates: [template], onboarding_template_steps: [step] });
		expect(await catalog.createTemplate({ name: 'New', description: null })).toEqual({
			id: 'saved-1',
			orgId: ORG,
			name: 'New',
			description: null,
			createdAt: TIME
		});
		const data = {
			templateId: 'template',
			name: 'Ready',
			description: null,
			stepType: 'checkbox' as const,
			trainingTypeId: null,
			stages: null,
			sortOrder: 2
		};
		expect((await catalog.createStep({ ...data, id: 'prepared' })).id).toBe('prepared');
		await catalog.deleteStep('prepared');
		expect(state.rows.onboarding_template_steps).toEqual([step]);
		expect(state.rows.onboarding_templates.map((row) => row.id)).toEqual(['template', 'saved-1']);
		expect(
			state.requests
				.filter((req) => req.method === 'POST')
				.slice(0, 2)
				.map((req) => req.body)
		).toEqual([
			{ name: 'New', description: null, organization_id: ORG },
			{
				template_id: 'template',
				name: 'Ready',
				description: null,
				step_type: 'checkbox',
				training_type_id: null,
				stages: null,
				sort_order: 2,
				organization_id: ORG,
				id: 'prepared'
			}
		]);
	});
});
