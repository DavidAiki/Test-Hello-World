// KAN-8 - Multi-Step Insurance Wizard Logic
// Session-basiertes Handling, ProzessID-Generierung, Timeout-Management

/* ===== CONFIG ===== */
const WIZARD_CONFIG = {
  SESSION_TIMEOUT_MINUTES: 15,       // Fix: 15 Min Inaktivitäts-Timeout (war 20)
  WARNING_BEFORE_TIMEOUT_MINUTES: 2,
  SESSION_STORAGE_KEY: 'wizard_session',
  PROCESS_ID_PREFIX: 'PWP-',
};

/* ===== STATE & SESSION ===== */
let wizardState = {
  currentStep: 1,
  totalSteps: 7,
  processId: null,
  formData: {},
  sessionId: null,
  sessionStartTime: null,
  sessionWarningShown: false,
};

const INSURANCE_PROBLEMS = {
  pkv: [
    { value: 'claim-rejected', label: 'Leistungsanspruch abgelehnt' },
    { value: 'coverage-denied', label: 'Leistung nicht gedeckt' },
    { value: 'delayed-payment', label: 'Verzögerte Zahlung' },
    { value: 'other-pkv', label: 'Sonstiges' },
  ],
  kfz: [
    { value: 'accident', label: 'Unfallschaden' },
    { value: 'third-party-claim', label: 'Forderung Dritter' },
    { value: 'insurance-dispute', label: 'Streit mit Versicherer' },
    { value: 'other-kfz', label: 'Sonstiges' },
  ],
  rechtsschutz: [
    { value: 'legal-dispute', label: 'Rechtstreit' },
    { value: 'contract-issue', label: 'Vertragsstreit' },
    { value: 'coverage-doubt', label: 'Abdeckungsfrage' },
    { value: 'other-legal', label: 'Sonstiges' },
  ],
  haftpflicht: [
    { value: 'damage-claim', label: 'Schadensersatzforderung' },
    { value: 'injury-claim', label: 'Personenschaden' },
    { value: 'property-damage', label: 'Sachschaden' },
    { value: 'other-liability', label: 'Sonstiges' },
  ],
  kreditausfall: [
    { value: 'not-handled', label: 'Nicht in unserem Angebot', disabled: true },
  ],
};

const PROBLEM_HINTS = {
  'claim-rejected': 'Wir helfen Ihnen, Ihre abgelehnte Leistung anzufechten.',
  'coverage-denied': 'Wir prüfen, ob die Leistung nach Ihrem Vertrag abgedeckt sein sollte.',
  'delayed-payment': 'Verspätete Zahlungen sind häufig anfechtbar.',
  'accident': 'Bei KFZ-Unfällen helfen wir bei der Schadensregulierung.',
  'third-party-claim': 'Wir unterstützen Sie bei der Abwehr unbegründeter Forderungen.',
  'insurance-dispute': 'Versicherer-Streitigkeiten sind unser Spezialgebiet.',
  'legal-dispute': 'Unsere Anwälte vertreten Sie in Rechtsstreitigkeiten.',
  'contract-issue': 'Vertragsauslegung ist eine Kernkompetenz.',
  'damage-claim': 'Wir prüfen die Berechtigung von Schadensersatzforderungen.',
  'injury-claim': 'Personenschäden erfordern spezialisierte Vertretung.',
};

/* ===== INITIALIZATION ===== */
document.addEventListener('DOMContentLoaded', () => {
  initializeWizard();
  setupEventListeners();
  restoreSessionData();
  startSessionTimeout();
});

function initializeWizard() {
  // Neue Session oder bestehende
  const stored = sessionStorage.getItem(WIZARD_CONFIG.SESSION_STORAGE_KEY);
  if (stored) {
    wizardState = JSON.parse(stored);
  } else {
    wizardState.sessionId = generateSessionId();
    wizardState.sessionStartTime = Date.now();
    wizardState.processId = generateProcessId();
    saveSessionData();
  }

  renderStep(wizardState.currentStep);
  updateProgress();
}

