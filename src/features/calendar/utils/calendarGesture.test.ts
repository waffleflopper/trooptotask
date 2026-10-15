import { describe, expect, it } from 'vitest';
import { gestureRange, gestureStep, IDLE, type GestureEvent, type GestureState } from './calendarGesture';

const press = (day: number, x: number, pointerType = 'mouse'): GestureEvent => ({
	type: 'press-day',
	personId: 'p1',
	day,
	x,
	pointerId: 1,
	pointerType
});
const move = (day: number, x: number): GestureEvent => ({ type: 'move', day, x, pointerId: 1 });
const release: GestureEvent = { type: 'release', pointerId: 1 };

function run(events: GestureEvent[], from: GestureState = IDLE) {
	let state = from;
	const effects: string[] = [];
	for (const event of events) {
		const step = gestureStep(state, event);
		state = step.state;
		effects.push(step.effect.type === 'none' ? '-' : JSON.stringify(step.effect));
	}
	return { state, effects };
}

describe('gestureStep', () => {
	it('leaves a press and release on one day to the native click', () => {
		expect(run([press(4, 100), move(4, 102), release])).toEqual({ state: IDLE, effects: ['-', '-', '-'] });
	});

	it('ignores movement within the threshold even when it crosses into the next day', () => {
		expect(run([press(4, 100), move(5, 104)]).state.kind).toBe('pressing');
	});

	it('captures the pointer once a drag reaches another day and offers the range on release', () => {
		expect(run([press(6, 200), move(5, 180), move(3, 110), release])).toEqual({
			state: IDLE,
			effects: ['-', '{"type":"capture"}', '-', '{"type":"quick-add","personId":"p1","start":3,"end":6}']
		});
	});

	it('never starts a drag from touch', () => {
		expect(run([press(4, 100, 'touch'), move(8, 300)]).state).toEqual(IDLE);
	});

	it('cancels from any state without an effect', () => {
		const states = [
			run([press(4, 100)]).state,
			run([press(4, 100), move(6, 160)]).state,
			run([
				{
					type: 'press-edge',
					personId: 'p1',
					entryId: 'e1',
					edge: 'end',
					start: 2,
					end: 5,
					pointerId: 1,
					pointerType: 'mouse'
				}
			]).state
		];

		expect(states.map((state) => state.kind)).toEqual(['pressing', 'selecting', 'resizing']);
		expect(states.map((state) => gestureStep(state, { type: 'cancel' }))).toEqual([
			{ state: IDLE, effect: { type: 'none' } },
			{ state: IDLE, effect: { type: 'none' } },
			{ state: IDLE, effect: { type: 'none' } }
		]);
	});

	it('ignores another pointer while one gesture runs', () => {
		const other: GestureEvent[] = [
			{ type: 'move', day: 9, x: 300, pointerId: 2 },
			{ type: 'release', pointerId: 2 }
		];

		expect(run([press(4, 100), move(6, 160), ...other, release]).effects).toEqual([
			'-',
			'{"type":"capture"}',
			'-',
			'-',
			'{"type":"quick-add","personId":"p1","start":4,"end":6}'
		]);
	});

	describe('resizing', () => {
		const pressStart: GestureEvent = {
			type: 'press-edge',
			personId: 'p1',
			entryId: 'e1',
			edge: 'start',
			start: 3,
			end: 6,
			pointerId: 1,
			pointerType: 'mouse'
		};

		it('clamps a dragged start at the fixed end so the range never inverts', () => {
			const { state } = run([pressStart, move(9, 400)]);

			expect(gestureRange(state)).toEqual({ start: 6, end: 6 });
			expect(gestureStep(state, release).effect).toEqual({
				type: 'resize',
				personId: 'p1',
				entryId: 'e1',
				start: 6,
				end: 6
			});
		});

		it('keeps an end that sits past the window fixed while the start moves', () => {
			const { state } = run([{ ...pressStart, end: 40 }, move(1, 20)]);

			expect(gestureStep(state, release).effect).toEqual({
				type: 'resize',
				personId: 'p1',
				entryId: 'e1',
				start: 1,
				end: 40
			});
		});

		it('saves nothing when the edge returns to where it started', () => {
			expect(run([pressStart, move(1, 20), move(3, 90), release]).effects.at(-1)).toBe('-');
		});
	});
});
