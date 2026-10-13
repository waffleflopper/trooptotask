import { describe, expect, it } from 'vitest';
import type {
	OnboardingStepProgress,
	OnboardingTemplate,
	OnboardingTemplateStep,
	PersonnelOnboarding
} from './onboarding.types';
import { buildPacketMatrix, describeCell, stepHeadline } from './onboardingMatrix';
import type { Today } from './onboardingStatus';

const TODAY: Today = { date: '2026-10-13', timeZone: 'America/New_York' };

const standard: OnboardingTemplate = {
	id: 'standard',
	orgId: 'org',
	name: 'Standard',
	description: null,
	createdAt: null
};
const reserve: OnboardingTemplate = {
	id: 'reserve',
	orgId: 'org',
	name: 'Reserve',
	description: null,
	createdAt: null
};
const emptyTemplate: OnboardingTemplate = {
	id: 'empty',
	orgId: 'org',
	name: 'Empty',
	description: null,
	createdAt: null
};

function templateStep(
	id: string,
	templateId: string,
	sortOrder: number,
	overrides: Partial<OnboardingTemplateStep> = {}
): OnboardingTemplateStep {
	return {
		id,
		templateId,
		name: id,
		description: null,
		stepType: 'checkbox',
		trainingTypeId: null,
		stages: null,
		sortOrder,
		...overrides
	};
}

const STAGES = ['Submitted', 'At Finance', 'Confirmed'];

const templateSteps: OnboardingTemplateStep[] = [
	templateStep('brief', 'standard', 0),
	templateStep('finance', 'standard', 1, { name: 'Finance', stepType: 'paperwork', stages: STAGES }),
	templateStep('sharp', 'standard', 2, { name: 'SHARP', stepType: 'training' }),
	templateStep('badge', 'reserve', 0)
];

function progress(templateStepId: string, overrides: Partial<OnboardingStepProgress> = {}): OnboardingStepProgress {
	const source = templateSteps.find((candidate) => candidate.id === templateStepId)!;
	return {
		id: `step-${templateStepId}`,
		onboardingId: 'packet',
		stepName: source.name,
		stepType: source.stepType,
		trainingTypeId: null,
		stages: source.stages,
		sortOrder: source.sortOrder,
		completed: false,
		currentStage: null,
		notes: [],
		templateStepId,
		active: true,
		progressChangedAt: '2026-10-13T12:00:00.000Z',
		...overrides
	};
}

function packet(
	id: string,
	startedAt: string,
	templateId: string | null,
	steps: OnboardingStepProgress[]
): PersonnelOnboarding {
	return {
		id,
		personnelId: `person-${id}`,
		startedAt,
		completedAt: null,
		cancelledAt: null,
		status: 'in_progress',
		templateId,
		steps: steps.map((candidate) => ({ ...candidate, id: `${id}-${candidate.id}`, onboardingId: id }))
	};
}

const SIX_DAYS = '2026-10-07T12:00:00.000Z';
const SEVEN_DAYS = '2026-10-06T12:00:00.000Z';

function build(packets: PersonnelOnboarding[]) {
	return buildPacketMatrix(packets, [standard, reserve, emptyTemplate], templateSteps, TODAY);
}

