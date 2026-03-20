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
			if (!res.ok) throw new Error(`POST ${resource} failed`);
			return res.json();
		},

		async update(id, data) {
			const res = await fetch(url(), {
				method: 'PUT',
				headers,
				body: JSON.stringify({ id, ...data })
			});
			if (!res.ok) throw new Error(`PUT ${resource} failed`);
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
