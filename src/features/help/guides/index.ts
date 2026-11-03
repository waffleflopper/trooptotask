import type { HelpGuide } from '../contracts';
import { addAssignmentTypes } from './add-assignment-types';
import { addTrainingTypes } from './add-training-types';
import { buildCriticalTaskLibrary } from './build-critical-task-library';
import { buildOnboardingTemplate } from './build-onboarding-template';
import { bulkStatuses } from './bulk-statuses';
import { chooseWhoPullsDuty } from './choose-who-pulls-duty';
import { fillDutyRoster } from './fill-duty-roster';
import { importCalendarStatuses } from './import-calendar-statuses';
import { importPersonnel } from './import-personnel';
import { inviteMembers } from './invite-members';
import { limitMemberToGroups } from './limit-member-to-groups';
import { makeStatusTypes } from './make-status-types';
import { manageGroups } from './manage-groups';
import { openSoldierRecord } from './open-soldier-record';
import { reviewApprovals } from './review-approvals';
import { showDutyCalendarLane } from './show-duty-calendar-lane';
import { startOnboarding } from './start-onboarding';
import { trackRatingChain } from './track-rating-chain';
import { turnFeaturesOnOff } from './turn-features-on-off';

/** Every guide, in the order Help lists them within a page. The most-missed come first. */
export const HELP_GUIDES: readonly HelpGuide[] = [
	addAssignmentTypes,
	chooseWhoPullsDuty,
	fillDutyRoster,
	bulkStatuses,
	showDutyCalendarLane,
	makeStatusTypes,
	importCalendarStatuses,
	manageGroups,
	openSoldierRecord,
	importPersonnel,
	buildOnboardingTemplate,
	startOnboarding,
	addTrainingTypes,
	buildCriticalTaskLibrary,
	trackRatingChain,
	limitMemberToGroups,
	inviteMembers,
	reviewApprovals,
	turnFeaturesOnOff
];
