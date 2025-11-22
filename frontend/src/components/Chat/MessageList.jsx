import React from 'react';
import { cn } from '../../lib/utils';

export default function MessageList({ messages, loading, currentUserId }) {
  if (loading && messages.length === 0) {
    return <div className="flex justify-center p-4 text-secondary-600 dark:text-secondary-400">Loading messages...</div>;
  }

  if (messages.length === 0) {
    return (
      <div className="flex justify-center p-4 text-secondary-500 dark:text-secondary-400">
        No messages yet. Start the conversation!
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map(msg => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
    </div>
  );
}

function MessageBubble({ message }) {
  const isMine = message.senderId === 'me';
  
  return (
    <div
      className={cn(
        "flex",
        isMine ? "justify-end" : "justify-start"
      )}
    >
      <div className={cn(
        "max-w-xs sm:max-w-md rounded-2xl px-4 py-2",
        isMine 
          ? "bg-primary-500 text-white rounded-tr-none"
          : "bg-secondary-200 dark:bg-secondary-700 text-secondary-900 dark:text-secondary-100 rounded-tl-none"
      )}>
        <p>{message.text}</p>
        <div className={cn(
          "text-xs mt-1 flex justify-end",
          isMine
            ? "text-primary-100"
            : "text-secondary-500 dark:text-secondary-400"
        )}>
          {message.timestamp}
          {message.pending && (
            <span className="ml-2">⏳</span>
          )}
          {message.failed && (
            <span className="ml-2 text-error-300">❌</span>
          )}
        </div>
      </div>
    </div>
  );
}

