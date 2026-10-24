// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { endOrganizationLifetime } from '$lib/stores/core';
import type { PersonnelPageContext } from '../../contexts/PersonnelPageContext.svelte';
import type { Personnel } from '../../personnel.types';
import type { Known, OpenFollowUpSignal, SignalRow } from '../../rosterSignals';

const { gotoMock, toastSuccessMock, navigationGuard } = vi.hoisted(() => ({
	gotoMock: vi.fn(),
	toastSuccessMock: vi.fn(),
	navigationGuard: { current: undefined as ((navigation: unknown) => void) | undefined }
}));

vi.mock('$app/navigation', () => ({
	goto: gotoMock,
	invalidate: vi.fn(),
	beforeNavigate: (guard: (navigation: unknown) => void) => (navigationGuard.current = guard)
}));
vi.mock('svelte-sonner', () => ({
	toast: { success: toastSuccessMock, info: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }
}));

import RosterNotePopover from './RosterNotePopover.svelte';

const person: Personnel = {
	id: 'person-1',
	rank: 'SGT',
	lastName: 'Okafor',
	firstName: 'Daniel',
	mos: '68W',
	clinicRole: 'Treatment NCO',
	groupId: 'group-1',
	groupName: 'Alpha',
	archivedAt: null,
	ets: null,
	deros: null,
	slug: 'okafor-daniel'
};

function readyRow(openFollowUps: Known<OpenFollowUpSignal>): SignalRow {
	return {
		kind: 'ready',
		value: {
			personnelId: person.id,
			today: { kind: 'withheld' },
			attention: { kind: 'withheld' },
			matches: {},
			openFollowUps,
			loss: null
		}
	};
}

const NONE_OPEN = readyRow({ kind: 'known', value: { count: 0, first: null } });

function makeCtx(row: SignalRow = NONE_OPEN, canOpen = true, viewerDay = '2026-10-06') {
	const refresh = vi.fn().mockResolvedValue(undefined);
	const invalidate = vi.fn();
	const ctx = {
		orgId: 'org-1',
		data: { orgId: 'org-1', asOf: '2026-10-06' },
		signals: { refresh, viewerDay: () => viewerDay },
		peek: { invalidate },
		signalRow: () => row,
		canOpenPersonnelDetail: () => canOpen
	};
	return { ctx: ctx as unknown as PersonnelPageContext, refresh, invalidate, raw: ctx };
}

function mount(ctx: PersonnelPageContext) {
	const onclose = vi.fn();
	const { rerender } = render(RosterNotePopover, {
		props: { ctx, person, recordHref: '/org/org-1/personnel/okafor-daniel', onclose }
	});
	return { onclose, rerender };
}

function postedBody(fetchMock: ReturnType<typeof vi.fn>): unknown {
	return JSON.parse(fetchMock.mock.calls[0][1].body as string);
}

