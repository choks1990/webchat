import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';

// =====================================================
// FIREBASE CONFIGURATION - Replace with your values
// =====================================================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBhaWv2CY_JbTVSzruyOWBdWX06ubY69Vw",
  authDomain: "chat-a57cb.firebaseapp.com",
  projectId: "chat-a57cb",
  storageBucket: "chat-a57cb.firebasestorage.app",
  messagingSenderId: "74674191858",
  appId: "1:74674191858:web:013f97035bed6bd7173f6b"
};

// =====================================================
// CLOUDINARY CONFIGURATION
// =====================================================
const CLOUDINARY_CONFIG = {
  cloudName: "dujpj0445",
  uploadPreset: "chat_app_upload"
};

// =====================================================
// CONSTANTS
// =====================================================
const ADMIN_PASSWORD = 'admin123';
const USER_PASSWORD = 'user123';

// =====================================================
// UTILITY FUNCTIONS
// =====================================================
const formatTime = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const uploadToCloudinary = async (fileUri) => {
  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    type: 'image/jpeg',
    name: 'upload.jpg',
  });
  formData.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/auto/upload`,
      {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error('Upload failed:', error);
    return null;
  }
};

// =====================================================
// MAIN APP COMPONENT
// =====================================================
const App = () => {
  // --- STATE ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userType, setUserType] = useState(null);
  const [password, setPassword] = useState('');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  
  // Call & UI State
  const [isCallActive, setIsCallActive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [autoDeleteDays, setAutoDeleteDays] = useState(7);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(null);

  const scrollViewRef = useRef(null);
  const recordingIntervalRef = useRef(null);

  // --- LOAD MESSAGES FROM STORAGE ---
  useEffect(() => {
    if (isLoggedIn) {
      loadMessages();
      loadSettings();
    }
  }, [isLoggedIn]);

  const loadMessages = async () => {
    try {
      const stored = await AsyncStorage.getItem('messages');
      if (stored) {
        setMessages(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const saveMessages = async (msgs) => {
    try {
      await AsyncStorage.setItem('messages', JSON.stringify(msgs));
    } catch (error) {
      console.error('Error saving messages:', error);
    }
  };

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem('autoDeleteDays');
      if (stored) {
        setAutoDeleteDays(parseInt(stored));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const saveSettings = async (days) => {
    try {
      await AsyncStorage.setItem('autoDeleteDays', days.toString());
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  // --- AUTO-SCROLL ---
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  // --- AUTHENTICATION ---
  const handleUnifiedLogin = () => {
    if (password === ADMIN_PASSWORD) {
      setIsLoggedIn(true);
      setUserType('admin');
      setPassword('');
    } else if (password === USER_PASSWORD) {
      setIsLoggedIn(true);
      setUserType('user');
      setPassword('');
    } else {
      Alert.alert('Error', 'Incorrect Password');
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          onPress: () => {
            setIsLoggedIn(false);
            setUserType(null);
            setPassword('');
          }
        }
      ]
    );
  };

  // --- SENDING MESSAGES ---
  const handleSendMessage = async () => {
    const textToSend = newMessage.trim();
    if (textToSend) {
      const newMsg = {
        id: Date.now().toString(),
        text: textToSend,
        sender: userType,
        timestamp: Date.now(),
        type: 'text',
        status: 'sent'
      };
      
      const updatedMessages = [...messages, newMsg];
      setMessages(updatedMessages);
      await saveMessages(updatedMessages);
      setNewMessage('');
    }
  };

  // --- FILE UPLOAD ---
  const handleFileUpload = async () => {
    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera roll permissions to upload images.');
        return;
      }

      // Pick image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled) {
        setUploading(true);
        
        // Upload to Cloudinary
        const uploadUrl = await uploadToCloudinary(result.assets[0].uri);
        
        if (uploadUrl) {
          const newMsg = {
            id: Date.now().toString(),
            fileData: uploadUrl,
            fileType: 'image/jpeg',
            fileName: 'image.jpg',
            sender: userType,
            timestamp: Date.now(),
            type: 'file',
            status: 'sent'
          };
          
          const updatedMessages = [...messages, newMsg];
          setMessages(updatedMessages);
          await saveMessages(updatedMessages);
        } else {
          Alert.alert('Error', 'Failed to upload image');
        }
        
        setUploading(false);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to upload image');
      setUploading(false);
    }
  };

  // --- VOICE RECORDING ---
  const startCall = async () => {
    try {
      // Request permission
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant microphone permissions to record audio.');
        return;
      }

      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Start recording
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      setRecording(newRecording);
      setIsCallActive(true);
      setRecordingTime(0);
      
      // Start timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording. Please try again.');
    }
  };

  const endCall = async () => {
    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      
      clearInterval(recordingIntervalRef.current);
      setIsCallActive(false);
      
      // Create voice message
      const newMsg = {
        id: Date.now().toString(),
        audioData: uri,
        duration: recordingTime,
        sender: userType,
        timestamp: Date.now(),
        type: 'voice',
        status: 'sent'
      };
      
      const updatedMessages = [...messages, newMsg];
      setMessages(updatedMessages);
      await saveMessages(updatedMessages);
      
      setRecording(null);
      Alert.alert('Success', 'Voice message sent!');
    } catch (error) {
      console.error('Failed to stop recording:', error);
      Alert.alert('Error', 'Failed to save voice message');
    }
  };

  // --- DELETE MESSAGE ---
  const deleteMessage = (msgId) => {
    Alert.alert(
      'Delete Message',
      'Delete this message permanently?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updatedMessages = messages.filter(m => m.id !== msgId);
            setMessages(updatedMessages);
            await saveMessages(updatedMessages);
          }
        }
      ]
    );
  };

  // --- UPDATE SETTINGS ---
  const updateAutoDeleteSettings = async (days) => {
    setAutoDeleteDays(days);
    await saveSettings(days);
    setShowSettings(false);
    Alert.alert('Settings Updated', `Messages will auto-delete after ${days} days`);
  };

  // --- RENDER: LOGIN ---
  if (!isLoggedIn) {
    return (
      <View style={styles.loginContainer}>
        <View style={styles.loginCard}>
          <View style={styles.loginIcon}>
            <Text style={styles.loginIconText}>🔒</Text>
          </View>
          <Text style={styles.loginTitle}>Secure Login</Text>
          <Text style={styles.loginSubtitle}>Enter your access key to continue</Text>
          
          <TextInput
            style={styles.loginInput}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            onSubmitEditing={handleUnifiedLogin}
            autoCapitalize="none"
          />
          
          <TouchableOpacity style={styles.loginButton} onPress={handleUnifiedLogin}>
            <Text style={styles.loginButtonText}>Login</Text>
          </TouchableOpacity>
          
          <Text style={styles.loginHint}>💡 Hint: admin123 or user123</Text>
        </View>
      </View>
    );
  }

  // --- RENDER: MAIN APP ---
  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* CALL OVERLAY */}
      {isCallActive && (
        <View style={styles.callOverlay}>
          <View style={styles.callContent}>
            <View style={styles.callAvatar}>
              <Text style={styles.callAvatarText}>
                {userType === 'admin' ? 'U' : 'A'}
              </Text>
            </View>
            <Text style={styles.callTitle}>🎙️ Voice Recording</Text>
            <Text style={styles.callTimer}>{formatDuration(recordingTime)}</Text>
            <Text style={styles.callSubtitle}>Recording in progress...</Text>
          </View>
          
          <TouchableOpacity style={styles.endCallButton} onPress={endCall}>
            <Text style={styles.endCallText}>⏹️ Stop & Send</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {userType === 'admin' ? 'A' : 'U'}
            </Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>
              {userType === 'admin' ? 'Admin Control' : 'Secure Chat'}
            </Text>
            <Text style={styles.headerSubtitle}>
              🔒 Disappearing: {autoDeleteDays} days
            </Text>
          </View>
        </View>
        
        <View style={styles.headerRight}>
          {userType === 'admin' && (
            <TouchableOpacity 
              style={styles.headerButton} 
              onPress={() => setShowSettings(!showSettings)}
            >
              <Text style={styles.headerButtonText}>⚙️</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.headerButton} onPress={startCall}>
            <Text style={styles.headerButtonText}>🎙️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={handleLogout}>
            <Text style={styles.headerButtonText}>🚪</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* SETTINGS (Admin Only) */}
      {showSettings && userType === 'admin' && (
        <View style={styles.settingsPanel}>
          <Text style={styles.settingsTitle}>Auto-Delete Messages After:</Text>
          <View style={styles.settingsButtons}>
            {[1, 3, 7, 30].map(day => (
              <TouchableOpacity
                key={day}
                style={[
                  styles.settingsButton,
                  autoDeleteDays === day && styles.settingsButtonActive
                ]}
                onPress={() => updateAutoDeleteSettings(day)}
              >
                <Text style={[
                  styles.settingsButtonText,
                  autoDeleteDays === day && styles.settingsButtonTextActive
                ]}>
                  {day} Days
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* MESSAGES AREA */}
      <ScrollView 
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>💬</Text>
            <Text style={styles.emptyStateTitle}>No messages yet</Text>
            <Text style={styles.emptyStateSubtitle}>Start a conversation!</Text>
          </View>
        )}
        
        {messages.map(msg => (
          <View
            key={msg.id}
            style={[
              styles.messageWrapper,
              msg.sender === userType ? styles.messageWrapperRight : styles.messageWrapperLeft
            ]}
          >
            <View
              style={[
                styles.messageBubble,
                msg.sender === userType ? styles.messageBubbleOwn : styles.messageBubbleOther
              ]}
            >
              {/* TEXT MESSAGE */}
              {msg.type === 'text' && (
                <Text style={styles.messageText}>{msg.text}</Text>
              )}
              
              {/* IMAGE MESSAGE */}
              {msg.type === 'file' && msg.fileType?.startsWith('image/') && (
                <TouchableOpacity onPress={() => Alert.alert('Image', 'Viewing full image')}>
                  <Image source={{ uri: msg.fileData }} style={styles.messageImage} />
                </TouchableOpacity>
              )}
              
              {/* VOICE MESSAGE */}
              {msg.type === 'voice' && (
                <View style={styles.voiceMessage}>
                  <Text style={styles.voiceIcon}>🎤</Text>
                  <View style={styles.voiceWave}>
                    <Text style={styles.voiceWaveText}>▁▃▅▇▅▃▁</Text>
                  </View>
                  <Text style={styles.voiceDuration}>{formatDuration(msg.duration)}</Text>
                </View>
              )}
              
              {/* MESSAGE FOOTER */}
              <View style={styles.messageFooter}>
                <Text style={styles.messageTime}>{formatTime(msg.timestamp)}</Text>
                {msg.sender === userType && (
                  <Text style={styles.messageTick}>
                    {msg.status === 'read' ? '✓✓' : '✓'}
                  </Text>
                )}
                {userType === 'admin' && (
                  <TouchableOpacity onPress={() => deleteMessage(msg.id)}>
                    <Text style={styles.deleteIcon}>🗑️</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* UPLOADING INDICATOR */}
      {uploading && (
        <View style={styles.uploadingOverlay}>
          <ActivityIndicator size="large" color="#0d9488" />
          <Text style={styles.uploadingText}>Uploading...</Text>
        </View>
      )}

      {/* INPUT AREA */}
      <View style={styles.inputContainer}>
        <TouchableOpacity style={styles.attachButton} onPress={handleFileUpload}>
          <Text style={styles.attachIcon}>📎</Text>
        </TouchableOpacity>
        
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.textInput}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder="Type a message..."
            multiline
            maxLength={1000}
            onSubmitEditing={handleSendMessage}
          />
        </View>
        
        <TouchableOpacity
          style={[
            styles.sendButton,
            !newMessage.trim() && styles.sendButtonDisabled
          ]}
          onPress={handleSendMessage}
          disabled={!newMessage.trim()}
        >
          <Text style={styles.sendIcon}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

// =====================================================
// STYLES
// =====================================================
const styles = StyleSheet.create({
  // LOGIN STYLES
  loginContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loginCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 30,
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
    backgroundColor: '#0d9488',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  loginIconText: {
    fontSize: 40,
  },
  loginTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  loginSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 30,
  },
  loginInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    marginBottom: 20,
  },
  loginButton: {
    width: '100%',
    backgroundColor: '#0d9488',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  loginButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loginHint: {
    marginTop: 15,
    fontSize: 12,
    color: '#999',
  },

  // MAIN APP STYLES
  container: {
    flex: 1,
    backgroundColor: '#e5ded8',
  },
  
  // HEADER
  header: {
    backgroundColor: '#0d9488',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    paddingTop: Platform.OS === 'ios' ? 50 : 15,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0d9488',
  },
  headerTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#b2f5ea',
    fontSize: 11,
  },
  headerRight: {
    flexDirection: 'row',
  },
  headerButton: {
    padding: 8,
    marginLeft: 5,
  },
  headerButtonText: {
    fontSize: 20,
  },

  // SETTINGS
  settingsPanel: {
    backgroundColor: '#0f766e',
    padding: 15,
  },
  settingsTitle: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  settingsButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  settingsButton: {
    backgroundColor: '#115e59',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  settingsButtonActive: {
    backgroundColor: 'white',
  },
  settingsButtonText: {
    color: '#b2f5ea',
    fontSize: 13,
    fontWeight: '500',
  },
  settingsButtonTextActive: {
    color: '#0f766e',
  },

  // MESSAGES
  messagesContainer: {
    flex: 1,
    backgroundColor: '#e5ded8',
  },
  messagesContent: {
    padding: 10,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyStateText: {
    fontSize: 60,
    marginBottom: 10,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 5,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: '#999',
  },
  messageWrapper: {
    marginBottom: 10,
    maxWidth: '85%',
  },
  messageWrapperRight: {
    alignSelf: 'flex-end',
  },
  messageWrapperLeft: {
    alignSelf: 'flex-start',
  },
  messageBubble: {
    padding: 10,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  messageBubbleOwn: {
    backgroundColor: '#d9fdd3',
    borderTopRightRadius: 0,
  },
  messageBubbleOther: {
    backgroundColor: 'white',
    borderTopLeftRadius: 0,
  },
  messageText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginBottom: 5,
  },
  voiceMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 200,
  },
  voiceIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  voiceWave: {
    flex: 1,
    height: 30,
    justifyContent: 'center',
  },
  voiceWaveText: {
    fontSize: 18,
    color: '#666',
    letterSpacing: 2,
  },
  voiceDuration: {
    fontSize: 11,
    color: '#666',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginLeft: 10,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 5,
    gap: 5,
  },
  messageTime: {
    fontSize: 10,
    color: '#666',
  },
  messageTick: {
    fontSize: 10,
    color: '#666',
  },
  deleteIcon: {
    fontSize: 12,
    marginLeft: 5,
  },

  // INPUT
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#f0f2f5',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  attachButton: {
    padding: 10,
  },
  attachIcon: {
    fontSize: 24,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 8,
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  textInput: {
    fontSize: 15,
    maxHeight: 100,
    color: '#333',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0d9488',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#cbd5e0',
  },
  sendIcon: {
    fontSize: 20,
    color: 'white',
  },

  // CALL OVERLAY
  callOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1a202c',
    zIndex: 1000,
    justifyContent: 'space-between',
    paddingVertical: 60,
    alignItems: 'center',
  },
  callContent: {
    alignItems: 'center',
    marginTop: 80,
  },
  callAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#2d3748',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    borderWidth: 4,
    borderColor: '#0d9488',
  },
  callAvatarText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: 'white',
  },
  callTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  callTimer: {
    color: '#5eead4',
    fontSize: 32,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 5,
  },
  callSubtitle: {
    color: '#94a3b8',
    fontSize: 14,
  },
  endCallButton: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 30,
    marginBottom: 40,
  },
  endCallText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },

  // UPLOADING
  uploadingOverlay: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 20,
    alignItems: 'center',
  },
  uploadingText: {
    color: 'white',
    marginTop: 10,
    fontSize: 14,
  },
});

export default App;