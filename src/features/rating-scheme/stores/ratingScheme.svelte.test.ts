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

describe('ratingSchemeStore', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		ratingSchemeStore.load(structuredClone(mockEntries), 'org-1');
	});

	it('should load and expose entries via list', () => {
		expect(ratingSchemeStore.list).toHaveLength(2);
	});

	it('should contain entries with correct data', () => {
		const entry = ratingSchemeStore.list.find((e) => e.id === '1');
		expect(entry?.evalType).toBe('NCOER');
		expect(entry?.ratedPersonId).toBe('p1');
	});
});
