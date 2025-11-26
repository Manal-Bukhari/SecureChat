import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axiosInstance from '../axiosInstance';
import { toast } from "react-hot-toast";

// Async thunks
export const fetchContacts = createAsyncThunk(
  "chat/fetchContacts",
  async (_, thunkAPI) => {
    try {
      // Use the new friends endpoint
      const response = await axiosInstance.get("/friends");
      return response.data;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || error.message;
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

export const fetchMessages = createAsyncThunk(
  "chat/fetchMessages",
  async (conversationId, thunkAPI) => {
    try {
      const response = await axiosInstance.get(`/messages/${conversationId}`);
      return response.data;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || error.message;
      // Only show toast for friendship-related errors, not for all errors
      if (message.includes("friends") || message.includes("friend request")) {
        toast.error(message);
      }
      return thunkAPI.rejectWithValue(message);
    }
  }
);

export const sendMessage = createAsyncThunk(
  "chat/sendMessage",
  async ({ conversationId, messageData }, thunkAPI) => {
    try {
      const response = await axiosInstance.post(
        `/messages`,
        messageData
      );
      return response.data;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || error.message;
      // Show toast for all send message errors (including friendship errors)
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

export const searchGlobalUsers = createAsyncThunk(
  "chat/searchGlobalUsers",
  async (query, thunkAPI) => {
    try {
      // Assuming you create a backend route: GET /api/users/search?query=...
      const response = await axiosInstance.get(`/users/search?query=${query}`);
      return response.data;
    } catch (error) {
      return thunkAPI.rejectWithValue(error.response?.data?.message || "Search failed");
    }
  }
);

// Send a friend request
export const sendFriendRequest = createAsyncThunk(
  "chat/sendFriendRequest",
  async (userId, thunkAPI) => {
    try {
      const response = await axiosInstance.post(`/friends/request`, { userId }); 
      toast.success("Friend request sent");
      return response.data;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || "Failed to send friend request";
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// Get friend requests
export const getFriendRequests = createAsyncThunk(
  "chat/getFriendRequests",
  async (_, thunkAPI) => {
    try {
      const response = await axiosInstance.get(`/friends/requests`);
      return response.data;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || "Failed to fetch friend requests";
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// Accept a friend request
export const acceptFriendRequest = createAsyncThunk(
  "chat/acceptFriendRequest",
  async (requestId, thunkAPI) => {
    try {
      const response = await axiosInstance.post(`/friends/accept/${requestId}`);
      toast.success("Friend request accepted");
      return response.data;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || "Failed to accept friend request";
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// Reject a friend request
export const rejectFriendRequest = createAsyncThunk(
  "chat/rejectFriendRequest",
  async (requestId, thunkAPI) => {
    try {
      const response = await axiosInstance.post(`/friends/reject/${requestId}`);
      toast.success("Friend request rejected");
      return response.data;
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || "Failed to reject friend request";
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// Add a user to your friends list (backward compatibility - now sends a request)
export const addNewContact = createAsyncThunk(
  "chat/addNewContact",
  async (userId, thunkAPI) => {
    try {
      // Use the friend request endpoint
      return thunkAPI.dispatch(sendFriendRequest(userId));
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || "Failed to add friend";
      toast.error(message);
      return thunkAPI.rejectWithValue(message);
    }
  }
);

// Slice
const chatSlice = createSlice({
  name: "chat",
  initialState: {
    contacts: [],
    messages: [],
    searchResults: [], // Store global search results here
    friendRequests: {
      received: [], // Friend requests received from others
      sent: [] // Friend requests sent to others
    },
    selectedContact: null,
    isContactsLoading: false,
    isMessagesLoading: false,
    isSearching: false, // UI loading state for search
    isFriendRequestsLoading: false,
    error: null,
  },
  reducers: {
    setSelectedContact: (state, action) => {
      state.selectedContact = action.payload;
    },
    clearChatState: (state) => {
      state.contacts = [];
      state.messages = [];
      state.selectedContact = null;
    },
    addMessage: (state, action) => {
      state.messages.push(action.payload);
    },
    // Clear search results when closing the search view
    clearSearchResults: (state) => {
      state.searchResults = [];
    },
    // Clear friend requests
    clearFriendRequests: (state) => {
      state.friendRequests = { received: [], sent: [] };
    },
    // Update a message (for pending messages)
    updateMessage: (state, action) => {
      const { tempId, message } = action.payload;
      const index = state.messages.findIndex(msg => msg.id === tempId);
      if (index !== -1) {
        state.messages[index] = message;
      }
    },
    // Mark a message as failed
    markMessageFailed: (state, action) => {
      const tempId = action.payload;
      const message = state.messages.find(msg => msg.id === tempId);
      if (message) {
        message.pending = false;
        message.failed = true;
      }
    }
  },
  extraReducers: (builder) => {
    builder
      // fetchContacts
      .addCase(fetchContacts.pending, (state) => {
        state.isContactsLoading = true;
        state.error = null;
      })
      .addCase(fetchContacts.fulfilled, (state, action) => {
        state.isContactsLoading = false;
        state.contacts = action.payload;
      })
      .addCase(fetchContacts.rejected, (state, action) => {
        state.isContactsLoading = false;
        state.error = action.payload;
      })
      // fetchMessages
      .addCase(fetchMessages.pending, (state) => {
        state.isMessagesLoading = true;
        state.error = null;
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        state.isMessagesLoading = false;
        state.messages = action.payload || [];
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        state.isMessagesLoading = false;
        state.error = action.payload;
      })
      // sendMessage
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.messages.push(action.payload);
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.error = action.payload;
      })
      .addCase(searchGlobalUsers.pending, (state) => {
      state.isSearching = true;
      })
      .addCase(searchGlobalUsers.fulfilled, (state, action) => {
      state.isSearching = false;
      // Filter out users who are ALREADY in contacts
      const contactIds = new Set(state.contacts.map(c => c.id));
      state.searchResults = action.payload.filter(user => !contactIds.has(user.id));
    })
      .addCase(searchGlobalUsers.rejected, (state) => {
      state.isSearching = false;
      state.searchResults = [];
    })
    .addCase(addNewContact.fulfilled, (state, action) => {
      // Add the new contact to the list immediately
      state.contacts.unshift(action.payload);
      state.selectedContact = action.payload; // Auto-select them
      state.searchResults = []; // Clear search
    })
    // getFriendRequests
    .addCase(getFriendRequests.pending, (state) => {
      state.isFriendRequestsLoading = true;
      state.error = null;
    })
    .addCase(getFriendRequests.fulfilled, (state, action) => {
      state.isFriendRequestsLoading = false;
      state.friendRequests = action.payload || { received: [], sent: [] };
    })
    .addCase(getFriendRequests.rejected, (state, action) => {
      state.isFriendRequestsLoading = false;
      state.error = action.payload;
    })
    // acceptFriendRequest
    .addCase(acceptFriendRequest.fulfilled, (state, action) => {
      // Remove from received requests
      state.friendRequests.received = state.friendRequests.received.filter(
        req => req.requestId !== action.meta.arg
      );
      // Add to contacts if contact object is returned
      if (action.payload.contact) {
        // Check if contact already exists to avoid duplicates
        const exists = state.contacts.some(c => c.userId === action.payload.contact.userId);
        if (!exists) {
          state.contacts.unshift(action.payload.contact);
        }
        state.selectedContact = action.payload.contact;
      }
    })
    // rejectFriendRequest
    .addCase(rejectFriendRequest.fulfilled, (state, action) => {
      // Remove from received requests
      state.friendRequests.received = state.friendRequests.received.filter(
        req => req.requestId !== action.meta.arg
      );
    })
    // sendFriendRequest
    .addCase(sendFriendRequest.fulfilled, (state, action) => {
      // Refresh friend requests to show the sent request
      // This will be handled by getFriendRequests if needed
    });
  },
});

export const { setSelectedContact, clearChatState, addMessage, clearSearchResults, updateMessage, markMessageFailed } = chatSlice.actions;
export default chatSlice.reducer;
