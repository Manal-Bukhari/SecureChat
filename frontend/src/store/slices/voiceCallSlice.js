import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axiosInstance from '../../components/Authentication/redux/axiosInstance';
import { toast } from "react-hot-toast";

// Async thunks
export const fetchCallHistory = createAsyncThunk(
  "voiceCall/fetchCallHistory",
  async ({ limit = 50, offset = 0 } = {}, thunkAPI) => {
    try {
      const response = await axiosInstance.get(`/calls/history?limit=${limit}&offset=${offset}`);
      return response.data;
    } catch (error) {
      const message = error.response?.data?.message || error.message;
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

export const deleteCallFromHistory = createAsyncThunk(
  "voiceCall/deleteCallFromHistory",
  async (callId, thunkAPI) => {
    try {
      await axiosInstance.delete(`/calls/${callId}`);
      return callId;
    } catch (error) {
      const message = error.response?.data?.message || error.message;
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// Slice
const voiceCallSlice = createSlice({
  name: "voiceCall",
  initialState: {
    // Active call state
    activeCall: {
      callId: null,
      contactId: null,
      contactName: null,
      conversationId: null,
      isIncoming: false,
      status: 'idle', // 'idle' | 'calling' | 'ringing' | 'connected' | 'ended'
      isMuted: false,
      isSpeakerOn: false,
      duration: 0,
      startTime: null
    },

    // Call history
    callHistory: [],
    isHistoryLoading: false,

    // Incoming call notification
    incomingCall: null, // { callId, contactId, contactName, conversationId }

    // Error state
    error: null
  },
  reducers: {
    initiateCall: (state, action) => {
      const { contactId, contactName, conversationId } = action.payload;
      state.activeCall = {
        callId: null, // Will be set by backend
        contactId,
        contactName,
        conversationId,
        isIncoming: false,
        status: 'calling',
        isMuted: false,
        isSpeakerOn: false,
        duration: 0,
        startTime: Date.now()
      };
      state.error = null;
    },

    setCallId: (state, action) => {
      if (state.activeCall) {
        state.activeCall.callId = action.payload;
      }
    },

    receiveIncomingCall: (state, action) => {
      const { callId, contactId, contactName, conversationId } = action.payload;
      state.incomingCall = {
        callId,
        contactId,
        contactName,
        conversationId
      };
    },

    acceptCall: (state, action) => {
      const { callId, contactId, contactName, conversationId } = action.payload;
      state.activeCall = {
        callId,
        contactId,
        contactName,
        conversationId,
        isIncoming: true,
        status: 'connecting', // Changed from 'ringing' to 'connecting'
        isMuted: false,
        isSpeakerOn: false,
        duration: 0,
        startTime: Date.now()
      };
      state.incomingCall = null;
      state.error = null;
    },

    declineCall: (state) => {
      state.incomingCall = null;
    },

    endCall: (state) => {
      state.activeCall = {
        callId: null,
        contactId: null,
        contactName: null,
        conversationId: null,
        isIncoming: false,
        status: 'idle',
        isMuted: false,
        isSpeakerOn: false,
        duration: 0,
        startTime: null
      };
      state.error = null;
    },

    toggleMute: (state) => {
      if (state.activeCall) {
        state.activeCall.isMuted = !state.activeCall.isMuted;
      }
    },

    toggleSpeaker: (state) => {
      if (state.activeCall) {
        state.activeCall.isSpeakerOn = !state.activeCall.isSpeakerOn;
      }
    },

    updateCallDuration: (state) => {
      if (state.activeCall && state.activeCall.status === 'connected' && state.activeCall.startTime) {
        state.activeCall.duration = Math.floor((Date.now() - state.activeCall.startTime) / 1000);
      }
    },

    setCallStatus: (state, action) => {
      if (state.activeCall) {
        state.activeCall.status = action.payload;
        if (action.payload === 'connected') {
          state.activeCall.startTime = Date.now();
          state.activeCall.duration = 0;
        }
      }
    },

    clearIncomingCall: (state) => {
      state.incomingCall = null;
    },

    setCallError: (state, action) => {
      state.error = action.payload;
      toast.error(action.payload);
    },

    clearCallError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // fetchCallHistory
      .addCase(fetchCallHistory.pending, (state) => {
        state.isHistoryLoading = true;
        state.error = null;
      })
      .addCase(fetchCallHistory.fulfilled, (state, action) => {
        state.isHistoryLoading = false;
        state.callHistory = action.payload;
      })
      .addCase(fetchCallHistory.rejected, (state, action) => {
        state.isHistoryLoading = false;
        state.error = action.payload;
      })
      // deleteCallFromHistory
      .addCase(deleteCallFromHistory.fulfilled, (state, action) => {
        const deletedCallId = action.payload?.toString();
        state.callHistory = state.callHistory.filter(call => {
          const callId = call.id?.toString();
          return callId !== deletedCallId;
        });
        toast.success('Call deleted from history');
      })
      .addCase(deleteCallFromHistory.rejected, (state, action) => {
        state.error = action.payload;
      });
  },
});

export const {
  initiateCall,
  setCallId,
  receiveIncomingCall,
  acceptCall,
  declineCall,
  endCall,
  toggleMute,
  toggleSpeaker,
  updateCallDuration,
  setCallStatus,
  clearIncomingCall,
  setCallError,
  clearCallError
} = voiceCallSlice.actions;

export default voiceCallSlice.reducer;
