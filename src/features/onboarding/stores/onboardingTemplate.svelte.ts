import { untrack } from 'svelte';
import type { TrainingType } from '$features/training/training.types';
import type { OnboardingStepType, OnboardingTemplate, OnboardingTemplateStep } from '../onboarding.types';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface OnboardingTemplateWorkspaceData {
	templates: OnboardingTemplate[];
	templateSteps: OnboardingTemplateStep[];
	trainingTypes: TrainingType[];
}

export interface OnboardingTemplateWorkspaceOrganization {
	orgId: string;
	routeSegment: string;
	canConfigure: boolean;
}

export interface OnboardingTemplateDraft {
	name: string;
	description: string;
}

export interface OnboardingTemplateStepDraft {
	name: string;
	description: string;
	stepType: OnboardingStepType;
	trainingTypeId: string | null;
	stages: string[];
}

export type OnboardingTemplateDeleteTarget = {
	type: 'template' | 'step';
	id: string;
	name: string;
};

export type OnboardingTemplateWorkspaceErrorCode =
	| 'validation'
	| 'read_only'
	| 'policy_denied'
	| 'not_found'
	| 'conflict'
	| 'network'
	| 'invalid_json'
	| 'server';

export interface OnboardingTemplateWorkspaceError {
	code: OnboardingTemplateWorkspaceErrorCode;
	message: string;
}

export type OnboardingTemplateWorkspaceResult<T = void> =
	| { ok: true; value: T }
	| { ok: false; error: OnboardingTemplateWorkspaceError };

export interface CreateTemplateInput {
	name: string;
	description: string | null;
}

export interface UpdateTemplateInput extends CreateTemplateInput {
	id: string;
}

export interface CreateStepInput {
	templateId: string;
	name: string;
	description: string | null;
	stepType: OnboardingStepType;
	trainingTypeId: string | null;
	stages: string[] | null;
	sortOrder: number;
}

export interface UpdateStepInput extends Omit<CreateStepInput, 'templateId' | 'sortOrder'> {
	id: string;
}

export interface DuplicateTemplateResponse {
	template: OnboardingTemplate;
	templateSteps: OnboardingTemplateStep[];
}

export interface OnboardingTemplateWorkspaceAdapter {
	createTemplate(input: CreateTemplateInput): Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplate>>;
	updateTemplate(input: UpdateTemplateInput): Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplate>>;
	deleteTemplate(id: string): Promise<OnboardingTemplateWorkspaceResult<{ templateId: string }>>;
	duplicateTemplate(id: string): Promise<OnboardingTemplateWorkspaceResult<DuplicateTemplateResponse>>;
	createStep(input: CreateStepInput): Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplateStep>>;
	updateStep(input: UpdateStepInput): Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplateStep>>;
	deleteStep(id: string): Promise<OnboardingTemplateWorkspaceResult<{ stepId: string }>>;
	reorderSteps(
		templateId: string,
		orderedStepIds: string[]
	): Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplateStep[]>>;
}

export interface OnboardingTemplateWorkspaceModel {
	templates: OnboardingTemplate[];
	selectedTemplate: OnboardingTemplate | null;
	selectedTemplateSteps: OnboardingTemplateStep[];
	trainingTypes: TrainingType[];
	canMutate: boolean;
	templateActionDisabled: boolean;
	creatingTemplate: boolean;
	editingTemplate: boolean;
	addingStep: boolean;
	editingStepId: string | null;
	mobileDetailOpen: boolean;
	savingTemplate: boolean;
	savingStep: boolean;
	duplicatingTemplateId: string | null;
	confirmDelete: OnboardingTemplateDeleteTarget | null;
	error: OnboardingTemplateWorkspaceError | null;
	stepTrainingTypeLabel: string;
	canSaveTemplate: boolean;
	canSaveStep: boolean;
}

let hydratedTemplates = $state.raw<OnboardingTemplate[]>([]);
let hydratedSteps = $state.raw<OnboardingTemplateStep[]>([]);
let hydratedOrgId = $state('');
let activeTemplateId = $state<string | null>(null);

