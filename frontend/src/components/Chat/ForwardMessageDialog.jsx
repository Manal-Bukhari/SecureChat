import React, { useState } from 'react';
import { Forward, Loader2, Check, Search } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { forwardMessage } from '../../store/slices/chatSlice';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/Dialog';
import { Button } from '../ui/Button';

export default function ForwardMessageDialog({ open, onOpenChange, message }) {
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const dispatch = useDispatch();
  const { contacts } = useSelector((state) => state.chat);
  const { userDetails: user } = useSelector((state) => state.user);
  const [isForwarding, setIsForwarding] = useState(false);

  // Filter out the current user and the sender/receiver of the original message
  const availableFriends = contacts.filter(contact => {
    const contactUserId = contact.userId || contact.id;
    const currentUserId = user?.id || user?._id;
    const messageSenderId = message?.senderId === 'me' ? currentUserId : message?.senderId;
    const messageReceiverId = message?.receiverId;
    
    return contactUserId !== currentUserId?.toString() && 
           contactUserId !== messageSenderId?.toString() &&
           contactUserId !== messageReceiverId?.toString();
  });

  // Filter friends based on search query
  const filteredFriends = availableFriends.filter(friend => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      friend.name?.toLowerCase().includes(query) ||
      friend.email?.toLowerCase().includes(query)
    );
  });

  const toggleFriendSelection = (friendId) => {
    setSelectedFriends(prev => {
      if (prev.includes(friendId)) {
        return prev.filter(id => id !== friendId);
      } else {
        return [...prev, friendId];
      }
    });
  };

  const handleForward = async () => {
    if (selectedFriends.length === 0) {
      return;
    }

    if (!message?.id) {
      return;
    }

    setIsForwarding(true);
    try {
      // Get the actual message ID (handle temp IDs)
      const messageId = message.id.startsWith('temp-') ? null : message.id;
      
      if (!messageId) {
        throw new Error('Cannot forward unsent messages');
      }

      // Get friend user IDs (not conversation IDs)
      const friendUserIds = selectedFriends.map(conversationId => {
        const friend = contacts.find(c => c.id === conversationId);
        return friend?.userId || friend?.id;
      }).filter(Boolean);

      if (friendUserIds.length === 0) {
        throw new Error('No valid friends selected');
      }

      await dispatch(forwardMessage({ 
        messageId, 
        friendIds: friendUserIds 
      })).unwrap();

      // Reset and close
      setSelectedFriends([]);
      onOpenChange(false);
    } catch (error) {
      // Error is already handled in the thunk
    } finally {
      setIsForwarding(false);
    }
  };

  const handleClose = () => {
    setSelectedFriends([]);
    setSearchQuery('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Forward Message</DialogTitle>
          <DialogDescription>
            Select friends to forward this message to.
          </DialogDescription>
        </DialogHeader>

        {message && (
          <div className="mb-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Message:</p>
            <p className="text-sm text-foreground">{message.text}</p>
          </div>
        )}

        {/* Search bar */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search contacts..."
              className="w-full pl-10 pr-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto mb-4">
          {filteredFriends.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">
                {searchQuery ? `No friends found matching "${searchQuery}"` : "No friends available to forward to"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredFriends.map((friend) => {
                const friendId = friend.id;
                const isSelected = selectedFriends.includes(friendId);
                
                return (
                  <div
                    key={friendId}
                    onClick={() => toggleFriendSelection(friendId)}
                    className={`
                      flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors
                      ${isSelected 
                        ? 'bg-primary/20 border-2 border-primary' 
                        : 'bg-muted/50 hover:bg-muted border-2 border-transparent'
                      }
                    `}
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-lg font-medium text-primary flex-shrink-0">
                      {friend.name?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {friend.name || 'Unknown'}
                      </p>
                      {friend.email && (
                        <p className="text-xs text-muted-foreground truncate">
                          {friend.email}
                        </p>
                      )}
                    </div>
                    {isSelected && (
                      <div className="flex-shrink-0">
                        <Check className="h-5 w-5 text-primary" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={handleClose}
            variant="outline"
            disabled={isForwarding}
          >
            Cancel
          </Button>
          <Button
            onClick={handleForward}
            disabled={selectedFriends.length === 0 || isForwarding}
            variant="primary"
          >
            {isForwarding ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Forwarding...
              </>
            ) : (
              <>
                <Forward className="h-4 w-4 mr-2" />
                Forward ({selectedFriends.length})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
