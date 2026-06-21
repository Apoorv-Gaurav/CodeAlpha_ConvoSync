import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

interface SplashProps {
  onComplete?: () => void;
}

export default function Splash({ onComplete }: SplashProps) {
  const navigate = useNavigate();

  useEffect(() => {
    // The splash sequence takes exactly 3.0s
    const timer = setTimeout(() => {
      if (onComplete) {
        onComplete();
      } else {
        navigate('/dashboard');
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [onComplete, navigate]);

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex flex-row items-center justify-center overflow-hidden pointer-events-none"
      style={{
        width: '100vw',
        height: '100dvh',
        // Made the background a little lighter
        background: 'linear-gradient(135deg, #2e2a5e 0%, #4f46e5 40%, #8b5cf6 100%)',
      }}
      // 2.7–3.0s: Crossfade the splash screen into the homepage with blur and scale transitions.
      initial={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      animate={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
      transition={{ delay: 2.7, duration: 0.3, ease: 'easeInOut' }}
    >
      {/* Background Blobs */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="absolute inset-0 w-full h-full"
      >
        <motion.div
          animate={{ x: [0, 50, -50, 0], y: [0, -50, 50, 0], rotate: [0, 10, -10, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full mix-blend-screen opacity-30"
          style={{ background: '#3B82F6', filter: 'blur(80px)' }}
        />
        <motion.div
          animate={{ x: [0, -40, 40, 0], y: [0, 40, -40, 0], rotate: [0, -15, 15, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] rounded-full mix-blend-screen opacity-20"
          style={{ background: '#6366F1', filter: 'blur(100px)' }}
        />
        <motion.div
          animate={{ x: [0, 60, -60, 0], y: [0, 60, -60, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
          className="absolute top-[20%] right-[20%] w-[40vw] h-[40vw] rounded-full mix-blend-screen opacity-20"
          style={{ background: '#8B5CF6', filter: 'blur(90px)' }}
        />
      </motion.div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-row items-center justify-center">
        
        {/* Background little light behind the logo */}
        <motion.div 
          className="absolute rounded-full pointer-events-none z-10"
          style={{ 
            width: '200%',
            height: '200%',
            background: 'radial-gradient(circle, rgba(96,165,250,0.4) 0%, rgba(167,139,250,0.2) 50%, rgba(255,255,255,0) 80%)',
            filter: 'blur(30px)',
            mixBlendMode: 'screen',
            left: '-50%',
            top: '-50%'
          }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1.2 }}
          transition={{ delay: 1.0, duration: 1.0, ease: "easeOut" }}
        />

        {/* First Logo Section (Small Icon) */}
        <motion.div
          className="relative flex items-center justify-center z-20 h-[90px] md:h-[130px] w-[90px] md:w-[130px]"
          // 1. Pop up from below into center
          initial={{ scale: 0, opacity: 0, y: 80 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Using the small logo image */}
          <img 
            src="/icon-light.png" 
            alt="ConvoSync Icon" 
            className="w-full h-full object-contain drop-shadow-2xl"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/icon-dark.png';
            }}
          />
        </motion.div>

        {/* Second Text Logo Section */}
        <motion.div 
          className="overflow-hidden ml-16 md:ml-24 flex items-center z-10"
          initial={{ clipPath: 'inset(0% 100% 0% 0%)', opacity: 0, width: 0 }}
          animate={{ clipPath: 'inset(0% 0% 0% 0%)', opacity: 1, width: 'auto' }}
          transition={{ 
            delay: 1.25, // Start exactly when logo starts sliding left
            duration: 0.6, 
            ease: [0.16, 1, 0.3, 1] 
          }}
        >
          {/* Using the given text logo */}
          <img 
            src="/text-logo.png" 
            alt="ConvoSync Text" 
            // Height made explicitly identical to the first logo
            className="h-[90px] md:h-[130px] w-auto object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/logo-light.png';
            }}
          />
        </motion.div>
      </div>

      {/* Global Style Override for Splash Only to prevent scrolling */}
      <style>{`
        body { overflow: hidden !important; }
        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>
    </motion.div>
  );
}
