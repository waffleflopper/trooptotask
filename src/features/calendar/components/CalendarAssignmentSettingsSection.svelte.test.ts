// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { AssignmentType } from '$features/calendar/contracts';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { endOrganizationLifetime } from '$lib/stores/core';
import { toastStore } from '$lib/stores/toast.svelte';
import CalendarAssignmentSettingsSection from './CalendarAssignmentSettingsSection.svelte';
import CalendarSettingsPage from './CalendarSettingsPage.svelte';

const chargeOfQuarters: AssignmentType = {
	id: 'cq',
	name: 'Charge of Quarters',
	shortName: 'CQ',
	assignTo: 'personnel',
	color: '#2563eb',
	exemptPersonnelIds: [],
	showInDateHeader: true
};

const staffDuty: AssignmentType = {
	id: 'sd',
	name: 'Staff Duty',
	shortName: 'SD',
	assignTo: 'personnel',
	color: '#047857',
	exemptPersonnelIds: [],
	showInDateHeader: false
};

type Answer = () => Response | Promise<Response>;

function stubAssignmentTypeServer() {
	const persisted = new Map([chargeOfQuarters, staffDuty].map((type) => [type.id, { ...type }]));
	const commands: string[] = [];
	const held: Array<() => void> = [];
	const server = {
		commands,
		answerHeader: null as Answer | null,
		answerRead: null as Answer | null,
		answerWrite: null as Answer | null,
		holdNext: false,
		release: () => held.splice(0).forEach((resume) => resume()),
		headerFlags: () => Object.fromEntries([...persisted.values()].map((type) => [type.id, type.showInDateHeader])),
		persisted
	};
	const hold = async () => {
		if (!server.holdNext) return;
		server.holdNext = false;
		await new Promise<void>((resume) => held.push(resume));
	};
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init?: RequestInit) => {
			const method = init?.method ?? 'GET';
			commands.push(`${method} ${url}`);
			await hold();
			if (url.endsWith('/date-header')) {
				if (server.answerHeader) return server.answerHeader();
				const { assignmentTypeId } = JSON.parse(String(init!.body)) as { assignmentTypeId: string };
				for (const type of persisted.values()) type.showInDateHeader = type.id === assignmentTypeId;
				return Response.json({ success: true });
			}
			if (method === 'GET') return server.answerRead ? server.answerRead() : Response.json([...persisted.values()]);
			if (method === 'POST') {
				const created = { ...(JSON.parse(String(init!.body)) as AssignmentType), id: 'added' };
				persisted.set(created.id, created);
				return Response.json(created, { status: 201 });
			}
			if (server.answerWrite) return server.answerWrite();
			const { id, ...data } = JSON.parse(String(init!.body)) as Partial<AssignmentType> & { id: string };
			if (method === 'DELETE') {
				persisted.delete(id);
				return Response.json({ success: true });
			}
			const updated = { ...persisted.get(id)!, ...data };
			persisted.set(id, updated);
			return Response.json(updated);
		})
	);
	return server;
}

function currentlyShowing() {
	return screen
		.getByText(/Currently showing|None selected/)
		.textContent?.replace(/\s+/g, ' ')
		.trim();
}

function radio(name: string) {
	return screen.getByRole('radio', { name: `Show ${name} in date header` });
}

function isChecked(control: HTMLElement): boolean {
	return control.getAttribute('aria-checked') === 'true';
}

