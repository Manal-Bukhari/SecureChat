const express = require('express');
const router  = express.Router();

const contactsController = require('../controllers/contactsController');
const messageController  = require('../controllers/messageController');
const authMiddleware = require('../middleware/authMiddleware');

// --- Global User Operations ---

// Search users globally (e.g., /api/users/search?query=Ali)
router.get('/users/search', authMiddleware, contactsController.searchUsers);

// DEPRECATED: Add a user to contacts - now use /api/friends/add instead
// Kept for backward compatibility
router.post('/contacts/add', authMiddleware, contactsController.addContact);


// --- Messaging Operations ---

// Apply auth middleware to all routes starting with /messages
router.use('/messages', authMiddleware);

// Get list of existing contacts/conversations
router.get('/messages/contacts', contactsController.getContacts);

// Get specific conversation messages
router.get('/messages/:conversationId', messageController.getMessages);

// Send a message
router.post('/messages', messageController.postMessage);

// Create or get conversation (Alternative method often used for direct linking)
router.get('/messages/conversation/:userId', messageController.getOrCreateConversation);

module.exports = router;