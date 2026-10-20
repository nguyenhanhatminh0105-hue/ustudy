import '../styles/assignments.css';
import { initApp } from '../lib/shell.js';
import { api } from '../lib/api.js';
import { $, busy, clear, formData, h, showFieldErrors } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { dueLabel, fromLocalInput, plural, toLocalInput } from '../lib/format.js';
import { createSheet } from '../lib/sheet.js';
import { toast, toastError } from '../lib/toast.js';

const { user } = await initApp('admin');
const form = $('#form');
const sheet = createSheet($('#sheet'));
let editing = null;

if (user.role !== 'admin') {
  $('#denied').hidden = false;
  $('#add').hidden = true;
} else {
  $('#add').addEventListener('click', () => open());
  await load();
}

async function load() {
  try {
    const { official } = await api.get('/official/manage');
    const list = clear($('#list'));
    if (!official.length) {
      list.append(h('li.empty', h('h3', 'Nothing posted yet'), h('p', 'Post the first assignment for your course.')));
      return;
    }
    for (const o of official) {
      const edit = h('button.btn.btn-quiet.btn-icon', { type: 'button', 'aria-label': `Edit “${o.title}”` }, icon('pencil'));
      edit.addEventListener('click', () => open(o));
      list.append(
        h(
          'li.task',
          h('span.tag.tag-low', icon('book')),
          h('div.task-main', h('b', `${o.course}: ${o.title}`), h('div.sub', h(`span.tag.tag-${o.priority}`, o.priority[0].toUpperCase() + o.priority.slice(1)), h('span', `${plural(o.estimatedHours, 'hour')}`))),
          h('span.due', `${plural(o.adopted, 'student')} added it`),
          h('span.due.due-col', dueLabel(o.dueAt)),
          h('div.task-actions', edit),
        ),
      );
    }
  } catch (err) {
    toastError(err);
  }
}

function open(o = null) {
  editing = o;
  form.reset();
  showFieldErrors(form, {});
  form.querySelector('.form-error').hidden = true;
  $('#sheet-title').textContent = o ? 'Edit assignment' : 'Post assignment';
  $('#save').textContent = o ? 'Save' : 'Post';
  $('#delete').hidden = !o;
  if (o) {
    form.course.value = o.course;
    form.title.value = o.title;
    form.estimatedHours.value = o.estimatedHours;
    form.dueAt.value = toLocalInput(o.dueAt);
    form.description.value = o.description;
    form.querySelector(`input[name="priority"][value="${o.priority}"]`).checked = true;
  } else {
    const due = new Date(Date.now() + 7 * 86_400_000);
    due.setHours(23, 59, 0, 0);
    form.dueAt.value = toLocalInput(due.toISOString());
  }
  sheet.open();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = formData(form);
  const payload = { ...data, dueAt: fromLocalInput(data.dueAt) };
  const save = $('#save');
  busy(save);
  try {
    if (editing) await api.put(`/official/${editing.id}`, payload);
    else await api.post('/official', payload);
    sheet.close();
    toast(editing ? 'Saved' : { title: 'Posted', body: 'Students can add it from their Assignments page.', icon: 'book' });
    await load();
  } catch (err) {
    if (err.fields?.length) showFieldErrors(form, err.fieldErrors);
    else {
      const box = form.querySelector('.form-error');
      box.textContent = err.message;
      box.hidden = false;
    }
  } finally {
    busy(save, false);
  }
});

$('#delete').addEventListener('click', async () => {
  const btn = $('#delete');
  if (btn.dataset.confirm !== 'yes') {
    btn.dataset.confirm = 'yes';
    btn.lastChild.textContent = 'Delete for everyone?';
    setTimeout(() => {
      btn.dataset.confirm = '';
      btn.lastChild.textContent = 'Delete';
    }, 3500);
    return;
  }
  try {
    await api.del(`/official/${editing.id}`);
    sheet.close();
    toast('Deleted. Students keep any copies they added.');
    await load();
  } catch (err) {
    toastError(err);
  }
});
