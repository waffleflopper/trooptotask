// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import Page from './+page.svelte';
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import type { OnboardingTemplate, OnboardingTemplateStep } from '$features/onboarding/contracts';
import { onboardingTemplateStore } from '$features/onboarding';
import { createReadyAppShellRouteData } from '../../appShell.test-support';
import { openToolbarMore, stubToolbarWidths } from '$lib/test-support/toolbarWidths';

const { gotoMock } = vi.hoisted(() => ({ gotoMock: vi.fn() }));
vi.mock('$app/navigation', async (importOriginal) => ({
	...(await importOriginal<typeof import('$app/navigation')>()),
	goto: gotoMock
}));

let canConfigure = true;
let scopeSet: ScopeSet = { kind: 'organization' };

vi.mock('$features/app-shell', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	getAppShellContext: () => ({
		orgId: 'org-1',
		orgUrlSegment: 'org-1',
		...createClientAccess({
			membershipRole: 'member',
			capabilityMap: { ...createCapabilityMap('none'), onboarding: canConfigure ? 'configure' : 'view' },
			scopeSet
		})
	})
}));

afterEach(() => {
	cleanup();
	canConfigure = true;
	scopeSet = { kind: 'organization' };
	vi.unstubAllGlobals();
	gotoMock.mockReset();
	onboardingTemplateStore.load([], [], 'org-test-reset');
});

