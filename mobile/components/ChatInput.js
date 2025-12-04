// mobile/App.js or mobile/components/ChatInput.js
// Find the microphone icon component and replace it with phone icon

import { Ionicons } from '@expo/vector-icons';
// or
import { FontAwesome } from '@expo/vector-icons';

// BEFORE (Microphone):
// <Ionicons name="mic" size={24} color="white" />

// AFTER (Phone):
<Ionicons name="call" size={24} color="white" />
// or
<FontAwesome name="phone" size={24} color="white" />

// Complete example of a chat input component with phone icon:
const ChatInput = ({ onSendMessage, onPhoneCall }) => {
  const [message, setMessage] = useState('');

  return (
    <View style={styles.inputContainer}>
      <TextInput
        style={styles.input}
        value={message}
        onChangeText={setMessage}
        placeholder="Type a message..."
        placeholderTextColor="#999"
      />
      
      <TouchableOpacity 
        style={styles.phoneButton}
        onPress={onPhoneCall}
      >
        <Ionicons name="call" size={24} color="white" />
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.sendButton}
        onPress={() => {
          if (message.trim()) {
            onSendMessage(message);
            setMessage('');
          }
        }}
      >
        <Ionicons name="send" size={24} color="white" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 15,
    marginRight: 10,
  },
  phoneButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ChatInput;