describe('RosterNotePopover', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('saves a follow-up with the Friday preset, refreshes that Person’s signals and offers the Log in the toast', async () => {
		const { ctx, refresh, invalidate } = makeCtx();
		const { onclose, rerender } = mount(ctx);

		const title = await screen.findByRole('textbox', { name: 'Follow-up title' });
		await waitFor(() => expect(document.activeElement).toBe(title));
		await fireEvent.input(title, { target: { value: 'Get CPR/BLS recert' } });
		const friday = screen.getByRole('button', { name: 'Fri 9 Oct' });
		await fireEvent.click(friday);
		expect(friday.getAttribute('aria-pressed')).toBe('true');
		expect(screen.getByRole('button', { name: 'Tomorrow' }).getAttribute('aria-pressed')).toBe('false');
		await fireEvent.click(screen.getByRole('button', { name: 'Add follow-up' }));

		await waitFor(() => expect(onclose).toHaveBeenCalledOnce());
		expect(fetchMock.mock.calls[0][0]).toBe('/org/org-1/api/personnel/person-1/follow-ups');
		expect(postedBody(fetchMock)).toEqual({ title: 'Get CPR/BLS recert', notes: '', dueDate: '2026-10-09' });
		expect(refresh).toHaveBeenCalledExactlyOnceWith(['person-1']);
		expect(invalidate).toHaveBeenCalledExactlyOnceWith(['person-1'], ['followUps']);
		expect(toastSuccessMock).toHaveBeenCalledOnce();
		const [message, options] = toastSuccessMock.mock.calls[0];
		expect(message).toBe('Follow-up added for SGT Okafor');
		// The page clears its target when the popover closes; the toast's link must not follow it.
		await rerender({ recordHref: 'undefined' });
		options.action.onClick();
		expect(gotoMock).toHaveBeenCalledExactlyOnceWith('/org/org-1/personnel/okafor-daniel/log');
	});

	it('counts the due shortcuts from the viewer’s day when the page still shows yesterday', async () => {
		const { ctx } = makeCtx(NONE_OPEN, true, '2026-10-07');
		const { onclose } = mount(ctx);

		await fireEvent.input(await screen.findByRole('textbox', { name: 'Follow-up title' }), {
			target: { value: 'Call about leave' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Add follow-up' }));

		await waitFor(() => expect(onclose).toHaveBeenCalledOnce());
		expect(postedBody(fetchMock)).toEqual({ title: 'Call about leave', notes: '', dueDate: '2026-10-08' });
	});

	it('saves a note without a date and without refreshing signals', async () => {
		const { ctx, refresh, invalidate } = makeCtx();
		const { onclose } = mount(ctx);

		await fireEvent.click(await screen.findByRole('radio', { name: 'Note' }));
		expect(screen.queryByRole('button', { name: 'Tomorrow' })).toBeNull();
		await fireEvent.input(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'Strong week.' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add note' }));

		await waitFor(() => expect(onclose).toHaveBeenCalledOnce());
		expect(fetchMock.mock.calls[0][0]).toBe('/org/org-1/api/personnel/person-1/leader-notes');
		expect(postedBody(fetchMock)).toEqual({ text: 'Strong week.' });
		expect(refresh).not.toHaveBeenCalled();
		expect(invalidate).toHaveBeenCalledExactlyOnceWith(['person-1'], ['note']);
	});

	it('saves with Ctrl+Enter from the details field', async () => {
		const { ctx } = makeCtx();
		const { onclose } = mount(ctx);

		await fireEvent.input(await screen.findByRole('textbox', { name: 'Follow-up title' }), {
			target: { value: 'Call about leave' }
		});
		await fireEvent.keyDown(screen.getByRole('textbox', { name: 'Details' }), { key: 'Enter', ctrlKey: true });

		await waitFor(() => expect(onclose).toHaveBeenCalledOnce());
		expect(postedBody(fetchMock)).toMatchObject({ title: 'Call about leave', dueDate: null });
	});

	it('keeps the popover and the typed text and shows the reason when the save fails', async () => {
		fetchMock.mockResolvedValue(
			new Response(JSON.stringify({ message: 'Not allowed for this Group' }), { status: 403 })
		);
		const { ctx, refresh } = makeCtx();
		const { onclose } = mount(ctx);

		const title = await screen.findByRole('textbox', { name: 'Follow-up title' });
		await fireEvent.input(title, { target: { value: 'Call about leave' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add follow-up' }));

		expect((await screen.findByRole('alert')).textContent).toBe('Not allowed for this Group');
		expect((title as HTMLInputElement).value).toBe('Call about leave');
		expect(onclose).not.toHaveBeenCalled();
		expect(refresh).not.toHaveBeenCalled();
		expect(toastSuccessMock).not.toHaveBeenCalled();
	});

	it('announces nothing, refreshes nothing and stays put when the Organization lifetime ended before the reply', async () => {
		let reply!: (response: Response) => void;
		fetchMock.mockReturnValue(new Promise<Response>((resolve) => (reply = resolve)));
		const { ctx, refresh } = makeCtx();
		const { onclose } = mount(ctx);

		await fireEvent.input(await screen.findByRole('textbox', { name: 'Follow-up title' }), {
			target: { value: 'Call about leave' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Add follow-up' }));
		endOrganizationLifetime();
		reply(new Response('{}', { status: 201 }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(refresh).not.toHaveBeenCalled();
		expect(toastSuccessMock).not.toHaveBeenCalled();
		expect(onclose).not.toHaveBeenCalled();
	});

	it('closes at once on Escape when nothing was typed', async () => {
		const { ctx } = makeCtx();
		const { onclose } = mount(ctx);

		await screen.findByRole('textbox', { name: 'Follow-up title' });
		await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

		await waitFor(() => expect(onclose).toHaveBeenCalledOnce());
	});

	it('asks before discarding typed text, and keeps it when told to keep editing', async () => {
		const { ctx } = makeCtx();
		const { onclose } = mount(ctx);

		const title = await screen.findByRole('textbox', { name: 'Follow-up title' });
		await fireEvent.input(title, { target: { value: 'Call about leave' } });
		await fireEvent.keyDown(title, { key: 'Escape' });

		await screen.findByText('Discard what you typed?');
		expect(onclose).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
		expect(screen.queryByText('Discard what you typed?')).toBeNull();
		expect((title as HTMLInputElement).value).toBe('Call about leave');
		await waitFor(() => expect(document.activeElement).toBe(title));

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
		expect(onclose).toHaveBeenCalledOnce();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	function attemptNavigation(to: string, type: 'link' | 'popstate' = 'link', delta = -1) {
		const cancel = vi.fn();
		navigationGuard.current?.({ cancel, willUnload: false, type, delta, to: { url: new URL(to, 'http://localhost') } });
		return cancel;
	}

	it('holds a navigation while text is typed, keeps the text, and goes on after Discard', async () => {
		const { ctx } = makeCtx();
		const { onclose } = mount(ctx);

		const title = await screen.findByRole('textbox', { name: 'Follow-up title' });
		await fireEvent.input(title, { target: { value: 'Call about leave' } });
		const cancel = attemptNavigation('/org/org-1/personnel/young-test?tab=log#top');

		expect(cancel).toHaveBeenCalledOnce();
		await screen.findByText('Discard what you typed?');
		expect((title as HTMLInputElement).value).toBe('Call about leave');
		expect(gotoMock).not.toHaveBeenCalled();
		expect(onclose).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
		expect(onclose).toHaveBeenCalledOnce();
		expect(gotoMock).toHaveBeenCalledExactlyOnceWith('/org/org-1/personnel/young-test?tab=log#top');
	});

	it('still goes on after Discard when the outside press that follows the click asks to close again', async () => {
		const { ctx } = makeCtx();
		mount(ctx);

		const title = await screen.findByRole('textbox', { name: 'Follow-up title' });
		await fireEvent.input(title, { target: { value: 'Call about leave' } });
		attemptNavigation('/org/org-1/personnel/young-test');
		await fireEvent.keyDown(title, { key: 'Escape' });
		await fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));

		expect(gotoMock).toHaveBeenCalledExactlyOnceWith('/org/org-1/personnel/young-test');
	});

	it('drops the held navigation when told to keep editing', async () => {
		const { ctx } = makeCtx();
		const { onclose } = mount(ctx);

		await fireEvent.input(await screen.findByRole('textbox', { name: 'Follow-up title' }), {
			target: { value: 'Call about leave' }
		});
		attemptNavigation('/org/org-1/personnel/young-test');
		await fireEvent.click(await screen.findByRole('button', { name: 'Keep editing' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));

		expect(onclose).toHaveBeenCalledOnce();
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it('steps history back after Discard when Back was pressed', async () => {
		const goSpy = vi.spyOn(history, 'go').mockImplementation(() => {});
		const { ctx } = makeCtx();
		mount(ctx);

		await fireEvent.input(await screen.findByRole('textbox', { name: 'Follow-up title' }), {
			target: { value: 'Call about leave' }
		});
		expect(attemptNavigation('/org/org-1/personnel', 'popstate', -1)).toHaveBeenCalledOnce();
		await fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));

		expect(goSpy).toHaveBeenCalledExactlyOnceWith(-1);
		expect(gotoMock).not.toHaveBeenCalled();
		goSpy.mockRestore();
	});

	it('lets a navigation through when nothing was typed', async () => {
		const { ctx } = makeCtx();
		mount(ctx);

		await screen.findByRole('textbox', { name: 'Follow-up title' });
		expect(attemptNavigation('/org/org-1/personnel/young-test')).not.toHaveBeenCalled();
	});

	it('locks every draft control while the save is pending and unlocks them when it fails', async () => {
		let reply!: (response: Response) => void;
		fetchMock.mockReturnValue(new Promise<Response>((resolve) => (reply = resolve)));
		const { ctx } = makeCtx();
		const { onclose } = mount(ctx);

		const title = await screen.findByRole('textbox', { name: 'Follow-up title' });
		await fireEvent.input(title, { target: { value: 'Call about leave' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add follow-up' }));

		const locked = () => [
			screen.getByRole('radio', { name: 'Note' }),
			title,
			screen.getByRole('textbox', { name: 'Details' }),
			screen.getByRole('button', { name: 'Tomorrow' }),
			screen.getByRole('button', { name: 'Choose a due date' })
		];
		// happy-dom does not propagate a disabled fieldset to its controls, a browser does.
		const lockedByFieldset = () => locked().map((control) => control.closest('fieldset')?.disabled);
		await waitFor(() => expect(lockedByFieldset()).toEqual(Array(5).fill(true)));
		expect(onclose).not.toHaveBeenCalled();

		reply(new Response(JSON.stringify({ message: 'Not allowed for this Group' }), { status: 403 }));
		await screen.findByText('Not allowed for this Group');
		expect(lockedByFieldset()).toEqual(Array(5).fill(false));
		expect((title as HTMLInputElement).value).toBe('Call about leave');
		await waitFor(() => expect(document.activeElement).toBe(title));
	});

	it('shows the first open follow-up and how many more, a skeleton while pending, and nothing when withheld or none', async () => {
		const open = readyRow({
			kind: 'known',
			value: { count: 3, first: { id: 'f1', title: 'Turn in TA-50 shortage list', dueDate: '2026-10-05' } }
		});
		const withOpen = makeCtx(open);
		mount(withOpen.ctx);
		await screen.findByText('Turn in TA-50 shortage list · due Mon 5 Oct');
		expect(screen.getByText('· overdue')).toBeTruthy();
		expect(screen.getByText('· +2 more')).toBeTruthy();
		cleanup();

		mount(makeCtx({ kind: 'pending' }).ctx);
		await screen.findByText('Already open');
		expect(document.querySelector('[data-slot="skeleton"]')).not.toBeNull();
		cleanup();

		for (const row of [NONE_OPEN, readyRow({ kind: 'withheld' }), { kind: 'failed' } as SignalRow]) {
			mount(makeCtx(row).ctx);
			await screen.findByRole('textbox', { name: 'Follow-up title' });
			expect(screen.queryByText('Already open')).toBeNull();
			cleanup();
		}
	});

	it('offers no Log link to a viewer who cannot open the record', async () => {
		const { ctx } = makeCtx(NONE_OPEN, false);
		const { onclose } = mount(ctx);

		await fireEvent.input(await screen.findByRole('textbox', { name: 'Follow-up title' }), {
			target: { value: 'Call about leave' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Add follow-up' }));

		await waitFor(() => expect(onclose).toHaveBeenCalledOnce());
		expect(toastSuccessMock.mock.calls[0][1].action).toBeUndefined();
	});
});
