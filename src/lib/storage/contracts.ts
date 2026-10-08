export interface StoragePort {
	upload(bucket: string, path: string, data: File | Blob | ArrayBuffer, options?: { upsert?: boolean }): Promise<void>;
	remove(bucket: string, paths: string[]): Promise<void>;
	createSignedUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string>;
}