export const onboardingTemplateStore = {
	get templates() {
		return [...hydratedTemplates].sort((a, b) => a.name.localeCompare(b.name));
	},

	get orgId() {
		return hydratedOrgId;
	},

	get activeTemplateId() {
		return activeTemplateId;
	},

	get list() {
		return this.allSteps.filter((step) => step.templateId === activeTemplateId);
	},

	get allSteps() {
		return [...hydratedSteps].sort((a, b) => a.sortOrder - b.sortOrder);
	},

	load(templates: OnboardingTemplate[], steps: OnboardingTemplateStep[], orgId: string) {
		hydratedTemplates = [...templates];
		hydratedSteps = [...steps];
		hydratedOrgId = orgId;

		const currentActive = untrack(() => activeTemplateId);
		const stillValid = templates.some((template) => template.id === currentActive);
		if (!stillValid) {
			activeTemplateId = templates.length > 0 ? templates[0].id : null;
		}
	},

	setActiveTemplate(id: string) {
		activeTemplateId = id;
	},

	getById(id: string) {
		return hydratedSteps.find((step) => step.id === id);
	}
};

export function createOnboardingTemplateWorkspace(input: {
	organization: OnboardingTemplateWorkspaceOrganization;
	data: OnboardingTemplateWorkspaceData;
	adapter?: OnboardingTemplateWorkspaceAdapter;
}): OnboardingTemplateWorkspace {
	return new OnboardingTemplateWorkspace(
		input.organization,
		input.data,
		input.adapter ?? createOnboardingTemplateWorkspaceHttpAdapter(input.organization.routeSegment)
	);
}

export function createOnboardingTemplateWorkspaceHttpAdapter(
	routeSegment: string,
	fetchImpl: FetchLike = fetch
): OnboardingTemplateWorkspaceAdapter {
	return {
		createTemplate(input) {
			return requestJson(fetchImpl, `/org/${routeSegment}/api/onboarding-templates`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(input)
			});
		},
		updateTemplate(input) {
			return requestJson(fetchImpl, `/org/${routeSegment}/api/onboarding-templates`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(input)
			});
		},
		deleteTemplate(id) {
			return requestJson(fetchImpl, `/org/${routeSegment}/api/onboarding-templates`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
		},
		duplicateTemplate(id) {
			return requestJson(fetchImpl, `/org/${routeSegment}/api/onboarding-templates/${id}/duplicate`, {
				method: 'POST'
			});
		},
		createStep(input) {
			return requestJson(fetchImpl, `/org/${routeSegment}/api/onboarding-template-steps`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(input)
			});
		},
		updateStep(input) {
			return requestJson(fetchImpl, `/org/${routeSegment}/api/onboarding-template-steps`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(input)
			});
		},
		deleteStep(id) {
			return requestJson(fetchImpl, `/org/${routeSegment}/api/onboarding-template-steps`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
		},
		reorderSteps(templateId, orderedStepIds) {
			return requestJson(fetchImpl, `/org/${routeSegment}/api/onboarding-template-steps/reorder`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ templateId, orderedStepIds })
			});
		}
	};
}

export class OnboardingTemplateWorkspace {
	organization = $state<OnboardingTemplateWorkspaceOrganization>({
		orgId: '',
		routeSegment: '',
		canConfigure: false
	});
	templateDraft = $state<OnboardingTemplateDraft>(emptyTemplateDraft());
	stepDraft = $state<OnboardingTemplateStepDraft>(emptyStepDraft());
	newStageName = $state('');

	#templates = $state.raw<OnboardingTemplate[]>([]);
	#steps = $state.raw<OnboardingTemplateStep[]>([]);
	#trainingTypes = $state.raw<TrainingType[]>([]);
	#selectedTemplateId = $state<string | null>(null);
	#creatingTemplate = $state(false);
	#editingTemplate = $state(false);
	#mobileDetailOpen = $state(false);
	#addingStep = $state(false);
	#editingStepId = $state<string | null>(null);
	#confirmDelete = $state<OnboardingTemplateDeleteTarget | null>(null);
	#savingTemplate = $state(false);
	#savingStep = $state(false);
	#duplicatingTemplateId = $state<string | null>(null);
	#error = $state<OnboardingTemplateWorkspaceError | null>(null);

