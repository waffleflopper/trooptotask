import assert from 'node:assert/strict';
import { test } from 'node:test';
import { journeyFor, journeys, monthLabels } from './perf-journeys.mjs';

test('an unknown or wrong-kind journey is refused with the journeys of that kind', () => {
	const loads =
		'Use a load journey: calendar-initial, personnel-list, personnel-detail-direct, dashboard, training-report, critical-tasks-report, members-list, admin-users.';
	assert.throws(() => journeyFor('calendar-month', 'perfWide', 'load'), { message: loads });
	assert.throws(() => journeyFor('personnel-search', 'perfWide', 'load'), { message: loads });
});

test('an actor a journey does not reach is refused with the reason', () => {
	assert.throws(() => journeyFor('members-list', 'perfScoped', 'load'), {
		message:
			'members-list is not applicable to perfScoped: Organization settings need an admin; perfScoped is a Group-scoped operator (403).'
	});
	assert.throws(() => journeyFor('personnel-detail', 'perfScoped', 'interaction'), {
		message:
			'personnel-detail is not applicable to perfScoped: The detail page needs the personnel configure capability (personnel.readSensitiveRecords); perfScoped is an operator (403).'
	});
	assert.throws(() => journeyFor('admin-users', 'perfWide', 'load'), {
		message: 'admin-users is not applicable to perfWide: Platform administration needs a platform role.'
	});
	assert.throws(() => journeyFor('personnel-list', 'platformReviewer', 'load'), {
		message: 'personnel-list is not measured as platformReviewer.'
	});
	assert.equal(journeyFor('admin-users', 'platformReviewer', 'load'), journeys['admin-users']);
	assert.equal(journeyFor('personnel-detail', 'perfScopedLeader', 'interaction'), journeys['personnel-detail']);
	assert.throws(() => journeyFor('personnel-list', 'perfScopedLeader', 'load'), {
		message: 'personnel-list is not measured as perfScopedLeader.'
	});
	assert.throws(() => journeyFor('briefing-detail-page', 'perfScoped', 'interaction'), {
		message:
			'briefing-detail-page is not applicable to perfScoped: The scoped Group has at most 25 soldiers, so its widest cell fits on one page and has no Next.'
	});
});

test('only Calendar initial, Personnel list and Dashboard are measured cold', () => {
	assert.deepEqual(
		Object.keys(journeys).filter((name) => journeys[name].cold),
		['calendar-initial', 'personnel-list', 'dashboard']
	);
});

test('month labels follow the anchor across a year end', () => {
	assert.deepEqual(monthLabels('2026-11-20'), {
		current: 'November 2026',
		quarter: 'November 2026 – January 2027',
		nextQuarter: 'February 2027 – April 2027'
	});
});

test('write samples alternate so an even sample count ends on the seeded value', () => {
	const assignment = {
		control: 'CQ, Thu 1 Oct: ',
		original: { label: 'SPC Baker, Bo', search: 'Baker' },
		alternate: { label: '2LT Cole, Cy', search: 'Cole' }
	};
	const save = journeys['assignment-save'];
	assert.deepEqual(save.prepare({ assignment }, 0)[1], { type: 'Cole' });
	assert.deepEqual(save.milestones({ assignment }, 0)[0].presentSelector, [
		'button[aria-label^="CQ, Thu 1 Oct: 2LT Cole, Cy"]'
	]);
	assert.deepEqual(save.prepare({ assignment }, 5)[1], { type: 'Baker' });
	const edit = { row: 'Open SPC Able, Alex', original: '68W', alternate: '42A' };
	assert.deepEqual(journeys['personnel-detail-edit'].milestones({ edit }, 0)[0].inside, {
		'[data-slot="page-header"] [data-slot="badge"]': ['42A']
	});
	assert.deepEqual(journeys['personnel-detail-edit'].milestones({ edit }, 0)[0].absent, ['Save basic info']);
});
