// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OnboardingTemplate, OnboardingTemplateStep } from '../onboarding.types';
import { onboardingTemplateStore } from '../stores/onboardingTemplate.svelte';
import OnboardingTemplateManager from './OnboardingTemplateManager.svelte';

const template: OnboardingTemplate = {
	id: 'template-1',
	orgId: 'org-1',
	name: 'Standard Inprocessing',
	description: null,
	createdAt: '2026-03-01'
};

const paperworkStep: OnboardingTemplateStep = {
	id: 'step-paperwork',
	templateId: template.id,
	name: 'Paperwork Intake',
	description: null,
	stepType: 'paperwork',
	trainingTypeId: null,
	stages: ['Submitted'],
	sortOrder: 0
};

const checklistStep: OnboardingTemplateStep = {
	id: 'step-checklist',
	templateId: template.id,
	name: 'Sponsor Check-In',
	description: null,
	stepType: 'checkbox',
	trainingTypeId: null,
	stages: null,
	sortOrder: 1
};

function stepNames() {
	return Array.from(document.querySelectorAll<HTMLElement>('.type-item .step-name')).map(
		(step) => step.textContent?.trim() ?? ''
	);
}

describe('OnboardingTemplateManager', () => {
	beforeEach(() => {
		onboardingTemplateStore.load([template], [paperworkStep, checklistStep], 'org-1');
		onboardingTemplateStore.setActiveTemplate(template.id);
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
				const body = JSON.parse(String(init?.body ?? '{}'));
				const original = onboardingTemplateStore.allSteps.find((step) => step.id === body.id);
				return Response.json({ ...original, ...body });
			})
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		onboardingTemplateStore.load([], [], 'org-test-reset');
	});

	it('keeps reorder controls working after a paperwork step is saved', async () => {
		render(OnboardingTemplateManager, {
			props: {
				trainingTypes: [],
				onClose: vi.fn()
			}
		});

		expect(stepNames()).toEqual(['Paperwork Intake', 'Sponsor Check-In']);

		await fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() => expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2));

		await fireEvent.click(screen.getAllByTitle('Move down')[0]);

		await waitFor(() => expect(stepNames()).toEqual(['Sponsor Check-In', 'Paperwork Intake']));
	});
});