describe('CalendarAssignmentSettingsSection date header', () => {
	beforeEach(() => {
		dailyAssignmentsStore.load([chargeOfQuarters, staffDuty], [], 'org-1');
	});

	afterEach(() => {
		cleanup();
		dailyAssignmentsStore.load([], [], 'org-cleanup');
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('saves a choice in one command, showing it as pending until the server confirms', async () => {
		const server = stubAssignmentTypeServer();
		server.holdNext = true;
		const errorToast = vi.spyOn(toastStore, 'error');
		render(CalendarAssignmentSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await fireEvent.click(radio('Staff Duty'));

		await waitFor(() => expect(isChecked(radio('Staff Duty'))).toBe(true));
		expect(currentlyShowing()).toContain('Currently showing: Charge of Quarters');
		server.release();
		await waitFor(() => expect(currentlyShowing()).toContain('Currently showing: Staff Duty'));
		expect(server.commands).toEqual(['PUT /org/org-1/api/assignment-types/date-header']);
		expect(server.headerFlags()).toEqual({ cq: false, sd: true });
		expect(isChecked(radio('Charge of Quarters'))).toBe(false);
		expect(errorToast).not.toHaveBeenCalled();
	});

	it('shows one message for a choice that was not saved and the list from one fresh read', async () => {
		const server = stubAssignmentTypeServer();
		server.answerHeader = () =>
			Response.json({ message: 'That assignment type is no longer available.' }, { status: 404 });
		server.persisted.delete('sd');
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		render(CalendarAssignmentSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await fireEvent.click(radio('Staff Duty'));

		await waitFor(() => expect(errorToast).toHaveBeenCalledWith('That assignment type is no longer available.'));
		expect(errorToast).toHaveBeenCalledOnce();
		await waitFor(() => expect(screen.queryByRole('radio', { name: 'Show Staff Duty in date header' })).toBeNull());
		expect(isChecked(radio('Charge of Quarters'))).toBe(true);
		expect(server.commands).toEqual([
			'PUT /org/org-1/api/assignment-types/date-header',
			'GET /org/org-1/api/assignment-types'
		]);
	});

	it('shows one message with the server reason when an edit is refused, keeping the dialog open', async () => {
		const server = stubAssignmentTypeServer();
		server.answerWrite = () => Response.json({ message: 'Name must be 100 characters or fewer' }, { status: 400 });
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		render(CalendarAssignmentSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await fireEvent.click(screen.getByRole('button', { name: 'Edit Staff Duty' }));
		await fireEvent.input(screen.getByLabelText('Full name'), { target: { value: 'Staff Duty Officer' } });
		const save = screen.getByRole('button', { name: 'Save Changes' }) as HTMLButtonElement;
		await fireEvent.click(save);

		await waitFor(() => expect(errorToast).toHaveBeenCalled());
		await waitFor(() => expect(save.disabled).toBe(false));
		expect(errorToast).toHaveBeenCalledExactlyOnceWith('Name must be 100 characters or fewer');
		expect(screen.getByRole('heading', { name: 'Edit Assignment Type' })).toBeTruthy();
		expect(server.persisted.get('sd')!.name).toBe('Staff Duty');
	});

	it('shows one message when a delete fails and keeps the type', async () => {
		const server = stubAssignmentTypeServer();
		server.answerWrite = () => Response.json({ message: 'Internal server error' }, { status: 500 });
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		render(CalendarAssignmentSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await fireEvent.click(screen.getByRole('button', { name: 'Delete Staff Duty' }));
		const confirm = screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement;
		await fireEvent.click(confirm);

		await waitFor(() => expect(confirm.disabled).toBe(false));
		expect(errorToast).toHaveBeenCalledExactlyOnceWith('Failed to delete assignment type');
		expect(radio('Staff Duty')).toBeTruthy();
	});

	it('names the stored header after an unconfirmed choice', async () => {
		const server = stubAssignmentTypeServer();
		server.answerHeader = () => {
			for (const type of server.persisted.values()) type.showInDateHeader = type.id === 'sd';
			return Response.json({ message: "We couldn't confirm this Calendar change." }, { status: 503 });
		};
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		render(CalendarAssignmentSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await fireEvent.click(radio('Staff Duty'));

		await waitFor(() =>
			expect(errorToast).toHaveBeenCalledWith(
				"We couldn't confirm the date header change. The saved header is Staff Duty."
			)
		);
		expect(errorToast).toHaveBeenCalledOnce();
		expect(currentlyShowing()).toContain('Currently showing: Staff Duty');
		expect(isChecked(radio('Staff Duty'))).toBe(true);
	});

	it('shows one fallback message and the fresh list when a not-saved reply body cannot be read', async () => {
		const server = stubAssignmentTypeServer();
		server.answerHeader = () =>
			({
				ok: false,
				status: 409,
				text: () => Promise.reject(new TypeError('error body interrupted'))
			}) as unknown as Response;
		server.persisted.get('cq')!.name = 'CQ Renamed';
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		render(CalendarAssignmentSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await fireEvent.click(radio('Staff Duty'));

		await waitFor(() => expect(errorToast).toHaveBeenCalledWith('Failed to update the date header'));
		expect(errorToast).toHaveBeenCalledOnce();
		await waitFor(() => expect(currentlyShowing()).toContain('Currently showing: CQ Renamed'));
		expect(isChecked(radio('CQ Renamed'))).toBe(true);
		expect(server.commands).toEqual([
			'PUT /org/org-1/api/assignment-types/date-header',
			'GET /org/org-1/api/assignment-types'
		]);
	});

	it('says the header is unknown when the fresh read after an unconfirmed choice fails', async () => {
		const server = stubAssignmentTypeServer();
		server.answerHeader = () => Promise.reject(new TypeError('Failed to fetch'));
		server.answerRead = () => Response.json({ message: 'Internal server error' }, { status: 500 });
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		render(CalendarAssignmentSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await fireEvent.click(radio('Staff Duty'));

		await waitFor(() =>
			expect(errorToast).toHaveBeenCalledWith(
				"We couldn't confirm the date header change. Reload to see the saved header."
			)
		);
		expect(currentlyShowing()).toContain('Currently showing: Charge of Quarters');
		expect(isChecked(radio('Charge of Quarters'))).toBe(true);
	});

	it('ignores another header choice and type writes until the pending choice finishes', async () => {
		const server = stubAssignmentTypeServer();
		server.holdNext = true;
		render(CalendarAssignmentSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await fireEvent.click(radio('Staff Duty'));
		await fireEvent.click(radio('Charge of Quarters'));

		expect(screen.getByRole('button', { name: 'Edit Staff Duty' })).toHaveProperty('disabled', true);
		expect(screen.getByRole('button', { name: 'Delete Charge of Quarters' })).toHaveProperty('disabled', true);
		server.release();
		await waitFor(() => expect(currentlyShowing()).toContain('Currently showing: Staff Duty'));
		expect(server.commands).toEqual(['PUT /org/org-1/api/assignment-types/date-header']);
		expect(server.headerFlags()).toEqual({ cq: false, sd: true });
		expect(screen.getByRole('button', { name: 'Edit Staff Duty' })).toHaveProperty('disabled', false);
	});

	it.each([
		[
			'an add',
			() =>
				dailyAssignmentsStore.addType({
					name: 'Night Watch',
					shortName: 'NW',
					assignTo: 'personnel',
					color: '#000000',
					exemptPersonnelIds: [],
					showInDateHeader: false
				})
		],
		['an edit', () => dailyAssignmentsStore.updateType('cq', { name: 'Charge of Quarters Night' })],
		['a delete', () => dailyAssignmentsStore.removeType('cq')]
	])('holds header choices while %s of a type is still saving', async (_label, write) => {
		const server = stubAssignmentTypeServer();
		server.holdNext = true;
		render(CalendarAssignmentSettingsSection, { props: { canMutate: true, searchQuery: '' } });
		const pending = write();

		await fireEvent.click(radio('Staff Duty'));
		const disabledWhileSaving = screen.getByRole('radiogroup').hasAttribute('data-disabled');
		server.release();
		await pending;

		expect(server.commands.filter((command) => command.endsWith('/date-header'))).toEqual([]);
		expect(server.headerFlags().sd).toBe(false);
		expect(isChecked(radio('Staff Duty'))).toBe(false);
		expect(disabledWhileSaving).toBe(true);
		await waitFor(() => expect(screen.getByRole('radiogroup').hasAttribute('data-disabled')).toBe(false));
	});

	it('reads again and shows a choice committed after a same-Organization reload as saved', async () => {
		const server = stubAssignmentTypeServer();
		server.holdNext = true;
		const errorToast = vi.spyOn(toastStore, 'error');
		render(CalendarAssignmentSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await fireEvent.click(radio('Staff Duty'));
		server.persisted.get('cq')!.name = 'CQ Renamed';
		dailyAssignmentsStore.load([{ ...chargeOfQuarters, name: 'CQ Renamed' }, staffDuty], [], 'org-1');
		server.release();

		await waitFor(() => expect(currentlyShowing()).toContain('Currently showing: Staff Duty'));
		expect(isChecked(radio('CQ Renamed'))).toBe(false);
		expect(server.commands).toEqual([
			'PUT /org/org-1/api/assignment-types/date-header',
			'GET /org/org-1/api/assignment-types'
		]);
		expect(errorToast).not.toHaveBeenCalled();
	});

	it('keeps a newer saved header loaded while a committed reply was held', async () => {
		const server = stubAssignmentTypeServer();
		let releaseReply: (() => void) | undefined;
		server.answerHeader = async () => {
			for (const type of server.persisted.values()) type.showInDateHeader = type.id === 'sd';
			await new Promise<void>((resolve) => (releaseReply = resolve));
			return Response.json({ success: true });
		};
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		render(CalendarAssignmentSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await fireEvent.click(radio('Staff Duty'));
		await waitFor(() => expect(releaseReply).toBeDefined());
		for (const type of server.persisted.values()) type.showInDateHeader = type.id === 'cq';
		dailyAssignmentsStore.load(structuredClone([...server.persisted.values()]), [], 'org-1');
		releaseReply!();

		await waitFor(() =>
			expect(errorToast).toHaveBeenCalledWith(
				"We couldn't confirm the date header change. The saved header is Charge of Quarters."
			)
		);
		expect(errorToast).toHaveBeenCalledOnce();
		expect(currentlyShowing()).toContain('Currently showing: Charge of Quarters');
		expect(isChecked(radio('Charge of Quarters'))).toBe(true);
		expect(server.commands).toEqual([
			'PUT /org/org-1/api/assignment-types/date-header',
			'GET /org/org-1/api/assignment-types'
		]);
	});

	const retiring: AssignmentType = { ...staffDuty, id: 'rt', name: 'Retiring Duty', shortName: 'RT' };

	it('names only the header its fresh read found, whenever a newer load lands', async () => {
		const readCatalog = [
			{ ...chargeOfQuarters, showInDateHeader: false },
			staffDuty,
			{ ...retiring, showInDateHeader: true }
		];
		const newerLoad = [
			{ ...chargeOfQuarters, showInDateHeader: false },
			{ ...staffDuty, showInDateHeader: true },
			retiring
		];
		const messages = new Set<string>();
		for (let hops = 0; hops <= 24; hops++) {
			const server = stubAssignmentTypeServer();
			server.answerHeader = () => Response.json({ message: 'unconfirmed' }, { status: 503 });
			server.answerRead = () => {
				server.answerRead = null;
				let remaining = hops;
				const step = () =>
					remaining-- === 0
						? dailyAssignmentsStore.load(structuredClone(newerLoad), [], 'org-1')
						: queueMicrotask(step);
				queueMicrotask(step);
				return { ok: true, status: 200, json: () => Promise.resolve(structuredClone(readCatalog)) } as Response;
			};
			const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
			endOrganizationLifetime();
			dailyAssignmentsStore.load([chargeOfQuarters, staffDuty, retiring], [], 'org-1');
			render(CalendarAssignmentSettingsSection, { props: { canMutate: true, searchQuery: '' } });

			await fireEvent.click(radio('Staff Duty'));
			await waitFor(() => expect(errorToast).toHaveBeenCalledOnce());
			messages.add(String(errorToast.mock.calls[0][0]));
			cleanup();
			vi.restoreAllMocks();
		}

		expect([...messages].sort()).toEqual(
			[
				"We couldn't confirm the date header change. Reload to see the saved header.",
				"We couldn't confirm the date header change. The saved header is Retiring Duty."
			].sort()
		);
	});

	function holdStaffDutyReply(server: ReturnType<typeof stubAssignmentTypeServer>, reply: () => Response) {
		server.persisted.set(retiring.id, { ...retiring });
		dailyAssignmentsStore.load([chargeOfQuarters, staffDuty, retiring], [], 'org-1');
		const held: { release?: () => void } = {};
		server.answerHeader = async () => {
			const answer = reply();
			await new Promise<void>((resolve) => (held.release = resolve));
			return answer;
		};
		return held;
	}

	function saveHeader(server: ReturnType<typeof stubAssignmentTypeServer>, id: string | null) {
		for (const type of server.persisted.values()) type.showInDateHeader = type.id === id;
	}

	it('keeps a held choice pending across a Settings tab switch and refuses another until it settles', async () => {
		const server = stubAssignmentTypeServer();
		const held = holdStaffDutyReply(server, () => {
			saveHeader(server, 'sd');
			return Response.json({ success: true });
		});
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		render(CalendarSettingsPage, {
			props: {
				org: { orgUrlSegment: 'org-1', affordanceForFeatureAction: () => ({ allowed: true, visible: true }) }
			}
		});
		await fireEvent.click(screen.getByRole('tab', { name: /Assignment Types/ }));

		await fireEvent.click(radio('Staff Duty'));
		await waitFor(() => expect(held.release).toBeDefined());
		await fireEvent.click(screen.getByRole('tab', { name: /Status Types/ }));
		expect(screen.queryByRole('radio', { name: 'Show Staff Duty in date header' })).toBeNull();
		await fireEvent.click(screen.getByRole('tab', { name: /Assignment Types/ }));

		expect(isChecked(radio('Staff Duty'))).toBe(true);
		expect(currentlyShowing()).toContain('Currently showing: Charge of Quarters');
		expect(screen.getByRole('radiogroup').hasAttribute('data-disabled')).toBe(true);
		expect(screen.getByRole('button', { name: 'Edit Retiring Duty' })).toHaveProperty('disabled', true);
		expect(screen.getByRole('button', { name: 'Delete Charge of Quarters' })).toHaveProperty('disabled', true);
		await fireEvent.click(radio('Retiring Duty'));
		held.release!();

		await waitFor(() => expect(currentlyShowing()).toContain('Currently showing: Staff Duty'));
		expect(server.headerFlags()).toEqual({ cq: false, sd: true, rt: false });
		expect(isChecked(radio('Staff Duty'))).toBe(true);
		expect(server.commands).toEqual(['PUT /org/org-1/api/assignment-types/date-header']);

		server.answerHeader = null;
		await waitFor(() => expect(screen.getByRole('radiogroup').hasAttribute('data-disabled')).toBe(false));
		await fireEvent.click(radio('Retiring Duty'));

		await waitFor(() => expect(currentlyShowing()).toContain('Currently showing: Retiring Duty'));
		expect(server.headerFlags()).toEqual({ cq: false, sd: false, rt: true });
		expect(screen.getByRole('button', { name: 'Edit Retiring Duty' })).toHaveProperty('disabled', false);
		expect(errorToast).not.toHaveBeenCalled();
	});

	it.each([
		{
			outcome: 'a newer saved header',
			newerHeader: 'rt',
			status: 200,
			readFails: false,
			toast: "We couldn't confirm the date header change. The saved header is Retiring Duty.",
			shown: 'Currently showing: Retiring Duty'
		},
		{
			outcome: 'no saved header',
			newerHeader: null,
			status: 200,
			readFails: false,
			toast: "We couldn't confirm the date header change. No date header is saved.",
			shown: 'None selected'
		},
		{
			outcome: 'a saved header it could not read',
			newerHeader: 'rt',
			status: 200,
			readFails: true,
			toast: "We couldn't confirm the date header change. Reload to see the saved header.",
			shown: 'Currently showing: Retiring Duty'
		},
		{
			outcome: 'a refused choice',
			newerHeader: 'rt',
			status: 403,
			readFails: false,
			toast: "You don't have permission to change the date header.",
			shown: 'Currently showing: Retiring Duty'
		}
	])(
		'reports $outcome from current data when the choosing view closed before its held reply',
		async ({ newerHeader, status, readFails, toast, shown }) => {
			const server = stubAssignmentTypeServer();
			const held = holdStaffDutyReply(server, () => {
				if (status !== 200)
					return Response.json({ message: "You don't have permission to change the date header." }, { status });
				saveHeader(server, 'sd');
				return Response.json({ success: true });
			});
			const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
			const choosingView = render(CalendarAssignmentSettingsSection, { props: { canMutate: true, searchQuery: '' } });

			await fireEvent.click(radio('Staff Duty'));
			await waitFor(() => expect(held.release).toBeDefined());
			saveHeader(server, newerHeader);
			choosingView.unmount();
			dailyAssignmentsStore.load(structuredClone([...server.persisted.values()]), [], 'org-1');
			render(CalendarAssignmentSettingsSection, { props: { canMutate: true, searchQuery: '' } });
			if (readFails) server.answerRead = () => Response.json({ message: 'Internal server error' }, { status: 500 });
			held.release!();

			await waitFor(() => expect(errorToast).toHaveBeenCalledOnce());
			expect(errorToast).toHaveBeenCalledWith(toast);
			expect(currentlyShowing()).toContain(shown);
			expect(server.headerFlags()).toEqual({ cq: false, sd: false, rt: newerHeader === 'rt' });
			expect(server.commands).toEqual([
				'PUT /org/org-1/api/assignment-types/date-header',
				'GET /org/org-1/api/assignment-types'
			]);
		}
	);

	it('reports nothing when the Organization changed before a closed view received its held reply', async () => {
		const server = stubAssignmentTypeServer();
		const held = holdStaffDutyReply(server, () => {
			saveHeader(server, 'sd');
			return Response.json({ success: true });
		});
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		const choosingView = render(CalendarAssignmentSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await fireEvent.click(radio('Staff Duty'));
		await waitFor(() => expect(held.release).toBeDefined());
		choosingView.unmount();
		endOrganizationLifetime();
		dailyAssignmentsStore.load(
			[{ ...retiring, id: 'b-rt', name: 'Other Unit Duty', showInDateHeader: true }],
			[],
			'org-2'
		);
		render(CalendarAssignmentSettingsSection, { props: { canMutate: true, searchQuery: '' } });
		held.release!();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(currentlyShowing()).toContain('Currently showing: Other Unit Duty');
		expect(server.headerFlags()).toEqual({ cq: false, sd: true, rt: false });
		expect(server.commands).toEqual(['PUT /org/org-1/api/assignment-types/date-header']);
		expect(errorToast).not.toHaveBeenCalled();
	});
});
