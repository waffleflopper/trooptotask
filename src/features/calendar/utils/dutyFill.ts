import { dutyPickerOptions, type DutyPickerInput, type DutyPickerOption } from './dutyPickerOptions';

/** One open day, with its roster read when the operator sees roster counts. */
export interface DutyFillDay extends Pick<DutyPickerInput, 'roster' | 'unreadRoster'> {
	date: string;
}

export interface DutyFillInput extends Omit<
	DutyPickerInput,
	'dateKey' | 'currentAssigneeId' | 'roster' | 'unreadRoster'
> {
	/** The open days to fill, in date order. */
	days: readonly DutyFillDay[];
	/** Assignees the viewer picked, by date; no suggestion repeats them. */
	picks: ReadonlyMap<string, string>;
}

export interface DutyFillSlot {
	date: string;
	/** The duty picker's options for the day, with the slot's choice marked current. */
	options: DutyPickerOption[];
	/** Who the slot saves, or null when nobody eligible is left. */
	choice: DutyPickerOption | null;
	picked: boolean;
}

/** A Group, or a Person on the list available that day. People off the roster or without a count are search-only. */
export function isFreeForDuty(option: DutyPickerOption): boolean {
	return option.kind === 'group' || (option.unavailable === undefined && !option.offRoster && !option.countUnavailable);
}

/**
 * One slot per open day. A day keeps the viewer's pick; otherwise it suggests the duty picker's first option that is
 * free that day and not already picked or suggested in this fill, so a roster's next up comes first.
 */
export function planDutyFill(input: DutyFillInput): DutyFillSlot[] {
	const { days, picks, ...pickerInput } = input;
	const taken = new Set(picks.values());
	return days.map(({ date, roster, unreadRoster }) => {
		const options = dutyPickerOptions({ ...pickerInput, dateKey: date, roster, unreadRoster });
		const pickedId = picks.get(date);
		const choice =
			pickedId === undefined
				? (options.find((option) => isFreeForDuty(option) && !taken.has(option.id)) ?? null)
				: (options.find((option) => option.id === pickedId) ?? null);
		if (choice) taken.add(choice.id);
		return {
			date,
			options: options.map((option) => ({ ...option, current: option.id === choice?.id })),
			choice,
			picked: pickedId !== undefined
		};
	});
}
