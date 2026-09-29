import { describe, expect, it } from 'vitest';
import {
	DAY_COUNT,
	PHONE_DAY_COUNT,
	PHONE_GROUP_COUNT,
	captionBand,
	chips,
	groups,
	statusKey,
	type Point,
	type Rect
} from './boardData';

const soldiers = groups.flatMap((group) => group.soldiers);
const blocks = soldiers.flatMap((soldier) => soldier.blocks);
const outside = (band: Rect, { x, y }: Point) => x < band.left || x > band.right || y < band.top || y > band.bottom;

describe('availability board data', () => {
	it('keeps every block inside the two-week window', () => {
		for (const { start, span } of blocks) {
			expect(start).toBeGreaterThanOrEqual(0);
			expect(span).toBeGreaterThanOrEqual(1);
			expect(start + span).toBeLessThanOrEqual(DAY_COUNT);
		}
	});

	it('never overlaps two blocks in one Soldier row', () => {
		for (const soldier of soldiers) {
			const taken = new Set<number>();
			for (const { start, span } of soldier.blocks) {
				for (let day = start; day < start + span; day++) {
					expect(taken.has(day), `${soldier.name} is double-booked on day ${day}`).toBe(false);
					taken.add(day);
				}
			}
		}
	});

	it('uses only the five availability statuses', () => {
		const codes = blocks.map(({ status }) => statusKey[status]?.code);
		for (const code of codes) expect(['LV', 'SCH', 'TDY', 'APPT', 'FLD']).toContain(code);
	});

	it('names every Soldier once', () => {
		const names = soldiers.map((soldier) => soldier.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it('gives every Soldier on the phone board something in the first week', () => {
		const phoneSoldiers = groups.slice(0, PHONE_GROUP_COUNT).flatMap((group) => group.soldiers);
		for (const soldier of phoneSoldiers) {
			expect(
				soldier.blocks.some((block) => block.start < PHONE_DAY_COUNT),
				soldier.name
			).toBe(true);
		}
	});
});

describe('chip scatter', () => {
	it('never starts a chip in the caption band', () => {
		for (const chip of chips) {
			expect(outside(captionBand.wide, chip.wide), `wide ${JSON.stringify(chip.wide)}`).toBe(true);
			if (chip.phone) expect(outside(captionBand.phone, chip.phone), `phone ${JSON.stringify(chip.phone)}`).toBe(true);
		}
	});

	it('keeps every chip inside the frame', () => {
		const points = chips.flatMap((chip) => (chip.phone ? [chip.wide, chip.phone] : [chip.wide]));
		for (const { x, y } of points) {
			expect(x).toBeGreaterThan(0);
			expect(x).toBeLessThan(1);
			expect(y).toBeGreaterThan(0);
			expect(y).toBeLessThan(1);
		}
	});
});
