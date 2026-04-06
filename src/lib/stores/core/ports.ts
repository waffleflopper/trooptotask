import type { DeleteResult } from '$lib/utils/deletionRequests';

export interface ApiAdapter<T extends { id: string }> {
	create(data: Omit<T, 'id'>): Promise<T>;
	update(id: string, data: Partial<Omit<T, 'id'>>): Promise<T>;
	remove(id: string): Promise<DeleteResult>;
}

export interface BatchApiAdapter<T extends { id: string }> extends ApiAdapter<T> {
	createBatch(items: Omit<T, 'id'>[]): Promise<T[]>;
	removeBatch?(ids: string[]): Promise<boolean>;
}

async function buildRequestError(res: Response, method: string, resource: string): Promise<Error> {
	let message = `${method} ${resource} failed (${res.status})`;

	try {
		const body = await res.json();
		if (typeof body === 'string' && body.trim()) {
			message = body.trim();
		} else if (body && typeof body === 'object') {
			const record = body as Record<string, unknown>;
			const detail = [record.message, record.error, record.details, record.hint].find(
				(value) => typeof value === 'string' && value.trim().length > 0
			);
			if (typeof detail === 'string') {
				message = detail;
			}
		}
	} catch {
		// Ignore response parsing errors and keep the fallback message.
	}

	return new Error(message);
}

export function createRestAdapter<T extends { id: string }>(getOrgId: () => string, resource: string): ApiAdapter<T> {
	function url() {
		return `/org/${getOrgId()}/api/${resource}`;
	}

	const headers = { 'Content-Type': 'application/json' };

	return {
		async create(data) {
			const res = await fetch(url(), {
				method: 'POST',
				headers,
				body: JSON.stringify(data)
			});
			if (!res.ok) throw await buildRequestError(res, 'POST', resource);
			return res.json();
		},

		async update(id, data) {
			const res = await fetch(url(), {
				method: 'PUT',
				headers,
				body: JSON.stringify({ id, ...data })
			});
			if (!res.ok) throw await buildRequestError(res, 'PUT', resource);
			return res.json();
		},

		async remove(id) {
			try {
				const res = await fetch(url(), {
					method: 'DELETE',
					headers,
					body: JSON.stringify({ id })
				});

				if (res.status === 202) {
					const body = await res.json();
					if (body.requiresApproval) {
						return 'approval_required';
					}
				}

				if (!res.ok) return 'error';
				return 'deleted';
			} catch {
				return 'error';
			}
		}
	};
}

export function createMockAdapter<T extends { id: string }>(overrides: Partial<ApiAdapter<T>>): ApiAdapter<T> {
	const notImpl = (method: string) => async () => {
		throw new Error(`${method} not implemented in mock adapter`);
	};

	return {
		create: overrides.create ?? notImpl('create'),
		update: overrides.update ?? notImpl('update'),
		remove: overrides.remove ?? notImpl('remove')
	};
}
