// Shared business logic for both web and mobile

export const createMessage = (text, sender, type = 'text') => ({
  text,
  sender,
  type,
  timestamp: Date.now(),
  status: 'sent',
  id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
});

export const formatTime = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const shouldDeleteMessage = (messageTimestamp, autoDeleteDays) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - autoDeleteDays);
  return messageTimestamp < cutoffDate.getTime();
};