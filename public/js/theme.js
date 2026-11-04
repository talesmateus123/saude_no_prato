const themeStorageKey = 'prato-vivo-theme';
const themeButtons = [...document.querySelectorAll('[data-theme-toggle]')];
const themeLabels = [...document.querySelectorAll('[data-theme-label]')];
const themeMeta = document.querySelector('meta[name="theme-color"]');

function syncThemeControls(theme) {
    const isDark = theme === 'dark';
    themeButtons.forEach((button) => {
        button.setAttribute('aria-label', `Modo ${isDark ? 'claro' : 'escuro'}`);
        button.setAttribute('aria-pressed', String(isDark));
        button.querySelector('.theme-icon').textContent = isDark ? '\u2600' : '\u263e';
        button.title = `Modo ${isDark ? 'claro' : 'escuro'}`;
    });
    themeLabels.forEach((label) => {
        label.textContent = `Modo ${isDark ? 'claro' : 'escuro'}`;
    });
    if (themeMeta) themeMeta.content = isDark ? '#171c1b' : '#f7f4ee';
}

function pixelTransition(theme, origin = { x: window.innerWidth / 2, y: window.innerHeight / 2 }) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const size = 72;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const columns = Math.ceil(viewportWidth / size);
    const rows = Math.ceil(viewportHeight / size);
    const overlay = document.createElement('div');
    overlay.className = 'theme-pixel-transition';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.setProperty('--pixel-columns', columns);
    overlay.style.setProperty('--pixel-rows', rows);
    overlay.style.setProperty('--pixel-size', `${size}px`);
    overlay.style.setProperty('--pixel-color', theme === 'dark' ? '#171c1b' : '#f7f4ee');
    const resolutionTargets = [...document.querySelectorAll('.app-shell > .sidebar, .app-shell > .main-content, .student-shell')];
    resolutionTargets.forEach((target) => target.classList.add('theme-resolution-blur'));

    const finishTransition = () => {
        overlay.remove();
        resolutionTargets.forEach((target) => target.classList.remove('theme-resolution-blur'));
    };

    const fragment = document.createDocumentFragment();
    const distances = Array.from({ length: columns * rows }, (_, index) => {
        const x = (index % columns + 0.5) * size;
        const y = (Math.floor(index / columns) + 0.5) * size;
        return Math.hypot(x - origin.x, y - origin.y);
    });
    const maxDistance = Math.max(...distances, 1);
    let remainingPixels = distances.length;

    for (let index = 0; index < columns * rows; index += 1) {
        const pixel = document.createElement('span');
        pixel.className = 'theme-pixel';
        pixel.style.setProperty('--pixel-delay', `${Math.round(distances[index] / maxDistance * 420 + Math.random() * 18)}ms`);
        pixel.addEventListener('animationend', () => {
            remainingPixels -= 1;
            if (remainingPixels === 0) finishTransition();
        }, { once: true });
        fragment.append(pixel);
    }
    overlay.append(fragment);
    document.body.append(overlay);
    window.setTimeout(finishTransition, 1200);
}

function applyTheme(theme, animate = false, origin) {
    const selectedTheme = theme === 'dark' ? 'dark' : 'light';
    const previousTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    if (animate && selectedTheme !== previousTheme) pixelTransition(selectedTheme, origin);
    document.documentElement.dataset.theme = selectedTheme;
    syncThemeControls(selectedTheme);
}

const currentTheme = localStorage.getItem(themeStorageKey) === 'dark' ? 'dark' : 'light';
applyTheme(currentTheme);

themeButtons.forEach((button) => button.addEventListener('click', () => {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    const bounds = button.getBoundingClientRect();
    const origin = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    localStorage.setItem(themeStorageKey, nextTheme);
    applyTheme(nextTheme, true, origin);
}));

window.addEventListener('storage', (event) => {
    if (event.key === themeStorageKey) applyTheme(event.newValue === 'dark' ? 'dark' : 'light', true);
});
