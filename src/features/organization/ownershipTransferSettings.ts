import type { SettingsMemberRow } from './contracts';

export type OwnershipTransferCandidate = Pick<SettingsMemberRow, 'id' | 'userId' | 'email' | 'membershipRole'>;
