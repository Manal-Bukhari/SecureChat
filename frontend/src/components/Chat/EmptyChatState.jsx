import React from 'react';

export default function EmptyChatState() {
  return (
    <div className="flex-1 flex items-center justify-center bg-secondary-50 dark:bg-secondary-900">
      <div className="text-center p-4">
        <h3 className="text-lg font-medium mb-2 text-secondary-900 dark:text-secondary-100">No conversation selected</h3>
        <p className="text-secondary-500 dark:text-secondary-400">
          Select a contact to start messaging
        </p>
      </div>
    </div>
  );
}

