'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import UserNav from '@/components/UserNav';

// Comprehensive Animated Chat Demo Component
const demoScenes = [
  {
    id: 'intro',
    title: 'Meet SecureAgent',
    icon: '👋',
    color: 'from-blue-500 to-cyan-500',
    messages: [
      { type: 'user', text: 'Hey SecureAgent, what can you do?' },
      { type: 'bot', text: 'I can automate tasks, control smart devices, manage social media, make calls, play music, and much more! Let me show you...' },
    ],
  },
  {
    id: 'scheduling',
    title: 'Task Scheduling',
    icon: '📅',
    color: 'from-green-500 to-emerald-500',
    messages: [
      { type: 'user', text: 'Remind me to call mom every Sunday at 10am' },
      { type: 'bot', text: '✅ Recurring reminder set: Call mom - Every Sunday at 10:00 AM' },
    ],
  },
  {
    id: 'search',
    title: 'Web Search',
    icon: '🔍',
    color: 'from-purple-500 to-violet-500',
    messages: [
      { type: 'user', text: 'What are the latest AI news today?' },
      { type: 'bot', text: '🔍 Found 5 top stories: 1) OpenAI announces GPT-5... 2) Google\'s Gemini update... [Real-time web search]' },
    ],
  },
  {
    id: 'smarthome',
    title: 'Smart Home',
    icon: '🏠',
    color: 'from-amber-500 to-orange-500',
    messages: [
      { type: 'user', text: 'Turn off all lights and set thermostat to 72°' },
      { type: 'bot', text: '🏠 Done! Turned off 6 lights. Thermostat set to 72°F. Goodnight!' },
    ],
  },
  {
    id: 'music',
    title: 'Music Control',
    icon: '🎵',
    color: 'from-pink-500 to-rose-500',
    messages: [
      { type: 'user', text: 'Play some relaxing jazz on Spotify' },
      { type: 'bot', text: '🎵 Playing "Relaxing Jazz Playlist" on Living Room speaker' },
    ],
  },
  {
    id: 'social',
    title: 'Social Media',
    icon: '📱',
    color: 'from-sky-500 to-blue-500',
    messages: [
      { type: 'user', text: 'Post to Twitter: Just launched my new app! 🚀' },
      { type: 'bot', text: '🐦 Posted to Twitter! Already 5 likes and 2 retweets' },
    ],
  },
  {
    id: 'calendar',
    title: 'Calendar',
    icon: '📆',
    color: 'from-indigo-500 to-purple-500',
    messages: [
      { type: 'user', text: 'What meetings do I have tomorrow?' },
      { type: 'bot', text: '📅 Tomorrow: 9am Team Standup, 2pm Client Call, 4pm Product Review' },
    ],
  },
  {
    id: 'calls',
    title: 'Voice Calls',
    icon: '📞',
    color: 'from-teal-500 to-cyan-500',
    messages: [
      { type: 'user', text: 'Call the restaurant and make a reservation for 7pm' },
      { type: 'bot', text: '📞 Calling Luigi\'s Italian... Reservation confirmed for 7:00 PM, party of 2' },
    ],
  },
  {
    id: 'multimodel',
    title: 'Multi-Model AI',
    icon: '🤖',
    color: 'from-violet-500 to-fuchsia-500',
    messages: [
      { type: 'user', text: 'Compare what GPT-4 and Claude think about this code' },
      { type: 'bot', text: '🤖 Running comparison... GPT-4 suggests refactoring, Claude recommends tests. See side-by-side analysis →' },
    ],
  },
  {
    id: 'proactive',
    title: 'Proactive Alerts',
    icon: '⚡',
    color: 'from-yellow-500 to-amber-500',
    messages: [
      { type: 'bot', text: '⚡ Heads up! Bitcoin dropped 5% below your target. Your Uber arrives in 3 min. Don\'t forget: Mom\'s birthday tomorrow!' },
    ],
  },
];

function AnimatedChatDemo() {
  const [currentScene, setCurrentScene] = useState(0);
  const [visibleMessages, setVisibleMessages] = useState<number[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  const scene = demoScenes[currentScene];
  const sceneDuration = 4500; // 4.5 seconds per scene

  useEffect(() => {
    if (isPaused) return;

    const timers: NodeJS.Timeout[] = [];
    setVisibleMessages([]);
    setIsTyping(false);
    setProgress(0);

    // Progress bar animation
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 2, 100));
    }, sceneDuration / 50);
    timers.push(progressInterval as unknown as NodeJS.Timeout);

    // Show messages with timing
    scene.messages.forEach((msg, index) => {
      const baseDelay = index * 1800;

      if (msg.type === 'bot') {
        const typingTimer = setTimeout(() => setIsTyping(true), baseDelay);
        timers.push(typingTimer);

        const msgTimer = setTimeout(() => {
          setIsTyping(false);
          setVisibleMessages(prev => [...prev, index]);
        }, baseDelay + 800);
        timers.push(msgTimer);
      } else {
        const msgTimer = setTimeout(() => {
          setVisibleMessages(prev => [...prev, index]);
        }, baseDelay);
        timers.push(msgTimer);
      }
    });

    // Move to next scene
    const nextSceneTimer = setTimeout(() => {
      setCurrentScene(prev => (prev + 1) % demoScenes.length);
    }, sceneDuration);
    timers.push(nextSceneTimer);

    return () => {
      timers.forEach(t => clearTimeout(t));
      clearInterval(progressInterval);
    };
  }, [currentScene, isPaused, scene.messages]);

  const goToScene = (index: number) => {
    setCurrentScene(index);
    setProgress(0);
  };

  const nextScene = () => {
    setCurrentScene(prev => (prev + 1) % demoScenes.length);
    setProgress(0);
  };

  return (
    <div
      className="absolute inset-0 top-10 flex flex-col bg-gradient-to-b from-gray-900 to-gray-950"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Scene header */}
      <div className={`flex items-center justify-between px-4 py-2 bg-gradient-to-r ${scene.color} bg-opacity-20`}>
        <div className="flex items-center gap-2">
          <span className="text-lg">{scene.icon}</span>
          <span className="text-white text-sm font-medium">{scene.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {isPaused && (
            <span className="text-xs text-white/60 bg-white/10 px-2 py-0.5 rounded">Paused</span>
          )}
          <button
            onClick={nextScene}
            className="text-white/60 hover:text-white text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors"
          >
            Skip →
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-gray-800">
        <div
          className={`h-full bg-gradient-to-r ${scene.color} transition-all duration-100`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Chat messages */}
      <div className="flex-1 p-4 overflow-hidden">
        <div className="h-full flex flex-col justify-center space-y-3">
          {scene.messages.map((msg, index) => (
            <div
              key={`${currentScene}-${index}`}
              className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'} transition-all duration-500 ${
                visibleMessages.includes(index)
                  ? 'opacity-100 translate-y-0 scale-100'
                  : 'opacity-0 translate-y-8 scale-95'
              }`}
            >
              {msg.type === 'bot' && (
                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${scene.color} flex items-center justify-center text-white text-sm font-bold mr-2 shrink-0 shadow-lg`}>
                  S
                </div>
              )}
              <div
                className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.type === 'user'
                    ? 'bg-blue-600 text-white rounded-br-md shadow-lg shadow-blue-500/20'
                    : 'bg-gray-800/80 text-gray-100 rounded-bl-md border border-gray-700/50 shadow-lg'
                }`}
              >
                {msg.text}
              </div>
              {msg.type === 'user' && (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-bold ml-2 shrink-0 shadow-lg">
                  U
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex justify-start transition-all duration-300">
              <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${scene.color} flex items-center justify-center text-white text-sm font-bold mr-2 shrink-0 shadow-lg`}>
                S
              </div>
              <div className="bg-gray-800/80 text-gray-400 px-4 py-3 rounded-2xl rounded-bl-md border border-gray-700/50">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scene indicator dots */}
      <div className="flex items-center justify-center gap-1.5 py-3 bg-gray-900/50">
        {demoScenes.map((s, index) => (
          <button
            key={s.id}
            onClick={() => goToScene(index)}
            className={`transition-all duration-300 rounded-full ${
              index === currentScene
                ? `w-6 h-2 bg-gradient-to-r ${s.color}`
                : 'w-2 h-2 bg-gray-600 hover:bg-gray-500'
            }`}
            title={s.title}
          />
        ))}
      </div>
    </div>
  );
}

// Animation variants
const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 }
};

const stagger = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

// Channel data
const channels = [
  { name: 'Telegram', icon: '✈️', status: 'active', users: '2.1K', color: 'from-blue-400 to-blue-600' },
  { name: 'Discord', icon: '🎮', status: 'active', users: '1.8K', color: 'from-indigo-400 to-indigo-600' },
  { name: 'Slack', icon: '💼', status: 'active', users: '956', color: 'from-green-400 to-green-600' },
  { name: 'Web Chat', icon: '💬', status: 'active', users: '3.2K', color: 'from-cyan-400 to-cyan-600' },
];

