'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

const TOTAL_STEPS = 6;

const channels = [
  { id: 'telegram', name: 'Telegram', icon: '📱', recommended: true, description: 'Chat anywhere on your phone' },
  { id: 'web', name: 'Web Dashboard', icon: '🌐', recommended: false, description: 'Full control from your browser' },
  { id: 'slack', name: 'Slack', icon: '💼', recommended: false, description: 'Integrated with your workspace' },
  { id: 'discord', name: 'Discord', icon: '🎮', recommended: false, description: 'For your server' },
  { id: 'whatsapp', name: 'WhatsApp', icon: '📱', recommended: false, description: 'Your everyday messenger' },
];

const integrations = [
  { id: 'notion', name: 'Notion', icon: '📝', description: 'Manage notes and databases', connected: false },
  { id: 'gmail', name: 'Gmail', icon: '📧', description: 'Read and send emails', connected: false },
  { id: 'calendar', name: 'Google Calendar', icon: '📅', description: 'Schedule meetings', connected: false },
  { id: 'trello', name: 'Trello', icon: '✅', description: 'Manage tasks', connected: false },
  { id: 'twitter', name: 'Twitter/X', icon: '🐦', description: 'Auto-post updates', connected: false },
  { id: 'linkedin', name: 'LinkedIn', icon: '💼', description: 'Professional networking', connected: false },
  { id: 'smarthome', name: 'Smart Home', icon: '💡', description: 'Control lights, thermostat', connected: false },
  { id: 'spotify', name: 'Spotify', icon: '🎵', description: 'Control your music', connected: false },
];

const plans = [
  { id: 'free', name: 'Free', price: '$0', period: '', messages: '5 messages/day', description: 'Basic models', popular: false },
  { id: 'starter', name: 'Starter', price: '$19', period: '/mo', messages: '500 messages/day', description: 'All models', popular: false },
  { id: 'pro', name: 'Pro', price: '$49', period: '/mo', messages: '2,000 messages/day', description: 'Priority support', popular: true },
  { id: 'power', name: 'Power', price: '$99', period: '/mo', messages: '5,000 messages/day', description: 'API access', popular: false },
];

const demoMessages = [
  { type: 'suggestion', text: 'What can you do?' },
  { type: 'suggestion', text: 'Remind me to drink water in 5 minutes' },
  { type: 'suggestion', text: "What's the weather today?" },
];

