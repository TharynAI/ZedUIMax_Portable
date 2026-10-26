/* START> Tharyn | ZedUIMax
    2026-09-18
    What: Exact-session selection and change-driven terminal-title controller.
    Why: Shared Remote processes cannot identify a terminal by PID, workspace, or foreground.
    Expected: A launcher supplies verified identity and its own-console writer; ambiguous or
              unavailable Tower state never changes another terminal or interrupts the CLI.
*/

export const MAX_TITLE_CHARS = 240;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const LIVE_STATES = new Set(['active', 'idle', 'blocked', 'awaiting-user']);
const HIDDEN = /[\p{Cc}\p{Cf}\p{Cs}\u034f\ufe00-\ufe0f\ufff9-\ufffb\u{e0100}-\u{e01ef}]/u;

/** Data only: no escape sequence, shell interpolation, or terminal targeting. */
export function sanitizeTitle(value) {
  if (typeof value !== 'string') return '';
  const chars = [];
  let space = false;
  for (const char of value) {
    if (/\s/u.test(char)) {
      space = chars.length > 0;
      continue;
    }
    if (HIDDEN.test(char)) continue;
    if (space && chars.length < MAX_TITLE_CHARS - 1) chars.push(' ');
    space = false;
    if (chars.length === MAX_TITLE_CHARS) break;
    chars.push(char);
  }
  return chars.join('');
}

function validIdentity(identity) {
  return identity && ['codex', 'claude-code'].includes(identity.provider)
    && typeof identity.sessionId === 'string' && UUID.test(identity.sessionId)
    && typeof identity.machine === 'string' && identity.machine.trim().length > 0
    && (identity.product === undefined
      || (typeof identity.product === 'string' && identity.product.trim().length > 0));
}

const unavailable = reason => ({ ok: false, reason });

/**
 * Resolve only a full provider + native UUID + machine match. Never fall back to names,
 * workspace, PID, historical agentNames, or a session-ID prefix. Optional product is an
 * additional exact constraint (important for Codex-family products).
 *
 * Callers must read the canonical local snapshot. A snapshot is not a capability, nor
 * evidence that the caller owns any particular terminal. The launcher owns that gate.
 */
export function selectSessionTitle(snapshot, identity, {
  now = Date.now(), maxAgeMs = 60_000, futureSkewMs = 5_000,
} = {}) {
  if (!validIdentity(identity)) return unavailable('invalid_identity');
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0
      || !Number.isFinite(futureSkewMs) || futureSkewMs < 0) {
    return unavailable('invalid_clock_policy');
  }
  if (!snapshot || snapshot.protocolVersion !== 1 || !Array.isArray(snapshot.agents)
      || typeof snapshot.hubGeneration !== 'string' || !snapshot.hubGeneration
      || !Number.isFinite(snapshot.generatedAt)) {
    return unavailable('invalid_snapshot');
  }
  if (now - snapshot.generatedAt > maxAgeMs
      || snapshot.generatedAt - now > futureSkewMs) {
    return unavailable('stale_snapshot');
  }
  const matches = snapshot.agents.filter(agent => agent
    && agent.provider === identity.provider && agent.sessionId === identity.sessionId
    && agent.machine === identity.machine);
  if (matches.length === 0) return unavailable('not_registered');
  if (matches.length !== 1) return unavailable('ambiguous_identity');
  const agent = matches[0];
  if (identity.product !== undefined && agent.product !== identity.product) {
    return unavailable('product_mismatch');
  }
  if (agent.tier !== 'interactive' || agent.parentAgentId !== null) {
    return unavailable('not_primary_terminal');
  }
  if (!LIVE_STATES.has(agent.status) || agent.endedAt !== null) {
    return unavailable('session_not_live');
  }
  if (typeof agent.agentId !== 'string' || !agent.agentId) {
    return unavailable('invalid_agent');
  }
  const title = sanitizeTitle(agent.name);
  if (!title) return unavailable('empty_title');
  return { ok: true, title, agentId: agent.agentId, hubGeneration: snapshot.hubGeneration };
}

/**
 * No polling, processes, network, files, or real title writes are started by this module.
 * writeTitle must be a synchronous writer to the launcher's proven owning terminal.
 * In particular, do NOT use a remoted tool's captured stdout as the terminal sink.
 * onWarning(reason|null) is a transition callback; null clears an earlier warning.
 */
export function createTitleController({ identity, writeTitle, onWarning = () => {}, policy = {} }) {
  if (!validIdentity(identity)) throw new TypeError('A full native session identity is required');
  if (typeof writeTitle !== 'function' || typeof onWarning !== 'function') {
    throw new TypeError('Title and warning callbacks must be functions');
  }
  const boundIdentity = Object.freeze({ ...identity });
  const boundPolicy = Object.freeze({ ...policy });
  let lastKey = null;
  let warning = null;

  function report(next) {
    if (warning === next) return;
    warning = next;
    // A broken diagnostic consumer must not interrupt a running CLI.
    try { onWarning(next); } catch { /* The returned result still exposes the warning. */ }
  }

  function unavailableState(reason) {
    lastKey = null; // Recovery reapplies even if the call sign has not changed.
    report(reason);
    return { ok: false, changed: false, reason };
  }

  return Object.freeze({
    update(snapshot, now = Date.now()) {
      const selected = selectSessionTitle(snapshot, boundIdentity, { ...boundPolicy, now });
      if (!selected.ok) return unavailableState(selected.reason);
      const key = JSON.stringify([selected.hubGeneration, selected.agentId, selected.title]);
      if (key === lastKey) return { ...selected, changed: false };
      try { writeTitle(selected.title); } catch { return unavailableState('title_write_failed'); }
      lastKey = key; // Never cache a failed write.
      report(null);
      return { ...selected, changed: true };
    },
    // Read/parse failures enter the same fail-open, warning-preserving state.
    unavailable() { return unavailableState('snapshot_unavailable'); },
  });
}
// <END Tharyn | ZedUIMax
