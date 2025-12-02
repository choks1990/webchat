import { cloudinaryConfig } from '../firebase/config';

export const uploadToCloudinary = async (fileOrBlob, resourceType = 'auto', platform = 'web') => {
  const formData = new FormData();
  
  if (platform === 'mobile') {
    // React Native format
    formData.append('file', {
      uri: fileOrBlob,
      type: 'image/jpeg',
      name: 'upload.jpg',
    });
  } else {
    // Web format
    formData.append('file', fileOrBlob);
  }
  
  formData.append('upload_preset', cloudinaryConfig.uploadPreset);

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/${resourceType}/upload`,
      { method: 'POST', body: formData }
    );
    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error('Upload failed:', error);
    return null;
  }
};