import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { UserPlus, Check, X, Clock, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { getFriendRequests, acceptFriendRequest, rejectFriendRequest, fetchContacts } from '../../store/slices/chatSlice';
import { cn } from '../../lib/utils';

export default function FriendRequests({ searchTerm = '' }) {
  const dispatch = useDispatch();
  const { friendRequests, isFriendRequestsLoading } = useSelector((state) => state.chat);
  const { userDetails: user } = useSelector((state) => state.user);

  // Friend requests are fetched by ChatPage on mount, no need to fetch here
  // This component just displays the data

  const handleAccept = async (requestId) => {
    await dispatch(acceptFriendRequest(requestId));
    // Refresh contacts and requests
    dispatch(getFriendRequests());
    // Also refresh contacts list to show the new friend
    dispatch(fetchContacts());
  };

  const handleReject = async (requestId) => {
    await dispatch(rejectFriendRequest(requestId));
    // Refresh requests
    dispatch(getFriendRequests());
  };

  if (isFriendRequestsLoading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Loading friend requests...
      </div>
    );
  }

  // Filter requests based on search term
  const filteredReceived = searchTerm
    ? friendRequests.received?.filter(req => 
        req.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (req.department && req.department.toLowerCase().includes(searchTerm.toLowerCase()))
      ) || []
    : friendRequests.received || [];
  
  const filteredSent = searchTerm
    ? friendRequests.sent?.filter(req => 
        req.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (req.department && req.department.toLowerCase().includes(searchTerm.toLowerCase()))
      ) || []
    : friendRequests.sent || [];

  const hasReceivedRequests = filteredReceived.length > 0;
  const hasSentRequests = filteredSent.length > 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Received Requests */}
      {hasReceivedRequests && (
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Received Requests ({filteredReceived.length})
          </h3>
          <div className="space-y-3">
            {filteredReceived.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between p-3 bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="relative flex-shrink-0">
                    <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
                      {request.profilePicture ? (
                        <img
                          src={request.profilePicture}
                          alt={request.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-lg font-semibold text-primary">
                          {request.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    {request.isOnline && (
                      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-success border-2 border-background" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{request.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{request.email}</p>
                    {request.department && (
                      <p className="text-xs text-muted-foreground">{request.department}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <Button
                    onClick={() => handleAccept(request.requestId)}
                    variant="primary"
                    size="sm"
                    className="h-8 px-3"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Accept
                  </Button>
                  <Button
                    onClick={() => handleReject(request.requestId)}
                    variant="outline"
                    size="sm"
                    className="h-8 px-3"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sent Requests */}
      {hasSentRequests && (
        <div className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Sent Requests ({filteredSent.length})
          </h3>
          <div className="space-y-3">
            {filteredSent.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between p-3 bg-card border border-border rounded-lg opacity-75"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="relative flex-shrink-0">
                    <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
                      {request.profilePicture ? (
                        <img
                          src={request.profilePicture}
                          alt={request.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-lg font-semibold text-primary">
                          {request.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    {request.isOnline && (
                      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-success border-2 border-background" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{request.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{request.email}</p>
                    {request.department && (
                      <p className="text-xs text-muted-foreground">{request.department}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Pending
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State - Show only if no requests at all */}
      {!hasReceivedRequests && !hasSentRequests && (
        <div className="flex-1 flex items-center justify-center p-4 text-center text-muted-foreground">
          <p className="text-sm">No pending friend requests</p>
        </div>
      )}
    </div>
  );
}

