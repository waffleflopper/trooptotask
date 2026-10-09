import { getContext, setContext, untrack } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';

type AriaInvalid = HTMLAttributes<HTMLElement>['aria-invalid'];

class FieldState {
	descriptionIds = $state<string[]>([]);
	errorIds = $state<string[]>([]);

	register(kind: 'description' | 'error', id: string) {
		const key = kind === 'description' ? 'descriptionIds' : 'errorIds';
		untrack(() => (this[key] = [...this[key], id]));
		return () => untrack(() => (this[key] = this[key].filter((existing) => existing !== id)));
	}

	/** ARIA for a contained control; the caller's own values stay first and win. */
	controlAria(describedBy: string | null | undefined, invalid: AriaInvalid) {
		const ids = [...(describedBy?.split(/\s+/) ?? []), ...this.descriptionIds, ...this.errorIds].filter(
			(id, index, all) => id && all.indexOf(id) === index
		);
		return {
			'aria-describedby': ids.length > 0 ? ids.join(' ') : undefined,
			'aria-invalid': invalid ?? (this.errorIds.length > 0 ? ('true' as const) : undefined)
		};
	}
}

const FIELD_CONTEXT = Symbol('field');

export function setFieldContext(field: FieldState | undefined) {
	return setContext(FIELD_CONTEXT, field);
}

export function createFieldContext() {
	return setFieldContext(new FieldState());
}

export function getFieldContext() {
	return getContext<FieldState | undefined>(FIELD_CONTEXT);
}
