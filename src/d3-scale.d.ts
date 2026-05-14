declare module 'd3-scale' {
	export interface ScalePoint<Domain> {
		(value: Domain): number | undefined;
		domain(): Domain[];
		domain(domain: Iterable<Domain>): this;
		range(): [number, number];
		range(range: Iterable<number>): this;
		rangeRound(): [number, number];
		rangeRound(range: Iterable<number>): this;
		bandwidth(): number;
		step(): number;
		round(): boolean;
		round(round: boolean): this;
		padding(): number;
		padding(padding: number): this;
		align(): number;
		align(align: number): this;
		copy(): ScalePoint<Domain>;
	}

	export function scalePoint<Domain = string>(): ScalePoint<Domain>;
}
