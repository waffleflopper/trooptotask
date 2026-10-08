import { describe, expect, it } from 'vitest';
import {
	createReadyAppShellRouteData,
	createSuspendedAppShellRouteData,
	createUrlBlindLayoutEvent
} from '../appShell.test-support';
import { load } from './+layout.server';

type TrainingAdmissionEvent = Parameters<typeof load>[0];

describe('Training admission layout', () => {
	it('admits a ready Organization without loading workspace data', async () => {
		const { event, depends } = createUrlBlindLayoutEvent<TrainingAdmissionEvent>(createReadyAppShellRouteData());

		expect(await load(event)).toEqual({});
		expect(depends).toHaveBeenCalledWith('app:org-core');
	});

	it('keeps Reports and the workspace behind ready-shell admission for a suspended Organization', async () => {
		const { event } = createUrlBlindLayoutEvent<TrainingAdmissionEvent>(createSuspendedAppShellRouteData());

		await expect(load(event)).rejects.toMatchObject({ status: 403 });
	});
});
