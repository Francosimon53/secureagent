import { hash, compare } from 'bcryptjs';

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  image?: string;
  createdAt: Date;
}

// Shared in-memory user store (persists across requests in serverless environment)
// In production, replace with a proper database (PostgreSQL, MongoDB, etc.)
const users: Map<string, User> = new Map();

// Initialize with demo user
const DEMO_USER: User = {
  id: '1',
  name: 'Demo User',
  email: 'demo@secureagent.ai',
  password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.q4HJwHYKt1WHGS', // "demo123"
  createdAt: new Date('2024-01-01'),
};

// Add demo user on module load
if (!users.has(DEMO_USER.email)) {
  users.set(DEMO_USER.email, DEMO_USER);
}

/**
 * Find a user by email
 */
export function findUserByEmail(email: string): User | undefined {
  return users.get(email.toLowerCase());
}

/**
 * Find a user by ID
 */
export function findUserById(id: string): User | undefined {
  for (const user of users.values()) {
    if (user.id === id) {
      return user;
    }
  }
  return undefined;
}

/**
 * Create a new user
 */
export async function createUser(
  name: string,
  email: string,
  password: string
): Promise<User> {
  const normalizedEmail = email.toLowerCase();

  // Check if user already exists
  if (users.has(normalizedEmail)) {
    throw new Error('User already exists with this email');
  }

  // Hash the password
  const hashedPassword = await hash(password, 12);

  // Create new user
  const newUser: User = {
    id: String(Date.now()), // Use timestamp as simple ID
    name,
    email: normalizedEmail,
    password: hashedPassword,
    createdAt: new Date(),
  };

  // Save to store
  users.set(normalizedEmail, newUser);

  console.log(`[Users] Created new user: ${normalizedEmail}`);
  console.log(`[Users] Total users: ${users.size}`);

  return newUser;
}

/**
 * Verify user credentials
 */
export async function verifyCredentials(
  email: string,
  password: string
): Promise<User | null> {
  const normalizedEmail = email.toLowerCase();
  const user = users.get(normalizedEmail);

  console.log(`[Users] Login attempt for: ${normalizedEmail}`);
  console.log(`[Users] User found: ${!!user}`);
  console.log(`[Users] Total users in store: ${users.size}`);

  if (!user) {
    return null;
  }

  const isValid = await compare(password, user.password);
  console.log(`[Users] Password valid: ${isValid}`);

  if (!isValid) {
    return null;
  }

  return user;
}

/**
 * Get all users (for debugging)
 */
export function getAllUsers(): User[] {
  return Array.from(users.values());
}

/**
 * Get user count
 */
export function getUserCount(): number {
  return users.size;
}
