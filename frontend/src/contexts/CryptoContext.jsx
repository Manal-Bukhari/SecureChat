import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import cryptoService from '../services/cryptoService';
import axiosInstance from '../store/axiosInstance';
import { useSelector } from 'react-redux';

const CryptoContext = createContext();

export const CryptoProvider = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [publicKey, setPublicKey] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const { userDetails: user } = useSelector((state) => state.user);
  
  // CRITICAL: Cache public keys to prevent version mismatches
  const publicKeyCache = useRef({});
  const initializationInProgress = useRef(false);

  const initializeCrypto = useCallback(async () => {
    // Fast exit if already initialized
    if (isInitialized) {
      console.log('✅ Crypto already initialized');
      return true;
    }
    
    // Check if service is already ready
    if (cryptoService.isInitialized()) {
       console.log('⚡ Crypto service already ready');
       setIsInitialized(true);
       try {
           const pubKey = await cryptoService.exportPublicKey();
           setPublicKey(pubKey);
       } catch (e) { 
         console.error("Could not export existing key", e); 
       }
       return true;
    }

    if (!user?.id) {
      console.log('⏸️ No user ID, skipping crypto init');
      return false;
    }

    // Prevent overlapping calls
    if (initializationInProgress.current) {
      console.log('⏸️ Initialization already in progress');
      return false;
    }
    
    initializationInProgress.current = true;
    setIsLoading(true);

    try {
      console.log('🔧 Initializing crypto for user:', user.id);
      
      // Try to load existing keys
      const loaded = await cryptoService.loadKeys(user.id);
      
      if (!loaded) {
        console.log('🆕 No local keys found, generating new key pair...');
        await cryptoService.initialize();
        const pubKey = await cryptoService.exportPublicKey();
        
        // Upload public key to server
        await axiosInstance.put('/users/public-key', { publicKey: pubKey });
        
        // Save keys locally
        await cryptoService.saveKeys(user.id);
        
        setPublicKey(pubKey);
        console.log('✅ New key pair generated and uploaded');
      } else {
        console.log('♻️ Loaded existing keys from localStorage');
        const pubKey = await cryptoService.exportPublicKey();
        setPublicKey(pubKey);
        
        // Verify server has this key
        try {
          const response = await axiosInstance.get(`/users/${user.id}/public-key`);
          if (!response.data.publicKey) {
            console.log('📤 Uploading public key to server');
            await axiosInstance.put('/users/public-key', { publicKey: pubKey });
          }
        } catch (err) {
          if (err.response?.status === 404) {
            console.log('📤 Uploading public key to server (404)');
            await axiosInstance.put('/users/public-key', { publicKey: pubKey });
          }
        }
      }

      setIsInitialized(true);
      console.log('✅ Crypto initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Crypto initialization failed:', error);
      setIsInitialized(false);
      return false;
    } finally {
      initializationInProgress.current = false;
      setIsLoading(false);
    }
  }, [user, isInitialized]);

  // CRITICAL: Cache public keys to prevent mismatches
  const getUserPublicKey = useCallback(async (userId) => {
    // Check cache first
    if (publicKeyCache.current[userId]) {
      console.log(`📦 Using cached public key for user: ${userId}`);
      return publicKeyCache.current[userId];
    }
    
    try {
      // Fetch fresh key
      const response = await axiosInstance.get(`/users/${userId}/public-key?t=${Date.now()}`);
      const publicKey = response.data.publicKey;
      
      if (!publicKey) {
        throw new Error('Public key not found');
      }
      
      // Cache it
      publicKeyCache.current[userId] = publicKey;
      console.log(`🔑 Fetched and cached public key for user: ${userId}`);
      
      return publicKey;
    } catch (err) {
      console.error(`❌ Failed to get public key for user ${userId}:`, err);
      throw new Error('User has not set up encryption yet');
    }
  }, []);
  
  // Clear public key cache
  const clearPublicKeyCache = useCallback(() => {
    publicKeyCache.current = {};
    console.log('🗑️ Public key cache cleared');
  }, []);

  const encryptMessage = useCallback(async (plaintext, recipientId) => {
    if (!isInitialized) {
        console.log('⏸️ Crypto not initialized, initializing now...');
        const success = await initializeCrypto();
        if (!success) {
          throw new Error('Crypto initialization failed');
        }
    }
    
    try {
      const recipientKey = await getUserPublicKey(recipientId);
      const encrypted = await cryptoService.encryptForUser(plaintext, recipientKey, recipientId);
      return encrypted;
    } catch (err) {
      console.error('❌ Encryption failed:', err);
      throw err;
    }
  }, [isInitialized, getUserPublicKey, initializeCrypto]);

  const decryptMessage = useCallback(async (encryptedData, senderId) => {
    if (!isInitialized) {
      console.log('⏸️ Crypto not initialized for decryption');
      const success = await initializeCrypto();
      if (!success) {
        console.warn('⚠️ Crypto not initialized, cannot decrypt');
        throw new Error('Encryption not initialized');
      }
    }
    
    try {
      const senderKey = await getUserPublicKey(senderId);
      const decrypted = await cryptoService.decryptFromUser(encryptedData, senderKey, senderId);
      return decrypted;
    } catch (err) {
      console.error('❌ Decryption failed:', err);
      throw err;
    }
  }, [isInitialized, getUserPublicKey, initializeCrypto]);

  const clearCrypto = useCallback(() => {
    cryptoService.clearKeys();
    clearPublicKeyCache();
    setIsInitialized(false);
    setPublicKey(null);
    initializationInProgress.current = false;
    console.log('🗑️ Crypto cleared');
  }, [clearPublicKeyCache]);

  // Auto-initialize when user logs in
  useEffect(() => {
    if (user?.id && !isInitialized && !initializationInProgress.current) {
      console.log('🚀 Auto-initializing crypto...');
      initializeCrypto();
    }
  }, [user?.id, isInitialized, initializeCrypto]);

  return (
    <CryptoContext.Provider value={{
      encryptMessage,
      decryptMessage,
      isInitialized,
      publicKey,
      isLoading,
      clearCrypto,
      initializeCrypto,
      clearPublicKeyCache
    }}>
      {children}
    </CryptoContext.Provider>
  );
};

export const useCrypto = () => {
  const context = useContext(CryptoContext);
  if (!context) {
    throw new Error('useCrypto must be used within CryptoProvider');
  }
  return context;
};

export default CryptoContext;
