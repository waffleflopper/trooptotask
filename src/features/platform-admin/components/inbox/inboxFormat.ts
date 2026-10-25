const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long an item has waited, in the queue's compact form: 5m, 2h, 3d. */
export function formatAge(iso: string, now: Date): string {
	const elapsed = Math.max(0, now.getTime() - new Date(iso).getTime());
	if (elapsed < MINUTE) return 'now';
	if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
	if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
	return `${Math.floor(elapsed / DAY)}d`;
}

const sameDay = (a: Date, b: Date) =>
	a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** When something happened, in the operator's own time: "today at 07:12", "21 Oct at 09:30". */
export function formatWhen(iso: string, now: Date): string {
	const at = new Date(iso);
	const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
	if (sameDay(at, now)) return `today at ${time}`;
	if (sameDay(at, new Date(now.getTime() - DAY))) return `yesterday at ${time}`;
	const date = at.toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		...(at.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' })
	});
	return `${date} at ${time}`;
}