// Features data
const features = [
  {
    icon: '🤖',
    title: 'Multi-Model Support',
    description: 'Choose from OpenAI, Anthropic, Google, Meta Llama, DeepSeek, and 100+ models via OpenRouter. Switch models per agent or conversation.',
    gradient: 'from-violet-500 to-purple-500',
  },
  {
    icon: '🌐',
    title: 'Browser Automation',
    description: 'Navigate websites, fill forms, extract data, and take screenshots. Your AI can browse the web just like you do.',
    gradient: 'from-purple-500 to-pink-500',
  },
  {
    icon: '🔐',
    title: 'Enterprise Security',
    description: 'OWASP Top 10 compliance, Zero Trust architecture, input sanitization, and sandboxed execution.',
    gradient: 'from-green-500 to-emerald-500',
  },
  {
    icon: '🧠',
    title: 'Memory & Context',
    description: 'Persistent conversations across sessions. Your AI remembers context and learns from interactions.',
    gradient: 'from-blue-500 to-cyan-500',
  },
  {
    icon: '💰',
    title: 'Cost Control',
    description: 'Real-time cost estimation, budget limits, usage tracking, and intelligent model routing to optimize spend.',
    gradient: 'from-amber-500 to-orange-500',
  },
  {
    icon: '⚡',
    title: 'Real-time Tools',
    description: 'HTTP requests, JSON processing, data transformation, and 20+ built-in tools ready to use.',
    gradient: 'from-orange-500 to-red-500',
  },
];

// Comparison data - SecureAgent vs OpenClaw
const openclawComparison = [
  { feature: 'Setup time', openclaw: '30+ min terminal', secureAgent: '2 minutes' },
  { feature: 'Hardware needed', openclaw: 'Mac Mini ($600+)', secureAgent: 'None (cloud included)' },
  { feature: 'Monthly cost', openclaw: '$40-600 in API fees', secureAgent: '$49 flat, all included' },
  { feature: 'Works when laptop off', openclaw: 'No', secureAgent: 'Yes (cloud 24/7)' },
  { feature: 'Local/private option', openclaw: 'Yes', secureAgent: 'Yes (desktop app)' },
  { feature: 'Desktop app', openclaw: 'No native app', secureAgent: 'Available for Mac' },
  { feature: 'Support', openclaw: 'None (DIY)', secureAgent: 'Included' },
];