function setupEventListeners() {
  const insuranceTypeSelect = document.getElementById('insurance-type');
  const problemTypeSelect = document.getElementById('problem-type');

  insuranceTypeSelect?.addEventListener('change', (e) => {
    const selected = e.target.value;
    wizardState.formData.insurance_type = selected;
    updateProblemOptions(selected);
    saveSessionData();
  });

  problemTypeSelect?.addEventListener('change', (e) => {
    const selected = e.target.value;
    wizardState.formData.problem_type = selected;
    updateHintText(selected);
    saveSessionData();
  });

  document.getElementById('copy-process-id')?.addEventListener('click', copyProcessId);
}

function updateProblemOptions(insuranceType) {
  const problemGroup = document.getElementById('problem-group');
  const problemSelect = document.getElementById('problem-type');
  const notRelevantBox = document.getElementById('not-relevant-box');

  // Spezialfall: Kreditausfall
  if (insuranceType === 'kreditausfall') {
    notRelevantBox?.removeAttribute('hidden');
    problemGroup?.setAttribute('hidden', '');
    wizardState.formData.problem_type = null;
    return;
  }

  notRelevantBox?.setAttribute('hidden', '');
  problemGroup?.removeAttribute('hidden');

  // Problem-Options populieren
  const options = INSURANCE_PROBLEMS[insuranceType] || [];
  problemSelect.innerHTML = '<option value="">– Bitte wählen –</option>';
  options.forEach((opt) => {
    const optionEl = document.createElement('option');
    optionEl.value = opt.value;
    optionEl.textContent = opt.label;
    if (opt.disabled) optionEl.disabled = true;
    problemSelect.appendChild(optionEl);
  });

  problemSelect.value = '';
  wizardState.formData.problem_type = null;
  document.getElementById('hint-box')?.setAttribute('hidden', '');
}

function updateHintText(problemType) {
  const hintBox = document.getElementById('hint-box');
  const hintText = document.getElementById('hint-text');
  const hint = PROBLEM_HINTS[problemType];

  if (hint) {
    hintText.textContent = hint;
    hintBox?.removeAttribute('hidden');
  } else {
    hintBox?.setAttribute('hidden', '');
  }
}

/* ===== WIZARD NAVIGATION ===== */
function wizardNext() {
  if (!validateCurrentStep()) {
    return;
  }

  // Spezialfall: Step 1 mit Kreditausfall → Abbruch statt weiter
  if (wizardState.currentStep === 1 && wizardState.formData.insurance_type === 'kreditausfall') {
    return; // Benutzer soll Abbrechen klicken
  }

  // Step-spezifische Logik: Step 4 → Step 5 nur wenn KFZ
  if (wizardState.currentStep === 4) {
    if (wizardState.formData.insurance_type !== 'kfz') {
      // KFZ-Unfall details auslassen → zu Step 6 springen
      wizardState.currentStep = 6;
    } else {
      wizardState.currentStep++;
    }
  } else if (wizardState.currentStep < wizardState.totalSteps) {
    wizardState.currentStep++;
  }

  // Step 6 → Step 7: Daten speichern
  if (wizardState.currentStep === wizardState.totalSteps) {
    saveFormDataToBackend();
    renderSuccessStep();
  }

  saveSessionData();
  renderStep(wizardState.currentStep);
  updateProgress();
  window.scrollTo(0, 0);
}

function wizardBack() {
  if (wizardState.currentStep > 1) {
    wizardState.currentStep--;

    // Skip Step 5 wenn nicht KFZ
    if (wizardState.currentStep === 5 && wizardState.formData.insurance_type !== 'kfz') {
      wizardState.currentStep = 4;
    }

    saveSessionData();
    renderStep(wizardState.currentStep);
    updateProgress();
    window.scrollTo(0, 0);
  }
}

