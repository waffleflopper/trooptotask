/** A touch start day waiting for its end tap. */
export interface Armed {
	readonly personId: string;
	readonly day: number;
}

export type GestureState =
	| { readonly kind: 'idle' }
	| ({ readonly kind: 'armed' } & Armed)
	| {
			readonly kind: 'tapping';
			readonly personId: string;
			readonly day: number;
			readonly x: number;
			readonly pointerId: number;
			/** The start day this touch would complete, restored if the touch turns out to be a pan. */
			readonly armed: Armed | null;
	  }
	| {
			readonly kind: 'pressing';
			readonly personId: string;
			readonly day: number;
			readonly x: number;
			readonly pointerId: number;
	  }
	| {
			readonly kind: 'selecting';
			readonly personId: string;
			readonly anchor: number;
			readonly focus: number;
			readonly pointerId: number;
	  }
	| {
			readonly kind: 'resizing';
			readonly personId: string;
			readonly entryId: string;
			readonly edge: 'start' | 'end';
			readonly fixed: number;
			readonly from: number;
			readonly focus: number;
			readonly pointerId: number;
	  };

export type GestureEvent =
	| {
			readonly type: 'press-day';
			readonly personId: string;
			readonly day: number;
			readonly x: number;
			readonly pointerId: number;
			readonly pointerType: string;
	  }
	| {
			readonly type: 'press-edge';
			readonly personId: string;
			readonly entryId: string;
			readonly edge: 'start' | 'end';
			readonly start: number;
			readonly end: number;
			readonly pointerId: number;
			readonly pointerType: string;
	  }
	| { readonly type: 'move'; readonly day: number; readonly x: number; readonly pointerId: number }
	| { readonly type: 'release'; readonly pointerId: number }
	/** The browser took the touch for scrolling. */
	| { readonly type: 'pointer-cancel'; readonly pointerId: number }
	/** An explicit dismiss: Escape, a tap elsewhere, a page change or unmount. */
	| { readonly type: 'cancel' };

export type GestureEffect =
	| { readonly type: 'none' }
	| { readonly type: 'capture' }
	/** The tap that ended this step must not also reach the cell's own click. */
	| { readonly type: 'consume-click' }
	| { readonly type: 'quick-add'; readonly personId: string; readonly start: number; readonly end: number }
	| {
			readonly type: 'resize';
			readonly personId: string;
			readonly entryId: string;
			readonly start: number;
			readonly end: number;
	  };

export interface GestureStep {
	readonly state: GestureState;
	readonly effect: GestureEffect;
}

export const IDLE: GestureState = { kind: 'idle' };

export const DRAG_THRESHOLD_PX = 4;

const NONE: GestureEffect = { type: 'none' };
const CONSUME_CLICK: GestureEffect = { type: 'consume-click' };

function stay(state: GestureState): GestureStep {
	return { state, effect: NONE };
}

function resume(armed: Armed | null): GestureState {
	return armed ? { kind: 'armed', ...armed } : IDLE;
}

export function armedStart(state: GestureState): Armed | null {
	if (state.kind === 'armed') return { personId: state.personId, day: state.day };
	return state.kind === 'tapping' ? state.armed : null;
}

/** The pointer is captured on entering `selecting`, not on press, so a click on the pressed day still reaches it. */
export function gestureStep(state: GestureState, event: GestureEvent): GestureStep {
	if (event.type === 'cancel') return stay(IDLE);

	if (event.type === 'pointer-cancel') {
		switch (state.kind) {
			case 'armed':
				return stay(state);
			case 'tapping':
				return stay(event.pointerId === state.pointerId ? resume(state.armed) : state);
			default:
				return stay(IDLE);
		}
	}

	if (event.type === 'press-day' || event.type === 'press-edge') {
		if (state.kind !== 'idle' && state.kind !== 'armed') return stay(state);
		if (event.pointerType === 'touch') {
			if (event.type === 'press-edge') return stay(state);
			return stay({
				kind: 'tapping',
				personId: event.personId,
				day: event.day,
				x: event.x,
				pointerId: event.pointerId,
				armed: armedStart(state)
			});
		}
		if (event.type === 'press-day') {
			return stay({
				kind: 'pressing',
				personId: event.personId,
				day: event.day,
				x: event.x,
				pointerId: event.pointerId
			});
		}
		const from = event.edge === 'start' ? event.start : event.end;
		return {
			state: {
				kind: 'resizing',
				personId: event.personId,
				entryId: event.entryId,
				edge: event.edge,
				fixed: event.edge === 'start' ? event.end : event.start,
				from,
				focus: from,
				pointerId: event.pointerId
			},
			effect: { type: 'capture' }
		};
	}

	if (state.kind === 'idle' || state.kind === 'armed' || event.pointerId !== state.pointerId) return stay(state);

	if (event.type === 'move') {
		switch (state.kind) {
			case 'pressing':
				if (event.day === state.day || Math.abs(event.x - state.x) <= DRAG_THRESHOLD_PX) return stay(state);
				return {
					state: {
						kind: 'selecting',
						personId: state.personId,
						anchor: state.day,
						focus: event.day,
						pointerId: state.pointerId
					},
					effect: { type: 'capture' }
				};
			case 'tapping':
				if (event.day === state.day && Math.abs(event.x - state.x) <= DRAG_THRESHOLD_PX) return stay(state);
				return stay(resume(state.armed));
			case 'selecting':
				return stay(event.day === state.focus ? state : { ...state, focus: event.day });
			case 'resizing': {
				const focus = state.edge === 'start' ? Math.min(event.day, state.fixed) : Math.max(event.day, state.fixed);
				return stay(focus === state.focus ? state : { ...state, focus });
			}
		}
	}

	switch (state.kind) {
		case 'pressing':
			return stay(IDLE);
		case 'tapping': {
			const { armed } = state;
			if (!armed) return { state: { kind: 'armed', personId: state.personId, day: state.day }, effect: CONSUME_CLICK };
			if (armed.personId !== state.personId) return { state: IDLE, effect: CONSUME_CLICK };
			return {
				state: IDLE,
				effect: {
					type: 'quick-add',
					personId: state.personId,
					start: Math.min(armed.day, state.day),
					end: Math.max(armed.day, state.day)
				}
			};
		}
		case 'selecting':
			return {
				state: IDLE,
				effect: {
					type: 'quick-add',
					personId: state.personId,
					start: Math.min(state.anchor, state.focus),
					end: Math.max(state.anchor, state.focus)
				}
			};
		case 'resizing':
			if (state.focus === state.from) return stay(IDLE);
			return {
				state: IDLE,
				effect: { type: 'resize', personId: state.personId, entryId: state.entryId, ...gestureRange(state)! }
			};
	}
}

/** The days the overlay marks: a drag or resize in progress, or the single armed start day. */
export function gestureRange(state: GestureState): { readonly start: number; readonly end: number } | null {
	switch (state.kind) {
		case 'armed':
		case 'tapping': {
			const armed = armedStart(state);
			return armed && { start: armed.day, end: armed.day };
		}
		case 'selecting':
			return { start: Math.min(state.anchor, state.focus), end: Math.max(state.anchor, state.focus) };
		case 'resizing':
			return state.edge === 'start'
				? { start: state.focus, end: state.fixed }
				: { start: state.fixed, end: state.focus };
		default:
			return null;
	}
}
