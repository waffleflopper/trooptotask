import { FEATURE_SWITCHES } from '$lib/access/featureSwitches';
import { FEATURE_SETUP, type SetupFeatureKey } from './featuresSettings';
import type { InvitationFollowUpCounts } from './settingsShell';

export interface SettingsOverviewData {
	ungroupedPeople: Promise<number>;
	membersCoveringNoGroups: Promise<number>;
	featuresNotSetUp: Promise<readonly SetupFeatureKey[]>;
}

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
	breakdown?: string;
	items?: readonly { text: string; fix: OverviewFix }[];
}

export interface OverviewCheck {
	key: 'approvals' | 'invitations' | 'memberScopes' | 'ungrouped' | 'features';
	label: string;
	description: string;
	unit: { one: string; many: string };
	fix: OverviewFix | null;
	read: (sources: OverviewSources) => Promise<OverviewResult>;
}

const counted = (read: Promise<number>): Promise<OverviewResult> => read.then((count) => ({ count }));

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
				breakdown: [
					deliveryFailed > 0 && `${deliveryFailed} failed`,
					expiringSoon > 0 && `${expiringSoon} expiring soon`
				]
					.filter(Boolean)
					.join(' · ')
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

/**
 * Each check's read, in `OVERVIEW_CHECKS` order. Server rendering runs no effects, so nothing else handles a derived
 * read there, and an unhandled rejection would stop the server; each is observed here, and callers still see it fail.
 */
export function readOverviewChecks(sources: OverviewSources): Promise<OverviewResult>[] {
	return OVERVIEW_CHECKS.map((check) => {
		const read = check.read(sources);
		read.catch(() => {});
		return read;
	});
}

export type OverviewCheckState = 'pending' | 'failed' | { count: number };

export type OverviewSummary =
	| { kind: 'checking' }
	| { kind: 'allSet' }
	| { kind: 'attention'; checks: number }
	| { kind: 'incomplete' };

export function summarizeOverview(states: readonly OverviewCheckState[]): OverviewSummary {
	if (states.includes('pending')) return { kind: 'checking' };
	const checks = states.filter((state) => typeof state === 'object' && state.count > 0).length;
	if (checks > 0) return { kind: 'attention', checks };
	return states.includes('failed') ? { kind: 'incomplete' } : { kind: 'allSet' };
}
