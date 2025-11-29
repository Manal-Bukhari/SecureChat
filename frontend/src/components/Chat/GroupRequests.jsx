import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Check, X, Clock, Users } from 'lucide-react';
import { Button } from '../ui/Button';
import { getGroupRequests, acceptGroupRequest, rejectGroupRequest, fetchGroups } from '../../store/slices/chatSlice';
import { cn } from '../../lib/utils';

export default function GroupRequests({ searchTerm = '' }) {
  const dispatch = useDispatch();
  const { groupRequests, isGroupRequestsLoading } = useSelector((state) => state.chat);
  const { userDetails: user } = useSelector((state) => state.user);

  // Fetch group requests on initial load if not already loaded
  useEffect(() => {
    if (!user) return;
    
    const hasBeenFetched = groupRequests?.received !== undefined && groupRequests?.sent !== undefined;
    if (!hasBeenFetched) {
      dispatch(getGroupRequests());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleAccept = async (requestId) => {
    await dispatch(acceptGroupRequest(requestId));
    dispatch(getGroupRequests());
    dispatch(fetchGroups());
  };

  const handleReject = async (requestId) => {
    await dispatch(rejectGroupRequest(requestId));
    dispatch(getGroupRequests());
  };

  if (isGroupRequestsLoading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Loading group requests...
      </div>
    );
  }

  // Filter requests based on search term
  const filteredReceived = searchTerm
    ? groupRequests.received?.filter(req => 
        req.groupName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.sender.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.sender.email.toLowerCase().includes(searchTerm.toLowerCase())
      ) || []
    : groupRequests.received || [];
  
  const filteredSent = searchTerm
    ? groupRequests.sent?.filter(req => 
        req.groupName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.receiver.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.receiver.email.toLowerCase().includes(searchTerm.toLowerCase())
      ) || []
    : groupRequests.sent || [];

  const hasReceivedRequests = filteredReceived.length > 0;
  const hasSentRequests = filteredSent.length > 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Received Requests */}
      {hasReceivedRequests && (
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Users className="h-4 w-4" />
            Received Group Requests ({filteredReceived.length})
          </h3>
          <div className="space-y-3">
            {filteredReceived.map((request) => (
              <div
                key={request.id}
                className="flex flex-col gap-2 p-3 bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="h-4 w-4 text-primary" />
                      <p className="font-medium text-foreground">{request.groupName}</p>
                    </div>
                    {request.groupDescription && (
                      <p className="text-xs text-muted-foreground mb-2">{request.groupDescription}</p>
                    )}
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary">
                        {request.sender.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-foreground">{request.sender.name}</p>
                        <p className="text-xs text-muted-foreground">{request.sender.email}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => handleAccept(request.requestId)}
                    variant="primary"
                    size="sm"
                    className="flex-1"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Accept
                  </Button>
                  <Button
                    onClick={() => handleReject(request.requestId)}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Reject
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
            Sent Group Requests ({filteredSent.length})
          </h3>
          <div className="space-y-3">
            {filteredSent.map((request) => (
              <div
                key={request.id}
                className="flex flex-col gap-2 p-3 bg-card border border-border rounded-lg opacity-75"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="h-4 w-4 text-primary" />
                      <p className="font-medium text-foreground">{request.groupName}</p>
                    </div>
                    {request.groupDescription && (
                      <p className="text-xs text-muted-foreground mb-2">{request.groupDescription}</p>
                    )}
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary">
                        {request.receiver.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-foreground">{request.receiver.name}</p>
                        <p className="text-xs text-muted-foreground">{request.receiver.email}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-end">
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

      {/* Empty State */}
      {!hasReceivedRequests && !hasSentRequests && (
        <div className="flex-1 flex items-center justify-center p-4 text-center text-muted-foreground">
          <p className="text-sm">No pending group requests</p>
        </div>
      )}
    </div>
  );
}