const tips = [
  "Try: 'Schedule a daily news summary at 9am'",
  "Try: 'Monitor Bitcoin price and alert me if it drops below $50k'",
  "Try: 'Summarize my unread emails'",
  "Try: 'Post to Twitter: Just launched my new project!'",
  "Try: 'Turn off all the lights in the living room'",
];

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedChannel, setSelectedChannel] = useState('telegram');
  const [selectedPlan, setSelectedPlan] = useState('free');
  const [connectedApps, setConnectedApps] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentTip, setCurrentTip] = useState(0);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Rotate tips
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTip((prev) => (prev + 1) % tips.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleNext = () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    document.cookie = 'onboarding_completed=true; path=/; max-age=31536000';
    router.push('/dashboard');
  };

  const handleSkip = () => {
    document.cookie = 'onboarding_completed=true; path=/; max-age=31536000';
    router.push('/dashboard');
  };

  const toggleApp = (appId: string) => {
    setConnectedApps((prev) =>
      prev.includes(appId) ? prev.filter((id) => id !== appId) : [...prev, appId]
    );
  };

  const handleDemoChat = async (message: string) => {
    setChatMessages((prev) => [...prev, { role: 'user', text: message }]);
    setChatInput('');
    setIsTyping(true);

    // Simulate AI response
    await new Promise((resolve) => setTimeout(resolve, 1500));

    let response = '';
    if (message.toLowerCase().includes('what can you do')) {
      response = "I can do a LOT! Here's a quick overview:\n\n" +
        "📅 Schedule tasks & reminders\n" +
        "🔍 Search the web in real-time\n" +
        "📧 Read and send emails\n" +
        "📱 Post to social media\n" +
        "🏠 Control smart home devices\n" +
        "📞 Make phone calls\n" +
        "🎵 Control your music\n" +
        "📊 Analyze data and documents\n\n" +
        "Just tell me what you need!";
    } else if (message.toLowerCase().includes('remind') || message.toLowerCase().includes('water')) {
      response = "✅ Got it! I've set a reminder:\n\n" +
        "⏰ **Reminder scheduled**\n" +
        "📝 'Drink water'\n" +
        "⏱️ In 5 minutes\n\n" +
        "I'll ping you on Telegram when it's time!";
    } else if (message.toLowerCase().includes('weather')) {
      response = "🌤️ **Weather in San Francisco**\n\n" +
        "Currently: 68°F (20°C)\n" +
        "Condition: Partly Cloudy\n" +
        "High: 72°F | Low: 58°F\n" +
        "Humidity: 65%\n\n" +
        "Perfect day to go outside!";
    } else {
      response = "I understand! I can help you with that. In the full version, I'd process this request and take action for you.";
    }

    setIsTyping(false);
    setChatMessages((prev) => [...prev, { role: 'assistant', text: response }]);
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-8">
      <div className="max-w-2xl w-full">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm text-gray-500">Step {currentStep} of {TOTAL_STEPS}</span>
            <button onClick={handleSkip} className="text-sm text-gray-500 hover:text-gray-400">
              Skip setup
            </button>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-600 to-cyan-600 transition-all duration-500"
              style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 min-h-[500px]">

          {/* Step 1: Welcome */}
          {currentStep === 1 && (
            <div className="text-center space-y-6">
              <div className="text-6xl mb-2">🎉</div>
              <h1 className="text-3xl font-bold text-white">
                Welcome to SecureAgent!
              </h1>
              <p className="text-xl text-gray-400">
                Your AI assistant that actually <span className="text-blue-400 font-semibold">DOES things</span> — not just talks
              </p>

              {/* Animated Feature Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
                {[
                  { icon: '🤖', label: '25+ AI Models', sub: 'GPT-4, Claude, Gemini...' },
                  { icon: '📱', label: 'Multi-Platform', sub: 'Telegram, Slack, Discord...' },
                  { icon: '⏰', label: 'Auto-Scheduling', sub: 'Tasks & reminders' },
                  { icon: '🔌', label: 'App Integrations', sub: 'Connect everything' },
                ].map((feature, i) => (
                  <div
                    key={i}
                    className="p-4 bg-gray-800/50 rounded-xl border border-gray-700 hover:border-blue-500/50 transition-colors"
                  >
                    <div className="text-2xl mb-2">{feature.icon}</div>
                    <div className="text-sm font-medium text-white">{feature.label}</div>
                    <div className="text-xs text-gray-500">{feature.sub}</div>
                  </div>
                ))}
              </div>

              {/* What's Different */}
              <div className="bg-gradient-to-r from-blue-600/10 to-cyan-600/10 border border-blue-500/20 rounded-xl p-6 mt-6">
                <h3 className="text-lg font-semibold text-white mb-4">What makes SecureAgent different?</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left">
                  {[
                    { icon: '🏠', text: 'Controls your smart home' },
                    { icon: '📱', text: 'Posts to social media for you' },
                    { icon: '📞', text: 'Can make phone calls' },
                    { icon: '📧', text: 'Manages your emails' },
                    { icon: '🎵', text: 'Controls your music' },
                    { icon: '📊', text: 'Analyzes your data' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xl">{item.icon}</span>
                      <span className="text-gray-300 text-sm">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Choose Channel */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="text-5xl mb-4">💬</div>
                <h1 className="text-2xl font-bold text-white">How do you want to chat?</h1>
                <p className="text-gray-400 mt-2">Choose your main way to interact with SecureAgent</p>
              </div>

              <div className="grid gap-3 mt-6">
                {channels.map((channel) => (
                  <button
                    key={channel.id}
                    onClick={() => setSelectedChannel(channel.id)}
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                      selectedChannel === channel.id
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                  >
                    <span className="text-3xl">{channel.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{channel.name}</span>
                        {channel.recommended && (
                          <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400">{channel.description}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedChannel === channel.id ? 'border-blue-500 bg-blue-500' : 'border-gray-600'
                    }`}>
                      {selectedChannel === channel.id && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                        </svg>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* Telegram Setup */}
              {selectedChannel === 'telegram' && (
                <div className="bg-[#0088cc]/10 border border-[#0088cc]/30 rounded-xl p-6 mt-4">
                  <div className="flex items-start gap-4">
                    <div className="w-24 h-24 bg-white rounded-xl flex items-center justify-center flex-shrink-0">
                      <div className="text-center">
                        <div className="text-3xl">🤖</div>
                        <p className="text-xs text-gray-600 font-medium mt-1">@Secure_Agent_bot</p>
                      </div>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-white mb-2">Connect on Telegram</h4>
                      <p className="text-sm text-gray-400 mb-3">
                        Open the bot and send <code className="bg-gray-800 px-1.5 py-0.5 rounded">/start</code> to activate
                      </p>
                      <a
                        href="https://t.me/Secure_Agent_bot"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-[#0088cc] hover:bg-[#0077b5] text-white font-medium rounded-lg transition-colors"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                        </svg>
                        Open Telegram
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Connect Apps */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="text-5xl mb-4">🔌</div>
                <h1 className="text-2xl font-bold text-white">Connect Your Apps</h1>
                <p className="text-gray-400 mt-2">Make SecureAgent even more powerful (optional)</p>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-6">
                {integrations.map((app) => (
                  <button
                    key={app.id}
                    onClick={() => toggleApp(app.id)}
                    className={`flex items-center gap-3 p-4 rounded-xl border transition-all text-left ${
                      connectedApps.includes(app.id)
                        ? 'border-green-500 bg-green-500/10'
                        : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                  >
                    <span className="text-2xl">{app.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white text-sm">{app.name}</div>
                      <p className="text-xs text-gray-500 truncate">{app.description}</p>
                    </div>
                    {connectedApps.includes(app.id) ? (
                      <span className="text-green-400 text-xs">✓ Added</span>
                    ) : (
                      <span className="text-gray-500 text-xs">+ Add</span>
                    )}
                  </button>
                ))}
              </div>

              <p className="text-center text-sm text-gray-500 mt-4">
                You can always connect more apps later in Settings
              </p>
            </div>
          )}

          {/* Step 4: Try It Out */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-4xl mb-2">🚀</div>
                <h1 className="text-2xl font-bold text-white">Try It Out!</h1>
                <p className="text-gray-400 mt-1 text-sm">See SecureAgent in action</p>
              </div>

              {/* Chat Demo */}
              <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
                {/* Chat Messages */}
                <div className="h-64 overflow-y-auto p-4 space-y-3">
                  {chatMessages.length === 0 && (
                    <div className="text-center text-gray-500 py-8">
                      <p className="mb-4">Try one of these commands:</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {demoMessages.map((msg, i) => (
                          <button
                            key={i}
                            onClick={() => handleDemoChat(msg.text)}
                            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-full transition-colors"
                          >
                            {msg.text}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] p-3 rounded-xl text-sm whitespace-pre-wrap ${
                          msg.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-gray-200'
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-gray-700 text-gray-200 p-3 rounded-xl text-sm">
                        <span className="flex gap-1">
                          <span className="animate-bounce">●</span>
                          <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>●</span>
                          <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Chat Input */}
                <div className="border-t border-gray-700 p-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && chatInput && handleDemoChat(chatInput)}
                      placeholder="Type a message..."
                      className="flex-1 bg-gray-700 border-none rounded-lg px-4 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => chatInput && handleDemoChat(chatInput)}
                      disabled={!chatInput}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>

              {chatMessages.length > 0 && (
                <div className="flex justify-center gap-2 flex-wrap">
                  {demoMessages.filter(m => !chatMessages.some(cm => cm.text === m.text)).map((msg, i) => (
                    <button
                      key={i}
                      onClick={() => handleDemoChat(msg.text)}
                      className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs rounded-full transition-colors"
                    >
                      {msg.text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 5: Choose Plan */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="text-5xl mb-4">💎</div>
                <h1 className="text-2xl font-bold text-white">Choose Your Plan</h1>
                <p className="text-gray-400 mt-2">Start free, upgrade anytime</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                      selectedPlan === plan.id
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                  >
                    {plan.popular && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                        Popular
                      </span>
                    )}
                    <div className="text-xl font-bold text-white">
                      {plan.price}<span className="text-sm font-normal text-gray-400">{plan.period}</span>
                    </div>
                    <div className="font-medium text-white mt-1">{plan.name}</div>
                    <div className="text-xs text-gray-400 mt-1">{plan.messages}</div>
                    <div className="text-xs text-gray-500 mt-2">{plan.description}</div>
                  </button>
                ))}
              </div>

              <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 rounded-xl p-4 text-center">
                <p className="text-yellow-400 font-medium">
                  🎉 Get 50% off with code <code className="bg-yellow-500/20 px-2 py-0.5 rounded">LAUNCH50</code>
                </p>
              </div>
            </div>
          )}

          {/* Step 6: Complete */}
          {currentStep === 6 && (
            <div className="text-center space-y-6">
              <div className="text-6xl mb-2">✨</div>
              <h1 className="text-3xl font-bold text-white">You're Ready!</h1>
              <p className="text-gray-400 text-lg">
                Your AI assistant is ready to help
              </p>

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-4 mt-6">
                <Link
                  href="/dashboard"
                  className="flex flex-col items-center gap-2 p-6 bg-gradient-to-br from-blue-600/20 to-cyan-600/20 border border-blue-500/30 rounded-xl hover:border-blue-500/50 transition-colors"
                >
                  <span className="text-3xl">🖥️</span>
                  <span className="text-white font-medium">Go to Dashboard</span>
                </Link>
                <a
                  href="https://t.me/Secure_Agent_bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-2 p-6 bg-gray-800/50 border border-gray-700 rounded-xl hover:border-gray-600 transition-colors"
                >
                  <span className="text-3xl">📱</span>
                  <span className="text-white font-medium">Open Telegram Bot</span>
                </a>
                <Link
                  href="/docs"
                  className="flex flex-col items-center gap-2 p-6 bg-gray-800/50 border border-gray-700 rounded-xl hover:border-gray-600 transition-colors"
                >
                  <span className="text-3xl">📚</span>
                  <span className="text-white font-medium">Read Documentation</span>
                </Link>
                <Link
                  href="/dashboard/chat"
                  className="flex flex-col items-center gap-2 p-6 bg-gray-800/50 border border-gray-700 rounded-xl hover:border-gray-600 transition-colors"
                >
                  <span className="text-3xl">💬</span>
                  <span className="text-white font-medium">Start Chatting</span>
                </Link>
              </div>

              {/* Tips Carousel */}
              <div className="bg-gray-800/50 rounded-xl p-4 mt-4">
                <p className="text-sm text-gray-400 mb-2">💡 Pro tip:</p>
                <p className="text-white font-medium transition-all duration-500">
                  {tips[currentTip]}
                </p>
              </div>

              <button
                onClick={handleComplete}
                className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold rounded-xl transition-all text-lg"
              >
                Let's Go! →
              </button>
            </div>
          )}

          {/* Navigation */}
          {currentStep < 6 && (
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-800">
              <button
                onClick={handleBack}
                disabled={currentStep === 1}
                className="px-4 py-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                ← Back
              </button>
              <div className="flex gap-1">
                {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i + 1 === currentStep ? 'bg-blue-500' : i + 1 < currentStep ? 'bg-blue-500/50' : 'bg-gray-700'
                    }`}
                  />
                ))}
              </div>
              <button
                onClick={handleNext}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
              >
                {currentStep === 5 ? 'Start Free' : 'Next →'}
              </button>
            </div>
          )}
        </div>

        {/* Logo */}
        <div className="text-center mt-6">
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
