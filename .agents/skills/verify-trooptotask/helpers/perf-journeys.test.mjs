import assert from 'node:assert/strict';
import { test } from 'node:test';
import { journeyFor, journeys, monthLabels } from './perf-journeys.mjs';

test('an unknown or wrong-kind journey is refused with the journeys of that kind', () => {
	const loads =
		'Use a load journey: calendar-initial, personnel-list, personnel-detail-direct, dashboard, training-report, critical-tasks-report, members-list, admin-people.';
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
	assert.throws(() => journeyFor('admin-people', 'perfWide', 'load'), {
		message: 'admin-people is not applicable to perfWide: Platform administration needs the operator.'
	});
	assert.throws(() => journeyFor('personnel-list', 'platformReviewer', 'load'), {
		message: 'personnel-list is not measured as platformReviewer.'
	});
	assert.equal(journeyFor('admin-people', 'platformReviewer', 'load'), journeys['admin-people']);
	assert.equal(journeyFor('personnel-detail', 'perfScopedLeader', 'interaction'), journeys['personnel-detail']);
	assert.throws(() => journeyFor('personnel-list', 'perfScopedLeader', 'load'), {
		message: 'personnel-list is not measured as perfScopedLeader.'
	});
	assert.throws(() => journeyFor('briefing-detail-page', 'perfScoped', 'interaction'), {
		message:
			'briefing-detail-page is not applicable to perfScoped: The scoped Group has at most 25 soldiers, so its widest cell fits on one page and has no Next.'
	});
});

test('month labels follow the anchor across a year end', () => {
	assert.deepEqual(monthLabels('2026-11-20'), {
		current: 'November 2026',
		previous: 'October 2026',
		next: 'December 2026',
		quarter: 'November 2026 – January 2027',
		nextQuarter: 'February 2027 – April 2027'
	});
	assert.equal(monthLabels('2027-01-05').previous, 'December 2026');
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
});

test('the roster edit fills MOS in the Quick edit form, saves it and waits for the form to close', () => {
	const terms = { searchTerm: 'Able', edit: { label: 'SPC Able, Alex', original: '68W', alternate: '42A' } };
	const edit = journeys['personnel-edit'];
	const form = { role: 'form', name: 'Quick edit SPC Able, Alex' };
	const prepare = edit.prepare(terms, 0);
	assert.deepEqual(prepare.at(-3), {
		click: {
			role: 'button',
			name: 'Quick edit SPC Able, Alex',
			within: { role: 'row', name: 'SPC Able, Alex', partial: true }
		}
	});
	assert.deepEqual(prepare.at(-2), { wait: ['No changes'] });
	assert.deepEqual(prepare.at(-1), { fill: { role: 'textbox', name: 'MOS', within: form }, value: '42A' });
	assert.deepEqual(edit.trigger(terms), { click: { role: 'button', name: 'Save', within: form } });
	const [useful] = edit.milestones(terms, 0);
	assert.deepEqual(useful.inside, { '[data-roster-row][aria-label$="SPC Able, Alex"]': ['42A'] });
	assert.deepEqual(useful.absentSelector, ['[data-roster-editor]']);
});

test('each detail edit sample waits for the header to show the MOS it saved', () => {
	const terms = { searchTerm: 'Able', edit: { label: 'SPC Able, Alex', original: '68W', alternate: '42A' } };
	const detailEdit = journeys['personnel-detail-edit'];
	const saved = (sample) => detailEdit.prepare(terms, sample).at(-1).value;
	const shown = (sample) => Object.values(detailEdit.milestones(terms, sample)[0].inside).flat();
	assert.deepEqual([0, 1, 5].map(saved), ['42A', '68W', '68W']);
	assert.deepEqual([0, 1, 5].map(shown), [['42A'], ['68W'], ['68W']]);
});

test('the detail journeys open the record through the name link, since a wide row click opens the peek', () => {
	const terms = { searchTerm: 'Able', edit: { label: 'SPC Able, Alex', original: '68W', alternate: '42A' } };
	const link = {
		role: 'link',
		name: 'Able, Alex',
		partial: true,
		within: { role: 'row', name: 'SPC Able, Alex', partial: true }
	};
	assert.deepEqual(journeys['personnel-detail'].trigger(terms), { click: link });
	assert.deepEqual(journeys['personnel-detail-edit'].prepare(terms, 0)[2], { click: link });
});

test('the Dashboard navigation waits for the Dashboard, then the roster, for both actors', () => {
	const navigation = journeyFor('dashboard-navigation', 'perfScoped', 'interaction');
	assert.equal(navigation, journeys['dashboard-navigation']);
	assert.deepEqual(navigation.trigger(), { click: { role: 'link', name: 'Personnel' } });
	assert.deepEqual(navigation.ready()[0].present, ['Coming and going · 7 days']);
	const [useful] = navigation.milestones({ sentinel: 'Sentinel' });
	assert.deepEqual(useful.present, ['Sentinel']);
	assert.deepEqual(useful.inside, { 'nav[aria-label="Current section"]': ['Personnel'] });
});
