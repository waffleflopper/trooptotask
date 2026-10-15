/**
 * Pointer gestures on a person's month row, as a pure reducer. Days are window indexes; a
 * resize's fixed edge may sit outside the window when the entry continues past it.
 */
export type GestureState =
	| { readonly kind: 'idle' }
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
	| { readonly type: 'cancel' };

export type GestureEffect =
	| { readonly type: 'none' }
	| { readonly type: 'capture' }
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

/** Movement below this stays a click, so a jitter across a cell edge does not start a drag. */
export const DRAG_THRESHOLD_PX = 4;

const NONE: GestureEffect = { type: 'none' };

function stay(state: GestureState): GestureStep {
	return { state, effect: NONE };
}

/**
 * Touch never starts a gesture, so taps stay clicks and scrolling stays native. The pointer is
 * captured on entering `selecting`, not on press, so a click on the pressed day still reaches it.
 */
export function gestureStep(state: GestureState, event: GestureEvent): GestureStep {
	if (event.type === 'cancel') return stay(IDLE);

	if (event.type === 'press-day' || event.type === 'press-edge') {
		if (state.kind !== 'idle' || event.pointerType === 'touch') return stay(state);
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

	if (state.kind === 'idle' || event.pointerId !== state.pointerId) return stay(state);

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

/** The days a gesture currently covers, for the selection box or the resize preview. */
export function gestureRange(state: GestureState): { readonly start: number; readonly end: number } | null {
	switch (state.kind) {
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