describe('packet matrix grids', () => {
	it('builds one grid per template with packets, the busiest template first', () => {
		const matrix = build([
			packet('r1', '2026-10-01', 'reserve', [progress('badge')]),
			packet('s1', '2026-10-02', 'standard', [progress('brief'), progress('finance'), progress('sharp')]),
			packet('s2', '2026-10-03', 'standard', [progress('brief'), progress('finance'), progress('sharp')])
		]);

		expect(matrix.grids.map((grid) => [grid.template.name, grid.rows.length, grid.columns.map((c) => c.name)])).toEqual(
			[
				['Standard', 2, ['brief', 'Finance', 'SHARP']],
				['Reserve', 1, ['badge']]
			]
		);
	});

	it('breaks a tie in packet count by template name', () => {
		const matrix = build([
			packet('r1', '2026-10-01', 'reserve', [progress('badge')]),
			packet('s1', '2026-10-02', 'standard', [progress('brief')])
		]);

		expect(matrix.grids.map((grid) => grid.template.name)).toEqual(['Reserve', 'Standard']);
	});

	it('lists the oldest start first and breaks a tie by packet id', () => {
		const matrix = build([
			packet('b', '2026-10-05', 'standard', [progress('brief')]),
			packet('c', '2026-10-01', 'standard', [progress('brief')]),
			packet('a', '2026-10-05', 'standard', [progress('brief')])
		]);

		expect(matrix.grids[0].rows.map((row) => row.summary.packet.id)).toEqual(['c', 'a', 'b']);
	});

	it('orders columns by template step order whatever order the steps load in', () => {
		const matrix = buildPacketMatrix(
			[packet('s1', '2026-10-01', 'standard', [progress('brief')])],
			[standard],
			[...templateSteps].reverse(),
			TODAY
		);

		expect(matrix.grids[0].columns.map((column) => column.id)).toEqual(['brief', 'finance', 'sharp']);
	});

	it('counts packets with no template, or a template that is gone, outside every grid', () => {
		const matrix = build([
			packet('none', '2026-10-01', null, [progress('brief')]),
			packet('gone', '2026-10-01', 'deleted', [progress('brief')]),
			packet('s1', '2026-10-02', 'standard', [progress('brief')])
		]);

		expect(matrix.withoutTemplate).toBe(2);
		expect(matrix.grids.flatMap((grid) => grid.rows.map((row) => row.summary.packet.id))).toEqual(['s1']);
	});

	it('is empty when there are no packets', () => {
		expect(build([])).toEqual({ grids: [], withoutTemplate: 0 });
	});
});

describe('matrix cells', () => {
	it('shows done, open, a reached stage and a missing step', () => {
		const matrix = build([
			packet('s1', '2026-10-01', 'standard', [
				progress('brief', { completed: true }),
				progress('finance', { currentStage: 'At Finance', progressChangedAt: SIX_DAYS })
			])
		]);

		const cells = matrix.grids[0].rows[0].cells;
		expect(cells.map((cell) => cell.kind)).toEqual(['done', 'stage', 'missing']);
		expect(cells[1]).toMatchObject({ stage: 'At Finance', index: 2, of: 3, days: 6, stalled: false });
	});

	it('stalls a paperwork cell at exactly seven days and not at six', () => {
		const at = (changedAt: string) =>
			build([
				packet('s1', '2026-10-01', 'standard', [
					progress('finance', { currentStage: 'Submitted', progressChangedAt: changedAt })
				])
			]).grids[0].rows[0].cells[1];

		expect(at(SIX_DAYS)).toMatchObject({ kind: 'stage', days: 6, stalled: false });
		expect(at(SEVEN_DAYS)).toMatchObject({ kind: 'stage', days: 7, stalled: true });
	});

	it('shows an empty box for paperwork that has reached no stage, however long it waited', () => {
		const matrix = build([
			packet('s1', '2026-10-01', 'standard', [
				progress('finance', { currentStage: null, progressChangedAt: '2026-09-01T12:00:00.000Z' })
			])
		]);

		expect(matrix.grids[0].rows[0].cells[1].kind).toBe('open');
		expect(matrix.grids[0].columns[1].stalled).toBe(0);
	});

	it('shows an empty box when the current stage left the template', () => {
		const matrix = build([
			packet('s1', '2026-10-01', 'standard', [progress('finance', { currentStage: 'Retired stage' })])
		]);

		expect(matrix.grids[0].rows[0].cells[1].kind).toBe('open');
	});

	it('never stalls a checkbox or training step', () => {
		const matrix = build([
			packet('s1', '2026-10-01', 'standard', [
				progress('brief', { progressChangedAt: '2026-08-01T12:00:00.000Z' }),
				progress('sharp', { progressChangedAt: '2026-08-01T12:00:00.000Z' })
			])
		]);

		expect(matrix.grids[0].rows[0].cells.map((cell) => cell.kind)).toEqual(['open', 'missing', 'open']);
		expect(matrix.grids[0].columns.map((column) => column.stalled)).toEqual([0, 0, 0]);
	});

	it('ignores a step that left the template when matching a column', () => {
		const matrix = build([
			packet('s1', '2026-10-01', 'standard', [progress('brief', { active: false, completed: true })])
		]);

		expect(matrix.grids[0].rows[0].cells[0].kind).toBe('missing');
	});
});

