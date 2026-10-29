// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toastStore } from '$lib/stores/toast.svelte';
import type { Tasking, TaskingChoices, TaskingEventOption } from '../taskingModel';
import TaskingDialog from './TaskingDialog.svelte';

const goto = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto }));
vi.mock('$app/state', () => ({ page: { params: { orgId: 'c-co' } } }));

const ALPHA = '00000000-0000-4000-8000-000000000201';
const BRAVO = '00000000-0000-4000-8000-000000000202';
const SQUAD = '00000000-0000-4000-8000-000000000203';
const EVENT = '00000000-0000-4000-8000-000000000301';
const choices: TaskingChoices = {
	groups: [
		{ id: ALPHA, name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 },
		{ id: BRAVO, name: 'Bravo', sortOrder: 1, parentId: null, depth: 1 }
	],
	events: [{ id: EVENT, title: 'Best Medic Competition', startsOn: '2026-11-02', endsOn: '2026-11-06' }]
};
const saved: Tasking = {
	id: '00000000-0000-4000-8000-000000000101',
	title: 'Provide four trauma-lane medics',
	event: { id: EVENT, title: 'Best Medic Competition', startsOn: '2026-11-02', endsOn: '2026-11-06', cancelled: false },
	responsibility: { kind: 'group', groupId: ALPHA },
	suspenseOn: '2026-10-30',
	execution: { startsOn: '2026-11-02', endsOn: '2026-11-06', reportTime: '05:30' },
	requirement: { count: 4, qualifications: '68W' },
	instructions: null,
	status: { kind: 'open' },
	readiness: { equipment: null, checklist: null }
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => (resolve = done));
	return { promise, resolve };
}

function open(
	props: Partial<{
		tasking: Tasking;
		organizationWide: boolean;
		choices: TaskingChoices;
		linkTo: TaskingEventOption;
	}> = {}
) {
	const onSaved = vi.fn();
	render(TaskingDialog, {
		orgId: 'org-a',
		orgName: 'C Co',
		choices,
		organizationWide: true,
		onClose: vi.fn(),
		...props,
		onSaved
	});
	return { onSaved };
}

const outcome = () => screen.getByLabelText('Required outcome') as HTMLInputElement;
const groupCard = () => screen.getByRole('radio', { name: /A Group/ });
const organizationCard = () => screen.getByRole('radio', { name: /Organization level/ });
const sentBody = (send: { mock: { calls: unknown[][] } }, call = 0) =>
	JSON.parse(((send.mock.calls[call] as [string, RequestInit])[1].body as string) ?? 'null');

/** Any day will do; the visible month follows the real clock, so no test reads which day it was. */
async function chooseSuspense() {
	await fireEvent.click(screen.getByLabelText('Suspense'));
	await fireEvent.click(document.querySelector('[data-bits-day]:not([data-disabled])') as HTMLElement);
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	goto.mockClear();
});

