import { describe, expect, it } from 'vitest';
import { armedStart, gestureRange, gestureStep, IDLE, type GestureEvent, type GestureState } from './calendarGesture';

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

	describe('touch taps', () => {
		const tap = (day: number, x: number, personId = 'p1'): GestureEvent[] => [
			{ type: 'press-day', personId, day, x, pointerId: 1, pointerType: 'touch' },
			release
		];
		const armedAt = (day: number): GestureState => ({ kind: 'armed', personId: 'p1', day });
		const consumeClick = '{"type":"consume-click"}';

		it('arms the first tapped day and swallows the click that would open the day editor', () => {
			expect(run(tap(4, 100))).toEqual({ state: armedAt(4), effects: ['-', consumeClick] });
		});

		it('offers the range between two taps in one row, whichever came first', () => {
			expect(run([...tap(4, 100), ...tap(9, 300)]).effects.at(-1)).toBe(
				'{"type":"quick-add","personId":"p1","start":4,"end":9}'
			);
			expect(run([...tap(9, 300), ...tap(4, 100)])).toEqual({
				state: IDLE,
				effects: ['-', consumeClick, '-', '{"type":"quick-add","personId":"p1","start":4,"end":9}']
			});
		});

		it('offers a one-day range when the same day is tapped twice', () => {
			expect(run([...tap(4, 100), ...tap(4, 100)]).effects.at(-1)).toBe(
				'{"type":"quick-add","personId":"p1","start":4,"end":4}'
			);
		});

		it('drops the start day and swallows the click when the second tap lands in another row', () => {
			expect(run([...tap(4, 100), ...tap(9, 300, 'p2')])).toEqual({
				state: IDLE,
				effects: ['-', consumeClick, '-', consumeClick]
			});
		});

		it('treats a touch that leaves its day as a pan and keeps nothing armed', () => {
			expect(run([...tap(4, 100).slice(0, 1), move(5, 140), release])).toEqual({
				state: IDLE,
				effects: ['-', '-', '-']
			});
		});

		it('treats a touch that slides past the drag threshold on one day as a pan', () => {
			expect(run([...tap(4, 100).slice(0, 1), move(4, 106)]).state).toEqual(IDLE);
			expect(run([...tap(4, 100).slice(0, 1), move(4, 103)]).state.kind).toBe('tapping');
		});

		it('keeps the armed start day through a pan and completes with a later tap', () => {
			const pan = run([...tap(4, 100), ...tap(9, 300).slice(0, 1), move(10, 340), release]);

			expect(pan.state).toEqual(armedAt(4));
			expect(run([...tap(9, 300)], pan.state).effects).toEqual([
				'-',
				'{"type":"quick-add","personId":"p1","start":4,"end":9}'
			]);
		});

		it('keeps the armed start day when the browser takes the touch for scrolling', () => {
			const { state } = run([...tap(4, 100), ...tap(9, 300).slice(0, 1)]);

			expect(state.kind).toBe('tapping');
			expect(gestureStep(state, { type: 'pointer-cancel', pointerId: 1 }).state).toEqual(armedAt(4));
			expect(gestureStep(state, { type: 'pointer-cancel', pointerId: 2 }).state).toBe(state);
			expect(gestureStep(armedAt(4), { type: 'pointer-cancel', pointerId: 1 }).state).toEqual(armedAt(4));
		});

		it('ends in idle when the browser takes a first touch, and for any desktop gesture', () => {
			const states = [
				run(tap(4, 100).slice(0, 1)).state,
				run([press(4, 100)]).state,
				run([press(4, 100), move(6, 160)]).state
			];

			expect(states.map((state) => gestureStep(state, { type: 'pointer-cancel', pointerId: 1 }).state)).toEqual([
				IDLE,
				IDLE,
				IDLE
			]);
		});

		it('dismisses an armed start day, and one that is being completed, on cancel', () => {
			const completing = run([...tap(4, 100), ...tap(9, 300).slice(0, 1)]).state;

			expect(gestureStep(armedAt(4), { type: 'cancel' })).toEqual({ state: IDLE, effect: { type: 'none' } });
			expect(gestureStep(completing, { type: 'cancel' })).toEqual({ state: IDLE, effect: { type: 'none' } });
		});

		it('ignores a second finger and a touch on a resize edge', () => {
			const held = run(tap(4, 100).slice(0, 1)).state;
			const secondFinger: GestureEvent = {
				type: 'press-day',
				personId: 'p1',
				day: 8,
				x: 280,
				pointerId: 2,
				pointerType: 'touch'
			};
			const edge: GestureEvent = {
				type: 'press-edge',
				personId: 'p1',
				entryId: 'e1',
				edge: 'end',
				start: 2,
				end: 5,
				pointerId: 1,
				pointerType: 'touch'
			};

			expect(gestureStep(held, secondFinger).state).toBe(held);
			expect(gestureStep(armedAt(4), edge).state).toEqual(armedAt(4));
		});

		it('starts a normal mouse gesture from an armed state and forgets the start day', () => {
			const { state, effects } = run([press(2, 50), move(6, 200), release], armedAt(4));

			expect(state).toEqual(IDLE);
			expect(effects.at(-1)).toBe('{"type":"quick-add","personId":"p1","start":2,"end":6}');
			expect(run([press(2, 50)], armedAt(4)).state.kind).toBe('pressing');
		});

		it('marks the armed day as a one-day range, also while a later touch is down', () => {
			const completing = run(tap(9, 300).slice(0, 1), armedAt(4)).state;

			expect(gestureRange(armedAt(4))).toEqual({ start: 4, end: 4 });
			expect(gestureRange(completing)).toEqual({ start: 4, end: 4 });
			expect(armedStart(completing)).toEqual({ personId: 'p1', day: 4 });
			expect(gestureRange(run(tap(9, 300).slice(0, 1)).state)).toBeNull();
		});
	});
});
