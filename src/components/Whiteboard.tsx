import React, { useEffect, useRef, useState } from 'react';
import { socket } from '../socket';

// Use discrete color bucketing to guarantee visually distinct shades
export const getHashColor = (id: string) => {
  if (!id) return '#00d2ff';
  
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Snap to 12 strictly distinct hue buckets (30 degrees apart)
  const hueBucket = Math.abs(hash) % 12;
  const hue = hueBucket * 30;
  
  // Vary lightness (45%, 55%, 65%) to create 36 strictly separated color slots
  const lightnessBucket = (Math.abs(hash >> 8) % 3);
  const lightness = 45 + (lightnessBucket * 10);
  
  return `hsl(${hue}, 85%, ${lightness}%)`;
};

export default function Whiteboard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPos = useRef<{ x: number, y: number } | null>(null);
  const linesRef = useRef<{ x0: number, y0: number, x1: number, y1: number, color: string }[]>([]);

  const myColor = useRef(getHashColor(socket.id || Math.random().toString()));

  const drawAllLines = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    linesRef.current.forEach(line => {
      ctx.beginPath();
      ctx.moveTo(line.x0 * canvas.width, line.y0 * canvas.height);
      ctx.lineTo(line.x1 * canvas.width, line.y1 * canvas.height);
      ctx.strokeStyle = line.color || '#ffffff';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.closePath();
    });
  };

  // Initialize canvas size and handle resizing robustly
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      // Temporarily hide to get true container size without canvas expanding it
      canvas.style.display = 'none';
      const rect = canvas.parentElement!.getBoundingClientRect();
      canvas.style.display = 'block';
      
      canvas.width = rect.width;
      canvas.height = rect.height;
      drawAllLines(canvas);
    };

    // Run initially and then after a tiny delay to ensure layout is settled
    resizeCanvas();
    setTimeout(resizeCanvas, 100);

    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  // Socket listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleDraw = (data: { x0: number, y0: number, x1: number, y1: number, color: string }) => {
      linesRef.current.push(data); // Save the stroke
      const w = canvas.width;
      const h = canvas.height;
      ctx.beginPath();
      ctx.moveTo(data.x0 * w, data.y0 * h);
      ctx.lineTo(data.x1 * w, data.y1 * h);
      ctx.strokeStyle = data.color || '#ffffff';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.closePath();
    };

    const handleClear = () => {
      linesRef.current = [];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    const handleInitialStrokes = (strokes: any[]) => {
      linesRef.current = strokes;
      drawAllLines(canvas);
    };

    socket.on('draw', handleDraw);
    socket.on('clear-board', handleClear);
    socket.on('initial-strokes', handleInitialStrokes);

    // Ask server for existing strokes!
    socket.emit('request-strokes');

    return () => {
      socket.off('draw', handleDraw);
      socket.off('clear-board', handleClear);
      socket.off('initial-strokes', handleInitialStrokes);
    };
  }, []);

  const drawLine = (x0: number, y0: number, x1: number, y1: number, color: string, emit: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const lineData = { x0, y0, x1, y1, color };
    linesRef.current.push(lineData);

    const w = canvas.width;
    const h = canvas.height;

    ctx.beginPath();
    ctx.moveTo(x0 * w, y0 * h);
    ctx.lineTo(x1 * w, y1 * h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.closePath();

    if (!emit) return;
    socket.emit('draw', lineData);
  };

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: (clientX - rect.left) / canvas.width,
      y: (clientY - rect.top) / canvas.height
    };
  };

  const onMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    lastPos.current = getPos(e);
  };

  const onMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !lastPos.current) return;
    
    const pos = getPos(e);
    drawLine(lastPos.current.x, lastPos.current.y, pos.x, pos.y, myColor.current, true);
    lastPos.current = pos;
  };

  const onMouseUp = () => {
    setIsDrawing(false);
    lastPos.current = null;
  };

  const clearBoard = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      linesRef.current = [];
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      socket.emit('clear-board');
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: myColor.current }}>✎</span> Shared Whiteboard
        </h3>
        
        <button 
          onClick={clearBoard}
          style={{ padding: '0.5rem 1.2rem', background: 'var(--panel-bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-color)', cursor: 'pointer', fontWeight: 500, transition: 'all 0.2s' }}
          onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-color)'}
          onMouseOut={(e) => e.currentTarget.style.background = 'var(--panel-bg-secondary)'}
        >
          Clear Board
        </button>
      </div>
      <div className="apple-panel" style={{ flex: 1, position: 'relative', background: '#1e1e1e', borderRadius: '16px', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseOut={onMouseUp}
          onTouchStart={onMouseDown}
          onTouchMove={onMouseMove}
          onTouchEnd={onMouseUp}
          style={{ width: '100%', height: '100%', cursor: 'crosshair', touchAction: 'none' }}
        />
      </div>
    </div>
  );
}
