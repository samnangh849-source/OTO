# OTO Messages

A full-stack web application to receive Telegram messages and manually reply using predefined templates.

## 🚀 Setup Instructions

1. **Environment Variables:**
   Create a `.env` file based on `.env.example` and add your Telegram Bot Token and a JWT secret.
   ```env
   TELEGRAM_BOT_TOKEN="your_bot_token_here"
   JWT_SECRET="your_jwt_secret_here"
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Run the Application:**
   ```bash
   npm run dev
   ```
   This will start both the Vite frontend and the Express backend concurrently.

4. **Login:**
   - **Username:** `admin`
   - **Password:** `admin123`

## 🗄️ Database Schema (SQLite)

### `users`
- `id` (INTEGER, PRIMARY KEY)
- `username` (TEXT, UNIQUE)
- `password` (TEXT)

### `messages`
- `id` (INTEGER, PRIMARY KEY)
- `telegram_message_id` (INTEGER)
- `chat_id` (INTEGER)
- `sender_name` (TEXT)
- `type` (TEXT) - 'text', 'image', 'video', 'voice'
- `content` (TEXT)
- `timestamp` (DATETIME)
- `is_replied` (BOOLEAN)

### `templates`
- `id` (INTEGER, PRIMARY KEY)
- `name` (TEXT)
- `type` (TEXT) - 'text', 'image', 'video', 'voice'
- `content` (TEXT)
- `tags` (TEXT)

## 🔌 API Documentation

All endpoints (except login) require a Bearer token in the `Authorization` header.

### Authentication
- `POST /api/login`
  - Body: `{ username, password }`
  - Returns: `{ token }`

### Messages
- `GET /api/messages`
  - Returns: Array of message objects.

### Templates
- `GET /api/templates`
  - Returns: Array of template objects.
- `POST /api/templates`
  - Body: `{ name, type, content, tags }`
  - Returns: Created template object.
- `PUT /api/templates/:id`
  - Body: `{ name, type, content, tags }`
  - Returns: `{ success: true }`
- `DELETE /api/templates/:id`
  - Returns: `{ success: true }`

### Reply
- `POST /api/reply`
  - Body: `{ messageId, templateId }`
  - Returns: `{ success: true }`
  - Action: Sends the template content to the user via Telegram and marks the message as replied.

## 🔄 Real-time Events (Socket.io)

- `new_message`: Emitted when a new Telegram message is received.
- `message_updated`: Emitted when a message's `is_replied` status changes.
