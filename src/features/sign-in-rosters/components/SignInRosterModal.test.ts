// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSave, mockText, mockJsPDF, mockAutoTable } = vi.hoisted(() => {
	const mockSave = vi.fn();
	const mockText = vi.fn();
	const mockSetFontSize = vi.fn();
	const mockJsPDF = vi.fn(function (this: Record<string, unknown>) {
		this.internal = { pageSize: { getWidth: () => 612 } };
		this.save = mockSave;
		this.text = mockText;
		this.setFontSize = mockSetFontSize;
	});
	const mockAutoTable = vi.fn();

	return {
		mockSave,
		mockText,
		mockJsPDF,
		mockAutoTable
	};
});

vi.mock('jspdf', () => ({
	jsPDF: mockJsPDF
}));

vi.mock('jspdf-autotable', () => ({
	default: mockAutoTable
}));

import SignInRosterModal from './SignInRosterModal.svelte';
import type { Personnel } from '$lib/types';
import type { SignInRoster } from '../sign-in-rosters.types';

const personnel: Personnel[] = [
	{
		id: 'person-1',
		rank: 'SGT',
		lastName: 'Smith',
		firstName: 'Alex',
		mos: '11B',
		clinicRole: '',
		groupId: 'group-1',
		groupName: 'Alpha'
	}
];

const groups = [{ id: 'group-1', name: 'Alpha' }];

function makeRoster(overrides: Partial<SignInRoster> = {}): SignInRoster {
	return {
		id: 'roster-1',
		title: 'Morning Formation',
		rosterDate: '2026-03-28',
		blankDate: false,
		separateByGroup: false,
		sortBy: 'alphabetical',
		personnelSnapshot: [
			{
				id: 'person-1',
				rank: 'SGT',
				lastName: 'Smith',
				firstName: 'Alex',
				group: 'Alpha'
			}
		],
		filterConfig: { groups: [], ranks: ['SGT'] },
		signedFilePath: null,
		createdBy: 'user-1',
		createdAt: '2026-03-28T12:00:00.000Z',
		...overrides
	};
}

function jsonResponse(data: unknown, ok = true): Response {
	return {
		ok,
		json: vi.fn().mockResolvedValue(data)
	} as unknown as Response;
}

function renderModal(
	overrides: {
		personnel?: Personnel[];
		groups?: { id: string; name: string }[];
		canEdit?: boolean;
	} = {}
) {
	return render(SignInRosterModal, {
		props: {
			orgId: 'org-1',
			personnel: overrides.personnel ?? personnel,
			groups: overrides.groups ?? groups,
			canEdit: overrides.canEdit ?? true,
			onClose: vi.fn()
		}
	});
}

describe('SignInRosterModal', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('generates a PDF and persists the roster when creating a new sign-in roster', async () => {
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			if ((init?.method ?? 'GET') === 'POST') {
				return jsonResponse({ id: 'roster-2' });
			}

			return jsonResponse({ rosters: [], total: 0 });
		});
		vi.stubGlobal('fetch', fetchMock);

		renderModal();

		await waitFor(() => expect(screen.getByRole('button', { name: 'New Roster' })).toBeTruthy());

		await fireEvent.click(screen.getByRole('button', { name: 'New Roster' }));
		await fireEvent.input(screen.getByLabelText(/Title/i), {
			target: { value: 'Annual AT Sign-In' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Generate & Print' }));

		await waitFor(() => expect(mockJsPDF).toHaveBeenCalledTimes(1));

		expect(mockJsPDF).toHaveBeenCalledWith(
			expect.objectContaining({ orientation: 'portrait', unit: 'pt', format: 'letter' })
		);
		expect(mockAutoTable).toHaveBeenCalledTimes(1);
		expect(mockText).toHaveBeenCalledWith('Annual AT Sign-In', expect.any(Number), 50, { align: 'center' });
		expect(mockSave).toHaveBeenCalledWith('Annual-AT-SignIn-sign-in-roster.pdf');

		const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
		expect(postCall).toBeTruthy();
		expect(postCall?.[0]).toBe('/org/org-1/api/sign-in-rosters');
		expect(postCall?.[1]).toEqual(
			expect.objectContaining({
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			})
		);

		const body = JSON.parse(String(postCall?.[1]?.body));
		expect(body).toEqual(
			expect.objectContaining({
				title: 'Annual AT Sign-In',
				blankDate: false,
				separateByGroup: false,
				sortBy: 'alphabetical'
			})
		);
		expect(body.personnelSnapshot).toHaveLength(1);
		expect(body.filterConfig).toEqual(expect.objectContaining({ groups: [], ranks: expect.arrayContaining(['SGT']) }));
	});

	it('persists rank and group filters in the generated roster payload', async () => {
		const filteredPersonnel: Personnel[] = [
			...personnel,
			{
				id: 'person-2',
				rank: 'CPT',
				lastName: 'Baker',
				firstName: 'Jordan',
				mos: '70B',
				clinicRole: '',
				groupId: 'group-2',
				groupName: 'Bravo'
			}
		];
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			if ((init?.method ?? 'GET') === 'POST') {
				return jsonResponse({ id: 'roster-2' });
			}

			return jsonResponse({ rosters: [], total: 0 });
		});
		vi.stubGlobal('fetch', fetchMock);

		renderModal({
			personnel: filteredPersonnel,
			groups: [...groups, { id: 'group-2', name: 'Bravo' }]
		});

		await waitFor(() => expect(screen.getByRole('button', { name: 'New Roster' })).toBeTruthy());

		await fireEvent.click(screen.getByRole('button', { name: 'New Roster' }));
		await fireEvent.input(screen.getByLabelText(/Title/i), {
			target: { value: 'Officer Call' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'All Enlisted' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Bravo' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Generate & Print' }));

		await waitFor(() => expect(mockJsPDF).toHaveBeenCalledTimes(1));

		const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
		const body = JSON.parse(String(postCall?.[1]?.body));

		expect(body.personnelSnapshot).toEqual([
			expect.objectContaining({
				id: 'person-2',
				rank: 'CPT',
				lastName: 'Baker',
				group: 'Bravo'
			})
		]);
		expect(body.filterConfig.groups).toEqual(['Bravo']);
		expect(body.filterConfig.ranks).toContain('CPT');
		expect(body.filterConfig.ranks).not.toContain('SGT');
	});

	it('re-prints an existing roster through the async PDF path without creating a new roster', async () => {
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
			jsonResponse({ rosters: [makeRoster()], total: 1 })
		);
		vi.stubGlobal('fetch', fetchMock);

		renderModal();

		await waitFor(() => expect(screen.getByRole('button', { name: /Morning Formation/i })).toBeTruthy());

		await fireEvent.click(screen.getByRole('button', { name: /Morning Formation/i }));
		await fireEvent.click(screen.getByRole('button', { name: /Re-print/i }));

		await waitFor(() => expect(mockJsPDF).toHaveBeenCalledTimes(1));

		expect(mockAutoTable).toHaveBeenCalledTimes(1);
		expect(mockText).toHaveBeenCalledWith('Morning Formation', expect.any(Number), 50, { align: 'center' });
		expect(mockSave).toHaveBeenCalledWith('Morning-Formation-sign-in-roster.pdf');
		const postCalls = fetchMock.mock.calls.filter((call) => {
			const init = call[1] as RequestInit | undefined;
			return init?.method === 'POST';
		});
		expect(postCalls).toHaveLength(0);
	});
});
