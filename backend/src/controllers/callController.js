const Call = require('../models/Call');
const User = require('../models/User');

// Get call history for the current user
exports.getCallHistory = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { limit = 50, offset = 0 } = req.query;

    console.log(`[CALL HISTORY] Fetching call history for user: ${userId}`);
    console.log(`[CALL HISTORY] Query params: limit=${limit}, offset=${offset}`);

    // Convert userId to ObjectId for consistent querying
    const mongoose = require('mongoose');
    let userIdObj;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      userIdObj = new mongoose.Types.ObjectId(userId);
    } else {
      console.error(`[CALL HISTORY] Invalid userId format: ${userId}`);
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    // Debug: Check total calls in database
    const totalCalls = await Call.countDocuments({});
    console.log(`[CALL HISTORY] Total calls in database: ${totalCalls}`);

    // Debug: Check calls with this userId as caller
    const callsAsCaller = await Call.countDocuments({ callerId: userIdObj });
    const callsAsReceiver = await Call.countDocuments({ receiverId: userIdObj });
    console.log(`[CALL HISTORY] Calls as caller: ${callsAsCaller}, Calls as receiver: ${callsAsReceiver}`);

    // Find calls where user is either caller or receiver
    const calls = await Call.find({
      $or: [
        { callerId: userIdObj },
        { receiverId: userIdObj }
      ]
    })
      .populate('callerId', 'fullName name email isOnline')
      .populate('receiverId', 'fullName name email isOnline')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    console.log(`[CALL HISTORY] Found ${calls.length} calls for user ${userId}`);
    
    // Debug: Log first call if exists
    if (calls.length > 0) {
      console.log(`[CALL HISTORY] First call sample:`, {
        id: calls[0]._id.toString(),
        callerId: calls[0].callerId?._id?.toString() || calls[0].callerId?.toString(),
        receiverId: calls[0].receiverId?._id?.toString() || calls[0].receiverId?.toString(),
        status: calls[0].status
      });
    }

    // Format the response
    const formattedCalls = calls
      .map(call => {
        try {
          // Handle both populated and non-populated cases
          const callerIdStr = call.callerId?._id?.toString() || call.callerId?.toString() || call.callerId;
          const receiverIdStr = call.receiverId?._id?.toString() || call.receiverId?.toString() || call.receiverId;
          
          const isIncoming = receiverIdStr === userId.toString();
          const contact = isIncoming ? call.callerId : call.receiverId;

          // If populate failed, we need to fetch user data separately
          if (!contact || (!contact.fullName && !contact.name)) {
            console.warn(`[CALL HISTORY] Contact not populated for call ${call._id}, callerId: ${callerIdStr}, receiverId: ${receiverIdStr}`);
          }

          return {
            id: call._id.toString(),
            type: call.callType,
            status: call.status,
            duration: call.duration || 0,
            timestamp: call.timestamp || call.startTime || new Date(),
            isIncoming,
            contact: {
              id: contact?._id?.toString() || contact?.toString() || (isIncoming ? callerIdStr : receiverIdStr),
              name: contact?.fullName || contact?.name || 'Unknown',
              email: contact?.email || '',
              isOnline: contact?.isOnline || false
            }
          };
        } catch (err) {
          console.error(`[CALL HISTORY] Error formatting call ${call._id}:`, err);
          // Return a basic call object even if formatting fails
          return {
            id: call._id.toString(),
            type: call.callType || 'voice',
            status: call.status || 'missed',
            duration: call.duration || 0,
            timestamp: call.timestamp || call.startTime || new Date(),
            isIncoming: false,
            contact: {
              id: 'unknown',
              name: 'Unknown',
              email: '',
              isOnline: false
            }
          };
        }
      })
      .filter(call => {
        // Filter out calls with "Unknown" contact name
        const contactName = call.contact?.name || '';
        const isUnknown = contactName.toLowerCase() === 'unknown' || !contactName;
        if (isUnknown) {
          console.log(`[CALL HISTORY] Filtering out call ${call.id} with Unknown contact`);
        }
        return !isUnknown;
      });

    console.log(`[CALL HISTORY] Returning ${formattedCalls.length} formatted calls (after filtering Unknown)`);
    res.json(formattedCalls);
  } catch (error) {
    console.error('[CALL HISTORY] Error fetching call history:', error);
    console.error('[CALL HISTORY] Error stack:', error.stack);
    res.status(500).json({ message: 'Failed to fetch call history', error: error.message });
  }
};

// Get specific call details
exports.getCallById = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { callId } = req.params;

    const call = await Call.findById(callId)
      .populate('callerId', 'fullName name email isOnline')
      .populate('receiverId', 'fullName name email isOnline');

    if (!call) {
      return res.status(404).json({ message: 'Call not found' });
    }

    // Verify user is a participant in the call
    if (
      call.callerId._id.toString() !== userId &&
      call.receiverId._id.toString() !== userId
    ) {
      return res.status(403).json({ message: 'Unauthorized access to call details' });
    }

    const isIncoming = call.receiverId._id.toString() === userId;
    const contact = isIncoming ? call.callerId : call.receiverId;

    const formattedCall = {
      id: call._id,
      type: call.callType,
      status: call.status,
      duration: call.duration,
      timestamp: call.timestamp,
      startTime: call.startTime,
      endTime: call.endTime,
      isIncoming,
      contact: {
        id: contact._id,
        name: contact.fullName || contact.name,
        email: contact.email,
        isOnline: contact.isOnline
      }
    };

    res.json(formattedCall);
  } catch (error) {
    console.error('Error fetching call details:', error);
    res.status(500).json({ message: 'Failed to fetch call details', error: error.message });
  }
};

// Delete a call from history
exports.deleteCallHistory = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { callId } = req.params;

    const call = await Call.findById(callId);

    if (!call) {
      return res.status(404).json({ message: 'Call not found' });
    }

    // Verify user is a participant in the call
    if (
      call.callerId.toString() !== userId &&
      call.receiverId.toString() !== userId
    ) {
      return res.status(403).json({ message: 'Unauthorized to delete this call' });
    }

    await Call.findByIdAndDelete(callId);

    res.json({ message: 'Call deleted successfully' });
  } catch (error) {
    console.error('Error deleting call:', error);
    res.status(500).json({ message: 'Failed to delete call', error: error.message });
  }
};


