import React from 'react';
import { MessageSquare, Phone, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useSelector } from 'react-redux';

export default function NavigationSidebar({ activeView, onViewChange, isCollapsed, onToggleCollapse }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { userDetails: user } = useSelector((state) => state.user);
  const { friendRequests, groupRequests } = useSelector((state) => state.chat);
  
  const pendingRequestsCount = (friendRequests?.received?.length || 0) + (groupRequests?.received?.length || 0);

  // Determine active view from URL path
  const isCallsRoute = location.pathname === '/calls';
  const isChatRoute = location.pathname === '/chat' || location.pathname.startsWith('/chat/');
  const currentActiveView = isCallsRoute ? 'calls' : (isChatRoute ? 'messages' : (activeView || 'messages'));

  const navItems = [
    {
      id: 'messages',
      icon: MessageSquare,
      label: 'Chats',
      badge: pendingRequestsCount > 0 ? pendingRequestsCount : null,
      active: currentActiveView === 'messages'
    },
    {
      id: 'calls',
      icon: Phone,
      label: 'Calls',
      active: currentActiveView === 'calls'
    }
  ];

  const handleNavClick = (itemId) => {
    if (itemId === 'calls') {
      navigate('/calls');
    } else if (itemId === 'messages') {
      navigate('/chat');
    } else {
      onViewChange(itemId);
    }
  };

  return (
    <>
      <aside className={cn(
        "bg-card border-r border-border flex flex-col items-center py-4 h-full transition-all duration-300",
        isCollapsed ? "w-16" : "w-20"
      )}>
        {/* Toggle Button */}
        <button
          onClick={onToggleCollapse}
          className="mb-4 p-2 rounded-lg hover:bg-muted transition-colors"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronLeft className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        {/* Navigation Items */}
        <nav className="flex-1 flex flex-col gap-2 w-full px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.active;
            
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={cn(
                  "relative flex flex-col items-center justify-center p-3 rounded-lg transition-all group",
                  isActive
                    ? "bg-muted"
                    : "hover:bg-muted/50"
                )}
                title={item.label}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full" />
                )}
                
                {/* Icon */}
                <div className="relative">
                  <Icon
                    className={cn(
                      "h-6 w-6 transition-colors",
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground group-hover:text-foreground"
                    )}
                  />
                  
                  {/* Badge */}
                  {item.badge && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-medium">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </nav>

        {/* Profile Picture */}
        {user && (
          <div className="mt-auto px-2">
            <button
              onClick={() => navigate('/settings')}
              className="h-12 w-12 rounded-full overflow-hidden border-2 border-border hover:border-primary transition-colors cursor-pointer"
              title="Settings"
            >
              <div className="h-full w-full bg-primary flex items-center justify-center text-primary-foreground font-semibold text-lg">
                {(user.fullName || user.name || 'U').charAt(0).toUpperCase()}
              </div>
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