// Pricing data - aligned with dedicated pricing page
const pricing = [
  {
    name: 'Free',
    price: '$0',
    period: '/month',
    description: 'Try SecureAgent risk-free',
    features: [
      '5 messages/day',
      'Basic AI models',
      'Web chat access',
      'Community support',
    ],
    cta: 'Get Started',
    href: '/dashboard/chat',
    highlighted: false,
  },
  {
    name: 'Starter',
    price: '$19',
    period: '/month',
    description: 'For casual users',
    features: [
      '500 messages/day',
      'All AI models',
      '2 channels',
      'Email support',
    ],
    cta: 'Start Free Trial',
    href: '/dashboard/admin',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$49',
    period: '/month',
    description: 'For power users',
    features: [
      '2,000 messages/day',
      'Priority support',
      'All 7 channels',
      'Webhook integrations',
    ],
    cta: 'Start Free Trial',
    href: '/dashboard/admin',
    highlighted: true,
  },
  {
    name: 'Unlimited',
    price: '$199',
    period: '/month',
    description: 'For teams & agencies',
    features: [
      'Unlimited messages',
      'Dedicated support',
      'Custom integrations',
      'Phone support',
    ],
    cta: 'Start Free Trial',
    href: '/dashboard/admin',
    highlighted: false,
  },
];

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      {/* Gradient background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/20 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-purple-500/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-cyan-500/10 rounded-full blur-[120px]" />
      </div>

      {/* Launch Banner */}
      <div className="fixed top-0 left-0 right-0 z-[60] bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 text-white text-center py-2 px-4">
        <p className="text-sm font-medium">
          <span className="hidden sm:inline">Launch Special: </span>
          <span className="font-bold">50% off</span> first 3 months with code{' '}
          <code className="bg-white/20 px-2 py-0.5 rounded font-mono">PRODUCTHUNT50</code>
          <span className="hidden sm:inline"> - Limited time!</span>
        </p>
      </div>

      {/* Navigation */}
      <nav className="fixed top-8 left-0 right-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center gap-2 group">
              <svg width="35" height="40" viewBox="0 0 70 80" xmlns="http://www.w3.org/2000/svg" className="w-9 h-10">
                <defs>
                  <linearGradient id="owlGradNav" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style={{stopColor:'#00d4aa'}}/>
                    <stop offset="100%" style={{stopColor:'#00b4d8'}}/>
                  </linearGradient>
                  <linearGradient id="bodyGradNav" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style={{stopColor:'#00d4aa'}}/>
                    <stop offset="100%" style={{stopColor:'#009988'}}/>
                  </linearGradient>
                </defs>
                <ellipse cx="35" cy="45" rx="24" ry="28" fill="url(#bodyGradNav)"/>
                <ellipse cx="35" cy="52" rx="14" ry="18" fill="#0a0a0f" opacity="0.15"/>
                <ellipse cx="18" cy="18" rx="6" ry="10" fill="url(#owlGradNav)" transform="rotate(-20 18 18)"/>
                <ellipse cx="52" cy="18" rx="6" ry="10" fill="url(#owlGradNav)" transform="rotate(20 52 18)"/>
                <ellipse cx="35" cy="32" rx="18" ry="16" fill="#0a0a0f" opacity="0.2"/>
                <ellipse cx="26" cy="30" rx="8" ry="9" fill="#fff"/>
                <ellipse cx="26" cy="31" rx="5" ry="6" fill="#0a0a0f"/>
                <circle cx="24" cy="29" r="2" fill="#fff"/>
                <ellipse cx="44" cy="30" rx="8" ry="9" fill="#fff"/>
                <ellipse cx="44" cy="31" rx="5" ry="6" fill="#0a0a0f"/>
                <circle cx="42" cy="29" r="2" fill="#fff"/>
                <path d="M35 38 L32 44 L35 46 L38 44 Z" fill="#ffaa00"/>
                <path d="M12 50 Q8 45 12 38" stroke="#009977" strokeWidth="3" fill="none" strokeLinecap="round"/>
                <path d="M58 50 Q62 45 58 38" stroke="#009977" strokeWidth="3" fill="none" strokeLinecap="round"/>
                <ellipse cx="28" cy="72" rx="5" ry="3" fill="#ffaa00"/>
                <ellipse cx="42" cy="72" rx="5" ry="3" fill="#ffaa00"/>
              </svg>
              <span className="text-xl font-bold">SecureAgent</span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-400 hover:text-white transition-colors text-sm">Features</a>
              <a href="#channels" className="text-gray-400 hover:text-white transition-colors text-sm">Channels</a>
              <Link href="/pricing" className="text-gray-400 hover:text-white transition-colors text-sm">Pricing</Link>
              <a href="#download" className="text-gray-400 hover:text-white transition-colors text-sm">Download</a>
              <Link href="/docs" className="text-gray-400 hover:text-white transition-colors text-sm">API Docs</Link>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:block">
                <UserNav />
              </div>

              {/* Mobile menu button */}
              <button
                className="md:hidden p-2 text-gray-400 hover:text-white"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
                </svg>
              </button>
            </div>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-white/5">
              <div className="flex flex-col gap-4">
                <a href="#features" className="text-gray-400 hover:text-white transition-colors">Features</a>
                <a href="#channels" className="text-gray-400 hover:text-white transition-colors">Channels</a>
                <Link href="/pricing" className="text-gray-400 hover:text-white transition-colors">Pricing</Link>
                <a href="#download" className="text-gray-400 hover:text-white transition-colors">Download</a>
                <Link href="/docs" className="text-gray-400 hover:text-white transition-colors">API Docs</Link>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="text-center"
            initial="initial"
            animate="animate"
            variants={stagger}
          >
            {/* Badge */}
            <motion.div
              variants={fadeInUp}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-sm mb-8"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-gray-300">4 Channels Active</span>
              <span className="text-gray-500">•</span>
              <span className="text-gray-400">8K+ messages today</span>
            </motion.div>

            {/* Owl Mascot */}
            <motion.div variants={fadeInUp} className="mb-8">
              <svg width="70" height="80" viewBox="0 0 70 80" xmlns="http://www.w3.org/2000/svg" className="mx-auto">
                <defs>
                  <linearGradient id="owlGradHero" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style={{stopColor:'#00d4aa'}}/>
                    <stop offset="100%" style={{stopColor:'#00b4d8'}}/>
                  </linearGradient>
                  <linearGradient id="bodyGradHero" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style={{stopColor:'#00d4aa'}}/>
                    <stop offset="100%" style={{stopColor:'#009988'}}/>
                  </linearGradient>
                </defs>
                <ellipse cx="35" cy="45" rx="24" ry="28" fill="url(#bodyGradHero)"/>
                <ellipse cx="35" cy="52" rx="14" ry="18" fill="#0a0a0f" opacity="0.15"/>
                <ellipse cx="18" cy="18" rx="6" ry="10" fill="url(#owlGradHero)" transform="rotate(-20 18 18)"/>
                <ellipse cx="52" cy="18" rx="6" ry="10" fill="url(#owlGradHero)" transform="rotate(20 52 18)"/>
                <ellipse cx="35" cy="32" rx="18" ry="16" fill="#0a0a0f" opacity="0.2"/>
                <ellipse cx="26" cy="30" rx="8" ry="9" fill="#fff"/>
                <ellipse cx="26" cy="31" rx="5" ry="6" fill="#0a0a0f"/>
                <circle cx="24" cy="29" r="2" fill="#fff"/>
                <ellipse cx="44" cy="30" rx="8" ry="9" fill="#fff"/>
                <ellipse cx="44" cy="31" rx="5" ry="6" fill="#0a0a0f"/>
                <circle cx="42" cy="29" r="2" fill="#fff"/>
                <path d="M35 38 L32 44 L35 46 L38 44 Z" fill="#ffaa00"/>
                <path d="M12 50 Q8 45 12 38" stroke="#009977" strokeWidth="3" fill="none" strokeLinecap="round"/>
                <path d="M58 50 Q62 45 58 38" stroke="#009977" strokeWidth="3" fill="none" strokeLinecap="round"/>
                <ellipse cx="28" cy="72" rx="5" ry="3" fill="#ffaa00"/>
                <ellipse cx="42" cy="72" rx="5" ry="3" fill="#ffaa00"/>
              </svg>
            </motion.div>

            {/* Headline */}
            <motion.h1
              variants={fadeInUp}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6"
            >
              <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
                Your AI Assistant.
              </span>
              <br />
              <span className="text-white">
                Your Rules.
              </span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              variants={fadeInUp}
              className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10"
            >
              Run locally for complete privacy, or use our cloud. No hardware to buy, no surprise API bills.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              variants={fadeInUp}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Link
                href="/dashboard/chat"
                className="group px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 rounded-xl font-semibold text-lg transition-all hover:shadow-xl hover:shadow-blue-500/25 hover:scale-105 flex items-center justify-center gap-2"
              >
                Try Web Chat
                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <a
                href="https://github.com/Francosimon53/secureagent"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl font-semibold text-lg transition-all hover:scale-105 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                View Documentation
              </a>
            </motion.div>

            {/* Product Hunt Badge */}
            <motion.div
              variants={fadeInUp}
              className="mt-8 flex justify-center"
            >
              <a
                href="https://www.producthunt.com/posts/secureagent"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-[#DA552F] flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 40 40" fill="currentColor">
                    <path d="M20 40C31.046 40 40 31.046 40 20S31.046 0 20 0 0 8.954 0 20s8.954 20 20 20zm0-34c7.732 0 14 6.268 14 14s-6.268 14-14 14S6 27.732 6 20 12.268 6 20 6z"/>
                    <path d="M22.667 20H17v-6.667h5.667a3.333 3.333 0 010 6.667zm0-10H13.333V30H17v-6.667h5.667a6.667 6.667 0 100-13.333z"/>
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-xs text-gray-400">Featured on</p>
                  <p className="text-sm font-semibold text-white group-hover:text-orange-400 transition-colors">Product Hunt</p>
                </div>
              </a>
            </motion.div>
          </motion.div>

          {/* Demo Preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mt-20 relative"
          >
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-transparent z-10 pointer-events-none" />
            <div className="relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden shadow-2xl">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 px-4 py-3 bg-white/5 border-b border-white/10">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="px-4 py-1 bg-white/5 rounded-lg text-sm text-gray-400">
                    secureagent.vercel.app/dashboard/chat
                  </div>
                </div>
              </div>

              {/* Chat preview */}
              <div className="p-6 space-y-4 min-h-[300px]">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-sm font-bold">U</div>
                  <div className="flex-1 bg-white/5 rounded-2xl rounded-tl-none px-4 py-3 max-w-md">
                    <p className="text-gray-300">Go to Hacker News and tell me the top 3 stories</p>
                  </div>
                </div>

                <div className="flex gap-3 justify-end">
                  <div className="flex-1 bg-gradient-to-r from-blue-600/20 to-cyan-600/20 border border-blue-500/20 rounded-2xl rounded-tr-none px-4 py-3 max-w-lg">
                    <p className="text-gray-200 text-sm mb-2">Here are the top 3 stories on Hacker News:</p>
                    <ol className="text-gray-300 text-sm space-y-1 list-decimal list-inside">
                      <li>Antirender: remove glossy shine on architectural renderings</li>
                      <li>How to geolocate IPs in your CLI using latency</li>
                      <li>NASA&apos;s WB-57 crash lands at Houston</li>
                    </ol>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-sm">🤖</div>
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="px-2 py-1 bg-green-500/10 text-green-400 rounded">browser_navigate</span>
                  <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded">browser_query</span>
                  <span>executed in 2.3s</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Active Channels Section */}
      <section id="channels" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              One AI, Every Channel
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Deploy once, connect everywhere. Your AI assistant works across all major platforms.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {channels.map((channel, index) => (
              <motion.div
                key={channel.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="group relative p-6 bg-white/5 border border-white/10 rounded-2xl hover:border-white/20 transition-all hover:-translate-y-1"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${channel.color} opacity-0 group-hover:opacity-5 rounded-2xl transition-opacity`} />
                <div className="relative">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-3xl">{channel.icon}</span>
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      {channel.status}
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-1">{channel.name}</h3>
                  <p className="text-gray-400 text-sm">{channel.users} active users</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Powerful Features, Built-in
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Everything you need to build secure, capable AI assistants.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="group p-8 bg-white/5 border border-white/10 rounded-2xl hover:border-white/20 transition-all"
              >
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} mb-6`}>
                  <span className="text-2xl">{feature.icon}</span>
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{feature.title}</h3>
                <p className="text-gray-400 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Section - Why SecureAgent vs OpenClaw */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Why SecureAgent?
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              All the power of OpenClaw, none of the hassle.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden"
          >
            <div className="grid grid-cols-3 gap-4 p-4 bg-white/5 border-b border-white/10 text-sm sm:text-base font-semibold">
              <div className="text-gray-400">Feature</div>
              <div className="text-center text-gray-400">OpenClaw</div>
              <div className="text-center text-emerald-400">SecureAgent</div>
            </div>
            {openclawComparison.map((row, index) => (
              <div key={row.feature} className={`grid grid-cols-3 gap-4 p-4 text-sm sm:text-base ${index !== openclawComparison.length - 1 ? 'border-b border-white/5' : ''}`}>
                <div className="text-gray-300 font-medium">{row.feature}</div>
                <div className="text-center text-gray-500">{row.openclaw}</div>
                <div className="text-center text-emerald-400 font-medium">{row.secureAgent}</div>
              </div>
            ))}
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center text-gray-500 text-sm mt-6"
          >
            Love OpenClaw&apos;s features? Get them all with SecureAgent — no terminal, no hardware, no surprise bills.
          </motion.p>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Start free, scale as you grow. No hidden fees.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {pricing.map((tier, index) => (
              <motion.div
                key={tier.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className={`relative p-6 rounded-2xl transition-all ${
                  tier.highlighted
                    ? 'bg-gradient-to-b from-blue-600/20 to-transparent border-2 border-blue-500 scale-105'
                    : 'bg-white/5 border border-white/10 hover:border-white/20'
                }`}
              >
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-full text-xs font-semibold">
                    Most Popular
                  </div>
                )}
                <h3 className="text-xl font-semibold text-white">{tier.name}</h3>
                <div className="mt-4 mb-2">
                  <span className="text-4xl font-bold text-white">{tier.price}</span>
                  <span className="text-gray-400">{tier.period}</span>
                </div>
                <p className="text-gray-500 text-sm mb-6">{tier.description}</p>
                <ul className="space-y-3 mb-8">
                  {tier.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center gap-2 text-gray-300 text-sm">
                      <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
                {tier.href.startsWith('mailto:') ? (
                  <a
                    href={tier.href}
                    className={`block w-full py-3 rounded-xl font-semibold text-center transition-all ${
                      tier.highlighted
                        ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white'
                        : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
                    }`}
                  >
                    {tier.cta}
                  </a>
                ) : (
                  <Link
                    href={tier.href}
                    className={`block w-full py-3 rounded-xl font-semibold text-center transition-all ${
                      tier.highlighted
                        ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white'
                        : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
                    }`}
                  >
                    {tier.cta}
                  </Link>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Video Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              See SecureAgent in Action
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Watch how SecureAgent automates your daily tasks with AI.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative aspect-video rounded-2xl border border-white/10 bg-gray-900 overflow-hidden"
          >
            {/* Window chrome */}
            <div className="absolute top-0 left-0 right-0 h-10 bg-gray-800 border-b border-gray-700 flex items-center px-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <div className="flex-1 text-center">
                <span className="text-gray-400 text-sm font-medium">SecureAgent Chat</span>
              </div>
            </div>

            {/* Animated Chat Demo */}
            <AnimatedChatDemo />
          </motion.div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              What Users Are Saying
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Join thousands of users automating their workflows with SecureAgent.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                quote: "Finally, an AI that actually does things! The browser automation alone saved me hours of manual work.",
                author: "Alex K.",
                role: "Product Manager",
                avatar: "A",
              },
              {
                quote: "I set up a morning briefing that runs automatically. It's like having a personal assistant that never sleeps.",
                author: "Sarah M.",
                role: "Startup Founder",
                avatar: "S",
              },
              {
                quote: "The multi-channel support is a game changer. Same AI on Telegram, Slack, and web - conversations sync perfectly.",
                author: "Mike R.",
                role: "Developer",
                avatar: "M",
              },
            ].map((testimonial, index) => (
              <motion.div
                key={testimonial.author}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-6 bg-white/5 border border-white/10 rounded-2xl"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                    </svg>
                  ))}
                </div>
                <p className="text-gray-300 mb-6 leading-relaxed">&quot;{testimonial.quote}&quot;</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center font-semibold">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <p className="font-semibold text-white">{testimonial.author}</p>
                    <p className="text-sm text-gray-500">{testimonial.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Download Section */}
      <section id="download" className="py-20 px-4 sm:px-6 lg:px-8 bg-white/[0.02]">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-sm mb-6">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span className="text-emerald-400">100% Private &amp; Offline</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Run locally for complete privacy
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Download SecureAgent Desktop — works offline with Ollama. Your data never leaves your machine.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid sm:grid-cols-3 gap-4"
          >
            {/* macOS Download */}
            <a
              href="https://github.com/Francosimon53/secureagent/releases/latest/download/SecureAgent_1.0.0_aarch64.dmg"
              className="group relative p-6 bg-white/5 border border-white/10 rounded-2xl hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all text-center"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity" />
              <div className="relative">
                <svg className="w-12 h-12 mx-auto mb-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                <h3 className="text-lg font-semibold text-white mb-1">Download for Mac</h3>
                <p className="text-sm text-gray-400 mb-3">Apple Silicon (M1/M2/M3)</p>
                <span className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg font-medium transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download .dmg
                </span>
              </div>
            </a>

            {/* Windows Coming Soon */}
            <div className="relative p-6 bg-white/5 border border-white/10 rounded-2xl text-center opacity-60">
              <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
              </svg>
              <h3 className="text-lg font-semibold text-gray-400 mb-1">Windows</h3>
              <p className="text-sm text-gray-500 mb-3">x64 &amp; ARM</p>
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 text-gray-400 rounded-lg font-medium">
                Coming Soon
              </span>
            </div>

            {/* Linux Coming Soon */}
            <div className="relative p-6 bg-white/5 border border-white/10 rounded-2xl text-center opacity-60">
              <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.4v.019c.002.089.008.179.02.267-.193-.067-.438-.135-.607-.202a1.635 1.635 0 01-.018-.2v-.02a1.772 1.772 0 01.15-.768c.082-.22.232-.406.43-.533a.985.985 0 01.594-.2zm-2.962.059h.036c.142 0 .27.048.399.135.146.129.264.288.344.465.09.199.14.4.153.667l.002.034.001.168-.001.002v.006l-.004.025a1.956 1.956 0 01-.168.768 1.15 1.15 0 01-.053.087c-.072-.045-.134-.09-.2-.135-.078-.046-.158-.135-.238-.199a1.482 1.482 0 00-.083-.166.785.785 0 00.053-.132c.033-.1.049-.2.049-.303v-.003a1.164 1.164 0 00-.053-.333c-.03-.089-.072-.178-.133-.2h-.001a.569.569 0 00-.195-.066h-.02a.317.317 0 00-.191.066c-.059.022-.1.11-.133.199a1.145 1.145 0 00-.053.333v.003c0 .066.005.133.015.199a1.31 1.31 0 01-.201.07c-.146.049-.293.135-.393.2a.076.076 0 00-.003-.025v-.002a1.773 1.773 0 01.135-.768c.082-.178.2-.345.345-.465.142-.09.284-.135.426-.135zm2.654 2.946c.067 0 .133.002.2.006a.703.703 0 01.3.097c.105.049.191.135.25.199a.83.83 0 01.108.133c-.105.088-.2.2-.287.333l-.017.025c-.09.132-.15.2-.217.333-.105.2-.182.4-.22.6-.033.134-.049.268-.049.4 0 .2.033.4.1.6.066.2.166.4.29.533.127.2.277.333.454.466.175.132.367.2.566.2.133 0 .266-.035.4-.066.135-.034.267-.1.384-.2a.907.907 0 00.165-.165c.04-.066.073-.1.1-.132.09-.066.2-.1.3-.1.034 0 .066.002.1.006a.961.961 0 01.26.065c.09.033.166.1.24.2.076.099.137.199.165.332.063.195.09.39.09.59 0 .2-.03.4-.106.598a1.257 1.257 0 01-.303.466c-.119.132-.265.2-.432.3-.166.1-.354.134-.532.2-.183.066-.366.1-.566.1a1.4 1.4 0 01-.566-.1 2.25 2.25 0 01-.465-.2c-.203-.127-.364-.265-.5-.466a2.24 2.24 0 01-.232-.466 1.99 1.99 0 01-.1-.598v-.003c0-.2.03-.4.09-.6a1.35 1.35 0 01.266-.497c-.14-.15-.273-.347-.387-.5a2.404 2.404 0 01-.265-.565 2.07 2.07 0 01-.1-.667v-.02c0-.2.033-.4.1-.598.066-.2.158-.4.283-.533.124-.166.287-.3.466-.4.188-.1.389-.166.598-.2.07-.002.13-.002.2-.002z"/>
              </svg>
              <h3 className="text-lg font-semibold text-gray-400 mb-1">Linux</h3>
              <p className="text-sm text-gray-500 mb-3">AppImage &amp; .deb</p>
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 text-gray-400 rounded-lg font-medium">
                Coming Soon
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mt-8 text-center"
          >
            <p className="text-gray-500 text-sm">
              Requires <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">Ollama</a> for local AI models.
              <span className="text-gray-600 mx-2">•</span>
              <a href="https://github.com/Francosimon53/secureagent/releases" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
                View all releases
              </a>
            </p>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto text-center"
        >
          <div className="relative p-12 rounded-3xl bg-gradient-to-br from-blue-600/20 via-cyan-600/10 to-transparent border border-white/10 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.1),transparent_50%)]" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Ready to Get Started?
              </h2>
              <p className="text-lg text-gray-400 mb-8 max-w-xl mx-auto">
                Deploy your own AI assistant in minutes. No credit card required for the free tier.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/dashboard/chat"
                  className="px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 rounded-xl font-semibold text-lg transition-all hover:shadow-xl hover:shadow-blue-500/25 hover:scale-105"
                >
                  Try Web Chat Free
                </Link>
                <a
                  href="#download"
                  className="px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-semibold text-lg transition-all hover:scale-105 flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Desktop App
                </a>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <Link href="/" className="flex items-center gap-2 mb-4">
                <svg width="32" height="36" viewBox="0 0 70 80" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="owlGradFooter" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" style={{stopColor:'#00d4aa'}}/>
                      <stop offset="100%" style={{stopColor:'#00b4d8'}}/>
                    </linearGradient>
                    <linearGradient id="bodyGradFooter" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" style={{stopColor:'#00d4aa'}}/>
                      <stop offset="100%" style={{stopColor:'#009988'}}/>
                    </linearGradient>
                  </defs>
                  <ellipse cx="35" cy="45" rx="24" ry="28" fill="url(#bodyGradFooter)"/>
                  <ellipse cx="35" cy="52" rx="14" ry="18" fill="#0a0a0f" opacity="0.15"/>
                  <ellipse cx="18" cy="18" rx="6" ry="10" fill="url(#owlGradFooter)" transform="rotate(-20 18 18)"/>
                  <ellipse cx="52" cy="18" rx="6" ry="10" fill="url(#owlGradFooter)" transform="rotate(20 52 18)"/>
                  <ellipse cx="35" cy="32" rx="18" ry="16" fill="#0a0a0f" opacity="0.2"/>
                  <ellipse cx="26" cy="30" rx="8" ry="9" fill="#fff"/>
                  <ellipse cx="26" cy="31" rx="5" ry="6" fill="#0a0a0f"/>
                  <circle cx="24" cy="29" r="2" fill="#fff"/>
                  <ellipse cx="44" cy="30" rx="8" ry="9" fill="#fff"/>
                  <ellipse cx="44" cy="31" rx="5" ry="6" fill="#0a0a0f"/>
                  <circle cx="42" cy="29" r="2" fill="#fff"/>
                  <path d="M35 38 L32 44 L35 46 L38 44 Z" fill="#ffaa00"/>
                  <path d="M12 50 Q8 45 12 38" stroke="#009977" strokeWidth="3" fill="none" strokeLinecap="round"/>
                  <path d="M58 50 Q62 45 58 38" stroke="#009977" strokeWidth="3" fill="none" strokeLinecap="round"/>
                  <ellipse cx="28" cy="72" rx="5" ry="3" fill="#ffaa00"/>
                  <ellipse cx="42" cy="72" rx="5" ry="3" fill="#ffaa00"/>
                </svg>
                <span className="text-xl font-bold">SecureAgent</span>
              </Link>
              <p className="text-gray-500 text-sm">
                OpenClaw power with zero complexity.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#channels" className="hover:text-white transition-colors">Channels</a></li>
                <li><Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
                <li><Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Resources</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><Link href="/blog" className="hover:text-white transition-colors">Blog</Link></li>
                <li><Link href="/docs" className="hover:text-white transition-colors">API Docs</Link></li>
                <li><a href="mailto:support@secureagent.dev" className="hover:text-white transition-colors">Support</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Connect</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="https://t.me/Secure_Agent_bot" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors flex items-center gap-1">Telegram Bot <span className="text-green-400 text-xs">✓ Live</span></a></li>
                <li><span className="text-gray-500 flex items-center gap-1">Discord <span className="text-amber-400 text-xs">(Coming Soon)</span></span></li>
                <li><span className="text-gray-500 flex items-center gap-1">Slack Integration <span className="text-amber-400 text-xs">(Coming Soon)</span></span></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-gray-500 text-sm">
              &copy; {new Date().getFullYear()} SecureAgent. MIT License.
            </p>
            <div className="flex gap-4">
              <a
                href="https://t.me/Secure_Agent_bot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
