/**
 * zod, set to validate without compiling code at run time. zod 4 otherwise builds its object parsers with
 * `new Function`, which a Content-Security-Policy without 'unsafe-eval' refuses (and reports to the console, although
 * zod catches the refusal). The setting is read when a schema is made, so every schema imports `z` from here, not from
 * 'zod' (the lint rule `no-restricted-imports` holds to that).
 */
import { z } from 'zod';

z.config({ jitless: true });

export { z };
