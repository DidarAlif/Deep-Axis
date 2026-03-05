# 🍽️ Mess Manager — Deep Axis

A professional, secure, and dynamic mess management application for tracking meals, bazar costs, rent, and member balances. Built for precision and ease of use.

## 🔗 Live Deployment
🚀 **Access the App Here**: [https://didaralif.github.io/Deep-Axis/](https://didaralif.github.io/Deep-Axis/)

---

## ✨ Key Features

### 🔒 Secure Authentication
- **Role-Based Access**: Dedicated views for Members and the Administrator (ALIF).
- **Session Management**: Secure login and logout flows.
- **Access Protection**: Sensitive data (Rent/History) is protected by admin-level security.

### ✅ Peer-Review Verification System
- **Dual-Verification**: Records require sign-off from both a Member (Peer) and the Admin (ALIF).
- **Self-Verification Guard**: Members cannot verify their own records; entries must be verified by others to ensure accuracy.
- **48-Hour Window**: Verification is only permitted within a 48-hour window from the date of entry.
- **Auto-Locking**: Once fully verified, records are locked against further modification.

### 📸 Member Photo Icons & 3D Animations
- **Personalized Avatars**: Personalized photo icons for all mess members.
- **3D Flip Effect**: Hover over any member icon to see a smooth 3D flip animation revealing their name.
- **Perfect Cropping**: Uses `object-fit: cover` for a high-quality, professional look.

### 📊 Dynamic Dashboard & Real-time Insights
- **SVG Trend Charts**: Visualizes meal rate history to track performance.
- **Real-time Totals**: Automatic calculation of "Gets Back" and "Owes" statuses.
- **Toast Notifications**: Instant feedback on every action (save, verify, error).
- **Day/Night Mode**: Theme-aware design for any environment.

### ⚙️ Management & Data Security
- **Admin Tab**: Management of user passwords and system settings.
- **Management Tab**: 
  - **Backups**: Export the entire system state to JSON.
  - **Restore**: Easily import backups to recover data.
  - **Reset**: Safe administrative system reset options.
  - **Member Control**: Add or remove mess members on the fly.

---

## 🏗️ Technology Stack
- **Frontend**: Vanilla JavaScript (ES6+), Modern HTML5, CSS3 (Glassmorphism, 3D Transforms).
- **Storage**: Browser `localStorage` and `sessionStorage` for zero-server persistence.
- **Timezone**: Hardcoded to **Bangladesh Standard Time (UTC+6)** for accurate record locking.

---

## 🚀 How to Use
1. **Login**: Select your name from the dropdown and enter your password.
2. **Track Meals**: Enter your daily meal count in the **Meals** tab.
3. **Log Bazar**: Record your grocery spending in the **Bazar** tab.
4. **Verify**: Check the icons! 
   - Click **'U'** on a peer's row to verify their record.
   - Wait for **'A'** (Admin) to perform the final check.
5. **Monitor**: Check the **Dashboard** to see who owes what in real-time.

---

## 👨‍💻 Developer
Developed with precision for **Alif-Deep Axis Mess**. 
Built by **Antigravity AI**.

---
*Note: This application is designed to work offline and maintains all data in your browser's local storage.*