async function renderTemplatesPage({
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
	onboardingTemplateStore.load(templates, templateSteps, 'org-1');
	const rendered = renderPage();
	await waitFor(() => expect(screen.queryByText('Loading onboarding templates...')).toBeNull());
	return rendered;
}

function renderPage() {
	return render(Page, {
		props: {
			params: { orgId: 'org-1' },
			data: {
				...createReadyAppShellRouteData({ orgId: 'org-1' }),
				identitySessionScope: null,
				session: null,
				orgId: 'org-1'
			},
			form: null
		}
	});
}

describe('onboarding templates page', () => {
	it('links back to the Onboarding pipeline from the row and from More, with Add Template pinned', async () => {
		const widths = stubToolbarWidths();
		await renderTemplatesPage();

		const toolbarName = 'Onboarding template controls';
		const row = within(screen.getByRole('toolbar', { name: toolbarName }));
		expect(row.getByRole('link', { name: 'Onboarding' }).getAttribute('href')).toBe('/org/org-1/onboarding');

		await widths.foldAll();
		expect(row.queryByRole('link', { name: 'Onboarding' })).toBeNull();
		expect(row.getByRole('button', { name: 'Add Template' })).toBeTruthy();
		const menu = await openToolbarMore(toolbarName);
		await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Onboarding' }));
		await waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/org/org-1/onboarding'));
	});

	it('edits the selected template from its detail toolbar, also when Edit folds into More', async () => {
		const widths = stubToolbarWidths();
		await renderTemplatesPage();

		const detailName = 'Onboarding template detail controls';
		await fireEvent.click(
			within(screen.getByRole('toolbar', { name: detailName })).getByRole('button', { name: 'Edit' })
		);
		expect(await screen.findByRole('heading', { name: 'Edit Onboarding Template' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		await widths.foldAll();
		const menu = await openToolbarMore(detailName);
		await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Edit' }));
		expect(await screen.findByRole('heading', { name: 'Edit Onboarding Template' })).toBeTruthy();
	});

	it('shows a viewer the Onboarding link and no template actions, on the row and in More', async () => {
		canConfigure = false;
		const widths = stubToolbarWidths();
		await renderTemplatesPage();

		expect(screen.getByRole('heading', { name: 'Standard Arrival' })).toBeTruthy();
		expect(screen.queryByRole('toolbar', { name: 'Onboarding template detail controls' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();

		const toolbarName = 'Onboarding template controls';
		const row = within(screen.getByRole('toolbar', { name: toolbarName }));
		expect(row.getByRole('link', { name: 'Onboarding' }).getAttribute('href')).toBe('/org/org-1/onboarding');
		expect(row.queryByRole('button', { name: 'Add Template' })).toBeNull();

		await widths.foldAll();
		const menu = await openToolbarMore(toolbarName);
		expect(within(menu).getByRole('menuitem', { name: 'Onboarding' })).toBeTruthy();
		expect(within(menu).queryByRole('menuitem', { name: 'Add Template' })).toBeNull();
	});

	it('preserves add template disabled state while adding', async () => {
		await renderTemplatesPage();

		const toolbar = screen.getByRole('toolbar', { name: 'Onboarding template controls' });
		const addTemplate = within(toolbar).getByRole('button', { name: 'Add Template' });

		await fireEvent.click(addTemplate);

		expect(within(toolbar).getByRole('button', { name: 'Add Template' }).hasAttribute('disabled')).toBe(true);
	});

	it('sets the Onboarding Templates document title', async () => {
		await renderTemplatesPage();

		await waitFor(() => expect(document.title).toBe('Onboarding Templates - Troop to Task'));
	});

	it('hides template creation without Onboarding configure affordance', async () => {
		canConfigure = false;

		await renderTemplatesPage();

		const toolbar = screen.getByRole('toolbar', { name: 'Onboarding template controls' });
		expect(within(toolbar).queryByRole('button', { name: 'Add Template' })).toBeNull();
	});

	it('hides all definition actions for a Group-scoped configurator', async () => {
		scopeSet = { kind: 'groups', groupIds: ['alpha'] };
		await renderTemplatesPage();
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

	it('offers Add first step on an empty template and opens the step form', async () => {
		await renderTemplatesPage({ templateSteps: [] });

		expect(screen.getByText('No steps yet.')).toBeTruthy();
		const addFirst = screen.getByRole('button', { name: 'Add first step' });
		expect(addFirst.hasAttribute('disabled')).toBe(false);

		await fireEvent.click(addFirst);

		expect(screen.queryByRole('button', { name: 'Add first step' })).toBeNull();
		expect(screen.getByLabelText('Name')).toBeTruthy();
	});

	it.each(['Add first step', 'Add Step'])(
		'moves focus to the step Name field when %s opens the form',
		async (opener) => {
			await renderTemplatesPage({ templateSteps: opener === 'Add Step' ? undefined : [] });

			await fireEvent.click(screen.getByRole('button', { name: opener }));

			await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' })));
		}
	);

	it.each([
		{ moved: 'Second step', direction: 'up', kept: 'Move Second step down' },
		{ moved: 'First step', direction: 'down', kept: 'Move First step up' }
	] as const)(
		'keeps focus on $moved after Move $direction leaves that control disabled',
		async ({ moved, direction, kept }) => {
			const step = (id: string, name: string, sortOrder: number) => ({
				id,
				templateId: 'template-1',
				name,
				description: null,
				stepType: 'checkbox' as const,
				trainingTypeId: null,
				stages: null,
				sortOrder
			});
			const swapped = [step('step-2', 'Second step', 0), step('step-1', 'First step', 1)];
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(swapped)));
			await renderTemplatesPage({
				templateSteps: [step('step-1', 'First step', 0), step('step-2', 'Second step', 1)]
			});

			const mover = screen.getByRole('button', { name: `Move ${moved} ${direction}` });
			mover.focus();
			await fireEvent.click(mover);

			await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: kept })));
		}
	);

	it('returns focus to Add Step when the new step form is cancelled', async () => {
		await renderTemplatesPage();

		await fireEvent.click(screen.getByRole('button', { name: 'Add Step' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add Step' })));
	});

	it('returns focus to Add first step when the empty template step form is cancelled', async () => {
		await renderTemplatesPage({ templateSteps: [] });

		await fireEvent.click(screen.getByRole('button', { name: 'Add first step' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add first step' })));
	});

	it('moves focus to Name when a step is edited and back to its Edit button on Cancel', async () => {
		await renderTemplatesPage();

		await fireEvent.click(screen.getByRole('button', { name: 'Edit Initial counseling' }));
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' })));

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit Initial counseling' }))
		);
	});

	it('disables Add first step for a Group-scoped configurator', async () => {
		scopeSet = { kind: 'groups', groupIds: ['alpha'] };

		await renderTemplatesPage({ templateSteps: [] });

		expect(screen.getByRole('button', { name: 'Add first step' }).hasAttribute('disabled')).toBe(true);
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
		await renderTemplatesPage();
		await fireEvent.click(screen.getByRole('button', { name: 'Add Template' }));
		await fireEvent.input(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Retry checklist' } });
		await fireEvent.input(screen.getByRole('textbox', { name: 'Description' }), {
			target: { value: 'Retain my draft' }
		});
		await fireEvent.click(screen.getByRole('button', { name: /^Create$/ }));
		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Configuration save unavailable'));
		expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('Retry checklist');
		expect((screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement).value).toBe('Retain my draft');
		await fireEvent.click(screen.getByRole('button', { name: /^Create$/ }));
		await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Retry checklist' })).toBeTruthy());
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('moves focus to the new template row after a create', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				Response.json({
					id: 'saved-template',
					orgId: 'org-1',
					name: 'Fresh checklist',
					description: null,
					createdAt: '2026-01-02'
				})
			)
		);
		await renderTemplatesPage();
		await fireEvent.click(screen.getByRole('button', { name: 'Add Template' }));
		await fireEvent.input(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Fresh checklist' } });
		await fireEvent.click(screen.getByRole('button', { name: /^Create$/ }));

		const row = () =>
			within(screen.getByRole('grid', { name: 'Onboarding templates' })).getByRole('row', { name: 'Fresh checklist' });
		await waitFor(() => expect(document.activeElement).toBe(row()));
		expect(row().getAttribute('aria-selected')).toBe('true');
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
		await renderTemplatesPage();
		await fireEvent.click(screen.getByRole('button', { name: 'Delete Template' }));
		const dialog = await screen.findByRole('alertdialog');
		await fireEvent.click(within(dialog).getByRole('button', { name: /^Delete$/ }));
		await waitFor(() =>
			expect(within(dialog).getByRole('alert').textContent).toContain('Configuration delete unavailable')
		);
		expect(screen.getByRole('button', { name: 'Edit Standard Arrival' })).toBeTruthy();
		await waitFor(() =>
			expect(
				within(dialog)
					.getByRole('button', { name: /^Delete$/ })
					.hasAttribute('disabled')
			).toBe(false)
		);
		await fireEvent.click(within(dialog).getByRole('button', { name: /^Delete$/ }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(screen.queryByRole('button', { name: 'Edit Standard Arrival' })).toBeNull();
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('moves focus to the remaining template after a confirmed delete', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: true })));
		await renderTemplatesPage({
			templates: [
				{ id: 'template-1', orgId: 'org-1', name: 'Alpha Arrival', description: null, createdAt: '2026-01-01' },
				{ id: 'template-2', orgId: 'org-1', name: 'Bravo Arrival', description: null, createdAt: '2026-01-01' }
			],
			templateSteps: []
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Delete Alpha Arrival' }));
		const dialog = await screen.findByRole('alertdialog');
		await fireEvent.click(within(dialog).getByRole('button', { name: /^Delete$/ }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

		const remaining = within(screen.getByRole('grid', { name: 'Onboarding templates' })).getByRole('row', {
			name: 'Bravo Arrival'
		});
		await waitFor(() => expect(document.activeElement).toBe(remaining));
		expect(remaining.getAttribute('aria-selected')).toBe('true');
	});

	it.each([
		{ deleted: 'First step', focused: 'Edit Second step' },
		{ deleted: 'Second step', focused: 'Edit First step' }
	])('moves focus to $focused after $deleted is deleted', async ({ deleted, focused }) => {
		const step = (id: string, name: string, sortOrder: number) => ({
			id,
			templateId: 'template-1',
			name,
			description: null,
			stepType: 'checkbox' as const,
			trainingTypeId: null,
			stages: null,
			sortOrder
		});
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: true })));
		await renderTemplatesPage({ templateSteps: [step('step-1', 'First step', 0), step('step-2', 'Second step', 1)] });

		await fireEvent.click(screen.getByRole('button', { name: `Delete ${deleted}` }));
		const dialog = await screen.findByRole('alertdialog');
		await fireEvent.click(within(dialog).getByRole('button', { name: /^Delete$/ }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: focused })));
	});

	it('moves focus to Add Template after the last template is deleted', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: true })));
		await renderTemplatesPage({ templateSteps: [] });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete Template' }));
		const dialog = await screen.findByRole('alertdialog');
		await fireEvent.click(within(dialog).getByRole('button', { name: /^Delete$/ }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

		await waitFor(() =>
			expect(document.activeElement).toBe(
				within(screen.getByText('No templates yet.').closest('[data-slot="empty"]') as HTMLElement).getByRole(
					'button',
					{
						name: 'Add Template'
					}
				)
			)
		);
	});

	it('titles the empty list and the empty detail as level-3 headings, like a template header', async () => {
		await renderTemplatesPage({ templates: [], templateSteps: [] });

		expect(screen.getByRole('heading', { name: 'No templates yet.', level: 3 })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Select a template', level: 3 })).toBeTruthy();
	});

	it('does not render redundant template summary cards above the editor', async () => {
		await renderTemplatesPage();

		expect(screen.queryByText('Reusable onboarding packet definitions')).toBeNull();
		expect(screen.queryByText('Template steps currently configured')).toBeNull();
	});

	it('keeps template-level step and delete actions in the detail footer', async () => {
		await renderTemplatesPage();

		const detail = screen.getByRole('region', { name: 'Onboarding template management workspace' });
		expect(within(detail).getByRole('button', { name: 'Add Step' })).toBeTruthy();
		expect(within(detail).getByRole('button', { name: 'Duplicate Template' })).toBeTruthy();
		expect(within(detail).getByRole('button', { name: 'Delete Template' })).toBeTruthy();
	});

	it('waits for the workspace templates before editing or publishing them to the board', async () => {
		onboardingTemplateStore.load([{ id: 'other-template', name: 'Other unit' } as OnboardingTemplate], [], 'org-2');
		renderPage();

		expect(screen.getByText('Loading onboarding templates...')).toBeTruthy();
		expect(onboardingTemplateStore.templates.map((template) => template.id)).toEqual(['other-template']);

		onboardingTemplateStore.load(
			[{ id: 'template-1', orgId: 'org-1', name: 'Standard Arrival', description: null } as OnboardingTemplate],
			[],
			'org-1'
		);

		await waitFor(() => expect(screen.getAllByText('Standard Arrival').length).toBeGreaterThan(0));
		expect(onboardingTemplateStore.templates.map((template) => template.id)).toEqual(['template-1']);
	});

	it('applies a fresh workspace snapshot while open without publishing the stale editor copy over it', async () => {
		await renderTemplatesPage();

		onboardingTemplateStore.load(
			[
				{ id: 'template-refreshed', orgId: 'org-1', name: 'Refreshed Arrival', description: null } as OnboardingTemplate
			],
			[],
			'org-1'
		);

		await waitFor(() => expect(screen.getAllByText('Refreshed Arrival').length).toBeGreaterThan(0));
		expect(screen.queryByText('Standard Arrival')).toBeNull();
		expect(onboardingTemplateStore.templates.map((template) => template.id)).toEqual(['template-refreshed']);
	});

	it('duplicates a template, shares the copy with the board and keeps it when Templates reopens', async () => {
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
		await renderTemplatesPage();

		await fireEvent.click(screen.getByRole('button', { name: 'Duplicate Template' }));

		await waitFor(() => expect(screen.getAllByText('Standard Arrival Copy').length).toBeGreaterThan(0));
		expect(screen.getByRole('button', { name: 'Duplicate Standard Arrival Copy' })).toBeTruthy();
		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/onboarding-templates/template-1/duplicate', {
			method: 'POST'
		});
		expect(onboardingTemplateStore.orgId).toBe('org-1');
		expect(onboardingTemplateStore.templates.map((template) => template.id)).toContain('template-copy');
		expect(onboardingTemplateStore.allSteps.map((step) => step.id)).toContain('step-copy');

		cleanup();
		renderPage();
		expect(screen.getByRole('button', { name: 'Duplicate Standard Arrival Copy' })).toBeTruthy();
		expect(onboardingTemplateStore.templates.map((template) => template.id)).toContain('template-copy');
	});
});
