// backend/controllers/groupController.js

const Group = require("../models/Group");
const GroupRequest = require("../models/GroupRequest");
const User = require("../models/User");
const Friend = require("../models/Friend");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { isConnected } = require("../config/database");

/**
 * Helper to get current User ID from token
 */
const getUserIdFromToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.split(" ")[1];
  const JWT_SECRET = process.env.JWT_SECRET || "8ae74b4cf76c2e91531a6a5e7ed2ef3a62c4dcaee24d7b176fdfd0ba6c1e9abf";
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.userId;
  } catch (error) {
    return null;
  }
};

/**
 * POST /api/groups
 * Create a new group
 */
exports.createGroup = async (req, res) => {
  try {
    const currentUserId = getUserIdFromToken(req);
    if (!currentUserId) return res.status(401).json({ error: "Not authenticated" });

    const { name, description, memberIds } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Group name is required" });
    }

    if (!isConnected() && mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }

    // Create group with creator as first member
    const members = [currentUserId];
    if (memberIds && Array.isArray(memberIds)) {
      // Add provided members (only friends)
      for (const memberId of memberIds) {
        if (memberId.toString() !== currentUserId.toString()) {
          // Check if they are friends
          const isFriend = await Friend.exists({
            $or: [
              { userId: currentUserId, friendId: memberId, status: "accepted" },
              { userId: memberId, friendId: currentUserId, status: "accepted" }
            ]
          });
          if (isFriend && !members.includes(memberId)) {
            members.push(memberId);
          }
        }
      }
    }

    const group = new Group({
      name: name.trim(),
      description: description || "",
      createdBy: currentUserId,
      members: members
    });

    await group.save();
    await group.populate("members", "fullName email department isOnline");
    await group.populate("createdBy", "fullName email");

    res.status(201).json({
      message: "Group created successfully",
      group: {
        id: group._id.toString(),
        name: group.name,
        description: group.description,
        createdBy: {
          id: group.createdBy._id.toString(),
          name: group.createdBy.fullName,
          email: group.createdBy.email
        },
        members: group.members.map(m => ({
          id: m._id.toString(),
          name: m.fullName,
          email: m.email,
          department: m.department,
          isOnline: m.isOnline || false
        })),
        createdAt: group.createdAt
      }
    });
  } catch (error) {
    console.error("Error creating group:", error);
    res.status(500).json({ error: "Failed to create group" });
  }
};

/**
 * GET /api/groups
 * Get all groups for the current user
 */
exports.getGroups = async (req, res) => {
  try {
    const currentUserId = getUserIdFromToken(req);
    if (!currentUserId) return res.status(401).json({ error: "Not authenticated" });

    if (!isConnected() && mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }

    // Find all groups where current user is a member
    const groups = await Group.find({
      members: currentUserId
    })
      .populate("members", "fullName email department isOnline")
      .populate("createdBy", "fullName email")
      .sort({ updatedAt: -1 });

    const groupsList = groups.map(group => ({
      id: group._id.toString(),
      name: group.name,
      description: group.description,
      createdBy: {
        id: group.createdBy._id.toString(),
        name: group.createdBy.fullName,
        email: group.createdBy.email
      },
      members: group.members.map(m => ({
        id: m._id.toString(),
        name: m.fullName,
        email: m.email,
        department: m.department,
        isOnline: m.isOnline || false
      })),
      memberCount: group.members.length,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt
    }));

    res.json(groupsList);
  } catch (error) {
    console.error("Error fetching groups:", error);
    res.status(500).json({ error: "Failed to fetch groups" });
  }
};

/**
 * POST /api/groups/:groupId/members
 * Add a friend to the group (no request needed for friends)
 */
