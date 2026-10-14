// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockJsPDF, mockAutoTable } = vi.hoisted(() => {
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
import type { RankCatalogEntry } from '$features/personnel/contracts';
import type { Personnel } from '$features/personnel/contracts';
import type { SignInRoster } from '../sign-in-rosters.types';
import { toastStore } from '$lib/stores/toast.svelte';

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
const SAVED_SCAN = 'org-1/sign-in-rosters/roster-1/signed-roster.pdf';

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

function jsonResponse(data: unknown, ok = true, status = ok ? 200 : 500): Response {
	return {
		ok,
		status,
		json: vi.fn().mockResolvedValue(data)
	} as unknown as Response;
}

function renderModal(
	overrides: {
		personnel?: Personnel[];
		groups?: { id: string; name: string }[];
		rankCatalog?: RankCatalogEntry[];
		canEdit?: boolean;
	} = {}
) {
	return render(SignInRosterModal, {
		props: {
			orgId: 'org-1',
			personnel: overrides.personnel ?? personnel,
			groups: overrides.groups ?? groups,
			rankCatalog: overrides.rankCatalog,
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

	it('offers one Close button in the roster list and in the create form', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => jsonResponse({ rosters: [], total: 0 }))
		);
		renderModal();

		await waitFor(() => expect(screen.getByRole('button', { name: 'New Roster' })).toBeTruthy());
		expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1);

		await fireEvent.click(screen.getByRole('button', { name: 'New Roster' }));
		expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1);
		expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
	});

	it('persists the roster when creating a new sign-in roster', async () => {
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

		let postCall: (typeof fetchMock.mock.calls)[number] | undefined;
		await waitFor(() => {
			postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
			expect(postCall).toBeTruthy();
		});
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

	it('locks the new roster draft while its save is held', async () => {
		let resolveCreate!: (response: Response) => void;
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			if ((init?.method ?? 'GET') === 'POST') return new Promise<Response>((resolve) => (resolveCreate = resolve));
			return jsonResponse({ rosters: [], total: 0 });
		});
		vi.stubGlobal('fetch', fetchMock);
		renderModal();
		await waitFor(() => expect(screen.getByRole('button', { name: 'New Roster' })).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: 'New Roster' }));
		await fireEvent.input(screen.getByLabelText(/Title/i), { target: { value: 'Annual AT Sign-In' } });

		await fireEvent.click(screen.getByRole('button', { name: 'Generate & Print' }));

		const dialog = screen.getByRole('dialog', { name: 'New Sign-In Roster' });
		expect(dialog.getAttribute('aria-busy')).toBe('true');
		// happy-dom does not apply a disabled fieldset to its controls' :disabled state.
		expect(screen.getByLabelText(/Title/i).closest('fieldset')?.disabled).toBe(true);
		await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1));
		expect(dialog.getAttribute('aria-busy')).toBe('true');

		resolveCreate(jsonResponse({ id: 'roster-2' }));
		await waitFor(() => expect(dialog.hasAttribute('aria-busy')).toBe(false));
	});

	it('selects the built-in Army and Civilian ranks when the Organization has no rank catalog', async () => {
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
			(init?.method ?? 'GET') === 'POST' ? jsonResponse({ id: 'roster-2' }) : jsonResponse({ rosters: [], total: 0 })
		);
		vi.stubGlobal('fetch', fetchMock);

		renderModal({ personnel: [{ ...personnel[0], rank: 'LOCAL-CADET' }] });

		await waitFor(() => expect(screen.getByRole('button', { name: 'New Roster' })).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: 'New Roster' }));
		await fireEvent.input(screen.getByLabelText(/Title/i), { target: { value: 'Fallback ranks' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Generate & Print' }));

		let postCall: (typeof fetchMock.mock.calls)[number] | undefined;
		await waitFor(() => {
			postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
			expect(postCall).toBeTruthy();
		});
		expect(JSON.parse(String(postCall?.[1]?.body)).filterConfig.ranks).toEqual([
			'PV1',
			'PV2',
			'PFC',
			'SPC',
			'CPL',
			'SGT',
			'SSG',
			'SFC',
			'MSG',
			'1SG',
			'SGM',
			'CSM',
			'WO1',
			'CW2',
			'CW3',
			'CW4',
			'CW5',
			'2LT',
			'1LT',
			'CPT',
			'MAJ',
			'LTC',
			'COL',
			'BG',
			'MG',
			'LTG',
			'GEN',
			'CIV',
			'LOCAL-CADET'
		]);
	});

	it('uses the local calendar date for the default roster date', async () => {
		const originalTimezone = process.env.TZ;
		process.env.TZ = 'America/Anchorage';
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-05-05T02:00:00.000Z'));

		try {
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
				target: { value: 'Local Date Roster' }
			});
			await fireEvent.click(screen.getByRole('button', { name: 'Generate & Print' }));

			let postCall: (typeof fetchMock.mock.calls)[number] | undefined;
			await waitFor(() => {
				postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
				expect(postCall).toBeTruthy();
			});
			const body = JSON.parse(String(postCall?.[1]?.body));
			expect(body.rosterDate).toBe('2026-05-04');

			await fireEvent.click(screen.getByRole('button', { name: 'New Roster' }));
			await fireEvent.input(screen.getByLabelText(/Title/i), {
				target: { value: 'Second Local Date Roster' }
			});
			await fireEvent.click(screen.getByRole('button', { name: 'Generate & Print' }));

			let secondPostCall: (typeof fetchMock.mock.calls)[number] | undefined;
			await waitFor(() => {
				const postCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
				expect(postCalls).toHaveLength(2);
				secondPostCall = postCalls.at(-1);
			});
			const secondBody = JSON.parse(String(secondPostCall?.[1]?.body));
			expect(secondBody.rosterDate).toBe('2026-05-04');
		} finally {
			vi.useRealTimers();
			if (originalTimezone === undefined) {
				delete process.env.TZ;
			} else {
				process.env.TZ = originalTimezone;
			}
		}
	});

	it('shows a list load failure with Retry instead of the empty state and a misleading total, then recovers', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ message: 'Sign-in rosters are unavailable.' }, false))
			.mockResolvedValueOnce(jsonResponse({ rosters: [makeRoster()], total: 1 }));
		vi.stubGlobal('fetch', fetchMock);

		renderModal();

		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toContain('Sign-in rosters are unavailable.');
		expect(screen.queryByText('No sign-in rosters yet.')).toBeNull();
		expect(screen.queryByText(/\d+ total/)).toBeNull();
		expect(screen.getAllByRole('button', { name: 'New Roster' })).toHaveLength(1);

		await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

		await waitFor(() => expect(screen.getByText('Morning Formation')).toBeTruthy());
		expect(screen.queryByRole('alert')).toBeNull();
		expect(screen.getByText('1 total')).toBeTruthy();
		expect(fetchMock).toHaveBeenCalledTimes(2);
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

		let postCall: (typeof fetchMock.mock.calls)[number] | undefined;
		await waitFor(() => {
			postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
			expect(postCall).toBeTruthy();
		});
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

	it('builds rank-sorted roster payloads from the shared rank catalog including joint and unknown ranks', async () => {
		const jointPersonnel: Personnel[] = [
			personnelRow({ id: 'unknown', rank: 'LOCAL-CADET', lastName: 'Able' }),
			personnelRow({ id: 'navy-e5', rank: 'PO2', lastName: 'Baker' }),
			personnelRow({ id: 'army-e5', rank: 'SGT', lastName: 'Able' }),
			personnelRow({ id: 'air-force-e5', rank: 'SSgt', lastName: 'Charlie' })
		];
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			if ((init?.method ?? 'GET') === 'POST') {
				return jsonResponse({ id: 'roster-2' });
			}

			return jsonResponse({ rosters: [], total: 0 });
		});
		vi.stubGlobal('fetch', fetchMock);

		renderModal({
			personnel: jointPersonnel,
			rankCatalog: [
				rankCatalogEntry({ code: 'PO2', label: 'Petty Officer Second Class', service: 'navy' }),
				rankCatalogEntry({ code: 'SGT', label: 'Sergeant', service: 'army' }),
				rankCatalogEntry({ code: 'SSgt', label: 'Staff Sergeant', service: 'air-force' })
			]
		});

		await waitFor(() => expect(screen.getByRole('button', { name: 'New Roster' })).toBeTruthy());

		await fireEvent.click(screen.getByRole('button', { name: 'New Roster' }));
		await fireEvent.input(screen.getByLabelText(/Title/i), {
			target: { value: 'Joint Formation' }
		});
		await fireEvent.click(screen.getByLabelText('By rank'));
		await fireEvent.click(screen.getByRole('button', { name: 'Generate & Print' }));

		let postCall: (typeof fetchMock.mock.calls)[number] | undefined;
		await waitFor(() => {
			postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
			expect(postCall).toBeTruthy();
		});
		const body = JSON.parse(String(postCall?.[1]?.body));

		expect(body.personnelSnapshot.map((row: { id: string }) => row.id)).toEqual([
			'navy-e5',
			'army-e5',
			'air-force-e5',
			'unknown'
		]);
		expect(body.filterConfig.ranks).toEqual(expect.arrayContaining(['PO2', 'SSgt', 'LOCAL-CADET']));
	});

	it('keeps default rank filters selected when a streamed rank catalog expands after create view opens', async () => {
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			if ((init?.method ?? 'GET') === 'POST') {
				return jsonResponse({ id: 'roster-2' });
			}

			return jsonResponse({ rosters: [], total: 0 });
		});
		vi.stubGlobal('fetch', fetchMock);
		const view = renderModal({
			personnel: [personnelRow({ id: 'army-e5', rank: 'SGT', lastName: 'Able' })]
		});

		await waitFor(() => expect(screen.getByRole('button', { name: 'New Roster' })).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: 'New Roster' }));
		await view.rerender({
			orgId: 'org-1',
			personnel: [
				personnelRow({ id: 'army-e5', rank: 'SGT', lastName: 'Able' }),
				personnelRow({ id: 'navy-e5', rank: 'PO2', lastName: 'Baker' })
			],
			groups,
			rankCatalog: [
				rankCatalogEntry({ code: 'PO2', label: 'Petty Officer Second Class', service: 'navy' }),
				rankCatalogEntry({ code: 'SGT', label: 'Sergeant', service: 'army' })
			],
			canEdit: true,
			onClose: vi.fn()
		});

		await fireEvent.input(screen.getByLabelText(/Title/i), {
			target: { value: 'Streamed Catalog Formation' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Generate & Print' }));

		let postCall: (typeof fetchMock.mock.calls)[number] | undefined;
		await waitFor(() => {
			postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
			expect(postCall).toBeTruthy();
		});
		const body = JSON.parse(String(postCall?.[1]?.body));

		expect(body.personnelSnapshot.map((row: { id: string }) => row.id)).toEqual(['army-e5', 'navy-e5']);
		expect(body.filterConfig.ranks).toEqual(expect.arrayContaining(['SGT', 'PO2']));
	});

	it('uses catalog categories for quick rank filters in generated roster payloads', async () => {
		const jointPersonnel: Personnel[] = [
			personnelRow({ id: 'navy-officer', rank: 'ADM', lastName: 'Officer' }),
			personnelRow({ id: 'navy-warrant', rank: 'CWO3', lastName: 'Warrant' }),
			personnelRow({ id: 'air-force-enlisted', rank: 'SSgt', lastName: 'Enlisted' }),
			personnelRow({ id: 'civilian', rank: 'CIV', lastName: 'Civilian' }),
			personnelRow({ id: 'custom-local', rank: 'LOCAL-CMD', lastName: 'Custom' })
		];
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			if ((init?.method ?? 'GET') === 'POST') {
				return jsonResponse({ id: 'roster-2' });
			}

			return jsonResponse({ rosters: [], total: 0 });
		});
		vi.stubGlobal('fetch', fetchMock);

		renderModal({
			personnel: jointPersonnel,
			rankCatalog: [
				rankCatalogEntry({
					code: 'ADM',
					label: 'Admiral',
					service: 'navy',
					category: 'officer',
					payGrade: 'O-10'
				}),
				rankCatalogEntry({
					code: 'CWO3',
					label: 'Chief Warrant Officer 3',
					service: 'navy',
					category: 'warrant',
					payGrade: 'W-3'
				}),
				rankCatalogEntry({
					code: 'SSgt',
					label: 'Staff Sergeant',
					service: 'air-force',
					category: 'enlisted',
					payGrade: 'E-5'
				}),
				rankCatalogEntry({
					code: 'CIV',
					label: 'Civilian',
					service: 'civilian',
					category: 'civilian',
					payGrade: 'ungraded'
				}),
				rankCatalogEntry({
					code: 'LOCAL-CMD',
					label: 'Local command billet',
					service: 'custom',
					category: 'custom',
					payGrade: 'ungraded'
				})
			]
		});

		await waitFor(() => expect(screen.getByRole('button', { name: 'New Roster' })).toBeTruthy());

		await fireEvent.click(screen.getByRole('button', { name: 'New Roster' }));
		await fireEvent.input(screen.getByLabelText(/Title/i), {
			target: { value: 'Joint Quick Filters' }
		});
		for (const rank of ['ADM', 'CWO3', 'SSgt', 'CIV', 'LOCAL-CMD']) {
			await fireEvent.click(screen.getByRole('button', { name: rank }));
		}
		await fireEvent.click(screen.getByRole('button', { name: 'All Officers' }));
		await fireEvent.click(screen.getByRole('button', { name: 'All Warrant' }));
		await fireEvent.click(screen.getByRole('button', { name: 'All Enlisted' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Civilians' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Generate & Print' }));

		let postCall: (typeof fetchMock.mock.calls)[number] | undefined;
		await waitFor(() => {
			postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
			expect(postCall).toBeTruthy();
		});
		const body = JSON.parse(String(postCall?.[1]?.body));

		expect(body.personnelSnapshot.map((row: { id: string }) => row.id)).toEqual(
			expect.arrayContaining(['navy-officer', 'navy-warrant', 'air-force-enlisted', 'civilian'])
		);
		expect(body.personnelSnapshot.map((row: { id: string }) => row.id)).not.toContain('custom-local');
		expect(body.filterConfig.ranks).toEqual(expect.arrayContaining(['ADM', 'CWO3', 'SSgt', 'CIV']));
		expect(body.filterConfig.ranks).not.toContain('LOCAL-CMD');
	});

	it('includes case-varied observed rank aliases in catalog quick filter categories', async () => {
		const aliasPersonnel: Personnel[] = [
			personnelRow({ id: 'lowercase-sergeant', rank: 'sgt', lastName: 'Enlisted' }),
			personnelRow({ id: 'civilian', rank: 'CIV', lastName: 'Civilian' })
		];
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			if ((init?.method ?? 'GET') === 'POST') {
				return jsonResponse({ id: 'roster-2' });
			}

			return jsonResponse({ rosters: [], total: 0 });
		});
		vi.stubGlobal('fetch', fetchMock);

		renderModal({
			personnel: aliasPersonnel,
			rankCatalog: [
				rankCatalogEntry({
					code: 'SGT',
					label: 'Sergeant',
					category: 'enlisted',
					payGrade: 'E-5'
				}),
				rankCatalogEntry({
					code: 'CIV',
					label: 'Civilian',
					service: 'civilian',
					category: 'civilian',
					payGrade: 'ungraded'
				})
			]
		});

		await waitFor(() => expect(screen.getByRole('button', { name: 'New Roster' })).toBeTruthy());

		await fireEvent.click(screen.getByRole('button', { name: 'New Roster' }));
		await fireEvent.input(screen.getByLabelText(/Title/i), {
			target: { value: 'Alias Quick Filter' }
		});
		for (const rank of ['SGT', 'sgt']) {
			await fireEvent.click(screen.getByRole('button', { name: rank }));
		}
		await fireEvent.click(screen.getByRole('button', { name: 'All Enlisted' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Generate & Print' }));

		let postCall: (typeof fetchMock.mock.calls)[number] | undefined;
		await waitFor(() => {
			postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
			expect(postCall).toBeTruthy();
		});
		const body = JSON.parse(String(postCall?.[1]?.body));

		expect(body.personnelSnapshot.map((row: { id: string }) => row.id)).toEqual(
			expect.arrayContaining(['lowercase-sergeant', 'civilian'])
		);
		expect(body.filterConfig.ranks).toEqual(expect.arrayContaining(['SGT', 'sgt']));
	});

	it('uses catalog categories for retired ranks that are still visible in the roster', async () => {
		const legacyPersonnel: Personnel[] = [
			personnelRow({ id: 'legacy-specialist', rank: 'SP4', lastName: 'Legacy' }),
			personnelRow({ id: 'custom-local', rank: 'LOCAL-CMD', lastName: 'Custom' })
		];
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			if ((init?.method ?? 'GET') === 'POST') {
				return jsonResponse({ id: 'roster-2' });
			}

			return jsonResponse({ rosters: [], total: 0 });
		});
		vi.stubGlobal('fetch', fetchMock);

		renderModal({
			personnel: legacyPersonnel,
			rankCatalog: [
				rankCatalogEntry({
					code: 'SP4',
					label: 'Specialist Four',
					category: 'enlisted',
					payGrade: 'E-4',
					state: 'retired'
				}),
				rankCatalogEntry({
					code: 'LOCAL-CMD',
					label: 'Local command billet',
					service: 'custom',
					category: 'custom',
					payGrade: 'ungraded'
				})
			]
		});

		await waitFor(() => expect(screen.getByRole('button', { name: 'New Roster' })).toBeTruthy());

		await fireEvent.click(screen.getByRole('button', { name: 'New Roster' }));
		await fireEvent.input(screen.getByLabelText(/Title/i), {
			target: { value: 'Legacy Rank Quick Filter' }
		});
		for (const rank of ['LOCAL-CMD', 'SP4']) {
			await fireEvent.click(screen.getByRole('button', { name: rank }));
		}
		await fireEvent.click(screen.getByRole('button', { name: 'All Enlisted' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Generate & Print' }));

		let postCall: (typeof fetchMock.mock.calls)[number] | undefined;
		await waitFor(() => {
			postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
			expect(postCall).toBeTruthy();
		});
		const body = JSON.parse(String(postCall?.[1]?.body));

		expect(body.personnelSnapshot.map((row: { id: string }) => row.id)).toEqual(['legacy-specialist']);
		expect(body.filterConfig.ranks).toContain('SP4');
		expect(body.filterConfig.ranks).not.toContain('LOCAL-CMD');
	});

	it('uses built-in categories for observed joint ranks when no organization catalog is available', async () => {
		const jointPersonnel: Personnel[] = [
			personnelRow({ id: 'army-enlisted', rank: 'SGT', lastName: 'Army' }),
			personnelRow({ id: 'navy-enlisted', rank: 'PO2', lastName: 'Navy' }),
			personnelRow({ id: 'air-force-enlisted', rank: 'SSgt', lastName: 'Air' }),
			personnelRow({ id: 'custom-local', rank: 'LOCAL-CMD', lastName: 'Custom' })
		];
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			if ((init?.method ?? 'GET') === 'POST') {
				return jsonResponse({ id: 'roster-2' });
			}

			return jsonResponse({ rosters: [], total: 0 });
		});
		vi.stubGlobal('fetch', fetchMock);

		renderModal({ personnel: jointPersonnel });

		await waitFor(() => expect(screen.getByRole('button', { name: 'New Roster' })).toBeTruthy());

		await fireEvent.click(screen.getByRole('button', { name: 'New Roster' }));
		await fireEvent.input(screen.getByLabelText(/Title/i), {
			target: { value: 'No Catalog Joint Quick Filter' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'All Enlisted' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Generate & Print' }));

		let postCall: (typeof fetchMock.mock.calls)[number] | undefined;
		await waitFor(() => {
			postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
			expect(postCall).toBeTruthy();
		});
		const body = JSON.parse(String(postCall?.[1]?.body));

		expect(body.personnelSnapshot.map((row: { id: string }) => row.id)).toEqual(['custom-local']);
		expect(body.filterConfig.ranks).not.toContain('SGT');
		expect(body.filterConfig.ranks).not.toContain('PO2');
		expect(body.filterConfig.ranks).not.toContain('SSgt');
		expect(body.filterConfig.ranks).toContain('LOCAL-CMD');
	});

	it('does not show reset filters until a catalog-backed rank filter changes', async () => {
		const fetchMock = vi.fn(async () => jsonResponse({ rosters: [], total: 0 }));
		vi.stubGlobal('fetch', fetchMock);

		renderModal({
			personnel: [personnelRow({ id: 'person-army', rank: 'SGT' }), personnelRow({ id: 'person-navy', rank: 'PO2' })],
			rankCatalog: [
				rankCatalogEntry({ code: 'PO2', label: 'Petty Officer Second Class', service: 'navy' }),
				rankCatalogEntry({ code: 'SGT', label: 'Sergeant', service: 'army' }),
				rankCatalogEntry({ code: 'SSgt', label: 'Staff Sergeant', service: 'air-force' })
			]
		});

		await waitFor(() => expect(screen.getByRole('button', { name: 'New Roster' })).toBeTruthy());

		await fireEvent.click(screen.getByRole('button', { name: 'New Roster' }));

		expect(screen.queryByRole('button', { name: 'Reset filters' })).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'PO2' }));

		expect(screen.getByRole('button', { name: 'Reset filters' })).toBeTruthy();
	});

	it('discloses one saved roster at a time through a trigger that names its panel', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				jsonResponse({
					rosters: [makeRoster(), makeRoster({ id: 'roster-2', title: 'Evening Formation' })],
					total: 2
				})
			)
		);

		renderModal();

		const morning = await screen.findByRole('button', { name: /Morning Formation/i });
		const evening = screen.getByRole('button', { name: /Evening Formation/i });
		expect(morning.getAttribute('aria-expanded')).toBe('false');
		expect(screen.queryByRole('button', { name: 'Re-print' })).toBeNull();

		await fireEvent.click(morning);

		expect(morning.getAttribute('aria-expanded')).toBe('true');
		expect(morning.textContent).toContain('Hide');
		const panelId = morning.getAttribute('aria-controls');
		expect(panelId).toBeTruthy();
		expect(document.getElementById(panelId!)?.textContent).toContain('Created');
		expect(screen.getAllByRole('button', { name: 'Re-print' })).toHaveLength(1);

		await fireEvent.click(evening);

		expect(morning.getAttribute('aria-expanded')).toBe('false');
		expect(evening.getAttribute('aria-expanded')).toBe('true');
		expect(screen.getAllByRole('button', { name: 'Re-print' })).toHaveLength(1);

		await fireEvent.click(evening);

		expect(evening.getAttribute('aria-expanded')).toBe('false');
		expect(screen.queryByRole('button', { name: 'Re-print' })).toBeNull();
	});

	it('uploads a signed roster scan through the shadcn file input and shows selected-file progress', async () => {
		let resolveUpload: ((response: Response) => void) | undefined;
		const uploadResponse = new Promise<Response>((resolve) => {
			resolveUpload = resolve;
		});
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			if (String(input).endsWith('/upload') && init?.method === 'POST') {
				return uploadResponse;
			}

			return jsonResponse({ rosters: [makeRoster()], total: 1 });
		});
		vi.stubGlobal('fetch', fetchMock);

		renderModal();

		await waitFor(() => expect(screen.getByRole('button', { name: /Morning Formation/i })).toBeTruthy());

		await fireEvent.click(screen.getByRole('button', { name: /Morning Formation/i }));
		const input = screen.getByLabelText('Signed Scan') as HTMLInputElement;
		const file = new File(['signed roster'], 'signed-roster.pdf', { type: 'application/pdf' });

		await fireEvent.change(input, { target: { files: [file] } });

		expect(screen.getByText('Uploading signed-roster.pdf...')).toBeTruthy();

		resolveUpload?.(jsonResponse({ filePath: 'org-1/sign-in-rosters/roster-1/signed-roster.pdf' }));

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'signed-roster.pdf' })).toBeTruthy();
		});

		const uploadCall = fetchMock.mock.calls.find(
			([input, init]) => String(input).endsWith('/upload') && init?.method === 'POST'
		);
		expect(uploadCall?.[0]).toBe('/org/org-1/api/sign-in-rosters/roster-1/upload');
		expect(uploadCall?.[1]?.body).toBeInstanceOf(FormData);
	});

	it('validates signed roster scan type before upload', async () => {
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
			jsonResponse({ rosters: [makeRoster()], total: 1 })
		);
		vi.stubGlobal('fetch', fetchMock);

		renderModal();

		await waitFor(() => expect(screen.getByRole('button', { name: /Morning Formation/i })).toBeTruthy());

		await fireEvent.click(screen.getByRole('button', { name: /Morning Formation/i }));
		const input = screen.getByLabelText('Signed Scan') as HTMLInputElement;
		const file = new File(['not a pdf'], 'signed-roster.txt', { type: 'text/plain' });

		await fireEvent.change(input, { target: { files: [file] } });

		expect(screen.getByRole('alert').textContent).toBe('Only PDF files are allowed.');
		expect(
			fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/upload') && init?.method === 'POST')
		).toBe(false);
	});

	it('lets a read-only member download a signed scan without upload or removal controls', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				jsonResponse({
					rosters: [makeRoster({ signedFilePath: 'org-1/sign-in-rosters/roster-1/signed-roster.pdf' })],
					total: 1
				})
			)
		);

		renderModal({ canEdit: false });
		await fireEvent.click(await screen.findByRole('button', { name: /Morning Formation/i }));

		expect(screen.getByRole('button', { name: 'signed-roster.pdf' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
		expect(screen.queryByLabelText('Signed Scan')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
	});

	it('shows a download error when the signed scan link request fails', async () => {
		const roster = makeRoster({ signedFilePath: 'org-1/sign-in-rosters/roster-1/signed-roster.pdf' });
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				if (String(input).endsWith('/upload')) throw new TypeError('Failed to fetch');
				return jsonResponse({ rosters: [roster], total: 1 });
			})
		);

		renderModal({ canEdit: false });
		await fireEvent.click(await screen.findByRole('button', { name: /Morning Formation/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'signed-roster.pdf' }));

		expect(await screen.findByText('Could not generate download link.')).toBeTruthy();
	});

	it('removes an uploaded signed roster scan once while the dialog stays busy', async () => {
		let resolveRemove!: (response: Response) => void;
		const removeResponse = new Promise<Response>((resolve) => (resolveRemove = resolve));
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			if (String(input).endsWith('/upload') && init?.method === 'DELETE') {
				return removeResponse;
			}

			return jsonResponse({
				rosters: [makeRoster({ signedFilePath: 'org-1/sign-in-rosters/roster-1/signed-roster.pdf' })],
				total: 1
			});
		});
		vi.stubGlobal('fetch', fetchMock);

		renderModal();

		await waitFor(() => expect(screen.getByRole('button', { name: /Morning Formation/i })).toBeTruthy());

		await fireEvent.click(screen.getByRole('button', { name: /Morning Formation/i }));
		expect(screen.getByRole('button', { name: 'signed-roster.pdf' })).toBeTruthy();
		const dialog = screen.getByRole('dialog', { name: 'Sign-In Rosters' });
		for (const label of dialog.querySelectorAll('label[for]')) {
			expect(document.getElementById(label.getAttribute('for') ?? '')).not.toBeNull();
		}

		const remove = screen.getByRole('button', { name: 'Remove' });
		await fireEvent.click(remove);
		await fireEvent.click(remove);
		expect((screen.getByLabelText('Replace signed scan') as HTMLInputElement).disabled).toBe(true);

		expect(
			fetchMock.mock.calls.filter(([input, init]) => String(input).endsWith('/upload') && init?.method === 'DELETE')
		).toHaveLength(1);
		expect(dialog.getAttribute('aria-busy')).toBe('true');
		expect((screen.getByRole('button', { name: 'Close' }) as HTMLButtonElement).disabled).toBe(true);

		resolveRemove(jsonResponse({}));

		await waitFor(() => {
			expect(screen.queryByRole('button', { name: 'signed-roster.pdf' })).toBeNull();
			expect(screen.getByLabelText('Signed Scan')).toBeTruthy();
		});

		const deleteCall = fetchMock.mock.calls.find(
			([input, init]) => String(input).endsWith('/upload') && init?.method === 'DELETE'
		);
		expect(deleteCall?.[0]).toBe('/org/org-1/api/sign-in-rosters/roster-1/upload');
		expect(JSON.parse(String(deleteCall?.[1]?.body))).toEqual({
			filePath: 'org-1/sign-in-rosters/roster-1/signed-roster.pdf'
		});
	});

	it('replaces a saved signed scan through its labeled file input', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			if (String(input).endsWith('/upload') && init?.method === 'POST')
				return jsonResponse({ filePath: 'org-1/sign-in-rosters/roster-1/replacement.pdf' });
			return jsonResponse({ rosters: [makeRoster({ signedFilePath: SAVED_SCAN })], total: 1 });
		});
		vi.stubGlobal('fetch', fetchMock);

		renderModal();
		await fireEvent.click(await screen.findByRole('button', { name: /Morning Formation/i }));
		const file = new File(['replacement'], 'replacement.pdf', { type: 'application/pdf' });
		await fireEvent.change(screen.getByLabelText('Replace signed scan'), { target: { files: [file] } });

		expect(await screen.findByRole('button', { name: 'replacement.pdf' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'signed-roster.pdf' })).toBeNull();
	});

	it('explains a changed scan and reloads the roster list instead of removing it', async () => {
		let listCalls = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				if (String(input).endsWith('/upload') && init?.method === 'DELETE')
					return jsonResponse({ message: 'This signed scan changed. Reload to review it.' }, false, 409);
				listCalls++;
				const signedFilePath = listCalls === 1 ? SAVED_SCAN : 'org-1/sign-in-rosters/roster-1/newer.pdf';
				return jsonResponse({ rosters: [makeRoster({ signedFilePath })], total: 1 });
			})
		);

		renderModal();
		await fireEvent.click(await screen.findByRole('button', { name: /Morning Formation/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

		expect(await screen.findByText('This signed scan changed. Reload to review it.')).toBeTruthy();
		expect(await screen.findByRole('button', { name: 'newer.pdf' })).toBeTruthy();
		expect(listCalls).toBe(2);
	});

	it.each([
		[
			'a refused deletion keeps the confirmation with its error',
			jsonResponse({ message: 'Sign-in roster management is not allowed' }, false, 403)
		],
		['an unconfirmed deletion keeps the confirmation with its error', 'network' as const]
	])('%s', async (_case, reply) => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
				if (init?.method === 'DELETE') {
					if (reply === 'network') throw new TypeError('Failed to fetch');
					return reply;
				}
				return jsonResponse({ rosters: [makeRoster()], total: 1 });
			})
		);

		renderModal();
		await fireEvent.click(await screen.findByRole('button', { name: /Morning Formation/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		const confirm = await screen.findByRole('alertdialog');
		await fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));

		expect(
			await within(confirm).findByText(
				reply === 'network' ? 'Unable to delete roster.' : 'Sign-in roster management is not allowed'
			)
		).toBeTruthy();
		expect(screen.getByRole('button', { name: /Morning Formation/i })).toBeTruthy();
	});

	const UNCONFIRMED = 'The signed scan change could not be confirmed. Reload to check it.';

	it.each([
		['an unconfirmed upload', jsonResponse({ message: UNCONFIRMED }, false, 503), 'upload', UNCONFIRMED],
		['an unconfirmed remove', jsonResponse({ message: UNCONFIRMED }, false, 503), 'remove', UNCONFIRMED],
		['an unconfirmed delete', jsonResponse({ message: UNCONFIRMED }, false, 503), 'delete', UNCONFIRMED],
		[
			'an upload failure without a public message',
			jsonResponse({ error: 'raw stack' }, false, 500),
			'upload',
			'Upload failed.'
		],
		[
			'a remove failure without a public message',
			jsonResponse({ message: 42 }, false, 500),
			'remove',
			'Remove failed.'
		],
		['a delete failure without a public message', jsonResponse({}, false, 500), 'delete', 'Unable to delete roster.'],
		['a null upload failure body', jsonResponse(null, false, 500), 'upload', 'Upload failed.']
	] as const)('shows the server message for %s and keeps the roster', async (_case, reply, action, text) => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				if (init?.method === 'POST' && String(input).endsWith('/upload') && action === 'upload') return reply;
				if (init?.method === 'DELETE') return reply;
				return jsonResponse({
					rosters: [makeRoster({ signedFilePath: action === 'upload' ? null : SAVED_SCAN })],
					total: 1
				});
			})
		);

		renderModal();
		await fireEvent.click(await screen.findByRole('button', { name: /Morning Formation/i }));
		if (action === 'upload') {
			const file = new File(['%PDF-1.4'], 'scan.pdf', { type: 'application/pdf' });
			await fireEvent.change(screen.getByLabelText('Signed Scan'), { target: { files: [file] } });
		} else if (action === 'remove') {
			await fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
		} else {
			await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
			await fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
		}

		expect(await screen.findByText(text)).toBeTruthy();
		expect(screen.getByRole('button', { name: /Morning Formation/i })).toBeTruthy();
	});

	it.each([
		[
			'a pending file cleanup',
			jsonResponse({ success: true, fileCleanup: 'pending' }),
			'success',
			'Roster deleted. Its stored file will be removed automatically.'
		],
		[
			'an already unavailable roster',
			jsonResponse({ message: 'This roster is no longer available.' }, false, 404),
			'error',
			'This roster is no longer available.'
		]
	] as const)('drops the roster and reports %s', async (_case, reply, level, message) => {
		const toast = vi.spyOn(toastStore, level);
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
				init?.method === 'DELETE' ? reply : jsonResponse({ rosters: [makeRoster()], total: 1 })
			)
		);

		renderModal();
		await fireEvent.click(await screen.findByRole('button', { name: /Morning Formation/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		await fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

		await waitFor(() => expect(screen.queryByRole('button', { name: /Morning Formation/i })).toBeNull());
		expect(toast).toHaveBeenCalledWith(message);
	});
});

function personnelRow(overrides: Partial<Personnel>): Personnel {
	return {
		id: overrides.id ?? 'person',
		rank: overrides.rank ?? 'SGT',
		lastName: overrides.lastName ?? 'Able',
		firstName: overrides.firstName ?? 'Alex',
		mos: overrides.mos ?? '11B',
		clinicRole: overrides.clinicRole ?? '',
		groupId: overrides.groupId ?? 'group-1',
		groupName: overrides.groupName ?? 'Alpha'
	};
}

function rankCatalogEntry(overrides: Partial<RankCatalogEntry>): RankCatalogEntry {
	return {
		code: overrides.code ?? 'SGT',
		label: overrides.label ?? overrides.code ?? 'Sergeant',
		service: overrides.service ?? 'army',
		category: overrides.category ?? 'enlisted',
		payGrade: overrides.payGrade ?? 'E-5',
		state: overrides.state ?? 'active',
		sortOrder: overrides.sortOrder ?? 0
	};
}
