import type { AvailabilityEntry, StatusType } from '$features/calendar/contracts';
import { layoutBars, type AvailabilitySpan, type BarLayout, type LabelPolicy } from './barLayout';
import { toDayNumber, type DayWindow } from './dayNumber';

export interface AvailabilityTracks {
	spans(personnelId: string): readonly AvailabilitySpan[];
	layout(personnelId: string, window: DayWindow, policy: LabelPolicy): BarLayout;
	outCounts(personnelIds: Iterable<string>, window: DayWindow): readonly number[];
}

const NO_SPANS: readonly AvailabilitySpan[] = [];
const REMEMBERED_LAYOUTS = 4;

function policyKey(policy: LabelPolicy): string {
	return policy.view === 'month' ? `month:${policy.showStatusText}` : `3-month:${policy.dayPx}`;
}

export function buildAvailabilityTracks(
	entries: readonly AvailabilityEntry[],
	statusTypes: readonly StatusType[]
): AvailabilityTracks {
	const statusById = new Map(statusTypes.map((status) => [status.id, status]));
	const byPerson = new Map<string, AvailabilitySpan[]>();
	for (const entry of entries) {
		const status = statusById.get(entry.statusTypeId);
		if (!status) continue;
		const span = { entry, status, start: toDayNumber(entry.startDate), end: toDayNumber(entry.endDate) };
		const spans = byPerson.get(entry.personnelId);
		if (spans) spans.push(span);
		else byPerson.set(entry.personnelId, [span]);
	}
	for (const spans of byPerson.values()) {
		spans.sort((a, b) => a.start - b.start || (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0));
	}

	const layouts = new Map<string, Map<string, BarLayout>>();

	function spans(personnelId: string): readonly AvailabilitySpan[] {
		return byPerson.get(personnelId) ?? NO_SPANS;
	}

	function layout(personnelId: string, window: DayWindow, policy: LabelPolicy): BarLayout {
		const key = `${window.key}|${policyKey(policy)}`;
		let byPersonLayout = layouts.get(key);
		if (!byPersonLayout) {
			if (layouts.size >= REMEMBERED_LAYOUTS) layouts.delete(layouts.keys().next().value!);
			byPersonLayout = new Map();
			layouts.set(key, byPersonLayout);
		}
		let result = byPersonLayout.get(personnelId);
		if (!result) {
			result = layoutBars(spans(personnelId), window, policy);
			byPersonLayout.set(personnelId, result);
		}
		return result;
	}

	function outCounts(personnelIds: Iterable<string>, window: DayWindow): readonly number[] {
		const last = window.days - 1;
		const delta = new Array<number>(window.days + 1).fill(0);
		for (const personnelId of personnelIds) {
			let runStart = -1;
			let runEnd = -2;
			for (const span of spans(personnelId)) {
				const start = Math.max(span.start - window.start, 0);
				const end = Math.min(span.end - window.start, last);
				if (start > end) continue;
				if (start > runEnd + 1) {
					if (runStart >= 0) {
						delta[runStart]++;
						delta[runEnd + 1]--;
					}
					runStart = start;
					runEnd = end;
				} else if (end > runEnd) {
					runEnd = end;
				}
			}
			if (runStart >= 0) {
				delta[runStart]++;
				delta[runEnd + 1]--;
			}
		}
		const counts = new Array<number>(window.days);
		let running = 0;
		for (let day = 0; day < window.days; day++) {
			running += delta[day];
			counts[day] = running;
		}
		return counts;
	}

	return { spans, layout, outCounts };
}
