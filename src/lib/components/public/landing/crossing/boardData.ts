/**
 * The platoon calendar the crossing sorts itself into, the stray facts that
 * never land, and the seeded scatter every chip starts from. Hand-authored
 * illustration data (fictional Soldiers); `boardData.test.ts` guards its invariants.
 */

export const statusKey = {
	leave: { code: 'LV', name: 'Leave' },
	school: { code: 'SCH', name: 'School' },
	tdy: { code: 'TDY', name: 'TDY' },
	appt: { code: 'APPT', name: 'Appointment' },
	field: { code: 'FLD', name: 'Field' }
} as const;

export type Status = keyof typeof statusKey;

export interface Block {
	status: Status;
	/** First day column; column 0 is today, a Monday. */
	start: number;
	/** Days covered. */
	span: number;
}

export interface Soldier {
	rank: string;
	name: string;
	blocks: Block[];
}

export interface Group {
	name: string;
	soldiers: Soldier[];
}

/** Wide frames show two weeks and both groups; phones show the first week of the first group. */
export const DAY_COUNT = 14;
export const PHONE_DAY_COUNT = 7;
export const PHONE_GROUP_COUNT = 1;

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const days = Array.from({ length: DAY_COUNT }, (_, column) => ({
	weekday: weekdays[column % 7],
	date: 12 + column,
	weekend: column % 7 >= 5
}));

const block = (status: Status, start: number, span = 1): Block => ({ status, start, span });

export const groups: Group[] = [
	{
		name: '1st Platoon',
		soldiers: [
			{ rank: '1LT', name: 'Dawson', blocks: [block('field', 0, 4)] },
			{ rank: 'SFC', name: 'Powell', blocks: [block('field', 0, 4), block('tdy', 7, 4)] },
			{ rank: 'SSG', name: 'Griffin', blocks: [block('field', 0, 4), block('school', 6, 8)] },
			{ rank: 'SSG', name: 'Navarro', blocks: [block('leave', 0, 5), block('appt', 10)] },
			{ rank: 'SGT', name: 'Hughes', blocks: [block('field', 0, 3), block('appt', 3), block('leave', 11, 3)] },
			{ rank: 'SGT', name: 'Fletcher', blocks: [block('field', 0, 4), block('leave', 8, 5)] },
			{ rank: 'SPC', name: 'Coleman', blocks: [block('field', 0, 4), block('appt', 4)] },
			{ rank: 'PFC', name: 'Murphy', blocks: [block('field', 0, 4), block('leave', 4, 5)] }
		]
	},
	{
		name: '2nd Platoon',
		soldiers: [
			{ rank: '2LT', name: 'Holland', blocks: [block('school', 0, 5)] },
			{ rank: 'SFC', name: 'Ortega', blocks: [block('field', 9, 3)] },
			{ rank: 'SSG', name: 'Turner', blocks: [block('tdy', 3, 4), block('field', 9, 3)] },
			{ rank: 'SGT', name: 'Park', blocks: [block('leave', 0, 2), block('field', 9, 3)] },
			{ rank: 'SPC', name: 'Vega', blocks: [block('leave', 5, 4), block('field', 9, 3)] }
		]
	}
];

export const soldierCount = groups.reduce((count, group) => count + group.soldiers.length, 0);

/** Scraps of the old system. They light up with the facts but never land. */
const noise: { text: string; rank?: string }[] = [
	{ text: 'FINAL_v7.xlsx' },
	{ text: '??' },
	{ text: 'who has this?' },
	{ text: 'old' },
	{ text: 'v3 (2)' },
	{ text: 'TBD' },
	{ text: '#REF!' },
	// A stale duplicate: she made SGT, the spreadsheet never heard.
	{ rank: 'SPC', text: 'Fletcher' }
];

/** A point in the pinned frame (a chip's centre), as fractions of the frame's width and height. */
export interface Point {
	x: number;
	y: number;
}

