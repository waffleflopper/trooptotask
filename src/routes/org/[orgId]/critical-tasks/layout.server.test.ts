import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createReadyAppShellRouteData, createUrlBlindLayoutEvent } from '../appShell.test-support';

const { streamCriticalTasksWorkspaceBootstrapMock } = vi.hoisted(() => ({
	streamCriticalTasksWorkspaceBootstrapMock: vi.fn()
}));

vi.mock('./criticalTasksWorkspace.server', () => ({
	streamCriticalTasksWorkspaceBootstrap: streamCriticalTasksWorkspaceBootstrapMock
}));

import { load } from './+layout.server';

type CriticalTasksLayoutEvent = Parameters<typeof load>[0];

const workspace = { criticalTasks: { data: Promise.resolve(null as never) } };

describe('Critical Tasks workspace layout', () => {
	beforeEach(() => {
		streamCriticalTasksWorkspaceBootstrapMock.mockReset();
		streamCriticalTasksWorkspaceBootstrapMock.mockResolvedValue(workspace);
	});

	it('includes archived tasks for a library configurer without reading the URL', async () => {
		const { event, depends } = createUrlBlindLayoutEvent<CriticalTasksLayoutEvent>(
			createReadyAppShellRouteData({ orgId: 'org-1', role: 'member', criticalTasksCapability: 'configure' })
		);

		expect(await load(event)).toBe(workspace);
		expect(streamCriticalTasksWorkspaceBootstrapMock).toHaveBeenCalledWith(
			expect.objectContaining({ orgId: 'org-1', includeArchivedTasks: true })
		);
		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:critical-tasks-data');
	});

	it('omits archived tasks for a member who cannot configure the library', async () => {
		const { event } = createUrlBlindLayoutEvent<CriticalTasksLayoutEvent>(
			createReadyAppShellRouteData({ orgId: 'org-1', role: 'member', criticalTasksCapability: 'view' })
		);

		await load(event);

		expect(streamCriticalTasksWorkspaceBootstrapMock).toHaveBeenCalledWith(
			expect.objectContaining({ includeArchivedTasks: false })
		);
	});
});
