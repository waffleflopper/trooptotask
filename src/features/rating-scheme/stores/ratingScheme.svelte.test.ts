import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ratingSchemeStore } from './ratingScheme.svelte';
import type { RatingSchemeEntry } from '../rating-scheme.types';

const mockEntries: RatingSchemeEntry[] = [
	{
		id: '1',
		ratedPersonId: 'p1',
		evalType: 'NCOER',
		raterPersonId: 'p2',
		raterName: null,
		seniorRaterPersonId: 'p3',
		seniorRaterName: null,
		intermediateRaterPersonId: null,
		intermediateRaterName: null,
		reviewerPersonId: null,
		reviewerName: null,
		ratingPeriodStart: '2025-04-01',
		ratingPeriodEnd: '2026-03-31',
		status: 'active',
		notes: null,
		reportType: 'AN',
		workflowStatus: 'drafting'
	},
	{
		id: '2',
		ratedPersonId: 'p2',
		evalType: 'OER',
		raterPersonId: null,
		raterName: 'COL Smith',
		seniorRaterPersonId: null,
		seniorRaterName: null,
		intermediateRaterPersonId: null,
		intermediateRaterName: null,
		reviewerPersonId: null,
		reviewerName: null,
		ratingPeriodStart: '2025-06-01',
		ratingPeriodEnd: '2026-05-31',
		status: 'completed',
		notes: null,
		reportType: 'AN',
		workflowStatus: 'completed'
	}
];

function stubFetch(response: unknown, status = 200) {
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(response) })
	);
}

describe('ratingSchemeStore', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		ratingSchemeStore.load(structuredClone(mockEntries), 'org-1');
	});

	describe('list', () => {
		it('returns loaded entries', () => {
			expect(ratingSchemeStore.list).toHaveLength(2);
		});

		it('contains entries with correct data', () => {
			const entry = ratingSchemeStore.list.find((e) => e.id === '1');
			expect(entry?.evalType).toBe('NCOER');
			expect(entry?.ratedPersonId).toBe('p1');
		});

		it('returns empty array when no items loaded', () => {
			ratingSchemeStore.load([], 'org-2');
			expect(ratingSchemeStore.list).toEqual([]);
		});
	});

	describe('load', () => {
		it('replaces existing items with new data', () => {
			ratingSchemeStore.load([mockEntries[0]], 'org-2');
			expect(ratingSchemeStore.list).toHaveLength(1);
			expect(ratingSchemeStore.list[0].evalType).toBe('NCOER');
		});
	});

	describe('add', () => {
		it('adds entry and returns the server-created record', async () => {
			const created = { ...mockEntries[0], id: 'new-1', ratedPersonId: 'p5' };
			stubFetch(created);

			const result = await ratingSchemeStore.add({
				ratedPersonId: 'p5',
				evalType: 'NCOER',
				raterPersonId: 'p2',
				raterName: null,
				seniorRaterPersonId: 'p3',
				seniorRaterName: null,
				intermediateRaterPersonId: null,
				intermediateRaterName: null,
				reviewerPersonId: null,
				reviewerName: null,
				ratingPeriodStart: '2025-04-01',
				ratingPeriodEnd: '2026-03-31',
				status: 'active',
				notes: null,
				reportType: 'AN',
				workflowStatus: 'drafting'
			});

			expect(result).not.toBeNull();
			expect(result!.id).toBe('new-1');
			expect(ratingSchemeStore.list.some((e) => e.id === 'new-1')).toBe(true);
		});
	});

	describe('update', () => {
		it('updates an existing entry and returns true', async () => {
			stubFetch({ ...mockEntries[0], status: 'completed' });

			const result = await ratingSchemeStore.update('1', { status: 'completed' });

			expect(result).toBe(true);
		});
	});

	describe('remove', () => {
		it('returns DeleteResult on success', async () => {
			stubFetch({});

			const result = await ratingSchemeStore.remove('1');

			expect(result).toBe('deleted');
		});

		it('returns DeleteResult type, not boolean', async () => {
			stubFetch({});

			const result = await ratingSchemeStore.remove('2');

			expect(typeof result).toBe('string');
		});
	});
});
