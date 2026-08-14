export {};

declare global {
  interface Window {
    area_click: (el: HTMLElement) => void;
    banPlayer: (id: number) => void;
    changeBlipVolume: () => void;
    changeMusicVolume: (volume?: number) => void;
    deleteLocalCharacterUI: (name: string) => Promise<void>;
    getIndexFromSelect: (select_box: string, value: string) => number;
    importLocalCharacterZip: () => Promise<void>;
    kickPlayer: (id: number) => void;
    onReplayGo: (_event: Event) => void;
    opusCheck: (channel: HTMLAudioElement) => OnErrorEventHandlerNonNull;
    pickEmotion: (emo: number) => void;
    pickEvidence: (evidence: number) => void;
    reloadTheme: () => void;
    renderLocalCharacterList: () => void;
    resizeChatbox: () => void;
    setChatbox: (setstyle: string) => void;
    showname_click: (_event: Event | null) => void;
    switchPanTilt: () => Promise<void>;
    updateActionCommands: (side: string) => void;
    updateBackgroundPreview: () => void;
    updateTypingIndicator: () => void;
    useLocalCharacter: (name: string) => void;
  }
}
