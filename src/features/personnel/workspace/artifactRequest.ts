import { buildRequestError } from '$lib/stores/core';

type Fetch = typeof fetch;

export async function sendArtifactRequest<T>(
	fetchFn: Fetch,
	url: string,
	method: 'GET' | 'PATCH' | 'DELETE',
	body?: Record<string, unknown>
): Promise<T | null> {
	const response = await fetchFn(url, {
		method,
		...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {})
	});
	if (!response.ok) throw await buildRequestError(response, method, url);
	return (await response.json().catch(() => null)) as T | null;
}
