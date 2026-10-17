import {
	IDLE,
	gestureStep,
	type GestureEffect,
	type GestureEvent,
	type GestureState
} from '$features/calendar/utils/calendarGesture';

export type GestureCommit = (effect: Extract<GestureEffect, { type: 'quick-add' | 'resize' }>) => void;

export class CalendarGesture {
	state = $state.raw<GestureState>(IDLE);

	#row: HTMLElement | null = null;
	#track: Element | null = null;
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

	consumeDragEndClick(): boolean {
		const suppress = this.#suppressClick;
		this.#suppressClick = false;
		return suppress;
	}

	#begin(row: HTMLElement, days: number, commit: GestureCommit): boolean {
		if (this.state.kind !== 'idle') return false;
		this.#row = row;
		this.#track = row.querySelector('[data-slot="bar-track"]') ?? row;
		this.#days = days;
		this.#commit = commit;
		window.addEventListener('pointermove', this.#move);
		window.addEventListener('pointerup', this.#release);
		window.addEventListener('pointercancel', this.#cancel);
		window.addEventListener('keydown', this.#key, { capture: true });
		return true;
	}

	// Measured on every move because the grid can scroll under a held pointer.
	#dayAt(clientX: number): number {
		const rect = this.#track!.getBoundingClientRect();
		const dayWidth = rect.width / this.#days || 1;
		return Math.min(this.#days - 1, Math.max(0, Math.floor((clientX - rect.left) / dayWidth)));
	}

	#send(event: GestureEvent): void {
		const { state, effect } = gestureStep(this.state, event);
		this.state = state;
		if (effect.type === 'capture' && this.#row && 'pointerId' in event) {
			try {
				this.#row.setPointerCapture(event.pointerId);
			} catch {
				// The pointer was already released, so the gesture cannot continue.
				this.#cancel();
				return;
			}
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
		this.#track = null;
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
