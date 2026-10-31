import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { Field, Modal, useToast } from '../ui.jsx';

export default function ProfileDialog({ onClose }) {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await updateProfile({
        name,
        currentPassword: newPassword ? currentPassword : undefined,
        newPassword: newPassword || undefined,
      });
      toast.push('Профиль сохранён');
      onClose();
    } catch (error) {
      toast.push(error.message, 'warn');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Профиль" onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <Field label="Имя">
          <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={60} />
        </Field>
        <p className="hint">{user.email}</p>
        <Field label="Текущий пароль">
          <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="Новый пароль">
          <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} autoComplete="new-password" />
        </Field>
        <button className="btn primary" type="submit" disabled={busy}>Сохранить</button>
      </form>
    </Modal>
  );
}
