import { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    template: '%s | SecureAgent Blog',
    default: 'Blog | SecureAgent',
  },
  description: 'Tips, tutorials, and insights to help you get the most out of your AI assistant. Learn automation, productivity tips, and smart home control.',
  keywords: ['AI assistant', 'automation', 'productivity', 'smart home', 'tutorials', 'SecureAgent'],
  openGraph: {
    title: 'SecureAgent Blog',
    description: 'Tips, tutorials, and insights for AI-powered automation.',
    type: 'website',
    url: 'https://secureagent.vercel.app/blog',
    siteName: 'SecureAgent',
    images: [
      {
        url: '/og-blog.png',
        width: 1200,
        height: 630,
        alt: 'SecureAgent Blog',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SecureAgent Blog',
    description: 'Tips, tutorials, and insights for AI-powered automation.',
  },
  alternates: {
    canonical: 'https://secureagent.vercel.app/blog',
  },
};

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
