// backend/routes/groupRoutes.js

const express = require("express");
const router = express.Router();
const groupController = require("../controllers/groupController");
const authMiddleware = require("../middleware/authMiddleware");

// Apply auth middleware to all routes
router.use(authMiddleware);

// Create a new group
router.post("/", groupController.createGroup);

// Get all groups for the current user
router.get("/", groupController.getGroups);

// Get group details
router.get("/:groupId", groupController.getGroupDetails);

// Add a friend to the group (direct add, no request)
router.post("/:groupId/members", groupController.addMember);

// Send a group request to a non-friend
router.post("/:groupId/request/:userId", groupController.sendGroupRequest);

// Get all group requests (received and sent)
router.get("/requests/all", groupController.getGroupRequests);

// Accept a group request
router.post("/requests/:requestId/accept", groupController.acceptGroupRequest);

// Reject a group request
router.post("/requests/:requestId/reject", groupController.rejectGroupRequest);

module.exports = router;

