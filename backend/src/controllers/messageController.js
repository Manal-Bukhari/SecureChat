const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Friend = require('../models/Friend');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

/**
 * Get messages for a specific conversation
 */
exports.getMessages = async (req, res) => {
  try {
    let { conversationId } = req.params;
    
    // Handle conversation IDs with "sample-" prefix
    if (conversationId.startsWith('sample-')) {
      const actualId = conversationId.replace('sample-', '');
      if (mongoose.Types.ObjectId.isValid(actualId)) {
        conversationId = actualId;
      } else {
        return res.status(400).json({ error: 'Invalid conversation ID format' });
      }
    }

    // Get current user ID from token
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const currentUserId = decoded.userId;

    // Validate conversation exists and user is part of it
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const isParticipant = conversation.participants.some(
      p => p.toString() === currentUserId.toString()
    );
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not authorized to access this conversation' });
    }

    // Check if users are friends (status: "accepted") before allowing message access
    const otherParticipant = conversation.participants.find(
      p => p.toString() !== currentUserId.toString()
    );
    
    if (otherParticipant) {
      const friendship = await Friend.findOne({
        $or: [
          { userId: currentUserId, friendId: otherParticipant.toString(), status: "accepted" },
          { userId: otherParticipant.toString(), friendId: currentUserId, status: "accepted" }
        ]
      });
      
      if (!friendship) {
        return res.status(403).json({ 
          error: 'You must be friends to view messages. Please accept the friend request first.' 
        });
      }
    }

    // Get messages with sender information
    // We populate senderId to get name/email (from main)
    let messages = await Message.find({ 
      conversationId: conversation._id.toString() 
    })
      .populate('senderId', 'fullName email')
      .sort({ timestamp: 1 })
      .limit(100);
    
    // Mark messages as read (messages received by current user)
    const updateResult = await Message.updateMany(
      { 
        conversationId: conversation._id.toString(),
        receiverId: currentUserId,
        read: false
      },
      { $set: { read: true } }
    );

    // Re-fetch messages after marking as read to get updated read status (from main)
    if (updateResult.modifiedCount > 0) {
      messages = await Message.find({ 
        conversationId: conversation._id.toString() 
      })
        .populate('senderId', 'fullName email')
        .sort({ timestamp: 1 })
        .limit(100);
    }

    // Get current user info for "me" messages (from main)
    const User = require('../models/User');
    const currentUser = await User.findById(currentUserId);

    // If we marked any messages as read, notify the sender via socket (from main)
    if (updateResult.modifiedCount > 0 && req.io && otherParticipant) {
      // Get the message IDs that were marked as read
      const readMessageIds = messages
        .filter(msg => 
          msg.receiverId.toString() === currentUserId.toString() && 
          msg.senderId._id.toString() === otherParticipant.toString() &&
          msg.read === true
        )
        .map(msg => msg._id.toString());

      if (readMessageIds.length > 0) {
        const readReceipt = {
          conversationId: conversation._id.toString(),
          messageIds: readMessageIds,
          readBy: currentUserId.toString(),
          readAt: new Date().toISOString()
        };
        
        console.log('Sending read receipt to user:', otherParticipant.toString(), readReceipt);
        
        // Emit to the sender of the messages
        req.io.to(otherParticipant.toString()).emit('messagesRead', readReceipt);
        req.io.to(conversation._id.toString()).emit('messagesRead', readReceipt);
        req.io.to(`sample-${conversation._id.toString()}`).emit('messagesRead', readReceipt);
      }
    }

    // Format messages for the front end (MERGED Logic)
    const formattedMessages = messages.map(msg => {
      const isMine = msg.senderId._id.toString() === currentUserId.toString();
      const sender = msg.senderId;

      // Handle Read Status Logic (from main)
      let readStatus = msg.read;
      if (!isMine) {
        // For received messages, they're now read (we just marked them)
        readStatus = true;
      }

      return {
        id: msg._id.toString(),
        conversationId: msg.conversationId,
        
        // Sender info (Merged: 'me' logic + name population)
        senderId: isMine ? 'me' : msg.senderId._id.toString(),
        senderName: isMine ? (currentUser?.fullName || 'You') : (sender?.fullName || 'Unknown'),
        
        // Receiver info (Critical for HEAD logic)
        receiverId: msg.receiverId ? msg.receiverId.toString() : null,

        // Content & Encryption (Critical for HEAD logic)
        text: msg.text,
        encryptedData: msg.encryptedData || '',
        iv: msg.iv || '',
        authTag: msg.authTag || '',
        isEncrypted: msg.isEncrypted || false,

        // Timestamps (Merged: formatted + ISO)
        timestamp: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        fullTimestamp: msg.timestamp.toISOString ? msg.timestamp.toISOString() : new Date(msg.timestamp).toISOString(),
        
        read: readStatus
      };
    });

    res.json(formattedMessages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

/**
 * Create a new message
 */
exports.postMessage = async (req, res) => {
  try {
    // Extract ALL fields including encryption fields (Merged)
    let { conversationId, text, encryptedData, iv, authTag, isEncrypted } = req.body;

    // Handle conversation IDs with "sample-" prefix
    if (conversationId.startsWith('sample-')) {
      conversationId = conversationId.replace('sample-', '');
      
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        return res.status(400).json({ error: 'Invalid conversation ID format' });
      }
    }

    // Get current user ID from token
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const currentUserId = decoded.userId;

    // Find conversation
    let conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Ensure user is part of the conversation
    const isParticipant = conversation.participants.some(
      p => p.toString() === currentUserId.toString()
    );
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not authorized to message in this conversation' });
    }

    // Get the other participant
    const receiverId = conversation.participants.find(
      p => p.toString() !== currentUserId.toString()
    );

    // Check if users are friends
    if (receiverId) {
      const friendship = await Friend.findOne({
        $or: [
          { userId: currentUserId, friendId: receiverId.toString(), status: "accepted" },
          { userId: receiverId.toString(), friendId: currentUserId, status: "accepted" }
        ]
      });
      
      if (!friendship) {
        return res.status(403).json({ 
          error: 'You must be friends to send messages. Please accept the friend request first.' 
        });
      }
    }

    // Create new message WITH encryption fields (from HEAD logic)
    const messageData = {
      conversationId: conversation._id.toString(),
      senderId: currentUserId,
      receiverId,
      text,
      timestamp: new Date()
    };

    // Add encryption fields if message is encrypted
    if (isEncrypted) {
      messageData.encryptedData = encryptedData || '';
      messageData.iv = iv || '';
      messageData.authTag = authTag || '';
      messageData.isEncrypted = true;
    } else {
      messageData.isEncrypted = false;
    }

    const newMessage = new Message(messageData);
    await newMessage.save();

    // Populate sender info (Merged approach)
    await newMessage.populate('senderId', 'fullName email');
    const senderName = newMessage.senderId.fullName || 'Unknown';

    // Update conversation's last message
    conversation.lastMessage = text;
    conversation.lastMessageTimestamp = new Date();
    await conversation.save();

    // Format message for response - MERGED Structure
    // Includes both encryption data (HEAD) and senderName/fullTimestamp (main)
    const formattedMessage = {
      id: newMessage._id.toString(),
      conversationId: conversation._id.toString(),
      senderId: 'me',
      senderName: senderName,
      receiverId: newMessage.receiverId.toString(), // CRITICAL for HEAD
      text: newMessage.text,
      
      // Encryption fields
      encryptedData: newMessage.encryptedData || '',
      iv: newMessage.iv || '',
      authTag: newMessage.authTag || '',
      isEncrypted: newMessage.isEncrypted || false,

      // Timestamps
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      fullTimestamp: newMessage.timestamp.toISOString ? newMessage.timestamp.toISOString() : new Date(newMessage.timestamp).toISOString(),
      
      read: false
    };

    // Emit message via socket.io (from main)
    if (req.io) {
      // For other users, senderId should be the actual ID
      const socketMessage = {
        ...formattedMessage,
        senderId: currentUserId.toString(),
        senderName: senderName,
        // Ensure full timestamp is passed correctly
        fullTimestamp: newMessage.timestamp.toISOString ? newMessage.timestamp.toISOString() : new Date(newMessage.timestamp).toISOString()
      };
      
      // Emit to conversation room
      req.io.to(conversation._id.toString()).emit('newMessage', socketMessage);
    }

    res.status(201).json(formattedMessage);
  } catch (error) {
    console.error('Error creating message:', error);
    res.status(500).json({ error: 'Failed to create message' });
  }
};

