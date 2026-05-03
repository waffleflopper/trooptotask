import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
	loadWithContextMock,
	fetchRosterHistoryMock,
	canAccessAdvancedDutyMock,
	listAdvancedDutyRevisionHistoryMock,
	listDutyTemplatesMock,
	listDutyEventsForCalendarMock,
	listVisibleAdvancedDutyRunSnapshotSummariesMock,
	mockCtx
} = vi.hoisted(() => ({
	loadWithContextMock: vi.fn(),
	fetchRosterHistoryMock: vi.fn(),
	canAccessAdvancedDutyMock: vi.fn(),
	listAdvancedDutyRevisionHistoryMock: vi.fn(),
	listDutyTemplatesMock: vi.fn(),
	listDutyEventsForCalendarMock: vi.fn(),
	listVisibleAdvancedDutyRunSnapshotSummariesMock: vi.fn(),
	mockCtx: {
		auth: {
			isPrivileged: false,
			requireView: vi.fn()
		}
	}
}));

vi.mock('$lib/server/adapters/httpAdapter', () => ({
	loadWithContext: loadWithContextMock
}));

vi.mock('$lib/server/core/useCases/rosterHistoryQuery', () => ({
	fetchRosterHistory: fetchRosterHistoryMock
}));

vi.mock('$lib/server/core/useCases/advancedDutyAccess', () => ({
	canAccessAdvancedDuty: canAccessAdvancedDutyMock
}));

vi.mock('$lib/server/core/useCases/advancedDutyRevisionDrafts', () => ({
	listAdvancedDutyRevisionHistory: listAdvancedDutyRevisionHistoryMock
}));

vi.mock('$lib/server/core/useCases/dutyTemplateCrud', () => ({
	listDutyTemplates: listDutyTemplatesMock
}));

vi.mock('$lib/server/core/useCases/dutyEventCrud', () => ({
	listDutyEventsForCalendar: listDutyEventsForCalendarMock,
	listVisibleAdvancedDutyRunSnapshotSummaries: listVisibleAdvancedDutyRunSnapshotSummariesMock
}));

import { load } from './+page.server';

describe('duty roster page load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		loadWithContextMock.mockImplementation(async (_locals, _cookies, _orgId, config) => config.fn(mockCtx));
		fetchRosterHistoryMock.mockResolvedValue(['history-item']);
		listDutyEventsForCalendarMock.mockResolvedValue([{ id: 'event-item', runId: 'run-1' }]);
		listAdvancedDutyRevisionHistoryMock.mockResolvedValue(['revision-item']);
		listDutyTemplatesMock.mockResolvedValue(['template-item']);
		listVisibleAdvancedDutyRunSnapshotSummariesMock.mockResolvedValue(['snapshot-item']);
	});

	it('loads advanced duty events for calendar users even without advanced duty template access', async () => {
		canAccessAdvancedDutyMock.mockReturnValue(false);

		const result = await load({ params: { orgId: 'test-org' }, locals: {}, cookies: {} } as never);

		expect(listDutyEventsForCalendarMock).toHaveBeenCalledWith(mockCtx);
		expect(listAdvancedDutyRevisionHistoryMock).toHaveBeenCalledWith(mockCtx, { appliedRunIds: ['run-1'] });
		expect(listDutyTemplatesMock).not.toHaveBeenCalled();
		expect(listVisibleAdvancedDutyRunSnapshotSummariesMock).not.toHaveBeenCalled();
		expect(result).toEqual({
			rosterHistory: ['history-item'],
			advancedDutyEvents: [{ id: 'event-item', runId: 'run-1' }],
			advancedDutyTemplates: [],
			advancedDutySnapshots: [],
			advancedDutyRevisionHistory: ['revision-item']
		});
	});

	it('loads advanced duty templates and visible snapshots when advanced duty access is allowed', async () => {
		canAccessAdvancedDutyMock.mockReturnValue(true);

		const result = await load({ params: { orgId: 'test-org' }, locals: {}, cookies: {} } as never);

		expect(listDutyEventsForCalendarMock).toHaveBeenCalledWith(mockCtx);
		expect(listDutyTemplatesMock).toHaveBeenCalledWith(mockCtx);
		expect(listVisibleAdvancedDutyRunSnapshotSummariesMock).toHaveBeenCalledWith(mockCtx);
		expect(listAdvancedDutyRevisionHistoryMock).toHaveBeenCalledWith(mockCtx, { appliedRunIds: ['run-1'] });
		expect(result).toEqual({
			rosterHistory: ['history-item'],
			advancedDutyEvents: [{ id: 'event-item', runId: 'run-1' }],
			advancedDutyTemplates: ['template-item'],
			advancedDutySnapshots: ['snapshot-item'],
			advancedDutyRevisionHistory: ['revision-item']
		});
	});
});
