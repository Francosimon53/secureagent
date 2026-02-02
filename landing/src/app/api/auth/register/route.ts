import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';

// In-memory user store (shared with NextAuth route in production, use a database)
const users: Array<{
  id: string;
  name: string;
  email: string;
  password: string;
}> = [
  {
    id: '1',
    name: 'Demo User',
    email: 'demo@secureagent.ai',
    password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.q4HJwHYKt1WHGS', // "demo123"
  },
];

export async function POST(request: NextRequest) {
  try {
    const { name, email, password } = await request.json();

    // Validation
    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Name, email, and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = users.find((u) => u.email === email);
    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    // Hash password and create user
    const hashedPassword = await hash(password, 12);
    const newUser = {
      id: String(users.length + 1),
      name,
      email,
      password: hashedPassword,
    };
    users.push(newUser);

    return NextResponse.json(
      {
        success: true,
        message: 'Account created successfully',
        user: { id: newUser.id, name: newUser.name, email: newUser.email },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'An error occurred during registration' },
      { status: 500 }
    );
  }
}
