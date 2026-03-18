import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onboardingTemplateStore } from './onboardingTemplate.svelte';
import type { OnboardingTemplate, OnboardingTemplateStep } from '../onboarding.types';

const mockTemplate: OnboardingTemplate = {
	id: 'tmpl-1',
	orgId: 'org-1',
	name: 'Default',
	description: null,
	createdAt: '2026-03-01'
};

const mockStep: OnboardingTemplateStep = {
	id: 'step-1',
	templateId: 'tmpl-1',
	name: 'Inprocess',
	description: null,
	stepType: 'checkbox',
	trainingTypeId: null,
	stages: null,
	sortOrder: 0
};

describe('onboardingTemplateStore - load during in-flight mutations (issue #113)', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		onboardingTemplateStore.load([], [], 'org-1');
	});

	it('should not clobber optimistic step add when load is called mid-flight', async () => {
		onboardingTemplateStore.load([mockTemplate], [mockStep], 'org-1');
		onboardingTemplateStore.setActiveTemplate('tmpl-1');

		let resolveFetch!: (value: unknown) => void;
		const fetchPromise = new Promise((resolve) => {
			resolveFetch = resolve;
		});
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValue(
				fetchPromise.then(() => ({
					ok: true,
					status: 200,
					json: () =>
						Promise.resolve({
							id: 'server-step-2',
							templateId: 'tmpl-1',
							name: 'Medical',
							description: null,
							stepType: 'checkbox',
							trainingTypeId: null,
							stages: null,
							sortOrder: 1
						})
				}))
			)
		);

		const addPromise = onboardingTemplateStore.add({
			name: 'Medical',
			description: null,
			stepType: 'checkbox',
			trainingTypeId: null,
			stages: null,
			sortOrder: 1
		});

		// Optimistic: should have 2 steps
		expect(onboardingTemplateStore.list.length).toBe(2);

		// Stale load (only original step)
		onboardingTemplateStore.load([mockTemplate], [mockStep], 'org-1');

		// Should NOT clobber optimistic add
		expect(onboardingTemplateStore.list.length).toBe(2);
		expect(onboardingTemplateStore.list.some((s) => s.name === 'Medical')).toBe(true);

		resolveFetch(undefined);
		await addPromise;
	});

	it('should allow load when org changes during in-flight mutation', async () => {
		onboardingTemplateStore.load([mockTemplate], [mockStep], 'org-1');
		onboardingTemplateStore.setActiveTemplate('tmpl-1');

		let resolveFetch!: (value: unknown) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValue(
				new Promise((resolve) => {
					resolveFetch = resolve;
				}).then(() => ({ ok: true, status: 200, json: () => Promise.resolve({}) }))
			)
		);

		onboardingTemplateStore.add({
			name: 'Medical',
			description: null,
			stepType: 'checkbox',
			trainingTypeId: null,
			stages: null,
			sortOrder: 1
		});

		// Different org — should go through
		onboardingTemplateStore.load([], [], 'org-2');
		expect(onboardingTemplateStore.templates).toEqual([]);

		resolveFetch(undefined);
	});
});
