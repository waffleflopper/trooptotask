import type { OrganizationSupportReader } from '$features/organization/contracts';
import type { PersonnelSupportReader } from '$features/personnel/contracts';
import type { CalendarSupportReader } from '$features/calendar/contracts';
import type { OnboardingSupportReader } from '$features/onboarding/contracts';
import type { TrainingSupportReader } from '$features/training/contracts';
import type { RatingSchemeSupportReader } from '$features/rating-scheme/contracts';
import type {
	PlatformActivationHealth,
	PlatformActivationHealthDependencies,
	PlatformActivationHealthStore,
	PlatformActivationOrganizationFacts,
	PlatformActivationSetupCounts
} from '../activationHealthTypes';
import { degradedActivationHealthSummary, mapActivationHealthSummary } from '../activationHealth';

interface PlatformActivationSourceReaders {
	organizations: Pick<
		OrganizationSupportReader,
		'listLatestOrganizations' | 'countMembershipsByOrganization' | 'countLeaderMembershipsByOrganization'
	>;
	personnel: Pick<PersonnelSupportReader, 'countActivePersonnelByOrganization'>;
	calendar: CalendarSupportReader;
	onboarding: OnboardingSupportReader;
	training: TrainingSupportReader;
	ratingScheme: RatingSchemeSupportReader;
}

const EMPTY_COUNTS: PlatformActivationSetupCounts = {
	activePersonnel: 0,
	members: 0,
	leaderMembers: 0,
	statusTypes: 0,
	assignmentTypes: 0,
	onboardingTemplateSteps: 0,
	trainingTypes: 0,
	ratingSchemeEntries: 0
};

/** Compose declared source facts; source owners keep table/RPC access and predicates. */
export function createPlatformActivationHealthStore(
	readers: PlatformActivationSourceReaders
): PlatformActivationHealthStore {
	return {
		async listActivationOrganizationFacts({ limit }) {
			const candidates = await readers.organizations.listLatestOrganizations({ limit });
			const facts = candidates.map(
				(row): PlatformActivationOrganizationFacts => ({
					organizationId: row.id,
					organizationName: row.name,
					organizationCreatedAt: row.created_at,
					counts: { ...EMPTY_COUNTS }
				})
			);
			const ids = facts.map((row) => row.organizationId);
			if (ids.length === 0) return [];
			const [personnel, members, leaders, calendar, onboarding, training, rating] = await Promise.all([
				readers.personnel.countActivePersonnelByOrganization(ids),
				readers.organizations.countMembershipsByOrganization(ids),
				readers.organizations.countLeaderMembershipsByOrganization(ids),
				readers.calendar.countCatalogsByOrganization(ids),
				readers.onboarding.countTemplateStepsByOrganization(ids),
				readers.training.countTrainingTypesByOrganization(ids),
				readers.ratingScheme.countEntriesByOrganization(ids)
			]);
			for (const fact of facts) {
				const id = fact.organizationId;
				fact.counts = {
					activePersonnel: personnel.get(id) ?? 0,
					members: members.get(id) ?? 0,
					leaderMembers: leaders.get(id) ?? 0,
					statusTypes: calendar.statusTypes.get(id) ?? 0,
					assignmentTypes: calendar.assignmentTypes.get(id) ?? 0,
					onboardingTemplateSteps: onboarding.get(id) ?? 0,
					trainingTypes: training.get(id) ?? 0,
					ratingSchemeEntries: rating.get(id) ?? 0
				};
			}
			return facts;
		}
	};
}

export function createPlatformActivationHealth(deps: PlatformActivationHealthDependencies): PlatformActivationHealth {
	return {
		async summarize(input = {}) {
			const now = input.now ?? deps.now?.() ?? new Date();
			try {
				return mapActivationHealthSummary({
					facts: await deps.store.listActivationOrganizationFacts({ limit: 100 }),
					now
				});
			} catch (error) {
				console.error('Admin activation health query failed:', error);
				return degradedActivationHealthSummary(now);
			}
		}
	};
}
