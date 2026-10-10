// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { AssignmentType } from '$features/calendar/contracts';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import CalendarAssignmentSettingsSection from './CalendarAssignmentSettingsSection.svelte';

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

function stubAssignmentTypeServer(failingPutNumbers: number[]) {
	const persisted = new Map([chargeOfQuarters, staffDuty].map((type) => [type.id, { ...type }]));
	const puts: string[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url: string, init: RequestInit) => {
			const { id, ...data } = JSON.parse(String(init.body)) as Partial<AssignmentType> & { id: string };
			puts.push(`${id}:${data.showInDateHeader}`);
			if (failingPutNumbers.includes(puts.length)) {
				return new Response(JSON.stringify({ message: 'Synthetic failure' }), { status: 503 });
			}
			const updated = { ...persisted.get(id)!, ...data };
			persisted.set(id, updated);
			return new Response(JSON.stringify(updated), { status: 200 });
		})
	);
	return {
		puts,
		headerFlags: () => Object.fromEntries([...persisted.values()].map((type) => [type.id, type.showInDateHeader]))
	};
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
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('moves the header to the chosen type, setting it before clearing the previous one', async () => {
		const server = stubAssignmentTypeServer([]);
		render(CalendarAssignmentSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await fireEvent.click(radio('Staff Duty'));

		await waitFor(() => expect(server.puts).toEqual(['sd:true', 'cq:false']));
		expect(server.headerFlags()).toEqual({ cq: false, sd: true });
		await waitFor(() => expect(isChecked(radio('Staff Duty'))).toBe(true));
		expect(isChecked(radio('Charge of Quarters'))).toBe(false);
	});

	it('keeps the previous header when setting the chosen type fails', async () => {
		const server = stubAssignmentTypeServer([1]);
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		render(CalendarAssignmentSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await fireEvent.click(radio('Staff Duty'));

		await waitFor(() => expect(errorToast).toHaveBeenCalledWith('Failed to update header assignment type'));
		expect(server.puts).toEqual(['sd:true']);
		expect(server.headerFlags()).toEqual({ cq: true, sd: false });
		expect(isChecked(radio('Charge of Quarters'))).toBe(true);
		expect(isChecked(radio('Staff Duty'))).toBe(false);
	});

	it('restores the previous header when clearing it fails after the chosen type was set', async () => {
		const server = stubAssignmentTypeServer([2]);
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		render(CalendarAssignmentSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await fireEvent.click(radio('Staff Duty'));

		await waitFor(() => expect(errorToast).toHaveBeenCalledWith('Failed to update header assignment type'));
		await waitFor(() => expect(server.puts).toEqual(['sd:true', 'cq:false', 'sd:false']));
		expect(server.headerFlags()).toEqual({ cq: true, sd: false });
		expect(isChecked(radio('Charge of Quarters'))).toBe(true);
		expect(isChecked(radio('Staff Duty'))).toBe(false);
	});
});
