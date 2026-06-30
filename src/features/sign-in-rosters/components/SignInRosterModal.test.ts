// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
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
import type { RankCatalogEntry } from '$lib/domain/rankCatalog';
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

	it('shows a list load error without clearing the roster array shape', async () => {
		const fetchMock = vi.fn(async () => jsonResponse({ error: 'Sign-in rosters are unavailable.' }, false));
		vi.stubGlobal('fetch', fetchMock);

		renderModal();

		await waitFor(() => {
			expect(screen.getByText('Sign-in rosters are unavailable.')).toBeTruthy();
		});

		expect(screen.getByText('No sign-in rosters yet.')).toBeTruthy();
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

	it('removes an uploaded signed roster scan', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			if (String(input).endsWith('/upload') && init?.method === 'DELETE') {
				return jsonResponse({});
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

		await fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

		await waitFor(() => {
			expect(screen.queryByRole('button', { name: 'signed-roster.pdf' })).toBeNull();
			expect(screen.getByLabelText('Signed Scan')).toBeTruthy();
		});

		const deleteCall = fetchMock.mock.calls.find(
			([input, init]) => String(input).endsWith('/upload') && init?.method === 'DELETE'
		);
		expect(deleteCall?.[0]).toBe('/org/org-1/api/sign-in-rosters/roster-1/upload');
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
