const LS_PREFIX = 'pendulum.settings.';

function load(key: string): string {
  return localStorage.getItem(LS_PREFIX + key) ?? '';
}

function save(key: string, value: string) {
  if (value) localStorage.setItem(LS_PREFIX + key, value);
  else localStorage.removeItem(LS_PREFIX + key);
}

export function getBridgeUrl(): string {
  const host = load('bridgeHost') || location.hostname || 'localhost';
  const port = load('bridgePort') || '9001';
  return `ws://${host}:${port}`;
}

export function installSettings() {
  const panel = document.getElementById('settings')!;

  window.addEventListener('keydown', (e) => {
    if (e.key === 's' && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement)) {
      document.body.classList.toggle('settings');
    }
  });

  const autoHost = location.hostname || 'localhost';

  panel.innerHTML = `
    <h3>connection</h3>
    <label>Bridge WS host
      <input id="s-host" type="text" placeholder="${autoHost} (auto)" spellcheck="false" />
    </label>
    <label>Bridge WS port
      <input id="s-port" type="text" placeholder="9001" spellcheck="false" />
    </label>
    <div class="s-row">
      <button id="s-save">save &amp; reconnect</button>
      <span id="s-status"></span>
    </div>
    <div class="s-hint">current: <code id="s-url"></code></div>
    <div class="s-hint">press <kbd>s</kbd> to close · <kbd>d</kbd> debug · <kbd>f</kbd> fullscreen</div>
  `;

  const hostInput = panel.querySelector<HTMLInputElement>('#s-host')!;
  const portInput = panel.querySelector<HTMLInputElement>('#s-port')!;
  const saveBtn = panel.querySelector<HTMLButtonElement>('#s-save')!;
  const status = panel.querySelector<HTMLSpanElement>('#s-status')!;
  const urlDisplay = panel.querySelector<HTMLElement>('#s-url')!;

  hostInput.value = load('bridgeHost');
  portInput.value = load('bridgePort');
  urlDisplay.textContent = getBridgeUrl();

  const updatePreview = () => {
    const h = hostInput.value.trim() || autoHost;
    const p = portInput.value.trim() || '9001';
    urlDisplay.textContent = `ws://${h}:${p}`;
  };
  hostInput.addEventListener('input', updatePreview);
  portInput.addEventListener('input', updatePreview);

  saveBtn.onclick = () => {
    save('bridgeHost', hostInput.value.trim());
    save('bridgePort', portInput.value.trim());
    status.textContent = 'saved — reloading…';
    setTimeout(() => location.reload(), 400);
  };
}
