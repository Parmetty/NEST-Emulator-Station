/**
 * ares keyboard adapter — not implemented yet.
 *
 * ares stores input assignments in `settings.bml` as
 * `<deviceIdentifier>/<groupID>/<inputID>` strings, but the exact keyboard
 * device identifier has not been verified on this build (v148) yet: the naive
 * `0x0/0/40` candidate is ignored by its parser. Until a GUI experiment has
 * produced a real binding to copy, Nest must not write to `settings.bml` —
 * a wrong line would silently disable input instead of fixing it.
 *
 * The IPC layer reports `supported: false` for this engine so the key-mapping
 * UI greys the group out.
 */
import type { KeyboardBindings } from '../../shared/contract';
import type { ApplyResult } from './util';

export function applyAresControls(): ApplyResult {
  return { applied: false, files: [], reason: 'unsupported' };
}

export function readAresControls(): KeyboardBindings {
  return {};
}
