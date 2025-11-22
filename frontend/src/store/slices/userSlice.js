import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axiosInstance from '../axiosInstance';

// Async thunk: sign in
export const signIn = createAsyncThunk("user/signIn", async (data, thunkAPI) => {
  try {
    const response = await axiosInstance.post("/auth/login", data);
    sessionStorage.setItem("token", response.data.token);
    sessionStorage.setItem("user", JSON.stringify(response.data.user));
    thunkAPI.dispatch(setUserDetails(response.data.user));
    return {
      token: response.data.token,
      user: response.data.user
    };
  } catch (err) {
    return thunkAPI.rejectWithValue(err.response?.data?.error || "Sign in failed");
  }
});

// Async thunk: fetch user details
export const fetchUserDetails = createAsyncThunk("user/fetchUserDetails", async (userId, thunkAPI) => {
  try {
    const response = await axiosInstance.get(`/user/${userId}`);
    return response.data;
  } catch (err) {
    return thunkAPI.rejectWithValue(err.response?.data?.error || "Failed to fetch user details");
  }
});

const initialState = {
  email: null,
  userDetails: null,
  loading: false,
  error: null,
};

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setUserDetails: (state, action) => {
      state.userDetails = action.payload;
    },
    setError: (state, action) => {
      state.error = action.payload;
    },
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
    logout: (state) => {
      state.email = null;
      state.userDetails = null;
      state.error = null;
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("user");
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(signIn.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(signIn.fulfilled, (state, action) => {
        state.loading = false;
        state.userDetails = action.payload.user;
      })
      .addCase(signIn.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchUserDetails.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchUserDetails.fulfilled, (state, action) => {
        state.loading = false;
        if (state.userDetails) {
          state.userDetails.rides_taken = action.payload.rides_taken;
        } else {
          state.userDetails = action.payload;
        }
      })
      .addCase(fetchUserDetails.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  }
});

export const {
  setUserDetails,
  setError,
  setLoading,
  logout,
} = userSlice.actions;

export default userSlice.reducer;

