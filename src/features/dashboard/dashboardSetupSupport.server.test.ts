import { describe, expect, it } from 'vitest';
import type { StarterConfigurationPackSupport } from './contracts';
import { fetchDashboardSetupSupport, type DashboardSetupSupportReader } from './dashboardSetupSupport.server';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

function heldSources() {
	const training = deferred<number>();
	const onboarding = deferred<number>();
	const rating = deferred<number>();
	const membership = deferred<number>();
	const packs = deferred<StarterConfigurationPackSupport[]>();
	const started = new Set<string>();
	const reader: DashboardSetupSupportReader = {
		countTrainingTypes() {
			started.add('training');
			return training.promise;
		},
		countOnboardingTemplateSteps() {
			started.add('onboarding');
			return onboarding.promise;
		},
		countRatingSchemeEntries() {
			started.add('rating');
			return rating.promise;
		},
		countOrganizationMembers() {
			started.add('membership');
			return membership.promise;
		},
		listStarterConfigurationPacks() {
			started.add('packs');
			return packs.promise;
		}
	};
	return { reader, started, training, onboarding, rating, membership, packs };
}

describe('Dashboard setup support composition', () => {
	it('starts every independent source before any finishes and preserves counts and starter-pack policy meaning', async () => {
		const sources = heldSources();
		const pending = fetchDashboardSetupSupport(sources.reader);
		expect(sources.started).toEqual(new Set(['training', 'onboarding', 'rating', 'membership', 'packs']));
		sources.rating.resolve(7);
		sources.membership.resolve(13);
		sources.onboarding.resolve(0);
		sources.packs.resolve([
			{
				id: 'first-week-operations',
				name: 'First week operations',
				description: 'Editable starter definitions',
				editableCopy: 'Change these definitions after applying',
				artifacts: [
					{ family: 'training-types', label: 'Training', names: ['Safety brief'], description: 'Starter training' }
				],
				readiness: [
					{
						family: 'training-types',
						label: 'Training',
						configured: true,
						starterArtifactCount: 1,
						expectedArtifactCount: 1,
						existingStarterArtifactNames: ['Safety brief']
					}
				],
				canApply: false,
				deniedActions: [
					{ id: 'training.configure', label: 'Configure Training', reasonCode: 'denied:missing-capability' }
				],
				isFullyApplied: false
			}
		]);
		sources.training.resolve(2);
		const result = await pending;
		expect(result).toMatchObject({
			trainingTypeCount: 2,
			onboardingTemplateStepCount: 0,
			ratingSchemeEntryCount: 7,
			orgMemberCount: 13
		});
		expect(result.starterConfigurationPacks).toMatchObject([
			{
				id: 'first-week-operations',
				artifacts: [{ family: 'training-types', names: ['Safety brief'] }],
				readiness: [
					{
						configured: true,
						starterArtifactCount: 1,
						expectedArtifactCount: 1,
						existingStarterArtifactNames: ['Safety brief']
					}
				],
				canApply: false,
				deniedActions: [{ id: 'training.configure', reasonCode: 'denied:missing-capability' }],
				isFullyApplied: false
			}
		]);
	});

	it('returns the five-key empty setup result without introducing Identity dismissal state', async () => {
		const result = await fetchDashboardSetupSupport({
			countTrainingTypes: async () => 0,
			countOnboardingTemplateSteps: async () => 0,
			countRatingSchemeEntries: async () => 0,
			countOrganizationMembers: async () => 0,
			listStarterConfigurationPacks: async () => []
		});
		expect(result).toEqual({
			trainingTypeCount: 0,
			onboardingTemplateStepCount: 0,
			ratingSchemeEntryCount: 0,
			orgMemberCount: 0,
			starterConfigurationPacks: []
		});
	});

	it.each(['training', 'onboarding', 'rating', 'membership', 'packs'] as const)(
		'rejects a failed %s source while other support reads are pending',
		async (source) => {
			const sources = heldSources();
			const pending = fetchDashboardSetupSupport(sources.reader);
			const failure = new Error(`${source} unavailable`);
			const rejected = expect(pending).rejects.toBe(failure);
			sources[source].reject(failure);
			await rejected;
			sources.training.resolve(0);
			sources.onboarding.resolve(0);
			sources.rating.resolve(0);
			sources.membership.resolve(0);
			sources.packs.resolve([]);
		}
	);
});
