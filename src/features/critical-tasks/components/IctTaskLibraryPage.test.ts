// @vitest-environment happy-dom
import { createClientAccess, type ClientAccessFacts } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { openToolbarMore, openToolbarSubmenu, stubToolbarWidths } from '$lib/test-support/toolbarWidths';
import { cleanup, fireEvent, render, screen, waitFor, within, act } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IctTaskLibraryPage from './IctTaskLibraryPage.svelte';
import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import { CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE } from '$features/critical-tasks/contracts';
import { toastStore } from '$lib/stores/toast.svelte';
import {
	criticalTasksWorkspaceStatus,
	resetCriticalTasksWorkspaceStatus
} from '$features/critical-tasks/criticalTasksWorkspaceStatus.svelte';

let accessFacts: ClientAccessFacts = { membershipRole: 'owner' };
const org = createClientAccess(() => accessFacts);

const activeTask: IctTask = {
	id: 'task-1',
	taskCode: '181-105-1001',
	title: 'Perform tactical combat casualty care',
	description: 'Aid under fire',
	category: 'Casualty Care',
	mos: ['68W'],
	expirationMonths: 12,
	sortOrder: 2,
	archivedAt: null,
	createdAt: '2026-04-01T12:00:00Z'
};

const archivedTask: IctTask = {
	...activeTask,
	id: 'task-archived',
	taskCode: '181-105-9999',
	title: 'Archived task',
	archivedAt: '2026-04-02T12:00:00Z'
};

const infantryTask: IctTask = {
	...activeTask,
	id: 'task-infantry',
	taskCode: '071-COM-1001',
	title: 'React to contact',
	description: null,
	mos: ['11B'],
	expirationMonths: null,
	sortOrder: 1
};

const allMosTask: IctTask = {
	...activeTask,
	id: 'task-all-mos',
	taskCode: '071-COM-2001',
	title: 'Submit readiness report',
	description: null,
	mos: [],
	expirationMonths: null,
	sortOrder: 3
};

const completions = [
	{ id: 'c1', ictTaskId: 'task-1' },
	{ id: 'c2', ictTaskId: 'task-1' }
] as PersonnelIctCompletion[];

