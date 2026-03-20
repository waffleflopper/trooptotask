export interface ReactiveCollection<T> {
	readonly items: T[];
	getSnapshot(): T[];
	set(items: T[]): void;
}

export function createReactiveCollection<T>(initial?: T[]): ReactiveCollection<T> {
	let items = $state.raw<T[]>(initial ?? []);

	return {
		get items() {
			return items;
		},
		getSnapshot() {
			return items;
		},
		set(newItems: T[]) {
			items = newItems;
		}
	};
}

export interface ReactiveValue<T> {
	readonly value: T;
	set(value: T): void;
}

export function createReactiveValue<T>(initial: T): ReactiveValue<T> {
	let value = $state.raw<T>(initial);

	return {
		get value() {
			return value;
		},
		set(newValue: T) {
			value = newValue;
		}
	};
}
