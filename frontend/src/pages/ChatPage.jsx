import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useSocket } from '../contexts/SocketContext';
import { useCrypto } from '../contexts/CryptoContext';
import { useLocation, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import ContactsSidebar from "../components/Chat/ContactsSidebar";
import NavigationSidebar from "../components/Chat/NavigationSidebar";
import ChatArea from "../components/Chat/ChatArea";
import EmptyChatState from "../components/Chat/EmptyChatState";
import ForwardMessageDialog from "../components/Chat/ForwardMessageDialog";
import IncomingCallModal from "../components/VoiceCall/IncomingCallModal";
import ActiveCallModal from "../components/VoiceCall/ActiveCallModal";
import { fetchContacts, fetchMessages, sendMessage, setSelectedContact, setSelectedGroup, addMessage, getFriendRequests, fetchGroups, getGroupRequests, clearMessages, markMessagesAsRead, markMessageAsRead, updateContactStatus } from '../store/slices/chatSlice';
import {
  receiveIncomingCall,
  acceptCall,
  declineCall,
  endCall,
  toggleMute,
  toggleSpeaker,
  updateCallDuration,
  setCallStatus,
  clearIncomingCall,
  setCallId,
  setCallError,
  fetchCallHistory
} from '../store/slices/voiceCallSlice';
import useVoiceCall from '../hooks/useVoiceCall';
import { Button } from '../components/ui/Button';
import axiosInstance from '../store/axiosInstance';

export default function ChatPage() {
  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const dispatch = useDispatch();
  const { socket, isConnected, connectError, reconnect } = useSocket();
  const { encryptMessage, decryptMessage, isInitialized: isCryptoInitialized } = useCrypto();
  const { contacts, messages, selectedContact, selectedGroup, groups, isContactsLoading, isMessagesLoading, friendRequests } = useSelector((state) => state.chat);
  const { userDetails: user } = useSelector((state) => state.user);
  const { activeCall, incomingCall } = useSelector((state) => state.voiceCall);
  
  // State
  const [activeId, setActiveId] = useState(null);
  const [processedMessageIds, setProcessedMessageIds] = useState(new Set());
  const [decryptedMessages, setDecryptedMessages] = useState({});
  const [isForwardDialogOpen, setIsForwardDialogOpen] = useState(false);
  const [messageToForward, setMessageToForward] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Determine activeView from URL path or search params
  const isCallsRoute = location.pathname === '/calls';
  const activeView = isCallsRoute ? 'calls' : (searchParams.get('view') || 'messages');

  // Initialize view from URL on mount (only for chat routes, not calls route)
  useEffect(() => {
    if (!isCallsRoute) {
      const viewParam = searchParams.get('view');
      if (!viewParam || (viewParam !== 'messages' && viewParam !== 'requests' && viewParam !== 'groups')) {
        // If no valid view param, set default to messages
        if (!viewParam) {
          setSearchParams({ view: 'messages' }, { replace: true });
        }
      }
    }
  }, [searchParams, setSearchParams, isCallsRoute]);

  const handleViewChange = (view) => {
    if (view === 'calls') {
      navigate('/calls');
    } else {
      // Update URL with new view for chat routes
      setSearchParams({ view }, { replace: true });
    }
    // If switching to calls view and sidebar is collapsed, expand it
    if (view === 'calls' && isSidebarCollapsed) {
      setIsSidebarCollapsed(false);
    }
  };

  // Initialize WebRTC hook for voice calls
  const {
    startCall: startWebRTCCall,
    answerCall: answerWebRTCCall,
    endCall: endWebRTCCall,
    toggleMute: toggleWebRTCMute,
  } = useVoiceCall(
    socket,
    activeCall?.callId,
    activeCall?.isIncoming === false,
    activeCall?.contactId,
    user?.id
  );

  // Calculate active contact and group early
  const activeContact = selectedContact || contacts.find(c => c.id === activeId);
  const activeGroup = selectedGroup || groups.find(g => g.id === activeId);

  // Check URL params for group or contact ID
  useEffect(() => {
    if (params.id) {
      if (location.pathname.includes('/group/')) {
        const group = groups.find(g => g.id === params.id);
        if (group) {
          setActiveId(params.id);
          dispatch(setSelectedGroup(group));
          dispatch(setSelectedContact(null));
        }
      } else {
        const contact = contacts.find(c => c.id === params.id);
        if (contact) {
          setActiveId(params.id);
          dispatch(setSelectedContact(contact));
          dispatch(setSelectedGroup(null));
        }
      }
    } else if (location.state?.activeConversation) {
      // Fallback to location state (Legacy HEAD logic + main logic combined)
      const conversationId = location.state.activeConversation;
      const contact = contacts.find(c => c.id === conversationId);
      if (contact) {
        setActiveId(conversationId);
        dispatch(setSelectedContact(contact));
        dispatch(setSelectedGroup(null));
      }
    } else if (location.state?.userIdToOpenChat && contacts.length > 0) {
      // Logic from main to handle "userIdToOpenChat"
      const contactToOpen = contacts.find(contact => contact.id === location.state.userIdToOpenChat);
      if (contactToOpen) {
        setActiveId(contactToOpen.id);
        dispatch(setSelectedContact(contactToOpen));
        dispatch(setSelectedGroup(null));
        navigate(`/chat/${contactToOpen.id}?view=messages`, { replace: true });
      }
    } else {
      // No active chat - clear selection
      setActiveId(null);
      dispatch(setSelectedContact(null));
      dispatch(setSelectedGroup(null));
    }
  }, [params.id, location.pathname, location.state, contacts, groups, dispatch, navigate]);

  // Load contacts, friend requests, groups
  useEffect(() => {
    if (!user) return;
    dispatch(fetchContacts());
    dispatch(getFriendRequests());
    dispatch(fetchGroups());
    dispatch(getGroupRequests());
  }, [user, dispatch]);

  // Decrypt messages when they're loaded (From HEAD)
  useEffect(() => {
    const decryptMessagesAsync = async () => {
      if (!messages || messages.length === 0 || !isCryptoInitialized || !user || !activeContact) {
        return;
      }

      const newDecrypted = {};
      
      for (const msg of messages) {
        // Skip if already decrypted or not encrypted
        if (decryptedMessages[msg.id] || !msg.isEncrypted) {
          newDecrypted[msg.id] = decryptedMessages[msg.id] || msg.text;
          continue;
        }

        try {
          // Determine other user's ID for decryption
          let otherUserId;
          
          if (msg.senderId === 'me') {
            // I sent this message
            // Use receiverId if available, otherwise use activeContact.userId as fallback
            otherUserId = msg.receiverId || activeContact.userId;
          } else {
            // They sent this message
            otherUserId = msg.senderId;
          }

          // Skip if we can't determine the other user
          if (!otherUserId) {
            console.warn(`Cannot decrypt message ${msg.id}: missing user ID`);
            newDecrypted[msg.id] = '[Cannot decrypt: Old message format]';
            continue;
          }

          console.log(`🔓 Decrypting message ${msg.id}:`, {
            iSentIt: msg.senderId === 'me',
            senderId: msg.senderId,
            receiverId: msg.receiverId,
            decryptWithUserId: otherUserId
          });

          const decrypted = await decryptMessage(
            {
              ciphertext: msg.encryptedData,
              iv: msg.iv,
              authTag: msg.authTag
            },
            otherUserId
          );

          newDecrypted[msg.id] = decrypted;
          console.log(`✅ Decrypted message ${msg.id}`);
        } catch (error) {
          console.error(`❌ Failed to decrypt message ${msg.id}:`, error);
          newDecrypted[msg.id] = '[Decryption failed]';
        }
      }

      setDecryptedMessages(prev => ({ ...prev, ...newDecrypted }));
    };

    decryptMessagesAsync();
  }, [messages, isCryptoInitialized, user, activeContact, decryptMessage, decryptedMessages]);

  // Emit user online status when connected and join user-specific room (From main)
  useEffect(() => {
    if (isConnected && socket && user?.id) {
      console.log('[SOCKET] Emitting userOnline for user:', user.id);
      socket.emit('userOnline', { userId: user.id });
      // Join user-specific room for receiving read receipts and voice calls
      console.log('[SOCKET] Joining user room:', user.id);
      socket.emit('join', {
        conversationId: user.id, // Use user ID as room ID for user-specific room
        userId: user.id
      });
    }
  }, [isConnected, socket, user]);

  // Listen for user status changes (online/offline)
  useEffect(() => {
    if (!socket) return;

    const handleUserStatusChanged = (data) => {
      dispatch(updateContactStatus({
        userId: data.userId,
        isOnline: data.isOnline,
        lastSeen: data.lastSeen
      }));
    };

    socket.on('userStatusChanged', handleUserStatusChanged);

    return () => {
      socket.off('userStatusChanged', handleUserStatusChanged);
    };
  }, [socket, dispatch]);

  // Join room effect (only for contacts, not groups)
  useEffect(() => {
    if (!activeId || !isConnected || !socket || activeGroup) return; // Skip if it's a group

    // Create a proper conversation room ID that's the same for both users
    // Sort user IDs to ensure consistency (Logic from main)
    const sortedIds = [user?.id, activeId].filter(Boolean).sort();
    const conversationRoomId = `msg_${sortedIds[0]}_${sortedIds[1]}`;

    console.log('Joining room for conversation:', conversationRoomId);
    socket.emit('join', {
      conversationId: conversationRoomId,
      userId: user?.id
    });

    return () => {};
  }, [activeId, isConnected, socket, activeGroup, user]);

  // Fetch messages when active contact or group changes
  useEffect(() => {
    if (!activeId || activeGroup) {
      // Clear messages if no active chat or if it's a group
      // dispatch(clearMessages()); // Optional: Check if HEAD logic wants to keep them? Main logic clears.
      if (activeGroup) {
          // If it is a group, we might handle it differently later
      } else {
        // If no active ID
        dispatch(clearMessages());
      }
      setProcessedMessageIds(new Set());
      return;
    }
    // Clear processed message IDs and fetch new messages
    // Messages are automatically cleared in fetchMessages.pending usually
    setProcessedMessageIds(new Set());
    dispatch(fetchMessages(activeId));
  }, [activeId, dispatch, activeGroup]);

  // Mark messages as read when viewing the conversation
  useEffect(() => {
    if (!activeId || activeGroup || !messages.length) return;
    
    // Get unread messages sent by the other person
    const unreadMessages = messages.filter(
      msg => msg.conversationId === activeId && 
             msg.senderId !== 'me' && 
             msg.senderId !== user?.id && 
             !msg.read &&
             !msg.pending
    );

    if (unreadMessages.length > 0) {
      const messageIds = unreadMessages.map(msg => msg.id);
      dispatch(markMessagesAsRead({ 
        conversationId: activeId, 
        messageIds 
      }));
    }
  }, [activeId, messages, activeGroup, dispatch, user]);

  // Listen for new messages (only for contacts, not groups)
  useEffect(() => {
    if (!socket || !isConnected) return;
    
    const handleNewMessage = async (msg) => {
      console.log('📨 New message received:', msg);
      if (msg.conversationId !== activeId) {
        return;
      }
      if (msg.id && processedMessageIds.has(msg.id)) {
        console.log('⏭️  Skipping duplicate message:', msg.id);
        return;
      }
      if (msg.id) {
        setProcessedMessageIds(prev => new Set(prev).add(msg.id));
      }
      if (msg.senderId !== user?.id) {
        // Add message to state
        dispatch(addMessage(msg));
        
        // Decrypt if encrypted (HEAD Logic merged here)
        if (msg.isEncrypted && isCryptoInitialized) {
          try {
            // For incoming messages, decrypt with sender's ID
            console.log(`🔓 Decrypting incoming message from:`, msg.senderId);
            
            const decrypted = await decryptMessage(
              {
                ciphertext: msg.encryptedData,
                iv: msg.iv,
                authTag: msg.authTag
              },
              msg.senderId
            );
            
            setDecryptedMessages(prev => ({ ...prev, [msg.id]: decrypted }));
            console.log(`✅ Decrypted incoming message`);
          } catch (error) {
            console.error('❌ Failed to decrypt incoming message:', error);
            setDecryptedMessages(prev => ({ ...prev, [msg.id]: '[Decryption failed]' }));
          }
        }
      }
    };
    
    // Listen for read receipts (From main)
    const handleMessagesRead = (readReceipt) => {
      console.log('Read receipt received:', readReceipt);
      
      // Check if this read receipt is for the current conversation
      const isForCurrentConversation = readReceipt.conversationId === activeId || 
                                       readReceipt.conversationId?.toString() === activeId?.toString();
      
      if (isForCurrentConversation) {
        if (readReceipt.messageIds && readReceipt.messageIds.length > 0) {
          readReceipt.messageIds.forEach(messageId => {
            const messageIdStr = messageId.toString();
            // Find message by ID
            const message = messages.find(msg => 
              msg.id === messageIdStr || 
              msg.id === messageId || 
              msg.id?.toString() === messageIdStr
            );
            
            if (message && message.senderId === 'me' && !message.read) {
              dispatch(markMessageAsRead({ messageId: message.id }));
            }
          });
        } else {
          // Mark all messages in conversation as read
          messages.forEach(msg => {
            if (msg.conversationId === activeId && msg.senderId === 'me' && !msg.read) {
              dispatch(markMessageAsRead({ messageId: msg.id }));
            }
          });
        }
      }
    };

    socket.on('newMessage', handleNewMessage);
    socket.on('messagesRead', handleMessagesRead);
    
    return () => {
      socket.off('newMessage', handleNewMessage);
      socket.off('messagesRead', handleMessagesRead);
    };
  }, [isConnected, activeId, socket, processedMessageIds, user, dispatch, activeGroup, isCryptoInitialized, decryptMessage, messages]);

  // Voice call socket listeners
  useEffect(() => {
    if (!socket) return;

    const handleIncomingCall = (data) => {
      console.log('[RECEIVER] Incoming call:', data);

      // Prevent self-calling bug
      if (data.callerId === user?.id) {
        console.error('[RECEIVER] Received call from self, ignoring!');
        return;
      }

      dispatch(receiveIncomingCall({
        callId: data.callId,
        contactId: data.callerId,
        contactName: data.callerName,
        conversationId: data.conversationId
      }));
    };

    const handleCallInitiated = (data) => {
      console.log('[CALLER] Call initiated:', data);
      dispatch(setCallId(data.callId));
    };

    const handleCallAccepted = (data) => {
      console.log('[CALLER] Call accepted:', data);
      // Set status to connected for both caller and receiver
      dispatch(setCallStatus('connected'));

      // For caller: start WebRTC now that receiver has accepted
      if (activeCall && !activeCall.isIncoming && activeCall.callId === data.callId) {
        console.log('[CALLER] Receiver accepted, starting WebRTC call');
        try {
          startWebRTCCall();
        } catch (err) {
          console.error('[CALLER] Error starting WebRTC:', err);
          toast.error('Failed to establish connection: ' + err.message);
          handleEndCall();
        }
      }
    };

    const handleCallDeclined = (data) => {
      console.log('[CALL] Call declined:', data);
      dispatch(endCall());
      endWebRTCCall();
      
      // Show appropriate message based on whether it's a timeout or manual decline
      if (data.isTimeout || data.status === 'missed') {
        toast.error('Call missed - No answer');
      } else {
        toast.error('Call was declined');
      }
      
      // Refresh call history after call is declined/missed
      dispatch(fetchCallHistory({ limit: 100, offset: 0 }));
    };

    const handleCallEnded = (data) => {
      console.log('[CALL] Call ended:', data);
      dispatch(endCall());
      endWebRTCCall();
      if (activeCall?.status === 'connected') {
        toast.success('Call ended');
      }
      dispatch(fetchCallHistory({ limit: 100, offset: 0 }));
    };

    const handleCallError = (data) => {
      console.error('[CALL] Call error:', data);
      const errorMessage = data.message || 'Call error occurred';
      toast.error('Call error: ' + errorMessage);
      dispatch(setCallError(errorMessage));
      dispatch(endCall());
      endWebRTCCall();
    };

    socket.on('voice-call:incoming', handleIncomingCall);
    socket.on('voice-call:initiated', handleCallInitiated);
    socket.on('voice-call:accepted', handleCallAccepted);
    socket.on('voice-call:declined', handleCallDeclined);
    socket.on('voice-call:ended', handleCallEnded);
    socket.on('voice-call:error', handleCallError);

    return () => {
      socket.off('voice-call:incoming', handleIncomingCall);
      socket.off('voice-call:initiated', handleCallInitiated);
      socket.off('voice-call:accepted', handleCallAccepted);
      socket.off('voice-call:declined', handleCallDeclined);
      socket.off('voice-call:ended', handleCallEnded);
      socket.off('voice-call:error', handleCallError);
    };
  }, [socket, dispatch, endWebRTCCall, activeCall, startWebRTCCall, user]);

  // Handle outgoing call - initiate call to backend
  useEffect(() => {
    if (activeCall?.status === 'calling' && !activeCall?.isIncoming && !activeCall?.callId && socket && user) {
      // Prevent self-calling
      if (activeCall.contactId === user.id) {
        console.error('Cannot call yourself!');
        dispatch(endCall());
        toast.error('Cannot call yourself');
        return;
      }

      console.log('[CALLER] Initiating outgoing call...', {
        callerId: user.id,
        receiverId: activeCall.contactId
      });

      socket.emit('voice-call:initiate', {
        callerId: user.id,
        receiverId: activeCall.contactId,
        callerName: user.fullName || user.name
      });
    }
  }, [activeCall?.status, activeCall?.callId, activeCall?.isIncoming, activeCall?.contactId, socket, user, dispatch]);

  // Call duration timer
  useEffect(() => {
    if (activeCall?.status === 'connected' && activeCall?.callId) {
      const interval = setInterval(() => {
        dispatch(updateCallDuration());
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [activeCall?.status, activeCall?.callId, dispatch]);

  // 25-second timeout for incoming calls
  useEffect(() => {
    if (!incomingCall) return;

    const timeout = setTimeout(() => {
      console.log('[RECEIVER] Call timeout (25s), auto-declining and marking as missed');
      
      // Show message immediately for receiver
      toast.error('Call missed - No answer');
      
      // Emit decline event to backend with timeout flag
      socket?.emit('voice-call:decline', {
        callId: incomingCall.callId,
        receiverId: user?.id,
        isTimeout: true // Flag to mark as missed instead of declined
      });

      // Clear incoming call
      dispatch(clearIncomingCall());
      dispatch(endCall());
      endWebRTCCall();
      
      // Refresh call history to show missed call
      dispatch(fetchCallHistory({ limit: 100, offset: 0 }));
    }, 25000); // 25 seconds

    return () => clearTimeout(timeout);
  }, [incomingCall, socket, user, dispatch, endWebRTCCall]);

  // Voice call handler functions
  const handleAcceptCall = () => {
    if (incomingCall) {
      console.log('Accepting call:', incomingCall.callId);
      dispatch(acceptCall({
        callId: incomingCall.callId,
        contactId: incomingCall.contactId,
        contactName: incomingCall.contactName,
        conversationId: incomingCall.conversationId
      }));

      socket?.emit('voice-call:accept', {
        callId: incomingCall.callId,
        receiverId: user?.id
      });

      dispatch(clearIncomingCall());
      console.log('[RECEIVER] Call accepted, waiting for WebRTC offer from caller');
    }
  };

  const handleDeclineCall = () => {
    if (incomingCall) {
      console.log('Declining call:', incomingCall.callId);
      socket?.emit('voice-call:decline', {
        callId: incomingCall.callId,
        receiverId: user?.id
      });

      dispatch(declineCall());
      dispatch(fetchCallHistory({ limit: 100, offset: 0 }));
    }
  };

  const handleEndCall = () => {
    if (activeCall?.callId) {
      console.log('Ending call:', activeCall.callId);
      const duration = activeCall.duration;

      socket?.emit('voice-call:end', {
        callId: activeCall.callId,
        userId: user?.id,
        duration
      });

      endWebRTCCall();
      dispatch(endCall());
      dispatch(fetchCallHistory({ limit: 100, offset: 0 }));
    }
  };

  const handleToggleMute = () => {
    toggleWebRTCMute();
    dispatch(toggleMute());
  };

  const handleToggleSpeaker = () => {
    dispatch(toggleSpeaker());
  };

  const handleSend = async (e, messageText, replyingTo = null) => {
    e.preventDefault();
    if (!messageText.trim() || !activeId || !isConnected || activeGroup) return;

    // Check encryption capability (From HEAD)
    const canEncrypt = isCryptoInitialized && activeContact && activeContact.userId;
    console.log('🔐 Encryption check:', { 
      isCryptoInitialized, 
      hasActiveContact: !!activeContact,
      hasUserId: !!activeContact?.userId,
      canEncrypt
    });

    // Create optimistic message (From main)
    const tempId = `temp-${Date.now()}`;
    
    // Optimistic message text to show immediately
    const textToShow = messageText.trim();

    const newMessage = {
      id: tempId,
      conversationId: activeId,
      senderId: user?.id || 'me',
      senderName: user?.name || user?.fullName || 'You',
      text: textToShow,
      replyingTo: replyingTo ? {
        text: replyingTo.text,
        id: replyingTo.id,
        senderId: replyingTo.senderId,
        senderName: replyingTo.senderName
      } : null,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      fullTimestamp: new Date().toISOString(),
      pending: true,
      read: false
    };
    
    // Add optimistic message to store
    dispatch(addMessage(newMessage));

    try {
      let messagePayload;
      
      // Encryption Logic (From HEAD)
      if (canEncrypt) {
        try {
          console.log('🔒 Encrypting message for user:', activeContact.userId);
          const encrypted = await encryptMessage(messageText.trim(), activeContact.userId);
          
          messagePayload = {
            conversationId: activeId,
            text: '[Encrypted]', // Send placeholder as text
            encryptedData: encrypted.ciphertext,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
            isEncrypted: true,
            senderId: user?.id
          };
          
          console.log('✅ Message encrypted successfully');
        } catch (encryptError) {
          console.error('❌ Encryption failed:', encryptError);
          // Fallback to plain text if encryption fails
          messagePayload = {
            conversationId: activeId,
            text: messageText.trim(),
            isEncrypted: false,
            senderId: user?.id
          };
        }
      } else {
        console.log('⚠️  Crypto not ready, sending unencrypted');
        messagePayload = {
          conversationId: activeId,
          text: messageText.trim(),
          isEncrypted: false,
          senderId: user?.id
        };
      }

      // Handle Replying To Logic (From main)
      // If we are replying, we might need to prepend metadata or handle it in the payload
      // Ideally the backend supports `replyingTo` ID, but based on main branch, it prepends text.
      if (replyingTo) {
        messagePayload.text = `Replying to: ${replyingTo.text}\n${messagePayload.text}`;
      }
      
      // Send to backend
      const response = await dispatch(sendMessage({
        conversationId: activeId,
        messageData: messagePayload
      }));
      
      if (response.meta.requestStatus === "fulfilled" && response.payload?.id) {
        setProcessedMessageIds(prev => new Set(prev).add(response.payload.id));
        
        // If encrypted, cache the decrypted version for local display so we don't see "[Encrypted]"
        if (messagePayload.isEncrypted) {
          setDecryptedMessages(prev => ({
            ...prev,
            [response.payload.id]: messageText.trim()
          }));
        }
        
        // Emit via socket for real-time delivery
        socket.emit('sendMessage', {
          ...response.payload,
          conversationId: activeId
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleContactClick = (contactId) => {
    const group = groups.find(g => g.id === contactId);
    const contact = contacts.find(c => c.id === contactId);
    
    if (group) {
      setActiveId(contactId);
      dispatch(setSelectedGroup(group));
      dispatch(setSelectedContact(null));
      navigate(`/chat/group/${contactId}?view=messages`, { replace: true });
    } else if (contact) {
      setActiveId(contactId);
      dispatch(setSelectedContact(contact));
      dispatch(setSelectedGroup(null));
      // Clear previous decrypted messages for safety/cleanup (From HEAD)
      setDecryptedMessages({});
      navigate(`/chat/${contactId}?view=messages`, { replace: true });
    }
  };

  const handleForwardMessage = (message) => {
    setMessageToForward(message);
    setIsForwardDialogOpen(true);
  };

  // Prepare messages with decrypted content (From HEAD)
  // This ensures that when we pass messages to ChatArea, they contain readable text
  const displayMessages = messages.map(msg => ({
    ...msg,
    text: msg.isEncrypted ? (decryptedMessages[msg.id] || 'Decrypting...') : msg.text
  }));

  if (isContactsLoading && contacts.length === 0) {
    return <div className="flex items-center justify-center h-screen text-gray-600 dark:text-gray-400">Loading contacts...</div>;
  }

  return (
    <div className="w-full h-screen flex flex-col" style={{ margin: 0, padding: 0 }}>
      {!isConnected && (
        <div className="bg-warning/20 border border-warning/50 p-2 text-warning flex items-center justify-between z-10">
          <span>Connection to messaging service lost.</span>
          <Button onClick={reconnect} variant="outline" size="sm" className="ml-2">
            Reconnect
          </Button>
        </div>
      )}
      
      {/* Encryption Banner from HEAD */}
      {isCryptoInitialized && activeContact && (
        <div className="bg-green-500/10 border-b border-green-500/20 p-1 text-xs text-green-600 dark:text-green-400 text-center">
          🔒 End-to-end encrypted
        </div>
      )}
      
      <div className="flex-1 flex w-full overflow-hidden" style={{ margin: 0, padding: 0 }}>
        {/* Navigation Sidebar - Always visible (From main) */}
        <NavigationSidebar
          activeView={activeView}
          onViewChange={handleViewChange}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />
        
        {/* Contacts Sidebar - Always visible */}
        <ContactsSidebar
          contacts={contacts}
          activeId={activeId}
          setActiveId={handleContactClick}
          isCollapsed={isSidebarCollapsed}
          activeView={activeView}
        />

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
            messages={displayMessages}
            loading={isMessagesLoading}
            isConnected={isConnected}
            connectError={connectError}
            handleSend={handleSend}
            currentUserId={user?.id}
            isFriend={true}
            onForwardMessage={handleForwardMessage}
            currentUserName={user?.name || user?.fullName}
            isGroupChat={false}
          />
        ) : (
          <EmptyChatState currentUserId={user?.id} />
        )}
      </div>

      {/* Forward Message Dialog */}
      <ForwardMessageDialog
        open={isForwardDialogOpen}
        onOpenChange={setIsForwardDialogOpen}
        message={messageToForward}
      />

      {/* Incoming Call Modal */}
      <IncomingCallModal
        isOpen={!!incomingCall}
        callerName={incomingCall?.contactName || 'Unknown'}
        onAccept={handleAcceptCall}
        onDecline={handleDeclineCall}
      />

      {/* Active Call Modal */}
      <ActiveCallModal
        isOpen={activeCall?.status !== 'idle' && activeCall?.status !== 'ended' && !!activeCall?.callId}
        contactName={activeCall?.contactName || 'Unknown'}
        callStatus={activeCall?.status || 'calling'}
        duration={activeCall?.duration || 0}
        isMuted={activeCall?.isMuted || false}
        isSpeakerOn={activeCall?.isSpeakerOn || false}
        onToggleMute={handleToggleMute}
        onToggleSpeaker={handleToggleSpeaker}
        onEndCall={handleEndCall}
      />
    </div>
  );
}