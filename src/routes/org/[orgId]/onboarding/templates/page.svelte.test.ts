// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import Page from './+page.svelte';
import { createTestOrgContext, NONE_TEST_CAPABILITY_MAP } from '$lib/test-support/orgContextBuilder';
import type { ScopeSet } from '$lib/access/scopeSetAccess';
import type { OnboardingTemplate, OnboardingTemplateStep } from '$features/onboarding/onboarding.types';

let canConfigure = true;
let scopeSet: ScopeSet = { kind: 'organization' };

vi.mock('$lib/stores/orgContext.svelte', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/stores/orgContext.svelte')>()),
	getOrgContext: () =>
		createTestOrgContext({
			orgId: 'org-1',
			userRole: 'member',
			capabilityMap: { ...NONE_TEST_CAPABILITY_MAP, onboarding: canConfigure ? 'configure' : 'view' },
			scopeSet
		})
}));

afterEach(() => {
	cleanup();
	canConfigure = true;
	scopeSet = { kind: 'organization' };
	vi.unstubAllGlobals();
});

function renderTemplatesPage({
	templates = [
		{
			id: 'template-1',
			orgId: 'org-1',
			name: 'Standard Arrival',
			description: 'Default packet',
			createdAt: '2026-01-01T00:00:00.000Z'
		}
	],
	templateSteps = [
		{
			id: 'step-1',
			templateId: 'template-1',
			name: 'Initial counseling',
			description: null,
			stepType: 'checkbox',
			trainingTypeId: null,
			stages: null,
			sortOrder: 0
		}
	]
}: {
	templates?: OnboardingTemplate[];
	templateSteps?: OnboardingTemplateStep[];
} = {}) {
	return render(Page, {
		props: {
			params: { orgId: 'org-1' },
			data: {
				session: null,
				orgId: 'org-1',
				templates,
				templateSteps,
				trainingTypes: []
			},
			form: null
		}
	});
}

describe('onboarding templates page', () => {
	it('preserves add template disabled state while adding', async () => {
		renderTemplatesPage();

		const toolbar = screen.getByRole('toolbar', { name: 'Onboarding template controls' });
		const addTemplate = within(toolbar).getByRole('button', { name: 'Add Template' });

		await fireEvent.click(addTemplate);

		expect(within(toolbar).getByRole('button', { name: 'Add Template' }).hasAttribute('disabled')).toBe(true);
	});

	it('hides template creation without Onboarding configure affordance', () => {
		canConfigure = false;

		renderTemplatesPage();

		const toolbar = screen.getByRole('toolbar', { name: 'Onboarding template controls' });
		expect(within(toolbar).queryByRole('button', { name: 'Add Template' })).toBeNull();
	});

	it('hides all definition actions for a Group-scoped configurator', () => {
		scopeSet = { kind: 'groups', groupIds: ['alpha'] };
		renderTemplatesPage();
		for (const name of [
			'Add Template',
			'Add Step',
			'Duplicate Template',
			'Delete Template',
			'Edit Standard Arrival',
			'Edit Initial counseling',
			'Move Initial counseling down'
		]) {
			expect(screen.queryByRole('button', { name })).toBeNull();
		}
		expect(screen.getByText('Initial counseling')).toBeTruthy();
	});

	it('renders a failed create error and retains the draft for a real retry', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ message: 'Configuration save unavailable' }), { status: 503 })
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'saved-template',
						orgId: 'org-1',
						name: 'Retry checklist',
						description: 'Retain my draft',
						createdAt: '2026-01-02'
					})
				)
			);
		vi.stubGlobal('fetch', fetchMock);
		renderTemplatesPage();
		await fireEvent.click(screen.getByRole('button', { name: 'Add Template' }));
		await fireEvent.input(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Retry checklist' } });
		await fireEvent.input(screen.getByRole('textbox', { name: 'Description' }), {
			target: { value: 'Retain my draft' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Create', exact: true }));
		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Configuration save unavailable'));
		expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('Retry checklist');
		expect((screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement).value).toBe('Retain my draft');
		await fireEvent.click(screen.getByRole('button', { name: 'Create', exact: true }));
		await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Retry checklist' })).toBeTruthy());
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('renders a failed delete inside the retained confirmation and clears it after retry', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ message: 'Configuration delete unavailable' }), { status: 503 })
				)
				.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
		);
		renderTemplatesPage();
		await fireEvent.click(screen.getByRole('button', { name: 'Delete Template' }));
		const dialog = await screen.findByRole('alertdialog');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete', exact: true }));
		await waitFor(() =>
			expect(within(dialog).getByRole('alert').textContent).toContain('Configuration delete unavailable')
		);
		expect(screen.getByRole('button', { name: 'Edit Standard Arrival' })).toBeTruthy();
		await waitFor(() =>
			expect(within(dialog).getByRole('button', { name: 'Delete', exact: true }).hasAttribute('disabled')).toBe(false)
		);
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete', exact: true }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(screen.queryByRole('button', { name: 'Edit Standard Arrival' })).toBeNull();
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('does not render redundant template summary cards above the editor', () => {
		renderTemplatesPage();

		expect(screen.queryByText('Reusable onboarding packet definitions')).toBeNull();
		expect(screen.queryByText('Template steps currently configured')).toBeNull();
	});

	it('keeps template-level step and delete actions in the detail footer', () => {
		renderTemplatesPage();

		const detail = screen.getByRole('region', { name: 'Onboarding template management workspace' });
		expect(within(detail).getByRole('button', { name: 'Add Step' })).toBeTruthy();
		expect(within(detail).getByRole('button', { name: 'Duplicate Template' })).toBeTruthy();
		expect(within(detail).getByRole('button', { name: 'Delete Template' })).toBeTruthy();
	});

	it('duplicates a template and selects the returned copy', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					template: {
						id: 'template-copy',
						orgId: 'org-1',
						name: 'Standard Arrival Copy',
						description: 'Default packet',
						createdAt: '2026-01-02T00:00:00.000Z'
					},
					templateSteps: [
						{
							id: 'step-copy',
							templateId: 'template-copy',
							name: 'Initial counseling',
							description: null,
							stepType: 'checkbox',
							trainingTypeId: null,
							stages: null,
							sortOrder: 0
						}
					]
				})
		});
		vi.stubGlobal('fetch', fetchMock);
		renderTemplatesPage();

		await fireEvent.click(screen.getByRole('button', { name: 'Duplicate Template' }));

		await waitFor(() => expect(screen.getAllByText('Standard Arrival Copy').length).toBeGreaterThan(0));
		expect(screen.getByRole('button', { name: 'Duplicate Standard Arrival Copy' })).toBeTruthy();
		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/onboarding-templates/template-1/duplicate', {
			method: 'POST'
		});
	});
});
