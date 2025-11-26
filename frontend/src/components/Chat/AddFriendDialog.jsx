import React, { useState } from 'react';
import { Search, UserPlus, Loader2 } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'react-hot-toast';
import { searchGlobalUsers, sendFriendRequest, getFriendRequests, clearSearchResults, addGroupMember } from '../../store/slices/chatSlice';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/Dialog';
import { Button } from '../ui/Button';

export default function AddFriendDialog({ open, onOpenChange, onAddUser = null }) {
  const [searchQuery, setSearchQuery] = useState('');
  const dispatch = useDispatch();
  const { userDetails: user } = useSelector((state) => state.user);
  const { searchResults, isSearching } = useSelector((state) => state.chat);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter a name or email to search");
      return;
    }

    try {
      await dispatch(searchGlobalUsers(searchQuery.trim()));
    } catch (error) {
      toast.error("Failed to search users");
    }
  };

  const handleAddFriend = async (targetUser) => {
    const currentUserId = user?.id || user?._id;
    const targetUserId = targetUser?.id || targetUser?._id;
    
    if (targetUserId === currentUserId || targetUserId === currentUserId?.toString()) {
      toast.error("Cannot send friend request to yourself");
      return;
    }

    // If custom handler provided (for group member adding), use it
    if (onAddUser && typeof onAddUser === 'function') {
      try {
        await onAddUser(targetUser);
        setSearchQuery('');
        dispatch(clearSearchResults());
        onOpenChange(false);
      } catch (error) {
        // Error is already handled in the handler
      }
      return;
    }

    // Default: send friend request
    try {
      await dispatch(sendFriendRequest(targetUser.id));
      dispatch(getFriendRequests());
      // Toast is already shown in the thunk, no need to show again
      setSearchQuery('');
      dispatch(clearSearchResults());
      onOpenChange(false);
    } catch (error) {
      // Error is already handled in the thunk
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleClose = () => {
    setSearchQuery('');
    dispatch(clearSearchResults());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Friend</DialogTitle>
          <DialogDescription>
            Search for users by name or email to send a friend request.
          </DialogDescription>
        </DialogHeader>

        <div className="mb-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name or email..."
                className="w-full pl-10 pr-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={isSearching || !searchQuery.trim()}
              variant="primary"
              size="sm"
            >
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {isSearching ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mb-2" />
              <p className="text-sm">Searching users...</p>
            </div>
          ) : searchResults && searchResults.length > 0 ? (
            <div className="space-y-2">
              {searchResults
                .filter(resultUser => {
                  const currentUserId = user?.id || user?._id;
                  const resultUserId = resultUser?.id || resultUser?._id;
                  return resultUserId !== currentUserId && resultUserId !== currentUserId?.toString();
                })
                .map((resultUser) => (
                  <div
                    key={resultUser.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-lg font-medium text-primary flex-shrink-0">
                        {resultUser.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{resultUser.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{resultUser.email}</p>
                        {resultUser.department && (
                          <p className="text-xs text-muted-foreground">{resultUser.department}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={() => handleAddFriend(resultUser)}
                      size="sm"
                      variant="primary"
                      className="ml-2 flex-shrink-0"
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </div>
                ))}
            </div>
          ) : searchQuery && !isSearching ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No users found matching "{searchQuery}"</p>
            </div>
          ) : !searchQuery ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">Enter a name or email to search for users</p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

