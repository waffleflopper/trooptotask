import { FEATURE_SWITCHES, featureExportNote, type FeatureKey } from '$lib/access/featureSwitches';
import {
	assertOrganizationDataExportManifestIsSafe,
	ORGANIZATION_DATA_EXPORT_SECTIONS,
	type OrganizationDataExportSection,
	type OrganizationDataExportSectionKey,
	type OrganizationDataExportSections
} from './organizationDataExportManifest.server';

export type OrganizationExportSection = OrganizationDataExportSection;
export type OrganizationExportSections = OrganizationDataExportSections;
export type OrganizationDataExportReads = Record<
	OrganizationDataExportSectionKey,
	() => Promise<Record<string, unknown>[]>
> & { readonly disabledFeatures?: readonly FeatureKey[] };

export type OrganizationExportPayload = {
	exportedAt: string;
	notes?: string[];
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
	orgId: string,
	reads: OrganizationDataExportReads
): Promise<OrganizationExportPayload> {
	assertOrganizationDataExportManifestIsSafe();
	const disabledFeatures = reads.disabledFeatures ?? [];
	const disabledAreas = new Set(
		disabledFeatures.flatMap((key) => {
			const lane = FEATURE_SWITCHES[key].lane;
			return lane ? [lane.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)] : [];
		})
	);
	const exportSections = ORGANIZATION_DATA_EXPORT_SECTIONS.filter((section) => !disabledAreas.has(section.areaKey));
	const entries: Array<readonly [string, Record<string, unknown>[]]> = [];
	for (const batch of chunkArray(exportSections, ORGANIZATION_EXPORT_QUERY_BATCH_SIZE)) {
		entries.push(
			...(await Promise.all(batch.map(async (section) => [section.key, await reads[section.key]()] as const)))
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
		notes: disabledFeatures.map(featureExportNote),
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
