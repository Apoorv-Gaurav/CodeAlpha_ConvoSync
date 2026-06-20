import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';

interface SplashProps {
  onComplete?: () => void;
}

export default function Splash({ onComplete }: SplashProps) {
  const navigate = useNavigate();
  const [userName, setUserName] = useState<string>('');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);

  useEffect(() => {
    // Check if user is actually logged in
    const token = localStorage.getItem('token');
    const storedName = localStorage.getItem('convosync_user');
    
    if (token && storedName) {
      setIsLoggedIn(true);
      setUserName(storedName);
    }

    // After 2.5s, the CSS fade-out completes, so we navigate or complete
    const timer = setTimeout(() => {
      if (onComplete) {
        onComplete();
      } else {
        navigate('/dashboard');
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [navigate, onComplete]);

  return (
    <div className="splash-container">
      <div className="splash-content">
        <div className="splash-logo-container">
          <div className="splash-ripple"></div>
          <div className="splash-ripple splash-ripple-delayed"></div>
          <MessageSquare size={64} color="var(--primary)" className="splash-logo" />
        </div>
        
        <div className="splash-text-container">
          <h1 className="splash-title">ConvoSync</h1>
          <p className="splash-subtitle">
            {isLoggedIn ? `Welcome back, ${userName}` : 'Welcome to ConvoSync'}
          </p>
        </div>
      </div>
    </div>
  );
}
