import type { DataStore } from '../ports';
import type { PersonnelOrganizationExportPort, PersonnelRosterActor } from '$features/personnel/contracts';
import { isPersonnelOrganizationExportTable } from '$features/personnel/contracts';
import { listSpecialDayExportRows, listStatusTypeExportRows } from '$features/calendar/index.server';
import {
	assertOrganizationDataExportManifestIsSafe,
	ORGANIZATION_DATA_EXPORT_SECTIONS,
	type OrganizationDataExportSection,
	type OrganizationDataExportSections
} from './organizationDataExportManifest';

export type OrganizationExportSection = OrganizationDataExportSection;
export type OrganizationExportSections = OrganizationDataExportSections;

export type OrganizationExportPayload = {
	exportedAt: string;
	organizationId: string;
	sectionInventory: Array<
		Pick<OrganizationExportSection, 'key' | 'title' | 'table'> & {
			area: string;
			areaKey: OrganizationExportSection['areaKey'];
			rowCount: number;
		}
	>;
	sections: OrganizationExportSections;
} & Record<string, unknown>;

export const ORGANIZATION_EXPORT_QUERY_BATCH_SIZE = 12;
export const ORGANIZATION_EXPORT_SECTIONS = ORGANIZATION_DATA_EXPORT_SECTIONS;

export async function loadOrganizationExportPayload(
	store: DataStore,
	actor: PersonnelRosterActor,
	personnelExport: PersonnelOrganizationExportPort
): Promise<OrganizationExportPayload> {
	assertOrganizationDataExportManifestIsSafe();
	const orgId = actor.orgId;
	const exportSections = ORGANIZATION_DATA_EXPORT_SECTIONS;
	const entries: Array<readonly [string, Record<string, unknown>[]]> = [];
	for (const batch of chunkArray(exportSections, ORGANIZATION_EXPORT_QUERY_BATCH_SIZE)) {
		entries.push(
			...(await Promise.all(
				batch.map(async (section) => {
					if (section.areaKey === 'personnel' && isPersonnelOrganizationExportTable(section.table)) {
						return [section.key, await personnelExport.listRows(actor, section.table)] as const;
					}
					if (section.key === 'specialDays') {
						return [section.key, await listSpecialDayExportRows(store, orgId)] as const;
					}
					if (section.key === 'statusTypes') {
						return [section.key, await listStatusTypeExportRows(store, orgId)] as const;
					}
					const rows = await store.findMany<Record<string, unknown>>(
						section.table,
						orgId,
						undefined,
						section.table === 'organizations'
							? {
									select:
										'id,name,created_by,created_at,url_slug,archive_retention_months,suspended_at,critical_tasks_default_expiration_months,critical_tasks_expiring_soon_warning_days,loss_warning_window_days,personnel_document_storage_cap_bytes'
								}
							: undefined
					);
					return [section.key, rows] as const;
				})
			))
		);
	}
	const sections = Object.fromEntries(entries) as OrganizationExportSections;
	const sectionInventory = exportSections.map((section) => ({
		key: section.key,
		title: section.title,
		table: section.table,
		area: section.areaLabel,
		areaKey: section.areaKey,
		rowCount: sections[section.key]?.length ?? 0
	}));

	return {
		exportedAt: new Date().toISOString(),
		organizationId: orgId,
		sectionInventory,
		sections,
		...sections
	};
}

function chunkArray<T>(items: readonly T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
}
