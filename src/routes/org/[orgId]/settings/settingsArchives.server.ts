import type { MembershipRole, OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { loadRosterPersonnel } from '$features/personnel/index.server';
import { DEFAULT_ARCHIVE_RETENTION_MONTHS } from '$features/organization/contracts';
import type { OrganizationSettingsReader } from '$features/organization/contracts';
import type { SettingsArchivedPersonnelRow, SettingsArchivesSectionData } from './settingsSectionTypes';

export interface ArchivesSettingsData {
	currentMember: {
		role: MembershipRole;
		isOwner: boolean;
		isAdmin: boolean;
		canManageMembers: boolean;
	};
	sections: {
		archivedPersonnel: SettingsArchivesSectionData;
	};
}

export type SettingsArchivedPersonnelSourceRow = Pick<
	SettingsArchivedPersonnelRow,
	'id' | 'rank' | 'firstName' | 'lastName' | 'mos' | 'groupName' | 'archivedAt' | 'groupId'
>;

export async function loadArchivesSettings(
	ctx: Parameters<typeof loadRosterPersonnel>[0] & {
		auth: Pick<OrganizationAccessGrant, 'orgId' | 'role' | 'canManageMembers'>;
		organizationSettings: Pick<OrganizationSettingsReader, 'findArchiveRetentionMonths'>;
	},
	input: { isAdmin: boolean }
): Promise<ArchivesSettingsData> {
	const [archiveRetentionMonths, archivedPersonnel] = await Promise.all([
		ctx.organizationSettings.findArchiveRetentionMonths(ctx.auth.orgId),
		loadRosterPersonnel(ctx, {
			status: 'archived',
			order: 'archived-newest'
		})
	]);

	return buildArchivesSettingsData(ctx, {
		isAdmin: input.isAdmin,
		archiveRetentionMonths,
		archivedPersonnel: archivedPersonnel.map((p) => ({
			id: p.id,
			rank: p.rank,
			firstName: p.firstName,
			lastName: p.lastName,
			mos: p.mos,
			groupName: p.groupName,
			archivedAt: p.archivedAt as string,
			groupId: p.groupId
		}))
	});
}

export function buildArchivesSettingsData(
	ctx: Pick<Parameters<typeof loadArchivesSettings>[0], 'auth'>,
	input: {
		isAdmin: boolean;
		archiveRetentionMonths: number | null | undefined;
		archivedPersonnel: SettingsArchivedPersonnelSourceRow[];
	}
): ArchivesSettingsData {
	const isOwner = ctx.auth.role === 'owner';
	const canManageMembers = ctx.auth.canManageMembers;
	// The cleanup run reads a missing or non-positive retention as the default, so the countdown does too.
	const archiveRetentionMonths =
		input.archiveRetentionMonths && input.archiveRetentionMonths > 0
			? input.archiveRetentionMonths
			: DEFAULT_ARCHIVE_RETENTION_MONTHS;
	const rows = input.archivedPersonnel.map(shapeArchivedPersonnelRow);

	return {
		currentMember: {
			role: ctx.auth.role,
			isOwner,
			isAdmin: input.isAdmin,
			canManageMembers
		},
		sections: {
			archivedPersonnel: {
				rows,
				retention: {
					months: archiveRetentionMonths,
					purgeSummary:
						rows.length === 0
							? `Retention ${archiveRetentionMonths} months`
							: `${rows.length} archived ${pluralize('record', rows.length)}`
				},
				commands: {
					canRestore: canManageMembers,
					canExport: canManageMembers,
					canPermanentlyDelete: canManageMembers
				}
			}
		}
	};
}

function shapeArchivedPersonnelRow(row: SettingsArchivedPersonnelSourceRow): SettingsArchivedPersonnelRow {
	return {
		...row,
		displayName: `${row.rank} ${row.lastName}, ${row.firstName}`,
		exportFileStem: `${row.rank}-${row.lastName}`
	};
}

function pluralize(label: string, count: number): string {
	return count === 1 ? label : `${label}s`;
}
