import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import '../styles/welcome.css';
import { api } from '../lib/api.js';
import { $, $$, busy, formData, showFieldErrors } from '../lib/dom.js';
import { brandMark } from '../lib/icons.js';
import { mountGarden } from '../garden/index.js';
import { gardenNight } from '../lib/theme.js';

const next = new URLSearchParams(location.search).get('next');
const destination = next && next.startsWith('/') && !next.startsWith('//') ? next : '/today.html';

// Already signed in? Go straight to the garden.
api.get('/auth/session').then(({ user }) => user && location.replace(destination), () => {});

$('#mark').replaceWith(brandMark());

const hint = $('#hint');
let garden = mountGarden($('#garden'), {
  companion: 'turtle',
  stage: 'teen',
  night: gardenNight(),
  onEvent: (e) => {
    if (['pet', 'grabbed', 'charging', 'called'].includes(e.type)) hint.style.opacity = '0';
  },
});

// Sign in / create account tabs.
const forms = { signin: $('#signin'), signup: $('#signup') };
for (const radio of $$('input[name="mode"]')) {
  radio.addEventListener('change', () => {
    const mode = radio.value;
    forms.signin.hidden = mode !== 'signin';
    forms.signup.hidden = mode !== 'signup';
    $('#auth-title').textContent = mode === 'signin' ? 'Welcome back' : 'Adopt a companion';
    const companion = mode === 'signup' ? $('input[name="companion"]:checked').value : 'turtle';
    garden.setCompanion(companion);
    garden.grow(mode === 'signup' ? 'baby' : 'teen');
    forms[mode].querySelector('input:not([type=radio])')?.focus();
  });
}

// Picking a companion swaps the baby in the garden preview.
for (const radio of $$('input[name="companion"]')) {
  radio.addEventListener('change', () => {
    garden.setCompanion(radio.value);
    garden.grow('baby');
  });
}

async function submit(form, path, payload) {
  const button = form.querySelector('button[type="submit"]');
  const errorBox = form.querySelector('.form-error');
  errorBox.hidden = true;
  showFieldErrors(form, {});
  busy(button);
  try {
    await api.post(path, payload);
    garden.celebrate();
    location.assign(destination);
  } catch (err) {
    busy(button, false);
    if (err.fields?.length) showFieldErrors(form, err.fieldErrors);
    else {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
    }
  }
}

forms.signin.addEventListener('submit', (e) => {
  e.preventDefault();
  submit(forms.signin, '/auth/login', formData(forms.signin));
});
forms.signup.addEventListener('submit', (e) => {
  e.preventDefault();
  submit(forms.signup, '/auth/signup', formData(forms.signup));
});

$('#sample').addEventListener('click', () => {
  $('#si-email').value = 'demo@ustudy.app';
  $('#si-password').value = 'study-with-mochi';
  forms.signin.requestSubmit();
});

window.addEventListener('pagehide', () => garden.destroy());
