export function observePrint(target, action) {
	const key = '__mapPrintObservation';
	const control = target[key];
	if (action === 'arm') {
		if (control) throw new Error('Restore the previous print observation first.');
		const observation = { before: 0, after: 0 };
		observation.beforeListener = () => {
			observation.before++;
		};
		observation.afterListener = () => {
			observation.after++;
		};
		target.addEventListener('beforeprint', observation.beforeListener);
		target.addEventListener('afterprint', observation.afterListener);
		target[key] = observation;
		return { armed: true, before: 0, after: 0 };
	}
	if (action === 'state') return { armed: !!control, before: control?.before ?? 0, after: control?.after ?? 0 };
	if (action === 'restore') {
		if (!control) return { restored: false };
		target.removeEventListener('beforeprint', control.beforeListener);
		target.removeEventListener('afterprint', control.afterListener);
		delete target[key];
		return { restored: true };
	}
	throw new Error('Use print arm, state, or restore.');
}
