import { showModal } from './Modal';
import { GenerateError, generateColoringImage } from '../ai/generate';

// Web Speech API isn't typed in lib.dom for many TS targets — narrow it here
// rather than pulling in @types/dom-speech-recognition just for this file.
type SpeechRecognitionResultLike = { transcript: string };
type SpeechRecognitionEventLike = {
  results: { 0: { 0: SpeechRecognitionResultLike } } & ArrayLike<unknown>;
};
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type AiPromptOptions = {
  // Receives the decoded ImageBitmap and is responsible for installing it on
  // the line-art layer. The dialog stays mounted until this resolves so the
  // loading state covers letterboxing/post-processing too.
  onGenerated: (bitmap: ImageBitmap) => Promise<void>;
};

export function openAiPromptDialog(opts: AiPromptOptions): void {
  const body = document.createElement('div');
  body.className = 'ai-prompt-dialog';

  const hint = document.createElement('div');
  hint.className = 'ai-prompt-hint';
  hint.textContent = 'Tell me what to draw';

  const inputRow = document.createElement('div');
  inputRow.className = 'ai-prompt-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ai-prompt-input';
  input.maxLength = 80;
  input.placeholder = 'a unicorn riding a bike';
  input.autocomplete = 'off';
  input.spellcheck = false;
  inputRow.appendChild(input);

  // Mic button only when the browser supports speech recognition. iOS Safari
  // and some embedded webviews don't expose the API; rendering nothing is a
  // cleaner fallback than a button that does nothing.
  const SpeechCtor = getSpeechRecognition();
  let micBtn: HTMLButtonElement | null = null;
  if (SpeechCtor) {
    micBtn = document.createElement('button');
    micBtn.type = 'button';
    micBtn.className = 'ai-mic-btn';
    micBtn.setAttribute('aria-label', 'Speak');
    micBtn.innerHTML = micSvg();
    inputRow.appendChild(micBtn);
  }

  const generateBtn = document.createElement('button');
  generateBtn.type = 'button';
  generateBtn.className = 'ai-generate-btn';
  generateBtn.textContent = 'Make it';
  generateBtn.disabled = true;

  const error = document.createElement('div');
  error.className = 'ai-prompt-error';
  error.style.display = 'none';

  body.append(hint, inputRow, generateBtn, error);

  const destroy = showModal('Make a picture', body, { narrow: true });

  // Sync generate-button enablement to whether there's a prompt to send.
  input.addEventListener('input', () => {
    generateBtn.disabled = input.value.trim().length === 0;
    error.style.display = 'none';
  });
  // Enter key submits — common keyboard shortcut for chat-style inputs.
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !generateBtn.disabled) {
      e.preventDefault();
      void submit();
    }
  });

  // Speech recognition wiring. Single-utterance mode: tap mic, speak once,
  // result fills the input. Tapping again while listening stops it.
  let recognition: SpeechRecognitionLike | null = null;
  let listening = false;
  if (micBtn && SpeechCtor) {
    micBtn.addEventListener('click', () => {
      if (listening) {
        recognition?.stop();
        return;
      }
      try {
        recognition = new SpeechCtor();
      } catch {
        // Construction can throw on some platforms (e.g. user denied mic
        // permission earlier). Hide the button rather than spamming errors.
        micBtn?.remove();
        return;
      }
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;
      recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        input.value = transcript;
        generateBtn.disabled = transcript.trim().length === 0;
        input.focus();
      };
      recognition.onerror = () => {
        // Errors are usually no-speech / permission denied. Quietly drop —
        // typing still works and surfacing errors here would scare the kid.
      };
      recognition.onend = () => {
        listening = false;
        micBtn?.classList.remove('is-listening');
      };
      try {
        recognition.start();
        listening = true;
        micBtn?.classList.add('is-listening');
      } catch {
        // start() throws if called twice in quick succession.
        listening = false;
      }
    });
  }

  generateBtn.addEventListener('click', () => void submit());

  let inFlight = false;
  async function submit() {
    if (inFlight) return;
    const prompt = input.value.trim();
    if (!prompt) return;
    inFlight = true;
    setLoading(true);
    try {
      const bitmap = await generateColoringImage(prompt);
      await opts.onGenerated(bitmap);
      destroy();
    } catch (e) {
      const msg = e instanceof GenerateError ? e.message : "Something went wrong. Try again.";
      showError(msg);
    } finally {
      inFlight = false;
      setLoading(false);
    }
  }

  function setLoading(on: boolean) {
    if (on) {
      body.classList.add('is-loading');
      generateBtn.textContent = 'Drawing your picture…';
      generateBtn.disabled = true;
      input.disabled = true;
      if (micBtn) micBtn.disabled = true;
    } else {
      body.classList.remove('is-loading');
      generateBtn.textContent = 'Make it';
      generateBtn.disabled = input.value.trim().length === 0;
      input.disabled = false;
      if (micBtn) micBtn.disabled = false;
    }
  }

  function showError(msg: string) {
    error.textContent = msg;
    error.style.display = '';
  }

  // Focus the input so the kid (or parent) can start typing immediately
  // without the extra tap.
  setTimeout(() => input.focus(), 0);
}

function micSvg(): string {
  // Classic mic silhouette. Stroke matches the pink accent so it sits
  // visually with the dialog's other controls.
  return `<svg viewBox="0 0 32 32" fill="none" stroke="#e74c8e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="12" y="4" width="8" height="14" rx="4"/>
    <path d="M8 14 Q 8 22 16 22 Q 24 22 24 14"/>
    <line x1="16" y1="22" x2="16" y2="28"/>
    <line x1="11" y1="28" x2="21" y2="28"/>
  </svg>`;
}
