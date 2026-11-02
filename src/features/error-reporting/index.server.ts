export { classifyFailure } from './contracts';
export {
	DEFAULT_RECORDING_TIMEOUT_MS,
	captureFailure,
	fingerprintFailure,
	noteServerFailure,
	recordingAfterResponse,
	runInErrorScope,
	type CaptureConfig,
	type CapturedRecording,
	type ErrorScopeResult,
	type StoredErrorOccurrence
} from './server/errorCapture.server';
export {
	cleanupPlatformErrors,
	createSupabaseErrorGroupReader,
	createSupabaseErrorGroupResolver,
	createSupabaseErrorRecordingStore,
	createSupabaseErrorReferenceStore,
	type ErrorGroupReader,
	type ErrorGroupResolver,
	type ErrorRecordingStore,
	type ErrorReferenceStore,
	type ResolveErrorGroupResult
} from './server/errorStore.server';
