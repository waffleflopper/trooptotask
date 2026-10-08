import { describe, expect, it, vi } from 'vitest';
import { createReadyAppShellRouteData, createUrlBlindLayoutEvent } from '../appShell.test-support';

const { streamCalendarWorkspaceBootstrapMock } = vi.hoisted(() => ({
	streamCalendarWorkspaceBootstrapMock: vi.fn()
}));

vi.mock('./calendarWorkspaceDelivery.server', () => ({
	streamCalendarWorkspaceBootstrap: streamCalendarWorkspaceBootstrapMock
}));

import { load } from './+layout.server';

type CalendarLayoutEvent = Parameters<typeof load>[0];

describe('Calendar workspace layout', () => {
	it('streams the workspace without reading the URL, so tab changes reuse it', async () => {
		const workspace = { calendar: { data: Promise.resolve(null as never) } };
		streamCalendarWorkspaceBootstrapMock.mockResolvedValue(workspace);
		const { event, depends } = createUrlBlindLayoutEvent<CalendarLayoutEvent>(
			createReadyAppShellRouteData({ orgId: 'org-1' })
		);

		expect(await load(event)).toBe(workspace);
		expect(streamCalendarWorkspaceBootstrapMock).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org-1' }));
		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:calendar-data');
	});
});
