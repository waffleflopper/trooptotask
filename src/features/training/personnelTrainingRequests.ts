import type { ReadinessCertificate } from '$lib/components/patterns/readiness-items';
import { buildRequestError } from '$lib/stores/core';
import type { TrainingBatchImportResult, TrainingBatchRecord } from './contracts';

export interface TrainingCompletionLog {
	personnelId: string;
	trainingTypeId: string;
	/** Exactly one is set: the completion date, or the expiration date for an expiration-date-only type. */
	completionDate: string | null;
	expirationDate: string | null;
	notes: string | null;
	certificate: File | null;
}

export interface TrainingCorrectionRequest {
	kind: 'current' | 'history';
	id: string;
	completionDate?: string | null;
	expirationDate?: string | null;
	notes?: string | null;
}

/** Records many completions in one request; per-record failures come back in `errors`. */
export async function recordTrainingCompletions(
	orgId: string,
	records: readonly TrainingBatchRecord[]
): Promise<TrainingBatchImportResult> {
	const response = await fetch(`/org/${orgId}/api/personnel-trainings/batch`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ records })
	});
	if (!response.ok) throw await buildRequestError(response, 'POST', 'training completions');
	return response.json();
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

export async function correctTrainingCompletion(orgId: string, correction: TrainingCorrectionRequest): Promise<void> {
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

/** An uploaded certificate opens through the app; a legacy link to another site opens there and names it. */
export function trainingCertificateLink(
	orgId: string,
	kind: 'current' | 'history',
	id: string,
	stored: string | null
): ReadinessCertificate | null {
	if (!stored) return null;
	const external = externalUrl(stored);
	if (external) return { kind: 'external', href: external.href, host: external.host };
	return {
		kind: 'stored',
		href: `/org/${orgId}/api/personnel-trainings/certificate?${new URLSearchParams({ kind, id })}`
	};
}

function externalUrl(stored: string): URL | null {
	if (!/^https?:\/\//i.test(stored)) return null;
	try {
		return new URL(stored);
	} catch {
		return null;
	}
}
