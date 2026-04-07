import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SecureAgent',
  description: 'Offline AI assistant with local models',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-white dark:bg-gray-900">
        {children}
      </body>
    </html>
  );
}
