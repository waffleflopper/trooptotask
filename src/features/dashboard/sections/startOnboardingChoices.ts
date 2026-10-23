import type { Group, Personnel } from '$features/personnel/contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { DashboardInputs } from './dashboardInputs';
import { actionablePersonnel, type DashboardAccess } from './dashboardAccess';

const { onboarding, personnel } = POLICY_ACTION_CATALOG;

export interface StartOnboardingChoices {
	people: Personnel[];
	startedPersonnelIds: string[];
	/** Groups the viewer may add a Person to. */
	groups: Group[];
	allowUnassigned: boolean;
	canAddPerson: boolean;
	/** Someone can be chosen or added, so the dialog can finish. */
	usable: boolean;
}

export function startOnboardingChoices(inputs: DashboardInputs, access: DashboardAccess): StartOnboardingChoices {
	const people = actionablePersonnel(inputs.personnel, access, onboarding.manageWorkflows);
	const startedPersonnelIds = inputs.page.dashboard.data.activeOnboardings.map((packet) => packet.personnelId);
	const started = new Set(startedPersonnelIds);
	const groups = inputs.groups.filter((group) =>
		access.can(personnel.createRecords, { kind: 'group', groupId: group.id })
	);
	const allowUnassigned = access.can(personnel.createRecords, { kind: 'organization' });
	const canAddPerson =
		access.can(onboarding.manageWorkflows) &&
		access.can(personnel.createRecords) &&
		(allowUnassigned || groups.length > 0);
	return {
		people,
		startedPersonnelIds,
		groups,
		allowUnassigned,
		canAddPerson,
		usable: canAddPerson || people.some((person) => !started.has(person.id))
	};
}
