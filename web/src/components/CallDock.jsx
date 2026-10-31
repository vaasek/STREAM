import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useRealtime } from '../realtime.jsx';
import { Modal } from '../ui.jsx';

function beep() {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.value = 0.05;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.16);
    setTimeout(() => context.close().catch(() => {}), 500);
  } catch {
    /* без динамика тоже можно принять вызов */
  }
}

export default function CallDock() {
  const { user } = useAuth();
  const { socket } = useRealtime();
  const navigate = useNavigate();
  const [incoming, setIncoming] = useState(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!socket || !user || user.guest) return undefined;
    const onIncoming = (call) => {
      setIncoming(call);
      beep();
    };
    const onDeclined = ({ fromName }) => setNote(`${fromName} отклонил вызов`);
    socket.on('call:incoming', onIncoming);
    socket.on('call:declined', onDeclined);
    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:declined', onDeclined);
    };
  }, [socket, user]);

  useEffect(() => {
    if (!note) return undefined;
    const timer = setTimeout(() => setNote(''), 4000);
    return () => clearTimeout(timer);
  }, [note]);

  useEffect(() => {
    if (!incoming) return undefined;
    const timer = setTimeout(() => setIncoming(null), 40000);
    return () => clearTimeout(timer);
  }, [incoming]);

  if (!user || user.guest) return note ? <div className="call-note">{note}</div> : null;

  function decline() {
    socket?.emit('call:decline', { toUserId: incoming.fromId });
    setIncoming(null);
  }

  function accept() {
    const code = incoming.roomCode;
    setIncoming(null);
    navigate(`/r/${code}`);
  }

  return (
    <>
      {note && <div className="call-note">{note}</div>}
      {incoming && (
        <Modal title="Входящий вызов" onClose={decline}>
          <p className="call-name">{incoming.fromName}</p>
          <p className="hint">{incoming.title}</p>
          <div className="row">
            <button type="button" className="btn primary" onClick={accept}>Ответить</button>
            <button type="button" className="btn danger" onClick={decline}>Отклонить</button>
          </div>
        </Modal>
      )}
    </>
  );
}
