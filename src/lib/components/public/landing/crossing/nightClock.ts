/** The night clock runs from Sunday 2214 (p 0.05) to Monday 0247 (p 0.54), one minute at a time. */
const FIRST_MINUTE = 22 * 60 + 14;
const LAST_MINUTE = 24 * 60 + 2 * 60 + 47;
const MINUTES_PER_DAY = 24 * 60;

/** Minutes since Sunday 0000 shown at a given scroll progress. */
export function nightClockMinute(progress: number): number {
	const t = Math.min(1, Math.max(0, (progress - 0.05) / 0.49));
	return FIRST_MINUTE + Math.round(t * (LAST_MINUTE - FIRST_MINUTE));
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Day label and 24-hour digits for a minute counted from Sunday 0000. */
export function clockReading(minute: number): { day: 'Sun' | 'Mon'; time: string } {
	const time = minute % MINUTES_PER_DAY;
	return {
		day: minute < MINUTES_PER_DAY ? 'Sun' : 'Mon',
		time: `${pad(Math.floor(time / 60))}${pad(time % 60)}`
	};
}
