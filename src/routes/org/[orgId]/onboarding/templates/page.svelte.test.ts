// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import Page from './+page.svelte';
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import type { OnboardingTemplate, OnboardingTemplateStep } from '$features/onboarding/contracts';
import type { PersonnelOnboarding } from '$features/onboarding/onboarding.types';
import { onboardingStore, onboardingTemplateStore } from '$features/onboarding';
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
	onboardingStore.load([], 'org-test-reset');
});

function step(id: string, name: string, sortOrder: number, overrides: Partial<OnboardingTemplateStep> = {}) {
	return {
		id,
		templateId: 'template-1',
		name,
		description: null,
		stepType: 'checkbox' as const,
		trainingTypeId: null,
		stages: null,
		sortOrder,
		...overrides
	};
}

function packet(id: string, personnelId: string): PersonnelOnboarding {
	return {
		id,
		personnelId,
		startedAt: '2026-01-05',
		completedAt: null,
		cancelledAt: null,
		status: 'in_progress',
		steps: [],
		templateId: 'template-1'
	};
}

const standardArrival: OnboardingTemplate = {
	id: 'template-1',
	orgId: 'org-1',
	name: 'Standard Arrival',
	description: 'Default packet',
	createdAt: '2026-01-01T00:00:00.000Z'
};

async function renderTemplatesPage({
	templates = [standardArrival],
	templateSteps = [step('step-1', 'Initial counseling', 0)],
	activePacketCounts = {},
	packets = []
}: {
	templates?: OnboardingTemplate[];
	templateSteps?: OnboardingTemplateStep[];
	activePacketCounts?: Record<string, number>;
	packets?: PersonnelOnboarding[];
} = {}) {
	onboardingTemplateStore.load(templates, templateSteps, 'org-1');
	onboardingStore.load(packets, 'org-1');
	const rendered = renderPage(activePacketCounts);
	await waitFor(() => expect(screen.queryByText('Loading onboarding templates...')).toBeNull());
	return rendered;
}

function renderPage(activePacketCounts: Record<string, number> = {}) {
	return render(Page, {
		props: {
			params: { orgId: 'org-1' },
			data: {
				...createReadyAppShellRouteData({ orgId: 'org-1' }),
				identitySessionScope: null,
				session: null,
				orgId: 'org-1',
				activePacketCounts
			},
			form: null
		}
	});
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
	return JSON.parse(fetchMock.mock.calls[call][1].body as string);
}

