import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, LogOut, Plus, MonitorPlay, Palette } from 'lucide-react';
import { useTheme, type Theme } from '../ThemeContext';

export default function Dashboard() {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('User');

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      navigate('/');
      return;
    }
    try {
      const user = JSON.parse(userStr);
      if (user && user.name) {
        setUserName(user.name);
      }
    } catch {
      // invalid json
    }
  }, [navigate]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId) {
      navigate(`/room/${roomId}`);
    }
  };

  const handleCreate = () => {
    const newRoomId = Math.random().toString(36).substring(2, 9);
    navigate(`/room/${newRoomId}`);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  return (
    <div className="main-content">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 700 }}>ConvoSync</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          
          <div className="apple-panel" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem', borderRadius: '12px' }}>
            <Palette size={16} color="var(--text-secondary)" style={{ marginLeft: '0.4rem' }} />
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as Theme)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '0.2rem 0.4rem' }}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="glassy">Glassy</option>
            </select>
          </div>

          <span style={{ fontWeight: 500 }}>{userName}</span>
          <button className="secondary icon-btn" onClick={handleLogout} title="Log out">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        
        {/* Create Meeting Card */}
        <div className="apple-panel animate-fade-in" style={{ padding: '2.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ background: 'var(--primary)', padding: '1.25rem', borderRadius: '50%', color: 'white', marginBottom: '0.5rem', boxShadow: '0 8px 16px rgba(0,122,255,0.2)' }}>
            <Video size={36} strokeWidth={1.5} />
          </div>
          <h3 style={{ fontSize: '1.5rem' }}>New Meeting</h3>
          <p>Start an instant video meeting</p>
          <button onClick={handleCreate} style={{ width: '100%', marginTop: 'auto', padding: '1rem' }}>
            <Plus size={18} /> Start Meeting
          </button>
        </div>

        {/* Join Meeting Card */}
        <div className="apple-panel animate-fade-in" style={{ padding: '2.5rem 2rem', animationDelay: '0.1s', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ background: 'var(--panel-bg-secondary)', padding: '1.25rem', borderRadius: '50%', color: 'var(--primary)', marginBottom: '0.5rem' }}>
            <MonitorPlay size={36} strokeWidth={1.5} />
          </div>
          <h3 style={{ fontSize: '1.5rem' }}>Join Meeting</h3>
          <p>Enter a room ID to join an existing meeting.</p>
          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: 'auto', width: '100%' }}>
            <input 
              type="text" 
              placeholder="e.g. abc-defg-hij" 
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              required
              style={{ textAlign: 'center', fontSize: '1.1rem' }}
            />
            <button type="submit" className="secondary" style={{ padding: '1rem' }}>Join</button>
          </form>
        </div>

      </div>
    </div>
  );
}
