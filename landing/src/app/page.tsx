'use client';

import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import UserNav from '@/components/UserNav';

// ===== SCROLL REVEAL HOOK =====
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reveals = el.querySelectorAll('.reveal');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    reveals.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return ref;
}

// ===== SECTION VISIBILITY HOOK =====
function useSectionVisible() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -20px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

// ===== CHAT ANIMATION COMPONENT =====
function AnimatedChat() {
  const [visibleMsgs, setVisibleMsgs] = useState<number[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const animatedRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !animatedRef.current) {
            animatedRef.current = true;
            [0, 1, 2, 3].forEach((i) => {
              setTimeout(() => setVisibleMsgs((prev) => [...prev, i]), i * 400);
            });
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const messages = [
    {
      type: 'user',
      content:
        'Session with J.M., 3yo. DTT manding, 15/20 correct. Escape during transitions.',
    },
    {
      type: 'ai',
      content: 'session-note',
    },
    {
      type: 'user',
      content: '/auth status',
    },
    {
      type: 'ai',
      content: 'auth-status',
    },
  ];

  return (
    <div
      className="relative opacity-0 animate-[heroVisual_1s_.5s_cubic-bezier(.16,1,.3,1)_forwards]"
    >
      {/* Glow effects */}
      <div className="absolute -top-10 -right-10 w-[300px] h-[300px] rounded-full bg-[radial-gradient(circle,var(--teal-glow),transparent_70%)] blur-[40px] z-0 animate-[glowPulse_4s_ease-in-out_infinite]" />
      <div className="absolute -bottom-[30px] -left-[30px] w-[200px] h-[200px] rounded-full bg-[radial-gradient(circle,rgba(217,119,6,.12),transparent_70%)] blur-[30px] z-0" />

      {/* Terminal window */}
      <div className="bg-[var(--navy)] rounded-[20px] shadow-[0_40px_80px_rgba(15,23,42,.25),0_0_0_1px_rgba(255,255,255,.05)_inset] relative z-10 overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-5 py-3.5 bg-white/[.03] border-b border-white/[.06]">
          <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
          <div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
          <div className="w-3 h-3 rounded-full bg-[#28C840]" />
          <div className="flex-1 text-center text-xs text-white/30 font-medium">
            SecureAgent — Telegram
          </div>
        </div>

        {/* Chat body */}
        <div ref={containerRef} className="p-6">
          {/* Chat header */}
          <div className="flex items-center gap-3 pb-[18px] border-b border-white/[.06] mb-[18px]">
            <div className="w-[42px] h-[42px] rounded-[13px] bg-gradient-to-br from-[var(--teal)] to-[var(--teal-dark)] flex items-center justify-center text-xl shadow-[0_4px_12px_var(--teal-glow)]">
              🤖
            </div>
            <div>
              <div className="text-white font-semibold text-[.95rem]">
                SecureAgent
              </div>
              <div className="text-[var(--teal-light)] text-[.73rem] flex items-center gap-[5px]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--teal-light)]" />
                Online — Encrypted Channel
              </div>
            </div>
          </div>

          {/* Messages */}
          {messages.map((msg, i) => {
            const isVisible = visibleMsgs.includes(i);
            if (msg.type === 'user') {
              return (
                <div
                  key={i}
                  className="py-[14px] px-[18px] rounded-2xl mb-3 max-w-[88%] text-[.84rem] leading-relaxed ml-auto bg-[rgba(13,148,136,.12)] text-white/90 rounded-br-[4px] transition-all duration-500"
                  style={{
                    opacity: isVisible ? 1 : 0,
                    transform: isVisible
                      ? 'translateY(0)'
                      : 'translateY(12px)',
                  }}
                >
                  {msg.content}
                </div>
              );
            }

            if (msg.content === 'session-note') {
              return (
                <div
                  key={i}
                  className="py-[14px] px-[18px] rounded-2xl mb-3 max-w-[88%] text-[.84rem] leading-relaxed bg-white/[.05] text-white/85 rounded-bl-[4px] border border-white/[.04] transition-all duration-500"
                  style={{
                    opacity: isVisible ? 1 : 0,
                    transform: isVisible
                      ? 'translateY(0)'
                      : 'translateY(12px)',
                  }}
                >
                  <strong className="text-[var(--teal-light)]">
                    📋 Session Note Generated
                  </strong>
                  <br />
                  <br />
                  <div className="flex justify-between py-1 border-b border-white/[.04] text-[.82rem]">
                    <span>Client</span>
                    <span className="text-white">J.M. (3y)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/[.04] text-[.82rem]">
                    <span>Target</span>
                    <span className="text-white">Manding — DTT</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/[.04] text-[.82rem]">
                    <span>Data</span>
                    <span className="text-white">75% correct (15/20) ↑</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/[.04] text-[.82rem]">
                    <span>Behavior</span>
                    <span className="text-white">Escape — transitions</span>
                  </div>
                  <div className="flex justify-between py-1 text-[.82rem]">
                    <span>CPT</span>
                    <span className="text-white">97153</span>
                  </div>
                  <span className="inline-block mt-2 px-2 py-0.5 rounded-md text-[.7rem] font-semibold bg-[rgba(22,163,74,.15)] text-[#4ADE80]">
                    ✓ Ready for review
                  </span>
                </div>
              );
            }

            // auth-status
            return (
              <div
                key={i}
                className="py-[14px] px-[18px] rounded-2xl mb-3 max-w-[88%] text-[.84rem] leading-relaxed bg-white/[.05] text-white/85 rounded-bl-[4px] border border-white/[.04] transition-all duration-500"
                style={{
                  opacity: isVisible ? 1 : 0,
                  transform: isVisible
                    ? 'translateY(0)'
                    : 'translateY(12px)',
                }}
              >
                <strong className="text-[var(--teal-light)]">
                  ⚠️ 2 authorizations expiring soon
                </strong>
                <br />
                <br />
                <div className="flex justify-between py-1 border-b border-white/[.04] text-[.82rem]">
                  <span>J.M. — UHC</span>
                  <span className="text-[var(--amber-light)]">
                    Expires Mar 1 (14d)
                  </span>
                </div>
                <div className="flex justify-between py-1 text-[.82rem]">
                  <span>A.R. — Aetna</span>
                  <span className="text-[var(--amber-light)]">
                    85% hours used
                  </span>
                </div>
                <span className="inline-block mt-2 px-2 py-0.5 rounded-md text-[.7rem] font-semibold bg-[rgba(217,119,6,.15)] text-[var(--amber-light)]">
                  Generate re-auth letter?
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ===== STAT COUNTER COMPONENT =====
function StatCounter({
  target,
  suffix,
  prefix,
  label,
  started,
}: {
  target: number;
  suffix: string;
  prefix: string;
  label: string;
  started: boolean;
}) {
  const [display, setDisplay] = useState(prefix + '0' + suffix);
  const animated = useRef(false);

  useEffect(() => {
    if (!started || animated.current) return;
    animated.current = true;
    let current = 0;
    const increment = target / 40;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      setDisplay(prefix + Math.ceil(current) + suffix);
    }, 30);
    return () => clearInterval(timer);
  }, [started, target, suffix, prefix]);

  return (
    <div className="text-center">
      <div className="font-serif text-[2.6rem] font-bold text-[var(--teal)] leading-none">
        {display}
      </div>
      <div
        className="text-[.82rem] text-[var(--slate)] mt-1.5"
        dangerouslySetInnerHTML={{ __html: label }}
      />
    </div>
  );
}

// ===== SOCIAL PROOF SECTION =====
function SocialProofSection() {
  const { ref: statsRef, visible: statsVisible } = useSectionVisible();

  return (
    <section className="bg-white border-t border-b border-[rgba(15,23,42,.04)]">
      <div className="max-w-[1240px] mx-auto py-[100px] px-10 text-center max-[768px]:px-6">
        <div className="reveal">
          <p className="font-serif text-[1.8rem] italic text-[var(--navy)] max-w-[700px] mx-auto mb-6 leading-[1.5] tracking-tight relative max-[768px]:text-[1.4rem]">
            <span className="absolute -top-5 -left-[30px] text-[5rem] text-[var(--teal)] opacity-15 not-italic leading-none select-none">
              &ldquo;
            </span>
            Finally, an AI tool I can actually use with patient data without
            losing sleep over compliance.
          </p>
          <p className="text-[.9rem] text-[var(--slate)]">
            <strong className="text-[var(--navy)]">— BCBA</strong>, ABA
            Agency Owner, Southwest Florida
          </p>
        </div>

        <div
          ref={statsRef}
          className="reveal flex justify-center gap-16 mt-14 flex-wrap max-[768px]:gap-8"
        >
          <StatCounter
            target={6}
            suffix="+"
            prefix=""
            label="Hours saved per week<br>on documentation"
            started={statsVisible}
          />
          <StatCounter
            target={95}
            suffix="%"
            prefix=""
            label="% insurance approval rate<br>on generated pre-auths"
            started={statsVisible}
          />
          <StatCounter
            target={2}
            suffix=""
            prefix="<"
            label="Minutes to generate<br>a session note"
            started={statsVisible}
          />
          <StatCounter
            target={100}
            suffix="%"
            prefix=""
            label="% of PHI encrypted<br>at rest and in transit"
            started={statsVisible}
          />
        </div>
      </div>
    </section>
  );
}

// ===== MAIN PAGE =====
export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);
  const revealRef = useScrollReveal();

  // Cursor glow
  const glowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let mouseX = 0,
      mouseY = 0,
      glowX = 0,
      glowY = 0;
    const handleMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    document.addEventListener('mousemove', handleMove);
    let raf: number;
    const animate = () => {
      glowX += (mouseX - glowX) * 0.08;
      glowY += (mouseY - glowY) * 0.08;
      if (glowRef.current) {
        glowRef.current.style.left = glowX + 'px';
        glowRef.current.style.top = glowY + 'px';
      }
      raf = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      document.removeEventListener('mousemove', handleMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Nav scroll
  useEffect(() => {
    const handleScroll = () => setNavScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Smooth anchor scroll
  const handleAnchorClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      if (href.startsWith('#')) {
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setMobileMenuOpen(false);
      }
    },
    []
  );

  return (
    <div ref={revealRef} className="min-h-screen bg-[var(--bg)] text-[var(--navy)] overflow-x-hidden">
      {/* Cursor glow */}
      <div ref={glowRef} className="cursor-glow" />

      {/* ===== NAV ===== */}
      <nav
        className={`fixed top-0 w-full z-[1000] transition-all duration-[400ms] ${
          navScrolled
            ? 'backdrop-blur-[20px] saturate-[1.8] bg-[rgba(250,251,252,.88)] shadow-[0_1px_0_rgba(15,23,42,.06)]'
            : ''
        }`}
      >
        <div
          className={`max-w-[1240px] mx-auto flex items-center justify-between transition-all ${
            navScrolled ? 'px-10 py-3.5' : 'px-10 py-5'
          }`}
        >
          <Link
            href="/"
            className="flex items-center gap-3 no-underline hover:scale-[1.02] transition-transform"
          >
            <div className="w-[38px] h-[38px] bg-gradient-to-br from-[var(--teal)] to-[var(--teal-dark)] rounded-[11px] flex items-center justify-center relative overflow-hidden">
              <span className="text-white font-extrabold text-[17px] z-10">
                S
              </span>
              <div className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] bg-[conic-gradient(from_0deg,transparent,rgba(255,255,255,.2),transparent)] animate-[shimmer_3s_linear_infinite]" />
            </div>
            <span className="font-bold text-[1.15rem] text-[var(--navy)] tracking-tight">
              SecureAgent
            </span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-2">
            <a
              href="#features"
              onClick={(e) => handleAnchorClick(e, '#features')}
              className="text-[var(--slate)] text-[.88rem] font-medium px-4 py-2 rounded-[10px] no-underline hover:text-[var(--navy)] hover:bg-[rgba(15,23,42,.04)] transition-all"
            >
              Features
            </a>
            <a
              href="#compare"
              onClick={(e) => handleAnchorClick(e, '#compare')}
              className="text-[var(--slate)] text-[.88rem] font-medium px-4 py-2 rounded-[10px] no-underline hover:text-[var(--navy)] hover:bg-[rgba(15,23,42,.04)] transition-all"
            >
              Why Us
            </a>
            <a
              href="#pricing"
              onClick={(e) => handleAnchorClick(e, '#pricing')}
              className="text-[var(--slate)] text-[.88rem] font-medium px-4 py-2 rounded-[10px] no-underline hover:text-[var(--navy)] hover:bg-[rgba(15,23,42,.04)] transition-all"
            >
              Pricing
            </a>
            <UserNav />
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center gap-3 md:hidden">
            <UserNav />
            <button
              className="p-2 text-[var(--slate)] hover:text-[var(--navy)]"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={
                    mobileMenuOpen
                      ? 'M6 18L18 6M6 6l12 12'
                      : 'M4 6h16M4 12h16M4 18h16'
                  }
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden px-10 pb-4 flex flex-col gap-3 bg-white/90 backdrop-blur-lg border-t border-[rgba(15,23,42,.06)]">
            <a
              href="#features"
              onClick={(e) => handleAnchorClick(e, '#features')}
              className="text-[var(--slate)] hover:text-[var(--navy)] py-2 no-underline transition-colors"
            >
              Features
            </a>
            <a
              href="#compare"
              onClick={(e) => handleAnchorClick(e, '#compare')}
              className="text-[var(--slate)] hover:text-[var(--navy)] py-2 no-underline transition-colors"
            >
              Why Us
            </a>
            <a
              href="#pricing"
              onClick={(e) => handleAnchorClick(e, '#pricing')}
              className="text-[var(--slate)] hover:text-[var(--navy)] py-2 no-underline transition-colors"
            >
              Pricing
            </a>
          </div>
        )}
      </nav>

      {/* ===== HERO ===== */}
      <section className="min-h-screen flex items-center pt-[120px] pb-20 px-10 max-w-[1240px] mx-auto relative">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center w-full">
          {/* Hero text */}
          <div>
            <div className="inline-flex items-center gap-2.5 py-[7px] pl-2 pr-[18px] bg-[rgba(13,148,136,.06)] border border-[rgba(13,148,136,.12)] rounded-full text-[.78rem] font-semibold text-[var(--teal)] mb-7 opacity-0 animate-[fadeDown_.6s_.2s_cubic-bezier(.16,1,.3,1)_forwards]">
              <span className="w-2 h-2 rounded-full bg-[var(--green)] relative">
                <span className="absolute inset-[-3px] rounded-full bg-[var(--green)] opacity-40 animate-[ping_2s_cubic-bezier(0,0,.2,1)_infinite]" />
              </span>
              HIPAA-Compliant AI for ABA Therapy
            </div>

            <h1 className="font-serif text-[3.8rem] leading-[1.08] font-bold text-[var(--navy)] mb-6 tracking-tight opacity-0 animate-[heroText_.8s_.35s_cubic-bezier(.16,1,.3,1)_forwards] max-[1024px]:text-[3rem] max-[768px]:text-[2.4rem]">
              <span className="block">Built by BCBAs,</span>
              <span className="block">
                <em className="italic text-[var(--teal)] font-medium">
                  for BCBAs.
                </em>
              </span>
            </h1>

            <p className="text-[1.15rem] text-[var(--slate)] leading-[1.75] mb-9 max-w-[500px] opacity-0 animate-[heroText_.8s_.5s_cubic-bezier(.16,1,.3,1)_forwards]">
              The AI assistant that understands your clinical practice. Session
              notes, pre-authorizations, parent training summaries — all from
              Telegram, all HIPAA-compliant.
            </p>

            <div className="flex gap-3.5 items-center mb-12 opacity-0 animate-[heroText_.8s_.65s_cubic-bezier(.16,1,.3,1)_forwards] flex-wrap">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 bg-[var(--teal)] text-white py-3.5 px-[30px] rounded-xl font-semibold text-[.95rem] no-underline shadow-[0_2px_12px_var(--teal-glow),0_0_0_0_var(--teal-glow)] hover:-translate-y-0.5 hover:shadow-[0_6px_24px_var(--teal-glow),0_0_0_4px_rgba(13,148,136,.08)] active:translate-y-0 transition-all duration-300"
              >
                Start 14-Day Free Trial →
              </Link>
              <a
                href="https://t.me/Secure_Agent_bot"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 border-[1.5px] border-[rgba(15,23,42,.15)] text-[var(--navy)] bg-transparent py-[13px] px-[26px] rounded-xl font-semibold text-[.95rem] no-underline hover:border-[var(--teal)] hover:text-[var(--teal)] hover:bg-[rgba(13,148,136,.03)] transition-all duration-300"
              >
                Try on Telegram
              </a>
            </div>

            <div className="flex gap-5 flex-wrap opacity-0 animate-[heroText_.8s_.8s_cubic-bezier(.16,1,.3,1)_forwards]">
              <div className="flex items-center gap-[7px] text-[.8rem] text-[var(--slate)] font-medium">
                <span className="text-xs">🛡️</span> HIPAA Compliant
              </div>
              <div className="flex items-center gap-[7px] text-[.8rem] text-[var(--slate)] font-medium">
                <span className="text-xs">📋</span> BAA Included
              </div>
              <div className="flex items-center gap-[7px] text-[.8rem] text-[var(--slate)] font-medium">
                <span className="text-xs">🔐</span> Zero Data Retention
              </div>
            </div>
          </div>

          {/* Hero visual */}
          <div className="hidden lg:block">
            <AnimatedChat />
          </div>
        </div>
      </section>

      {/* ===== TRUST BAR ===== */}
      <div className="reveal border-t border-b border-[rgba(15,23,42,.04)] bg-white py-10 px-10 relative z-10">
        <div className="max-w-[1240px] mx-auto flex justify-center gap-14 flex-wrap">
          {[
            {
              icon: '🛡️',
              text: 'HIPAA Compliant',
              sub: 'AES-256 Encryption',
              bg: 'bg-[rgba(13,148,136,.08)]',
            },
            {
              icon: '🔐',
              text: 'BAA Included',
              sub: 'All plans',
              bg: 'bg-[rgba(217,119,6,.08)]',
            },
            {
              icon: '🚫',
              text: 'Zero Data Retention',
              sub: 'PHI never stored in LLM',
              bg: 'bg-[rgba(124,58,237,.08)]',
            },
            {
              icon: '📋',
              text: 'Audit Logs',
              sub: '6-year retention',
              bg: 'bg-[rgba(22,163,74,.08)]',
            },
          ].map((item) => (
            <div
              key={item.text}
              className="flex items-center gap-3.5 group"
            >
              <div
                className={`w-12 h-12 rounded-[14px] flex items-center justify-center text-[22px] transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 ${item.bg}`}
              >
                {item.icon}
              </div>
              <div>
                <div className="text-[.88rem] font-semibold text-[var(--navy)]">
                  {item.text}
                </div>
                <div className="text-[.76rem] text-[var(--slate-light)]">
                  {item.sub}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== FEATURES ===== */}
      <section
        id="features"
        className="py-[120px] px-10 max-w-[1240px] mx-auto relative z-10 max-[768px]:py-20 max-[768px]:px-6"
      >
        <div className="reveal">
          <div className="inline-flex items-center gap-2 text-[.76rem] font-bold text-[var(--teal)] uppercase tracking-[.1em] mb-4">
            <span className="w-6 h-0.5 bg-[var(--teal)] rounded" />
            Clinical Skills
          </div>
          <h2 className="font-serif text-[2.8rem] font-bold text-[var(--navy)] mb-4 tracking-tight leading-[1.15] max-[768px]:text-[2rem]">
            Everything your agency needs.
            <br />
            Nothing{' '}
            <em className="italic text-[var(--teal)] font-medium">
              it doesn&apos;t.
            </em>
          </h2>
          <p className="text-[1.08rem] text-[var(--slate)] max-w-[540px] leading-[1.75] mb-16">
            Every feature designed by a BCBA who runs an ABA agency. This
            isn&apos;t a generic chatbot with a HIPAA badge slapped on.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            {
              icon: '📝',
              title: 'Session Notes in Seconds',
              desc: 'Dictate or type on Telegram. Get formatted clinical notes with CPT codes, trial data, and recommendations. English and Spanish.',
              tag: 'BCBA + RBT',
              iconBg: 'bg-[rgba(13,148,136,.08)]',
              tagBg: 'bg-[rgba(13,148,136,.07)]',
              tagColor: 'text-[var(--teal)]',
              delay: 'reveal-delay-1',
            },
            {
              icon: '📋',
              title: 'Insurance Pre-Auth Assistant',
              desc: 'Automatic authorization tracking. Alerts 30 days before expiration. Generates re-auth letters and denial appeals.',
              tag: 'SAVES 6+ HRS/WEEK',
              iconBg: 'bg-[rgba(217,119,6,.08)]',
              tagBg: 'bg-[rgba(217,119,6,.07)]',
              tagColor: 'text-[var(--amber)]',
              delay: 'reveal-delay-2',
            },
            {
              icon: '👨‍👩‍👧',
              title: 'Parent Training Summaries',
              desc: 'Generate bilingual (EN/ES) summaries after every parent training session. Perfect for Hispanic families in your practice.',
              tag: 'BILINGUAL',
              iconBg: 'bg-[rgba(124,58,237,.08)]',
              tagBg: 'bg-[rgba(124,58,237,.07)]',
              tagColor: 'text-[var(--purple)]',
              delay: 'reveal-delay-3',
            },
            {
              icon: '📊',
              title: 'Behavior Plan Drafts',
              desc: 'AI-assisted FBA and BIP generation. Input observation data, receive a draft with functional hypotheses and intervention strategies.',
              tag: 'BCBA ONLY',
              iconBg: 'bg-[rgba(22,163,74,.08)]',
              tagBg: 'bg-[rgba(22,163,74,.07)]',
              tagColor: 'text-[var(--green)]',
              delay: 'reveal-delay-1',
            },
            {
              icon: '🔒',
              title: 'Compliance Dashboard',
              desc: 'Real-time compliance score. Automated verification of encryption, audit logs, BAA, and team training. Powered by VLayer.',
              tag: 'AGENCY OWNER',
              iconBg: 'bg-[rgba(220,38,38,.08)]',
              tagBg: 'bg-[rgba(13,148,136,.07)]',
              tagColor: 'text-[var(--teal)]',
              delay: 'reveal-delay-2',
            },
            {
              icon: '💬',
              title: 'Works Where You Are',
              desc: 'Telegram, WhatsApp, and web dashboard. Access between sessions from your phone. No laptop needed.',
              tag: 'MULTI-CHANNEL',
              iconBg: 'bg-[rgba(59,130,246,.08)]',
              tagBg: 'bg-[rgba(13,148,136,.07)]',
              tagColor: 'text-[var(--teal)]',
              delay: 'reveal-delay-3',
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className={`reveal ${feature.delay} feature-card group bg-white border border-[rgba(15,23,42,.05)] rounded-2xl py-9 px-8 transition-all duration-[400ms] relative overflow-hidden cursor-default hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(13,148,136,.08)] hover:border-[rgba(13,148,136,.12)]`}
            >
              <div className="feature-card-bar" />
              <div
                className={`w-[52px] h-[52px] rounded-[14px] flex items-center justify-center text-[26px] mb-[22px] transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-[5deg] ${feature.iconBg}`}
              >
                {feature.icon}
              </div>
              <h3 className="font-sans text-[1.05rem] font-bold text-[var(--navy)] mb-2.5">
                {feature.title}
              </h3>
              <p className="text-[.86rem] text-[var(--slate)] leading-[1.65]">
                {feature.desc}
              </p>
              <span
                className={`inline-block mt-4 py-1 px-3 rounded-lg text-[.7rem] font-bold tracking-[.03em] ${feature.tagBg} ${feature.tagColor}`}
              >
                {feature.tag}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ===== COMPARISON (DARK SECTION) ===== */}
      <section
        id="compare"
        className="bg-[var(--navy)] py-[120px] px-10 relative overflow-hidden z-10 max-[768px]:py-20 max-[768px]:px-6"
      >
        {/* Decorative glows */}
        <div className="absolute -top-[200px] -right-[200px] w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(13,148,136,.08),transparent_70%)]" />
        <div className="absolute -bottom-[200px] -left-[200px] w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,rgba(124,58,237,.05),transparent_70%)]" />

        <div className="max-w-[1240px] mx-auto relative z-10">
          <div className="reveal">
            <div className="inline-flex items-center gap-2 text-[.76rem] font-bold text-[var(--teal-light)] uppercase tracking-[.1em] mb-4">
              <span className="w-6 h-0.5 bg-[var(--teal)] rounded" />
              Why SecureAgent
            </div>
            <h2 className="font-serif text-[2.8rem] font-bold text-white mb-4 tracking-tight leading-[1.15] max-[768px]:text-[2rem]">
              Your ABA agency{' '}
              <em className="italic text-[var(--teal)] font-medium">
                can&apos;t
              </em>{' '}
              use OpenClaw.
            </h2>
            <p className="text-[1.08rem] text-[var(--slate-light)] max-w-[540px] leading-[1.75] mb-16">
              OpenClaw is great for developers. But Cisco, Snyk, and Palo Alto
              Networks flagged it as a &quot;security nightmare.&quot; Healthcare
              needs something different.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Bad - Generic AI */}
            <div className="reveal reveal-delay-1 rounded-[20px] py-10 px-9 bg-[rgba(220,38,38,.06)] border border-[rgba(220,38,38,.1)] relative overflow-hidden">
              <div className="flex items-center gap-3 mb-7">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-[22px] bg-[rgba(220,38,38,.1)]">
                  ❌
                </div>
                <h3 className="font-sans text-[1.15rem] font-bold text-[#FCA5A5]">
                  Generic AI Assistants
                </h3>
              </div>
              {[
                'No HIPAA compliance — $50K-$1.5M fines per violation',
                '36% of skills have security flaws (Snyk, 2026)',
                "No BAA — can't legally touch patient data",
                "No BCBA/RBT roles — everyone sees everything",
                "Doesn't understand CPT codes, FBAs, or prior auths",
                'Unsandboxed shell access — CVE-2026-25253',
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3 mb-4 text-[.88rem] leading-[1.55] text-white/55"
                >
                  <span className="font-extrabold shrink-0 text-[.9rem] mt-px text-[var(--red)]">
                    ✗
                  </span>
                  {item}
                </div>
              ))}
            </div>

            {/* Good - SecureAgent */}
            <div className="reveal reveal-delay-2 rounded-[20px] py-10 px-9 bg-[rgba(13,148,136,.06)] border border-[rgba(13,148,136,.12)] relative overflow-hidden">
              <div className="comp-good-bar" />
              <div className="flex items-center gap-3 mb-7">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-[22px] bg-[rgba(13,148,136,.1)]">
                  🛡️
                </div>
                <h3 className="font-sans text-[1.15rem] font-bold text-[var(--teal-light)]">
                  SecureAgent
                </h3>
              </div>
              {[
                'HIPAA-compliant with BAA included on all plans',
                'Curated, audited skills — zero supply chain risk',
                'AES-256 encryption + zero data retention in LLM',
                'RBAC: Owner / BCBA / RBT / Billing roles',
                'Built for ABA: session notes, pre-auths, BIPs',
                'Self-hosted option: your data never leaves your network',
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3 mb-4 text-[.88rem] leading-[1.55] text-white/80"
                >
                  <span className="font-extrabold shrink-0 text-[.9rem] mt-px text-[var(--green)]">
                    ✓
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== SOCIAL PROOF ===== */}
      <SocialProofSection />

      {/* ===== PRICING ===== */}
      <section
        id="pricing"
        className="py-[120px] px-10 max-w-[1240px] mx-auto relative z-10 max-[768px]:py-20 max-[768px]:px-6"
      >
        <div className="reveal text-center">
          <div className="inline-flex items-center gap-2 text-[.76rem] font-bold text-[var(--teal)] uppercase tracking-[.1em] mb-4 justify-center">
            <span className="w-6 h-0.5 bg-[var(--teal)] rounded" />
            Pricing
          </div>
          <h2 className="font-serif text-[2.8rem] font-bold text-[var(--navy)] mb-4 tracking-tight leading-[1.15] max-[768px]:text-[2rem]">
            Simple. Transparent.{' '}
            <em className="italic text-[var(--teal)] font-medium">
              No surprises.
            </em>
          </h2>
          <p className="text-[1.08rem] text-[var(--slate)] max-w-[540px] leading-[1.75] mb-16 mx-auto">
            All plans include BAA, encryption, and audit logs. 14-day free
            trial, no credit card required.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          {[
            {
              tier: 'Solo',
              name: 'Individual BCBA',
              desc: 'For independent practitioners building their caseload.',
              price: '$97',
              period: '1 user \u2022 BAA included',
              features: [
                'All clinical skills',
                'Telegram + Web dashboard',
                'Session notes (EN/ES)',
                'Pre-auth tracking & alerts',
                'Parent training summaries',
                'Encrypted audit logs',
              ],
              featured: false,
              cta: 'Start Free Trial',
              href: '/login',
            },
            {
              tier: 'Agency',
              name: 'ABA Agency',
              desc: 'For growing agencies with 5-20 RBTs. Most teams choose this.',
              price: '$197',
              period: 'Up to 20 users \u2022 Full RBAC',
              features: [
                'Everything in Solo +',
                'BCBA / RBT / Billing roles',
                'WhatsApp + Telegram',
                'Compliance dashboard',
                'ARIA report integration',
                'Priority support',
              ],
              featured: true,
              cta: 'Start Free Trial',
              href: '/login',
            },
            {
              tier: 'Enterprise',
              name: 'Multi-Location',
              desc: 'For large practices with 20+ staff and custom needs.',
              price: '$497',
              period: 'Unlimited users \u2022 VLayer',
              features: [
                'Everything in Agency +',
                'Custom clinical skills',
                'VLayer compliance scanning',
                'Self-hosted deployment',
                'Dedicated support',
                'Custom integrations',
              ],
              featured: false,
              cta: 'Contact Sales',
              href: 'mailto:support@secureagent.dev',
            },
          ].map((plan, idx) => (
            <div
              key={plan.tier}
              className={`reveal reveal-delay-${idx + 1} bg-white rounded-[20px] p-10 relative transition-all duration-[400ms] ${
                plan.featured
                  ? 'border-2 border-[var(--teal)] shadow-[0_16px_48px_rgba(13,148,136,.1)]'
                  : 'border border-[rgba(15,23,42,.06)] hover:shadow-[0_16px_48px_rgba(15,23,42,.06)]'
              }`}
            >
              {plan.featured && (
                <div className="price-featured-badge">MOST POPULAR</div>
              )}
              <div className="text-[.76rem] font-bold text-[var(--teal)] uppercase tracking-[.08em] mb-2">
                {plan.tier}
              </div>
              <div className="text-[1.3rem] font-bold text-[var(--navy)] mb-1.5">
                {plan.name}
              </div>
              <div className="text-[.85rem] text-[var(--slate)] mb-6 leading-[1.5]">
                {plan.desc}
              </div>
              <div className="text-[3rem] font-bold text-[var(--navy)] mb-0.5 tracking-tight">
                {plan.price}
                <span className="text-[.95rem] font-normal text-[var(--slate)]">
                  /mo
                </span>
              </div>
              <div className="text-[.78rem] text-[var(--slate-light)] mb-7">
                {plan.period}
              </div>
              <div className="h-px bg-[rgba(15,23,42,.06)] mb-6" />
              <ul className="list-none mb-8 space-y-0">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-2.5 text-[.86rem] text-[var(--navy-light)] py-[9px]"
                  >
                    <span className="text-[var(--green)] font-extrabold text-[.8rem]">
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              {plan.href.startsWith('mailto:') ? (
                <a
                  href={plan.href}
                  className={`block w-full text-center py-[13px] rounded-xl font-semibold text-[.9rem] no-underline transition-all duration-300 border-[1.5px] border-[rgba(15,23,42,.12)] text-[var(--navy)] bg-transparent hover:border-[var(--teal)] hover:text-[var(--teal)]`}
                >
                  {plan.cta}
                </a>
              ) : (
                <Link
                  href={plan.href}
                  className={`block w-full text-center py-[13px] rounded-xl font-semibold text-[.9rem] no-underline transition-all duration-300 ${
                    plan.featured
                      ? 'bg-[var(--teal)] text-white shadow-[0_2px_12px_var(--teal-glow)] hover:bg-[var(--teal-dark)] hover:-translate-y-px'
                      : 'border-[1.5px] border-[rgba(15,23,42,.12)] text-[var(--navy)] bg-transparent hover:border-[var(--teal)] hover:text-[var(--teal)]'
                  }`}
                >
                  {plan.cta}
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="relative z-10 overflow-hidden">
        <div className="bg-gradient-to-br from-[var(--navy)] to-[#0B1120] py-[120px] px-10 relative max-[768px]:py-20 max-[768px]:px-6">
          <div className="absolute top-1/2 left-1/2 w-[800px] h-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,var(--teal-glow),transparent_60%)] animate-[ctaGlow_6s_ease-in-out_infinite]" />
          <div className="max-w-[700px] mx-auto text-center relative z-10 reveal">
            <h2 className="font-serif text-[2.8rem] text-white mb-5 leading-[1.15] max-[768px]:text-[2rem]">
              Still filling pre-auths{' '}
              <em className="text-[var(--teal-light)]">at 10pm?</em>
            </h2>
            <p className="text-[var(--slate-light)] text-[1.1rem] leading-[1.75] mb-9">
              We know the feeling — because we live it. SecureAgent was built by
              a BCBA who runs an ABA agency with 15 RBTs. It&apos;s the tool we
              wished we had years ago.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-white text-[var(--navy)] py-4 px-9 rounded-xl font-semibold text-base no-underline shadow-[0_4px_20px_rgba(0,0,0,.15)] hover:-translate-y-[3px] hover:shadow-[0_8px_32px_rgba(0,0,0,.2)] transition-all duration-300"
            >
              Start Your Free Trial — 14 Days →
            </Link>
            <div className="mt-5 text-[.8rem] text-white/35">
              No credit card required &bull; 5-minute setup &bull; Cancel
              anytime
            </div>
            <div className="mt-7 pt-7 border-t border-white/[.06] text-[.9rem] text-white/40 italic">
              🇪🇸{' '}
              <em>
                También disponible en español. Resúmenes bilingües para
                familias hispanas.
              </em>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="bg-[var(--navy)] border-t border-white/[.04] py-10 px-10">
        <div className="max-w-[1240px] mx-auto flex justify-between items-center flex-wrap gap-5 max-[768px]:flex-col max-[768px]:text-center">
          <div className="text-white/40 text-[.82rem] leading-[1.7]">
            <strong className="text-white/70">SecureAgent</strong>
            <br />
            Built with care in Ave Maria, FL by a BCBA who gets it.
            <br />
            <Link
              href="/privacy"
              className="text-[var(--teal-light)] no-underline hover:text-white transition-colors"
            >
              Privacy Policy
            </Link>{' '}
            &middot;{' '}
            <a
              href="#"
              className="text-[var(--teal-light)] no-underline hover:text-white transition-colors"
            >
              Terms of Service
            </a>{' '}
            &middot;{' '}
            <a
              href="mailto:support@secureagent.dev"
              className="text-[var(--teal-light)] no-underline hover:text-white transition-colors"
            >
              Request BAA
            </a>
          </div>
          <div className="flex gap-3 max-[768px]:justify-center">
            {[
              '🛡️ HIPAA Compliant',
              '🔐 BAA Available',
              '📋 SOC 2 In Progress',
            ].map((badge) => (
              <div
                key={badge}
                className="py-[7px] px-3.5 rounded-[10px] text-[.73rem] font-semibold border border-white/[.06] text-white/40 hover:border-[rgba(13,148,136,.3)] hover:text-[var(--teal-light)] transition-all duration-300"
              >
                {badge}
              </div>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
