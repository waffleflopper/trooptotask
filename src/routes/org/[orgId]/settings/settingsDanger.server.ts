import type { MembershipRole } from '$lib/access/memberAccessShape';
import { keepStreamedRejectionObserved } from '$lib/server/adapters/streamedWorkspace';
import {
	loadOwnershipTransferCandidates,
	readUnitCounts,
	type OrganizationUnitCountsPort
} from '$features/organization/index.server';
import {
	DESTRUCTION_COUNT_KEYS,
	type DangerSettingsData,
	type OrganizationSettingsReader
} from '$features/organization/contracts';

export interface DangerSettingsPorts {
	auth: { orgId: string; role: MembershipRole };
	organizationSettings: Pick<OrganizationSettingsReader, 'listOwnershipCandidateMemberships'>;
	unitCounts: OrganizationUnitCountsPort;
}

/** The route admits owners only. The transfer candidates render on first paint; the counts stream beside them. */
export async function loadDangerSettings(ports: DangerSettingsPorts): Promise<DangerSettingsData> {
	const destructionCounts = keepStreamedRejectionObserved(readUnitCounts(ports.unitCounts, DESTRUCTION_COUNT_KEYS));
	return { transferOwnershipCandidates: await loadOwnershipTransferCandidates(ports), destructionCounts };
}
