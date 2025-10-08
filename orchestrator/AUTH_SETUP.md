# Authentication and User Management Setup

This document describes the authentication and role-based access control system added to the wwebjs orchestrator.

## Features

### Authentication
- JWT-based authentication with refresh tokens
- Secure password hashing using bcrypt
- Automatic token refresh on expiration
- Session management

### Role-Based Access Control
- **Admin Role**: Full access to all features and data
  - Can see all instances and templates from all users
  - Can manage users (create, edit, delete, activate/deactivate)
  - Can access system settings and metrics
  - Can create global templates

- **User Role**: Limited access to own resources
  - Can only see and manage their own instances
  - Can see global templates and their own templates
  - Cannot access user management or system settings
  - Cannot see other users' data

### User Management
- User registration and profile management
- Admin can create, edit, and delete users
- User activation/deactivation
- Password reset functionality

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP
);
```

### Updated Tables
- **instances**: Added `user_id` foreign key, unique constraint on `(name, user_id)`
- **templates**: Added `user_id` foreign key (nullable for global templates), unique constraint on `(name, user_id)`

## API Endpoints

### Authentication Routes (`/api/auth`)
- `POST /login` - User login
- `POST /register` - User registration
- `POST /refresh` - Refresh access token
- `GET /me` - Get current user info
- `PUT /profile` - Update user profile
- `POST /logout` - User logout

### User Management Routes (`/api/users`) - Admin Only
- `GET /` - List all users
- `GET /:id` - Get user by ID
- `POST /` - Create new user
- `PUT /:id` - Update user
- `DELETE /:id` - Delete user
- `GET /:id/instances` - Get user's instances

### Protected Routes
All existing routes now require authentication:
- `/api/instances` - Instance management (ownership-based access)
- `/api/templates` - Template management (ownership-based access)
- `/api/metrics` - Metrics (ownership-based access)
- `/api/settings` - Settings (admin only)

## Environment Variables

Add these to your `.env` file:

```env
# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Default Admin User
DEFAULT_ADMIN_EMAIL=admin@orchestrator.local
DEFAULT_ADMIN_PASSWORD=admin123
```

## Setup Instructions

### 1. Install Dependencies
The required dependencies are already included in package.json:
- `bcrypt` - Password hashing
- `jsonwebtoken` - JWT token handling

### 2. Run Migration
Run the migration script to add user authentication to existing database:

```bash
cd orchestrator/backend
node src/migrations/add-user-auth.js
```

### 3. Update Environment
Copy the new environment variables from `env.example` to your `.env` file and update the JWT secret.

### 4. Start the Application
The application will automatically create a default admin user on first run if none exists.

## Default Credentials

- **Username**: `admin`
- **Password**: `admin123` (or value from `DEFAULT_ADMIN_PASSWORD`)
- **Email**: `admin@orchestrator.local` (or value from `DEFAULT_ADMIN_EMAIL`)

**Important**: Change the default admin password after first login!

## Frontend Changes

### New Components
- `LoginModal` - User login interface
- `UserManagement` - Admin interface for managing users
- Updated `Layout` - Shows user info and logout button
- Updated `App` - Handles authentication state

### Authentication Flow
1. User visits the application
2. If not authenticated, login modal is shown
3. After successful login, JWT tokens are stored in localStorage
4. API requests automatically include the JWT token
5. Tokens are automatically refreshed when they expire
6. User can logout to clear tokens and return to login screen

## Security Considerations

### JWT Security
- Use a strong, unique JWT secret in production
- Tokens have reasonable expiration times (24h access, 7d refresh)
- Refresh tokens are rotated on each use

### Password Security
- Passwords are hashed using bcrypt with salt rounds
- Minimum password length of 6 characters (configurable)
- No password storage in plain text

### Access Control
- All API routes require authentication
- Ownership checks prevent users from accessing others' resources
- Admin-only routes are properly protected
- Database foreign key constraints ensure data integrity

## Usage Examples

### Creating a New User (Admin)
```javascript
const response = await apiClient.post('/users', {
  username: 'newuser',
  email: 'user@example.com',
  password: 'securepassword',
  role: 'user'
});
```

### User Login
```javascript
const response = await apiClient.post('/auth/login', {
  username: 'admin',
  password: 'admin123'
});

// Store tokens
localStorage.setItem('token', response.data.token);
localStorage.setItem('refreshToken', response.data.refreshToken);
```

### Creating an Instance (User)
```javascript
// Only the authenticated user can see this instance
const response = await apiClient.post('/instances', {
  name: 'my-instance',
  description: 'My WhatsApp instance',
  config: { /* instance config */ }
});
```

## Migration from Existing Setup

If you have an existing orchestrator installation:

1. **Backup your database** before running the migration
2. Run the migration script to add user authentication
3. All existing instances and templates will be assigned to the default admin user
4. Update your environment variables
5. Restart the application
6. Login with the default admin credentials
7. Create additional users as needed
8. Optionally reassign instances to appropriate users

## Troubleshooting

### Migration Issues
- Ensure PostgreSQL is running and accessible
- Check database connection string in environment variables
- Verify user has necessary database permissions

### Authentication Issues
- Check JWT secret is set in environment variables
- Verify token expiration settings
- Clear localStorage if experiencing token issues

### Access Issues
- Verify user role and permissions
- Check instance/template ownership
- Ensure user account is active

## Future Enhancements

Potential improvements for the authentication system:

1. **Password Reset**: Email-based password reset functionality
2. **Two-Factor Authentication**: TOTP-based 2FA
3. **OAuth Integration**: Login with Google, GitHub, etc.
4. **Audit Logging**: Track user actions and changes
5. **Session Management**: Active session monitoring and revocation
6. **API Keys**: Alternative authentication for API access
7. **Team Management**: Organization-based access control