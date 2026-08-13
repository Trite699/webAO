import { TYPING_SIGNAL_MARKER } from "../typingSignalMarker";

/**
 * DISABLED — see notes below.
 *
 * This used to send a typing-state update to other players by piggybacking
 * on a CT (OOC chat) packet — see typingSignalMarker.ts for why that
 * approach was chosen (no server changes needed, since every AO2 server
 * already relays CT to the area).
 *
 * The problem: the piggyback only gets hidden from view on clients that
 * run webAO's own handleCT.ts interception. The official AO2 desktop
 * client (a separate C++/Qt codebase) has no such interception — it just
 * displays every CT packet as a normal OOC line. There is no way for the
 * sender to detect whether recipients are running webAO or the desktop
 * client, so any mixed room causes visible "webao_typing" spam for
 * desktop-client users.
 *
 * Until there's either a dedicated server-side packet for this (so it
 * never touches OOC at all) or the desktop client adds matching
 * interception, broadcasting this signal does more harm (spam for
 * everyone else) than good (a typing indicator for webAO users), so the
 * send is now a no-op. TYPING_SIGNAL_MARKER / handleCT.ts's receive-side
 * interception are left in place and are harmless/inert if this is ever
 * re-enabled or if another webAO peer still sends the old signal.
 */
export const sendTR = (_typing: boolean): void => {
  // Intentionally does nothing. See comment above.
  void TYPING_SIGNAL_MARKER; // kept referenced so linting doesn't flag the import as unused
};
