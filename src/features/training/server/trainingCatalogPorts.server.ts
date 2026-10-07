import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { TrainingCatalogPersistence } from '../contracts';

export type TrainingTypeCreateContext = {
	readonly auth: OrganizationAccessGrant;
	readonly audit: PolicyAuditSink;
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'createType'>;
};
export type TrainingTypeUpdateContext = Omit<TrainingTypeCreateContext, 'trainingCatalog'> & {
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'patchType'>;
};
export type TrainingTypeDeleteContext = Omit<TrainingTypeCreateContext, 'trainingCatalog'> & {
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'deleteType'>;
	readonly notifyTrainingTypeDeleted: () => Promise<void>;
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
