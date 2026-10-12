// Injected only through the owned worker's native DevTools control. Requests use
// the page's ordinary signed-in session; no provider credentials enter the page.
export async function requestSettings(target, { origin, organizationSegment, family, body }) {
	if (target.location.origin !== origin) throw new Error('Use an owned app page');
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(organizationSegment)) throw new Error('Invalid Organization segment');
	const fields = {
		'organization/settings': [
			'archiveRetentionMonths',
			'lossWarningWindowDays',
			'trainingReadinessGoalPercent',
			'personnelDocumentStorageCapMb',
			'criticalTasksDefaultExpirationMonths',
			'criticalTasksExpiringSoonWarningDays'
		],
		'settings/general/updateName': ['name'],
		'settings/general/updateSlug': ['urlSlug'],
		'settings/general/clearSlug': [],
		'settings/danger/deleteOrganization': ['confirmName'],
		'settings/members/invite': ['email', 'membershipRole', 'memberPreset']
	};
	if (!Object.hasOwn(fields, family)) throw new Error('Unsupported settings request');
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Use a JSON object');
	for (const [key, value] of Object.entries(body)) {
		if (!fields[family].includes(key)) throw new Error('Unsupported settings field');
		if (value !== null && !['string', 'number', 'boolean'].includes(typeof value))
			throw new Error('Use scalar settings values');
	}
	const form = family !== 'organization/settings';
	const split = family.lastIndexOf('/');
	const path = form
		? `/org/${organizationSegment}/${family.slice(0, split)}?/${family.slice(split + 1)}`
		: `/org/${organizationSegment}/api/${family}`;
	const response = await target.fetch(path, {
		method: 'POST',
		redirect: 'manual',
		headers: form
			? { 'Content-Type': 'application/x-www-form-urlencoded', 'x-sveltekit-action': 'true' }
			: { 'Content-Type': 'application/json' },
		body: form ? new URLSearchParams(body).toString() : JSON.stringify(body)
	});
	return {
		request: { method: 'POST', path, submitted: body },
		status: response.status,
		body: await response.text(),
		contentType: response.headers.get('Content-Type')
	};
}