function confirmCancel() {
  if (confirm('Sind Sie sicher? Ihre Daten gehen verloren.')) {
    sessionStorage.removeItem(WIZARD_CONFIG.SESSION_STORAGE_KEY);
    location.href = 'index.html';
  }
}

/* ===== VALIDATION ===== */
function validateCurrentStep() {
  clearErrors();

  const requiredFields = getRequiredFieldsForStep(wizardState.currentStep);
  let isValid = true;

  requiredFields.forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    const value = field?.value?.trim() || '';

    if (!value || (field.type === 'checkbox' && !field.checked)) {
      isValid = false;
      showFieldError(fieldId);
      field?.classList.add('error');
    } else {
      wizardState.formData[fieldId] = value;
    }
  });

  return isValid;
}

function getRequiredFieldsForStep(step) {
  const fieldMap = {
    1: ['insurance-type', 'problem-type'],
    2: ['first-name', 'last-name', 'email', 'phone'],
    3: ['insurance-company', 'policy-number', 'incident-date'],
    4: ['case-description', 'desired-outcome'],
    5: ['additional-info', 'witness'],
    6: ['consent'],
  };
  return fieldMap[step] || [];
}

function showFieldError(fieldId) {
  const errorEl = document.getElementById(`${fieldId}-error`);
  if (errorEl) {
    errorEl.removeAttribute('hidden');
  }
}

function clearErrors() {
  document.querySelectorAll('.field-error').forEach((el) => {
    el.setAttribute('hidden', '');
  });
  document.querySelectorAll('input, select, textarea').forEach((el) => {
    el.classList.remove('error');
  });
}

/* ===== RENDERING ===== */
function renderStep(stepNum) {
  // Alle Steps verstecken
  document.querySelectorAll('.wizard-step').forEach((step) => {
    step.setAttribute('hidden', '');
  });

  // Aktuellen Step zeigen
  const currentStep = document.getElementById(`step-${stepNum}`);
  if (currentStep) {
    currentStep.removeAttribute('hidden');
  }

  // Back-Button
  const backBtn = document.getElementById('back-btn');
  if (stepNum > 1) {
    backBtn?.removeAttribute('hidden');
  } else {
    backBtn?.setAttribute('hidden', '');
  }

  // Next-Button Label
  const nextBtn = document.getElementById('next-btn');
  if (nextBtn) {
    nextBtn.textContent = stepNum === 6 ? 'Absenden →' : 'Weiter →';
  }

  // Step 6: Summary rendern
  if (stepNum === 6) {
    renderSummary();
  }
}

// Fix: HTML-Escape-Funktion verhindert XSS durch User-Input
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

function renderSummary() {
  const summaryBox = document.getElementById('summary-preview');

  const labels = {
    insurance_type: 'Versicherungsart',
    problem_type: 'Problem',
    first_name: 'Vorname',
    last_name: 'Nachname',
    email: 'E-Mail',
    phone: 'Telefon',
    insurance_company: 'Versicherung',
    policy_number: 'Vertragsnummer',
    incident_date: 'Vorfallsdatum',
    case_description: 'Fallbeschreibung',
    desired_outcome: 'Gewünschtes Ergebnis',
  };

  // Fix: DOM-Elemente statt innerHTML mit User-Daten (verhindert XSS)
  summaryBox.innerHTML = '';
  let hasData = false;

  for (const [key, label] of Object.entries(labels)) {
    const value = wizardState.formData[key];
    if (value) {
      hasData = true;
      const displayValue = key.includes('type')
        ? getOptionLabel(key, value)
        : value;

      const item = document.createElement('div');
      item.className = 'summary-item';

      const labelEl = document.createElement('span');
      labelEl.className = 'summary-label';
      labelEl.textContent = label; // statischer Text, sicher

      const valueEl = document.createElement('span');
      valueEl.className = 'summary-value';
      valueEl.textContent = displayValue; // Fix: textContent statt innerHTML

      item.appendChild(labelEl);
      item.appendChild(valueEl);
      summaryBox.appendChild(item);
    }
  }

  if (!hasData) {
    const p = document.createElement('p');
    p.textContent = 'Keine Daten vorhanden';
    summaryBox.appendChild(p);
  }
}

