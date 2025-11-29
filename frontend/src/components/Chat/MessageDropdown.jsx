import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Forward, Reply } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function MessageDropdown({ 
  isOpen, 
  onClose, 
  position, 
  onCopy, 
  onForward, 
  onReply,
  canForward = true,
  anchorElement 
}) {
  const dropdownRef = useRef(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, right: 0 });

  // Calculate dropdown position based on anchor element
  useEffect(() => {
    if (!isOpen || !anchorElement) return;

    const updatePosition = () => {
      if (anchorElement) {
        const rect = anchorElement.getBoundingClientRect();
        const scrollY = window.scrollY || window.pageYOffset;
        const scrollX = window.scrollX || window.pageXOffset;
        
        setDropdownPosition({
          top: rect.bottom + scrollY + 8,
          left: position === 'right' ? undefined : rect.left + scrollX,
          right: position === 'right' ? window.innerWidth - rect.right - scrollX : undefined
        });
      }
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, anchorElement, position]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        // Check if click is on a message bubble
        const messageBubble = event.target.closest('[data-message-bubble]');
        if (!messageBubble) {
          onClose();
        }
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    // Add event listeners with a slight delay to avoid immediate closure
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 10);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !anchorElement) return null;

  const menuItems = [
    {
      icon: Copy,
      label: 'Copy',
      onClick: () => {
        onCopy();
        onClose();
      },
      alwaysShow: true
    },
    {
      icon: Reply,
      label: 'Reply',
      onClick: () => {
        onReply();
        onClose();
      },
      alwaysShow: true
    },
    {
      icon: Forward,
      label: 'Forward',
      onClick: () => {
        onForward();
        onClose();
      },
      alwaysShow: false,
      show: canForward
    }
  ].filter(item => item.alwaysShow || item.show);

  const dropdownContent = (
    <div
      ref={dropdownRef}
      data-dropdown
      className={cn(
        "fixed z-[9999] min-w-[160px] rounded-lg border border-border bg-card shadow-lg",
        "py-1 select-none"
      )}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      style={{ 
        cursor: 'default', 
        userSelect: 'none',
        pointerEvents: 'auto',
        top: `${dropdownPosition.top}px`,
        left: dropdownPosition.left !== undefined ? `${dropdownPosition.left}px` : undefined,
        right: dropdownPosition.right !== undefined ? `${dropdownPosition.right}px` : undefined
      }}
    >
      {menuItems.map((item, index) => {
        const Icon = item.icon;
        return (
          <button
            key={index}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              item.onClick();
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2 text-sm",
              "hover:bg-muted transition-colors cursor-pointer",
              "text-foreground text-left",
              "focus:outline-none focus:bg-muted"
            )}
            style={{ userSelect: 'none' }}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );

  return createPortal(dropdownContent, document.body);
}

