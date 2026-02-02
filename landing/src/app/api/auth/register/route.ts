import { NextRequest, NextResponse } from 'next/server';
import { createUser, findUserByEmail, getUserCount } from '@/lib/users';

export async function POST(request: NextRequest) {
  try {
    const { name, email, password } = await request.json();

    console.log(`[Register] Attempting to register: ${email}`);
    console.log(`[Register] Current user count: ${getUserCount()}`);

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

    // Check if user exists using shared store
    const existingUser = findUserByEmail(email);
    if (existingUser) {
      console.log(`[Register] User already exists: ${email}`);
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    // Create user using shared store
    const newUser = await createUser(name, email, password);

    console.log(`[Register] Successfully created user: ${newUser.email}`);
    console.log(`[Register] New user count: ${getUserCount()}`);

    return NextResponse.json(
      {
        success: true,
        message: 'Account created successfully',
        user: { id: newUser.id, name: newUser.name, email: newUser.email },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Register] Error:', error);
    const message = error instanceof Error ? error.message : 'An error occurred during registration';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