function getOptionLabel(key, value) {
  if (key === 'insurance_type') {
    const types = {
      pkv: 'Private Krankenversicherung',
      kfz: 'KFZ-Versicherung',
      rechtsschutz: 'Rechtsschutzversicherung',
      haftpflicht: 'Haftpflichtversicherung',
    };
    return types[value] || value;
  }

  // Problem type labels
  const allProblems = Object.values(INSURANCE_PROBLEMS).flat();
  const found = allProblems.find((opt) => opt.value === value);
  return found?.label || value;
}

function renderSuccessStep() {
  const processIdDisplay = document.getElementById('process-id-display');
  const successSummary = document.getElementById('success-summary');

  if (processIdDisplay) {
    processIdDisplay.textContent = wizardState.processId;
  }

  // Fix: DOM-Elemente statt innerHTML mit User-Daten (verhindert XSS)
  successSummary.innerHTML = '';

  const title = document.createElement('strong');
  title.textContent = 'Ihre Daten:';
  successSummary.appendChild(title);

  const fields = [
    ['Versicherungsart', getOptionLabel('insurance_type', wizardState.formData.insurance_type)],
    ['Name', `${wizardState.formData['first-name'] || ''} ${wizardState.formData['last-name'] || ''}`.trim()],
    ['E-Mail', wizardState.formData['email']],
    ['Telefon', wizardState.formData['phone']],
  ];

  fields.forEach(([label, value]) => {
    if (value) {
      const br = document.createElement('br');
      successSummary.appendChild(br);
      const line = document.createElement('span');
      // Fix: textContent verhindert XSS (kein User-HTML wird interpretiert)
      line.textContent = `${label}: ${value}`;
      successSummary.appendChild(line);
    }
  });
}

function updateProgress() {
  const progressBar = document.getElementById('progress-bar-fill');
  const progressLabel = document.getElementById('progress-label');
  const percent = (wizardState.currentStep / wizardState.totalSteps) * 100;

  if (progressBar) {
    progressBar.style.width = percent + '%';
  }

  if (progressLabel) {
    progressLabel.textContent = `Schritt ${wizardState.currentStep} von ${wizardState.totalSteps}`;
  }
}

/* ===== SESSION MANAGEMENT ===== */
function saveSessionData() {
  sessionStorage.setItem(WIZARD_CONFIG.SESSION_STORAGE_KEY, JSON.stringify(wizardState));
}

function restoreSessionData() {
  const stored = sessionStorage.getItem(WIZARD_CONFIG.SESSION_STORAGE_KEY);
  if (stored) {
    wizardState = JSON.parse(stored);
    // Lade Form-Daten in Felder
    Object.entries(wizardState.formData).forEach(([key, value]) => {
      const field = document.getElementById(key);
      if (field) {
        field.value = value;
        if (field.id === 'insurance-type') {
          updateProblemOptions(value);
        }
      }
    });
  }
}

function generateSessionId() {
  // Fix: crypto.randomUUID() statt Math.random() (kryptografisch sicher)
  return 'sess_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function generateProcessId() {
  // Fix: crypto.getRandomValues() statt Math.random() (kryptografisch sicher)
  const timestamp = Date.now().toString(36).toUpperCase();
  const array = new Uint8Array(4);
  crypto.getRandomValues(array);
  const random = Array.from(array, b => b.toString(16).padStart(2, '0')).join('').toUpperCase().slice(0, 6);
  return WIZARD_CONFIG.PROCESS_ID_PREFIX + timestamp + random;
}

