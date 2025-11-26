// backend/controllers/contactsController.js

const User = require("../models/User");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
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
  const decoded = jwt.verify(token, JWT_SECRET);
  return decoded.userId;
};

/**
 * GET /api/messages/contacts
 * DEPRECATED: Now redirects to friends endpoint
 * Kept for backward compatibility but uses friendController
 */
exports.getContacts = async (req, res) => {
  try {
    // Use friendController instead
    const friendController = require("./friendController");
    return friendController.getFriends(req, res);
  } catch (error) {
    console.error("Error fetching contacts:", error);
    return res.status(500).json({ error: "Failed to fetch contacts" });
  }
};

/**
 * GET /api/users/search
 * Search for users globally by name or email (excludes current user).
 */
exports.searchUsers = async (req, res) => {
  try {
    const currentUserId = getUserIdFromToken(req);
    const { query } = req.query;

    if (!query || query.trim() === "") {
      return res.json([]);
    }

    // Find users where name or email matches query, AND is NOT the current user
    const users = await User.find({
      _id: { $ne: currentUserId },
      $or: [
        { fullName: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    }).select("fullName email department isOnline"); // Only return necessary fields

    // Map to frontend friendly format
    const results = users.map(u => ({
      id: u._id.toString(),
      name: u.fullName,
      email: u.email,
      department: u.department,
      isOnline: u.isOnline
    }));

    res.json(results);
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({ error: "Search failed" });
  }
};

/**
 * POST /api/contacts/add
 * Adds a user to contacts (now uses Friend model)
 * This endpoint is kept for backward compatibility but now uses friendController.addFriend
 */
exports.addContact = async (req, res) => {
  try {
    // Import and use friendController
    const friendController = require("./friendController");
    return friendController.addFriend(req, res);
  } catch (error) {
    console.error("Error adding contact:", error);
    res.status(500).json({ error: "Failed to add contact" });
  }
};