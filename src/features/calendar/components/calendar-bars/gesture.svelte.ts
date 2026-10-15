import {
	IDLE,
	gestureStep,
	type GestureEffect,
	type GestureEvent,
	type GestureState
} from '$features/calendar/utils/calendarGesture';

export type GestureCommit = (effect: Extract<GestureEffect, { type: 'quick-add' | 'resize' }>) => void;

/**
 * Feeds one row's pointer events to the pure gesture reducer. The row's day track is measured once
 * per press, and window listeners exist only while a gesture is in progress.
 */
export class CalendarGesture {
	state = $state.raw<GestureState>(IDLE);

	#row: HTMLElement | null = null;
	#left = 0;
	#dayWidth = 1;
	#days = 0;
	#capturedPointer: number | null = null;
	#commit: GestureCommit | null = null;
	#suppressClick = false;

	pressDay(event: PointerEvent, personId: string, row: HTMLElement, days: number, commit: GestureCommit): void {
		if (event.button !== 0 || !this.#begin(row, days, commit)) return;
		this.#send({
			type: 'press-day',
			personId,
			day: this.#dayAt(event.clientX),
			x: event.clientX,
			pointerId: event.pointerId,
			pointerType: event.pointerType
		});
	}

	pressEdge(
		event: PointerEvent,
		target: { personId: string; entryId: string; edge: 'start' | 'end'; start: number; end: number },
		row: HTMLElement,
		days: number,
		commit: GestureCommit
	): void {
		if (event.button !== 0 || event.pointerType === 'touch' || !this.#begin(row, days, commit)) return;
		event.preventDefault();
		event.stopPropagation();
		this.#send({ type: 'press-edge', ...target, pointerId: event.pointerId, pointerType: event.pointerType });
	}

	/** True once for the click that ends a drag, so the day under the pointer does not also open. */
	consumeClick(): boolean {
		const suppress = this.#suppressClick;
		this.#suppressClick = false;
		return suppress;
	}

	#begin(row: HTMLElement, days: number, commit: GestureCommit): boolean {
		if (this.state.kind !== 'idle') return false;
		const track = row.querySelector('[data-slot="bar-track"]') ?? row;
		const rect = track.getBoundingClientRect();
		this.#row = row;
		this.#left = rect.left;
		this.#dayWidth = rect.width / days || 1;
		this.#days = days;
		this.#commit = commit;
		window.addEventListener('pointermove', this.#move);
		window.addEventListener('pointerup', this.#release);
		window.addEventListener('pointercancel', this.#cancel);
		window.addEventListener('keydown', this.#key, { capture: true });
		return true;
	}

	#dayAt(clientX: number): number {
		return Math.min(this.#days - 1, Math.max(0, Math.floor((clientX - this.#left) / this.#dayWidth)));
	}

	#send(event: GestureEvent): void {
		const { state, effect } = gestureStep(this.state, event);
		this.state = state;
		if (effect.type === 'capture' && this.#row && 'pointerId' in event) {
			this.#row.setPointerCapture(event.pointerId);
			this.#capturedPointer = event.pointerId;
		} else if (effect.type === 'quick-add' || effect.type === 'resize') {
			this.#suppressClick = true;
			// A click that a browser does not deliver must not swallow a later one.
			setTimeout(() => (this.#suppressClick = false));
			this.#commit?.(effect);
		}
		if (state.kind === 'idle') this.#end();
	}

	#end(): void {
		window.removeEventListener('pointermove', this.#move);
		window.removeEventListener('pointerup', this.#release);
		window.removeEventListener('pointercancel', this.#cancel);
		window.removeEventListener('keydown', this.#key, { capture: true });
		if (this.#capturedPointer !== null && this.#row?.hasPointerCapture(this.#capturedPointer)) {
			this.#row.releasePointerCapture(this.#capturedPointer);
		}
		this.#capturedPointer = null;
		this.#row = null;
		this.#commit = null;
	}

	#move = (event: PointerEvent) => {
		this.#send({ type: 'move', day: this.#dayAt(event.clientX), x: event.clientX, pointerId: event.pointerId });
	};

	#release = (event: PointerEvent) => {
		this.#send({ type: 'release', pointerId: event.pointerId });
	};

	#cancel = () => {
		this.#send({ type: 'cancel' });
	};

	#key = (event: KeyboardEvent) => {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		event.stopPropagation();
		this.#cancel();
	};
}
