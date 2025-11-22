import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useNavigate, useLocation } from 'react-router-dom';

export default function ContactsSidebar({ contacts, activeId, setActiveId }) {
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  // Filter contacts
  const filtered = searchTerm
    ? contacts.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : contacts;

  const selectContact = (id) => {
    setActiveId(id);
    navigate(location.pathname, {
      replace: true,
      state: { ...location.state, activeConversation: id }
    });
  };

  return (
    <aside className="w-80 bg-secondary-50 dark:bg-secondary-800 border-r border-secondary-200 dark:border-secondary-700 flex flex-col">
      {/* Header */}
      <div className="p-4">
        <h2 className="text-2xl font-semibold text-secondary-900 dark:text-secondary-100 mb-3">Messages</h2>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-secondary-400 dark:text-secondary-500" />
          <input
            type="text"
            placeholder="Search contacts"
            className="w-full pl-10 pr-3 py-2 bg-white dark:bg-secondary-700 border border-secondary-300 dark:border-secondary-600 rounded-lg text-sm placeholder-secondary-400 dark:placeholder-secondary-500 text-secondary-900 dark:text-secondary-100 focus:outline-none focus:ring-2 focus:ring-primary-500 transition"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Contacts List */}
      <div className="flex-1 overflow-y-auto divide-y divide-secondary-200 dark:divide-secondary-700 py-2">
        {filtered.length > 0 ? filtered.map(contact => (
          <button
            key={contact.id}
            onClick={() => selectContact(contact.id)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2 transition-colors",
              activeId === contact.id
                ? "bg-primary-100 dark:bg-primary-900/30"
                : "hover:bg-secondary-100 dark:hover:bg-secondary-700"
            )}
          >
            <div className="relative flex-shrink-0">
              <div className="h-10 w-10 rounded-full bg-secondary-200 dark:bg-secondary-600 flex items-center justify-center text-lg font-medium text-secondary-700 dark:text-secondary-200">
                {contact.name.charAt(0).toUpperCase()}
              </div>
              {contact.isOnline && (
                <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-white dark:ring-secondary-800 bg-success-400" />
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium text-secondary-900 dark:text-secondary-100 truncate">
                {contact.name}
              </p>
              <p className="text-xs text-secondary-500 dark:text-secondary-400 truncate mt-0.5">
                {contact.lastMessage}
              </p>
            </div>
            <div className="flex flex-col items-end">
              <span className={cn(
                "text-xs truncate",
                contact.lastSeen === 'Online'
                  ? "text-success-500"
                  : "text-secondary-500 dark:text-secondary-400"
              )}>
                {contact.lastSeen === 'Online' ? '● Online' : contact.lastSeen}
              </span>
              {contact.unreadCount > 0 && (
                <span className="mt-1 inline-flex items-center justify-center h-5 px-2 text-xs font-semibold rounded-full bg-primary-500 text-white">
                  {contact.unreadCount}
                </span>
              )}
            </div>
          </button>
        )) : (
          <div className="p-4 text-center text-secondary-500 dark:text-secondary-400">
            No contacts found
          </div>
        )}
      </div>
    </aside>
  );
}