describe('onboarding templates page', () => {
	it('links back to the active Onboarding workspace from the row and from More, with New template pinned', async () => {
		const widths = stubToolbarWidths();
		await renderTemplatesPage();

		const toolbarName = 'Onboarding template controls';
		const row = within(screen.getByRole('toolbar', { name: toolbarName }));
		expect(row.getByRole('link', { name: 'Active onboarding' }).getAttribute('href')).toBe('/org/org-1/onboarding');
		expect(row.getByRole('searchbox', { name: 'Search templates and steps' })).toBeTruthy();

		await widths.foldAll();
		expect(row.queryByRole('link', { name: 'Active onboarding' })).toBeNull();
		expect(row.getByRole('button', { name: 'New template' })).toBeTruthy();
		const menu = await openToolbarMore(toolbarName);
		await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Active onboarding' }));
		await waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/org/org-1/onboarding'));
	});

	it('shows a viewer the Active onboarding link and no template actions, on the row and in More', async () => {
		canConfigure = false;
		const widths = stubToolbarWidths();
		await renderTemplatesPage();

		expect(screen.getByRole('heading', { name: 'Standard Arrival' })).toBeTruthy();
		for (const name of ['Duplicate', 'Delete', 'Rename Standard Arrival', 'Add step']) {
			expect(screen.queryByRole('button', { name })).toBeNull();
		}

		const toolbarName = 'Onboarding template controls';
		const row = within(screen.getByRole('toolbar', { name: toolbarName }));
		expect(row.getByRole('link', { name: 'Active onboarding' }).getAttribute('href')).toBe('/org/org-1/onboarding');
		expect(row.queryByRole('button', { name: 'New template' })).toBeNull();

		await widths.foldAll();
		const menu = await openToolbarMore(toolbarName);
		expect(within(menu).getByRole('menuitem', { name: 'Active onboarding' })).toBeTruthy();
		expect(within(menu).queryByRole('menuitem', { name: 'New template' })).toBeNull();
	});

	it('preserves New template disabled state while creating', async () => {
		await renderTemplatesPage();

		const toolbar = screen.getByRole('toolbar', { name: 'Onboarding template controls' });
		await fireEvent.click(within(toolbar).getByRole('button', { name: 'New template' }));

		expect(within(toolbar).getByRole('button', { name: 'New template' }).hasAttribute('disabled')).toBe(true);
	});

	it('sets the Onboarding Templates document title', async () => {
		await renderTemplatesPage();

		await waitFor(() => expect(document.title).toBe('Onboarding Templates - Troop to Task'));
	});

	it('hides all definition actions for a Group-scoped configurator', async () => {
		scopeSet = { kind: 'groups', groupIds: ['alpha'] };
		await renderTemplatesPage();
		for (const name of [
			'New template',
			'Add step',
			'Duplicate',
			'Delete',
			'Rename Standard Arrival',
			'Edit Initial counseling',
			'Delete Initial counseling',
			'Reorder Initial counseling'
		]) {
			expect(screen.queryByRole('button', { name })).toBeNull();
		}
		expect(screen.getByText('Initial counseling')).toBeTruthy();
	});

	it('summarises each template with its steps and active packets', async () => {
		await renderTemplatesPage({
			templates: [
				standardArrival,
				{ id: 'template-2', orgId: 'org-1', name: 'Officer Arrival', description: null, createdAt: '2026-01-01' }
			],
			templateSteps: [step('step-1', 'Initial counseling', 0), step('step-2', 'Records review', 1)],
			activePacketCounts: { 'template-1': 7 }
		});

		const rows = within(screen.getByRole('grid', { name: 'Onboarding templates' }));
		expect(rows.getByRole('row', { name: 'Officer Arrival' }).textContent).toContain('0 steps · no active packets');
		expect(rows.getByRole('row', { name: 'Standard Arrival' }).textContent).toContain('2 steps · 7 active packets');
	});

	it('labels the editor header with the step count and no longer repeats row actions in the list', async () => {
		await renderTemplatesPage({ templateSteps: [step('step-1', 'A', 0), step('step-2', 'B', 1)] });

		expect(screen.getByText(/Template · 2\s+steps/)).toBeTruthy();
		const rows = within(screen.getByRole('grid', { name: 'Onboarding templates' }));
		expect(rows.queryAllByRole('button')).toEqual([]);
	});

	it('filters templates by template name or step name', async () => {
		await renderTemplatesPage({
			templates: [
				standardArrival,
				{ id: 'template-2', orgId: 'org-1', name: 'Officer Arrival', description: null, createdAt: '2026-01-01' }
			],
			templateSteps: [
				step('step-1', 'Initial counseling', 0),
				step('step-2', 'Dental exam', 0, { templateId: 'template-2' })
			]
		});
		const search = screen.getByRole('searchbox', { name: 'Search templates and steps' });
		const rows = () => within(screen.getByRole('grid', { name: 'Onboarding templates' })).getAllByRole('row');

		await fireEvent.input(search, { target: { value: 'dental' } });
		expect(rows().map((row) => row.getAttribute('aria-labelledby') && row.textContent)).toEqual([
			expect.stringContaining('Officer Arrival')
		]);

		await fireEvent.input(search, { target: { value: 'standard' } });
		expect(rows()).toHaveLength(1);
		expect(rows()[0].textContent).toContain('Standard Arrival');

		await fireEvent.input(search, { target: { value: 'nothing like it' } });
		expect(screen.getByRole('heading', { name: 'No matches.' })).toBeTruthy();
	});

	it('renames a template in place with the pencil and saves its description', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				Response.json({ ...standardArrival, name: 'Standard Arrival 2', description: 'New description' })
			);
		vi.stubGlobal('fetch', fetchMock);
		await renderTemplatesPage();

		await fireEvent.click(screen.getByRole('button', { name: 'Rename Standard Arrival' }));
		const name = screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement;
		expect(name.value).toBe('Standard Arrival');
		await waitFor(() => expect(document.activeElement).toBe(name));
		await fireEvent.input(name, { target: { value: 'Standard Arrival 2' } });
		await fireEvent.input(screen.getByRole('textbox', { name: 'Description' }), {
			target: { value: 'New description' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save template' }));

		await waitFor(() => expect(screen.getByRole('heading', { name: 'Standard Arrival 2' })).toBeTruthy());
		expect(requestBody(fetchMock)).toEqual({
			id: 'template-1',
			name: 'Standard Arrival 2',
			description: 'New description'
		});
		expect(screen.getByText('New description')).toBeTruthy();
		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Rename Standard Arrival 2' }))
		);
	});

	it('cancels a rename with Escape and keeps the saved name', async () => {
		await renderTemplatesPage();

		await fireEvent.click(screen.getByRole('button', { name: 'Rename Standard Arrival' }));
		const name = screen.getByRole('textbox', { name: 'Name' });
		await fireEvent.input(name, { target: { value: 'Changed' } });
		await fireEvent.keyDown(name, { key: 'Escape' });

		expect(screen.getByRole('heading', { name: 'Standard Arrival' })).toBeTruthy();
		expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
	});

	it('opens the editor with the name ready to type for a new template', async () => {
		await renderTemplatesPage();

		await fireEvent.click(screen.getByRole('button', { name: 'New template' }));

		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' })));
	});

	it('offers Add step on an empty template and opens the editor with the name focused', async () => {
		await renderTemplatesPage({ templateSteps: [] });

		expect(screen.getByText('No steps yet.')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Add step' }));

		expect(screen.getByRole('group', { name: 'New step' })).toBeTruthy();
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Step name' })));
	});

	it('returns focus to Add step when the new step editor is cancelled', async () => {
		await renderTemplatesPage();

		await fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add step' })));
	});

	it('moves focus to Step name when a step is edited and back to its Edit button on Cancel', async () => {
		await renderTemplatesPage();

		await fireEvent.click(screen.getByRole('button', { name: 'Edit Initial counseling' }));
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Step name' })));

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit Initial counseling' }))
		);
	});

	it('keeps one step open and asks before discarding unsaved edits when another opens', async () => {
		await renderTemplatesPage({ templateSteps: [step('step-1', 'First step', 0), step('step-2', 'Second step', 1)] });

		await fireEvent.click(screen.getByRole('button', { name: 'Edit First step' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Edit Second step' }));
		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect((screen.getByRole('textbox', { name: 'Step name' }) as HTMLInputElement).value).toBe('Second step');
		expect(screen.getAllByRole('textbox', { name: 'Step name' })).toHaveLength(1);

		await fireEvent.input(screen.getByRole('textbox', { name: 'Step name' }), { target: { value: 'Second step v2' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Edit First step' }));
		const dialog = await screen.findByRole('alertdialog');
		expect(within(dialog).getByText('Discard unsaved changes?')).toBeTruthy();

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect((screen.getByRole('textbox', { name: 'Step name' }) as HTMLInputElement).value).toBe('Second step v2');

		await fireEvent.click(screen.getByRole('button', { name: 'Edit First step' }));
		await fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }));
		await waitFor(() =>
			expect((screen.getByRole('textbox', { name: 'Step name' }) as HTMLInputElement).value).toBe('First step')
		);
		expect(screen.getByText('Second step')).toBeTruthy();
	});

	it('saves a step edit that switches its type and clears what the new type does not use', async () => {
		const saved = step('step-1', 'Initial counseling', 0, {
			description: 'Bring orders',
			stepType: 'paperwork',
			stages: ['Submitted', 'Reviewed']
		});
		const fetchMock = vi.fn().mockResolvedValue(Response.json(saved));
		vi.stubGlobal('fetch', fetchMock);
		await renderTemplatesPage();

		await fireEvent.click(screen.getByRole('button', { name: 'Edit Initial counseling' }));
		await fireEvent.input(screen.getByRole('textbox', { name: 'Instructions' }), { target: { value: 'Bring orders' } });
		await fireEvent.click(screen.getByRole('radio', { name: 'Paperwork' }));
		for (const stage of ['Submitted', 'Reviewed']) {
			await fireEvent.input(screen.getByRole('textbox', { name: 'Stage name' }), { target: { value: stage } });
			await fireEvent.click(screen.getByRole('button', { name: 'Add stage' }));
		}
		await fireEvent.click(screen.getByRole('button', { name: 'Save step' }));

		await waitFor(() => expect(screen.queryByRole('group', { name: 'Editing step' })).toBeNull());
		expect(requestBody(fetchMock)).toEqual({
			id: 'step-1',
			name: 'Initial counseling',
			description: 'Bring orders',
			stepType: 'paperwork',
			trainingTypeId: null,
			stages: ['Submitted', 'Reviewed']
		});
		expect(screen.getByText('Submitted → Reviewed')).toBeTruthy();
		expect(screen.getAllByText('Paperwork').length).toBeGreaterThan(0);
	});

	it('describes a Training step with the type it links to', async () => {
		await renderTemplatesPage({
			templateSteps: [step('step-1', 'SHARP annual', 0, { stepType: 'training', trainingTypeId: 'tt-1' })]
		});

		expect(screen.getByText(/^Linked to Training: .*Clears itself from training records\.$/)).toBeTruthy();
	});

	it('keeps the step editor open and shows the error when saving fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Step save unavailable' }), { status: 503 }))
		);
		await renderTemplatesPage();

		await fireEvent.click(screen.getByRole('button', { name: 'Edit Initial counseling' }));
		await fireEvent.input(screen.getByRole('textbox', { name: 'Step name' }), { target: { value: 'Renamed' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save step' }));

		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Step save unavailable'));
		expect((screen.getByRole('textbox', { name: 'Step name' }) as HTMLInputElement).value).toBe('Renamed');
	});

	it('moves a step with the arrow keys on its grip, announces the position and saves the order', async () => {
		const first = step('step-1', 'First step', 0);
		const second = step('step-2', 'Second step', 1);
		const fetchMock = vi.fn().mockResolvedValue(
			Response.json([
				{ ...second, sortOrder: 0 },
				{ ...first, sortOrder: 1 }
			])
		);
		vi.stubGlobal('fetch', fetchMock);
		await renderTemplatesPage({ templateSteps: [first, second] });

		const grip = screen.getByRole('button', { name: 'Reorder First step' });
		grip.focus();
		await fireEvent.keyDown(grip, { key: 'ArrowDown' });

		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reorder First step' }))
		);
		const steps = within(screen.getByRole('list', { name: 'Steps' })).getAllByRole('listitem');
		expect(steps.map((item) => item.textContent)).toEqual([
			expect.stringContaining('Second step'),
			expect.stringContaining('First step')
		]);
		const announcements = screen.getAllByRole('status').map((node) => node.textContent?.trim());
		expect(announcements).toContain('First step moved to position 2 of 2');
		expect(fetchMock.mock.calls[0][0]).toBe('/org/org-1/api/onboarding-template-steps/reorder');
		expect(requestBody(fetchMock)).toEqual({ templateId: 'template-1', orderedStepIds: ['step-2', 'step-1'] });
	});

	it('puts the order back and shows the error when saving a reorder fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Reorder unavailable' }), { status: 503 }))
		);
		await renderTemplatesPage({ templateSteps: [step('step-1', 'First step', 0), step('step-2', 'Second step', 1)] });

		const grip = screen.getByRole('button', { name: 'Reorder First step' });
		await fireEvent.keyDown(grip, { key: 'ArrowDown' });

		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Reorder unavailable'));
		const steps = within(screen.getByRole('list', { name: 'Steps' })).getAllByRole('listitem');
		expect(steps[0].textContent).toContain('First step');
	});

	it('renders a failed create error and retains the draft for a real retry', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ message: 'Configuration save unavailable' }), { status: 503 })
			)
			.mockResolvedValueOnce(
				Response.json({
					id: 'saved-template',
					orgId: 'org-1',
					name: 'Retry checklist',
					description: 'Retain my draft',
					createdAt: '2026-01-02'
				})
			);
		vi.stubGlobal('fetch', fetchMock);
		await renderTemplatesPage();
		await fireEvent.click(screen.getByRole('button', { name: 'New template' }));
		await fireEvent.input(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Retry checklist' } });
		await fireEvent.input(screen.getByRole('textbox', { name: 'Description' }), {
			target: { value: 'Retain my draft' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Create template' }));
		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Configuration save unavailable'));
		expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('Retry checklist');
		expect((screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement).value).toBe('Retain my draft');
		await fireEvent.click(screen.getByRole('button', { name: 'Create template' }));
		await waitFor(() => expect(screen.getByRole('button', { name: 'Rename Retry checklist' })).toBeTruthy());
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
		await fireEvent.click(screen.getByRole('button', { name: 'New template' }));
		await fireEvent.input(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Fresh checklist' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Create template' }));

		const row = () =>
			within(screen.getByRole('grid', { name: 'Onboarding templates' })).getByRole('row', { name: 'Fresh checklist' });
		await waitFor(() => expect(document.activeElement).toBe(row()));
		expect(row().getAttribute('aria-selected')).toBe('true');
	});

	it('names the template and its active packets in the delete confirmation', async () => {
		await renderTemplatesPage({ activePacketCounts: { 'template-1': 7 } });

		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		const dialog = await screen.findByRole('alertdialog');
		expect(dialog.textContent).toContain(
			'Delete Standard Arrival? Its steps are deleted. 7 active packets keep their steps but lose their link to this template.'
		);
	});

	it.each([
		{ packets: 1, wording: '1 active packet keeps its steps but loses its link to this template.' },
		{ packets: 0, wording: null }
	])('words the delete confirmation for $packets active packets', async ({ packets, wording }) => {
		await renderTemplatesPage({ activePacketCounts: { 'template-1': packets } });

		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		const text = (await screen.findByRole('alertdialog')).textContent;
		expect(text).toContain('Delete Standard Arrival? Its steps are deleted.');
		if (wording) expect(text).toContain(wording);
		else expect(text).not.toContain('active packet');
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
		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		const dialog = await screen.findByRole('alertdialog');
		await fireEvent.click(within(dialog).getByRole('button', { name: /^Delete$/ }));
		await waitFor(() =>
			expect(within(dialog).getByRole('alert').textContent).toContain('Configuration delete unavailable')
		);
		expect(screen.getByRole('button', { name: 'Rename Standard Arrival' })).toBeTruthy();
		await waitFor(() =>
			expect(
				within(dialog)
					.getByRole('button', { name: /^Delete$/ })
					.hasAttribute('disabled')
			).toBe(false)
		);
		await fireEvent.click(within(dialog).getByRole('button', { name: /^Delete$/ }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(screen.queryByRole('button', { name: 'Rename Standard Arrival' })).toBeNull();
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
		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
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
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: true })));
		await renderTemplatesPage({ templateSteps: [step('step-1', 'First step', 0), step('step-2', 'Second step', 1)] });

		await fireEvent.click(screen.getByRole('button', { name: `Delete ${deleted}` }));
		const dialog = await screen.findByRole('alertdialog');
		await fireEvent.click(within(dialog).getByRole('button', { name: /^Delete$/ }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: focused })));
	});

	it('moves focus to New template after the last template is deleted', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: true })));
		await renderTemplatesPage({ templateSteps: [] });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		const dialog = await screen.findByRole('alertdialog');
		await fireEvent.click(within(dialog).getByRole('button', { name: /^Delete$/ }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

		await waitFor(() =>
			expect(document.activeElement).toBe(
				within(screen.getByText('No templates yet.').closest('[data-slot="empty"]') as HTMLElement).getByRole(
					'button',
					{ name: 'New template' }
				)
			)
		);
	});

	it('titles the empty list and the empty detail as level-3 headings', async () => {
		await renderTemplatesPage({ templates: [], templateSteps: [] });

		expect(screen.getByRole('heading', { name: 'No templates yet.', level: 3 })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Select a template', level: 3 })).toBeTruthy();
	});

	it('keeps Duplicate and Delete in the editor header and Add step at the end of the steps', async () => {
		await renderTemplatesPage();

		const detail = screen.getByRole('region', { name: 'Onboarding template management workspace' });
		expect(within(detail).getByRole('button', { name: 'Duplicate' })).toBeTruthy();
		expect(within(detail).getByRole('button', { name: 'Delete' })).toBeTruthy();
		expect(within(detail).getByRole('button', { name: 'Add step' })).toBeTruthy();
	});

	describe('active packets', () => {
		const alpha = packet('packet-1', 'person-1');
		const bravo = packet('packet-2', 'person-2');

		it('shows no sync notice without active packets', async () => {
			await renderTemplatesPage();

			expect(screen.queryByRole('button', { name: 'Sync active packets' })).toBeNull();
		});

		it('says how many packets use the template and reports one result when all sync', async () => {
			const fetchMock = vi.fn().mockImplementation(async () => Response.json({ templateId: 'template-1', steps: [] }));
			vi.stubGlobal('fetch', fetchMock);
			await renderTemplatesPage({ activePacketCounts: { 'template-1': 2 }, packets: [alpha, bravo] });

			expect(screen.getByText('2 active packets use this template')).toBeTruthy();
			expect(
				screen.getByText('Added or removed steps reach them when you sync. Progress on steps that stay is kept.')
			).toBeTruthy();
			await fireEvent.click(screen.getByRole('button', { name: 'Sync active packets' }));

			await waitFor(() =>
				expect(
					within(screen.getByRole('group', { name: 'Active packets' }))
						.getByRole('status')
						.textContent?.trim()
				).toBe('Synced 2 packets')
			);
			expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
				'/org/org-1/api/onboarding-resync',
				'/org/org-1/api/onboarding-resync'
			]);
			expect(fetchMock.mock.calls.map((_, call) => requestBody(fetchMock, call).onboardingId).sort()).toEqual([
				'packet-1',
				'packet-2'
			]);
		});

		it('reports the packets that failed to sync and says to try again', async () => {
			vi.stubGlobal(
				'fetch',
				vi
					.fn()
					.mockResolvedValueOnce(Response.json({ templateId: 'template-1', steps: [] }))
					.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Resync unavailable' }), { status: 503 }))
			);
			await renderTemplatesPage({ activePacketCounts: { 'template-1': 2 }, packets: [alpha, bravo] });

			await fireEvent.click(screen.getByRole('button', { name: 'Sync active packets' }));

			await waitFor(() =>
				expect(
					within(screen.getByRole('group', { name: 'Active packets' }))
						.getByRole('status')
						.textContent?.trim()
				).toBe('Synced 1 of 2. 1 could not be synced. Try again.')
			);
		});

		it('syncs only the packets the member may manage and names the rest', async () => {
			scopeSet = { kind: 'groups', groupIds: ['alpha'] };
			const fetchMock = vi.fn();
			vi.stubGlobal('fetch', fetchMock);
			await renderTemplatesPage({ activePacketCounts: { 'template-1': 2 }, packets: [alpha, bravo] });

			await fireEvent.click(screen.getByRole('button', { name: 'Sync active packets' }));

			await waitFor(() =>
				expect(
					within(screen.getByRole('group', { name: 'Active packets' }))
						.getByRole('status')
						.textContent?.trim()
				).toBe('Synced 0 of 2. 2 are outside your access.')
			);
			expect(fetchMock).not.toHaveBeenCalled();
		});
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
					templateSteps: [step('step-copy', 'Initial counseling', 0, { templateId: 'template-copy' })]
				})
		});
		vi.stubGlobal('fetch', fetchMock);
		await renderTemplatesPage();

		await fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));

		await waitFor(() => expect(screen.getAllByText('Standard Arrival Copy').length).toBeGreaterThan(0));
		expect(screen.getByRole('heading', { name: 'Standard Arrival Copy' })).toBeTruthy();
		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/onboarding-templates/template-1/duplicate', {
			method: 'POST'
		});
		expect(onboardingTemplateStore.orgId).toBe('org-1');
		expect(onboardingTemplateStore.templates.map((template) => template.id)).toContain('template-copy');
		expect(onboardingTemplateStore.allSteps.map((item) => item.id)).toContain('step-copy');

		cleanup();
		renderPage();
		expect(screen.getByRole('grid', { name: 'Onboarding templates' }).textContent).toContain('Standard Arrival Copy');
		expect(onboardingTemplateStore.templates.map((template) => template.id)).toContain('template-copy');
	});
});
