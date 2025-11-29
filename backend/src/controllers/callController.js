const Call = require('../models/Call');
const User = require('../models/User');

// Get call history for the current user
exports.getCallHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;

    // Find calls where user is either caller or receiver
    const calls = await Call.find({
      $or: [{ callerId: userId }, { receiverId: userId }]
    })
      .populate('callerId', 'fullName name email isOnline')
      .populate('receiverId', 'fullName name email isOnline')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    // Format the response
    const formattedCalls = calls.map(call => {
      const isIncoming = call.receiverId._id.toString() === userId;
      const contact = isIncoming ? call.callerId : call.receiverId;

      return {
        id: call._id,
        type: call.callType,
        status: call.status,
        duration: call.duration,
        timestamp: call.timestamp,
        isIncoming,
        contact: {
          id: contact._id,
          name: contact.fullName || contact.name,
          email: contact.email,
          isOnline: contact.isOnline
        }
      };
    });

    res.json(formattedCalls);
  } catch (error) {
    console.error('Error fetching call history:', error);
    res.status(500).json({ message: 'Failed to fetch call history', error: error.message });
  }
};

// Get specific call details
exports.getCallById = async (req, res) => {
  try {
    const userId = req.user.id;
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
    const userId = req.user.id;
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


