import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trainingViewsStore } from './trainingViews.svelte';
import type { TrainingView } from '../training.types';

const mockViews: TrainingView[] = [
	{
		id: 'tv-1',
		name: 'Clinical',
		columnIds: ['tt-2', 'tt-3'],
		createdBy: 'user-1',
		createdAt: '2026-03-24T00:00:00Z',
		updatedAt: '2026-03-24T00:00:00Z'
	},
	{
		id: 'tv-2',
		name: 'Annual Trainings',
		columnIds: ['tt-1', 'tt-4', 'tt-2'],
		createdBy: 'user-1',
		createdAt: '2026-03-24T00:00:00Z',
		updatedAt: '2026-03-24T00:00:00Z'
	}
];

function stubFetch(response: unknown, status = 200) {
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue({
			ok: status >= 200 && status < 300,
			status,
			json: () => Promise.resolve(response)
		})
	);
}

describe('trainingViewsStore', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		trainingViewsStore.load(structuredClone(mockViews), 'org-1');
	});

	describe('items (sorted by name)', () => {
		it('returns items sorted by name ascending', () => {
			const names = trainingViewsStore.items.map((v) => v.name);
			expect(names).toEqual(['Annual Trainings', 'Clinical']);
		});

		it('returns empty array before load', () => {
			trainingViewsStore.load([], 'org-2');
			expect(trainingViewsStore.items).toEqual([]);
		});
	});

	describe('load', () => {
		it('replaces existing items with new data', () => {
			trainingViewsStore.load([mockViews[0]], 'org-2');
			expect(trainingViewsStore.items).toHaveLength(1);
			expect(trainingViewsStore.items[0].name).toBe('Clinical');
		});
	});

	describe('getById', () => {
		it('finds a view by ID', () => {
			expect(trainingViewsStore.getById('tv-1')?.name).toBe('Clinical');
		});

		it('returns undefined for non-existent ID', () => {
			expect(trainingViewsStore.getById('nonexistent')).toBeUndefined();
		});
	});

	describe('add', () => {
		it('adds view and returns the server-created record', async () => {
			const created: TrainingView = {
				id: 'tv-new',
				name: 'Onboarding',
				columnIds: ['tt-5'],
				createdBy: 'user-1',
				createdAt: '2026-03-24T00:00:00Z',
				updatedAt: '2026-03-24T00:00:00Z'
			};
			stubFetch(created);

			const result = await trainingViewsStore.add({
				name: 'Onboarding',
				columnIds: ['tt-5'],
				createdBy: '',
				createdAt: '',
				updatedAt: ''
			});

			expect(result).not.toBeNull();
			expect(result!.id).toBe('tv-new');
			expect(trainingViewsStore.items.some((v) => v.id === 'tv-new')).toBe(true);
		});
	});

	describe('update', () => {
		it('updates an existing view and returns true', async () => {
			stubFetch({ ...mockViews[0], name: 'Clinical Certs' });

			const result = await trainingViewsStore.update('tv-1', { name: 'Clinical Certs' });

			expect(result).toBe(true);
		});
	});

	describe('remove', () => {
		it('returns DeleteResult on success', async () => {
			stubFetch({});

			const result = await trainingViewsStore.remove('tv-1');

			expect(result).toBe('deleted');
		});
	});
});
