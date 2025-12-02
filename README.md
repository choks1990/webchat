# 💬 WebChat - Secure Chat Application

A full-stack secure chat application with web and mobile support.

## 🌐 Web App (React + Vite)

Located in `/web` directory.

### Setup
\`\`\`bash
cd web
npm install
npm run dev
\`\`\`

## 📱 Mobile App (React Native + Expo)

Located in `/mobile` directory.

### Setup
\`\`\`bash
cd mobile
npm install
npx expo start
\`\`\`

### Test on Device
1. Install Expo Go from Play Store
2. Scan QR code
3. Login with: `admin123` or `user123`

## 🔥 Firebase Setup

1. Create Firebase project at https://console.firebase.google.com
2. Enable Firestore Database
3. Download `google-services.json` for Android
4. Place in `mobile/google-services.json`
5. Update `shared/firebase/config.js` with your credentials

## 🎨 Features

- ✅ Real-time messaging
- ✅ Image sharing
- ✅ Voice messages
- ✅ Auto-delete messages
- ✅ Admin controls
- ✅ Read receipts
- ✅ Cross-platform (Web + Android + iOS)

## 🚀 Deployment

### Web
\`\`\`bash
cd web
npm run build
# Deploy dist/ to your hosting
\`\`\`

### Android APK
\`\`\`bash
cd mobile
npm install -g eas-cli
eas build --platform android
\`\`\`

## 📦 Tech Stack

**Web:**
- React + Vite
- Firebase Firestore
- Tailwind CSS
- Cloudinary

**Mobile:**
- React Native
- Expo
- Firebase
- AsyncStorage

## 🔐 Security

- Password-based authentication
- Auto-delete messages
- Secure file uploads
- Real-time sync

## 📖 Documentation

- [Web Setup](./web/README.md)
- [Mobile Setup](./mobile/README.md)
- [Firebase Config](./shared/firebase/README.md)

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Open Pull Request

## 📄 License

MIT License
\`\`\`

---

## 🔄 Step 8: Import to Expo Snack

### Option A: Via GitHub Import

1. Go to https://snack.expo.dev/
2. Click "Import" → "Import from GitHub"
3. Enter: `choks1990/webchat` (if mobile folder exists)
4. Select the `mobile` directory

### Option B: Manual Import

1. Create new Snack
2. Copy contents of `mobile/App.js`
3. Update `package.json` with dependencies
4. Add `firebase.config.js`
5. Test!

---

## 🎯 Step 9: Local Development Setup

### Terminal 1 - Web App
```bash
cd web
npm install
npm run dev
# Opens at http://localhost:5173
```

### Terminal 2 - Mobile App
```bash
cd mobile
npm install
npx expo start
# Scan QR with Expo Go
```

---

## 🔧 Step 10: Git Workflow

### Update .gitignore

Add to root `.gitignore`: