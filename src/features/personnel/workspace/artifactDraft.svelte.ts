export interface ArtifactDraftContext {
	orgId: string;
	personId: string;
}

export interface ArtifactDraftRequest {
	body: BodyInit;
	headers?: HeadersInit;
}

export interface ArtifactDraftSpec<TInput extends object, TResult extends { id: string }> {
	createEmptyInput: () => TInput;
	endpoint: (context: ArtifactDraftContext) => string;
	validate: (input: TInput) => string | null;
	encode: (input: TInput) => ArtifactDraftRequest;
	decode?: (response: Response) => Promise<TResult>;
	errorFallback: string;
	reset?: (input: TInput) => TInput;
	selectFile?: (input: TInput, file: File | null) => void;
}

export interface ArtifactDraftDeps {
	context: ArtifactDraftContext | (() => ArtifactDraftContext);
	fetch: typeof fetch;
}

function resolveContext(context: ArtifactDraftDeps['context']): ArtifactDraftContext {
	return typeof context === 'function' ? context() : context;
}

function upsertById<TResult extends { id: string }>(item: TResult, items: TResult[]): TResult[] {
	return [item, ...items.filter((existing) => existing.id !== item.id)];
}

export class ArtifactDraft<TInput extends object, TResult extends { id: string }> {
	readonly #spec: ArtifactDraftSpec<TInput, TResult>;
	readonly #deps: ArtifactDraftDeps;

	fields: TInput;
	saving = $state(false);
	error = $state('');
	items = $state<TResult[]>([]);

	constructor(spec: ArtifactDraftSpec<TInput, TResult>, deps: ArtifactDraftDeps) {
		this.#spec = spec;
		this.#deps = deps;
		this.fields = $state(spec.createEmptyInput());
	}

	submit = async (): Promise<void> => {
		this.error = '';
		const validationError = this.#spec.validate(this.fields);
		if (validationError) {
			this.error = validationError;
			return;
		}

		this.saving = true;
		try {
			const request = this.#spec.encode(this.fields);
			const response = await this.#deps.fetch(this.#spec.endpoint(resolveContext(this.#deps.context)), {
				method: 'POST',
				headers: request.headers,
				body: request.body
			});
			if (!response.ok) throw new Error(this.#spec.errorFallback);
			this.upsert(this.#spec.decode ? await this.#spec.decode(response) : ((await response.json()) as TResult));
			this.fields = this.#spec.reset?.(this.fields) ?? this.#spec.createEmptyInput();
		} catch (caught) {
			this.error = caught instanceof Error ? caught.message : this.#spec.errorFallback;
		} finally {
			this.saving = false;
		}
	};

	upsert = (item: TResult): void => {
		this.items = upsertById(item, this.items);
	};

	mergeLoaded(loaded: TResult[]): TResult[] {
		// These are transient lookup tables for one synchronous merge, not reactive state.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const updatedById = new Map(this.items.map((item) => [item.id, item]));
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const loadedIds = new Set(loaded.map((item) => item.id));
		const created = this.items.filter((item) => !loadedIds.has(item.id));
		return [...created, ...loaded.map((item) => updatedById.get(item.id) ?? item)];
	}

	selectFile = (file: File | null): void => {
		this.#spec.selectFile?.(this.fields, file);
	};
}
