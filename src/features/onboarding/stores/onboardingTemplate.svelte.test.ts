import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createOnboardingTemplateWorkspace,
	createOnboardingTemplateWorkspaceHttpAdapter,
	onboardingTemplateStore,
	type OnboardingTemplateWorkspaceAdapter,
	type OnboardingTemplateWorkspaceResult
} from './onboardingTemplate.svelte';
import type { OnboardingTemplate, OnboardingTemplateStep } from '../onboarding.types';
import type { TrainingType } from '$features/training/training.types';

const template: OnboardingTemplate = {
	id: 'template-1',
	orgId: 'org-1',
	name: 'Standard Arrival',
	description: 'Default packet',
	createdAt: '2026-01-01T00:00:00.000Z'
};

const alternateTemplate: OnboardingTemplate = {
	id: 'template-2',
	orgId: 'org-1',
	name: 'Leadership Arrival',
	description: null,
	createdAt: '2026-01-03T00:00:00.000Z'
};

const steps: OnboardingTemplateStep[] = [
	{
		id: 'step-a',
		templateId: template.id,
		name: 'Initial counseling',
		description: null,
		stepType: 'checkbox',
		trainingTypeId: null,
		stages: null,
		sortOrder: 0
	},
	{
		id: 'step-b',
		templateId: template.id,
		name: 'Access packet',
		description: null,
		stepType: 'paperwork',
		trainingTypeId: null,
		stages: ['Draft', 'Filed'],
		sortOrder: 1
	}
];

const trainingTypes: TrainingType[] = [
	{
		id: 'training-cpr',
		name: 'CPR',
		description: null,
		expirationMonths: 12,
		warningDaysYellow: 60,
		warningDaysOrange: 30,
		appliesToRoles: [],
		appliesToMos: [],
		appliesToRanks: [],
		excludedRoles: [],
		excludedMos: [],
		excludedRanks: [],
		color: '#2563eb',
		sortOrder: 0,
		expirationDateOnly: false,
		canBeExempted: true,
		exemptPersonnelIds: [],
		isOptional: false
	}
];

afterEach(() => {
	onboardingTemplateStore.load([], [], '');
});

describe('onboardingTemplateStore hydration reads', () => {
	it('loads templates and steps for active Onboarding consumers', () => {
		onboardingTemplateStore.load([template], steps, 'org-1');
		onboardingTemplateStore.setActiveTemplate(template.id);

		expect(onboardingTemplateStore.templates).toEqual([template]);
		expect(onboardingTemplateStore.list.map((step) => step.id)).toEqual(['step-a', 'step-b']);
		expect(onboardingTemplateStore.getById('step-b')?.name).toBe('Access packet');
	});
});

