import type { SettingsMemberRow } from './memberSettingsTypes';
import type { UnitCounts } from './unitCounts';

export const DESTRUCTION_COUNT_KEYS = ['activePersonnel', 'trainingRecords', 'members', 'archivedPersonnel'] as const;

export type DestructionCounts = UnitCounts<(typeof DESTRUCTION_COUNT_KEYS)[number]>;

export interface DangerSettingsData {
	transferOwnershipCandidates: Array<Pick<SettingsMemberRow, 'id' | 'userId' | 'email' | 'membershipRole'>>;
	destructionCounts: Promise<DestructionCounts>;
}
