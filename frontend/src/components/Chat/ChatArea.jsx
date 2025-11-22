import React, { useState } from "react";
import { Send } from "lucide-react";
import { cn } from "../../lib/utils";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";

export default function ChatArea({
  activeContact,
  messages,
  loading,
  isConnected,
  connectError,
  handleSend,
  currentUserId,
}) {
  const [messageText, setMessageText] = useState("");

  const onSubmit = (e) => {
    e.preventDefault();
    if (messageText.trim()) {
      handleSend(e, messageText);
      setMessageText("");
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Chat header */}
      <ChatHeader activeContact={activeContact} />

      {/* Message list */}
      <div className="flex-1 p-4 overflow-y-auto bg-secondary-50 dark:bg-secondary-900/50">
        <MessageList
          messages={messages}
          loading={loading}
          currentUserId={currentUserId}
        />
      </div>

      {/* Input box */}
      <div className="p-4 border-t border-secondary-200 dark:border-secondary-700 bg-card dark:bg-secondary-800">
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            type="text"
            placeholder={isConnected ? "Type a message…" : "Reconnecting…"}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            className="flex-1 p-2 border border-secondary-200 dark:border-secondary-600 rounded-md bg-white dark:bg-secondary-700 text-secondary-900 dark:text-secondary-100"
            disabled={!isConnected}
          />
          <button
            type="submit"
            className={cn(
              "p-2 rounded-md transition-colors",
              isConnected
                ? "bg-primary-500 hover:bg-primary-600 text-white"
                : "bg-secondary-400 text-secondary-700 cursor-not-allowed"
            )}
            disabled={!isConnected || !messageText.trim()}
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
        {!isConnected && (
          <p className="mt-2 text-xs text-warning-600 dark:text-warning-400">
            Disconnected. Reconnecting…
          </p>
        )}
        {connectError && (
          <p className="mt-1 text-xs text-error-600 dark:text-error-400">Error: {connectError}</p>
        )}
      </div>
    </div>
  );
}

