// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Tasking, TaskingChoices } from '../taskingModel';
import TaskingDialog from './TaskingDialog.svelte';

const ALPHA = '00000000-0000-4000-8000-000000000201';
const BRAVO = '00000000-0000-4000-8000-000000000202';
const EVENT = '00000000-0000-4000-8000-000000000301';
const choices: TaskingChoices = {
	groups: [
		{ id: ALPHA, name: 'Alpha' },
		{ id: BRAVO, name: 'Bravo' }
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
	status: { kind: 'open' }
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => (resolve = done));
	return { promise, resolve };
}

function open(props: Partial<{ tasking: Tasking; organizationWide: boolean; choices: TaskingChoices }> = {}) {
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

const outcome = () => screen.getByLabelText('Outcome') as HTMLInputElement;
const responsible = () => screen.getByLabelText('Responsible') as HTMLSelectElement;
const optionValues = (select: HTMLSelectElement) =>
	[...select.options].filter((option) => !option.disabled).map((option) => option.value);

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
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

	it('asks who is responsible instead of assuming the organization, and sends nothing until chosen', async () => {
		const send = vi.fn();
		vi.stubGlobal('fetch', send);
		open();

		expect(responsible().value).toBe('');
		await fireEvent.input(outcome(), { target: { value: 'Brief the commander' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Create tasking' }));

		expect(send).not.toHaveBeenCalled();
		expect(responsible().getAttribute('aria-invalid')).toBe('true');
	});

	it('marks the Ends date invalid when it falls before Starts', async () => {
		const send = vi.fn();
		vi.stubGlobal('fetch', send);
		open({ tasking: { ...saved, execution: { startsOn: '2026-11-06', endsOn: '2026-11-02', reportTime: null } } });

		await fireEvent.input(outcome(), { target: { value: 'Provide five medics' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		expect(send).not.toHaveBeenCalled();
		const ends = screen.getByLabelText('Ends');
		expect(ends.getAttribute('aria-invalid')).toBe('true');
		expect(document.getElementById(ends.getAttribute('aria-describedby') ?? '')?.textContent).toBeTruthy();
		expect(screen.getByLabelText('Starts').getAttribute('aria-invalid')).not.toBe('true');
	});

	it('offers a Group-scoped operator only their Groups and locks responsibility when editing', () => {
		open({ organizationWide: false, choices: { ...choices, groups: [{ id: ALPHA, name: 'Alpha' }] } });
		expect(optionValues(responsible())).toEqual([ALPHA]);
		expect(responsible().value).toBe(ALPHA);
		cleanup();

		open({ organizationWide: false, tasking: saved });
		expect(responsible().disabled).toBe(true);
	});
});
