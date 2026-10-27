import type { SetupFact, SetupFactKey, SetupFacts } from './registry';
import { sanitizeErrorForLog } from '$lib/utils/logSanitize';

export type SetupFactReads = { [K in SetupFactKey]: () => Promise<number> };

async function settle(read: () => Promise<number>, source: SetupFactKey): Promise<SetupFact<number>> {
	try {
		return { status: 'ready', value: await read() };
	} catch (error) {
		console.error('[organization-setup] Fact read failed', { source, error: sanitizeErrorForLog(error) });
		return { status: 'error', message: 'Unable to load this setup information. Try again.' };
	}
}

export async function loadOrganizationSetupFacts(reads: SetupFactReads): Promise<SetupFacts> {
	const [
		groups,
		activeRanks,
		activePeople,
		statusTypes,
		assignmentTypes,
		trainingTypes,
		criticalTasks,
		evaluations,
		onboardingTemplates,
		events,
		taskings,
		members,
		pendingInvitations,
		lossWarningWindowDays
	] = await Promise.all([
		settle(reads.groups, 'groups'),
		settle(reads.activeRanks, 'activeRanks'),
		settle(reads.activePeople, 'activePeople'),
		settle(reads.statusTypes, 'statusTypes'),
		settle(reads.assignmentTypes, 'assignmentTypes'),
		settle(reads.trainingTypes, 'trainingTypes'),
		settle(reads.criticalTasks, 'criticalTasks'),
		settle(reads.evaluations, 'evaluations'),
		settle(reads.onboardingTemplates, 'onboardingTemplates'),
		settle(reads.events, 'events'),
		settle(reads.taskings, 'taskings'),
		settle(reads.members, 'members'),
		settle(reads.pendingInvitations, 'pendingInvitations'),
		settle(reads.lossWarningWindowDays, 'lossWarningWindowDays')
	]);
	return {
		branch: null,
		groups,
		activeRanks,
		activePeople,
		statusTypes,
		assignmentTypes,
		trainingTypes,
		criticalTasks,
		evaluations,
		onboardingTemplates,
		events,
		taskings,
		members,
		pendingInvitations,
		lossWarningWindowDays
	};
}
