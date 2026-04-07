import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
	loadWithContextMock,
	fetchRosterHistoryMock,
	canAccessAdvancedDutyMock,
	listDutyTemplatesMock,
	listDutyEventsForCalendarMock,
	mockCtx
} = vi.hoisted(() => ({
	loadWithContextMock: vi.fn(),
	fetchRosterHistoryMock: vi.fn(),
	canAccessAdvancedDutyMock: vi.fn(),
	listDutyTemplatesMock: vi.fn(),
	listDutyEventsForCalendarMock: vi.fn(),
	mockCtx: {
		auth: {
			isPrivileged: false,
			isFullEditor: false,
			scopedGroupId: null,
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

vi.mock('$lib/server/core/useCases/dutyTemplateCrud', () => ({
	listDutyTemplates: listDutyTemplatesMock
}));

vi.mock('$lib/server/core/useCases/dutyEventCrud', () => ({
	listDutyEventsForCalendar: listDutyEventsForCalendarMock
}));

import { load } from './+page.server';

describe('duty roster page load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		loadWithContextMock.mockImplementation(async (_locals, _cookies, _orgId, config) => config.fn(mockCtx));
		fetchRosterHistoryMock.mockResolvedValue(['history-item']);
		listDutyEventsForCalendarMock.mockResolvedValue(['event-item']);
		listDutyTemplatesMock.mockResolvedValue(['template-item']);
	});

	it('loads advanced duty events for calendar users even without advanced duty template access', async () => {
		canAccessAdvancedDutyMock.mockReturnValue(false);

		const result = await load({ params: { orgId: 'test-org' }, locals: {}, cookies: {} } as never);

		expect(listDutyEventsForCalendarMock).toHaveBeenCalledWith(mockCtx);
		expect(listDutyTemplatesMock).not.toHaveBeenCalled();
		expect(result).toEqual({
			rosterHistory: ['history-item'],
			advancedDutyEvents: ['event-item'],
			advancedDutyTemplates: []
		});
	});
});