/**
 * Mark messages as read
 */
exports.markAsRead = async (req, res) => {
  try {
    const { conversationId, messageIds } = req.body;
    
    // Get current user ID from token
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const currentUserId = decoded.userId;

    // Validate conversation exists and user is part of it
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const isParticipant = conversation.participants.some(
      p => p.toString() === currentUserId.toString()
    );
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Mark messages as read
    const updateQuery = {
      conversationId: conversation._id.toString(),
      receiverId: currentUserId,
      read: false
    };

    // If specific message IDs provided, only mark those
    if (messageIds && Array.isArray(messageIds) && messageIds.length > 0) {
      updateQuery._id = { $in: messageIds.map(id => {
        // Handle both string and ObjectId
        if (mongoose.Types.ObjectId.isValid(id)) {
          return new mongoose.Types.ObjectId(id);
        }
        return id;
      })};
    }

    const result = await Message.updateMany(
      updateQuery,
      { $set: { read: true } }
    );

    // Get the other participant to notify them
    const otherParticipant = conversation.participants.find(
      p => p.toString() !== currentUserId.toString()
    );

    // Emit read receipt via socket.io
    if (req.io && otherParticipant && result.modifiedCount > 0) {
      // Get the actual message IDs that were marked as read
      const actualReadMessageIds = messageIds && messageIds.length > 0 
        ? messageIds 
        : (await Message.find({
            conversationId: conversation._id.toString(),
            receiverId: currentUserId
          }).select('_id')).map(msg => msg._id.toString());
      
      const readReceipt = {
        conversationId: conversation._id.toString(),
        messageIds: actualReadMessageIds,
        readBy: currentUserId.toString(),
        readAt: new Date().toISOString()
      };
      
      console.log('Sending read receipt to user:', otherParticipant.toString(), readReceipt);
      
      // Emit to the sender of the messages - try multiple ways to ensure delivery
      req.io.to(otherParticipant.toString()).emit('messagesRead', readReceipt);
      req.io.to(conversation._id.toString()).emit('messagesRead', readReceipt);
      req.io.to(`sample-${conversation._id.toString()}`).emit('messagesRead', readReceipt);
    }

    res.json({ 
      success: true, 
      updatedCount: result.modifiedCount 
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
};

/**
 * Create or get a conversation between two users
 */
exports.getOrCreateConversation = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get current user ID from token
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const currentUserId = decoded.userId;

    // Check if users exist
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(currentUserId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Find existing conversation
    let conversation = await Conversation.findOne({
      participants: { $all: [currentUserId, userId] }
    });

    if (!conversation) {
      // Create new conversation
      conversation = new Conversation({
        participants: [currentUserId, userId],
        lastMessage: '',
        lastMessageTimestamp: new Date()
      });
      await conversation.save();
    }

    res.json({
      id: conversation._id.toString(),
      participants: conversation.participants,
      lastMessage: conversation.lastMessage,
      lastMessageTimestamp: conversation.lastMessageTimestamp
    });
  } catch (error) {
    console.error('Error creating/fetching conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
};

/**
 * Forward a message to one or more friends
 */
exports.forwardMessage = async (req, res) => {
  try {
    const { messageId, friendIds } = req.body;

    if (!messageId || !friendIds || !Array.isArray(friendIds) || friendIds.length === 0) {
      return res.status(400).json({ error: 'Message ID and friend IDs array are required' });
    }

    // Get current user ID from token
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const currentUserId = decoded.userId;

    // Find the original message
    const originalMessage = await Message.findById(messageId);
    if (!originalMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Verify user has access to the original message (must be sender or receiver)
    const hasAccess = originalMessage.senderId.toString() === currentUserId.toString() ||
                      originalMessage.receiverId.toString() === currentUserId.toString();
    
    if (!hasAccess) {
      return res.status(403).json({ error: 'Not authorized to forward this message' });
    }

    // Get the original sender's name for the forwarded message
    const User = require('../models/User');
    const originalSender = await User.findById(originalMessage.senderId);
    const originalSenderName = originalSender ? originalSender.fullName : 'Unknown';

    // Format the forwarded message text
    const forwardedText = `Forwarded from ${originalSenderName}: ${originalMessage.text}`;

    const forwardedMessages = [];
    const errors = [];

    // Forward to each friend
    for (const friendId of friendIds) {
      try {
        // Validate friend ID
        if (!mongoose.Types.ObjectId.isValid(friendId)) {
          errors.push({ friendId, error: 'Invalid friend ID' });
          continue;
        }

        // Check if users are friends
        const friendship = await Friend.findOne({
          $or: [
            { userId: currentUserId, friendId: friendId, status: "accepted" },
            { userId: friendId, friendId: currentUserId, status: "accepted" }
          ]
        });

        if (!friendship) {
          errors.push({ friendId, error: 'User is not your friend' });
          continue;
        }

        // Find or create conversation with the friend
        let conversation = await Conversation.findOne({
          participants: { $all: [currentUserId, friendId] }
        });

        if (!conversation) {
          conversation = new Conversation({
            participants: [currentUserId, friendId],
            lastMessage: "",
            lastMessageTimestamp: new Date()
          });
          await conversation.save();
        }

        // Create forwarded message
        const forwardedMessage = new Message({
          conversationId: conversation._id.toString(),
          senderId: currentUserId,
          receiverId: friendId,
          text: forwardedText,
          timestamp: new Date(),
          forwardedFrom: originalMessage.senderId
        });

        await forwardedMessage.save();

        // Update conversation's last message
        conversation.lastMessage = forwardedText;
        conversation.lastMessageTimestamp = new Date();
        await conversation.save();

        // Format message for socket.io
        const formattedMessage = {
          id: forwardedMessage._id.toString(),
          conversationId: conversation._id.toString(),
          senderId: currentUserId.toString(),
          text: forwardedText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          read: false,
          forwardedFrom: originalMessage.senderId.toString()
        };

        // Emit message via socket.io
        if (req.io) {
          const roomId = `sample-${conversation._id.toString()}`;
          req.io.to(roomId).emit('newMessage', formattedMessage);
          req.io.to(conversation._id.toString()).emit('newMessage', formattedMessage);
        }

        forwardedMessages.push({
          friendId,
          conversationId: conversation._id.toString(),
          messageId: forwardedMessage._id.toString()
        });
      } catch (error) {
        console.error(`Error forwarding to friend ${friendId}:`, error);
        errors.push({ friendId, error: error.message || 'Failed to forward message' });
      }
    }

    // Return results
    res.status(201).json({
      success: true,
      forwardedCount: forwardedMessages.length,
      forwardedMessages,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error forwarding message:', error);
    res.status(500).json({ error: 'Failed to forward message' });
  }
};