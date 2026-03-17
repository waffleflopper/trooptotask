import { describe, it, expect, vi, beforeEach } from 'vitest';
import { developmentGoalsStore } from './developmentGoals.svelte';
import type { DevelopmentGoal } from '../counseling.types';

const mockGoals: DevelopmentGoal[] = [
	{
		id: '1',
		personnelId: 'p1',
		title: 'Leadership',
		description: null,
		category: 'career',
		priority: 'high',
		status: 'in-progress',
		targetDate: null,
		progressNotes: null
	},
	{
		id: '2',
		personnelId: 'p1',
		title: 'PT Score',
		description: null,
		category: 'physical',
		priority: 'medium',
		status: 'not-started',
		targetDate: null,
		progressNotes: null
	},
	{
		id: '3',
		personnelId: 'p2',
		title: 'Education',
		description: null,
		category: 'education',
		priority: 'low',
		status: 'not-started',
		targetDate: null,
		progressNotes: null
	}
];

describe('developmentGoalsStore', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		developmentGoalsStore.load(structuredClone(mockGoals), 'org-1');
	});

	describe('getById', () => {
		it('should find a goal by ID', () => {
			expect(developmentGoalsStore.getById('1')?.title).toBe('Leadership');
		});
	});

	describe('getByPersonnelId', () => {
		it('should return all goals for a person', () => {
			expect(developmentGoalsStore.getByPersonnelId('p1')).toHaveLength(2);
		});

		it('should return empty for unknown person', () => {
			expect(developmentGoalsStore.getByPersonnelId('unknown')).toHaveLength(0);
		});
	});
});
