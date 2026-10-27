// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { Tasking } from '../taskingModel';
import type { TaskingRowFacts } from '../taskingReadModel';
import TaskingsTable from './TaskingsTable.svelte';

const tasking = (id: string, title: string): Tasking => ({
	id,
	title,
	event: null,
	responsibility: { kind: 'organization' },
	suspenseOn: '2026-10-20',
	execution: null,
	requirement: null,
	instructions: null,
	status: { kind: 'open' },
	readiness: { equipment: null, checklist: null }
});

const facts = (conflicts: number): TaskingRowFacts => ({
	eventRelation: 'standalone',
	picked: 3,
	required: 3,
	equipment: { ready: 0, total: 0, returnedQuantity: 0, totalQuantity: 0 },
	conflicts,
	nextDate: '2026-10-20',
	suspenseOn: '2026-10-20',
	status: 'open',
	responsibleGroupId: null
});

afterEach(cleanup);

describe('Taskings table', () => {
	it('marks only the Taskings whose picks have a conflicting status', () => {
		render(TaskingsTable, {
			taskingsHref: '/org/org-a/calendar/taskings',
			today: '2026-10-16',
			taskings: [tasking('medics', 'Medic coverage'), tasking('slides', 'Brief slides')],
			groups: {},
			facts: { medics: facts(2), slides: facts(0) }
		});

		const medics = within(screen.getByRole('link', { name: /Medic coverage/ }));
		const slides = within(screen.getByRole('link', { name: /Brief slides/ }));
		expect(medics.getByRole('img', { name: /2 people/ })).toBeTruthy();
		expect(slides.queryByRole('img')).toBeNull();
	});
});
