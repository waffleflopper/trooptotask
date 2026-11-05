import { z } from 'zod';

// The CSP forbids eval, so Zod's compiled-parser probe could only fail and log a violation.
// Zod probes when it builds an object schema, so this module must be the client's first import.
z.config({ jitless: true });
