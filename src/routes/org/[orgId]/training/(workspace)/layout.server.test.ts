import { describe, expect, it, vi } from 'vitest';
import { createReadyAppShellRouteData, createUrlBlindLayoutEvent } from '../../appShell.test-support';
import { _createTrainingLayoutLoad } from './+layout.server';
import { VIEWER_DAY_DEPENDENCY } from '$lib/utils/viewerTimeZone';

type TrainingLoadEvent = Parameters<ReturnType<typeof _createTrainingLayoutLoad>>[0];

const workspace = { training: { data: Promise.resolve(null as never) } };

describe('Training workspace layout', () => {
	it('streams the workspace without reading the URL, so tab changes reuse it', async () => {
		const stream = vi.fn(async () => workspace);
		const { event, depends } = createUrlBlindLayoutEvent<TrainingLoadEvent>(
			createReadyAppShellRouteData({ orgId: 'org-1' })
		);

		expect(await _createTrainingLayoutLoad({ streamTrainingWorkspace: stream })(event)).toBe(workspace);
		expect(stream).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org-1' }));
		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:training-data', VIEWER_DAY_DEPENDENCY);
	});
});