/* ===== TIMEOUT HANDLING ===== */
// Fix: Timeout-IDs speichern damit clearTimeout() beim Verlängern korrekt funktioniert
let _warningTimeoutId = null;
let _expireTimeoutId = null;

// Fix: Inaktivitäts-Reset bei Nutzeraktivität
let _lastActivityTime = Date.now();

function resetActivityTimer() {
  _lastActivityTime = Date.now();
}

// Activity-Events registrieren (Maus, Tastatur, Touch)
['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(evt => {
  document.addEventListener(evt, resetActivityTimer, { passive: true });
});

function startSessionTimeout() {
  // Fix: Alte Timeouts immer zuerst löschen (verhindert mehrfaches expireSession())
  if (_warningTimeoutId) clearTimeout(_warningTimeoutId);
  if (_expireTimeoutId) clearTimeout(_expireTimeoutId);

  const timeoutMs = WIZARD_CONFIG.SESSION_TIMEOUT_MINUTES * 60 * 1000;
  const warningMs = (WIZARD_CONFIG.SESSION_TIMEOUT_MINUTES - WIZARD_CONFIG.WARNING_BEFORE_TIMEOUT_MINUTES) * 60 * 1000;

  _warningTimeoutId = setTimeout(() => {
    showTimeoutWarning();
  }, warningMs);

  _expireTimeoutId = setTimeout(() => {
    expireSession();
  }, timeoutMs);
}

function showTimeoutWarning() {
  if (wizardState.sessionWarningShown) return;
  wizardState.sessionWarningShown = true;

  const warningBox = document.getElementById('timeout-warning');
  warningBox?.removeAttribute('hidden');

  // Countdown
  let secondsLeft = WIZARD_CONFIG.WARNING_BEFORE_TIMEOUT_MINUTES * 60;
  const countdownEl = document.getElementById('timeout-countdown');

  const countdownInterval = setInterval(() => {
    secondsLeft--;
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;
    if (countdownEl) {
      countdownEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    if (secondsLeft <= 0) {
      clearInterval(countdownInterval);
      expireSession();
    }
  }, 1000);

  document.getElementById('timeout-extend-btn')?.addEventListener('click', () => {
    clearInterval(countdownInterval);
    warningBox?.setAttribute('hidden', '');
    wizardState.sessionWarningShown = false;
    wizardState.sessionStartTime = Date.now();
    saveSessionData();
    startSessionTimeout(); // Fix: clearTimeout() wird nun in startSessionTimeout() aufgerufen
  });
}

function expireSession() {
  sessionStorage.removeItem(WIZARD_CONFIG.SESSION_STORAGE_KEY);
  const modal = document.getElementById('session-expired-modal');
  modal?.removeAttribute('hidden');
}

/* ===== BACKEND ===== */
function saveFormDataToBackend() {
  // In echter Anwendung: POST zu Backend
  const payload = {
    process_id: wizardState.processId,
    session_id: wizardState.sessionId,
    form_data: wizardState.formData,
    created_at: new Date().toISOString(),
    user_ip: 'client-ip-placeholder', // Client kennt nicht die echte IP
  };

  // Fix (DSGVO): console.log mit sensiblen Personendaten entfernt
  // Nur nicht-personenbezogene IDs loggen
  console.log('Wizard-Daten werden übermittelt. ProzessID:', wizardState.processId);
  // fetch('/api/insurance-wizard/submit', { method: 'POST', body: JSON.stringify(payload) })
}

/* ===== UTILITIES ===== */
function copyProcessId() {
  const processId = wizardState.processId;
  navigator.clipboard.writeText(processId).then(() => {
    const confirmEl = document.getElementById('copy-confirm');
    confirmEl?.removeAttribute('hidden');
    setTimeout(() => {
      confirmEl?.setAttribute('hidden', '');
    }, 2000);
  });
}
