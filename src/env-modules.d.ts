// Kit 3 still serves the deprecated $env modules from the variables in src/env.ts but ships no types for them.
declare module '$env/dynamic/private' {
	export const env: typeof import('$app/env/private');
}

declare module '$env/static/public' {
	export * from '$app/env/public';
}
