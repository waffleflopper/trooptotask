// This function runs in the owned browser page. Keep it self-contained so
// control.mjs can inject it through the native DevTools evaluation tool.
export function installNetworkControl(target, { mode, ordinal, suffix }) {
	if (target.__mapNetwork) throw new Error('Restore the existing map network control first');
	const original = target.fetch;
	const control = { original, calls: [], release: null, mode, ordinal, suffix };
	target.__mapNetwork = control;
	target.fetch = async (...input) => {
		const [url, init] = input;
		const requestUrl = typeof Request !== 'undefined' && url instanceof Request ? url.url : String(url);
		const pathname = new URL(requestUrl, target.location?.href ?? 'http://localhost/').pathname;
		if (pathname !== control.suffix) return original(...input);
		const call = { method: init?.method ?? 'GET', count: 0, ids: [], notes: [], status: null };
		try {
			const records = JSON.parse(init?.body ?? '{}').records ?? [];
			call.count = records.length;
			call.ids = records.map((row) => row.personnelId);
			call.notes = [...new Set(records.map((row) => row.note))];
		} catch {
			// GET requests and non-JSON bodies have no batch record details.
		}
		const requestNumber = control.calls.push(call);
		if (control.mode === 'fail' && requestNumber === control.ordinal) {
			call.status = 503;
			return new Response(JSON.stringify({ message: 'Synthetic request failure' }), {
				status: 503,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		const response = await original(...input);
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