describe('IctTaskLibraryPage', () => {
	beforeEach(() => {
		accessFacts = { membershipRole: 'owner' };
		ictTasksStore.load([activeTask, archivedTask], 'org-1');
		personnelIctCompletionsStore.load(completions, 'org-1');
	});

	afterEach(() => {
		vi.restoreAllMocks();
		cleanup();
		ictTasksStore.load([], 'org-test-reset');
		personnelIctCompletionsStore.load([], 'org-test-reset');
	});

	it.each([true, false])(
		'requests a workspace refresh for the next navigation when a restore starts (saved: %s)',
		async (saved) => {
			resetCriticalTasksWorkspaceStatus();
			let settle!: (saved: boolean) => void;
			vi.spyOn(ictTasksStore, 'updateOrThrow').mockReturnValue(new Promise((resolve) => (settle = resolve)));
			render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });
			await fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
			await fireEvent.click(screen.getByRole('button', { name: /Archived task/ }));
			expect(criticalTasksWorkspaceStatus.refreshRequested).toBe(false);

			await fireEvent.click(screen.getByRole('button', { name: 'Restore Task' }));
			expect(criticalTasksWorkspaceStatus.refreshRequested).toBe(true);
			settle(saved);
			await Promise.resolve();
			expect(criticalTasksWorkspaceStatus.refreshRequested).toBe(true);
		}
	);

	it('keeps New Task and Import CSV unavailable until the library has loaded', async () => {
		personnelIctCompletionsStore.load(completions, 'org-other');
		render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

		expect(screen.getByRole('status', { name: 'Loading ICT task library' })).toBeTruthy();
		const newTask = screen.getByRole('button', { name: 'New Task' }) as HTMLButtonElement;
		expect(newTask.disabled).toBe(true);
		expect(newTask.title).toBe('Critical Tasks are still loading.');
		await fireEvent.click(newTask);
		expect(screen.queryByLabelText('Task code')).toBeNull();

		personnelIctCompletionsStore.load(completions, 'org-1');
		await waitFor(() => expect(newTask.disabled).toBe(false));
	});

	it('shows active tasks only in configured library order', () => {
		render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

		expect(screen.getByRole('toolbar', { name: 'ICT task library controls' })).toBeTruthy();
		const library = screen.getByRole('list', { name: 'ICT task library' });
		expect(within(library).getByText('181-105-1001')).toBeTruthy();
		expect(within(library).getByText('Casualty Care / 68W')).toBeTruthy();
		expect(screen.queryByText('181-105-9999')).toBeNull();
	});

	it('orders the status view, search, the MOS filter, Import CSV and New Task along the row', () => {
		render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

		const row = within(screen.getByRole('toolbar', { name: 'ICT task library controls' }));
		const order = [
			row.getByRole('button', { name: 'Active' }),
			row.getByRole('searchbox', { name: 'Search' }),
			row.getByRole('button', { name: 'MOS' }),
			row.getByRole('button', { name: 'Import CSV' }),
			row.getByRole('button', { name: 'New Task' })
		];

		for (const [index, control] of order.slice(1).entries()) {
			expect(order[index].compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		}
	});

	describe('when the toolbar folds', () => {
		const toolbarName = 'ICT task library controls';

		afterEach(() => vi.unstubAllGlobals());

		async function renderFolded() {
			const widths = stubToolbarWidths();
			ictTasksStore.load([activeTask, infantryTask, archivedTask], 'org-1');
			render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });
			await widths.foldAll();
		}

		it('switches between active and archived tasks from the status radio group in More', async () => {
			await renderFolded();
			const row = within(screen.getByRole('toolbar', { name: toolbarName }));
			expect(row.queryByRole('button', { name: 'Archived' })).toBeNull();
			expect(row.getByRole('button', { name: 'New Task' })).toBeTruthy();

			const menu = await openToolbarMore(toolbarName);
			const status = within(menu).getByRole('group', { name: 'Filter ICT tasks by status' });
			expect(within(status).getByRole('menuitemradio', { name: 'Active' }).getAttribute('aria-checked')).toBe('true');
			await fireEvent.click(within(status).getByRole('menuitemradio', { name: 'Archived' }));

			expect(await screen.findByText('Archived Tasks')).toBeTruthy();
			expect(within(screen.getByRole('list', { name: 'ICT task library' })).getByText('Archived task')).toBeTruthy();
			await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
			await openToolbarMore(toolbarName);
			expect(screen.getByRole('menuitem', { name: 'Clear filters' })).toBeTruthy();
		});

		it('filters by MOS from the folded submenu and clears the filter from More', async () => {
			await renderFolded();
			const taskList = () => screen.getByRole('list', { name: 'ICT task library' });

			await openToolbarMore(toolbarName);
			await openToolbarSubmenu('MOS, All MOS');
			await fireEvent.click(await screen.findByRole('menuitemradio', { name: '11B' }));
			expect(within(taskList()).getByText('React to contact')).toBeTruthy();
			expect(within(taskList()).queryByText('Perform tactical combat casualty care')).toBeNull();

			await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
			await openToolbarMore(toolbarName);
			await fireEvent.click(screen.getByRole('menuitem', { name: 'Clear filters' }));
			await waitFor(() => expect(within(taskList()).getByText('Perform tactical combat casualty care')).toBeTruthy());
		});

		it('opens the import workspace from More and returns focus to More when it closes', async () => {
			await renderFolded();

			await openToolbarMore(toolbarName);
			await fireEvent.click(screen.getByRole('menuitem', { name: 'Import CSV' }));
			expect(await screen.findByRole('heading', { name: 'Import ICT Tasks' })).toBeTruthy();

			await fireEvent.click(
				within(screen.getByRole('region', { name: 'ICT task import workspace' })).getByRole('button', {
					name: 'Cancel'
				})
			);
			await waitFor(() =>
				expect(document.activeElement).toBe(screen.getByRole('button', { name: `More ${toolbarName}` }))
			);
		});

		it('disables Import CSV in More with the same loading state as the row', async () => {
			const widths = stubToolbarWidths();
			personnelIctCompletionsStore.load(completions, 'org-other');
			render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });
			await widths.foldAll();

			await openToolbarMore(toolbarName);
			expect(screen.getByRole('menuitem', { name: 'Import CSV' }).getAttribute('aria-disabled')).toBe('true');
			expect((screen.getByRole('button', { name: 'New Task' }) as HTMLButtonElement).disabled).toBe(true);
		});
	});

	it('denies library configuration to Critical Tasks viewers', () => {
		accessFacts = {
			membershipRole: 'owner',
			capabilityMap: { ...createCapabilityMap('configure'), criticalTasks: 'view' }
		};

		render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

		expect(screen.getByRole('heading', { name: 'Access Restricted' })).toBeTruthy();
		expect(screen.queryByRole('list', { name: 'ICT task library' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Import CSV' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'New Task' })).toBeNull();
	});

	it('uses the Critical Tasks configure policy affordance instead of privileged role for library management', () => {
		accessFacts = { membershipRole: 'member', capabilityMap: createCapabilityMap('configure') };

		render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

		expect(screen.getByRole('button', { name: 'Import CSV' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'New Task' })).toBeTruthy();
	});

	it('discards an unsaved task draft when the Organization changes', async () => {
		const view = render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });
		await fireEvent.click(screen.getByRole('button', { name: 'New Task' }));
		await fireEvent.input(screen.getByLabelText('Task code'), { target: { value: 'A-PRIVATE-TASK' } });
		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'A task draft' } });

		ictTasksStore.load([{ ...activeTask, id: 'task-b', taskCode: 'B-EXISTING' }], 'org-2');
		personnelIctCompletionsStore.load([], 'org-2');
		await view.rerender({ org, data: { orgId: 'org-2' } });

		await waitFor(() => expect(screen.queryByRole('heading', { name: 'New ICT Task' })).toBeNull());
		await fireEvent.click(screen.getByRole('button', { name: 'New Task' }));
		expect((screen.getByLabelText('Task code') as HTMLInputElement).value).toBe('');
		expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('');
	});

	it('filters active tasks by task search text', async () => {
		ictTasksStore.load([activeTask, infantryTask, allMosTask, archivedTask], 'org-1');

		render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

		const taskList = () => screen.getByRole('list', { name: 'ICT task library' });

		expect(within(taskList()).getByText('Perform tactical combat casualty care')).toBeTruthy();
		expect(within(taskList()).getByText('React to contact')).toBeTruthy();
		expect(within(taskList()).getByText('Submit readiness report')).toBeTruthy();

		await fireEvent.input(screen.getByLabelText('Search'), {
			target: { value: 'contact' }
		});

		expect(within(taskList()).getByText('React to contact')).toBeTruthy();
		expect(within(taskList()).queryByText('Perform tactical combat casualty care')).toBeNull();

		await fireEvent.input(screen.getByLabelText('Search'), {
			target: { value: '' }
		});

		await fireEvent.input(screen.getByLabelText('Search'), {
			target: { value: '181 care' }
		});

		expect(within(taskList()).getByText('Perform tactical combat casualty care')).toBeTruthy();
		expect(within(taskList()).queryByText('Submit readiness report')).toBeNull();
	});

	it('opens the dedicated import workspace instead of the old pasted CSV side panel', async () => {
		render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

		await fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }));

		expect(screen.getByRole('toolbar', { name: 'ICT task library controls' })).toBeTruthy();
		expect(await screen.findByRole('heading', { name: 'Import ICT Tasks' })).toBeTruthy();
		expect(screen.getByRole('region', { name: 'ICT task import workspace' })).toBeTruthy();
		expect(screen.queryByLabelText(/CSV data/i)).toBeNull();
	});

	function describedBy(element: HTMLElement): string[] {
		return (element.getAttribute('aria-describedby') ?? '')
			.split(/\s+/)
			.filter(Boolean)
			.map((id) => document.getElementById(id)?.textContent?.trim() ?? `missing #${id}`);
	}

	it('names each missing required field on Create Task and focuses the first', async () => {
		const add = vi.spyOn(ictTasksStore, 'add');
		render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

		await fireEvent.click(screen.getByRole('button', { name: 'New Task' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));

		const taskCode = screen.getByLabelText('Task code');
		const title = screen.getByLabelText('Title');
		await waitFor(() => expect(document.activeElement).toBe(taskCode));
		expect(taskCode.getAttribute('aria-invalid')).toBe('true');
		expect(describedBy(taskCode)).toEqual(['Task code is required']);
		expect(title.getAttribute('aria-invalid')).toBe('true');
		expect(describedBy(title)).toEqual(['Title is required']);
		expect(add).not.toHaveBeenCalled();
	});

	it.each([
		{
			field: 'Expiration override',
			value: '0',
			error: 'Enter a whole number of months, 1 or more, or leave blank for the Organization default'
		},
		{
			field: 'Expiration override',
			value: '1.5',
			error: 'Enter a whole number of months, 1 or more, or leave blank for the Organization default'
		},
		{ field: 'Sort order', value: '-1', error: 'Enter a whole number, 0 or more' },
		{ field: 'Sort order', value: '2.5', error: 'Enter a whole number, 0 or more' }
	])('rejects $field $value on its field without saving', async ({ field, value, error }) => {
		const add = vi.spyOn(ictTasksStore, 'add').mockResolvedValue({ ...activeTask, id: 'task-new' });
		render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

		await fireEvent.click(screen.getByRole('button', { name: 'New Task' }));
		await fireEvent.input(screen.getByLabelText('Task code'), { target: { value: '181-105-2000' } });
		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Evacuate casualty' } });
		await fireEvent.input(screen.getByLabelText('Expiration override'), { target: { value: '' } });
		const input = screen.getByLabelText(field) as HTMLInputElement;
		await fireEvent.input(input, { target: { value } });
		await fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));

		await waitFor(() => expect(document.activeElement).toBe(input));
		expect(input.getAttribute('aria-invalid')).toBe('true');
		expect(describedBy(input)).toEqual([error]);
		expect(add.mock.calls).toEqual([]);

		await fireEvent.input(input, { target: { value: field === 'Sort order' ? '4' : '' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));

		expect(add.mock.calls[0]?.[0]).toMatchObject({
			expirationMonths: null,
			sortOrder: field === 'Sort order' ? 4 : 3
		});
	});

	it.each([
		{
			field: 'Expiration override',
			error: 'Enter a whole number of months, 1 or more, or leave blank for the Organization default'
		},
		{ field: 'Sort order', error: 'Enter a whole number, 0 or more' }
	])('rejects $field text the browser cannot parse instead of reading it as blank', async ({ field, error }) => {
		const add = vi.spyOn(ictTasksStore, 'add').mockResolvedValue({ ...activeTask, id: 'task-new' });
		render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

		await fireEvent.click(screen.getByRole('button', { name: 'New Task' }));
		await fireEvent.input(screen.getByLabelText('Task code'), { target: { value: '181-105-2000' } });
		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Evacuate casualty' } });
		const input = screen.getByLabelText(field) as HTMLInputElement;
		Object.defineProperty(input, 'validity', { configurable: true, get: () => ({ badInput: true, valid: false }) });
		await fireEvent.input(input, { target: { value: '' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));

		await waitFor(() => expect(document.activeElement).toBe(input));
		expect(input.getAttribute('aria-invalid')).toBe('true');
		expect(describedBy(input)).toEqual([error]);
		expect(add.mock.calls).toEqual([]);
	});

	it('keeps a duplicate task code on its field with the draft and focus', async () => {
		vi.spyOn(ictTasksStore, 'add').mockRejectedValue(new Error('Task code already exists in this Organization'));
		render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

		await fireEvent.click(screen.getByRole('button', { name: 'New Task' }));
		const taskCode = screen.getByLabelText('Task code') as HTMLInputElement;
		const title = screen.getByLabelText('Title') as HTMLInputElement;
		await fireEvent.input(taskCode, { target: { value: '181-105-1001' } });
		await fireEvent.input(title, { target: { value: 'Duplicate probe' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));

		await waitFor(() => expect(document.activeElement).toBe(taskCode));
		expect(taskCode.getAttribute('aria-invalid')).toBe('true');
		expect(describedBy(taskCode)).toEqual(['Task code already exists in this Organization']);
		expect(title.getAttribute('aria-invalid')).toBeNull();
		expect([taskCode.value, title.value]).toEqual(['181-105-1001', 'Duplicate probe']);
		expect(screen.getByRole('heading', { name: 'New ICT Task' })).toBeTruthy();
	});

	it('reports any other failed save as an alert and returns focus to Create Task', async () => {
		vi.spyOn(ictTasksStore, 'add').mockRejectedValue(new Error('Network unavailable'));
		render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

		await fireEvent.click(screen.getByRole('button', { name: 'New Task' }));
		await fireEvent.input(screen.getByLabelText('Task code'), { target: { value: '181-105-2000' } });
		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Evacuate casualty' } });
		const create = screen.getByRole('button', { name: 'Create Task' });
		await fireEvent.click(create);

		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toContain('Network unavailable');
		await waitFor(() => expect(document.activeElement).toBe(create));
		expect(screen.getByLabelText('Task code').getAttribute('aria-invalid')).toBeNull();
	});

	it('moves focus into the task import and back to Import CSV when it closes', async () => {
		render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

		await fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }));
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Import ICT Tasks' })));

		await fireEvent.click(
			within(screen.getByRole('region', { name: 'ICT task import workspace' })).getByRole('button', {
				name: 'Cancel'
			})
		);
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Import CSV' })));
	});

	describe('reordering', () => {
		type ReplyOutcome = 'saved' | 'refused' | 'lost' | 'held';
		const ORDER_CHANGED = 'The task order changed before this move was saved. Reload to see the current order.';
		const BEFORE = { '071-COM-1001': 1, '181-105-1001': 2, '071-COM-2001': 3 };
		const MOVED = { '071-COM-1001': 1, '181-105-1001': 3, '071-COM-2001': 2 };
		const ORDER_COMMAND = 'POST /org/org-1/api/ict-tasks/order';

		function libraryProvider(outcomes: ReplyOutcome[] = []) {
			const saved = new Map(ictTasksStore.items.map((task) => [task.id, { ...task }]));
			const requests: string[] = [];
			let releaseHeld = () => {};
			const json = (status: number, body: unknown) =>
				new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

			function commit(url: string, body: Record<string, unknown>): Response {
				if (url.endsWith('/api/ict-tasks')) {
					const { id, ...patch } = body as { id: string } & Partial<IctTask>;
					saved.set(id, { ...saved.get(id)!, ...patch });
					return json(200, saved.get(id));
				}
				const changes = body.changes as Array<{ id: string; expectedSortOrder: number; sortOrder: number }>;
				if (changes.some((change) => saved.get(change.id)?.sortOrder !== change.expectedSortOrder)) {
					return json(409, { message: ORDER_CHANGED });
				}
				for (const change of changes) saved.set(change.id, { ...saved.get(change.id)!, sortOrder: change.sortOrder });
				return json(
					200,
					changes.map((change) => saved.get(change.id))
				);
			}

			vi.stubGlobal(
				'fetch',
				vi.fn(async (url: string, init: RequestInit) => {
					const outcome = outcomes[requests.length] ?? 'saved';
					requests.push(`${init.method} ${url}`);
					if (outcome === 'refused') return json(409, { message: 'Refused by the provider' });
					const reply = commit(url, JSON.parse(String(init.body)));
					if (outcome === 'lost') throw new TypeError('Failed to fetch');
					if (outcome === 'held') await new Promise<void>((resolve) => (releaseHeld = resolve));
					return reply;
				})
			);
			return {
				requests,
				release: () => releaseHeld(),
				sortOrders: () => Object.fromEntries([...saved.values()].map((task) => [task.taskCode, task.sortOrder]))
			};
		}

		function displayedOrder(): string[] {
			return screen
				.getAllByRole('button', { name: /^Move .* up$/ })
				.map((button) => button.getAttribute('aria-label')!.split(' ')[1]);
		}

		beforeEach(() => {
			ictTasksStore.load([infantryTask, activeTask, allMosTask], 'org-1');
		});

		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it.each([
			{
				replies: ['saved', 'saved'],
				saved: MOVED,
				shown: ['071-COM-1001', '071-COM-2001', '181-105-1001'],
				feedback: null
			},
			{
				replies: ['saved', 'refused'],
				saved: MOVED,
				shown: ['071-COM-1001', '071-COM-2001', '181-105-1001'],
				feedback: null
			},
			{
				replies: ['saved', 'lost'],
				saved: MOVED,
				shown: ['071-COM-1001', '071-COM-2001', '181-105-1001'],
				feedback: null
			},
			{
				replies: ['refused'],
				saved: BEFORE,
				shown: ['071-COM-1001', '181-105-1001', '071-COM-2001'],
				feedback: 'Refused by the provider'
			},
			{
				replies: ['lost'],
				saved: MOVED,
				shown: ['071-COM-1001', '181-105-1001', '071-COM-2001'],
				feedback: CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE
			}
		] as Array<{ replies: ReplyOutcome[]; saved: Record<string, number>; shown: string[]; feedback: string | null }>)(
			'saves the whole move or none of it with one command when replies are $replies',
			async ({ replies, saved, shown, feedback }) => {
				const provider = libraryProvider(replies);
				const error = vi.spyOn(toastStore, 'error');
				render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

				await fireEvent.click(screen.getByRole('button', { name: 'Move 181-105-1001 down' }));

				await waitFor(() => expect(error.mock.calls.flat()).toEqual(feedback ? [feedback] : []));
				await waitFor(() => expect(displayedOrder()).toEqual(shown));
				expect(provider.sortOrders()).toEqual(saved);
				expect(provider.requests).toEqual([ORDER_COMMAND]);
			}
		);

		it('completes the move for the original Organization when the scope changes before its reply', async () => {
			const provider = libraryProvider(['held']);
			const error = vi.spyOn(toastStore, 'error');
			const view = render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

			await fireEvent.click(screen.getByRole('button', { name: 'Move 181-105-1001 down' }));
			await waitFor(() => expect(provider.requests).toHaveLength(1));
			await view.rerender({ org, data: { orgId: 'org-2' } });
			await act(async () => provider.release());
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(provider.sortOrders()).toEqual(MOVED);
			expect(provider.requests).toEqual([ORDER_COMMAND]);
			expect(error).not.toHaveBeenCalled();
		});

		it('refuses a repeated move from a stale view instead of moving the tasks back', async () => {
			const provider = libraryProvider(['lost']);
			const error = vi.spyOn(toastStore, 'error');
			render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

			await fireEvent.click(screen.getByRole('button', { name: 'Move 181-105-1001 down' }));
			await waitFor(() => expect(error).toHaveBeenCalledWith(CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE));
			await fireEvent.click(screen.getByRole('button', { name: 'Move 181-105-1001 down' }));

			await waitFor(() => expect(error).toHaveBeenLastCalledWith(ORDER_CHANGED));
			expect(provider.sortOrders()).toEqual(MOVED);
			expect(provider.requests).toEqual([ORDER_COMMAND, ORDER_COMMAND]);
		});

		it('refuses a different overlapping move from a stale tied view after a lost reply', async () => {
			ictTasksStore.load(
				['A', 'B', 'C'].map((code) => ({ ...infantryTask, id: code, taskCode: code, sortOrder: 0 })),
				'org-1'
			);
			const provider = libraryProvider(['lost']);
			const error = vi.spyOn(toastStore, 'error');
			render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

			await fireEvent.click(screen.getByRole('button', { name: 'Move A down' }));
			await waitFor(() => expect(error).toHaveBeenCalledWith(CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE));
			await fireEvent.click(screen.getByRole('button', { name: 'Move B down' }));

			await waitFor(() => expect(error).toHaveBeenLastCalledWith(ORDER_CHANGED));
			expect(provider.sortOrders()).toEqual({ A: 1, B: 0, C: 1 });
			expect(displayedOrder()).toEqual(['A', 'B', 'C']);
			expect(provider.requests).toEqual([ORDER_COMMAND, ORDER_COMMAND]);
		});

		it('sends one move at a time', async () => {
			const provider = libraryProvider(['held']);
			render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

			await fireEvent.click(screen.getByRole('button', { name: 'Move 181-105-1001 down' }));
			await waitFor(() => expect(provider.requests).toHaveLength(1));
			await fireEvent.click(screen.getByRole('button', { name: 'Move 071-COM-1001 down' }));
			await act(async () => provider.release());

			await waitFor(() => expect(displayedOrder()).toEqual(['071-COM-1001', '071-COM-2001', '181-105-1001']));
			expect(provider.requests).toEqual([ORDER_COMMAND]);
		});

		it('sends nothing and points to Edit when a move exceeds the supported order', async () => {
			const crowded = Array.from({ length: 2 }, (_, index) => ({
				...infantryTask,
				id: `t-${index}`,
				taskCode: `T${String(index).padStart(4, '0')}`,
				sortOrder: 2147483647
			}));
			ictTasksStore.load(crowded, 'org-1');
			const provider = libraryProvider();
			const error = vi.spyOn(toastStore, 'error');
			render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

			await fireEvent.click(screen.getByRole('button', { name: 'Move T0000 down' }));

			await waitFor(() =>
				expect(error).toHaveBeenCalledWith(expect.stringContaining('Use Edit and set its Sort order'))
			);
			expect(provider.requests).toEqual([]);
			expect(displayedOrder()).toEqual(['T0000', 'T0001']);
			expect(screen.getByRole('button', { name: 'Move T0000 down' })).not.toHaveProperty('disabled', true);
		});

		it('moves a task past neighbours that share its sort order without reordering the rest', async () => {
			const tied = (id: string, taskCode: string, sortOrder = 0): IctTask => ({
				...infantryTask,
				id,
				taskCode,
				sortOrder
			});
			ictTasksStore.load([tied('t-a', 'A-1'), tied('t-b', 'B-1'), tied('t-c', 'C-1'), tied('t-d', 'D-1', 1)], 'org-1');
			const provider = libraryProvider();
			render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

			await fireEvent.click(screen.getByRole('button', { name: 'Move A-1 down' }));

			await waitFor(() => expect(displayedOrder()).toEqual(['B-1', 'A-1', 'C-1', 'D-1']));
			expect(provider.sortOrders()).toEqual({ 'A-1': 1, 'B-1': 0, 'C-1': 1, 'D-1': 1 });
			expect(provider.requests).toEqual([ORDER_COMMAND]);
		});

		it.each([
			{
				pressed: 'Move 181-105-1001 down',
				focused: 'Move 181-105-1001 up',
				order: ['071-COM-1001', '071-COM-2001', '181-105-1001']
			},
			{
				pressed: 'Move 181-105-1001 up',
				focused: 'Move 181-105-1001 down',
				order: ['181-105-1001', '071-COM-1001', '071-COM-2001']
			},
			{
				pressed: 'Move 071-COM-2001 up',
				focused: 'Move 071-COM-2001 up',
				order: ['071-COM-1001', '071-COM-2001', '181-105-1001']
			}
		])('keeps focus on $focused after $pressed', async ({ pressed, focused, order }) => {
			libraryProvider();
			render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

			const button = screen.getByRole('button', { name: pressed });
			button.focus();
			await fireEvent.click(button);

			await waitFor(() => expect(displayedOrder()).toEqual(order));
			await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: focused })));
		});
	});

	it('creates task metadata with normalized MOS applicability and optional expiration override', async () => {
		const add = vi.spyOn(ictTasksStore, 'add').mockResolvedValue({
			...activeTask,
			id: 'task-new',
			taskCode: '181-105-2000',
			title: 'Evacuate casualty',
			mos: ['68W', '18D'],
			sortOrder: 3
		});

		render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

		await fireEvent.click(screen.getByRole('button', { name: 'New Task' }));
		await fireEvent.input(screen.getByLabelText('Task code'), { target: { value: '181-105-2000' } });
		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Evacuate casualty' } });
		await fireEvent.input(screen.getByLabelText('Description'), { target: { value: 'Move under fire' } });
		await fireEvent.input(screen.getByLabelText('Category'), { target: { value: ' Casualty Care ' } });
		await fireEvent.input(screen.getByLabelText('MOS applicability'), { target: { value: '68w, 18D, 68W' } });
		await fireEvent.input(screen.getByLabelText('Expiration override'), { target: { value: '18' } });
		await fireEvent.input(screen.getByLabelText('Sort order'), { target: { value: '3' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));

		expect(add).toHaveBeenCalledWith(
			expect.objectContaining({
				taskCode: '181-105-2000',
				title: 'Evacuate casualty',
				description: 'Move under fire',
				category: 'Casualty Care',
				mos: ['68W', '18D'],
				expirationMonths: 18,
				sortOrder: 3,
				archivedAt: null
			})
		);
	});

	it.each([
		{ open: 'New Task', select: false },
		{ open: 'Edit', select: true }
	])('moves focus to Task code on $open and back to $open on Cancel', async ({ open, select }) => {
		render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });
		if (select) await fireEvent.click(screen.getByRole('button', { name: /Perform tactical combat casualty care/ }));

		await fireEvent.click(screen.getByRole('button', { name: open }));
		await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Task code')));

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: open })));
	});

	it('edits task metadata without touching completion history', async () => {
		const update = vi.spyOn(ictTasksStore, 'updateOrThrow').mockResolvedValue(true);

		render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

		await fireEvent.click(screen.getByRole('button', { name: /Perform tactical combat casualty care/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Updated title' } });
		await fireEvent.input(screen.getByLabelText('Category'), { target: { value: '' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

		expect(update).toHaveBeenCalledWith(
			'task-1',
			expect.objectContaining({
				title: 'Updated title',
				category: null
			})
		);
		expect(personnelIctCompletionsStore.items).toHaveLength(2);
	});

	it('keeps the edit draft and shows the public uncertainty message when the save reply is lost', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ message: CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE }), {
				status: 503,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		const success = vi.spyOn(toastStore, 'success');

		render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

		await fireEvent.click(screen.getByRole('button', { name: /Perform tactical combat casualty care/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Draft title' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

		expect(await screen.findByText(CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE)).toBeTruthy();
		expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Draft title');
		expect(screen.getByRole('button', { name: 'Save Changes' })).toBeTruthy();
		expect(success).not.toHaveBeenCalled();
	});

	it('shows a definite refusal message from the save reply and keeps the draft', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ message: 'Expiration must be positive' }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				})
			)
		);

		render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

		await fireEvent.click(screen.getByRole('button', { name: /Perform tactical combat casualty care/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Draft title' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

		expect(await screen.findByText('Expiration must be positive')).toBeTruthy();
		expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Draft title');
	});

	it('warns with tied personnel completion count before soft-archive', async () => {
		const update = vi.spyOn(ictTasksStore, 'updateOrThrow').mockResolvedValue(true);

		render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

		await fireEvent.click(screen.getByRole('button', { name: /Perform tactical combat casualty care/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Archive Task' }));

		expect(await screen.findByText(/2 personnel completion records are tied to this task/)).toBeTruthy();

		await fireEvent.click(screen.getAllByRole('button', { name: 'Archive Task' }).at(-1)!);

		await waitFor(() => {
			expect(update).toHaveBeenCalledWith(
				'task-1',
				expect.objectContaining({
					archivedAt: expect.any(String)
				})
			);
		});
		expect(personnelIctCompletionsStore.items).toHaveLength(2);
	});

	it('shows archived tasks in a separate view and restores them back to active status', async () => {
		const update = vi.spyOn(ictTasksStore, 'updateOrThrow').mockResolvedValue(true);

		render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

		await fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
		await fireEvent.click(screen.getByRole('button', { name: /Archived task/ }));

		expect(screen.getByRole('button', { name: 'Restore Task' })).toBeTruthy();
		expect(screen.getByText('Apr 2, 2026')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Restore Task' }));

		await waitFor(() => {
			expect(update).toHaveBeenCalledWith(
				'task-archived',
				expect.objectContaining({
					archivedAt: null
				})
			);
		});
		expect(screen.getByRole('button', { name: 'Active' }).getAttribute('aria-pressed')).toBe('true');
	});
	it.each(['success', 'failure'])('keeps the new A draft after a retired save %s arrives', async (outcome) => {
		let release!: (value: IctTask | null) => void;
		let reject!: (reason: Error) => void;
		const pending = new Promise<IctTask | null>((resolve, fail) => {
			release = resolve;
			reject = fail;
		});
		vi.spyOn(ictTasksStore, 'add').mockReturnValueOnce(pending);
		const view = render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });
		await fireEvent.click(screen.getByRole('button', { name: 'New Task' }));
		await fireEvent.input(screen.getByLabelText('Task code'), { target: { value: 'OLD-A' } });
		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Retired draft' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));
		await view.rerender({ org, data: { orgId: 'org-2' } });
		await view.rerender({ org, data: { orgId: 'org-1' } });
		await fireEvent.click(screen.getByRole('button', { name: 'New Task' }));
		await fireEvent.input(screen.getByLabelText('Task code'), { target: { value: 'NEW-A' } });
		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Current draft' } });
		await act(async () => {
			if (outcome === 'success') release({ ...activeTask, id: 'old-saved' });
			else reject(new Error('Retired save failed'));
			await pending.catch(() => {});
		});
		expect((screen.getByLabelText('Task code') as HTMLInputElement).value).toBe('NEW-A');
		expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Current draft');
		expect(screen.queryByText('Retired save failed')).toBeNull();
		expect(screen.getByRole('button', { name: 'Create Task' }).hasAttribute('disabled')).toBe(false);
	});

	it.each(['archive', 'restore'])(
		'tells the user a lost %s reply may have saved and does not report success',
		async (action) => {
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue(
					new Response(JSON.stringify({ message: CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE }), {
						status: 503,
						headers: { 'Content-Type': 'application/json' }
					})
				)
			);
			const error = vi.spyOn(toastStore, 'error');
			render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });

			if (action === 'archive') {
				await fireEvent.click(screen.getByRole('button', { name: 'Archive Task' }));
				await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Archive Task' }));
			} else {
				await fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
				await fireEvent.click(screen.getByRole('button', { name: 'Restore Task' }));
			}

			await waitFor(() => expect(error).toHaveBeenCalledWith(CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE));
			expect(ictTasksStore.items.find((task) => task.id === 'task-1')?.archivedAt).toBeNull();
			expect(ictTasksStore.items.find((task) => task.id === 'task-archived')?.archivedAt).not.toBeNull();
		}
	);

	it('keeps the current archive confirmation after a retired A archive finishes', async () => {
		let release!: (value: boolean) => void;
		const pending = new Promise<boolean>((resolve) => {
			release = resolve;
		});
		vi.spyOn(ictTasksStore, 'updateOrThrow').mockReturnValueOnce(pending);
		const view = render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });
		await fireEvent.click(screen.getByRole('button', { name: 'Archive Task' }));
		await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Archive Task' }));
		await view.rerender({ org, data: { orgId: 'org-2' } });
		await view.rerender({ org, data: { orgId: 'org-1' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Archive Task' }));
		await act(async () => {
			release(true);
			await pending;
		});
		expect(screen.getByRole('alertdialog')).toBeTruthy();
	});

	it('keeps the current archived view after a retired A restore finishes', async () => {
		let release!: (value: boolean) => void;
		const pending = new Promise<boolean>((resolve) => {
			release = resolve;
		});
		vi.spyOn(ictTasksStore, 'updateOrThrow').mockReturnValueOnce(pending);
		const view = render(IctTaskLibraryPage, { props: { org, data: { orgId: 'org-1' } } });
		await fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Restore Task' }));
		await view.rerender({ org, data: { orgId: 'org-2' } });
		await view.rerender({ org, data: { orgId: 'org-1' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
		await act(async () => {
			release(true);
			await pending;
		});
		expect(screen.getByRole('button', { name: 'Archived' }).getAttribute('aria-pressed')).toBe('true');
	});
});
