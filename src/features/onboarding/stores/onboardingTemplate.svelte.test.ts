import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createOnboardingTemplateWorkspace,
	createOnboardingTemplateWorkspaceHttpAdapter,
	onboardingTemplateStore,
	type DuplicateTemplateResponse,
	type OnboardingTemplateWorkspaceAdapter,
	type OnboardingTemplateWorkspaceResult,
	type PendingTemplateDuplicateStorage
} from './onboardingTemplate.svelte';
import type { OnboardingTemplate, OnboardingTemplateStep } from '../contracts';
import type { TrainingType } from '$features/training/contracts';

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

	it('shows a reordered step at its new place before the server answers, then keeps the saved order', async () => {
		let answer: (result: OnboardingTemplateWorkspaceResult<OnboardingTemplateStep[]>) => void = () => {};
		const reorderSteps = vi.fn(
			(_templateId: string, _orderedStepIds: string[]) =>
				new Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplateStep[]>>((resolve) => (answer = resolve))
		);
		const workspace = makeWorkspace({ reorderSteps });

		const saving = workspace.reorderStep('step-b', 0);

		expect(workspace.model.selectedTemplateSteps.map((step) => step.id)).toEqual(['step-b', 'step-a']);
		expect(reorderSteps).toHaveBeenCalledWith(template.id, ['step-b', 'step-a']);
		answer({
			ok: true,
			value: [
				{ ...steps[1], sortOrder: 0 },
				{ ...steps[0], sortOrder: 1 }
			]
		});
		await saving;
		expect(workspace.model.selectedTemplateSteps.map((step) => `${step.id}:${step.sortOrder}`)).toEqual([
			'step-b:0',
			'step-a:1'
		]);
	});

	it('puts the order back and reports the failure when saving a reorder fails', async () => {
		const reorderSteps = vi.fn(async () => ({
			ok: false as const,
			error: { code: 'server' as const, message: 'Reorder unavailable' }
		}));
		const workspace = makeWorkspace({ reorderSteps });

		await workspace.reorderStep('step-a', 1);

		expect(workspace.model.selectedTemplateSteps.map((step) => step.id)).toEqual(['step-a', 'step-b']);
		expect(workspace.model.error?.message).toBe('Reorder unavailable');
	});

	it('folds moves made while a save is in flight into one follow-up save of the latest order', async () => {
		const three: OnboardingTemplateStep[] = [...steps, { ...steps[0], id: 'step-c', name: 'Billeting', sortOrder: 2 }];
		const answers: Array<() => void> = [];
		const reorderSteps = vi.fn(
			(_templateId: string, ids: string[]) =>
				new Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplateStep[]>>((resolve) =>
					answers.push(() =>
						resolve({
							ok: true,
							value: ids.map((id, sortOrder) => ({ ...three.find((s) => s.id === id)!, sortOrder }))
						})
					)
				)
		);
		const workspace = makeWorkspace({ reorderSteps }, { templates: [template], templateSteps: three, trainingTypes });

		const first = workspace.reorderStep('step-a', 1);
		await workspace.reorderStep('step-a', 2);
		expect(reorderSteps).toHaveBeenCalledTimes(1);
		answers[0]();
		await vi.waitFor(() => expect(reorderSteps).toHaveBeenCalledTimes(2));
		answers[1]();
		await first;

		expect(reorderSteps).toHaveBeenLastCalledWith(template.id, ['step-b', 'step-c', 'step-a']);
		expect(workspace.model.selectedTemplateSteps.map((step) => step.id)).toEqual(['step-b', 'step-c', 'step-a']);
	});

	it('saves a reorder of another template while the first template is still saving', async () => {
		const otherSteps: OnboardingTemplateStep[] = [
			{ ...steps[0], id: 'other-a', templateId: alternateTemplate.id, name: 'Welcome', sortOrder: 0 },
			{ ...steps[0], id: 'other-b', templateId: alternateTemplate.id, name: 'Briefing', sortOrder: 1 }
		];
		const answers = new Map<string, () => void>();
		const reorderSteps = vi.fn(
			(templateId: string, ids: string[]) =>
				new Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplateStep[]>>((resolve) =>
					answers.set(templateId, () =>
						resolve({
							ok: true,
							value: ids.map((id, sortOrder) => ({
								...[...steps, ...otherSteps].find((s) => s.id === id)!,
								sortOrder
							}))
						})
					)
				)
		);
		const workspace = makeWorkspace(
			{ reorderSteps },
			{ templates: [template, alternateTemplate], templateSteps: [...steps, ...otherSteps], trainingTypes }
		);

		workspace.selectTemplate(template.id);
		const first = workspace.reorderStep('step-b', 0);
		workspace.selectTemplate(alternateTemplate.id);
		const second = workspace.reorderStep('other-b', 0);

		expect(reorderSteps).toHaveBeenCalledWith(template.id, ['step-b', 'step-a']);
		expect(reorderSteps).toHaveBeenCalledWith(alternateTemplate.id, ['other-b', 'other-a']);
		answers.get(template.id)!();
		answers.get(alternateTemplate.id)!();
		await Promise.all([first, second]);
		expect(workspace.model.selectedTemplateSteps.map((step) => step.id)).toEqual(['other-b', 'other-a']);
		workspace.selectTemplate(template.id);
		expect(workspace.model.selectedTemplateSteps.map((step) => step.id)).toEqual(['step-b', 'step-a']);
	});

	it('puts back only the failed template when two templates are saving', async () => {
		const otherSteps: OnboardingTemplateStep[] = [
			{ ...steps[0], id: 'other-a', templateId: alternateTemplate.id, name: 'Welcome', sortOrder: 0 },
			{ ...steps[0], id: 'other-b', templateId: alternateTemplate.id, name: 'Briefing', sortOrder: 1 }
		];
		const reorderSteps = vi.fn(async (templateId: string, ids: string[]) =>
			templateId === template.id
				? { ok: false as const, error: { code: 'server' as const, message: 'Reorder unavailable' } }
				: {
						ok: true as const,
						value: ids.map((id, sortOrder) => ({ ...otherSteps.find((s) => s.id === id)!, sortOrder }))
					}
		);
		const workspace = makeWorkspace(
			{ reorderSteps },
			{ templates: [template, alternateTemplate], templateSteps: [...steps, ...otherSteps], trainingTypes }
		);

		workspace.selectTemplate(alternateTemplate.id);
		const second = workspace.reorderStep('other-b', 0);
		workspace.selectTemplate(template.id);
		await workspace.reorderStep('step-b', 0);
		await second;

		expect(workspace.model.selectedTemplateSteps.map((step) => step.id)).toEqual(['step-a', 'step-b']);
		workspace.selectTemplate(alternateTemplate.id);
		expect(workspace.model.selectedTemplateSteps.map((step) => step.id)).toEqual(['other-b', 'other-a']);
	});

	it('keeps a rename saved while a reorder response is held', async () => {
		let answer: () => void = () => {};
		const reorderSteps = vi.fn(
			(_templateId: string, ids: string[]) =>
				new Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplateStep[]>>((resolve) => {
					answer = () =>
						resolve({
							ok: true,
							value: ids.map((id, sortOrder) => ({ ...steps.find((s) => s.id === id)!, sortOrder }))
						});
				})
		);
		const updateStep = vi.fn(
			async (input): Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplateStep>> => ({
				ok: true,
				value: { ...steps[0], name: input.name }
			})
		);
		const workspace = makeWorkspace({ reorderSteps, updateStep });

		const reordering = workspace.reorderStep('step-b', 0);
		workspace.startEditStep(steps[0]);
		workspace.stepDraft.name = 'Counseling, renamed';
		await workspace.saveStep();
		answer();
		await reordering;

		expect(workspace.model.selectedTemplateSteps.map((step) => `${step.id}:${step.name}:${step.sortOrder}`)).toEqual([
			'step-b:Access packet:0',
			'step-a:Counseling, renamed:1'
		]);
	});

	it('keeps the order shown while a reorder saves when a step edit answers with the old position', async () => {
		let answer: () => void = () => {};
		const reorderSteps = vi.fn(
			(_templateId: string, ids: string[]) =>
				new Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplateStep[]>>((resolve) => {
					answer = () =>
						resolve({
							ok: true,
							value: ids.map((id, sortOrder) => ({ ...steps.find((s) => s.id === id)!, sortOrder }))
						});
				})
		);
		const updateStep = vi.fn(
			async (input): Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplateStep>> => ({
				ok: true,
				value: { ...steps[0], name: input.name }
			})
		);
		const workspace = makeWorkspace({ reorderSteps, updateStep });

		const reordering = workspace.reorderStep('step-a', 1);
		workspace.startEditStep(steps[0]);
		workspace.stepDraft.name = 'Renamed';
		await workspace.saveStep();

		expect(workspace.model.selectedTemplateSteps.map((step) => step.id)).toEqual(['step-b', 'step-a']);
		answer();
		await reordering;
	});

	it('leaves a step form opened while an earlier step save is pending', async () => {
		let answer: () => void = () => {};
		const updateStep = vi.fn(
			(input) =>
				new Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplateStep>>((resolve) => {
					answer = () => resolve({ ok: true, value: { ...steps[0], name: input.name } });
				})
		);
		const workspace = makeWorkspace({ updateStep });

		workspace.startEditStep(steps[0]);
		workspace.stepDraft.name = 'Counseling, renamed';
		const saving = workspace.saveStep();
		workspace.startAddStep();
		workspace.stepDraft.name = 'Draft of a new step';
		answer();
		await saving;

		expect(workspace.model.addingStep).toBe(true);
		expect(workspace.stepDraft.name).toBe('Draft of a new step');
		expect(workspace.model.selectedTemplateSteps[0].name).toBe('Counseling, renamed');
	});

	it('closes the form that was saved when nothing else was opened meanwhile', async () => {
		const updateStep = vi.fn(
			async (input): Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplateStep>> => ({
				ok: true,
				value: { ...steps[0], name: input.name }
			})
		);
		const workspace = makeWorkspace({ updateStep });

		workspace.startEditStep(steps[0]);
		workspace.stepDraft.name = 'Renamed';
		await workspace.saveStep();

		expect(workspace.model.editingStepId).toBeNull();
		expect(workspace.stepDraft.name).toBe('');
	});

	it('reorders stages in the open draft', () => {
		const workspace = makeWorkspace();
		workspace.startEditStep(steps[1]);
		workspace.newStageName = 'Closed';
		workspace.addStage();

		workspace.moveStage(2, 0);

		expect(workspace.stepDraft.stages).toEqual(['Closed', 'Draft', 'Filed']);
	});

	it('knows when the open step form holds changes that would be lost', () => {
		const workspace = makeWorkspace();
		expect(workspace.model.stepDraftDirty).toBe(false);

		workspace.startEditStep(steps[0]);
		expect(workspace.model.stepDraftDirty).toBe(false);
		workspace.stepDraft.name = 'Initial counseling v2';
		expect(workspace.model.stepDraftDirty).toBe(true);
		workspace.stepDraft.name = 'Initial counseling';
		expect(workspace.model.stepDraftDirty).toBe(false);
		workspace.newStageName = 'Half typed';
		expect(workspace.model.stepDraftDirty).toBe(true);
		workspace.cancelEditStep();

		workspace.startAddStep();
		expect(workspace.model.stepDraftDirty).toBe(false);
		workspace.stepDraft.description = 'Bring orders';
		expect(workspace.model.stepDraftDirty).toBe(true);
	});

	it.each([
		[
			JSON.stringify({ message: 'Configuration is outside your assigned scope' }),
			'Configuration is outside your assigned scope'
		],
		['Configuration is unavailable', 'Configuration is unavailable']
	])('returns a readable error from a denied HTTP response', async (body, expected) => {
		const adapter = createOnboardingTemplateWorkspaceHttpAdapter(
			'org-1',
			async () => new Response(body, { status: 403 })
		);
		expect(await adapter.createTemplate({ name: 'Arrival', description: null })).toEqual({
			ok: false,
			error: { code: 'policy_denied', message: expected }
		});
	});

	it('reports invalid JSON separately from network failures', async () => {
		const adapter = createOnboardingTemplateWorkspaceHttpAdapter(
			'org-1',
			vi.fn(async () => new Response('not json', { status: 200 }))
		);

		const result = await adapter.createTemplate({ name: 'Arrival', description: null });

		expect(result).toMatchObject({ ok: false, error: { code: 'invalid_json' } });
	});

	it('sends the duplicate request id in the body', async () => {
		const fetchImpl = vi.fn(async () => Response.json({ template, templateSteps: [] }));
		const adapter = createOnboardingTemplateWorkspaceHttpAdapter('org-1', fetchImpl);

		await adapter.duplicateTemplate(SOURCE_ID, 'request-1');

		expect(fetchImpl).toHaveBeenCalledWith(`/org/org-1/api/onboarding-templates/${SOURCE_ID}/duplicate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ requestId: 'request-1' })
		});
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

	it('discards a pending configuration response after changing Organizations', async () => {
		let resolve!: (result: OnboardingTemplateWorkspaceResult<OnboardingTemplate>) => void;
		const response = new Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplate>>((done) => {
			resolve = done;
		});
		const workspace = makeWorkspace({ createTemplate: () => response });
		workspace.startCreateTemplate();
		workspace.templateDraft.name = 'Old Organization draft';
		const pending = workspace.saveTemplate();
		const bTemplate = { ...template, id: 'template-b', orgId: 'org-2', name: 'B checklist' };
		workspace.replaceOrganization({ orgId: 'org-2', actorId: 'actor-1', routeSegment: 'org-2', canConfigure: true });
		workspace.replaceData({ templates: [bTemplate], templateSteps: [], trainingTypes: [] });
		onboardingTemplateStore.load([bTemplate], [], 'org-2');
		resolve({ ok: true, value: { ...template, id: 'late-a', name: 'Late A save' } });
		await pending;
		expect(workspace.model.templates).toEqual([bTemplate]);
		expect(onboardingTemplateStore.templates).toEqual([bTemplate]);
		expect(workspace.templateDraft.name).toBe('');
		expect(workspace.model.error).toBeNull();
	});

	it('ignores an old failure and keeps a newer save pending after A to B to A', async () => {
		let finishOld!: (result: OnboardingTemplateWorkspaceResult<OnboardingTemplate>) => void;
		let finishNew!: (result: OnboardingTemplateWorkspaceResult<OnboardingTemplate>) => void;
		const oldResponse = new Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplate>>((done) => {
			finishOld = done;
		});
		const newResponse = new Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplate>>((done) => {
			finishNew = done;
		});
		const createTemplate = vi.fn().mockReturnValueOnce(oldResponse).mockReturnValueOnce(newResponse);
		const workspace = makeWorkspace({ createTemplate });
		workspace.startCreateTemplate();
		workspace.templateDraft.name = 'Old draft';
		const oldSave = workspace.saveTemplate();
		workspace.replaceOrganization({ orgId: 'org-2', actorId: 'actor-1', routeSegment: 'org-2', canConfigure: true });
		workspace.replaceOrganization({ orgId: 'org-1', actorId: 'actor-1', routeSegment: 'org-1', canConfigure: true });
		workspace.replaceData({ templates: [template], templateSteps: steps, trainingTypes });
		workspace.startCreateTemplate();
		workspace.templateDraft.name = 'New draft';
		const newSave = workspace.saveTemplate();
		finishOld({ ok: false, error: { code: 'server', message: 'Old failure' } });
		await oldSave;
		expect(workspace.model.error).toBeNull();
		expect(workspace.model.savingTemplate).toBe(true);
		expect(workspace.templateDraft.name).toBe('New draft');
		finishNew({ ok: true, value: { ...template, id: 'new-save', name: 'New draft' } });
		await newSave;
		expect(workspace.model.savingTemplate).toBe(false);
		expect(workspace.model.templates.map((item) => item.id)).toEqual(['new-save', template.id]);
	});

	it('clears edit state after deleting the edited template', async () => {
		const deleteTemplate = vi.fn(async (): Promise<OnboardingTemplateWorkspaceResult<{ success: true }>> => {
			return { ok: true, value: { success: true } };
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
	data = { templates: [template], templateSteps: steps, trainingTypes },
	storage: PendingTemplateDuplicateStorage | null = null,
	actorId = 'actor-1'
) {
	return createOnboardingTemplateWorkspace({
		organization: { orgId: 'org-1', actorId, routeSegment: 'org-1', canConfigure: true },
		data,
		storage,
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

const SOURCE_ID = '00000000-0000-4000-a000-000000000301';
const source: OnboardingTemplate = { ...template, id: SOURCE_ID, name: 'Arrival' };
const copy: OnboardingTemplate = { ...template, id: '00000000-0000-4000-a000-000000000302', name: 'Arrival Copy' };
const copyStep: OnboardingTemplateStep = { ...steps[0], id: 'copy-step', templateId: copy.id };
const sourceData = { templates: [source], templateSteps: [], trainingTypes };
const copied: OnboardingTemplateWorkspaceResult<DuplicateTemplateResponse> = {
	ok: true,
	value: { template: copy, templateSteps: [copyStep] }
};
const lost: OnboardingTemplateWorkspaceResult<DuplicateTemplateResponse> = {
	ok: false,
	error: { code: 'network', message: 'Network request failed' }
};

function memoryStorage(): PendingTemplateDuplicateStorage & { items: Map<string, string> } {
	const items = new Map<string, string>();
	return {
		items,
		get length() {
			return items.size;
		},
		key: (index) => [...items.keys()][index] ?? null,
		getItem: (key) => items.get(key) ?? null,
		setItem: (key, value) => void items.set(key, value),
		removeItem: (key) => void items.delete(key)
	};
}

function duplicateWith(...answers: OnboardingTemplateWorkspaceResult<DuplicateTemplateResponse>[]) {
	const duplicateTemplate = vi.fn(async (_sourceTemplateId: string, _requestId: string) => answers.shift() ?? copied);
	return { duplicateTemplate, requestIds: () => duplicateTemplate.mock.calls.map(([, requestId]) => requestId) };
}

describe('Duplicate whose answer was lost', () => {
	it('keeps the request through a reload and retries it with the same id, showing the copy once', async () => {
		const storage = memoryStorage();
		const first = duplicateWith(lost);
		const before = makeWorkspace({ duplicateTemplate: first.duplicateTemplate }, sourceData, storage);

		await expect(before.duplicateTemplate(SOURCE_ID)).resolves.toEqual(lost);
		const [requestId] = first.requestIds();
		expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
		expect(before.model.pendingDuplicates).toEqual([
			{ requestId, sourceTemplateId: SOURCE_ID, sourceName: 'Arrival', createdAt: expect.any(String) }
		]);

		const retry = duplicateWith(copied);
		const after = makeWorkspace(
			{ duplicateTemplate: retry.duplicateTemplate },
			{ templates: [source, copy], templateSteps: [copyStep], trainingTypes },
			storage
		);
		expect(after.model.pendingDuplicates.map((pending) => pending.requestId)).toEqual([requestId]);
		await expect(after.retryDuplicate(requestId)).resolves.toEqual(copied);

		expect(retry.duplicateTemplate).toHaveBeenCalledWith(SOURCE_ID, requestId);
		expect(after.model.templates.map((item) => item.name)).toEqual(['Arrival', 'Arrival Copy']);
		expect(after.steps).toEqual([copyStep]);
		expect(after.model.selectedTemplate).toEqual(copy);
		expect(after.model.pendingDuplicates).toEqual([]);
		expect(storage.items.size).toBe(0);
	});

	it.each([
		['a step removed', [{ ...copyStep, id: 'copy-step-b', sortOrder: 1 }], ['witness-step', 'copy-step-b']],
		['every step removed', [], ['witness-step']]
	])(
		'shows only the current copy steps after a retry when another configurator had %s',
		async (_case, currentCopySteps, expectedStepIds) => {
			const storage = memoryStorage();
			await makeWorkspace(
				{ duplicateTemplate: duplicateWith(lost).duplicateTemplate },
				sourceData,
				storage
			).duplicateTemplate(SOURCE_ID);
			const witness = { ...steps[0], id: 'witness-step', templateId: alternateTemplate.id };
			const reloaded = {
				templates: [source, copy, alternateTemplate],
				templateSteps: [witness, copyStep, { ...copyStep, id: 'copy-step-b', sortOrder: 1 }],
				trainingTypes
			};
			onboardingTemplateStore.load(reloaded.templates, reloaded.templateSteps, 'org-1');
			const workspace = makeWorkspace(
				{
					duplicateTemplate: duplicateWith({ ok: true, value: { template: copy, templateSteps: currentCopySteps } })
						.duplicateTemplate
				},
				reloaded,
				storage
			);

			await workspace.retryDuplicate(workspace.model.pendingDuplicates[0].requestId);

			expect(workspace.steps.map((step) => step.id)).toEqual(expectedStepIds);
			expect(onboardingTemplateStore.allSteps.map((step) => step.id)).toEqual(expectedStepIds);
			expect(workspace.model.selectedTemplate).toEqual(copy);
			expect(workspace.model.pendingDuplicates).toEqual([]);
			expect(storage.items.size).toBe(0);
		}
	);

	it('repeats an unanswered Duplicate under its first id and gives the next Duplicate a new one', async () => {
		const duplicate = duplicateWith(lost, copied, copied);
		const workspace = makeWorkspace({ duplicateTemplate: duplicate.duplicateTemplate }, sourceData, memoryStorage());

		await workspace.duplicateTemplate(SOURCE_ID);
		await workspace.duplicateTemplate(SOURCE_ID);
		await workspace.duplicateTemplate(SOURCE_ID);

		const [lostId, repeatedId, nextId] = duplicate.requestIds();
		expect(repeatedId).toBe(lostId);
		expect(nextId).not.toBe(lostId);
	});

	it('retries a pending copy after its source template was deleted', async () => {
		const storage = memoryStorage();
		await makeWorkspace(
			{ duplicateTemplate: duplicateWith(lost).duplicateTemplate },
			sourceData,
			storage
		).duplicateTemplate(SOURCE_ID);
		const retry = duplicateWith(copied);
		const workspace = makeWorkspace(
			{ duplicateTemplate: retry.duplicateTemplate },
			{ ...sourceData, templates: [] },
			storage
		);

		await workspace.retryDuplicate(workspace.model.pendingDuplicates[0].requestId);

		expect(workspace.model.templates).toEqual([copy]);
		expect(workspace.model.pendingDuplicates).toEqual([]);
	});

	it('shows a pending copy only to the actor and Organization that asked for it', async () => {
		const storage = memoryStorage();
		await makeWorkspace(
			{ duplicateTemplate: duplicateWith(lost).duplicateTemplate },
			sourceData,
			storage
		).duplicateTemplate(SOURCE_ID);
		const otherActor = makeWorkspace({}, sourceData, storage, 'actor-2');
		expect(otherActor.model.pendingDuplicates).toEqual([]);

		const workspace = makeWorkspace({}, sourceData, storage);
		workspace.replaceOrganization({ orgId: 'org-2', actorId: 'actor-1', routeSegment: 'org-2', canConfigure: true });
		expect(workspace.model.pendingDuplicates).toEqual([]);
		workspace.replaceOrganization({ orgId: 'org-1', actorId: 'actor-2', routeSegment: 'org-1', canConfigure: true });
		expect(workspace.model.pendingDuplicates).toEqual([]);
		workspace.replaceOrganization({ orgId: 'org-1', actorId: 'actor-1', routeSegment: 'org-1', canConfigure: true });
		expect(workspace.model.pendingDuplicates.map((pending) => pending.sourceName)).toEqual(['Arrival']);
		workspace.replaceOrganization({ orgId: 'org-1', actorId: 'actor-1', routeSegment: 'org-1', canConfigure: false });
		expect(workspace.model.pendingDuplicates).toEqual([]);
	});

	it('keeps a request answered after an Organization switch out of the new Organization', async () => {
		const storage = memoryStorage();
		let answer!: (result: OnboardingTemplateWorkspaceResult<DuplicateTemplateResponse>) => void;
		const workspace = makeWorkspace(
			{ duplicateTemplate: () => new Promise((done) => (answer = done)) },
			sourceData,
			storage
		);
		const pending = workspace.duplicateTemplate(SOURCE_ID);
		workspace.replaceOrganization({ orgId: 'org-2', actorId: 'actor-1', routeSegment: 'org-2', canConfigure: true });
		workspace.replaceData({ templates: [], templateSteps: [], trainingTypes: [] });
		answer(copied);

		await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'conflict' } });
		expect(workspace.model.templates).toEqual([]);
		expect(storage.items.size).toBe(0);
	});

	it.each([
		['unavailable', null],
		[
			'refusing writes',
			{
				...memoryStorage(),
				setItem: () => {
					throw new DOMException('Quota exceeded', 'QuotaExceededError');
				}
			}
		]
	])('sends nothing and says so when browser storage is %s', async (_case, storage) => {
		const duplicate = duplicateWith();
		const workspace = makeWorkspace({ duplicateTemplate: duplicate.duplicateTemplate }, sourceData, storage);

		await expect(workspace.duplicateTemplate(SOURCE_ID)).resolves.toMatchObject({
			ok: false,
			error: { code: 'storage' }
		});

		expect(duplicate.duplicateTemplate).not.toHaveBeenCalled();
		expect(workspace.model.error?.code).toBe('storage');
	});

	it.each([
		['conflict', false],
		['not_found', false],
		['network', true],
		['server', true],
		['policy_denied', true],
		['invalid_json', true]
	] as const)('after a %s answer keeps the request for retry: %s', async (code, kept) => {
		const storage = memoryStorage();
		const failed = { ok: false, error: { code, message: 'Not copied' } } as const;
		const workspace = makeWorkspace(
			{ duplicateTemplate: duplicateWith(failed).duplicateTemplate },
			sourceData,
			storage
		);

		await workspace.duplicateTemplate(SOURCE_ID);

		expect(workspace.model.error).toEqual(failed.error);
		expect(workspace.model.pendingDuplicates).toHaveLength(kept ? 1 : 0);
		expect(storage.items.size).toBe(kept ? 1 : 0);
	});

	it('drops stored records that do not parse', () => {
		const storage = memoryStorage();
		const scope = 't2t:onboarding-template-duplicate:v1:actor-1:org-1:';
		storage.setItem(`${scope}broken`, '{');
		storage.setItem(`${scope}${SOURCE_ID}`, JSON.stringify({ requestId: SOURCE_ID, sourceTemplateId: 'arrival' }));
		storage.setItem('theme', 'dark');

		expect(makeWorkspace({}, sourceData, storage).model.pendingDuplicates).toEqual([]);
		expect([...storage.items.keys()]).toEqual(['theme']);
	});
});
