// First-run setup screens. A page sets <body class="setup-page" data-step="N"> and an
// <h1 class="setup-title" data-words="English|Italiano|Română|中文">; this script does the rest:
// the word carried over from the previous screen warps into this screen's title, then the
// title keeps cycling through its languages like the greeting on the welcome screen.
//   MWSetup.go(url)            -> leaves the screen, handing the current word to the next one
//   MWSetup.flyToTitle(source) -> welcome screen only: moves a word into the title corner
(function () {
    const CARRY_KEY = "mwSetupCarry";
    const TOTAL_STEPS = 6;
    const COLLAPSE_MS = 1500;
    const COLLAPSE_STAGGER_MS = 450;
    const CYCLE_MS = 2500;
    const LEAVE_MS = 350;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const STAR_PATHS = [
        "M72.9748 4.25183C75.5281 -1.41728 83.4575 -1.41728 86.0108 4.25183L106.728 50.2512C107.428 51.806 108.645 53.061 110.165 53.796L154.899 75.4297C160.347 78.0649 160.347 85.9423 154.899 88.5774L110.165 110.211C108.645 110.946 107.428 112.201 106.728 113.757L86.0108 159.756C83.4575 165.425 75.5281 165.425 72.9748 159.756L52.2574 113.757C51.5571 112.201 50.3404 110.946 48.8206 110.211L4.08662 88.5774C-1.36221 85.9423 -1.36221 78.0649 4.08662 75.4297L48.8206 53.796C50.3404 53.061 51.5571 51.806 52.2574 50.2512L72.9748 4.25183Z",
        "M98.1534 300.321C100.782 294.908 108.382 294.908 111.01 300.321L131.75 343.038C132.494 344.569 133.744 345.788 135.283 346.477L178.735 365.97C184.431 368.526 184.431 376.736 178.735 379.292L135.283 398.785C133.744 399.474 132.494 400.692 131.75 402.224L111.01 444.94C108.382 450.354 100.782 450.354 98.1534 444.94L77.4139 402.224C76.67 400.692 75.4196 399.474 73.8812 398.785L30.4288 379.292C24.7327 376.736 24.7328 368.526 30.4288 365.97L73.8812 346.477C75.4196 345.788 76.67 344.569 77.4139 343.038L98.1534 300.321Z",
        "M269.613 33.8688C275.108 21.4695 292.44 21.4695 297.935 33.8688L343.608 136.923C345.105 140.3 347.723 143.035 351.005 144.648L450.201 193.399C461.889 199.144 461.889 216.055 450.201 221.799L351.005 270.55C347.723 272.163 345.105 274.898 343.608 278.275L297.935 381.329C292.44 393.729 275.108 393.729 269.613 381.329L223.94 278.275C222.443 274.898 219.825 272.163 216.543 270.55L117.347 221.799C105.659 216.055 105.659 199.144 117.347 193.399L216.543 144.648C219.825 143.035 222.443 140.3 223.94 136.923L269.613 33.8688Z"
    ];

    const svgStar = (path, viewBox = "0 0 459 449") => `<svg viewBox="${viewBox}" aria-hidden="true"><path d="${path}"/></svg>`;

    function addWord(title, text, state) {
        const word = document.createElement("span");
        word.className = `setup-word ${state}`;
        word.textContent = text;
        word.setAttribute("aria-hidden", "true");
        title.appendChild(word);
        const room = title.clientWidth;
        if (word.offsetWidth * 1.08 > room) {
            word.style.fontSize = `${parseFloat(getComputedStyle(word).fontSize) * room / (word.offsetWidth * 1.08)}px`;
        }
        return word;
    }

    function warp(title, text) {
        const current = title.querySelector(".setup-word.active");
        const next = addWord(title, text, "enter");
        void next.offsetWidth;
        if (current) {
            current.classList.replace("active", "leave");
            setTimeout(() => current.remove(), 800);
        }
        next.classList.replace("enter", "active");
    }

    function startTitle() {
        const title = document.querySelector(".setup-title");
        const words = title.dataset.words.split("|");
        const language = (window.mariowOSI18n && mariowOSI18n.language) || "en";
        let index = language === "it" ? 1 : 0;
        title.textContent = "";
        title.setAttribute("aria-label", words[index]);

        const carried = sessionStorage.getItem(CARRY_KEY);
        sessionStorage.removeItem(CARRY_KEY);
        if (carried && !reducedMotion) {
            addWord(title, carried, "active");
            setTimeout(() => warp(title, words[index]), LEAVE_MS);
        } else if (reducedMotion) {
            addWord(title, words[index], "active");
            return;
        } else {
            warp(title, words[index]);
        }
        setInterval(() => {
            index = (index + 1) % words.length;
            warp(title, words[index]);
        }, CYCLE_MS + 1000);
    }

    // Same seed on every page: the pattern must not change between screens.
    function seededRandom(seed) {
        return () => {
            seed = (seed + 0x6D2B79F5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // One layer normally. The last step splits the same sky into one layer per logo piece, so
    // each piece can close on its own (see collapseStars).
    function drawStars(firstStep, layerCount) {
        // Sized from the screen, so resizing doesn't change the sky. The window is the floor:
        // it can be larger than the screen, and some embedders report a screen of 0x0.
        const SIZE = Math.ceil(Math.max(Math.hypot(screen.width, screen.height), Math.hypot(innerWidth, innerHeight)));
        const R = SIZE / 2;
        const COUNT = Math.round(Math.PI * R * R * 0.0009);
        const scale = Math.min(window.devicePixelRatio || 1, layerCount > 1 ? 1 : 1.5);
        const canvases = Array.from({ length: layerCount }, () => {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = Math.round(SIZE * scale);
            canvas.className = "setup-stars";
            canvas.setAttribute("aria-hidden", "true");
            if (firstStep) canvas.classList.add("fade-in");
            // Timed from the clock, so the rotation carries on across pages.
            canvas.style.animationDelay = `-${Date.now() % 180000}ms`;
            return canvas;
        });

        const contexts = canvases.map(canvas => canvas.getContext("2d"));
        const random = seededRandom(7);
        const paths = STAR_PATHS.map(path => new Path2D(path));
        for (let i = 0; i < COUNT; i++) {
            const ctx = contexts[i % layerCount];
            let x, y;
            do {
                x = random() * 2 - 1;
                y = random() * 2 - 1;
            } while (x * x + y * y > 1);
            const dTop = x * x + (y + 0.5) * (y + 0.5);
            const dBottom = x * x + (y - 0.5) * (y - 0.5);
            const isWhite = dTop <= 0.025 ? true : dBottom <= 0.025 ? false : dTop <= 0.25 ? false : dBottom <= 0.25 ? true : x <= 0;
            // Mostly small stars with a few bright ones, like a real night sky.
            const star = 7 + 16 * random() ** 3;
            ctx.setTransform(scale * star / 459, 0, 0, scale * star / 459, scale * (SIZE / 2 + x * R - star / 2), scale * (SIZE / 2 + y * R - star / 2));
            ctx.fillStyle = isWhite ? "#ffffff" : "rgba(255, 255, 255, 0.25)";
            ctx.fill(paths[i % 3]);
        }
        document.body.prepend(...canvases);
        return canvases;
    }

    // The welcome screen played backwards at full-page size: the yin-yang spins up like it does
    // there, then each logo piece gathers its stars and re-forms, the last to shatter first.
    // Only CSS transitions move the layers, so nothing is redrawn and the GPU does all the work.
    function collapseStars(layers, logo) {
        const pieces = [...logo.children];
        const finish = () => logo.classList.add("show");
        if (reducedMotion) {
            pieces.forEach(piece => piece.classList.add("show"));
            layers.forEach(layer => layer.classList.add("collapse"));
            return finish();
        }

        // Centre and width of the three pieces, in the logo's viewBox.
        const PIECES = [{ x: 79.5, y: 82, width: 160 }, { x: 104.5, y: 372.5, width: 157 }, { x: 283.7, y: 207.5, width: 351 }];
        const box = logo.getBoundingClientRect();
        const logoScale = box.width / 459;

        // 40 times faster is one turn every 9 seconds, the speed of the welcome screen.
        [4, 12, 40].forEach((rate, index) => setTimeout(() => {
            layers.forEach(layer => layer.getAnimations().forEach(spin => spin.updatePlaybackRate(rate)));
        }, index * 120));

        [2, 1, 0].forEach((group, order) => setTimeout(() => {
            const layer = layers[group], piece = PIECES[group];
            const x = box.left + box.width / 2 + (piece.x - 229.5) * logoScale - innerWidth / 2;
            const y = box.top + box.height / 2 + (piece.y - 224.5) * logoScale - innerHeight / 2;
            layer.classList.add("collapsing");
            layer.style.translate = `calc(-50% + ${x}px) calc(-50% + ${y}px)`;
            layer.style.scale = piece.width * logoScale / layer.offsetWidth;
            setTimeout(() => {
                pieces[group].classList.add("show");
                layer.classList.add("collapse");
            }, COLLAPSE_MS - 150);
        }, 500 + order * COLLAPSE_STAGGER_MS));

        setTimeout(finish, 500 + COLLAPSE_STAGGER_MS * 2 + COLLAPSE_MS);
    }

    function drawSteps(step) {
        const steps = document.createElement("div");
        steps.className = "setup-steps";
        steps.setAttribute("role", "img");
        steps.setAttribute("aria-label", mariowOSI18n.t("setup.step", "Step {current} of {total}", { current: step, total: TOTAL_STEPS }));
        for (let i = 1; i <= TOTAL_STEPS; i++) {
            steps.insertAdjacentHTML("beforeend", svgStar(STAR_PATHS[2], "100 18 368 379"));
            if (i <= step) steps.lastChild.classList.add(i === step ? "current" : "done");
        }
        document.body.appendChild(steps);
    }

    function wireToggles() {
        document.querySelectorAll(".toggle-container").forEach(toggle => {
            const sync = () => toggle.setAttribute("aria-checked", toggle.classList.contains("active"));
            sync();
            new MutationObserver(sync).observe(toggle, { attributes: true, attributeFilter: ["class"] });
            toggle.addEventListener("keydown", event => {
                if (event.key === " " || event.key === "Enter") {
                    event.preventDefault();
                    toggle.click();
                }
            });
        });
    }

    function go(url) {
        const word = document.querySelector(".setup-title .setup-word.active");
        if (word) sessionStorage.setItem(CARRY_KEY, word.textContent);
        document.body.classList.add("setup-leaving");
        setTimeout(() => { window.location.href = url; }, reducedMotion ? 0 : LEAVE_MS);
    }

    // Lands exactly where the next page shows its title, so the hand-over can't be seen.
    function flyToTitle(source) {
        const range = document.createRange();
        range.selectNodeContents(source);
        const from = range.getBoundingClientRect();
        const title = document.createElement("div");
        title.className = "setup-title";
        title.setAttribute("aria-hidden", "true");
        document.body.appendChild(title);
        const word = addWord(title, source.textContent, "active");
        const colour = addWord(title, source.textContent, "active");
        colour.classList.add("rainbow");
        const sourceShine = source.getAnimations().find(a => a.animationName === "shine");
        const shine = colour.getAnimations().find(a => a.animationName === "setup-shine");
        if (sourceShine && shine) shine.currentTime = sourceShine.currentTime;
        colour.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reducedMotion ? 0 : 1000, easing: "ease-in", fill: "forwards" });
        const to = word.getBoundingClientRect();
        const dx = from.left - to.left;
        const dy = (from.top + from.height / 2) - (to.top + to.height / 2);
        const size = parseFloat(getComputedStyle(source).fontSize) / parseFloat(getComputedStyle(word).fontSize);
        source.style.visibility = "hidden";
        return title.animate(
            [{ transform: `translate(${dx}px, ${dy}px) scale(${size})` }, { transform: "none" }],
            { duration: reducedMotion ? 0 : 1000, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
        ).finished;
    }

    function init() {
        const step = Number(document.body.dataset.step);
        if (!step) return;
        const sky = drawStars(step === 1, document.querySelector(".setup-logo") ? 3 : 1);
        drawSteps(step);
        startTitle();
        wireToggles();
        document.querySelectorAll("a.setup-next").forEach(link => link.addEventListener("click", event => {
            event.preventDefault();
            go(link.getAttribute("href"));
        }));

        const logo = document.querySelector(".setup-logo");
        if (logo) {
            logo.innerHTML = STAR_PATHS.map(path => svgStar(path)).join("");
            setTimeout(() => collapseStars(sky, logo), 900);
        }
    }

    // Coming back from the privacy notice restores the page as it was left.
    window.addEventListener("pageshow", event => {
        if (event.persisted) document.body.classList.remove("setup-leaving");
    });

    window.MWSetup = { go, flyToTitle, CYCLE_MS };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
