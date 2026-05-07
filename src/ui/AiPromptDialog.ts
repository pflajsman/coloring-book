import { showModal } from './Modal';
import { GenerateError, generateColoringImage } from '../ai/generate';

// Web Speech API isn't typed in lib.dom for many TS targets — narrow it here
// rather than pulling in @types/dom-speech-recognition just for this file.
type SpeechRecognitionResultLike = { transcript: string };
type SpeechRecognitionEventLike = {
  results: { 0: { 0: SpeechRecognitionResultLike } } & ArrayLike<unknown>;
};
type SpeechRecognitionErrorEventLike = {
  error?: string;
  message?: string;
};
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
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
  // Receives the decoded ImageBitmap plus the raw prompt the user typed (used
  // as the default name when the kid saves the picture to "My pictures").
  // The dialog stays mounted until this resolves so the loading state covers
  // letterboxing/post-processing too.
  onGenerated: (bitmap: ImageBitmap, prompt: string) => Promise<void>;
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
  //
  // Default to the browser's UI language (e.g. cs-CZ for Czech speakers).
  // Forcing en-US silently dropped non-English utterances — Chrome returns
  // no result rather than mis-transcribing.
  let recognition: SpeechRecognitionLike | null = null;
  let listening = false;
  const recogLang = navigator.language || 'en-US';
  if (micBtn && SpeechCtor) {
    micBtn.addEventListener('click', () => {
      if (listening) {
        recognition?.stop();
        return;
      }
      // Clear any prior error each time the user re-tries the mic.
      error.style.display = 'none';
      try {
        recognition = new SpeechCtor();
      } catch (constructErr) {
        console.warn('SpeechRecognition construction failed', constructErr);
        showError("Microphone isn't working in this browser.");
        micBtn?.remove();
        return;
      }
      recognition.lang = recogLang;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;
      recognition.onstart = () => {
        listening = true;
        micBtn?.classList.add('is-listening');
      };
      recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        input.value = transcript;
        generateBtn.disabled = transcript.trim().length === 0;
        input.focus();
      };
      recognition.onerror = (e) => {
        // The Web Speech error vocabulary: 'no-speech', 'not-allowed',
        // 'service-not-allowed', 'aborted', 'audio-capture', 'network',
        // 'language-not-supported'. Show a friendly message + log the raw
        // event so the console tells us what happened.
        console.warn('SpeechRecognition error', e);
        const code = e?.error;
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          showError('Microphone permission was blocked. Allow it in the address bar and try again.');
        } else if (code === 'no-speech') {
          showError("I didn't hear anything. Try again.");
        } else if (code === 'audio-capture') {
          showError('No microphone found.');
        } else if (code === 'language-not-supported') {
          showError(`This browser doesn't speak ${recogLang}. Type instead.`);
        } else if (code === 'network') {
          showError('Speech needs the internet. Check your connection.');
        } else if (code) {
          showError(`Mic error: ${code}. Try typing instead.`);
        }
      };
      recognition.onend = () => {
        listening = false;
        micBtn?.classList.remove('is-listening');
      };
      try {
        recognition.start();
      } catch (startErr) {
        // start() throws if called twice in quick succession or if mic is
        // unavailable. Log so we know which.
        console.warn('SpeechRecognition.start() threw', startErr);
        listening = false;
        micBtn?.classList.remove('is-listening');
        showError("Couldn't start the microphone. Try again.");
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
      await opts.onGenerated(bitmap, prompt);
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