describe('matrix rows and footer', () => {
	const packets = [
		packet('santos', '2026-09-17', 'standard', [
			progress('brief', { completed: true }),
			progress('finance', { currentStage: 'At Finance', progressChangedAt: SEVEN_DAYS }),
			progress('sharp')
		]),
		packet('brooks', '2026-09-24', 'standard', [
			progress('brief'),
			progress('finance', { currentStage: 'Submitted', progressChangedAt: '2026-10-01T12:00:00.000Z' }),
			progress('sharp')
		]),
		packet('diallo', '2026-09-25', 'standard', [
			progress('brief', { completed: true }),
			progress('finance', { completed: true, currentStage: 'Confirmed' }),
			progress('sharp', { completed: true })
		]),
		packet('lee', '2026-10-10', 'standard', [
			progress('brief', { completed: true }),
			progress('finance'),
			progress('sharp')
		])
	];

	it('collapses a packet whose steps are all done into a ready row', () => {
		const rows = build(packets).grids[0].rows;

		expect(rows.map((row) => [row.summary.packet.id, row.ready])).toEqual([
			['santos', false],
			['brooks', false],
			['diallo', true],
			['lee', false]
		]);
	});

	it('counts Soldiers open on each step and the stalled ones, leaving done and ready rows out', () => {
		const columns = build(packets).grids[0].columns;

		expect(columns.map((column) => [column.name, column.open, column.stalled])).toEqual([
			['brief', 1, 0],
			['Finance', 3, 2],
			['SHARP', 3, 0]
		]);
	});

	it('counts a missing step as neither open nor stalled', () => {
		const columns = build([
			packet('s1', '2026-10-01', 'standard', [progress('brief')]),
			packet('s2', '2026-10-01', 'standard', [progress('brief')])
		]).grids[0].columns;

		expect(columns.map((column) => column.open)).toEqual([2, 0, 0]);
	});
});

describe('matrix wording', () => {
	it('describes each cell by step and state', () => {
		const stage = { kind: 'stage', stage: 'At Finance', index: 2, of: 3, days: 12, stalled: true } as const;
		const step = progress('finance');

		expect(describeCell({ kind: 'done', step }, 'Brief')).toBe('Brief: done');
		expect(describeCell({ kind: 'open', step }, 'Brief')).toBe('Brief: open');
		expect(describeCell({ ...stage, step }, 'Finance')).toBe('Finance: At Finance, stage 2 of 3, 12 days, stalled');
		expect(describeCell({ ...stage, days: 1, stalled: false, step }, 'Finance')).toBe(
			'Finance: At Finance, stage 2 of 3, 1 day'
		);
		expect(describeCell({ kind: 'missing' }, 'SHARP')).toBe('SHARP: not on this packet yet');
	});

	it('headlines a step by where it stands', () => {
		expect(
			stepHeadline(
				progress('finance', { currentStage: 'At Finance', progressChangedAt: '2026-10-01T12:00:00.000Z' }),
				TODAY
			)
		).toBe('At Finance for 12 days');
		expect(
			stepHeadline(
				progress('finance', { currentStage: 'At Finance', progressChangedAt: '2026-10-12T12:00:00.000Z' }),
				TODAY
			)
		).toBe('At Finance for 1 day');
		expect(stepHeadline(progress('finance'), TODAY)).toBe('Not started');
		expect(stepHeadline(progress('sharp'), TODAY)).toBe('Waiting on training record');
		expect(stepHeadline(progress('brief'), TODAY)).toBe('Open');
		expect(stepHeadline(progress('brief', { completed: true }), TODAY)).toBe('Done');
	});
});
