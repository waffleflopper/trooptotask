// Loaded only by the owned verification preview through Node's --import option.
// `vite preview` gzips every response with @polka/compression, which never flushes a streamed
// write, so a streamed document or `__data.json` reaches the browser only when about 16 KB of
// compressed output exists or the stream ends. Production streams its chunks as they are
// written. App responses are therefore asked for identity encoding; content-hashed assets keep
// their compression.
import http from 'node:http';

export const streamsUncompressed = (url) => !url.startsWith('/_app/immutable/');

const emit = http.Server.prototype.emit;
http.Server.prototype.emit = function (event, request, ...rest) {
	if (event === 'request' && streamsUncompressed(request.url)) delete request.headers['accept-encoding'];
	return emit.call(this, event, request, ...rest);
};
