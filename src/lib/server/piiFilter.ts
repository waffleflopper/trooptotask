const SENSITIVE_FIELDS = new Set([
	'emergencyContactName',
	'emergencyContactRelationship',
	'emergencyContactPhone',
	'spouseName',
	'spousePhone',
	'personalEmail',
	'personalPhone',
	'addressStreet',
	'addressCity',
	'addressState',
	'addressZip',
	'vehicleMakeModel',
	'vehiclePlate',
	'vehicleColor',
	'leaderNotes'
]);

export function redactSensitiveFields<T extends Record<string, unknown>>(data: T): Partial<T> {
	const filtered: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(data)) {
		if (!SENSITIVE_FIELDS.has(key)) {
			filtered[key] = value;
		}
	}
	return filtered as Partial<T>;
}
