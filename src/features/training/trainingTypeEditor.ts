import { buildRequestError } from '$lib/stores/core';
import type { TrainingPageAccess, TrainingTypeEditorData } from './contracts';

/** The editor's data and the Organization it was loaded for, which its saves go to. */
export interface LoadedTrainingTypeEditor extends TrainingTypeEditorData {
	org: TrainingPageAccess;
}

export async function loadTrainingTypeEditor(org: TrainingPageAccess): Promise<LoadedTrainingTypeEditor> {
	const response = await fetch(`/org/${org.orgId}/api/training-types/editor`, { cache: 'no-store' });
	if (!response.ok) throw await buildRequestError(response, 'GET', 'training types');
	return { org, ...(await response.json()) };
}
