import { describe, expect, it } from 'vitest';
import { createOrganizationLoadEventData, createReadyAppShellRouteData } from '../appShell.test-support';
import { load } from './+layout.server';
import { load as loadStep } from './[step]/+page.server';
import type { RankService } from '$features/personnel/contracts';
import { setupBranchSchema } from '$features/organization/contracts';

describe('Organization setup routes', () => {
	it('returns 403 to a member even when every feature lane is configure', async () => {
		await expect(
			load({
				...createOrganizationLoadEventData(createReadyAppShellRouteData({ role: 'member' })),
				depends() {}
			} as never)
		).rejects.toMatchObject({ status: 403 });
	});

	it('rejects a slug outside the registry and identifies a valid feature step', async () => {
		await expect(loadStep({ params: { step: 'not-a-step' } } as never)).rejects.toMatchObject({ status: 404 });
		await expect(loadStep({ params: { step: 'events-and-taskings' } } as never)).resolves.toEqual({
			setupStepKey: 'eventsAndTaskings'
		});
	});

	it('accepts exactly the Personnel rank services at the delivery boundary', () => {
		const services = [
			'army',
			'navy',
			'air-force',
			'marine-corps',
			'coast-guard',
			'space-force',
			'civilian',
			'custom'
		] satisfies RankService[];
		const parsed: RankService[] = services.map((service) => setupBranchSchema.parse(service));
		expect(parsed).toEqual([
			'army',
			'navy',
			'air-force',
			'marine-corps',
			'coast-guard',
			'space-force',
			'civilian',
			'custom'
		]);
		expect(setupBranchSchema.safeParse('joint').success).toBe(false);
	});
});
