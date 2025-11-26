// backend/models/Friend.js

const mongoose = require("mongoose");

const friendSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  friendId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  status: {
    type: String,
    enum: ["pending", "accepted", "blocked"],
    default: "accepted"
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index to ensure unique friend relationships
friendSchema.index({ userId: 1, friendId: 1 }, { unique: true });

// Update the updatedAt field before saving
friendSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.models.Friend || mongoose.model("Friend", friendSchema);

