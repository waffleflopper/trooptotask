// Ordinary authenticated requests from an owned app page. The optional capture
// mode records pending HTTP outcomes; it never invokes handlers or edits app state.
export async function requestOnboarding(target, { origin, organizationSegment, method, family, body, mode = 'await' }) {
	if (target.location.origin !== origin) throw new Error('Use an owned app page');
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(organizationSegment)) throw new Error('Invalid Organization segment');
	const fields = {
		onboarding: { POST: ['personnelId', 'templateId', 'startedAt'], PUT: ['id', 'status'] },
		'onboarding-steps': {
			PUT: ['action', 'stepId', 'completed', 'stageName', 'text'],
			DELETE: ['id']
		},
		'onboarding-resync': { POST: ['onboardingId', 'newTemplateId'] }
	};
	if (!Object.hasOwn(fields, family) || !Object.hasOwn(fields[family], method))
		throw new Error('Unsupported Onboarding request');
	if (!['await', 'start'].includes(mode)) throw new Error('Unsupported capture mode');
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Use a JSON object');
	for (const [key, value] of Object.entries(body)) {
		if (!fields[family][method].includes(key)) throw new Error('Unsupported Onboarding field');
		if (value !== null && !['string', 'number', 'boolean'].includes(typeof value))
			throw new Error('Use scalar Onboarding values');
	}
	const path = `/org/${organizationSegment}/api/${family}`;
	const request = { method, path, submitted: body };
	const send = async () => {
		const response = await target.fetch(path, {
			method,
			redirect: 'manual',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		return {
			request,
			status: response.status,
			body: await response.text(),
			contentType: response.headers.get('Content-Type')
		};
	};
	if (mode === 'await') return send();
	const capture = (target.__t2tOnboardingRequests ??= { nextId: 1, requests: [] });
	if (capture.requests.length >= 4) throw new Error('Read and restore the existing request captures first');
	const record = { id: capture.nextId++, request, state: 'pending', response: null };
	capture.requests.push(record);
	send().then(
		(response) => {
			record.response = response;
			record.state = 'completed';
		},
		() => {
			record.state = 'failed';
			record.error = 'Request transport or response body capture failed';
		}
	);
	return { started: record.id, request };
}

export function readOnboardingRequests(target, origin, restore = false) {
	if (target.location.origin !== origin) throw new Error('Use an owned app page');
	const capture = target.__t2tOnboardingRequests;
	if (restore) {
		if (capture?.requests.some((request) => request.state === 'pending'))
			throw new Error('Wait for pending requests before restoring capture');
		delete target.__t2tOnboardingRequests;
		return { restored: Boolean(capture) };
	}
	return { requests: capture?.requests ?? [] };
}
