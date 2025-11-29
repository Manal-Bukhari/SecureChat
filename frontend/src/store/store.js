import { configureStore } from "@reduxjs/toolkit";
import userReducer from "./slices/userSlice";
import chatReducer from "./slices/chatSlice";
import voiceCallReducer from "./slices/voiceCallSlice";

const store = configureStore({
  reducer: {
    user: userReducer,
    chat: chatReducer,
    voiceCall: voiceCallReducer,
  },
});

export default store;
export { store };

