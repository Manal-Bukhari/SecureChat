import React from 'react';
import { MoreVertical, PhoneCall, Video } from 'lucide-react';

export default function ChatHeader({ activeContact }) {
  return (
    <div className="flex items-center justify-between p-4 border-b border-secondary-200 dark:border-secondary-700 bg-card dark:bg-secondary-800">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center overflow-hidden">
            <span className="text-lg font-semibold text-primary-600 dark:text-primary-300">
              {activeContact.name.charAt(0)}
            </span>
          </div>
          {activeContact.isOnline && (
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-success-500 border-2 border-card dark:border-secondary-800" />
          )}
        </div>
        <div>
          <h3 className="font-medium text-secondary-900 dark:text-secondary-100">{activeContact.name}</h3>
          <p className="text-xs text-muted-foreground dark:text-secondary-400">
            {activeContact.isOnline ? 'Online' : activeContact.lastSeen}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button className="p-1 rounded-full hover:bg-secondary-100 dark:hover:bg-secondary-700 transition-colors">
          <PhoneCall className="h-5 w-5 text-secondary-500 dark:text-secondary-400" />
        </button>
        <button className="p-1 rounded-full hover:bg-secondary-100 dark:hover:bg-secondary-700 transition-colors">
          <Video className="h-5 w-5 text-secondary-500 dark:text-secondary-400" />
        </button>
        <button className="p-1 rounded-full hover:bg-secondary-100 dark:hover:bg-secondary-700 transition-colors">
          <MoreVertical className="h-5 w-5 text-secondary-500 dark:text-secondary-400" />
        </button>
      </div>
    </div>
  );
}

