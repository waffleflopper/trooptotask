import type { DataStore } from '../ports';
import type { FeedbackExportRow } from '$features/feedback/index.server';
import type { PersonnelOrganizationExportPort, PersonnelRosterActor } from '$features/personnel/contracts';
import { isPersonnelOrganizationExportTable } from '$features/personnel/contracts';
import {
	listAssignmentTypeExportRows,
	listAvailabilityExportRows,
	listDailyAssignmentExportRows,
	listSpecialDayExportRows,
	listStatusTypeExportRows
} from '$features/calendar/index.server';
import {
	assertOrganizationDataExportManifestIsSafe,
	ORGANIZATION_DATA_EXPORT_SECTIONS,
	type OrganizationDataExportSection,
	type OrganizationDataExportSections
} from './organizationDataExportManifest';

export type OrganizationExportSection = OrganizationDataExportSection;
export type OrganizationExportSections = OrganizationDataExportSections;

interface OrganizationTrainingExportReads {
	listTrainingTypeExportRows(store: Pick<DataStore, 'findMany'>, orgId: string): Promise<Record<string, unknown>[]>;
	listTrainingCompletionExportRows(
		store: Pick<DataStore, 'findMany'>,
		orgId: string
	): Promise<Record<string, unknown>[]>;
	listTrainingViewExportRows(store: Pick<DataStore, 'findMany'>, orgId: string): Promise<Record<string, unknown>[]>;
}

interface OrganizationOnboardingExportReads {
	listPersonnelOnboardingExportRows(
		store: Pick<DataStore, 'findMany'>,
		orgId: string
	): Promise<Record<string, unknown>[]>;
	listOnboardingStepProgressExportRows(
		store: Pick<DataStore, 'findMany'>,
		orgId: string
	): Promise<Record<string, unknown>[]>;
	listOnboardingTemplateExportRows(
		store: Pick<DataStore, 'findMany'>,
		orgId: string
	): Promise<Record<string, unknown>[]>;
	listOnboardingTemplateStepExportRows(
		store: Pick<DataStore, 'findMany'>,
		orgId: string
	): Promise<Record<string, unknown>[]>;
}

interface OrganizationRatingSchemeExportReads {
	listRatingSchemeExportRows(store: Pick<DataStore, 'findMany'>, orgId: string): Promise<Record<string, unknown>[]>;
}

interface OrganizationCommunicationsExportReads {
	listNotificationExportRows(): Promise<Record<string, unknown>[]>;
	listFeedbackExportRows(): Promise<FeedbackExportRow[]>;
}

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
	personnelExport: PersonnelOrganizationExportPort,
	trainingExport: OrganizationTrainingExportReads,
	onboardingExport: OrganizationOnboardingExportReads,
	communicationsExport: OrganizationCommunicationsExportReads,
	ratingSchemeExport: OrganizationRatingSchemeExportReads
): Promise<OrganizationExportPayload> {
	assertOrganizationDataExportManifestIsSafe();
	const orgId = actor.orgId;
	const exportSections = ORGANIZATION_DATA_EXPORT_SECTIONS;
	const entries: Array<readonly [string, Record<string, unknown>[]]> = [];
	for (const batch of chunkArray(exportSections, ORGANIZATION_EXPORT_QUERY_BATCH_SIZE)) {
		entries.push(
			...(await Promise.all(
				batch.map(async (section) => {
					if (section.key === 'notifications') {
						return [section.key, await communicationsExport.listNotificationExportRows()] as const;
					}
					if (section.key === 'betaFeedback') {
						return [section.key, await communicationsExport.listFeedbackExportRows()] as const;
					}
					if (section.areaKey === 'personnel' && isPersonnelOrganizationExportTable(section.table)) {
						return [section.key, await personnelExport.listRows(actor, section.table)] as const;
					}
					if (section.key === 'ratingSchemeEntries') {
						return [section.key, await ratingSchemeExport.listRatingSchemeExportRows(store, orgId)] as const;
					}
					if (section.key === 'trainingTypes') {
						return [section.key, await trainingExport.listTrainingTypeExportRows(store, orgId)] as const;
					}
					if (section.key === 'personnelTrainings') {
						return [section.key, await trainingExport.listTrainingCompletionExportRows(store, orgId)] as const;
					}
					if (section.key === 'trainingViews') {
						return [section.key, await trainingExport.listTrainingViewExportRows(store, orgId)] as const;
					}
					if (section.key === 'onboardingTemplates') {
						return [section.key, await onboardingExport.listOnboardingTemplateExportRows(store, orgId)] as const;
					}
					if (section.key === 'onboardingTemplateSteps') {
						return [section.key, await onboardingExport.listOnboardingTemplateStepExportRows(store, orgId)] as const;
					}
					if (section.key === 'personnelOnboardings') {
						return [section.key, await onboardingExport.listPersonnelOnboardingExportRows(store, orgId)] as const;
					}
					if (section.key === 'onboardingStepProgress') {
						return [section.key, await onboardingExport.listOnboardingStepProgressExportRows(store, orgId)] as const;
					}
					if (section.key === 'specialDays') {
						return [section.key, await listSpecialDayExportRows(store, orgId)] as const;
					}
					if (section.key === 'statusTypes') {
						return [section.key, await listStatusTypeExportRows(store, orgId)] as const;
					}
					if (section.key === 'assignmentTypes') {
						return [section.key, await listAssignmentTypeExportRows(store, orgId)] as const;
					}
					if (section.key === 'availabilityEntries') {
						return [section.key, await listAvailabilityExportRows(store, orgId)] as const;
					}
					if (section.key === 'dailyAssignments') {
						return [section.key, await listDailyAssignmentExportRows(store, orgId)] as const;
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
