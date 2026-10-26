import { loadAssignPeopleDialog, type TaskingAttentionRow } from '$features/calendar';
import { acknowledgeAwardTracking } from '$features/personnel';
import { loadRecordClassDialog } from '$features/training';
import type { Personnel } from '$features/personnel/contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { scopeSetResourceForGroupId } from '$lib/access/scopeSetAccess';
import { personnelResource } from './dashboardAccess';
import type { DashboardInputs } from './dashboardInputs';
import { DUTY_FILL_DAYS, needsYouPanel, type NeedsYouAction } from './needsYou';

const { calendar, onboarding, personnel, ratingScheme, training } = POLICY_ACTION_CATALOG;

export function updateStatusAction(inputs: DashboardInputs, entryId: string): NeedsYouAction {
	const orgId = inputs.page.orgId;
	return {
		label: 'Update status',
		policy: ratingScheme.updateEntries,
		mode: 'dialog',
		open: async () => {
			const { openUpdateStatusPanel } = await import('../components/needs-you/updateStatusPanel');
			return openUpdateStatusPanel(orgId, entryId);
		}
	};
}

export function recordClassAction(
	inputs: DashboardInputs,
	trainingTypeId: string,
	people: readonly Personnel[]
): NeedsYouAction | null {
	const trainingType = inputs.page.dashboard.data.trainingTypes.find((type) => type.id === trainingTypeId);
	if (!trainingType) return null;
	const orgId = inputs.page.orgId;
	return {
		label: 'Record class',
		policy: training.recordCompletions,
		mode: 'dialog',
		open: async () => {
			const [{ default: Panel }, { default: Dialog }] = await Promise.all([
				import('../components/needs-you/RecordClassPanel.svelte'),
				loadRecordClassDialog()
			]);
			return needsYouPanel(Panel, { orgId, trainingType, people, today: inputs.today, Dialog });
		}
	};
}

export function fillDutyAction(assignmentTypeId: string, openDays: number): NeedsYouAction {
	const days = Math.min(openDays, DUTY_FILL_DAYS);
	return {
		label: `Fill ${days} ${days === 1 ? 'day' : 'days'}`,
		policy: calendar.manageAssignments,
		mode: 'expand',
		open: async () => {
			const { default: Panel } = await import('../components/needs-you/DutyFillPanel.svelte');
			return needsYouPanel(Panel, { assignmentTypeId });
		}
	};
}

/** Completing a step needs the Onboarding workspace, so the action opens the packet there. */
export function checkOffAction(href: string): NeedsYouAction {
	return { label: 'Check off', policy: onboarding.manageWorkflows, mode: 'link', href };
}

export function awardStartedAction(inputs: DashboardInputs, person: Personnel): NeedsYouAction {
	const orgId = inputs.page.orgId;
	return {
		label: 'Award started',
		policy: personnel.manageRecords,
		resource: personnelResource(person),
		mode: 'run',
		run: async (updates) => {
			await acknowledgeAwardTracking(orgId, person.id);
			updates.putRecord(orgId, { list: 'awardTrackingAcknowledgedPersonnelIds', personnelId: person.id });
		}
	};
}

/** Opens the staffing picker in place, under the policy and scope Tasking detail uses. */
export function pickPeopleAction(inputs: DashboardInputs, row: TaskingAttentionRow): NeedsYouAction {
	const orgId = inputs.page.orgId;
	const groups = Object.fromEntries(inputs.groups.map((group) => [group.id, group.name]));
	const tasking = {
		id: row.taskingId,
		responsibility: row.responsibility,
		requirement: row.required === null ? null : { count: row.required, qualifications: null }
	};
	return {
		label: 'Pick people',
		policy: calendar.manageTaskings,
		resource: scopeSetResourceForGroupId(row.responsibility.kind === 'group' ? row.responsibility.groupId : null),
		mode: 'dialog',
		open: async () => {
			const [{ default: Panel }, { default: Dialog }] = await Promise.all([
				import('../components/needs-you/PickPeoplePanel.svelte'),
				loadAssignPeopleDialog()
			]);
			return needsYouPanel(Panel, { orgId, tasking, groups, Dialog });
		}
	};
}
