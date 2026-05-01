import { describe, expect, it, vi } from 'vitest';
import {
	addCalendarDays,
	buildDutyPacketMarkup,
	buildDutyPacketSeriesMarkup,
	getTodayDate,
	wrapSinglePreview
} from './dutyRosterWizard.helpers';
import type { DutyEventPreview } from '../duty-roster.types';
import type { TeamDutyPacketExportModel } from '../advanced-run/advancedDutyRun';

describe('dutyRosterWizard.helpers date helpers', () => {
	it('adds calendar days without shifting across UTC boundaries', () => {
		expect(addCalendarDays('2026-04-10', 1)).toBe('2026-04-11');
		expect(addCalendarDays('2026-04-01', -1)).toBe('2026-03-31');
	});

	it('returns the local calendar date instead of the UTC iso date', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 3, 7, 23, 45, 0));

		expect(getTodayDate()).toBe('2026-04-07');

		vi.useRealTimers();
	});

	it('formats team duty packet markup from the export model without rebuilding slot explanations', () => {
		const exportModel: TeamDutyPacketExportModel = {
			status: 'preview',
			statusLabel: 'Preview - not applied',
			templateName: 'CQ',
			eventDate: '2026-04-10',
			coverage: {
				mode: 'all-day',
				start: '2026-04-10T00:00:00',
				end: '2026-04-10T23:59:59',
				label: 'All day'
			},
			isBlocking: true,
			fillSummary: { totalSlots: 2, filledSlots: 1, unfilledSlots: 1 },
			collisionNotes: ['SSG Hartney is already covering Staff Duty during this window.'],
			slotAssignments: [
				{
					templateSlotId: 'slot-runner',
					roleLabel: 'Runner',
					slotIndex: 0,
					assignee: {
						id: 'person-nco',
						label: 'SGT Nolan',
						displayName: 'SGT Nolan, Casey',
						rank: 'SGT',
						firstName: 'Casey',
						lastName: 'Nolan'
					},
					assignmentSource: 'generated',
					warningState: 'none',
					warnings: [],
					explanations: ['Snapshot-selected explanation.']
				},
				{
					templateSlotId: 'slot-nco',
					roleLabel: 'NCO',
					slotIndex: 1,
					assignee: null,
					assignmentSource: 'manual',
					warningState: 'conflict',
					warnings: ['SSG Hartney is already covering Staff Duty during this window.'],
					explanations: ['Snapshot-cleared explanation.']
				}
			]
		};

		const markup = buildDutyPacketMarkup(exportModel);

		expect(markup).toContain('Preview - not applied');
		expect(markup).toContain('CQ');
		expect(markup).toContain('Apr 10, 2026');
		expect(markup).toContain('All day');
		expect(markup).toContain('1/2 filled');
		expect(markup).toContain('Runner #1');
		expect(markup).toContain('SGT Nolan');
		expect(markup).toContain('Snapshot-selected explanation.');
		expect(markup).toContain('Snapshot-cleared explanation.');
		expect(markup).toContain('SSG Hartney is already covering Staff Duty during this window.');
	});

	it('formats a preview-only series duty packet without changing applied status language', () => {
		const baseModel: TeamDutyPacketExportModel = {
			status: 'preview',
			statusLabel: 'Preview - not applied',
			templateName: 'CQ',
			eventDate: '2026-04-10',
			coverage: {
				mode: 'all-day',
				start: '2026-04-10T00:00:00',
				end: '2026-04-10T23:59:59',
				label: 'All day'
			},
			isBlocking: true,
			fillSummary: { totalSlots: 1, filledSlots: 1, unfilledSlots: 0 },
			collisionNotes: [],
			slotAssignments: [
				{
					templateSlotId: 'slot-runner',
					roleLabel: 'Runner',
					slotIndex: 0,
					assignee: {
						id: 'person-nco',
						label: 'SGT Nolan',
						displayName: 'SGT Nolan, Casey',
						rank: 'SGT',
						firstName: 'Casey',
						lastName: 'Nolan'
					},
					assignmentSource: 'generated',
					warningState: 'none',
					warnings: [],
					explanations: ['Snapshot-selected explanation.']
				}
			]
		};

		const markup = buildDutyPacketSeriesMarkup([
			baseModel,
			{
				...baseModel,
				eventDate: '2026-04-11',
				slotAssignments: [
					{
						...baseModel.slotAssignments[0],
						roleLabel: 'NCO',
						assignee: null,
						warningState: 'warning',
						warnings: ['Review this unfilled slot before apply.']
					}
				]
			}
		]);

		expect(markup).toContain('CQ Team Duty Packet');
		expect(markup).toContain('Preview-only export');
		expect(markup).toContain('Preview - not applied');
		expect(markup).toContain('Apr 10, 2026');
		expect(markup).toContain('Apr 11, 2026');
		expect(markup).toContain('Review this unfilled slot before apply.');
		expect(markup).not.toContain('Status: Applied');
	});

	it('preserves snapshot metadata when wrapping a one-time preview for the shared preview panel', () => {
		const preview = {
			snapshotId: 'snapshot-single-1',
			snapshotFingerprint: 'fingerprint-single-1',
			snapshotVersion: 1,
			templateId: 'template-1',
			templateName: 'CQ',
			eventDate: '2026-04-10'
		} as unknown as DutyEventPreview;

		expect(wrapSinglePreview(preview)).toMatchObject({
			snapshotId: 'snapshot-single-1',
			snapshotFingerprint: 'fingerprint-single-1',
			snapshotVersion: 1
		});
	});
});
