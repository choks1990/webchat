import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Linking,
  Modal,
  ScrollView,
  Animated
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { MaterialIcons, Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { db } from './firebaseConfig';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
  limit,
  serverTimestamp,
  getDocs,
  where
} from 'firebase/firestore';

const ADMIN_PASSWORD = 'Doraemon@2022!';
const USER_PASSWORD = '1964';
const CLOUDINARY_CLOUD_NAME = 'dujpj0445';
const CLOUDINARY_UPLOAD_PRESET = 'chat_app_upload';

export default function App() {
  // Authentication State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userType, setUserType] = useState(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Data State
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);

  // UI State
  const [isCallActive, setIsCallActive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [autoDeleteDays, setAutoDeleteDays] = useState(7);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploading, setUploading] = useState(false);

  // Refs
  const flatListRef = useRef(null);
  const recordingRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  const unsubscribeRef = useRef(null);

  // Animation refs
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for call recording
  useEffect(() => {
    if (isCallActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isCallActive]);

  // Auto-Delete Logic
  const checkAndCleanOldMessages = async (daysOverride) => {
    try {
      const days = daysOverride || autoDeleteDays;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffTimestamp = cutoffDate.getTime();

      const q = query(
        collection(db, 'messages'),
        where('timestamp', '<', cutoffTimestamp),
        orderBy('timestamp', 'asc'),
        limit(100)
      );

      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map((docSnap) =>
        deleteDoc(doc(db, 'messages', docSnap.id))
      );

      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
        console.log(`Deleted ${deletePromises.length} old messages`);
      }
    } catch (error) {
      console.error('Error cleaning old messages:', error);
    }
  };

  // Initialize Messages Listener
  useEffect(() => {
    let unsubscribe = null;

    if (isLoggedIn && userType) {
      setLoadingMessages(true);

      // Load Settings
      const fetchSettings = async () => {
        try {
          const docRef = doc(db, 'settings', 'config');
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setAutoDeleteDays(docSnap.data().autoDeleteDays || 7);
          } else {
            await setDoc(docRef, { autoDeleteDays: 7 });
          }
        } catch (error) {
          console.error('Error fetching settings:', error);
        }
      };
      fetchSettings();

      // Query Messages
      const q = query(
        collection(db, 'messages'),
        orderBy('timestamp', 'desc'),
        limit(25)
      );

      unsubscribe = onSnapshot(
        q,
        async (snapshot) => {
          const msgs = snapshot.docs.reverse().map((docSnap) => {
            const data = docSnap.data();
            let time = Date.now();
            if (data.timestamp?.toMillis) {
              time = data.timestamp.toMillis();
            } else if (data.timestamp instanceof Date) {
              time = data.timestamp.getTime();
            }
            return { id: docSnap.id, ...data, timestamp: time };
          });

          setMessages(msgs);
          setLoadingMessages(false);

          // Mark as read
          const updatePromises = snapshot.docs
            .filter((docSnap) => {
              const msg = docSnap.data();
              return msg.sender && msg.sender !== userType && msg.status !== 'read';
            })
            .map((docSnap) =>
              updateDoc(doc(db, 'messages', docSnap.id), { status: 'read' })
            );

          if (updatePromises.length > 0) {
            Promise.all(updatePromises).catch((err) =>
              console.error('Error marking messages as read:', err)
            );
          }
        },
        (error) => {
          console.error('Error fetching messages:', error);
          setLoadingMessages(false);
        }
      );

      unsubscribeRef.current = unsubscribe;

      // Run cleanup after 2 seconds
      setTimeout(() => {
        checkAndCleanOldMessages();
      }, 2000);
    } else if (!isLoggedIn) {
      setMessages([]);
      setLoadingMessages(false);
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, userType]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (!loadingMessages && messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, loadingMessages]);

  // Auto-Delete Logic  
  const updateAutoDeleteSettings = async (days) => {
    setAutoDeleteDays(days);
    try {
      await setDoc(doc(db, 'settings', 'config'), { autoDeleteDays: days });
      setShowSettings(false);
      checkAndCleanOldMessages(days);
    } catch (error) {
      console.error('Error updating settings:', error);
      Alert.alert('Error', 'Failed to update settings');
    }
  };

  // Delete Message
  const deleteMessage = async (msgId) => {
    Alert.alert('Delete Message', 'Delete this message permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'messages', msgId));
          } catch (error) {
            console.error('Error deleting message:', error);
            Alert.alert('Error', 'Failed to delete message');
          }
        },
      },
    ]);
  };

  // Upload to Cloudinary - FIXED for React Native
  const uploadToCloudinary = async (uri, resourceType = 'auto') => {
    try {
      setUploading(true);
      console.log('Starting upload:', uri, 'Type:', resourceType);
      
      // Get file info
      const fileInfo = await FileSystem.getInfoAsync(uri);
      console.log('File info:', fileInfo);

      if (!fileInfo.exists) {
        throw new Error('File does not exist');
      }

      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Prepare the data for Cloudinary
      const uploadData = {
        file: `data:${resourceType === 'video' ? 'audio/m4a' : 'image/jpeg'};base64,${base64}`,
        upload_preset: CLOUDINARY_UPLOAD_PRESET,
      };

      console.log('Uploading to:', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(uploadData),
        }
      );

      const data = await response.json();
      console.log('Upload response status:', response.status);
      console.log('Upload response:', data);

      if (!response.ok || data.error) {
        console.error('Upload failed:', data);
        throw new Error(data.error?.message || `Upload failed: ${response.statusText}`);
      }

      setUploading(false);
      console.log('Upload successful:', data.secure_url);
      return data.secure_url;
    } catch (error) {
      console.error('Upload error:', error);
      setUploading(false);
      Alert.alert('Upload Error', `Failed to upload: ${error.message}`);
      return null;
    }
  };

  // Authentication with improved error handling
  const handleUnifiedLogin = () => {
    const trimmedPassword = password.trim();
    
    if (trimmedPassword === ADMIN_PASSWORD) {
      setPasswordError('');
      setIsLoggedIn(true);
      setUserType('admin');
      setPassword('');
    } else if (trimmedPassword === USER_PASSWORD) {
      setPasswordError('');
      setIsLoggedIn(true);
      setUserType('user');
      setPassword('');
    } else {
      // Show error message
      setPasswordError('Invalid password. Please try again.');
      setPassword('');
      
      // Shake animation
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
    }
  };

  const handleLogout = async () => {
    try {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      if (isCallActive && recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        clearInterval(recordingIntervalRef.current);
      }

      setIsLoggedIn(false);
      setUserType(null);
      setPassword('');
      setPasswordError('');
      setMessages([]);
      setLoadingMessages(false);
      setNewMessage('');
      setIsCallActive(false);
      setShowSettings(false);
      setRecordingTime(0);
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  // Send Text Message
  const handleSendMessage = async () => {
    const textToSend = newMessage.trim();
    if (!textToSend || !isLoggedIn || !userType) return;

    const tempMessage = textToSend;
    setNewMessage('');

    try {
      await addDoc(collection(db, 'messages'), {
        text: tempMessage,
        sender: userType,
        timestamp: serverTimestamp(),
        type: 'text',
        status: 'sent',
      });
    } catch (error) {
      console.error('Error sending message:', error);
      setNewMessage(tempMessage);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    }
  };

  // Pick and Upload Image - FIXED
  const handleImagePicker = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        console.log('Image selected:', uri);
        
        const fileUrl = await uploadToCloudinary(uri, 'image');

        if (fileUrl) {
          console.log('Image uploaded successfully:', fileUrl);
          await addDoc(collection(db, 'messages'), {
            fileName: uri.split('/').pop(),
            fileData: fileUrl,
            fileType: 'image/jpeg',
            fileSize: result.assets[0].fileSize || 0,
            sender: userType,
            timestamp: serverTimestamp(),
            type: 'file',
            status: 'sent',
          });
          Alert.alert('Success', 'Image uploaded successfully');
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to upload image');
    }
  };

  // Voice Recording - Auto start on call
  const startCall = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Error', 'Microphone permission denied');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setIsCallActive(true);
      setRecordingTime(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      // Show notification that recording started
      Alert.alert('Recording Started', 'Call recording is now active', [{ text: 'OK' }]);
    } catch (error) {
      console.error('Microphone error:', error);
      Alert.alert('Error', 'Microphone access denied or not available.');
    }
  };

  const endCall = async () => {
    if (recordingRef.current && isCallActive) {
      try {
        console.log('Stopping recording...');
        await recordingRef.current.stopAndUnloadAsync();
        const uri = recordingRef.current.getURI();
        console.log('Recording URI:', uri);
        
        setIsCallActive(false);
        clearInterval(recordingIntervalRef.current);

        if (uri) {
          console.log('Uploading audio to Cloudinary...');
          const audioUrl = await uploadToCloudinary(uri, 'video');

          if (audioUrl) {
            console.log('Audio uploaded successfully:', audioUrl);
            await addDoc(collection(db, 'messages'), {
              audioData: audioUrl,
              duration: recordingTime,
              sender: userType,
              timestamp: serverTimestamp(),
              type: 'voice',
              status: 'sent',
            });
            Alert.alert('Success', 'Call recording saved to chat');
          } else {
            Alert.alert('Error', 'Failed to upload recording');
          }
        } else {
          Alert.alert('Error', 'No recording found');
        }

        setRecordingTime(0);
        recordingRef.current = null;
      } catch (error) {
        console.error('Error ending call:', error);
        Alert.alert('Error', `Failed to save recording: ${error.message}`);
        setIsCallActive(false);
        clearInterval(recordingIntervalRef.current);
        setRecordingTime(0);
        recordingRef.current = null;
      }
    }
  };

  // Utility Functions
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      return '';
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Render Message Item
  const renderMessage = ({ item: msg }) => {
    const isSender = msg.sender === userType;

    return (
      <View style={[styles.messageContainer, isSender ? styles.messageSent : styles.messageReceived]}>
        <View style={[styles.messageBubble, isSender ? styles.bubbleSent : styles.bubbleReceived]}>
          {/* Text Message */}
          {msg.type === 'text' && <Text style={styles.messageText}>{msg.text}</Text>}

          {/* File Message */}
          {msg.type === 'file' && (
            <View>
              {msg.fileType?.startsWith('image/') ? (
                <TouchableOpacity onPress={() => Linking.openURL(msg.fileData)}>
                  <Image source={{ uri: msg.fileData }} style={styles.messageImage} />
                </TouchableOpacity>
              ) : (
                <View style={styles.fileContainer}>
                  <Ionicons name="document-attach" size={24} color="#0f766e" />
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {msg.fileName}
                    </Text>
                    <Text style={styles.fileSize}>{Math.round(msg.fileSize / 1024)} KB</Text>
                  </View>
                  <TouchableOpacity onPress={() => Linking.openURL(msg.fileData)}>
                    <Feather name="download" size={20} color="#0f766e" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Voice Message */}
          {msg.type === 'voice' && (
            <View style={styles.voiceContainer}>
              <Ionicons name="mic" size={20} color="#666" />
              <TouchableOpacity
                style={styles.playButton}
                onPress={async () => {
                  try {
                    const { sound } = await Audio.Sound.createAsync({ uri: msg.audioData });
                    await sound.playAsync();
                  } catch (error) {
                    console.error('Error playing audio:', error);
                  }
                }}
              >
                <Ionicons name="play-circle" size={32} color="#0f766e" />
              </TouchableOpacity>
              <Text style={styles.voiceDuration}>{formatDuration(msg.duration)}</Text>
            </View>
          )}

          {/* Message Footer */}
          <View style={styles.messageFooter}>
            <Text style={styles.messageTime}>{formatTime(msg.timestamp)}</Text>
            {isSender && (
              <View style={styles.statusIcon}>
                {msg.status === 'read' ? (
                  <Ionicons name="checkmark-done" size={14} color="#0ea5e9" />
                ) : (
                  <Ionicons name="checkmark" size={14} color="#666" />
                )}
              </View>
            )}
            {userType === 'admin' && (
              <TouchableOpacity onPress={() => deleteMessage(msg.id)} style={styles.deleteButton}>
                <MaterialIcons name="delete" size={14} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  // LOGIN SCREEN - MODERNIZED
  if (!isLoggedIn) {
    return (
      <LinearGradient
        colors={['#0f766e', '#14b8a6', '#2dd4bf']}
        style={styles.loginContainer}
      >
        <StatusBar style="light" />
        <Animated.View 
          style={[
            styles.loginCard,
            { transform: [{ translateX: shakeAnim }] }
          ]}
        >
          <LinearGradient
            colors={['#14b8a6', '#0f766e']}
            style={styles.loginIcon}
          >
            <Ionicons name="shield-checkmark" size={40} color="#fff" />
          </LinearGradient>

          <Text style={styles.loginTitle}>Secure Chat</Text>
          <Text style={styles.loginSubtitle}>Enter your password to continue</Text>

          <View style={styles.passwordInputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color="#64748b" style={styles.inputIcon} />
            <TextInput
              style={styles.loginInput}
              placeholder="Enter password"
              placeholderTextColor="#94a3b8"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setPasswordError('');
              }}
              onSubmitEditing={handleUnifiedLogin}
              autoFocus
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
              <Ionicons 
                name={showPassword ? "eye-off-outline" : "eye-outline"} 
                size={20} 
                color="#64748b" 
              />
            </TouchableOpacity>
          </View>

          {passwordError ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={16} color="#ef4444" />
              <Text style={styles.errorText}>{passwordError}</Text>
            </View>
          ) : null}

          <TouchableOpacity style={styles.loginButtonWrapper} onPress={handleUnifiedLogin}>
            <LinearGradient
              colors={['#14b8a6', '#0d9488']}
              style={styles.loginButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.loginButtonText}>Unlock</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.loginHint}>Secure end-to-end encrypted chat</Text>
        </Animated.View>
      </LinearGradient>
    );
  }

  // MAIN APP
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <StatusBar style="light" />

      {/* Call Overlay */}
      {isCallActive && (
        <Modal visible={isCallActive} animationType="fade">
          <LinearGradient
            colors={['#1f2937', '#111827']}
            style={styles.callOverlay}
          >
            <View style={styles.callContent}>
              <Animated.View 
                style={[
                  styles.callAvatar,
                  { transform: [{ scale: pulseAnim }] }
                ]}
              >
                <LinearGradient
                  colors={['#ef4444', '#dc2626']}
                  style={styles.callAvatarGradient}
                >
                  <Text style={styles.callAvatarText}>{userType === 'admin' ? 'U' : 'A'}</Text>
                </LinearGradient>
              </Animated.View>
              
              <View style={styles.recordingBadge}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingText}>RECORDING</Text>
              </View>

              <Text style={styles.callTitle}>Voice Call Active</Text>
              <Text style={styles.callTimer}>{formatDuration(recordingTime)}</Text>
            </View>
            
            <TouchableOpacity style={styles.endCallButton} onPress={endCall}>
              <LinearGradient
                colors={['#ef4444', '#dc2626']}
                style={styles.endCallButtonGradient}
              >
                <Ionicons name="call" size={36} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>
        </Modal>
      )}

      {/* Header - MODERNIZED */}
      <LinearGradient
        colors={['#0f766e', '#14b8a6']}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          <LinearGradient
            colors={['#ffffff', '#f0fdfa']}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{userType === 'admin' ? 'A' : 'U'}</Text>
          </LinearGradient>
          <View>
            <Text style={styles.headerTitle}>
              {userType === 'admin' ? 'Admin Control' : 'Secure Chat'}
            </Text>
            <Text style={styles.headerSubtitle}>
              {isCallActive ? '🔴 Recording...' : `Disappearing: ${autoDeleteDays} days`}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {userType === 'admin' && (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setShowSettings(!showSettings)}
            >
              <Ionicons name="settings-outline" size={22} color="#fff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity 
            style={[styles.headerButton, isCallActive && styles.headerButtonActive]} 
            onPress={isCallActive ? endCall : startCall}
          >
            <Ionicons name={isCallActive ? "call" : "call-outline"} size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Settings Panel */}
      {showSettings && userType === 'admin' && (
        <LinearGradient
          colors={['#0d9488', '#0f766e']}
          style={styles.settingsPanel}
        >
          <Text style={styles.settingsTitle}>AUTO-DELETE MESSAGES AFTER:</Text>
          <View style={styles.settingsButtons}>
            {[1, 3, 7, 30].map((day) => (
              <TouchableOpacity
                key={day}
                style={[
                  styles.settingsButton,
                  autoDeleteDays === day && styles.settingsButtonActive,
                ]}
                onPress={() => updateAutoDeleteSettings(day)}
              >
                <Text
                  style={[
                    styles.settingsButtonText,
                    autoDeleteDays === day && styles.settingsButtonTextActive,
                  ]}
                >
                  {day} Day{day > 1 ? 's' : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </LinearGradient>
      )}

      {/* Messages Area */}
      <View style={styles.messagesContainer}>
        {loadingMessages ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0f766e" />
            <Text style={styles.loadingText}>Loading messages...</Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>Send a message to start the conversation</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />
        )}
      </View>

      {/* Input Area - MODERNIZED */}
      <View style={styles.inputContainer}>
        <TouchableOpacity
          style={styles.inputButton}
          onPress={handleImagePicker}
          disabled={uploading}
        >
          <Ionicons name="image-outline" size={24} color={uploading ? '#ccc' : '#0f766e'} />
        </TouchableOpacity>

        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder={uploading ? 'Uploading...' : 'Type a message...'}
            placeholderTextColor="#94a3b8"
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
            maxLength={1000}
            editable={!uploading}
          />
        </View>

        <TouchableOpacity
          style={[
            styles.sendButton,
            (!newMessage.trim() || uploading) && styles.sendButtonDisabled,
          ]}
          onPress={handleSendMessage}
          disabled={!newMessage.trim() || uploading}
        >
          <LinearGradient
            colors={newMessage.trim() && !uploading ? ['#14b8a6', '#0f766e'] : ['#d1d5db', '#d1d5db']}
            style={styles.sendButtonGradient}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Uploading Indicator */}
      {uploading && (
        <View style={styles.uploadingIndicator}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.uploadingText}>Uploading...</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e5ded8',
  },
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loginCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  loginIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#14b8a6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  loginTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  loginSubtitle: {
    fontSize: 15,
    color: '#64748b',
    marginBottom: 32,
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  inputIcon: {
    marginRight: 8,
  },
  loginInput: {
    flex: 1,
    height: 56,
    fontSize: 16,
    color: '#1f2937',
  },
  eyeIcon: {
    padding: 8,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    padding: 12,
    borderRadius: 8,
    width: '100%',
    marginBottom: 16,
  },
  errorText: {
    color: '#dc2626',
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  loginButtonWrapper: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#14b8a6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  loginHint: {
    fontSize: 13,
    color: '#94a3b8',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarText: {
    color: '#0f766e',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#ccfbf1',
    fontSize: 12,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
  },
  headerButton: {
    padding: 8,
    marginLeft: 4,
    borderRadius: 8,
  },
  headerButtonActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
  },
  settingsPanel: {
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  settingsTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  settingsButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  settingsButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  settingsButtonActive: {
    backgroundColor: '#fff',
  },
  settingsButtonText: {
    color: '#ccfbf1',
    fontSize: 14,
    fontWeight: '600',
  },
  settingsButtonTextActive: {
    color: '#0d9488',
  },
  messagesContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    color: '#475569',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  messageContainer: {
    marginBottom: 12,
  },
  messageSent: {
    alignItems: 'flex-end',
  },
  messageReceived: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  bubbleSent: {
    backgroundColor: '#d9fdd3',
    borderTopRightRadius: 4,
  },
  bubbleReceived: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    color: '#1f2937',
    lineHeight: 20,
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 4,
  },
  fileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
    padding: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  fileInfo: {
    flex: 1,
    marginLeft: 12,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  fileSize: {
    fontSize: 12,
    color: '#6b7280',
  },
  voiceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 200,
  },
  playButton: {
    marginLeft: 12,
  },
  voiceDuration: {
    fontSize: 12,
    color: '#666',
    marginLeft: 8,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  messageTime: {
    fontSize: 10,
    color: '#6b7280',
  },
  statusIcon: {
    marginLeft: 4,
  },
  deleteButton: {
    marginLeft: 8,
  },
  inputContainer: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  inputButton: {
    padding: 10,
    borderRadius: 24,
    backgroundColor: '#fff',
    marginRight: 8,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  input: {
    fontSize: 15,
    color: '#1f2937',
    maxHeight: 100,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingIndicator: {
    position: 'absolute',
    bottom: 80,
    right: 16,
    backgroundColor: '#0f766e',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  uploadingText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 8,
    fontWeight: '500',
  },
  callOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 80,
  },
  callContent: {
    alignItems: 'center',
  },
  callAvatar: {
    marginBottom: 32,
  },
  callAvatarGradient: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 6,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  callAvatarText: {
    fontSize: 56,
    fontWeight: 'bold',
    color: '#fff',
  },
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 24,
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
  },
  recordingText: {
    color: '#fee2e2',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  callTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  callTimer: {
    fontSize: 48,
    color: '#5eead4',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: 'bold',
  },
  endCallButton: {
    borderRadius: 40,
    overflow: 'hidden',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  endCallButtonGradient: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
});