exports.addMember = async (req, res) => {
  try {
    const currentUserId = getUserIdFromToken(req);
    if (!currentUserId) return res.status(401).json({ error: "Not authenticated" });

    const { groupId } = req.params;
    const { userId } = req.body;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    if (!groupId || !mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ error: "Invalid group ID" });
    }

    if (!isConnected() && mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }

    // Check if group exists and user is a member
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    if (!group.members.includes(currentUserId)) {
      return res.status(403).json({ error: "You are not a member of this group" });
    }

    // Check if target user is already a member
    if (group.members.includes(userId)) {
      return res.status(400).json({ error: "User is already a member of this group" });
    }

    // Check if they are friends
    const isFriend = await Friend.exists({
      $or: [
        { userId: currentUserId, friendId: userId, status: "accepted" },
        { userId: userId, friendId: currentUserId, status: "accepted" }
      ]
    });

    if (!isFriend) {
      return res.status(403).json({ error: "You can only add friends directly. Use group request for non-friends." });
    }

    // Add user to group
    group.members.push(userId);
    await group.save();
    await group.populate("members", "fullName email department isOnline");

    res.json({
      message: "Member added successfully",
      group: {
        id: group._id.toString(),
        name: group.name,
        members: group.members.map(m => ({
          id: m._id.toString(),
          name: m.fullName,
          email: m.email,
          department: m.department,
          isOnline: m.isOnline || false
        }))
      }
    });
  } catch (error) {
    console.error("Error adding member:", error);
    res.status(500).json({ error: "Failed to add member" });
  }
};

/**
 * POST /api/groups/:groupId/request/:userId
 * Send a group join request to a non-friend
 */
exports.sendGroupRequest = async (req, res) => {
  try {
    const currentUserId = getUserIdFromToken(req);
    if (!currentUserId) return res.status(401).json({ error: "Not authenticated" });

    const { groupId, userId } = req.params;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    if (!groupId || !mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ error: "Invalid group ID" });
    }

    if (currentUserId.toString() === userId.toString()) {
      return res.status(400).json({ error: "Cannot send group request to yourself" });
    }

    if (!isConnected() && mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }

    // Check if group exists and user is a member
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    if (!group.members.includes(currentUserId)) {
      return res.status(403).json({ error: "You are not a member of this group" });
    }

    // Check if target user is already a member
    if (group.members.includes(userId)) {
      return res.status(400).json({ error: "User is already a member of this group" });
    }

    // Check if they are friends (if friends, they should use addMember endpoint)
    const isFriend = await Friend.exists({
      $or: [
        { userId: currentUserId, friendId: userId, status: "accepted" },
        { userId: userId, friendId: currentUserId, status: "accepted" }
      ]
    });

    if (isFriend) {
      return res.status(400).json({ error: "User is your friend. Add them directly instead of sending a request." });
    }

    // Check if request already exists
    const existingRequest = await GroupRequest.findOne({
      groupId: groupId,
      senderId: currentUserId,
      receiverId: userId,
      status: "pending"
    });

    if (existingRequest) {
      return res.status(400).json({ error: "Group request already sent" });
    }

    // Create group request
    const groupRequest = new GroupRequest({
      groupId: groupId,
      senderId: currentUserId,
      receiverId: userId,
      status: "pending"
    });

    await groupRequest.save();

    res.status(201).json({
      message: "Group request sent successfully",
      requestId: groupRequest._id
    });
  } catch (error) {
    console.error("Error sending group request:", error);
    res.status(500).json({ error: "Failed to send group request" });
  }
};

/**
 * GET /api/groups/requests
 * Get all group requests (received and sent)
 */
exports.getGroupRequests = async (req, res) => {
  try {
    const currentUserId = getUserIdFromToken(req);
    if (!currentUserId) return res.status(401).json({ error: "Not authenticated" });

    if (!isConnected() && mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }

    // Get received requests (where current user is receiver)
    const receivedRequests = await GroupRequest.find({
      receiverId: currentUserId,
      status: "pending"
    })
      .populate("groupId", "name description")
      .populate("senderId", "fullName email department isOnline")
      .sort({ createdAt: -1 });

    // Get sent requests (where current user is sender)
    const sentRequests = await GroupRequest.find({
      senderId: currentUserId,
      status: "pending"
    })
      .populate("groupId", "name description")
      .populate("receiverId", "fullName email department isOnline")
      .sort({ createdAt: -1 });

    res.json({
      received: receivedRequests.map(req => ({
        id: req._id.toString(),
        requestId: req._id.toString(),
        groupId: req.groupId._id.toString(),
        groupName: req.groupId.name,
        groupDescription: req.groupId.description,
        sender: {
          id: req.senderId._id.toString(),
          name: req.senderId.fullName,
          email: req.senderId.email,
          department: req.senderId.department,
          isOnline: req.senderId.isOnline || false
        },
        createdAt: req.createdAt
      })),
      sent: sentRequests.map(req => ({
        id: req._id.toString(),
        requestId: req._id.toString(),
        groupId: req.groupId._id.toString(),
        groupName: req.groupId.name,
        groupDescription: req.groupId.description,
        receiver: {
          id: req.receiverId._id.toString(),
          name: req.receiverId.fullName,
          email: req.receiverId.email,
          department: req.receiverId.department,
          isOnline: req.receiverId.isOnline || false
        },
        createdAt: req.createdAt
      }))
    });
  } catch (error) {
    console.error("Error fetching group requests:", error);
    res.status(500).json({ error: "Failed to fetch group requests" });
  }
};

