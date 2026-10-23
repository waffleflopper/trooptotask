import { dutyPickerOptions, type DutyPickerInput, type DutyPickerOption } from './dutyPickerOptions';

export interface DutyFillInput extends Omit<
	DutyPickerInput,
	'dateKey' | 'currentAssigneeId' | 'roster' | 'unreadRoster'
> {
	/** The open days to fill, in date order. */
	dates: readonly string[];
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

/** A Group, or a Person available that day. */
export function isFreeForDuty(option: DutyPickerOption): boolean {
	return option.kind === 'group' || option.unavailable === undefined;
}

/**
 * One slot per open day, without roster counts. A day keeps the viewer's pick; otherwise it suggests the duty
 * picker's first option, in name order, that is available that day and not already picked or suggested in this fill.
 */
export function planDutyFill(input: DutyFillInput): DutyFillSlot[] {
	const { dates, picks, ...pickerInput } = input;
	const taken = new Set(picks.values());
	return dates.map((date) => {
		const options = dutyPickerOptions({ ...pickerInput, dateKey: date });
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
