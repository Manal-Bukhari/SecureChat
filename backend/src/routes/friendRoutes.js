// backend/routes/friendRoutes.js

const express = require("express");
const router = express.Router();
const friendController = require("../controllers/friendController");
const authMiddleware = require("../middleware/authMiddleware");

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get all friends
router.get("/", friendController.getFriends);

// Friend request endpoints
router.post("/request", friendController.sendFriendRequest);
router.get("/requests", friendController.getFriendRequests);
router.post("/accept/:requestId", friendController.acceptFriendRequest);
router.post("/reject/:requestId", friendController.rejectFriendRequest);

// Add a friend (backward compatibility - now sends a request)
router.post("/add", friendController.addFriend);

// Remove a friend
router.delete("/:friendId", friendController.removeFriend);

// Check friendship status
router.get("/status/:userId", friendController.getFriendshipStatus);

module.exports = router;