describe('TaskingDialog', () => {
	it('sends one edit for repeated presses, keeping linked Event, execution and requirement', async () => {
		const reply = deferred<Response>();
		const send = vi.fn((_url: string, _init: RequestInit) => reply.promise);
		vi.stubGlobal('fetch', send);
		const { onSaved } = open({ tasking: saved });

		await fireEvent.input(outcome(), { target: { value: 'Provide five medics' } });
		const save = screen.getByRole('button', { name: 'Save changes' });
		await fireEvent.click(save);
		await fireEvent.click(save);

		expect(send).toHaveBeenCalledOnce();
		const [url, init] = send.mock.calls[0];
		expect(url).toBe(`/org/org-a/api/calendar-taskings/${saved.id}`);
		expect(JSON.parse(init.body as string)).toEqual({
			title: 'Provide five medics',
			eventId: EVENT,
			responsibility: { kind: 'group', groupId: ALPHA },
			suspenseOn: '2026-10-30',
			execution: { startsOn: '2026-11-02', endsOn: '2026-11-06', reportTime: '05:30' },
			requirement: { count: 4, qualifications: '68W' },
			instructions: null
		});

		const stored = { ...saved, title: 'Provide five medics' };
		reply.resolve(Response.json(stored));
		await waitFor(() => expect(onSaved).toHaveBeenCalledWith(stored));
	});

	it('keeps the draft when the save fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('boom', { status: 500 }))
		);
		const { onSaved } = open({ tasking: saved });

		await fireEvent.input(outcome(), { target: { value: 'Provide five medics' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() => expect(outcome().disabled).toBe(false));
		expect(outcome().value).toBe('Provide five medics');
		expect(onSaved).not.toHaveBeenCalled();
		expect(screen.getByRole('alert')).toBeTruthy();
	});

	it('makes a linked Tasking standalone', async () => {
		const send = vi.fn(async () => Response.json(saved));
		vi.stubGlobal('fetch', send);
		open({ tasking: saved });

		await fireEvent.click(screen.getByRole('button', { name: 'Make standalone' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() => expect(send).toHaveBeenCalledOnce());
		expect(JSON.parse((send.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).eventId).toBeNull();
	});

	it('starts an Organization-wide operator at Organization level', async () => {
		const send = vi.fn(async () => Response.json(saved));
		vi.stubGlobal('fetch', send);
		open({ linkTo: choices.events[0] });

		expect(organizationCard().getAttribute('aria-checked')).toBe('true');
		await fireEvent.input(outcome(), { target: { value: 'Provide 3 lane graders' } });
		await chooseSuspense();
		await fireEvent.click(screen.getByRole('button', { name: 'Add tasking' }));

		await waitFor(() => expect(send).toHaveBeenCalledOnce());
		expect(sentBody(send)).toMatchObject({ draft: { eventId: EVENT, responsibility: { kind: 'organization' } } });
	});

	it('asks a Group-scoped operator with several Groups who is responsible and sends nothing until chosen', async () => {
		const send = vi.fn();
		vi.stubGlobal('fetch', send);
		open({ organizationWide: false });

		expect(groupCard().getAttribute('aria-checked')).toBe('false');
		expect(organizationCard().hasAttribute('disabled')).toBe(true);
		await fireEvent.input(outcome(), { target: { value: 'Brief the commander' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Create tasking' }));

		expect(send).not.toHaveBeenCalled();
		expect(screen.getByRole('radiogroup').getAttribute('aria-invalid')).toBe('true');
	});

	it('marks the committed dates invalid when Ends falls before Starts', async () => {
		const send = vi.fn();
		vi.stubGlobal('fetch', send);
		open({ tasking: { ...saved, execution: { startsOn: '2026-11-06', endsOn: '2026-11-02', reportTime: null } } });

		await fireEvent.input(outcome(), { target: { value: 'Provide five medics' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		expect(send).not.toHaveBeenCalled();
		const committed = screen.getByLabelText('People committed');
		expect(committed.getAttribute('aria-invalid')).toBe('true');
		expect(document.getElementById(committed.getAttribute('aria-describedby') ?? '')?.textContent).toBeTruthy();
	});

	it('preselects the only Group of a Group-scoped operator and locks responsibility when editing', () => {
		open({ organizationWide: false, choices: { ...choices, groups: [choices.groups[0]] } });
		expect(groupCard().getAttribute('aria-checked')).toBe('true');
		expect(screen.getByText('Alpha')).toBeTruthy();
		cleanup();

		open({ organizationWide: false, tasking: saved });
		expect(groupCard().hasAttribute('disabled')).toBe(true);
		expect(organizationCard().hasAttribute('disabled')).toBe(true);
		expect((document.getElementById('tasking-group') as HTMLButtonElement).disabled).toBe(true);
	});

	it('makes a Group below another responsible when it is picked from the tree', async () => {
		const send = vi.fn(async () => Response.json(saved));
		vi.stubGlobal('fetch', send);
		const squad = { id: SQUAD, name: '1st Squad', sortOrder: 0, parentId: ALPHA, depth: 2 as const };
		open({ choices: { ...choices, groups: [...choices.groups, squad] } });

		await fireEvent.input(outcome(), { target: { value: 'Provide 3 lane graders' } });
		await chooseSuspense();
		await fireEvent.click(document.getElementById('tasking-group') as HTMLElement);
		await fireEvent.input(screen.getByRole('combobox', { name: 'Find a Group' }), { target: { value: '1st' } });
		await fireEvent.keyDown(screen.getByRole('combobox', { name: 'Find a Group' }), { key: 'Enter' });
		await fireEvent.click(screen.getByRole('button', { name: 'Create tasking' }));

		await waitFor(() => expect(send).toHaveBeenCalledOnce());
		expect(sentBody(send)).toMatchObject({ draft: { responsibility: { kind: 'group', groupId: SQUAD } } });
	});

	it('adds equipment then checklist after the Tasking, and lands on its page naming what did not save', async () => {
		const error = vi.spyOn(toastStore, 'error').mockReturnValue('toast');
		const send = vi.fn(async (url: string, _init: RequestInit) => {
			if (url.endsWith('/checklist')) return new Response('boom', { status: 500 });
			return Response.json(url.endsWith('/equipment') ? {} : saved);
		});
		vi.stubGlobal('fetch', send);
		const { onSaved } = open({ linkTo: choices.events[0] });

		await fireEvent.input(outcome(), { target: { value: 'Provide FLA ambulance' } });
		await chooseSuspense();
		await fireEvent.input(screen.getByLabelText('Equipment item 1'), { target: { value: 'M997 FLA ambulance' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Checklist' }));
		await fireEvent.input(screen.getByLabelText('Checklist item 1'), { target: { value: 'Driver licensed' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add tasking' }));

		await waitFor(() => expect(goto).toHaveBeenCalledWith(`/org/c-co/calendar/taskings/${saved.id}`));
		expect(send.mock.calls.map(([url]) => url.replace(`/org/org-a/api/calendar-taskings`, ''))).toEqual([
			'',
			`/${saved.id}/equipment`,
			`/${saved.id}/checklist`
		]);
		expect(sentBody(send, 1).draft).toEqual({ name: 'M997 FLA ambulance', quantity: 1, securedQuantity: 0 });
		expect(onSaved).toHaveBeenCalledWith(saved);
		expect(error.mock.calls[0][0]).toContain('Driver licensed');
		expect(error.mock.calls[0][0]).not.toContain('M997');
	});
});
