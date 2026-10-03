// This function runs in the owned browser page. Keep it self-contained so
// control.mjs can inject it through the native DevTools evaluation tool.
export function installNetworkControl(target, { mode, ordinal, suffix, search = null, failureField = null }) {
	if (target.__mapNetwork) throw new Error('Restore the existing map network control first');
	const original = target.fetch;
	const control = { original, calls: [], release: null, mode, ordinal, suffix };
	target.__mapNetwork = control;
	target.fetch = async (...input) => {
		// A client may have captured this wrapper; restore must disable that reference too.
		if (target.__mapNetwork !== control) return original(...input);
		const [url, init] = input;
		const requestUrl = typeof Request !== 'undefined' && url instanceof Request ? url.url : String(url);
		const parsedUrl = new URL(requestUrl, target.location?.href ?? 'http://localhost/');
		const method = String(
			init?.method ?? (typeof Request !== 'undefined' && url instanceof Request ? url.method : 'GET')
		).toUpperCase();
		if (
			parsedUrl.pathname !== control.suffix ||
			(search !== null && parsedUrl.search !== search) ||
			((search !== null ||
				control.suffix.endsWith('/deletion-requests/review') ||
				['hold-fail', 'reject'].includes(control.mode)) &&
				method !== 'POST')
		)
			return original(...input);
		const call = { method, count: 0, ids: [], notes: [], status: null };
		try {
			const body = JSON.parse(init?.body ?? '{}');
			const records = body.records ?? [];
			call.count = records.length;
			call.ids = records.map((row) => row.personnelId);
			call.notes = [...new Set(records.map((row) => row.note))];
			if (control.suffix.endsWith('/deletion-requests/review'))
				call.review = {
					id: typeof body.id === 'string' ? body.id : null,
					action: typeof body.action === 'string' ? body.action : null,
					denialReason: typeof body.denialReason === 'string' ? body.denialReason : null
				};
		} catch {
			// GET requests and non-JSON bodies have no batch record details.
		}
		const requestNumber = control.calls.push(call);
		if (control.mode === 'reject' && requestNumber === control.ordinal) {
			call.failure = 'transport';
			throw new TypeError('Synthetic network rejection');
		}
		if (['fail', 'hold-fail'].includes(control.mode) && requestNumber === control.ordinal) {
			call.status = 503;
			const body = failureField
				? { type: 'failure', status: 503, data: JSON.stringify([{ [failureField]: 1 }, 'Synthetic request failure']) }
				: { message: 'Synthetic request failure' };
			const response = new Response(JSON.stringify(body), {
				status: 503,
				headers: { 'Content-Type': 'application/json' }
			});
			if (control.mode === 'hold-fail')
				return new Promise((resolve) => {
					control.release = () => resolve(response);
				});
			return response;
		}
		const response = await original(...input);
		if (target.__mapNetwork !== control) return response;
		call.status = response.status;
		call.contentDisposition = response.headers?.get('Content-Disposition') ?? null;
		call.contentType = response.headers?.get('Content-Type') ?? null;
		if (control.mode === 'hold' && requestNumber === control.ordinal)
			return new Promise((resolve) => {
				control.release = () => resolve(response);
			});
		return response;
	};
	return { armed: true, mode, suffix, ordinal };
}
