import { buildRequestError } from '$lib/stores/core';

export interface TrainingCompletionLog {
	personnelId: string;
	trainingTypeId: string;
	/** Exactly one is set: the completion date, or the expiration date for an expiration-date-only type. */
	completionDate: string | null;
	expirationDate: string | null;
	notes: string | null;
	certificate: File | null;
}

export interface TrainingCompletionCorrection {
	kind: 'current' | 'history';
	id: string;
	completionDate: string | null;
	expirationDate?: string | null;
	notes?: string | null;
}

export async function logTrainingCompletion(orgId: string, log: TrainingCompletionLog): Promise<void> {
	const body = new FormData();
	body.set('personnelId', log.personnelId);
	body.set('trainingTypeId', log.trainingTypeId);
	if (log.completionDate) body.set('completionDate', log.completionDate);
	if (log.expirationDate) body.set('expirationDate', log.expirationDate);
	if (log.notes) body.set('notes', log.notes);
	if (log.certificate) body.set('certificate', log.certificate);
	const response = await fetch(`/org/${orgId}/api/personnel-trainings/completions`, { method: 'POST', body });
	if (!response.ok) throw await buildRequestError(response, 'POST', 'training completion');
}

export async function correctTrainingCompletion(
	orgId: string,
	correction: TrainingCompletionCorrection
): Promise<void> {
	const response = await fetch(`/org/${orgId}/api/personnel-trainings/corrections`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(correction)
	});
	if (!response.ok) throw await buildRequestError(response, 'PATCH', 'training completion');
}

export async function setTrainingExemption(
	orgId: string,
	trainingTypeId: string,
	personnelId: string,
	exempt: boolean
): Promise<void> {
	const response = await fetch(`/org/${orgId}/api/training-types/${trainingTypeId}/exemptions/${personnelId}`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ exempt })
	});
	if (!response.ok) throw await buildRequestError(response, 'PUT', 'training exemption');
}

export function trainingCertificateHref(orgId: string, kind: 'current' | 'history', id: string): string {
	return `/org/${orgId}/api/personnel-trainings/certificate?${new URLSearchParams({ kind, id })}`;
}
