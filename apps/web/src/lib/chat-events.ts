export const CHAT_OPEN_EVENT = "propai:chat:open";
export const CHAT_SEND_EVENT = "propai:chat:send";

type ChatSendDetail = {
  message: string;
};

export const openChat = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHAT_OPEN_EVENT));
};

export const sendChatMessage = (message: string) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ChatSendDetail>(CHAT_SEND_EVENT, {
      detail: { message }
    })
  );
};
