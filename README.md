# 💬 WebChat - Secure Cross-Platform Chat Application

A full-stack, secure, and cross-platform chat application built as a monorepo solution for both web and mobile environments. This project leverages modern web technologies and Firebase for real-time communication and data persistence.

## ✨ Key Features

The WebChat application is designed with security and user experience in mind, offering a robust set of features:

*   **Real-time Messaging**: Instantaneous message delivery using Firebase Firestore.
*   **Cross-Platform Support**: Unified experience across **Web** (React + Vite) and **Mobile** (React Native + Expo).
*   **Media Sharing**: Support for **Image Sharing** and **Voice Messages** via Cloudinary integration.
*   **Disappearing Messages**: **Auto-delete messages** feature based on a configurable time limit for enhanced privacy.
*   **User Roles**: Distinct **Admin controls** for managing settings and messages.
*   **Message Status**: **Read receipts** to track message delivery and viewing.
*   **Security**: Implements **Password-based authentication** and **Secure file uploads**.

## 📦 Technology Stack

The project is structured as a monorepo, utilizing a shared Firebase configuration and distinct technology stacks for the client applications.

| Component | Primary Technologies | Key Libraries/Services |
| :--- | :--- | :--- |
| **Web App** | React, Vite, JavaScript | Firebase Firestore, Tailwind CSS, Cloudinary |
| **Mobile App** | React Native, Expo | Firebase, AsyncStorage |
| **Backend/DB** | Firebase | Firestore, Authentication |

## 🚀 Getting Started

Follow these steps to set up and run the project locally.

### 1. Firebase Configuration

The application relies on Firebase for its backend services.

1.  Create a new Firebase project via the [Firebase Console](https://console.firebase.google.com/).
2.  **Enable Firestore Database** in your project.
3.  For the **Web App**, update the configuration in `shared/firebase/config.js` with your project credentials.
4.  For the **Mobile App**, download the `google-services.json` file (for Android) and place it in the `mobile/` directory.

### 2. Web App Setup

The web application is located in the `/web` directory.

```bash
cd web
npm install
npm run dev
# The application will typically open at http://localhost:5173
```

### 3. Mobile App Setup

The mobile application is located in the `/mobile` directory and uses Expo.

```bash
cd mobile
npm install
npx expo start
```

To test on a physical device:
1.  Install the **Expo Go** app from the Play Store or App Store.
2.  Scan the QR code displayed in your terminal or browser.
3.  Use the default credentials for testing: `admin123` or `user123`.

## 🛠️ Deployment

### Web Deployment

To create a production build of the web application:

```bash
cd web
npm run build
# The production-ready files will be generated in the `dist/` directory.
# Deploy the contents of `dist/` to your preferred static hosting service (e.g., Vercel, Netlify, Firebase Hosting).
```

### Android APK Deployment

To build a standalone Android application package (APK):

```bash
cd mobile
npm install -g eas-cli
eas build --platform android
# Follow the prompts from the Expo Application Services (EAS) CLI.
```

## 🤝 Contributing

We welcome contributions to the WebChat project. To contribute:

1.  Fork the repository.
2.  Create a new feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

## 📄 License

Distributed under the **MIT License**. See the `LICENSE` file (if available) for more information.

***

Made with ❤️ by choks1990

⭐ Star this repo if you find it helpful!

For questions or feedback, open an issue on GitHub.
