export type DeleteResult = 'deleted' | 'approval_required' | 'error';

export interface ApiAdapter<T extends { id: string }> {
	create(data: Omit<T, 'id'>): Promise<T>;
	update(id: string, data: Partial<Omit<T, 'id'>>): Promise<T>;
	remove(id: string): Promise<DeleteResult>;
}

export interface BatchApiAdapter<T extends { id: string }> extends ApiAdapter<T> {
	createBatch(items: Omit<T, 'id'>[]): Promise<T[]>;
	/** Resolves with how many rows the server actually deleted, which can be fewer than requested. */
	removeBatch?(ids: string[]): Promise<{ deleted: number }>;
}

/** A failed store request; `status` lets a form tell a correctable 4xx from a server or transport failure. */
export class StoreRequestError extends Error {
	constructor(
		message: string,
		readonly status: number,
		/** The message came from the server's response body rather than the request description. */
		readonly fromServer = false
	) {
		super(message);
	}
}

/** The server's reason for a rejected request, or `fallback` when the failure is not the user's to correct. */
export function rejectedRequestMessage(error: unknown, fallback: string): string {
	return error instanceof StoreRequestError && error.status < 500 && error.fromServer ? error.message : fallback;
}

export async function buildRequestError(res: Response, method: string, resource: string): Promise<Error> {
	let message = `${method} ${resource} failed (${res.status})`;
	let fromServer = false;

	try {
		const body = await res.json();
		if (typeof body === 'string' && body.trim()) {
			message = body.trim();
			fromServer = true;
		} else if (body && typeof body === 'object') {
			const record = body as Record<string, unknown>;
			const detail = [record.message, record.error, record.details, record.hint].find(
				(value) => typeof value === 'string' && value.trim().length > 0
			);
			if (typeof detail === 'string') {
				message = detail;
				fromServer = true;
			}
		}
	} catch {
		// Ignore response parsing errors and keep the fallback message.
	}

	return new StoreRequestError(message, res.status, fromServer);
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