describe('OnboardingTemplateWorkspace', () => {
	it('creates a template through the workspace seam and selects it', async () => {
		const created: OnboardingTemplate = {
			id: 'template-created',
			orgId: 'org-1',
			name: 'New Arrival',
			description: null,
			createdAt: '2026-01-02T00:00:00.000Z'
		};
		const createTemplate = vi.fn(async (): Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplate>> => {
			return { ok: true, value: created };
		});
		const workspace = makeWorkspace({ createTemplate });

		workspace.startCreateTemplate();
		workspace.templateDraft.name = '  New Arrival  ';
		workspace.templateDraft.description = '   ';
		const result = await workspace.saveTemplate();

		expect(result).toEqual({ ok: true, value: created });
		expect(createTemplate).toHaveBeenCalledWith({ name: 'New Arrival', description: null });
		expect(workspace.model.selectedTemplate?.id).toBe('template-created');
		expect(workspace.model.templates.map((item) => item.id)).toContain('template-created');
	});

	it('normalizes paperwork stages at the workspace seam before creating a step', async () => {
		const createStep = vi.fn(async (input): Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplateStep>> => {
			return {
				ok: true,
				value: {
					id: 'step-created',
					...input
				}
			};
		});
		const workspace = makeWorkspace({ createStep });

		workspace.startAddStep();
		workspace.stepDraft.name = '  Access Packet  ';
		workspace.stepDraft.description = '  Submit account paperwork  ';
		workspace.stepDraft.stepType = 'paperwork';
		workspace.newStageName = ' with soldier ';
		workspace.addStage();
		workspace.newStageName = 'submitted';
		workspace.addStage();

		await workspace.saveStep();

		expect(createStep).toHaveBeenCalledWith({
			templateId: template.id,
			name: 'Access Packet',
			description: 'Submit account paperwork',
			stepType: 'paperwork',
			trainingTypeId: null,
			stages: ['with soldier', 'submitted'],
			sortOrder: 2
		});
		expect(workspace.model.selectedTemplateSteps.map((step) => step.id)).toEqual(['step-a', 'step-b', 'step-created']);
	});

	it('requires a Training Type before saving a training step', async () => {
		const createStep = vi.fn();
		const workspace = makeWorkspace({ createStep });

		workspace.startAddStep();
		workspace.stepDraft.name = 'CPR Certification';
		workspace.stepDraft.stepType = 'training';
		const result = await workspace.saveStep();

		expect(result).toMatchObject({ ok: false, error: { code: 'validation' } });
		expect(createStep).not.toHaveBeenCalled();
	});

	it('reorders steps through a full ordered-id command instead of swapping rows in the page', async () => {
		const reorderSteps = vi.fn(
			async (
				_templateId: string,
				_orderedStepIds: string[]
			): Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplateStep[]>> => {
				return {
					ok: true,
					value: [
						{ ...steps[1], sortOrder: 0 },
						{ ...steps[0], sortOrder: 1 }
					]
				};
			}
		);
		const workspace = makeWorkspace({ reorderSteps });

		await workspace.moveStep(steps[1], 'up');

		expect(reorderSteps).toHaveBeenCalledWith(template.id, ['step-b', 'step-a']);
		expect(workspace.model.selectedTemplateSteps.map((step) => `${step.id}:${step.sortOrder}`)).toEqual([
			'step-b:0',
			'step-a:1'
		]);
	});

	it('reports invalid JSON separately from network failures', async () => {
		const adapter = createOnboardingTemplateWorkspaceHttpAdapter(
			'org-1',
			vi.fn(async () => new Response('not json', { status: 200 }))
		);

		const result = await adapter.createTemplate({ name: 'Arrival', description: null });

		expect(result).toMatchObject({ ok: false, error: { code: 'invalid_json' } });
	});

	it('reads the current route segment when the default adapter makes requests', async () => {
		let routeSegment = 'org-alpha';
		const fetchImpl = vi.fn(async () => Response.json(template));
		const adapter = createOnboardingTemplateWorkspaceHttpAdapter(() => routeSegment, fetchImpl);

		await adapter.createTemplate({ name: 'Arrival', description: null });
		routeSegment = 'org-bravo';
		await adapter.updateTemplate({ id: template.id, name: 'Arrival Updated', description: null });

		expect(fetchImpl).toHaveBeenNthCalledWith(1, '/org/org-alpha/api/onboarding-templates', expect.anything());
		expect(fetchImpl).toHaveBeenNthCalledWith(2, '/org/org-bravo/api/onboarding-templates', expect.anything());
	});

	it('keeps the shared onboarding template store synced after workspace template mutations', async () => {
		const created: OnboardingTemplate = {
			id: 'template-created',
			orgId: 'org-1',
			name: 'New Arrival',
			description: null,
			createdAt: '2026-01-04T00:00:00.000Z'
		};
		onboardingTemplateStore.load([template], steps, 'org-1');
		const createTemplate = vi.fn(async (): Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplate>> => {
			return { ok: true, value: created };
		});
		const workspace = makeWorkspace({
			createTemplate
		});

		workspace.startCreateTemplate();
		workspace.templateDraft.name = 'New Arrival';
		await workspace.saveTemplate();

		expect(onboardingTemplateStore.templates.map((item) => item.id)).toEqual(['template-created', 'template-1']);
	});

	it('clears edit state after deleting the edited template', async () => {
		const deleteTemplate = vi.fn(async (): Promise<OnboardingTemplateWorkspaceResult<{ templateId: string }>> => {
			return { ok: true, value: { templateId: template.id } };
		});
		const updateTemplate = vi.fn(async (): Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplate>> => {
			return { ok: true, value: alternateTemplate };
		});
		const workspace = makeWorkspace(
			{ deleteTemplate, updateTemplate },
			{ templates: [template, alternateTemplate], templateSteps: steps, trainingTypes }
		);

		workspace.startEditTemplate(template.id);
		workspace.templateDraft.name = 'Deleted template draft';
		workspace.requestDelete({ type: 'template', id: template.id, name: template.name });
		await workspace.confirmDelete();
		await workspace.saveTemplate();

		expect(updateTemplate).not.toHaveBeenCalled();
		expect(workspace.model.editingTemplate).toBe(false);
		expect(workspace.model.selectedTemplate?.id).toBe(alternateTemplate.id);
	});
});

function makeWorkspace(
	overrides: Partial<OnboardingTemplateWorkspaceAdapter> = {},
	data = { templates: [template], templateSteps: steps, trainingTypes }
) {
	return createOnboardingTemplateWorkspace({
		organization: { orgId: 'org-1', routeSegment: 'org-1', canConfigure: true },
		data,
		adapter: {
			createTemplate: vi.fn(),
			updateTemplate: vi.fn(),
			deleteTemplate: vi.fn(),
			duplicateTemplate: vi.fn(),
			createStep: vi.fn(),
			updateStep: vi.fn(),
			deleteStep: vi.fn(),
			reorderSteps: vi.fn(),
			...overrides
		} as OnboardingTemplateWorkspaceAdapter
	});
}
