/**
 * Piggybacks the typing indicator on the existing CT (OOC chat) packet
 * instead of a new packet type, since CT is already relayed by every
 * AO2 server to everyone in the area — no server changes needed.
 *
 * The OOC "username" field is set to this marker so handleCT.ts can
 * recognize and intercept it before it reaches the OOC log. Control
 * characters keep it from colliding with a real OOC name (and from
 * showing as readable text to non-webAO clients that don't intercept
 * it — they'll still see a blank-ish OOC line rather than a name).
 * Message body is "<charid>:<0|1>".
 */
export const TYPING_SIGNAL_MARKER = "\u0001\u0002webao_typing\u0002\u0001";
