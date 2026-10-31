import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { PersonnelTrainingRosterPort, RankCatalogEntry } from '$features/personnel/contracts';
import type { TrainingCatalogPersistence } from '../contracts';

export type TrainingTypeCreateContext = {
	readonly auth: OrganizationAccessGrant;
	readonly audit: PolicyAuditSink;
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'createType'>;
};
export type TrainingTypeEditorReadContext = Omit<TrainingTypeCreateContext, 'trainingCatalog'> & {
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'listTypes'>;
	readonly personnelTrainingRoster: Pick<PersonnelTrainingRosterPort, 'listActiveForWorkspace'>;
	readonly loadRankCatalog: () => Promise<RankCatalogEntry[]>;
};
export type TrainingTypeUpdateContext = Omit<TrainingTypeCreateContext, 'trainingCatalog'> & {
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'patchType' | 'listTypes'>;
};
export type TrainingTypeOrderContext = Omit<TrainingTypeCreateContext, 'trainingCatalog'> & {
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'setTypeOrder'>;
};
export type TrainingExemptionContext = Omit<TrainingTypeCreateContext, 'trainingCatalog'> & {
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'setPersonExemption'>;
};
export type TrainingTypeDeleteContext = Omit<TrainingTypeCreateContext, 'trainingCatalog'> & {
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'deleteType'>;
	readonly notifyTrainingTypeDeleted: () => Promise<void>;
};
export type TrainingTypeDeletionRequestContext = Omit<TrainingTypeCreateContext, 'trainingCatalog'> & {
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'listTypeLabels'>;
};

export type TrainingViewCreateContext = Omit<TrainingTypeCreateContext, 'trainingCatalog'> & {
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'createView'>;
};

export type TrainingViewUpdateContext = Omit<TrainingTypeCreateContext, 'trainingCatalog'> & {
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'patchView'>;
};

export type TrainingViewDeleteContext = Omit<TrainingTypeCreateContext, 'trainingCatalog'> & {
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'deleteView'>;
};
