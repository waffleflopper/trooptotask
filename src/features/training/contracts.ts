import type { CapabilityMap, ScopeSet } from '$lib/access/memberAccessShape';
import type { TrainingType } from './training.types';

/** Trusted request facts for Training references consumed by Onboarding. */
export interface TrainingOnboardingActor {
	readonly userId: string;
	readonly orgId: string;
	readonly role: 'owner' | 'admin' | 'member';
	readonly isPrivileged: boolean;
	readonly canManageMembers: boolean;
	readonly capabilityMap: CapabilityMap;
	readonly scopeSet: ScopeSet;
}

export interface TrainingOnboardingReferencesPort {
	listTypes(actor: TrainingOnboardingActor): Promise<TrainingType[]>;
	completedTypeIds(
		actor: TrainingOnboardingActor,
		personnelIds: string[],
		trainingTypeIds: string[]
	): Promise<Map<string, Set<string>>>;
}
