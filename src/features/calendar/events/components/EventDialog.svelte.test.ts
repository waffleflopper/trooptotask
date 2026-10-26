// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CalendarEvent } from '../eventModel';
import EventDialog from './EventDialog.svelte';

const KIM = '00000000-0000-4000-8000-000000000001';
const LEE = '00000000-0000-4000-8000-000000000002';
const members = { [KIM]: 'sgt.kim@example.mil', [LEE]: 'ssg.lee@example.mil' };
const saved: CalendarEvent = {
	id: '00000000-0000-4000-8000-000000000101',
	title: 'Best Medic Competition',
	startsOn: '2026-10-19',
	endsOn: '2026-10-23',
	host: { kind: 'external', name: '1-1 BN' },
	coordinatorUserId: KIM,
	location: null,
	description: null,
	sourceReference: 'BN FRAGO 27-012',
	cancellation: null
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => (resolve = done));
	return { promise, resolve };
}

function open(props: Partial<{ event: CalendarEvent; onSaved: (event: CalendarEvent) => void }> = {}) {
	const onSaved = props.onSaved ?? vi.fn();
	render(EventDialog, { orgId: 'org-a', members, currentUserId: LEE, onClose: vi.fn(), ...props, onSaved });
	return { onSaved };
}

const titleInput = () => screen.getByLabelText('Title') as HTMLInputElement;

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('EventDialog', () => {
	it('sends one edit for repeated presses and keeps the saved dates as date-only strings', async () => {
		const reply = deferred<Response>();
		const send = vi.fn((_url: string, _init: RequestInit) => reply.promise);
		vi.stubGlobal('fetch', send);
		const { onSaved } = open({ event: saved });

		await fireEvent.input(titleInput(), { target: { value: 'Best Medic 2026' } });
		const save = screen.getByRole('button', { name: 'Save changes' });
		await fireEvent.click(save);
		await fireEvent.click(save);

		expect(send).toHaveBeenCalledOnce();
		const [url, init] = send.mock.calls[0];
		expect(url).toBe(`/org/org-a/api/calendar-events/${saved.id}`);
		expect(JSON.parse(init.body as string)).toMatchObject({
			title: 'Best Medic 2026',
			startsOn: '2026-10-19',
			endsOn: '2026-10-23',
			host: { kind: 'external', name: '1-1 BN' },
			coordinatorUserId: KIM
		});

		const stored = { ...saved, title: 'Best Medic 2026' };
		reply.resolve(Response.json(stored));
		await waitFor(() => expect(onSaved).toHaveBeenCalledWith(stored));
	});

	it('keeps the draft and reopens the form when the save fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('boom', { status: 500 }))
		);
		const { onSaved } = open({ event: saved });

		await fireEvent.input(titleInput(), { target: { value: 'Best Medic 2026' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() => expect(titleInput().disabled).toBe(false));
		expect(titleInput().value).toBe('Best Medic 2026');
		expect(onSaved).not.toHaveBeenCalled();
		expect(screen.getByRole('alert')).toBeTruthy();
	});

	it('defaults a new event to the creator as coordinator and sends nothing without the required fields', async () => {
		const send = vi.fn();
		vi.stubGlobal('fetch', send);
		open();

		expect((screen.getByLabelText('Coordinator') as HTMLSelectElement).value).toBe(LEE);
		await fireEvent.click(screen.getByRole('button', { name: 'Create event' }));

		expect(send).not.toHaveBeenCalled();
		expect(titleInput().getAttribute('aria-invalid')).toBe('true');
	});
});