export interface Rect {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

type FrameKind = 'wide' | 'phone';

/**
 * Where the night captions sit, grown by half a chip, as frame fractions.
 * No chip may start inside it. Wide frames keep captions in the left column;
 * phones run them full width.
 */
export const captionBand: Record<FrameKind, Rect> = {
	wide: { left: 0, right: 0.8, top: 0.25, bottom: 0.75 },
	phone: { left: 0, right: 1, top: 0.3, bottom: 0.7 }
};

const scatterAreas: Record<
	FrameKind,
	{ bounds: Rect; avoid: Rect[]; width: number; height: number; rowHeight: number }
> = {
	// Below the nav, clear of the night clock (top right) and of the frame's bottom edge,
	// so every chip is still ahead of the phase line when its flight begins.
	wide: {
		bounds: { left: 0.05, right: 0.95, top: 0.1, bottom: 0.86 },
		avoid: [captionBand.wide, { left: 0.74, right: 1, top: 0, bottom: 0.21 }],
		width: 1440,
		height: 900,
		rowHeight: 38
	},
	phone: {
		bounds: { left: 0.15, right: 0.85, top: 0.1, bottom: 0.86 },
		avoid: [captionBand.phone, { left: 0.66, right: 1, top: 0, bottom: 0.17 }],
		width: 390,
		height: 844,
		rowHeight: 44
	}
};

interface ChipMotion {
	/** Scatter position on wide frames (desktop, tablet). */
	wide: Point;
	/** Scatter position on phones; absent when the chip has no place on the phone board. */
	phone?: Point;
	/** Tilt in degrees and scale while scattered. */
	tilt: number;
	shrink: number;
	/** Progress at which the chip lights up among the mess. */
	appear: number;
	/** Extra head start on the flight, in progress. */
	lead: number;
}

type ChipFact =
	| { kind: 'name'; rank: string; name: string; row: number; group: number }
	| {
			kind: 'block';
			status: Status;
			row: number;
			group: number;
			start: number;
			span: number;
			/** Span clipped to the phone board's first week. */
			phoneSpan: number;
	  }
	| { kind: 'noise'; rank?: string; text: string };

export type Chip = ChipFact & ChipMotion;

/** Small deterministic PRNG (mulberry32) so the server and client render the same scatter. */
function seeded(seed: number) {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const round = (value: number) => Math.round(value * 1000) / 1000;
const between = (random: () => number, low: number, high: number) => round(low + (high - low) * random());
const inside = (rect: Rect, { x, y }: Point) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

/** Rough on-screen size of a chip, in reference pixels, for spacing the scatter. */
function chipSize(fact: ChipFact, rowHeight: number) {
	if (fact.kind === 'block') return { width: 44, height: rowHeight };
	const text = fact.kind === 'name' ? `${fact.rank} ${fact.name}` : `${fact.rank ?? ''} ${fact.text}`;
	return { width: text.length * 7.5 + 18, height: 26 };
}

/** Rejection-sample a point per chip: inside the bounds, outside the reserved rects, and clear of earlier chips when possible. */
function scatter(facts: ChipFact[], kind: FrameKind, random: () => number): Point[] {
	const { bounds, avoid, width, height, rowHeight } = scatterAreas[kind];
	const placed: { at: Point; width: number; height: number }[] = [];

	return facts.map((fact) => {
		const size = chipSize(fact, rowHeight);
		let chosen: Point | undefined;
		for (let attempt = 0; attempt < 500; attempt++) {
			const at = { x: between(random, bounds.left, bounds.right), y: between(random, bounds.top, bounds.bottom) };
			if (avoid.some((rect) => inside(rect, at))) continue;
			chosen ??= at;
			const clear = placed.every(
				(other) =>
					Math.abs(at.x - other.at.x) * width > (size.width + other.width) / 2 + 8 ||
					Math.abs(at.y - other.at.y) * height > (size.height + other.height) / 2 + 8
			);
			if (clear) {
				chosen = at;
				break;
			}
		}
		if (!chosen) throw new Error(`No room to scatter a chip on the ${kind} frame`);
		placed.push({ at: chosen, ...size });
		return chosen;
	});
}

function buildChips(): Chip[] {
	const facts: ChipFact[] = [];
	let row = 0;
	groups.forEach((group, groupIndex) => {
		for (const soldier of group.soldiers) {
			facts.push({ kind: 'name', rank: soldier.rank, name: soldier.name, row, group: groupIndex });
			for (const { status, start, span } of soldier.blocks) {
				const phoneSpan = Math.max(0, Math.min(start + span, PHONE_DAY_COUNT) - start);
				facts.push({ kind: 'block', status, row, group: groupIndex, start, span, phoneSpan });
			}
			row++;
		}
	});
	facts.push(...noise.map((scrap) => ({ kind: 'noise' as const, ...scrap })));

	const onPhone = (fact: ChipFact) =>
		fact.kind === 'noise' || (fact.group < PHONE_GROUP_COUNT && (fact.kind === 'name' || fact.phoneSpan > 0));

	const random = seeded(2214);
	const wide = scatter(facts, 'wide', random);
	const phoneFacts = facts.filter(onPhone);
	const phonePoints = scatter(phoneFacts, 'phone', random);
	const phone = new Map(phoneFacts.map((fact, index) => [fact, phonePoints[index]]));

	return facts.map((fact, index) => ({
		...fact,
		wide: wide[index],
		phone: phone.get(fact),
		tilt: between(random, -14, 14),
		shrink: between(random, 0.8, 0.94),
		appear: between(random, 0.54, 0.585),
		lead: between(random, 0, 0.012)
	}));
}

export const chips = buildChips();