/**
 * POST /api/groups/requests/:requestId/accept
 * Accept a group request
 */
exports.acceptGroupRequest = async (req, res) => {
  try {
    const currentUserId = getUserIdFromToken(req);
    if (!currentUserId) return res.status(401).json({ error: "Not authenticated" });

    const { requestId } = req.params;

    if (!requestId || !mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ error: "Invalid request ID" });
    }

    if (!isConnected() && mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }

    // Find the request
    const groupRequest = await GroupRequest.findOne({
      _id: requestId,
      receiverId: currentUserId,
      status: "pending"
    }).populate("groupId");

    if (!groupRequest) {
      return res.status(404).json({ error: "Group request not found or already processed" });
    }

    // Update request status
    groupRequest.status = "accepted";
    await groupRequest.save();

    // Add user to group
    const group = await Group.findById(groupRequest.groupId._id);
    if (!group.members.includes(currentUserId)) {
      group.members.push(currentUserId);
      await group.save();
    }

    await group.populate("members", "fullName email department isOnline");
    await group.populate("createdBy", "fullName email");

    res.json({
      message: "Group request accepted",
      group: {
        id: group._id.toString(),
        name: group.name,
        description: group.description,
        members: group.members.map(m => ({
          id: m._id.toString(),
          name: m.fullName,
          email: m.email,
          department: m.department,
          isOnline: m.isOnline || false
        }))
      }
    });
  } catch (error) {
    console.error("Error accepting group request:", error);
    res.status(500).json({ error: "Failed to accept group request" });
  }
};

/**
 * POST /api/groups/requests/:requestId/reject
 * Reject a group request
 */
exports.rejectGroupRequest = async (req, res) => {
  try {
    const currentUserId = getUserIdFromToken(req);
    if (!currentUserId) return res.status(401).json({ error: "Not authenticated" });

    const { requestId } = req.params;

    if (!requestId || !mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ error: "Invalid request ID" });
    }

    if (!isConnected() && mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }

    // Find and delete the request
    const groupRequest = await GroupRequest.findOneAndDelete({
      _id: requestId,
      receiverId: currentUserId,
      status: "pending"
    });

    if (!groupRequest) {
      return res.status(404).json({ error: "Group request not found or already processed" });
    }

    res.json({ message: "Group request rejected" });
  } catch (error) {
    console.error("Error rejecting group request:", error);
    res.status(500).json({ error: "Failed to reject group request" });
  }
};

/**
 * GET /api/groups/:groupId
 * Get group details
 */
exports.getGroupDetails = async (req, res) => {
  try {
    const currentUserId = getUserIdFromToken(req);
    if (!currentUserId) return res.status(401).json({ error: "Not authenticated" });

    const { groupId } = req.params;

    if (!isConnected() && mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }

    const group = await Group.findById(groupId)
      .populate("members", "fullName email department isOnline")
      .populate("createdBy", "fullName email");

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if user is a member
    if (!group.members.some(m => m._id.toString() === currentUserId.toString())) {
      return res.status(403).json({ error: "You are not a member of this group" });
    }

    res.json({
      id: group._id.toString(),
      name: group.name,
      description: group.description,
      createdBy: {
        id: group.createdBy._id.toString(),
        name: group.createdBy.fullName,
        email: group.createdBy.email
      },
      members: group.members.map(m => ({
        id: m._id.toString(),
        name: m.fullName,
        email: m.email,
        department: m.department,
        isOnline: m.isOnline || false
      })),
      memberCount: group.members.length,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt
    });
  } catch (error) {
    console.error("Error fetching group details:", error);
    res.status(500).json({ error: "Failed to fetch group details" });
  }
};

