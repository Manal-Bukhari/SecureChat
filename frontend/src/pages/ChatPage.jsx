import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useSocket } from '../contexts/SocketContext';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import ContactsSidebar from "../components/Chat/ContactsSidebar";
import ChatArea from "../components/Chat/ChatArea";
import EmptyChatState from "../components/Chat/EmptyChatState";
import { fetchContacts, fetchMessages, sendMessage, setSelectedContact, setSelectedGroup, addMessage, getFriendRequests, fetchGroups, getGroupRequests } from '../store/slices/chatSlice';
import { Button } from '../components/ui/Button';

export default function ChatPage() {
  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { socket, isConnected, connectError, reconnect } = useSocket();
  const { contacts, messages, selectedContact, selectedGroup, groups, isContactsLoading, isMessagesLoading, friendRequests } = useSelector((state) => state.chat);
  const { userDetails: user } = useSelector((state) => state.user);
  const [activeId, setActiveId] = useState(null);
  const [processedMessageIds, setProcessedMessageIds] = useState(new Set());

  // Calculate active contact and group early so they can be used in effects
  const activeContact = selectedContact || contacts.find(c => c.id === activeId);
  const activeGroup = selectedGroup || groups.find(g => g.id === activeId);

  // Check URL params for group or contact ID
  useEffect(() => {
    if (params.id) {
      // Check if it's a group route
      if (location.pathname.includes('/group/')) {
        const group = groups.find(g => g.id === params.id);
        if (group) {
          setActiveId(params.id);
          dispatch(setSelectedGroup(group));
          dispatch(setSelectedContact(null));
        }
      } else {
        // It's a contact route
        const contact = contacts.find(c => c.id === params.id);
        if (contact) {
          setActiveId(params.id);
          dispatch(setSelectedContact(contact));
          dispatch(setSelectedGroup(null));
        }
      }
    } else if (location.state?.activeConversation) {
      // Fallback to location state
      setActiveId(location.state.activeConversation);
    } else if (location.state?.userIdToOpenChat && contacts.length > 0) {
      const contactToOpen = contacts.find(contact => contact.id === location.state.userIdToOpenChat);
      if (contactToOpen) {
        setActiveId(contactToOpen.id);
        dispatch(setSelectedContact(contactToOpen));
        navigate(`/chat/${contactToOpen.id}`, { replace: true });
      }
    }
    // Don't auto-select a contact by default - let user choose
  }, [params.id, location.pathname, location.state, contacts, groups, activeId, dispatch, navigate]);

  // Load contacts, friend requests, groups, and group requests using Redux on first mount
  useEffect(() => {
    if (!user) return;
    
    // Always fetch on first load of chat page
    dispatch(fetchContacts());
    dispatch(getFriendRequests());
    dispatch(fetchGroups());
    dispatch(getGroupRequests());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); // Only depend on user to avoid infinite loops

  // Join room effect (only for contacts, not groups)
  useEffect(() => {
    if (!activeId || !isConnected || !socket || activeGroup) return; // Skip if it's a group
    console.log('Joining room for conversation:', activeId);
    socket.emit('join', {
      conversationId: activeId,
      userId: user?.id
    });

    const handleJoined = (data) => {
      console.log('Joined room:', data);
    };

    socket.on('joined', handleJoined);

    return () => {
      socket.off('joined', handleJoined);
    };
  }, [activeId, isConnected, socket, user, activeGroup]);

  // Load messages when active contact changes using Redux (only for contacts, not groups)
  useEffect(() => {
    if (!activeId || activeGroup) return; // Skip if it's a group
    setProcessedMessageIds(new Set());
    dispatch(fetchMessages(activeId));
  }, [activeId, dispatch, activeGroup]);

  // Listen for new messages (only for contacts, not groups)
  useEffect(() => {
    if (!isConnected || !activeId || !socket || activeGroup) return; // Skip if it's a group
    const handleNewMessage = (msg) => {
      console.log('New message received:', msg);
      if (msg.conversationId !== activeId) {
        return;
      }
      if (msg.id && processedMessageIds.has(msg.id)) {
        console.log('Skipping duplicate message:', msg.id);
        return;
      }
      if (msg.id) {
        setProcessedMessageIds(prev => new Set(prev).add(msg.id));
      }
      if (msg.senderId !== user?.id) {
        dispatch(addMessage(msg));
      }
    };
    socket.on('newMessage', handleNewMessage);
    return () => {
      socket.off('newMessage', handleNewMessage);
    };
  }, [isConnected, activeId, socket, processedMessageIds, user, dispatch, activeGroup]);

  const handleSend = async (e, messageText) => {
    e.preventDefault();
    if (!messageText.trim() || !activeId || !isConnected || activeGroup) return; // Don't send messages for groups
    console.log('Sending message to conversation:', activeId);
    const tempId = `temp-${Date.now()}`;
    const newMessage = {
      id: tempId,
      conversationId: activeId,
      senderId: user?.id || 'me',
      text: messageText.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      pending: true
    };
    dispatch(addMessage(newMessage));
    
    try {
      const response = await dispatch(sendMessage({
        conversationId: activeId,
        messageData: {
          conversationId: activeId,
          text: messageText.trim(),
          senderId: user?.id
        }
      }));
      
      if (response.meta.requestStatus === "fulfilled" && response.payload?.id) {
        setProcessedMessageIds(prev => new Set(prev).add(response.payload.id));
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleContactClick = (contactId) => {
    // Check if it's a group or contact
    const group = groups.find(g => g.id === contactId);
    const contact = contacts.find(c => c.id === contactId);
    
    if (group) {
      // It's a group - navigate to group route
      setActiveId(contactId);
      dispatch(setSelectedGroup(group));
      dispatch(setSelectedContact(null)); // Clear contact selection
      navigate(`/chat/group/${contactId}`, { replace: true });
    } else if (contact) {
      // It's a contact - navigate to contact route
      setActiveId(contactId);
      dispatch(setSelectedContact(contact));
      dispatch(setSelectedGroup(null)); // Clear group selection
      navigate(`/chat/${contactId}`, { replace: true });
    }
  };

  if (isContactsLoading && contacts.length === 0) {
    return <div className="flex items-center justify-center h-screen text-gray-600 dark:text-gray-400">Loading contacts...</div>;
  }

  return (
    <div className="w-full h-[calc(100vh-64px)] flex flex-col" style={{ margin: 0, padding: 0 }}>
      {!isConnected && (
        <div className="bg-warning/20 border border-warning/50 p-2 text-warning flex items-center justify-between z-10">
          <span>Connection to messaging service lost.</span>
          <Button onClick={reconnect} variant="outline" size="sm" className="ml-2">
            Reconnect
          </Button>
        </div>
      )}
      <div className="flex-1 flex w-full overflow-hidden" style={{ margin: 0, padding: 0 }}>
        {/* Contacts Sidebar */}
        <ContactsSidebar
          contacts={contacts}
          activeId={activeId}
          setActiveId={handleContactClick}
        />

        {/* Chat Area or Empty State */}
        {activeGroup ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-background p-8">
            <div className="text-center max-w-md">
              <div className="h-20 w-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                <svg className="h-10 w-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-foreground mb-2">{activeGroup.name}</h2>
              {activeGroup.description && (
                <p className="text-muted-foreground mb-4">{activeGroup.description}</p>
              )}
              <p className="text-sm text-muted-foreground mb-6">
                {activeGroup.memberCount} {activeGroup.memberCount === 1 ? 'member' : 'members'}
              </p>
              <p className="text-sm text-muted-foreground">
                Group messaging functionality coming soon...
              </p>
            </div>
          </div>
        ) : activeContact ? (
          <ChatArea
            activeContact={activeContact}
            messages={messages}
            loading={isMessagesLoading}
            isConnected={isConnected}
            connectError={connectError}
            handleSend={handleSend}
            currentUserId={user?.id}
            isFriend={true} // Contacts list only shows accepted friends
          />
        ) : (
          <EmptyChatState currentUserId={user?.id} />
        )}
      </div>
    </div>
  );
}