	constructor(
		organization: OnboardingTemplateWorkspaceOrganization,
		data: OnboardingTemplateWorkspaceData,
		private readonly adapter: OnboardingTemplateWorkspaceAdapter
	) {
		this.organization = organization;
		this.replaceData(data);
	}

	get model(): OnboardingTemplateWorkspaceModel {
		return {
			templates: this.orderedTemplates,
			selectedTemplate: this.selectedTemplate,
			selectedTemplateSteps: this.selectedTemplateSteps,
			trainingTypes: this.trainingTypes,
			canMutate: this.canMutate,
			templateActionDisabled: this.templateActionDisabled,
			creatingTemplate: this.#creatingTemplate,
			editingTemplate: this.#editingTemplate,
			addingStep: this.#addingStep,
			editingStepId: this.#editingStepId,
			mobileDetailOpen: this.#mobileDetailOpen,
			savingTemplate: this.#savingTemplate,
			savingStep: this.#savingStep,
			duplicatingTemplateId: this.#duplicatingTemplateId,
			confirmDelete: this.#confirmDelete,
			error: this.#error,
			stepTrainingTypeLabel: this.stepTrainingTypeLabel,
			canSaveTemplate: this.canSaveTemplate,
			canSaveStep: this.canSaveStep
		};
	}

