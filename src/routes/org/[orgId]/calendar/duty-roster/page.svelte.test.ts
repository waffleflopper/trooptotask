// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
import type { CalendarBootstrap } from '$lib/server/core/useCases/calendarQuery';
import type { AdvancedDutyRunSnapshotRecord } from '$features/duty-roster/duty-roster.types';

vi.mock('$features/duty-roster/components/DutyRosterPage.svelte', async () => ({
	default: (await import('$features/duty-roster/components/test-stubs/DutyRosterPageDataHarness.svelte')).default
}));

import Page from './+page.svelte';

function makeBootstrap(): WorkspaceBootstrap<CalendarBootstrap> {
	return {
		workspace: 'calendar',
		data: {
			rangeStart: '2026-05-01',
			rangeEnd: '2026-05-31',
			availabilityEntries: [],
			specialDays: [],
			assignmentTypes: [],
			dailyAssignments: [],
			pinnedGroups: [],
			advancedDutyEvents: [],
			personnel: [],
			groups: [],
			statusTypes: [],
			activeOnboardingPersonnelIds: [],
			lossWarningWindowDays: 180
		}
	};
}

function makeSnapshot(): AdvancedDutyRunSnapshotRecord {
	return {
		id: 'snapshot-draft-1',
		orgId: 'org-1',
		templateId: 'template-1',
		templateName: 'CQ',
		pattern: 'daily',
		startDate: '2026-05-02',
		endDate: '2026-05-02',
		eventCount: 1,
		eventDates: ['2026-05-02'],
		candidatePersonnelIds: [],
		draftLineageKey: 'lineage-1',
		snapshotFingerprint: 'fingerprint-1',
		snapshotVersion: 1,
		status: 'draft',
		inputPayload: {},
		snapshotPayload: {},
		previewPayload: {},
		exportModel: null,
		createdByUserId: 'user-1',
		appliedRunId: null,
		applyError: null,
		expiresAt: '2026-05-03T00:00:00.000Z',
		appliedAt: null,
		createdAt: '2026-05-02T00:00:00.000Z',
		updatedAt: '2026-05-02T00:00:00.000Z'
	};
}

describe('duty roster page', () => {
	beforeEach(() => {
		cleanup();
	});

	it('passes advanced duty snapshots from the page load into the duty roster page', () => {
		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Test Org',
					calendar: { data: makeBootstrap() },
					rosterHistory: [],
					advancedDutyTemplates: [],
					advancedDutyEvents: [],
					advancedDutySnapshots: [makeSnapshot()],
					advancedDutyRevisionHistory: [],
					advancedDutyRevisionDrafts: []
				}
			}
		});

		expect(screen.getByTestId('snapshot-count').textContent).toBe('1');
		expect(screen.getByTestId('snapshot-ids').textContent).toBe('snapshot-draft-1');
	});
});
