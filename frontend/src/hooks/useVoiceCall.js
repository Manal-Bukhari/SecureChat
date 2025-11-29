import { useRef, useEffect, useState, useCallback } from 'react';

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

  const peerConnectionRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const pendingOfferRef = useRef(null);
  const shouldAnswerRef = useRef(false);

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

  // Initialize peer connection
  const initializePeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      return peerConnectionRef.current;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket && callId) {
        const to = isInitiator ? receiverId : callerId;
        socket.emit('voice-call:ice-candidate', {
          candidate: event.candidate,
          callId,
          from: isInitiator ? callerId : receiverId,
          to
        });
      }
    };

    // Handle remote track
    pc.ontrack = (event) => {
      console.log('Received remote track:', event.streams[0]);
      setRemoteStream(event.streams[0]);
    };

    // Monitor ICE connection state
    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        setError('Connection failed. Please check your internet connection.');
      }
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

      const stream = await getLocalStream();
      console.log('[WEBRTC-CALLER] Got local stream:', stream);

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

      socket.emit('voice-call:offer', {
        offer,
        callId,
        from: callerId,
        to: receiverId
      });

      console.log('[WEBRTC-CALLER] Offer sent to:', receiverId);
    } catch (err) {
      console.error('[WEBRTC-CALLER] Error starting call:', err);
      setError(err.message);
    }
  }, [getLocalStream, initializePeerConnection, socket, callId, callerId, receiverId]);

  // Answer call (as receiver)
  const answerCall = useCallback(async (offer = null) => {
    try {
      // Use provided offer or pending offer
      const offerToUse = offer || pendingOfferRef.current;
      if (!offerToUse) {
        console.log('[WEBRTC-RECEIVER] No offer available yet, will answer when offer arrives');
        // Mark that we should answer when offer arrives
        shouldAnswerRef.current = true;
        return;
      }

      console.log('[WEBRTC-RECEIVER] Answering call...');
      console.log('[WEBRTC-RECEIVER] Call params:', { callId, callerId, receiverId });
      console.log('[WEBRTC-RECEIVER] Using offer:', offerToUse);

      const stream = await getLocalStream();
      console.log('[WEBRTC-RECEIVER] Got local stream:', stream);

      const pc = initializePeerConnection();
      console.log('[WEBRTC-RECEIVER] Peer connection initialized');

      // Add local tracks to peer connection
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
        console.log('[WEBRTC-RECEIVER] Added track:', track.kind);
      });

      // Set remote description
      await pc.setRemoteDescription(new RTCSessionDescription(offerToUse));
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

      socket.emit('voice-call:answer', {
        answer,
        callId,
        from: receiverId,
        to: callerId
      });

      console.log('[WEBRTC-RECEIVER] Answer sent to:', callerId);
      
      // Clear pending offer after using it
      pendingOfferRef.current = null;
    } catch (err) {
      console.error('[WEBRTC-RECEIVER] Error answering call:', err);
      setError(err.message);
    }
  }, [getLocalStream, initializePeerConnection, socket, callId, callerId, receiverId]);

  // Handle received answer
  const handleAnswer = useCallback(async (answer) => {
    try {
      console.log('Received answer');
      const pc = peerConnectionRef.current;
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));

        // Process pending ICE candidates
        if (pendingCandidatesRef.current.length > 0) {
          console.log('Processing pending ICE candidates:', pendingCandidatesRef.current.length);
          for (const candidate of pendingCandidatesRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
          pendingCandidatesRef.current = [];
        }
      }
    } catch (err) {
      console.error('Error handling answer:', err);
      setError(err.message);
    }
  }, []);

  // Handle received ICE candidate
  const handleIceCandidate = useCallback(async (candidate) => {
    try {
      const pc = peerConnectionRef.current;
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        // Queue candidate if remote description is not set yet
        pendingCandidatesRef.current.push(candidate);
      }
    } catch (err) {
      console.error('Error handling ICE candidate:', err);
    }
  }, []);

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
    console.log('Ending call and cleaning up...');

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

    // Clear remote stream
    setRemoteStream(null);
    setIsMuted(false);
    setError(null);
    pendingCandidatesRef.current = [];
  }, [localStream]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const handleOffer = (data) => {
      console.log('[WEBRTC-RECEIVER] Received offer event:', data);
      console.log('[WEBRTC-RECEIVER] Current callId:', callId);
      console.log('[WEBRTC-RECEIVER] Offer callId:', data.callId);

      if (data.callId === callId) {
        console.log('[WEBRTC-RECEIVER] CallId matches, storing offer');
        // Store the offer
        pendingOfferRef.current = data.offer;
        
        // If user has already accepted, answer immediately
        if (shouldAnswerRef.current) {
          console.log('[WEBRTC-RECEIVER] User already accepted, answering now');
          answerCall(data.offer);
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
        handleAnswer(data.answer);
      } else {
        console.log('[WEBRTC-CALLER] CallId mismatch, ignoring answer');
      }
    };

    const handleIceCandidateEvent = (data) => {
      if (data.callId === callId) {
        handleIceCandidate(data.candidate);
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
  }, [socket, callId, answerCall, handleAnswer, handleIceCandidate]);

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

  return {
    localStream,
    remoteStream,
    startCall,
    answerCall,
    endCall,
    toggleMute,
    isMuted,
    error
  };
};

export default useVoiceCall;
