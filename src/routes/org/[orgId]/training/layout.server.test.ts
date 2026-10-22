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

	it('stops every Training route at the off state when the fresh switch is off and the shell still shows it on', async () => {
		const { event } = createUrlBlindLayoutEvent<TrainingAdmissionEvent>(createReadyAppShellRouteData(), {
			disabledFeatures: ['training']
		});

		await expect(load(event)).rejects.toMatchObject({
			status: 403,
			body: {
				message:
					'This organization has turned off Training. Speak with the organization owner to have it turned back on.',
				featureOff: 'training'
			}
		});
	});

	it('keeps Training open while only another feature is off', async () => {
		const { event } = createUrlBlindLayoutEvent<TrainingAdmissionEvent>(createReadyAppShellRouteData(), {
			disabledFeatures: ['onboarding']
		});

		expect(await load(event)).toEqual({});
	});

	it('keeps Reports and the workspace behind ready-shell admission for a suspended Organization', async () => {
		const { event } = createUrlBlindLayoutEvent<TrainingAdmissionEvent>(createSuspendedAppShellRouteData());

		await expect(load(event)).rejects.toMatchObject({ status: 403 });
	});
});
