'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

const steps = [
  {
    id: 1,
    title: 'Welcome to SecureAgent!',
    emoji: '🎉',
  },
  {
    id: 2,
    title: 'Connect Telegram',
    emoji: '📱',
  },
  {
    id: 3,
    title: 'Try Your First Command',
    emoji: '🚀',
  },
  {
    id: 4,
    title: "You're All Set!",
    emoji: '✨',
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [currentStep, setCurrentStep] = useState(1);
  const [telegramConnected, setTelegramConnected] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    // Set onboarding completed cookie
    document.cookie = 'onboarding_completed=true; path=/; max-age=31536000';
    router.push('/dashboard');
  };

  const handleSkip = () => {
    document.cookie = 'onboarding_completed=true; path=/; max-age=31536000';
    router.push('/dashboard');
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="max-w-lg w-full">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {steps.map((step) => (
              <div
                key={step.id}
                className={`flex items-center justify-center w-10 h-10 rounded-full text-sm font-medium transition-colors ${
                  step.id === currentStep
                    ? 'bg-blue-600 text-white'
                    : step.id < currentStep
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-800 text-gray-500'
                }`}
              >
                {step.id < currentStep ? '✓' : step.id}
              </div>
            ))}
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-600 to-cyan-600 transition-all duration-300"
              style={{ width: `${((currentStep - 1) / 3) * 100}%` }}
            />
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8">
          {/* Step 1: Welcome */}
          {currentStep === 1 && (
            <div className="text-center space-y-6">
              <div className="text-6xl mb-4">🎉</div>
              <h1 className="text-3xl font-bold text-white">
                Welcome to SecureAgent!
              </h1>
              <p className="text-gray-400 text-lg">
                Hi {session?.user?.name?.split(' ')[0] || 'there'}! You've just unlocked your personal AI assistant that actually <span className="text-blue-400 font-semibold">DOES things</span>.
              </p>
              <div className="bg-gray-800/50 rounded-xl p-6 text-left space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-green-400">✓</span>
                  <span className="text-gray-300">Schedule reminders and manage tasks</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-green-400">✓</span>
                  <span className="text-gray-300">Search the web and summarize content</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-green-400">✓</span>
                  <span className="text-gray-300">Control smart home devices</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-green-400">✓</span>
                  <span className="text-gray-300">Send messages across platforms</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Connect Telegram */}
          {currentStep === 2 && (
            <div className="text-center space-y-6">
              <div className="text-6xl mb-4">📱</div>
              <h1 className="text-3xl font-bold text-white">Connect Telegram</h1>
              <p className="text-gray-400">
                Chat with SecureAgent anytime, anywhere through Telegram.
              </p>

              <div className="bg-gray-800/50 rounded-xl p-6 space-y-4">
                {/* QR Code placeholder */}
                <div className="w-48 h-48 mx-auto bg-white rounded-xl flex items-center justify-center p-4">
                  <div className="text-center">
                    <div className="text-4xl mb-2">🤖</div>
                    <p className="text-gray-900 text-sm font-medium">@Secure_Agent_bot</p>
                  </div>
                </div>

                <a
                  href="https://t.me/Secure_Agent_bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 bg-[#0088cc] hover:bg-[#0077b5] text-white font-medium rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                  </svg>
                  Open Telegram
                </a>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                <p className="text-blue-400 text-sm">
                  <strong>Quick start:</strong> Send <code className="bg-blue-500/20 px-1.5 py-0.5 rounded">/start</code> to activate your bot
                </p>
              </div>

              <button
                onClick={() => setTelegramConnected(true)}
                className="text-gray-500 hover:text-gray-400 text-sm underline"
              >
                I'll do this later
              </button>
            </div>
          )}

          {/* Step 3: Try Commands */}
          {currentStep === 3 && (
            <div className="text-center space-y-6">
              <div className="text-6xl mb-4">🚀</div>
              <h1 className="text-3xl font-bold text-white">Try Your First Command</h1>
              <p className="text-gray-400">
                Here are some things you can ask SecureAgent:
              </p>

              <div className="space-y-3">
                <div className="bg-gray-800/50 rounded-xl p-4 text-left hover:bg-gray-800/70 transition-colors cursor-pointer group">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">"What can you do?"</p>
                      <p className="text-gray-500 text-sm">Discover all available features</p>
                    </div>
                    <span className="text-gray-600 group-hover:text-blue-400 transition-colors">→</span>
                  </div>
                </div>

                <div className="bg-gray-800/50 rounded-xl p-4 text-left hover:bg-gray-800/70 transition-colors cursor-pointer group">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">"/schedule 5m Remind me this works"</p>
                      <p className="text-gray-500 text-sm">Set a reminder in 5 minutes</p>
                    </div>
                    <span className="text-gray-600 group-hover:text-blue-400 transition-colors">→</span>
                  </div>
                </div>

                <div className="bg-gray-800/50 rounded-xl p-4 text-left hover:bg-gray-800/70 transition-colors cursor-pointer group">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">"Search for latest AI news"</p>
                      <p className="text-gray-500 text-sm">Get real-time web search results</p>
                    </div>
                    <span className="text-gray-600 group-hover:text-blue-400 transition-colors">→</span>
                  </div>
                </div>

                <div className="bg-gray-800/50 rounded-xl p-4 text-left hover:bg-gray-800/70 transition-colors cursor-pointer group">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">"Summarize this article: [URL]"</p>
                      <p className="text-gray-500 text-sm">Get quick summaries of any webpage</p>
                    </div>
                    <span className="text-gray-600 group-hover:text-blue-400 transition-colors">→</span>
                  </div>
                </div>
              </div>

              <Link
                href="/dashboard/chat"
                className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300"
              >
                Try in Dashboard Chat →
              </Link>
            </div>
          )}

          {/* Step 4: Complete */}
          {currentStep === 4 && (
            <div className="text-center space-y-6">
              <div className="text-6xl mb-4">✨</div>
              <h1 className="text-3xl font-bold text-white">You're All Set!</h1>
              <p className="text-gray-400 text-lg">
                Your AI assistant is ready to help. Start chatting in Telegram or use the web dashboard.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <a
                  href="https://t.me/Secure_Agent_bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-2 p-4 bg-gray-800/50 rounded-xl hover:bg-gray-800/70 transition-colors"
                >
                  <span className="text-3xl">📱</span>
                  <span className="text-white font-medium">Chat on Telegram</span>
                </a>
                <Link
                  href="/dashboard/chat"
                  className="flex flex-col items-center gap-2 p-4 bg-gray-800/50 rounded-xl hover:bg-gray-800/70 transition-colors"
                >
                  <span className="text-3xl">💬</span>
                  <span className="text-white font-medium">Use Web Chat</span>
                </Link>
              </div>

              <div className="pt-4">
                <button
                  onClick={handleComplete}
                  className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-medium rounded-lg transition-all"
                >
                  Go to Dashboard
                </button>
              </div>
            </div>
          )}

          {/* Navigation */}
          {currentStep < 4 && (
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-800">
              <button
                onClick={handleBack}
                disabled={currentStep === 1}
                className="px-4 py-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleSkip}
                className="text-gray-500 hover:text-gray-400 text-sm"
              >
                Skip setup
              </button>
              <button
                onClick={handleNext}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </div>

        {/* Logo */}
        <div className="text-center mt-8">
          <Link href="/" className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-400">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-xs font-bold text-white">
              S
            </div>
            <span className="text-sm">SecureAgent</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
