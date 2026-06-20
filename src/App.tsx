import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Room from './pages/Room';
import Splash from './pages/Splash';
import { ThemeProvider } from './ThemeContext';

function App() {
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  return (
    <ThemeProvider>
      <Router>
        {isInitialLoad ? (
          <Splash onComplete={() => setIsInitialLoad(false)} />
        ) : (
          <div className="app-container">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/welcome" element={<Splash />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/room/:id" element={<Room />} />
              </Routes>
            </ErrorBoundary>
          </div>
        )}
      </Router>
    </ThemeProvider>
  );
}

export default App;