	get orderedTemplates(): OnboardingTemplate[] {
		return [...this.#templates].sort((a, b) => a.name.localeCompare(b.name));
	}

	get selectedTemplate(): OnboardingTemplate | null {
		if (this.#creatingTemplate) return null;
		if (this.#selectedTemplateId) {
			const selected = this.#templates.find((template) => template.id === this.#selectedTemplateId);
			if (selected) return selected;
		}
		return this.orderedTemplates[0] ?? null;
	}

	get selectedTemplateSteps(): OnboardingTemplateStep[] {
		const selected = this.selectedTemplate;
		if (!selected) return [];
		return this.#steps.filter((step) => step.templateId === selected.id).sort((a, b) => a.sortOrder - b.sortOrder);
	}

	get trainingTypes(): TrainingType[] {
		return this.#trainingTypes;
	}

	get canMutate(): boolean {
		return this.organization.canConfigure;
	}

	get templateActionDisabled(): boolean {
		return (
			this.#creatingTemplate ||
			this.#editingTemplate ||
			this.#addingStep ||
			!!this.#editingStepId ||
			!!this.#duplicatingTemplateId
		);
	}

	get canSaveTemplate(): boolean {
		return this.templateDraft.name.trim().length > 0 && !this.#savingTemplate;
	}

	get canSaveStep(): boolean {
		if (!this.stepDraft.name.trim() || this.#savingStep) return false;
		if (this.stepDraft.stepType === 'training') return !!this.stepDraft.trainingTypeId;
		return true;
	}

	get stepTrainingTypeLabel(): string {
		return (
			this.#trainingTypes.find((type) => type.id === this.stepDraft.trainingTypeId)?.name ?? 'Select training type'
		);
	}

	replaceOrganization(organization: OnboardingTemplateWorkspaceOrganization): void {
		this.organization = organization;
	}

	replaceData(data: OnboardingTemplateWorkspaceData): void {
		this.#templates = [...data.templates];
		this.#steps = [...data.templateSteps];
		this.#trainingTypes = [...data.trainingTypes];
		if (this.#selectedTemplateId && !this.#templates.some((template) => template.id === this.#selectedTemplateId)) {
			this.#selectedTemplateId = null;
		}
	}

	selectTemplate(id: string): void {
		if (this.templateActionDisabled) return;
		this.#selectedTemplateId = id;
		this.#mobileDetailOpen = true;
		this.cancelAddStep();
		this.cancelEditStep();
	}

	startCreateTemplate(): void {
		if (!this.canMutate || this.templateActionDisabled) return;
		this.cancelAddStep();
		this.cancelEditStep();
		this.#selectedTemplateId = null;
		this.templateDraft = emptyTemplateDraft();
		this.#creatingTemplate = true;
		this.#editingTemplate = false;
		this.#mobileDetailOpen = true;
	}

	startEditTemplate(id?: string): void {
		const selected = id ? this.#templates.find((template) => template.id === id) : this.selectedTemplate;
		if (!selected || !this.canMutate || this.templateActionDisabled) return;
		this.cancelAddStep();
		this.cancelEditStep();
		this.#selectedTemplateId = selected.id;
		this.templateDraft = {
			name: selected.name,
			description: selected.description ?? ''
		};
		this.#creatingTemplate = false;
		this.#editingTemplate = true;
		this.#mobileDetailOpen = true;
	}

	cancelTemplateEdit(): void {
		const wasCreating = this.#creatingTemplate;
		this.#creatingTemplate = false;
		this.#editingTemplate = false;
		this.#savingTemplate = false;
		this.templateDraft = emptyTemplateDraft();
		if (wasCreating) this.#mobileDetailOpen = false;
	}

	async saveTemplate(): Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplate>> {
		if (!this.canSaveTemplate) return validationError('Template name is required');
		this.#savingTemplate = true;
		this.#error = null;
		try {
			if (this.#creatingTemplate) {
				const result = await this.adapter.createTemplate({
					name: this.templateDraft.name.trim(),
					description: normalizedDescription(this.templateDraft.description)
				});
				if (!result.ok) return this.rememberError(result);
				this.#templates = [...this.#templates, result.value];
				this.#selectedTemplateId = result.value.id;
				this.#creatingTemplate = false;
				this.#mobileDetailOpen = true;
				this.templateDraft = emptyTemplateDraft();
				return result;
			}

			const selected = this.selectedTemplate;
			if (!selected) return validationError('Select a template before saving');
			const result = await this.adapter.updateTemplate({
				id: selected.id,
				name: this.templateDraft.name.trim(),
				description: normalizedDescription(this.templateDraft.description)
			});
			if (!result.ok) return this.rememberError(result);
			this.#templates = this.#templates.map((template) => (template.id === result.value.id ? result.value : template));
			this.#editingTemplate = false;
			this.templateDraft = emptyTemplateDraft();
			return result;
		} finally {
			this.#savingTemplate = false;
		}
	}

	requestDelete(target: OnboardingTemplateDeleteTarget): void {
		this.#confirmDelete = target;
	}

	cancelDelete(): void {
		this.#confirmDelete = null;
	}

	async confirmDelete(): Promise<OnboardingTemplateWorkspaceResult> {
		const target = this.#confirmDelete;
		if (!target) return { ok: true, value: undefined };
		return target.type === 'template' ? this.deleteTemplate(target.id) : this.deleteStep(target.id);
	}

	async duplicateTemplate(id?: string): Promise<OnboardingTemplateWorkspaceResult<DuplicateTemplateResponse>> {
		const selected = id ? this.#templates.find((template) => template.id === id) : this.selectedTemplate;
		if (!selected || !this.canMutate || this.templateActionDisabled)
			return validationError('Select a template to duplicate');
		this.#duplicatingTemplateId = selected.id;
		this.#error = null;
		try {
			const result = await this.adapter.duplicateTemplate(selected.id);
			if (!result.ok) return this.rememberError(result);
			this.#templates = [...this.#templates, result.value.template];
			this.#steps = [...this.#steps, ...result.value.templateSteps];
			this.#selectedTemplateId = result.value.template.id;
			this.#mobileDetailOpen = true;
			return result;
		} finally {
			this.#duplicatingTemplateId = null;
		}
	}

	startAddStep(): void {
		if (!this.selectedTemplate || !this.canMutate || this.#creatingTemplate || this.#editingTemplate) return;
		this.cancelEditStep();
		this.stepDraft = emptyStepDraft();
		this.newStageName = '';
		this.#addingStep = true;
	}

	cancelAddStep(): void {
		this.#addingStep = false;
		this.stepDraft = emptyStepDraft();
		this.newStageName = '';
	}

	startEditStep(step: OnboardingTemplateStep): void {
		if (this.#creatingTemplate || this.#editingTemplate) return;
		this.cancelAddStep();
		this.#editingStepId = step.id;
		this.stepDraft = {
			name: step.name,
			description: step.description ?? '',
			stepType: step.stepType,
			trainingTypeId: step.trainingTypeId,
			stages: step.stages ? [...step.stages] : []
		};
		this.newStageName = '';
	}

	cancelEditStep(): void {
		this.#editingStepId = null;
		this.stepDraft = emptyStepDraft();
		this.newStageName = '';
	}

	async saveStep(): Promise<OnboardingTemplateWorkspaceResult<OnboardingTemplateStep>> {
		if (!this.canSaveStep) return validationError('Complete the step fields before saving');
		const selected = this.selectedTemplate;
		if (!selected) return validationError('Select a template before saving a step');

		this.#savingStep = true;
		this.#error = null;
		try {
			const input = this.buildStepInput();
			if (this.#addingStep) {
				const nextOrder = this.nextStepSortOrder();
				const result = await this.adapter.createStep({
					templateId: selected.id,
					...input,
					sortOrder: nextOrder
				});
				if (!result.ok) return this.rememberError(result);
				this.#steps = [...this.#steps, result.value];
				this.cancelAddStep();
				return result;
			}

			if (!this.#editingStepId) return validationError('Select a step before saving');
			const result = await this.adapter.updateStep({
				id: this.#editingStepId,
				...input
			});
			if (!result.ok) return this.rememberError(result);
			this.#steps = this.#steps.map((step) => (step.id === result.value.id ? result.value : step));
			this.cancelEditStep();
			return result;
		} finally {
			this.#savingStep = false;
		}
	}

	async moveStep(step: OnboardingTemplateStep, direction: 'up' | 'down'): Promise<OnboardingTemplateWorkspaceResult> {
		const selected = this.selectedTemplate;
		if (!selected) return validationError('Select a template before reordering steps');
		const ordered = this.selectedTemplateSteps;
		const index = ordered.findIndex((item) => item.id === step.id);
		if (index < 0) return validationError('Select a step before reordering');
		const swapIndex = direction === 'up' ? index - 1 : index + 1;
		if (swapIndex < 0 || swapIndex >= ordered.length) return { ok: true, value: undefined };

		const next = [...ordered];
		[next[index], next[swapIndex]] = [next[swapIndex], next[index]];
		const orderedStepIds = next.map((item) => item.id);
		const result = await this.adapter.reorderSteps(selected.id, orderedStepIds);
		if (!result.ok) return this.rememberError(result);

		const reorderedById: Record<string, OnboardingTemplateStep> = Object.create(null);
		for (const item of result.value) {
			reorderedById[item.id] = item;
		}
		this.#steps = this.#steps.map((item) => reorderedById[item.id] ?? item);
		return { ok: true, value: undefined };
	}

	addStage(): void {
		const stage = this.newStageName.trim();
		if (!stage) return;
		this.stepDraft.stages = [...this.stepDraft.stages, stage];
		this.newStageName = '';
	}

	removeStage(index: number): void {
		this.stepDraft.stages = this.stepDraft.stages.filter((_, itemIndex) => itemIndex !== index);
	}

	moveStage(index: number, direction: 'up' | 'down'): void {
		const newIndex = direction === 'up' ? index - 1 : index + 1;
		if (newIndex < 0 || newIndex >= this.stepDraft.stages.length) return;
		const copy = [...this.stepDraft.stages];
		[copy[index], copy[newIndex]] = [copy[newIndex], copy[index]];
		this.stepDraft.stages = copy;
	}

	closeMobileDetail(): void {
		if (this.#creatingTemplate || this.#editingTemplate) this.cancelTemplateEdit();
		this.#mobileDetailOpen = false;
	}

	getTemplateSummary(template: OnboardingTemplate): string {
		const stepCount = this.#steps.filter((step) => step.templateId === template.id).length;
		return `${stepCount} step${stepCount === 1 ? '' : 's'}`;
	}

	private async deleteTemplate(templateId: string): Promise<OnboardingTemplateWorkspaceResult> {
		const result = await this.adapter.deleteTemplate(templateId);
		if (!result.ok) return this.rememberError(result);
		this.#templates = this.#templates.filter((template) => template.id !== templateId);
		this.#steps = this.#steps.filter((step) => step.templateId !== templateId);
		if (this.#selectedTemplateId === templateId) this.#selectedTemplateId = null;
		this.#mobileDetailOpen = false;
		this.#confirmDelete = null;
		return { ok: true, value: undefined };
	}

	private async deleteStep(stepId: string): Promise<OnboardingTemplateWorkspaceResult> {
		const result = await this.adapter.deleteStep(stepId);
		if (!result.ok) return this.rememberError(result);
		this.#steps = this.#steps.filter((step) => step.id !== stepId);
		if (this.#editingStepId === stepId) this.cancelEditStep();
		this.#confirmDelete = null;
		return { ok: true, value: undefined };
	}

	private buildStepInput(): Omit<CreateStepInput, 'templateId' | 'sortOrder'> {
		return {
			name: this.stepDraft.name.trim(),
			description: normalizedDescription(this.stepDraft.description),
			stepType: this.stepDraft.stepType,
			trainingTypeId: this.stepDraft.stepType === 'training' ? this.stepDraft.trainingTypeId : null,
			stages: this.stepDraft.stepType === 'paperwork' && this.stepDraft.stages.length > 0 ? this.stepDraft.stages : null
		};
	}

	private nextStepSortOrder(): number {
		const steps = this.selectedTemplateSteps;
		return steps.length > 0 ? Math.max(...steps.map((step) => step.sortOrder)) + 1 : 0;
	}

	private rememberError<T>(
		result: Extract<OnboardingTemplateWorkspaceResult<T>, { ok: false }>
	): OnboardingTemplateWorkspaceResult<T> {
		this.#error = result.error;
		return result;
	}
}

function emptyTemplateDraft(): OnboardingTemplateDraft {
	return { name: '', description: '' };
}

function emptyStepDraft(): OnboardingTemplateStepDraft {
	return {
		name: '',
		description: '',
		stepType: 'checkbox',
		trainingTypeId: null,
		stages: []
	};
}

function normalizedDescription(value: string): string | null {
	const trimmed = value.trim();
	return trimmed || null;
}

function validationError<T>(message: string): OnboardingTemplateWorkspaceResult<T> {
	return {
		ok: false,
		error: {
			code: 'validation',
			message
		}
	};
}

async function requestJson<T>(
	fetchImpl: FetchLike,
	url: string,
	init: RequestInit
): Promise<OnboardingTemplateWorkspaceResult<T>> {
	try {
		const response = await fetchImpl(url, init);
		if (!response.ok) {
			return {
				ok: false,
				error: {
					code: errorCodeForStatus(response.status),
					message: (await response.text()) || 'Request failed'
				}
			};
		}
		try {
			return { ok: true, value: (await response.json()) as T };
		} catch (error) {
			return {
				ok: false,
				error: {
					code: 'invalid_json',
					message: error instanceof Error && error.message ? error.message : 'Invalid JSON'
				}
			};
		}
	} catch {
		return {
			ok: false,
			error: {
				code: 'network',
				message: 'Network request failed'
			}
		};
	}
}

function errorCodeForStatus(status: number): OnboardingTemplateWorkspaceErrorCode {
	if (status === 403) return 'policy_denied';
	if (status === 404) return 'not_found';
	if (status === 409) return 'conflict';
	if (status >= 400 && status < 500) return 'validation';
	return 'server';
}
