import { useTheme } from '../ThemeContext';

interface LogoProps {
  width?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function Logo({ width = '180px', className = '', style = {} }: LogoProps) {
  const { theme } = useTheme();
  
  // For dark theme, use the logo with white text
  // For light/glassy theme, use the logo with dark text
  const logoSrc = theme === 'dark' ? '/logo-dark.png' : '/logo-light.png';

  return (
    <img 
      src={logoSrc} 
      alt="ConvoSync Logo" 
      style={{ width, height: 'auto', objectFit: 'contain', ...style }}
      className={className}
    />
  );
}
