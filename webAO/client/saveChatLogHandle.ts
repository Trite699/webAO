import { downloadLogs } from "./downloadLogs";

export const saveChatlogHandle = async () => {
  downloadLogs();

  // Reset Chatbox to Empty
  (<HTMLInputElement>document.getElementById("client_inputbox")).value = "";
};
