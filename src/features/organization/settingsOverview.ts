import { FEATURE_SWITCHES } from '$lib/access/featureSwitches';
import { FEATURE_SETUP, type SetupFeatureKey } from './featuresSettings';
import type { InvitationFollowUpCounts } from './settingsShell';

/** What the Overview page loads itself; approvals and invitations come from the settings layout. */
export interface SettingsOverviewData {
	ungroupedPeople: Promise<number>;
	membersCoveringNoGroups: Promise<number>;
	featuresNotSetUp: Promise<readonly SetupFeatureKey[]>;
}

/** Every source one check reads, each streaming on its own. */
export interface OverviewSources extends SettingsOverviewData {
	pendingApprovals: Promise<number>;
	invitationsToFollowUp: Promise<InvitationFollowUpCounts>;
}

/** `path` is under `/org/<segment>/`. */
export interface OverviewFix {
	label: string;
	path: string;
}

export interface OverviewResult {
	count: number;
	/** Splits a count that has more than one cause. */
	breakdown?: string;
	/** What is outstanding, each with its own fix, for a check that has no single place to fix it. */
	items?: readonly { text: string; fix: OverviewFix }[];
}

export interface OverviewCheck {
	key: 'approvals' | 'invitations' | 'memberScopes' | 'ungrouped' | 'features';
	label: string;
	description: string;
	unit: { one: string; many: string };
	/** Null when each item carries its own fix. */
	fix: OverviewFix | null;
	read: (sources: OverviewSources) => Promise<OverviewResult>;
}

const counted = (read: Promise<number>): Promise<OverviewResult> => read.then((count) => ({ count }));

/** Every health check, in the order the Overview lists them. */
export const OVERVIEW_CHECKS: readonly OverviewCheck[] = [
	{
		key: 'approvals',
		label: 'Pending approvals',
		description: 'Archive and deletion requests waiting on a review.',
		unit: { one: 'request', many: 'requests' },
		fix: { label: 'Review requests', path: 'settings/approvals' },
		read: (sources) => counted(sources.pendingApprovals)
	},
	{
		key: 'invitations',
		label: 'Invitations that need follow-up',
		description: 'Pending invitations whose email failed or that expire soon.',
		unit: { one: 'invitation', many: 'invitations' },
		fix: { label: 'Follow up', path: 'settings/members' },
		read: (sources) =>
			sources.invitationsToFollowUp.then(({ deliveryFailed, expiringSoon }) => ({
				count: deliveryFailed + expiringSoon,
				breakdown: `${deliveryFailed} failed · ${expiringSoon} expiring soon`
			}))
	},
	{
		key: 'memberScopes',
		label: 'Members whose scope covers no Groups',
		description: 'Members who are scoped to Groups but can see none.',
		unit: { one: 'member', many: 'members' },
		fix: { label: 'Fix access', path: 'settings/members' },
		read: (sources) => counted(sources.membersCoveringNoGroups)
	},
	{
		key: 'ungrouped',
		label: 'People without a Group',
		description: "Active people on the roster who aren't in any Group.",
		unit: { one: 'person', many: 'people' },
		fix: { label: 'Assign a Group', path: 'personnel' },
		read: (sources) => counted(sources.ungroupedPeople)
	},
	{
		key: 'features',
		label: 'Features turned on with nothing set up',
		description: 'Features that are on but have nothing to work with yet.',
		unit: { one: 'feature', many: 'features' },
		fix: null,
		read: (sources) =>
			sources.featuresNotSetUp.then((features) => ({
				count: features.length,
				items: features.map((feature) => ({
					text: `${FEATURE_SWITCHES[feature].label}: no ${FEATURE_SETUP[feature].missing}`,
					fix: FEATURE_SETUP[feature].fix
				}))
			}))
	}
];

export type OverviewCheckState = 'pending' | 'failed' | { count: number };

export type OverviewSummary =
	| { kind: 'checking' }
	| { kind: 'allSet' }
	/** `checks` is how many checks have something outstanding. */
	| { kind: 'attention'; checks: number }
	/** Some checks failed to load and none of the rest is outstanding, so nothing can be called settled. */
	| { kind: 'incomplete' };

/** Waits for every check to settle, then reports what the Overview as a whole says. */
export function summarizeOverview(states: readonly OverviewCheckState[]): OverviewSummary {
	if (states.includes('pending')) return { kind: 'checking' };
	const checks = states.filter((state) => typeof state === 'object' && state.count > 0).length;
	if (checks > 0) return { kind: 'attention', checks };
	return states.includes('failed') ? { kind: 'incomplete' } : { kind: 'allSet' };
}
