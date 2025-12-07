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
  ScrollView
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { MaterialIcons, Ionicons, Feather } from '@expo/vector-icons';

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

const ADMIN_PASSWORD = '1990';
const USER_PASSWORD = '1964';
const CLOUDINARY_CLOUD_NAME = 'dujpj0445';
const CLOUDINARY_UPLOAD_PRESET = 'chat_app_upload';

export default function App() {
  // Authentication State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userType, setUserType] = useState(null);
  const [password, setPassword] = useState('');

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

  // Upload to Cloudinary
  const uploadToCloudinary = async (uri, resourceType = 'auto') => {
    try {
      setUploading(true);
      
      const formData = new FormData();
      const filename = uri.split('/').pop();
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image';

      formData.append('file', {
        uri,
        name: filename,
        type,
      });
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
        {
          method: 'POST',
          body: formData,
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const data = await response.json();
      setUploading(false);
      return data.secure_url;
    } catch (error) {
      console.error('Upload failed:', error);
      setUploading(false);
      Alert.alert('Error', 'Upload failed. Please try again.');
      return null;
    }
  };

  // Authentication
  const handleUnifiedLogin = () => {
    const trimmedPassword = password.trim();
    
    if (trimmedPassword === ADMIN_PASSWORD) {
      setIsLoggedIn(true);
      setUserType('admin');
      setPassword('');
    } else if (trimmedPassword === USER_PASSWORD) {
      setIsLoggedIn(true);
      setUserType('user');
      setPassword('');
    } else {
      // Show error alert
      Alert.alert(
        'Incorrect Password',
        'Please check your password and try again.',
        [{ text: 'OK' }]
      );
      // Clear password field
      setPassword('');
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

  // Pick and Upload Image
  const handleImagePicker = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        const fileUrl = await uploadToCloudinary(uri, 'image');

        if (fileUrl) {
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
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to upload image');
    }
  };

  // Voice Recording
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
    } catch (error) {
      console.error('Microphone error:', error);
      Alert.alert('Error', 'Microphone access denied or not available.');
    }
  };

  const endCall = async () => {
    if (recordingRef.current && isCallActive) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
        const uri = recordingRef.current.getURI();
        setIsCallActive(false);
        clearInterval(recordingIntervalRef.current);

        if (uri) {
          const audioUrl = await uploadToCloudinary(uri, 'video');

          if (audioUrl) {
            await addDoc(collection(db, 'messages'), {
              audioData: audioUrl,
              duration: recordingTime,
              sender: userType,
              timestamp: serverTimestamp(),
              type: 'voice',
              status: 'sent',
            });
          }
        }

        setRecordingTime(0);
        recordingRef.current = null;
      } catch (error) {
        console.error('Error ending call:', error);
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

  // LOGIN SCREEN
  if (!isLoggedIn) {
    return (
      <View style={styles.loginContainer}>
        <StatusBar style="light" />
        <View style={styles.loginCard}>
          <View style={styles.loginIcon}>
            <Ionicons name="lock-closed" size={32} color="#fff" />
          </View>
          <Text style={styles.loginTitle}>Secure Login</Text>
          <Text style={styles.loginSubtitle}>Enter your access key to continue</Text>
          <TextInput
            style={styles.loginInput}
            placeholder="Password"
            placeholderTextColor="#999"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={handleUnifiedLogin}
            autoFocus
          />
          <TouchableOpacity style={styles.loginButton} onPress={handleUnifiedLogin}>
            <Text style={styles.loginButtonText}>Login</Text>
          </TouchableOpacity>
          <Text style={styles.loginHint}>Admin: admin123 | User: user123</Text>
        </View>
      </View>
    );
  }

  // MAIN APP
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <StatusBar style="light" />

      {/* Call Overlay */}
      {isCallActive && (
        <Modal visible={isCallActive} animationType="fade">
          <View style={styles.callOverlay}>
            <View style={styles.callContent}>
              <View style={styles.callAvatar}>
                <Text style={styles.callAvatarText}>{userType === 'admin' ? 'U' : 'A'}</Text>
              </View>
              <Text style={styles.callTitle}>Voice Call Active</Text>
              <Text style={styles.callTimer}>{formatDuration(recordingTime)}</Text>
            </View>
            <TouchableOpacity style={styles.endCallButton} onPress={endCall}>
              <Ionicons name="call" size={40} color="#fff" />
            </TouchableOpacity>
          </View>
        </Modal>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{userType === 'admin' ? 'A' : 'U'}</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>
              {userType === 'admin' ? 'Admin Control' : 'Lineage'}
            </Text>
            <Text style={styles.headerSubtitle}>Disappearing: {autoDeleteDays} days</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {userType === 'admin' && (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setShowSettings(!showSettings)}
            >
              <Ionicons name="settings-sharp" size={24} color="#fff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.headerButton} onPress={startCall}>
            <Ionicons name="call" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={handleLogout}>
            <MaterialIcons name="logout" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Settings Panel */}
      {showSettings && userType === 'admin' && (
        <View style={styles.settingsPanel}>
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
        </View>
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
            <Text style={styles.emptyText}>No messages yet.</Text>
            <Text style={styles.emptySubtext}>Send a message to start the chat.</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </View>

      {/* Input Area */}
      <View style={styles.inputContainer}>
        <TouchableOpacity
          style={styles.inputButton}
          onPress={handleImagePicker}
          disabled={uploading}
        >
          <Ionicons name="image-outline" size={24} color={uploading ? '#ccc' : '#666'} />
        </TouchableOpacity>

        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder={uploading ? 'Uploading...' : 'Message'}
            placeholderTextColor="#999"
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
          <Ionicons name="send" size={20} color="#fff" />
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
    backgroundColor: '#1f2937',
    padding: 20,
  },
  loginCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  loginIcon: {
    backgroundColor: '#0f766e',
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  loginTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  loginSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 24,
  },
  loginInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  loginButton: {
    backgroundColor: '#0f766e',
    width: '100%',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loginHint: {
    fontSize: 12,
    color: '#6b7280',
  },
  header: {
    backgroundColor: '#0f766e',
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#0f766e',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#a7f3d0',
    fontSize: 12,
  },
  headerRight: {
    flexDirection: 'row',
  },
  headerButton: {
    padding: 8,
    marginLeft: 4,
  },
  settingsPanel: {
    backgroundColor: '#0d9488',
    padding: 16,
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
    backgroundColor: '#115e59',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  settingsButtonActive: {
    backgroundColor: '#fff',
  },
  settingsButtonText: {
    color: '#ccfbf1',
    fontSize: 14,
    fontWeight: '500',
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
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    margin: 20,
    borderRadius: 12,
    padding: 24,
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
  emptySubtext: {
    color: '#999',
    fontSize: 14,
    marginTop: 4,
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
    borderRadius: 8,
  },
  bubbleSent: {
    backgroundColor: '#d9fdd3',
    borderTopRightRadius: 0,
  },
  bubbleReceived: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 0,
  },
  messageText: {
    fontSize: 14,
    color: '#1f2937',
    lineHeight: 20,
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
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
    backgroundColor: '#f0f2f5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputButton: {
    padding: 8,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 20,
    marginHorizontal: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  input: {
    fontSize: 14,
    color: '#1f2937',
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#0f766e',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#d1d5db',
  },
  uploadingIndicator: {
    position: 'absolute',
    bottom: 80,
    right: 16,
    backgroundColor: '#0f766e',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  uploadingText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 8,
  },
  callOverlay: {
    flex: 1,
    backgroundColor: '#1f2937',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 60,
  },
  callContent: {
    alignItems: 'center',
  },
  callAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#0f766e',
    marginBottom: 24,
  },
  callAvatarText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
  },
  callTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  callTimer: {
    fontSize: 32,
    color: '#5eead4',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  endCallButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  endCallIconContainer: {
    backgroundColor: '#ef4444',
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    elevation: 12,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  endCallText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    marginRight: 8,
  },
  recordingText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
});