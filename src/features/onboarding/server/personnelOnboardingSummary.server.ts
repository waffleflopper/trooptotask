import type { Personnel } from '$features/personnel/contracts';
import type { OnboardingWorkflowPersistence } from '../persistenceContracts';
import type { PersonnelOnboardingSummary } from '../onboarding.types';
import { getProgress } from '../onboardingProgress';

/** Onboarding owns the per-Person packet summary; delivery supplies the Person after Onboarding view admission. */
export async function loadPersonnelOnboardingSummary(input: {
	onboardingWorkflow: Pick<OnboardingWorkflowPersistence, 'findLatestPacketForPersonnel'>;
	loadAuthorizedPerson: () => Promise<Personnel>;
}): Promise<PersonnelOnboardingSummary> {
	const person = await input.loadAuthorizedPerson();
	const packet = await input.onboardingWorkflow.findLatestPacketForPersonnel(person.id);
	if (!packet) return { state: 'none' };
	const { completed, total } = getProgress(packet);
	return packet.status === 'completed'
		? { state: 'complete', completedAt: packet.completedAt, completedSteps: completed, totalSteps: total }
		: { state: 'in-progress', startedAt: packet.startedAt, completedSteps: completed, totalSteps: total };
}
