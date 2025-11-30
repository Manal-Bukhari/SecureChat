import { useRef, useEffect, useState, useCallback } from 'react';
import { useCrypto } from '../contexts/CryptoContext';
import { toast } from 'react-hot-toast';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const useVoiceCall = (socket, callId, isInitiator, receiverId, callerId) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState(null);
  const [isEncrypted, setIsEncrypted] = useState(false);
  
  // Crypto context for encryption
  const { encryptMessage, decryptMessage, isInitialized: isCryptoInitialized, getUserPublicKey } = useCrypto();

  // WebRTC state machine
  const [webrtcState, setWebrtcState] = useState('idle');
  // States: 'idle', 'getting_media', 'media_ready', 'offer_sent', 'offer_received',
  //         'answer_sent', 'answer_received', 'connected', 'failed', 'ended'

  // Retry logic state (Fix 7)
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 2;

  // Network quality monitoring (Fix 8)
  const [connectionStats, setConnectionStats] = useState(null);

  const peerConnectionRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const pendingOfferRef = useRef(null);
  const shouldAnswerRef = useRef(false);
  const recipientPublicKeyRef = useRef(null);
  const encryptionEnabledRef = useRef(false);

  // Timeout refs (Fix 4)
  const offerTimeoutRef = useRef(null);
  const answerTimeoutRef = useRef(null);
  const connectionTimeoutRef = useRef(null);

  // Create audio element for remote stream
  useEffect(() => {
    if (!remoteAudioRef.current) {
      remoteAudioRef.current = document.createElement('audio');
      remoteAudioRef.current.autoplay = true;
      document.body.appendChild(remoteAudioRef.current);
    }

    return () => {
      if (remoteAudioRef.current && document.body.contains(remoteAudioRef.current)) {
        document.body.removeChild(remoteAudioRef.current);
        remoteAudioRef.current = null;
      }
    };
  }, []);

  // Update audio source when remote stream changes
  useEffect(() => {
    if (remoteStream && remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Helper function to encrypt signaling data
  const encryptSignalingData = useCallback(async (data, recipientId) => {
    try {
      // If crypto is not initialized but we have a recipient, try to enable encryption
      if (!isCryptoInitialized && recipientId) {
        console.log('[ENCRYPTION] Crypto not initialized, attempting to enable encryption...');
        // Try to get recipient key to enable encryption
        try {
          const recipientKey = await getUserPublicKey(recipientId);
          recipientPublicKeyRef.current = recipientKey;
          encryptionEnabledRef.current = true;
          setIsEncrypted(true);
          console.log('[ENCRYPTION] Encryption enabled during encryption attempt');
        } catch (keyErr) {
          console.warn('[ENCRYPTION] Could not get recipient key:', keyErr.message);
          // Still try encryption if crypto service is ready
        }
      }

      // Only skip encryption if explicitly disabled AND crypto is not initialized
      if (!encryptionEnabledRef.current && !isCryptoInitialized) {
        console.warn('[ENCRYPTION] Crypto not initialized and encryption disabled, sending unencrypted');
        return { encrypted: false, data };
      }

      // If encryption is enabled or crypto is initialized, try to encrypt
      if (encryptionEnabledRef.current || isCryptoInitialized) {
        // Serialize the data to JSON string
        const jsonString = JSON.stringify(data);
        
        // Encrypt using the crypto service
        const encrypted = await encryptMessage(jsonString, recipientId);
        
        // Successfully encrypted - ensure encryption is marked as enabled
        encryptionEnabledRef.current = true;
        setIsEncrypted(true);
        
        return {
          encrypted: true,
          encryptedData: encrypted,
          isEncrypted: true
        };
      }

      // Fallback to unencrypted only if we really can't encrypt
      console.warn('[ENCRYPTION] Encryption not available, sending unencrypted');
      return { encrypted: false, data };
    } catch (err) {
      console.error('[ENCRYPTION] Failed to encrypt signaling data:', err);
      // Only fallback to unencrypted if it's a critical error
      // If it's just a key issue, we might want to retry
      if (err.message && err.message.includes('not set up encryption')) {
        // Recipient doesn't have encryption set up - must send unencrypted
        encryptionEnabledRef.current = false;
        setIsEncrypted(false);
        return { encrypted: false, data, encryptionError: err.message };
      }
      // For other errors, still try to send unencrypted but log the error
      return { encrypted: false, data, encryptionError: err.message };
    }
  }, [encryptMessage, isCryptoInitialized, getUserPublicKey]);

  // Helper function to decrypt signaling data
  const decryptSignalingData = useCallback(async (encryptedPayload, senderId) => {
    try {
      // Check if payload is encrypted (check both isEncrypted and encrypted properties)
      const isEncrypted = encryptedPayload.isEncrypted || (encryptedPayload.encrypted === true);
      
      if (!isEncrypted || !encryptedPayload.encryptedData) {
        // Unencrypted format - handle multiple formats:
        // 1. Legacy format: { offer: {...} } or { answer: {...} } or { candidate: {...} }
        // 2. encryptSignalingData fallback: { encrypted: false, data: {...} }
        // 3. Direct format: the payload itself if it has type/sdp or candidate properties
        const unencryptedData = encryptedPayload.offer || 
                                encryptedPayload.answer || 
                                encryptedPayload.candidate || 
                                (encryptedPayload.data && (encryptedPayload.encrypted === false || !encryptedPayload.encrypted) ? encryptedPayload.data : null) ||
                                encryptedPayload;
        return unencryptedData;
      }

      if (!isCryptoInitialized) {
        throw new Error('Crypto not initialized, cannot decrypt');
      }

      // Decrypt using the crypto service
      const decryptedJson = await decryptMessage(encryptedPayload.encryptedData, senderId);
      
      // Parse JSON back to object
      const decrypted = JSON.parse(decryptedJson);
      return decrypted;
    } catch (err) {
      console.error('[ENCRYPTION] Failed to decrypt signaling data:', err);
      throw new Error('Failed to decrypt signaling message: ' + err.message);
    }
  }, [decryptMessage, isCryptoInitialized]);

  // Initialize peer connection
  const initializePeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      return peerConnectionRef.current;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Handle ICE candidates
    pc.onicecandidate = async (event) => {
      // Skip null candidates (end-of-candidates marker)
      if (!event.candidate || !socket || !callId) {
        return;
      }

      try {
        // Serialize ICE candidate manually (it doesn't have toJSON)
        const candidateData = {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          usernameFragment: event.candidate.usernameFragment
        };
        
        // Only encrypt if encryption is enabled
        if (encryptionEnabledRef.current) {
          const encryptedPayload = await encryptSignalingData(candidateData, receiverId);
          socket.emit('voice-call:ice-candidate', {
            ...encryptedPayload,
            callId,
            from: callerId,
            to: receiverId
          });
        } else {
          // Send unencrypted
          socket.emit('voice-call:ice-candidate', {
            candidate: candidateData,
            callId,
            from: callerId,
            to: receiverId,
            encrypted: false
          });
        }
      } catch (err) {
        console.error('[WEBRTC] Failed to encrypt ICE candidate:', err);
        // Fallback to unencrypted
        const candidateData = {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          usernameFragment: event.candidate.usernameFragment
        };
        socket.emit('voice-call:ice-candidate', {
          candidate: candidateData,
          callId,
          from: callerId,
          to: receiverId,
          encrypted: false
        });
      }
    };

    // Handle remote track
    pc.ontrack = (event) => {
      console.log('[WEBRTC] Received remote track:', event.streams[0]);
      setRemoteStream(event.streams[0]);
      setWebrtcState('connected');
      // Clear connection timeout on successful track reception
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
    };

    // Enhanced ICE connection state monitoring (Fix 3)
    pc.oniceconnectionstatechange = () => {
      console.log('[WEBRTC] ICE connection state:', pc.iceConnectionState);

      switch (pc.iceConnectionState) {
        case 'checking':
          console.log('[WEBRTC] Checking ICE connection...');
          break;
        case 'connected':
        case 'completed':
          console.log('[WEBRTC] ICE connection established');
          setError(null);
          break;
        case 'disconnected':
          console.warn('[WEBRTC] ICE connection disconnected, may reconnect...');
          setError('Connection interrupted, attempting to reconnect...');
          break;
        case 'failed':
          console.error('[WEBRTC] ICE connection failed permanently');
          setWebrtcState('failed');
          setError('Connection failed. Please check your internet connection and try again.');
          break;
        case 'closed':
          console.log('[WEBRTC] ICE connection closed');
          setWebrtcState('ended');
          break;
      }
    };

    // Monitor connection state (newer API)
    pc.onconnectionstatechange = () => {
      console.log('[WEBRTC] Connection state:', pc.connectionState);

      switch (pc.connectionState) {
        case 'connecting':
          console.log('[WEBRTC] Connecting...');
          break;
        case 'connected':
          console.log('[WEBRTC] Connection established');
          setWebrtcState('connected');
          setError(null);
          break;
        case 'disconnected':
          console.warn('[WEBRTC] Connection disconnected');
          break;
        case 'failed':
          console.error('[WEBRTC] Connection failed');
          setWebrtcState('failed');
          setError('Connection failed. Please try calling again.');
          break;
        case 'closed':
          console.log('[WEBRTC] Connection closed');
          setWebrtcState('ended');
          break;
      }
    };

    // Monitor signaling state
    pc.onsignalingstatechange = () => {
      console.log('[WEBRTC] Signaling state:', pc.signalingState);
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [socket, callId, isInitiator, receiverId, callerId]);

  // Get local media stream
  const getLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error('Error accessing microphone:', err);
      if (err.name === 'NotAllowedError') {
        setError('Microphone access required. Please allow microphone access in browser settings.');
      } else {
        setError('Failed to access microphone: ' + err.message);
      }
      throw err;
    }
  }, []);

  // Start call (as initiator)
  const startCall = useCallback(async () => {
    try {
      console.log('[WEBRTC-CALLER] Starting call as initiator...');
      console.log('[WEBRTC-CALLER] Call params:', { callId, callerId, receiverId });

      // Check if encryption is available - be more aggressive about enabling it
      let encryptionAvailable = false;
      
      // First, ensure crypto is initialized
      if (!isCryptoInitialized && receiverId) {
        console.log('[ENCRYPTION] Crypto not initialized, attempting to initialize...');
        // Note: initializeCrypto is not directly available, but it should auto-initialize
        // We'll proceed and let encryptSignalingData handle it
      }
      
      // Try to enable encryption if we have a receiver ID
      if (receiverId) {
        try {
          // Try to get recipient's public key (with retry logic)
          let recipientKey = null;
          let retries = 2;
          let lastError = null;
          
          while (retries > 0 && !recipientKey) {
            try {
              recipientKey = await getUserPublicKey(receiverId);
              recipientPublicKeyRef.current = recipientKey;
              encryptionEnabledRef.current = true;
              encryptionAvailable = true;
              setIsEncrypted(true);
              console.log('[ENCRYPTION] Encryption enabled for call');
              break;
            } catch (err) {
              lastError = err;
              retries--;
              if (retries > 0) {
                console.log(`[ENCRYPTION] Retrying to get public key (${retries} retries left)...`);
                await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retry
              }
            }
          }
          
          if (!recipientKey) {
            console.warn('[ENCRYPTION] Could not get recipient public key after retries:', lastError?.message);
            // Don't disable encryption yet - let encryptSignalingData try to handle it
            // It might be a transient network issue, and we want encryption if possible
            encryptionEnabledRef.current = isCryptoInitialized; // Enable if crypto is ready
            if (isCryptoInitialized) {
              console.log('[ENCRYPTION] Crypto initialized but public key unavailable, will attempt encryption anyway');
            }
          }
        } catch (err) {
          console.warn('[ENCRYPTION] Error setting up encryption:', err.message);
          // Only disable if crypto is definitely not available
          if (!isCryptoInitialized) {
            encryptionEnabledRef.current = false;
            setIsEncrypted(false);
          }
        }
      } else {
        console.warn('[ENCRYPTION] No receiverId provided, encryption disabled');
        encryptionEnabledRef.current = false;
        setIsEncrypted(false);
      }

      // Fix 2: Set state to getting_media
      setWebrtcState('getting_media');

      const stream = await getLocalStream();
      console.log('[WEBRTC-CALLER] Got local stream:', stream);

      // Fix 2: Set state to media_ready
      setWebrtcState('media_ready');

      const pc = initializePeerConnection();
      console.log('[WEBRTC-CALLER] Peer connection initialized');

      // Add local tracks to peer connection
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
        console.log('[WEBRTC-CALLER] Added track:', track.kind);
      });

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('[WEBRTC-CALLER] Created and set local description (offer)');

      // Encrypt offer before sending
      try {
        // Serialize RTCSessionDescription manually (it doesn't have toJSON)
        const offerData = {
          type: offer.type,
          sdp: offer.sdp
        };
        const encryptedPayload = await encryptSignalingData(offerData, receiverId);
        
        socket.emit('voice-call:offer', {
          ...encryptedPayload,
          callId,
          from: callerId,
          to: receiverId
        });
        
        console.log('[WEBRTC-CALLER] Encrypted offer sent to:', receiverId);
      } catch (encryptErr) {
        console.error('[ENCRYPTION] Failed to encrypt offer, sending unencrypted:', encryptErr);
        // Fallback to unencrypted - serialize offer
        socket.emit('voice-call:offer', {
          offer: {
            type: offer.type,
            sdp: offer.sdp
          },
          callId,
          from: callerId,
          to: receiverId,
          encrypted: false
        });
        setIsEncrypted(false);
        toast.error('Encryption failed. Call proceeding without encryption.');
      }

      // Fix 2: Set state to offer_sent
      setWebrtcState('offer_sent');
      console.log('[WEBRTC-CALLER] Offer sent to:', receiverId);

      // Fix 4: Set timeout for receiving answer (30 seconds)
      answerTimeoutRef.current = setTimeout(() => {
        if (peerConnectionRef.current && peerConnectionRef.current.signalingState !== 'stable') {
          console.error('[WEBRTC-CALLER] Answer timeout - no response from receiver');
          setWebrtcState('failed');
          setError('Call failed: No response from receiver');
        }
      }, 30000);

    } catch (err) {
      console.error('[WEBRTC-CALLER] Error starting call:', err);
      setWebrtcState('failed');
      setError(err.message);
    }
  }, [getLocalStream, initializePeerConnection, socket, callId, callerId, receiverId, isCryptoInitialized, getUserPublicKey, encryptSignalingData]);

  // Answer call (as receiver)
  const answerCall = useCallback(async (encryptedOfferPayload = null) => {
    try {
      // Use provided offer or pending offer
      const offerPayloadToUse = encryptedOfferPayload || pendingOfferRef.current;
      if (!offerPayloadToUse) {
        console.log('[WEBRTC-RECEIVER] No offer available yet, will answer when offer arrives');
        // Mark that we should answer when offer arrives
        shouldAnswerRef.current = true;
        return;
      }

      console.log('[WEBRTC-RECEIVER] Answering call...');
      console.log('[WEBRTC-RECEIVER] Call params:', { callId, callerId, receiverId });
      console.log('[WEBRTC-RECEIVER] Current WebRTC state:', webrtcState);

      // Fix 2: State validation - defer if still getting media
      if (webrtcState === 'getting_media') {
        console.log('[WEBRTC-RECEIVER] Still getting media, will retry when ready');
        pendingOfferRef.current = offerPayloadToUse;
        shouldAnswerRef.current = true;
        return;
      }

      // Decrypt offer if encrypted
      let offerToUse;
      try {
        // Determine sender ID from the payload (the caller)
        const senderId = offerPayloadToUse.from || receiverId;
        
        // Check if encryption was used (check both isEncrypted and encrypted properties)
        const isEncrypted = offerPayloadToUse.isEncrypted || (offerPayloadToUse.encrypted === true);
        
        // If marked as encrypted but encryptedData is missing, treat as unencrypted
        if (isEncrypted && !offerPayloadToUse.encryptedData) {
          console.warn('[ENCRYPTION] Payload marked as encrypted but encryptedData is missing, treating as unencrypted');
        }
        
        if (isEncrypted && offerPayloadToUse.encryptedData) {
          // Try to enable encryption for the answer too - be more aggressive
          try {
            // Try to get caller's public key (with retry)
            let callerKey = null;
            let retries = 2;
            
            while (retries > 0 && !callerKey && senderId) {
              try {
                callerKey = await getUserPublicKey(senderId);
                recipientPublicKeyRef.current = callerKey;
                encryptionEnabledRef.current = true;
                setIsEncrypted(true);
                console.log('[ENCRYPTION] Encryption enabled for answer');
                break;
              } catch (keyErr) {
                retries--;
                if (retries > 0) {
                  console.log(`[ENCRYPTION] Retrying to get caller public key (${retries} retries left)...`);
                  await new Promise(resolve => setTimeout(resolve, 500));
                } else {
                  console.warn('[ENCRYPTION] Could not get caller public key after retries:', keyErr.message);
                  // If crypto is initialized, still try to enable encryption
                  if (isCryptoInitialized) {
                    encryptionEnabledRef.current = true;
                    console.log('[ENCRYPTION] Crypto initialized, enabling encryption anyway');
                  }
                }
              }
            }
            
            // If we still don't have the key but crypto is initialized, enable encryption
            if (!callerKey && isCryptoInitialized) {
              encryptionEnabledRef.current = true;
              setIsEncrypted(true);
              console.log('[ENCRYPTION] Encryption enabled (crypto ready, will fetch key when needed)');
            }
          } catch (keyErr) {
            console.warn('[ENCRYPTION] Error enabling encryption for answer:', keyErr);
            // Only disable if crypto is definitely not available
            if (!isCryptoInitialized) {
              encryptionEnabledRef.current = false;
              setIsEncrypted(false);
            } else {
              // Crypto is initialized, so enable encryption
              encryptionEnabledRef.current = true;
              setIsEncrypted(true);
            }
          }
          
          try {
            offerToUse = await decryptSignalingData(offerPayloadToUse, senderId);
            
            // Create RTCSessionDescription from decrypted data
            if (offerToUse && offerToUse.type && offerToUse.sdp) {
              offerToUse = new RTCSessionDescription(offerToUse);
              console.log('[ENCRYPTION] Decrypted offer successfully');
            } else {
              // Decryption returned something unexpected, try fallback
              console.warn('[ENCRYPTION] Decryption returned unexpected format, trying fallback');
              throw new Error('Invalid offer format after decryption');
            }
          } catch (decryptInnerErr) {
            console.error('[ENCRYPTION] Inner decryption error, trying fallback:', decryptInnerErr);
            // Try to extract offer from payload structure as fallback
            const fallbackOffer = offerPayloadToUse.offer || offerPayloadToUse.data || 
                                 (offerPayloadToUse.type && offerPayloadToUse.sdp ? offerPayloadToUse : null);
            if (fallbackOffer && fallbackOffer.type && fallbackOffer.sdp) {
              offerToUse = new RTCSessionDescription(fallbackOffer);
              setIsEncrypted(false);
              encryptionEnabledRef.current = false;
              toast('Received unencrypted call. Encryption may not be available.', {
                icon: '⚠️',
                duration: 3000
              });
            } else {
              throw decryptInnerErr; // Re-throw if no fallback available
            }
          }
        } else {
          // Unencrypted offer - handle multiple formats:
          // 1. Legacy format: { offer: {...} }
          // 2. encryptSignalingData fallback: { encrypted: false, data: {...} }
          // 3. Direct format: { type: 'offer', sdp: '...' }
          let offerObj = null;
          
          if (offerPayloadToUse.offer) {
            // Legacy format with 'offer' property
            offerObj = offerPayloadToUse.offer;
          } else if (offerPayloadToUse.data && (offerPayloadToUse.encrypted === false || !offerPayloadToUse.encrypted)) {
            // Format from encryptSignalingData when encryption is disabled
            offerObj = offerPayloadToUse.data;
          } else if (offerPayloadToUse.type && offerPayloadToUse.sdp) {
            // Direct format
            offerObj = offerPayloadToUse;
          }
          
          if (offerObj && offerObj.type && offerObj.sdp) {
            offerToUse = new RTCSessionDescription(offerObj);
            console.log('[WEBRTC-RECEIVER] Using unencrypted offer format');
          } else {
            console.error('[WEBRTC-RECEIVER] Invalid unencrypted offer format. Payload structure:', {
              hasOffer: !!offerPayloadToUse.offer,
              hasData: !!offerPayloadToUse.data,
              hasType: !!offerPayloadToUse.type,
              hasSdp: !!offerPayloadToUse.sdp,
              isEncrypted: offerPayloadToUse.isEncrypted,
              encrypted: offerPayloadToUse.encrypted,
              hasEncryptedData: !!offerPayloadToUse.encryptedData,
              payloadKeys: Object.keys(offerPayloadToUse),
              offerObj: offerObj
            });
            throw new Error('Invalid unencrypted offer format');
          }
          // Even if offer is unencrypted, try to enable encryption for the answer if possible
          if (isCryptoInitialized && senderId) {
            try {
              const callerKey = await getUserPublicKey(senderId);
              recipientPublicKeyRef.current = callerKey;
              encryptionEnabledRef.current = true;
              setIsEncrypted(true);
              console.log('[ENCRYPTION] Received unencrypted offer but enabled encryption for answer');
            } catch (keyErr) {
              console.warn('[ENCRYPTION] Could not enable encryption for answer:', keyErr.message);
              encryptionEnabledRef.current = false;
              setIsEncrypted(false);
            }
          } else {
            setIsEncrypted(false);
            encryptionEnabledRef.current = false;
          }
        }
      } catch (decryptErr) {
        console.error('[ENCRYPTION] Failed to decrypt offer:', decryptErr);
        // Try to use unencrypted format as fallback
        let fallbackOffer = null;
        
        if (offerPayloadToUse.offer) {
          fallbackOffer = offerPayloadToUse.offer;
        } else if (offerPayloadToUse.data) {
          fallbackOffer = offerPayloadToUse.data;
        } else if (offerPayloadToUse.type && offerPayloadToUse.sdp) {
          fallbackOffer = offerPayloadToUse;
        }
        
        if (fallbackOffer && fallbackOffer.type && fallbackOffer.sdp) {
          offerToUse = new RTCSessionDescription(fallbackOffer);
          setIsEncrypted(false);
          toast('Received unencrypted call. Encryption may not be available.', {
            icon: '⚠️',
            duration: 3000
          });
        } else {
          const errorMsg = 'Failed to decrypt call offer. Please try again.';
          toast.error(errorMsg);
          throw new Error(errorMsg);
        }
      }

      // Fix 2: Set state to getting_media
      setWebrtcState('getting_media');

      const stream = await getLocalStream();
      console.log('[WEBRTC-RECEIVER] Got local stream:', stream);

      // Fix 2: Set state to media_ready
      setWebrtcState('media_ready');

      const pc = initializePeerConnection();
      console.log('[WEBRTC-RECEIVER] Peer connection initialized');

      // Add local tracks to peer connection
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
        console.log('[WEBRTC-RECEIVER] Added track:', track.kind);
      });

      // Fix 2: Set state to offer_received
      setWebrtcState('offer_received');

      // Set remote description
      await pc.setRemoteDescription(offerToUse);
      console.log('[WEBRTC-RECEIVER] Set remote description (offer)');

      // Process pending ICE candidates
      if (pendingCandidatesRef.current.length > 0) {
        console.log('[WEBRTC-RECEIVER] Processing pending ICE candidates:', pendingCandidatesRef.current.length);
        for (const candidate of pendingCandidatesRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        pendingCandidatesRef.current = [];
      }

      // Create and send answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log('[WEBRTC-RECEIVER] Created and set local description (answer)');

      // Encrypt answer before sending
      try {
        // Serialize RTCSessionDescription manually (it doesn't have toJSON)
        const answerData = {
          type: answer.type,
          sdp: answer.sdp
        };
        const encryptedPayload = await encryptSignalingData(answerData, receiverId);
        
        socket.emit('voice-call:answer', {
          ...encryptedPayload,
          callId,
          from: callerId,
          to: receiverId
        });
        
        console.log('[WEBRTC-RECEIVER] Encrypted answer sent to:', callerId);
      } catch (encryptErr) {
        console.error('[ENCRYPTION] Failed to encrypt answer, sending unencrypted:', encryptErr);
        // Fallback to unencrypted - serialize answer
        socket.emit('voice-call:answer', {
          answer: {
            type: answer.type,
            sdp: answer.sdp
          },
          callId,
          from: callerId,
          to: receiverId,
          encrypted: false
        });
        toast.error('Failed to encrypt answer. Call proceeding without encryption.');
      }

      // Fix 2: Set state to answer_sent
      setWebrtcState('answer_sent');
      console.log('[WEBRTC-RECEIVER] Answer sent to:', callerId);

      // Clear pending refs
      pendingOfferRef.current = null;
      shouldAnswerRef.current = false;
    } catch (err) {
      console.error('[WEBRTC-RECEIVER] Error answering call:', err);
      setWebrtcState('failed');
      setError(err.message);
    }
  }, [getLocalStream, initializePeerConnection, socket, callId, callerId, receiverId, webrtcState, decryptSignalingData, encryptSignalingData, isCryptoInitialized, getUserPublicKey]);

  // Handle received answer
  const handleAnswer = useCallback(async (encryptedAnswerPayload) => {
    try {
      console.log('[WEBRTC-CALLER] Received answer');

      // Fix 4: Clear answer timeout
      if (answerTimeoutRef.current) {
        clearTimeout(answerTimeoutRef.current);
        answerTimeoutRef.current = null;
      }

      // Decrypt answer if encrypted
      let answer;
      try {
        // Determine sender ID from the payload (the receiver who sent the answer)
        const senderId = encryptedAnswerPayload.from || receiverId;
        const decryptedAnswer = await decryptSignalingData(encryptedAnswerPayload, senderId);
        
        // Create RTCSessionDescription from decrypted data
        if (decryptedAnswer.type && decryptedAnswer.sdp) {
          answer = new RTCSessionDescription(decryptedAnswer);
        } else {
          throw new Error('Invalid answer format after decryption');
        }
        
        // Check if encryption was used (check both isEncrypted and encrypted properties)
        const isEncrypted = encryptedAnswerPayload.isEncrypted || (encryptedAnswerPayload.encrypted === true);
        if (isEncrypted) {
          setIsEncrypted(true);
          console.log('[ENCRYPTION] Decrypted answer successfully');
        } else {
          setIsEncrypted(false);
        }
      } catch (decryptErr) {
        console.error('[ENCRYPTION] Failed to decrypt answer:', decryptErr);
        // Try to use unencrypted format - handle multiple formats
        let answerObj = null;
        
        if (encryptedAnswerPayload.answer) {
          answerObj = encryptedAnswerPayload.answer;
        } else if (encryptedAnswerPayload.data && (encryptedAnswerPayload.encrypted === false || !encryptedAnswerPayload.encrypted)) {
          answerObj = encryptedAnswerPayload.data;
        } else if (encryptedAnswerPayload.type && encryptedAnswerPayload.sdp) {
          answerObj = encryptedAnswerPayload;
        }
        
        if (answerObj && answerObj.type && answerObj.sdp) {
          answer = new RTCSessionDescription(answerObj);
          setIsEncrypted(false);
          toast('Received unencrypted answer. Encryption may not be available.', {
            icon: '⚠️',
            duration: 3000
          });
        } else {
          const errorMsg = 'Failed to decrypt call answer. Please try again.';
          toast.error(errorMsg);
          throw new Error(errorMsg);
        }
      }

      const pc = peerConnectionRef.current;
      if (pc) {
        await pc.setRemoteDescription(answer);
        setWebrtcState('answer_received');
        setRetryCount(0); // Fix 7: Reset retry count on success

        // Process pending ICE candidates
        if (pendingCandidatesRef.current.length > 0) {
          console.log('[WEBRTC-CALLER] Processing pending ICE candidates:', pendingCandidatesRef.current.length);
          for (const candidate of pendingCandidatesRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
          pendingCandidatesRef.current = [];
        }

        // Fix 4: Set connection timeout (15 seconds to establish connection)
        // Fix 7: With retry logic
        connectionTimeoutRef.current = setTimeout(() => {
          if (webrtcState !== 'connected') {
            if (retryCount < MAX_RETRIES) {
              console.log(`[WEBRTC-CALLER] Connection timeout, retrying (${retryCount + 1}/${MAX_RETRIES})`);
              setRetryCount(prev => prev + 1);
              // Trigger ICE restart
              pc.restartIce();
            } else {
              console.error('[WEBRTC-CALLER] Connection failed after retries');
              setWebrtcState('failed');
              setError('Connection failed after multiple attempts. Please try again.');
            }
          }
        }, 15000);
      }
    } catch (err) {
      console.error('[WEBRTC-CALLER] Error handling answer:', err);

      // Fix 7: Retry logic on error
      if (retryCount < MAX_RETRIES) {
        console.log(`[WEBRTC-CALLER] Error, will retry (${retryCount + 1}/${MAX_RETRIES})`);
        setRetryCount(prev => prev + 1);
        setTimeout(() => handleAnswer(answer), 2000);
      } else {
        setWebrtcState('failed');
        setError(err.message);
      }
    }
  }, [retryCount, webrtcState, receiverId, decryptSignalingData]);

  // Handle received ICE candidate
  const handleIceCandidate = useCallback(async (encryptedCandidatePayload) => {
    try {
      // Decrypt candidate if encrypted
      let candidateData;
      try {
        // Check if encryption was used (check both isEncrypted and encrypted properties)
        const isEncrypted = encryptedCandidatePayload.isEncrypted || (encryptedCandidatePayload.encrypted === true);
        
        if (isEncrypted && encryptedCandidatePayload.encryptedData) {
          // Determine sender ID from the payload
          const senderId = encryptedCandidatePayload.from || receiverId;
          // decryptSignalingData already returns parsed object
          candidateData = await decryptSignalingData(encryptedCandidatePayload, senderId);
        } else {
          // Unencrypted format - handle multiple formats
          candidateData = encryptedCandidatePayload.candidate || 
                         (encryptedCandidatePayload.data && (encryptedCandidatePayload.encrypted === false || !encryptedCandidatePayload.encrypted) ? encryptedCandidatePayload.data : null) ||
                         encryptedCandidatePayload;
        }

        // Validate candidate data before creating RTCIceCandidate
        if (!candidateData || (!candidateData.candidate && candidateData.sdpMid === null && candidateData.sdpMLineIndex === null)) {
          // Skip null/empty candidates (end-of-candidates marker)
          return;
        }

        // Create RTCIceCandidate - handle cases where sdpMid/sdpMLineIndex might be null
        try {
          const candidate = new RTCIceCandidate(candidateData);
          const pc = peerConnectionRef.current;
          if (pc && pc.remoteDescription) {
            await pc.addIceCandidate(candidate);
          } else {
            // Queue candidate if remote description is not set yet
            pendingCandidatesRef.current.push(candidate);
          }
        } catch (candidateErr) {
          // Skip invalid candidates (e.g., end-of-candidates markers)
          if (candidateErr.message && candidateErr.message.includes('sdpMid and sdpMLineIndex are both null')) {
            // This is the end-of-candidates marker - ignore it
            return;
          }
          console.warn('[WEBRTC] Skipping invalid ICE candidate:', candidateErr.message);
        }
      } catch (decryptErr) {
        console.error('[ENCRYPTION] Failed to decrypt ICE candidate:', decryptErr);
        // Try unencrypted format as fallback - handle multiple formats
        const fallbackData = encryptedCandidatePayload.candidate || 
                            (encryptedCandidatePayload.data ? encryptedCandidatePayload.data : null) ||
                            encryptedCandidatePayload;
        if (fallbackData && fallbackData.candidate) {
          try {
            const candidate = new RTCIceCandidate(fallbackData);
            const pc = peerConnectionRef.current;
            if (pc && pc.remoteDescription) {
              await pc.addIceCandidate(candidate);
            } else {
              pendingCandidatesRef.current.push(candidate);
            }
          } catch (candidateErr) {
            // Skip invalid candidates
            if (!candidateErr.message || !candidateErr.message.includes('sdpMid and sdpMLineIndex are both null')) {
              console.warn('[WEBRTC] Skipping invalid ICE candidate');
            }
          }
        }
      }
    } catch (err) {
      console.error('Error handling ICE candidate:', err);
    }
  }, [receiverId, decryptSignalingData]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, [localStream]);

  // End call cleanup
  const endCall = useCallback(() => {
    console.log('[WEBRTC] Ending call and cleaning up...');

    // Fix 4: Clear all timeouts
    if (offerTimeoutRef.current) {
      clearTimeout(offerTimeoutRef.current);
      offerTimeoutRef.current = null;
    }
    if (answerTimeoutRef.current) {
      clearTimeout(answerTimeoutRef.current);
      answerTimeoutRef.current = null;
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }

    // Stop all local tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Clear remote stream and state
    setRemoteStream(null);
    setIsMuted(false);
    setError(null);
    setWebrtcState('ended');
    setRetryCount(0);
    pendingCandidatesRef.current = [];
    pendingOfferRef.current = null;
    shouldAnswerRef.current = false;
  }, [localStream]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const handleOffer = (data) => {
      console.log('[WEBRTC-RECEIVER] Received offer event:', data);
      console.log('[WEBRTC-RECEIVER] Current callId:', callId);
      console.log('[WEBRTC-RECEIVER] Offer callId:', data.callId);
      console.log('[WEBRTC-RECEIVER] Is initiator:', isInitiator);

      if (data.callId === callId) {
        console.log('[WEBRTC-RECEIVER] CallId matches, storing offer');
        // Store the encrypted offer payload (will be decrypted in answerCall)
        pendingOfferRef.current = data;
        
        // Automatically answer if we're the receiver (not initiator) and have an active call
        // This handles the case where user accepts call before offer arrives
        if (!isInitiator && callId) {
          console.log('[WEBRTC-RECEIVER] Receiver mode with active call, answering automatically');
          answerCall(data);
          shouldAnswerRef.current = false;
        } else if (shouldAnswerRef.current) {
          // Fallback: if shouldAnswerRef was set, answer immediately
          console.log('[WEBRTC-RECEIVER] User already accepted, answering now');
          answerCall(data);
          shouldAnswerRef.current = false;
        }
      } else {
        console.log('[WEBRTC-RECEIVER] CallId mismatch, ignoring offer');
      }
    };

    const handleAnswerEvent = (data) => {
      console.log('[WEBRTC-CALLER] Received answer event:', data);
      console.log('[WEBRTC-CALLER] Current callId:', callId);

      if (data.callId === callId) {
        console.log('[WEBRTC-CALLER] CallId matches, processing answer');
        // Pass the entire payload (encrypted or unencrypted) to handleAnswer
        handleAnswer(data);
      } else {
        console.log('[WEBRTC-CALLER] CallId mismatch, ignoring answer');
      }
    };

    const handleIceCandidateEvent = (data) => {
      if (data.callId === callId) {
        // Pass the entire payload (encrypted or unencrypted) to handleIceCandidate
        handleIceCandidate(data);
      }
    };

    socket.on('voice-call:offer', handleOffer);
    socket.on('voice-call:answer', handleAnswerEvent);
    socket.on('voice-call:ice-candidate', handleIceCandidateEvent);

    return () => {
      socket.off('voice-call:offer', handleOffer);
      socket.off('voice-call:answer', handleAnswerEvent);
      socket.off('voice-call:ice-candidate', handleIceCandidateEvent);
    };
  }, [socket, callId, answerCall, handleAnswer, handleIceCandidate, isInitiator]);

  // Cleanup on unmount only (not on re-render)
  useEffect(() => {
    return () => {
      // Only end call if we have an active connection
      // This cleanup only runs when component unmounts, not on re-render
      if (peerConnectionRef.current || localStream) {
        console.log('[WEBRTC] Component unmounting, cleaning up call resources');
        endCall();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run on mount/unmount

  // Fix 8: Network quality monitoring
  useEffect(() => {
    if (webrtcState !== 'connected') return;

    const pc = peerConnectionRef.current;
    if (!pc) return;

    const interval = setInterval(async () => {
      try {
        const stats = await pc.getStats();
        let packetLoss = 0;
        let jitter = 0;
        let rtt = 0;

        stats.forEach(report => {
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            packetLoss = report.packetsLost || 0;
            jitter = report.jitter || 0;
          }
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            rtt = report.currentRoundTripTime || 0;
          }
        });

        setConnectionStats({ packetLoss, jitter, rtt });

        // Warn if quality is poor
        if (packetLoss > 50 || rtt > 0.5) {
          console.warn('[WEBRTC] Poor connection quality:', { packetLoss, rtt });
        }
      } catch (err) {
        console.error('[WEBRTC] Error getting stats:', err);
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [webrtcState]);

  return {
    localStream,
    remoteStream,
    startCall,
    answerCall,
    endCall,
    toggleMute,
    isMuted,
    error,
    webrtcState,       // Fix 2: Expose state for UI
    connectionStats,   // Fix 8: Expose connection quality stats
    isEncrypted,       // Expose encryption status
  };
};

export default useVoiceCall;
