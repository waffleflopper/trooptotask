import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trainingTypesStore } from './trainingTypes.svelte';
import type { TrainingType } from '../training.types';

const mockTypes: TrainingType[] = [
	{
		id: '1',
		name: 'CPR',
		sortOrder: 2,
		color: '#3b82f6',
		description: null,
		expirationMonths: 12,
		warningDaysYellow: 60,
		warningDaysOrange: 30,
		appliesToRoles: [],
		appliesToMos: [],
		appliesToRanks: [],
		excludedRoles: [],
		excludedMos: [],
		excludedRanks: [],
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: [],
		isOptional: false,
		archivedAt: null
	},
	{
		id: '2',
		name: 'Weapons',
		sortOrder: 0,
		color: '#ef4444',
		description: null,
		expirationMonths: 6,
		warningDaysYellow: 60,
		warningDaysOrange: 30,
		appliesToRoles: [],
		appliesToMos: [],
		appliesToRanks: [],
		excludedRoles: [],
		excludedMos: [],
		excludedRanks: [],
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: [],
		isOptional: false,
		archivedAt: null
	},
	{
		id: '3',
		name: 'PT Test',
		sortOrder: 1,
		color: '#22c55e',
		description: null,
		expirationMonths: null,
		warningDaysYellow: 60,
		warningDaysOrange: 30,
		appliesToRoles: [],
		appliesToMos: [],
		appliesToRanks: [],
		excludedRoles: [],
		excludedMos: [],
		excludedRanks: [],
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: [],
		isOptional: false,
		archivedAt: null
	}
];

function stubFetch(response: unknown, status = 200) {
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(response) })
	);
}

function stubArchive(archivedAt: string | null) {
	const fetchMock = vi.fn().mockResolvedValue(Response.json({ archivedAt }));
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

describe('trainingTypesStore', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		trainingTypesStore.load(structuredClone(mockTypes), 'org-1');
	});

	describe('list (sorted by sortOrder)', () => {
		it('returns items sorted by sortOrder ascending', () => {
			const names = trainingTypesStore.items.map((t) => t.name);
			expect(names).toEqual(['Weapons', 'PT Test', 'CPR']);
		});

		it('returns empty array before load', () => {
			trainingTypesStore.load([], 'org-2');
			expect(trainingTypesStore.items).toEqual([]);
		});
	});

	describe('load', () => {
		it('replaces existing items with new data', () => {
			trainingTypesStore.load([mockTypes[0]], 'org-2');
			expect(trainingTypesStore.items).toHaveLength(1);
			expect(trainingTypesStore.items[0].name).toBe('CPR');
		});
	});

	describe('getById', () => {
		it('finds an item by ID', () => {
			expect(trainingTypesStore.getById('1')?.name).toBe('CPR');
		});

		it('returns undefined for non-existent ID', () => {
			expect(trainingTypesStore.getById('nonexistent')).toBeUndefined();
		});
	});

	describe('add', () => {
		it('adds item and returns the server-created record', async () => {
			const created = {
				id: 'new-1',
				name: 'Land Nav',
				sortOrder: 3,
				color: '#000',
				description: null,
				expirationMonths: null,
				warningDaysYellow: 60,
				warningDaysOrange: 30,
				appliesToRoles: [],
				appliesToMos: [],
				appliesToRanks: [],
				excludedRoles: [],
				excludedMos: [],
				excludedRanks: [],
				expirationDateOnly: false,
				canBeExempted: false,
				exemptPersonnelIds: [],
				isOptional: false
			};
			stubFetch(created);

			const result = await trainingTypesStore.add({
				name: 'Land Nav',
				sortOrder: 3,
				color: '#000',
				description: null,
				expirationMonths: null,
				warningDaysYellow: 60,
				warningDaysOrange: 30,
				appliesToRoles: [],
				appliesToMos: [],
				appliesToRanks: [],
				excludedRoles: [],
				excludedMos: [],
				excludedRanks: [],
				expirationDateOnly: false,
				canBeExempted: false,
				exemptPersonnelIds: [],
				isOptional: false
			});

			expect(result).not.toBeNull();
			expect(result!.id).toBe('new-1');
			expect(trainingTypesStore.items.some((t) => t.id === 'new-1')).toBe(true);
		});
	});

	describe('update', () => {
		it('updates an existing item and returns true', async () => {
			stubFetch({ ...mockTypes[0], name: 'CPR/BLS' });

			const result = await trainingTypesStore.update('1', { name: 'CPR/BLS' });

			expect(result).toBe(true);
		});
	});

	describe('remove', () => {
		it('returns DeleteResult on success', async () => {
			stubFetch({});

			const result = await trainingTypesStore.remove('1');

			expect(result).toBe('deleted');
		});

		it('returns DeleteResult type, not boolean', async () => {
			stubFetch({});

			const result = await trainingTypesStore.remove('2');

			expect(typeof result).toBe('string');
		});
	});
	describe('archiving', () => {
		it('keeps archived types in items and leaves them out of active', async () => {
			stubArchive('2030-03-04T05:06:07Z');

			await trainingTypesStore.setArchived('1', true);

			expect(trainingTypesStore.getById('1')?.archivedAt).toBe('2030-03-04T05:06:07Z');
			expect(trainingTypesStore.items.map((type) => type.id)).toContain('1');
			expect(trainingTypesStore.active.map((type) => type.id)).not.toContain('1');
			expect(trainingTypesStore.active).toHaveLength(trainingTypesStore.items.length - 1);
		});

		it('sends the id and the direction to the archive route, and clears archivedAt on restore', async () => {
			const fetchMock = stubArchive('2030-03-04T05:06:07Z');
			await trainingTypesStore.setArchived('1', true);
			fetchMock.mockResolvedValueOnce(Response.json({ archivedAt: null }));

			await trainingTypesStore.setArchived('1', false);

			expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method, init.body])).toEqual([
				['/org/org-1/api/training-types/archive', 'PUT', JSON.stringify({ id: '1', archived: true })],
				['/org/org-1/api/training-types/archive', 'PUT', JSON.stringify({ id: '1', archived: false })]
			]);
			expect(trainingTypesStore.getById('1')?.archivedAt).toBeNull();
			expect(trainingTypesStore.active.map((type) => type.id)).toContain('1');
		});

		it('rejects with the server reason and leaves the type active when the archive is refused', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue(Response.json({ message: 'Training type not found' }, { status: 404 }))
			);

			await expect(trainingTypesStore.setArchived('1', true)).rejects.toThrow('Training type not found');

			expect(trainingTypesStore.getById('1')?.archivedAt).toBeNull();
		});
	});

	describe('loadUsage', () => {
		it('reads the counts for the current Organization', async () => {
			const fetchMock = vi.fn().mockResolvedValue(Response.json({ '1': 3, '2': 0 }));
			vi.stubGlobal('fetch', fetchMock);

			expect(await trainingTypesStore.loadUsage()).toEqual({ '1': 3, '2': 0 });
			expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/org/org-1/api/training-types/usage']);
		});

		it('rejects when the route fails', async () => {
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ message: 'No access' }, { status: 403 })));

			await expect(trainingTypesStore.loadUsage()).rejects.toThrow();
		});
	});
});
