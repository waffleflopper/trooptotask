import { buildRequestError } from '$lib/stores/core';
import type { RatingSchemeEntry, RatingSchemeEntryEditorData } from './contracts';

export async function loadRatingSchemeEntryEditor(orgId: string, id: string): Promise<RatingSchemeEntryEditorData> {
	const response = await fetch(`/org/${orgId}/api/rating-scheme?${new URLSearchParams({ entry: id })}`, {
		cache: 'no-store'
	});
	if (!response.ok) throw await buildRequestError(response, 'GET', 'rating-scheme');
	return response.json();
}

export async function saveRatingSchemeEntry(
	orgId: string,
	id: string,
	data: Partial<Omit<RatingSchemeEntry, 'id'>>
): Promise<RatingSchemeEntry> {
	const response = await fetch(`/org/${orgId}/api/rating-scheme`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ id, ...data })
	});
	if (!response.ok) throw await buildRequestError(response, 'PUT', 'rating-scheme');
	return response.json();
}
