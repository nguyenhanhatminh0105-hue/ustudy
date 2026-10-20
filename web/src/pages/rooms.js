import '../styles/rooms.css';
import { io } from 'socket.io-client';
import { initApp } from '../lib/shell.js';
import { api } from '../lib/api.js';
import { $, busy, clear, formData, h, showFieldErrors } from '../lib/dom.js';
import { formatDay, formatTime, plural } from '../lib/format.js';
import { toast, toastError } from '../lib/toast.js';

const shell = await initApp('rooms');
const code = new URLSearchParams(location.search).get('room')?.toUpperCase();
const daysLeft = (iso) => Math.max(0, Math.ceil((new Date(iso) - Date.now()) / 86_400_000));

if (code) openRoom(code);
else openLobby();

// ── Lobby ───────────────────────────────────────────────────────
async function openLobby() {
  $('#lobby').hidden = false;
  document.title = 'Study rooms · UStudy';

  $('#host').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const btn = form.querySelector('button');
    showFieldErrors(form, {});
    busy(btn);
    try {
      const { room } = await api.post('/rooms', formData(form));
      location.assign(`/rooms.html?room=${room.id}`);
    } catch (err) {
      busy(btn, false);
      if (err.fields?.length) showFieldErrors(form, err.fieldErrors);
      else toastError(err);
    }
  });

  $('#join').addEventListener('submit', (e) => {
    e.preventDefault();
    const value = e.currentTarget.code.value.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(value)) {
      showFieldErrors(e.currentTarget, { code: 'Room codes are 8 letters and numbers.' });
      return;
    }
    location.assign(`/rooms.html?room=${value}`);
  });

  try {
    const { rooms } = await api.get('/rooms');
    const list = clear($('#rooms'));
    if (!rooms.length) {
      list.append(h('li.empty', h('p', 'No rooms yet. Host one, or ask a friend for their code.')));
      return;
    }
    for (const r of rooms) {
      const leave = h('button.btn.btn-quiet', { type: 'button' }, 'Leave');
      leave.addEventListener('click', async () => {
        await api.del(`/rooms/${r.id}/membership`).catch(toastError);
        location.reload();
      });
      list.append(
        h(
          'li',
          h('div', h('b', r.name), h('span.code', r.id)),
          h('span.expires', `${plural(daysLeft(r.expiresAt), 'day')} left`),
          h('a.btn', { href: `/rooms.html?room=${r.id}` }, 'Open'),
          leave,
        ),
      );
    }
  } catch (err) {
    toastError(err);
  }
}

// ── Inside a room ───────────────────────────────────────────────
async function openRoom(roomId) {
  $('#room').hidden = false;
  let data;
  try {
    data = await api.get(`/rooms/${encodeURIComponent(roomId)}`);
  } catch (err) {
    clear($('#room')).append(
      h('div.empty', h('h3', 'This room isn’t here'), h('p', err.message), h('a.btn', { href: '/rooms.html' }, 'Back to rooms')),
    );
    return;
  }
  const { room } = data;
  document.title = `${room.name} · Study rooms · UStudy`;
  $('#room-name-title').textContent = room.name;
  $('#room-meta').textContent = `Hosted ${room.owned ? 'by you' : 'by a classmate'} · tidies away ${formatDay(room.expiresAt)} (${plural(daysLeft(room.expiresAt), 'day')})`;
  $('#room-code-label').textContent = room.id;
  $('#copy').setAttribute('aria-label', `Copy room code ${room.id}`);
  $('#copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(room.id);
      toast({ title: 'Code copied', body: 'Send it to whoever you’re studying with.', icon: 'copy' });
    } catch {
      toast({ title: `Room code: ${room.id}`, icon: 'copy' });
    }
  });

  // messages
  const list = $('#messages');
  const addMessage = (m) => {
    const mine = m.mine ?? m.authorId === shell.user.id;
    list.append(
      h(
        `li.msg${mine ? '.mine' : ''}`,
        mine ? null : h('span.who', m.author),
        h('div.bubble', m.body), // text only: rendered as a text node
        h('time', { datetime: m.createdAt }, formatTime(m.createdAt)),
      ),
    );
    list.scrollTop = list.scrollHeight;
  };
  if (!data.messages.length) list.append(h('li.system', 'No messages yet. Say hello.'));
  data.messages.forEach(addMessage);

  // notes
  const notes = $('#notes');
  const status = $('#notes-status');
  notes.value = data.notes.content ?? '';

  // realtime
  const socket = io({ transports: ['websocket'], withCredentials: true });
  socket.on('connect', () => {
    socket.emit('room:join', { roomId: room.id }, (res) => {
      if (res?.error) toastError(new Error(res.error));
    });
  });
  socket.on('connect_error', () => {
    status.textContent = 'Reconnecting…';
  });
  socket.on('room:message', (m) => {
    list.querySelector('.system')?.remove();
    addMessage(m);
  });
  socket.on('room:presence', (people) => {
    const el = clear($('#presence'));
    el.append(h('span', `${plural(people.length, 'person', 'people')} here:`));
    for (const p of people) el.append(h('span.person', h('i', p.name.slice(0, 1).toUpperCase()), p.id === shell.user.id ? `${p.name} (you)` : p.name));
  });
  socket.on('room:notes', ({ content, by }) => {
    const { selectionStart, selectionEnd } = notes;
    const focused = document.activeElement === notes;
    notes.value = content;
    if (focused) notes.setSelectionRange(selectionStart, selectionEnd);
    status.textContent = `Updated by ${by}`;
  });

  $('#composer').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#message');
    const body = input.value.trim();
    if (!body) return;
    socket.emit('room:message', { roomId: room.id, body }, (res) => {
      if (res?.error) toastError(new Error(res.error));
      else input.value = '';
    });
  });

  let timer;
  notes.addEventListener('input', () => {
    status.textContent = 'Saving…';
    clearTimeout(timer);
    timer = setTimeout(() => {
      socket.emit('room:notes', { roomId: room.id, content: notes.value }, (res) => {
        status.textContent = res?.error ? res.error : `Saved ${formatTime(res.savedAt)}`;
      });
    }, 600);
  });

  window.addEventListener('pagehide', () => socket.close());
}
