// This function runs in the owned browser page. Keep it self-contained so
// control.mjs can inject it through the native DevTools evaluation tool.
export function installNetworkControl(
	target,
	{
		mode,
		ordinal,
		suffix,
		search = null,
		failureField = null,
		failureStatus = 503,
		requestTarget = null,
		sameOrigin = false,
		requestMethod = null
	}
) {
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
		const requiredMethod =
			requestMethod ??
			(search !== null ||
			control.suffix.endsWith('/deletion-requests/review') ||
			control.suffix.endsWith('/personnel/archive-batch') ||
			control.suffix === '/admin/api/suspend' ||
			['hold-fail', 'reject', 'drop-response'].includes(control.mode)
				? 'POST'
				: null);
		if (
			parsedUrl.pathname !== control.suffix ||
			(control.mode === 'hold-dispatch' && method === 'GET') ||
			(search !== null && parsedUrl.search !== search) ||
			(requiredMethod !== null && requiredMethod !== 'ANY' && method !== requiredMethod)
		)
			return original(...input);
		if ((sameOrigin || requestTarget) && parsedUrl.origin !== new URL(target.location.href).origin)
			return original(...input);
		if (requestTarget) {
			let body = init?.body;
			if (body === undefined && typeof Request !== 'undefined' && url instanceof Request)
				body = await url.clone().formData();
			const fields = typeof body === 'string' ? new URLSearchParams(body) : body;
			if (!fields || typeof fields.get !== 'function' || fields.get(requestTarget.field) !== requestTarget.value)
				return original(...input);
		}
		const call = { method, count: 0, ids: [], notes: [], status: null };
		if (requestTarget) call.formTarget = requestTarget.value;
		try {
			const body = JSON.parse(init?.body ?? '{}');
			const records = body.records ?? [];
			if (control.suffix.endsWith('/user-preferences')) {
				call.preferencePatch = Object.fromEntries(
					Object.entries({
						calendar: [
							'showStatusText',
							'showPersonnelRoles',
							'highlightOnboarding',
							'showDaysLane',
							'showEventLanes',
							'showAssignmentLanes'
						],
						training: [
							'selectedGroupId',
							'selectedViewId',
							'matrixViewMode',
							'matrixColorAll',
							'matrixNeedsActionOnly',
							'matrixCurrentMark'
						]
					})
						.filter(([family]) => body[family] && typeof body[family] === 'object')
						.map(([family, keys]) => [
							family,
							Object.fromEntries(
								keys.filter((key) => Object.hasOwn(body[family], key)).map((key) => [key, body[family][key]])
							)
						])
				);
			}
			call.count = records.length;
			call.ids = records.map((row) => row.personnelId);
			call.notes = [...new Set(records.map((row) => row.note))];
			if (
				(control.suffix.endsWith('/personnel/archive-batch') ||
					(control.suffix.endsWith('/availability/batch') && method === 'DELETE')) &&
				Array.isArray(body.ids)
			) {
				call.ids = body.ids.filter((id) => typeof id === 'string');
				call.count = body.ids.length;
			}
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
		if (control.mode === 'error' && requestNumber === control.ordinal) {
			// SvelteKit's envelope for an action that threw: `use:enhance` receives `result.type === 'error'`.
			call.status = 500;
			return new Response(JSON.stringify({ type: 'error', error: { message: 'Synthetic server error' } }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		if (['fail', 'hold-fail'].includes(control.mode) && requestNumber === control.ordinal) {
			call.status = failureStatus;
			const body = failureField
				? {
						type: 'failure',
						status: failureStatus,
						data: JSON.stringify([{ [failureField]: 1 }, 'Synthetic request failure'])
					}
				: { message: 'Synthetic request failure' };
			const response = new Response(JSON.stringify(body), {
				status: failureStatus,
				headers: { 'Content-Type': 'application/json' }
			});
			if (control.mode === 'hold-fail')
				return new Promise((resolve) => {
					control.release = () => resolve(response);
				});
			return response;
		}
		if (control.mode === 'hold-dispatch' && requestNumber === control.ordinal) {
			call.dispatch = 'held';
			await new Promise((resolve) => {
				control.release = resolve;
			});
			call.dispatch = 'released';
		}
		const response = await original(...input);
		if (target.__mapNetwork !== control) return response;
		call.status = response.status;
		call.contentDisposition = response.headers?.get('Content-Disposition') ?? null;
		call.contentType = response.headers?.get('Content-Type') ?? null;
		if (control.mode === 'load-error' && requestNumber === control.ordinal) {
			const [head, ...streamed] = (await response.text()).split('\n');
			const envelope = JSON.parse(head);
			if (envelope?.type !== 'data' || !Array.isArray(envelope.nodes) || envelope.nodes.length === 0)
				throw new TypeError('Expected SvelteKit page data');
			envelope.nodes[envelope.nodes.length - 1] = {
				type: 'error',
				status: 503,
				error: { message: 'Synthetic request failure' }
			};
			call.failure = 'page-load';
			return new Response([JSON.stringify(envelope), ...streamed].join('\n'), {
				status: response.status,
				headers: { 'Content-Type': call.contentType ?? 'application/json' }
			});
		}
		if (['hold-regions', 'fail-regions'].includes(control.mode) && requestNumber === control.ordinal) {
			// A streamed page read sends its page node first and each deferred region as a later chunk line.
			const [head, ...rest] = (await response.text()).split('\n');
			const chunks = rest.filter(Boolean);
			if (JSON.parse(head)?.type !== 'data' || chunks.length === 0) throw new TypeError('Expected streamed regions');
			const responseInit = {
				status: response.status,
				headers: { 'Content-Type': call.contentType ?? 'application/json' }
			};
			if (control.mode === 'fail-regions') {
				call.failure = 'region';
				const failed = chunks.map((line) =>
					JSON.stringify({
						type: 'chunk',
						id: JSON.parse(line).id,
						error: [{ message: 1 }, 'Synthetic region failure']
					})
				);
				return new Response([head, ...failed].join('\n') + '\n', responseInit);
			}
			call.dispatch = 'held';
			const encoder = new TextEncoder();
			return new Response(
				new ReadableStream({
					start(stream) {
						stream.enqueue(encoder.encode(head + '\n'));
						control.release = () => {
							call.dispatch = 'released';
							stream.enqueue(encoder.encode(chunks.join('\n') + '\n'));
							stream.close();
						};
					}
				}),
				responseInit
			);
		}
		if (control.mode === 'drop-response' && requestNumber === control.ordinal) {
			call.failure = 'response';
			throw new TypeError('Synthetic response lost after real dispatch');
		}
		if (control.mode === 'hold' && requestNumber === control.ordinal)
			return new Promise((resolve) => {
				control.release = () => resolve(response);
			});
		return response;
	};
	return { armed: true, mode, suffix, ordinal };
}
