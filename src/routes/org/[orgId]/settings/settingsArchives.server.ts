import type { MembershipRole } from '$lib/access/memberAccessShape';
import type { UseCaseContext } from '$lib/server/core/ports';
import { loadRosterPersonnel } from '$lib/server/core/useCases/rosterReadModel';
import { DEFAULT_ARCHIVE_RETENTION_MONTHS } from './settingsPolicyConstraints';
import type { SettingsArchivedPersonnelRow, SettingsArchivesSectionData } from './settingsSectionTypes';
import type { OrganizationSettingsRow } from './settingsRows.server';

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
	ctx: Pick<UseCaseContext, 'auth' | 'store' | 'rawStore'>,
	input: { isAdmin: boolean }
): Promise<ArchivesSettingsData> {
	const [organizationSettings, archivedPersonnel] = await Promise.all([
		ctx.rawStore.findOne<Pick<OrganizationSettingsRow, 'archive_retention_months'>>(
			'organizations',
			ctx.auth.orgId,
			{},
			'archive_retention_months'
		),
		loadRosterPersonnel(ctx, {
			status: 'archived',
			orderBy: [{ column: 'archived_at', ascending: false }]
		})
	]);

	return buildArchivesSettingsData(ctx, {
		isAdmin: input.isAdmin,
		organizationSettings,
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
	ctx: Pick<UseCaseContext, 'auth'>,
	input: {
		isAdmin: boolean;
		organizationSettings: Pick<OrganizationSettingsRow, 'archive_retention_months'> | null;
		archivedPersonnel: SettingsArchivedPersonnelSourceRow[];
	}
): ArchivesSettingsData {
	const isOwner = ctx.auth.role === 'owner';
	const canManageMembers = ctx.auth.canManageMembers;
	const archiveRetentionMonths =
		input.organizationSettings?.archive_retention_months ?? DEFAULT_ARCHIVE_RETENTION_MONTHS;
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
