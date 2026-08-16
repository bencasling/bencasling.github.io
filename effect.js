// Subtle drift + mouse parallax for the RGB subpixel overlay.
(() => {
    const overlay = document.querySelector('.subpixel-overlay');
    if (!overlay) return;

    let driftX = 0;
    let driftY = 0;
    let mouseX = 0;
    let mouseY = 0;

    window.addEventListener('mousemove', (e) => {
        mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
        mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    const tick = (t) => {
        driftX = Math.sin(t / 4000) * 1.5 + mouseX * 1.5;
        driftY = Math.cos(t / 5000) * 1.5 + mouseY * 1.5;
        overlay.style.backgroundPosition =
            `${driftX}px ${driftY}px, ${driftX + 1}px ${driftY + 1}px, ${driftX + 2}px ${driftY + 2}px`;
        requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);

    const initCursorRipple = () => {
        const canvas = document.getElementById('ripple-canvas');
        if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const ctx = canvas.getContext('2d');

        const color = '137, 180, 250';

        let targetX = window.innerWidth / 2;
        let targetY = window.innerHeight / 2;
        let x = targetX;
        let y = targetY;
        let active = false;

        const resize = () => {
            canvas.width = window.innerWidth * devicePixelRatio;
            canvas.height = window.innerHeight * devicePixelRatio;
            canvas.style.width = window.innerWidth + 'px';
            canvas.style.height = window.innerHeight + 'px';
            ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
        };
        resize();
        window.addEventListener('resize', resize);

        window.addEventListener('mousemove', (e) => {
            targetX = e.clientX;
            targetY = e.clientY;
            active = true;
        });
        window.addEventListener('mouseleave', () => { active = false; });

        const radius = 110;
        let glitchX = 0;
        let glitchY = 0;

        const edgePoints = 28;
        const edgeJitter = new Array(edgePoints + 1).fill(0);
        let lastEdgeUpdate = 0;

        // persistent per-block wobble so opacity noise eases in/out instead of snapping
        const noiseBlock = 4;
        const noiseDpr = window.devicePixelRatio || 1;
        const noiseGridCols = Math.ceil((radius * 2 * noiseDpr) / noiseBlock) + 2;
        const noiseGridRows = noiseGridCols;
        const noiseCellCount = noiseGridCols * noiseGridRows;
        const noisePhase = new Float32Array(noiseCellCount);
        const noiseSpeed = new Float32Array(noiseCellCount);
        const noiseAmp = new Float32Array(noiseCellCount);
        for (let i = 0; i < noiseCellCount; i++) {
            noisePhase[i] = Math.random() * Math.PI * 2;
            noiseSpeed[i] = 0.001 + Math.random() * 0.005;
            noiseAmp[i] = 0.4;
        }

        const draw = (t) => {
            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

            if (active) {
                x += (targetX - x) * 0.22;
                y += (targetY - y) * 0.22;

                // tiny occasional glitch jump
                if (Math.random() < 0.03) {
                    glitchX = (Math.random() - 0.5) * 6;
                    glitchY = (Math.random() - 0.5) * 6;
                } else {
                    glitchX *= 0.8;
                    glitchY *= 0.8;
                }

                ctx.save();
                ctx.translate(x + glitchX, y + glitchY);

                const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
                gradient.addColorStop(0, `rgba(${color}, 0.16)`);
                gradient.addColorStop(0.4, `rgba(${color}, 0.08)`);
                gradient.addColorStop(1, `rgba(${color}, 0)`);
                ctx.fillStyle = gradient;

                // fuzzy edge: re-randomize perimeter offsets in discrete steps, not every frame,
                // so it reads as static/noise rather than a smooth morph
                if (t - lastEdgeUpdate > 90) {
                    lastEdgeUpdate = t;
                    for (let i = 0; i <= edgePoints; i++) {
                        edgeJitter[i] = (Math.random() - 0.5) * 8;
                    }
                }

                ctx.beginPath();
                for (let i = 0; i <= edgePoints; i++) {
                    const angle = (i / edgePoints) * Math.PI * 2;
                    const r = radius + edgeJitter[i];
                    const px = Math.cos(angle) * r;
                    const py = Math.sin(angle) * r;
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
                ctx.restore();

                // per-pixel opacity noise: nudge each pixel's alpha by up to +-10%
                const dpr = window.devicePixelRatio || 1;
                const left = Math.max(0, Math.floor((x + glitchX - radius) * dpr));
                const top = Math.max(0, Math.floor((y + glitchY - radius) * dpr));
                const w = Math.min(canvas.width - left, Math.ceil(radius * 2 * dpr));
                const h = Math.min(canvas.height - top, Math.ceil(radius * 2 * dpr));
                if (w > 0 && h > 0) {
                    const imgData = ctx.getImageData(left, top, w, h);
                    const data = imgData.data;
                    const block = noiseBlock;
                    for (let by = 0, rowIdx = 0; by < h; by += block, rowIdx++) {
                        for (let bx = 0, colIdx = 0; bx < w; bx += block, colIdx++) {
                            const cell = (rowIdx % noiseGridRows) * noiseGridCols + (colIdx % noiseGridCols);
                            const factor = 1 + noiseAmp[cell] * Math.sin(t * noiseSpeed[cell] + noisePhase[cell]);
                            for (let dy = 0; dy < block && by + dy < h; dy++) {
                                for (let dx = 0; dx < block && bx + dx < w; dx++) {
                                    const i = ((by + dy) * w + (bx + dx)) * 4 + 3;
                                    if (data[i] === 0) continue;
                                    data[i] = Math.min(255, Math.max(0, data[i] * factor));
                                }
                            }
                        }
                    }
                    ctx.putImageData(imgData, left, top);
                }
            }

            requestAnimationFrame(draw);
        };
        requestAnimationFrame(draw);
    };

    initCursorRipple();

    const loadJson = async (path) => {
        try {
            const res = await fetch(path);
            if (!res.ok) throw new Error(`${path}: ${res.status}`);
            return await res.json();
        } catch (err) {
            console.error('Failed to load', path, err);
            return [];
        }
    };

    const initInteractive = () => {
        const getPageItems = (page) => {
            if (!page) return [];
            if (page.id === 'experience') return Array.from(page.querySelectorAll('.tree-entry'));
            // if (page.id === 'projects') return Array.from(page.querySelectorAll('.project-card'));
            if (page.id === 'contact') return Array.from(page.querySelectorAll('.link'));
            return [];
        };

        const pageItemIndex = {};

        const toggleCollapse = (entry) => {
            const collapsed = entry.classList.toggle('collapsed');
            const toggle = entry.querySelector('.tree-toggle');
            if (toggle) {
                toggle.textContent = collapsed ? '▸ ' : '▾ ';
                toggle.setAttribute('aria-expanded', String(!collapsed));
            }
        };

        document.querySelectorAll('#experience .tree-toggle').forEach((toggle) => {
            toggle.addEventListener('click', () => toggleCollapse(toggle.closest('.tree-entry')));
        });

        const lockTreeWidth = () => {
            const tree = document.querySelector('.tree');
            if (!tree) return;
            if (window.matchMedia('(max-width: 700px)').matches) return;
            const clone = tree.cloneNode(true);
            clone.classList.add('tree');
            clone.style.position = 'absolute';
            clone.style.visibility = 'hidden';
            clone.style.width = 'auto';
            clone.style.maxWidth = 'none';
            clone.style.left = '-9999px';
            clone.style.top = '0';
            clone.querySelectorAll('.tree-entry.collapsed').forEach((entry) => entry.classList.remove('collapsed'));
            document.body.appendChild(clone);
            const width = clone.scrollWidth;
            document.body.removeChild(clone);
            tree.style.width = width + 'px';
        };
        lockTreeWidth();

        const updateItemSelection = (page) => {
            const items = getPageItems(page);
            const idx = pageItemIndex[page.id] || 0;
            items.forEach((item, i) => item.classList.toggle('item-selected', i === idx));
        };

        let focusMode = 'nav';

        const setFocusMode = (mode) => {
            focusMode = mode;
            document.querySelector('.nav').classList.toggle('pane-focused', mode === 'nav');
            const activePage = document.querySelector('.page.active');
            if (activePage) activePage.classList.toggle('pane-focused', mode === 'content');
        };

        const activatePage = (link, { skipHistory } = {}) => {
            const href = link.getAttribute('href');
            const target = document.querySelector(href);
            if (!target) return;

            document.querySelectorAll('.page.active').forEach((page) => page.classList.remove('active'));
            document.querySelectorAll('.nav a.active').forEach((navLink) => {
                navLink.classList.remove('active');
                navLink.removeAttribute('aria-current');
            });

            target.classList.add('active', 'glitch');
            link.classList.add('active');
            link.setAttribute('aria-current', 'page');
            setTimeout(() => target.classList.remove('glitch'), 250);

            target.scrollTop = 0;
            window.scrollTo(0, 0);

            pageItemIndex[target.id] = 0;
            updateItemSelection(target);
            setFocusMode(getPageItems(target).length ? 'content' : 'nav');

            const index = navLinks.indexOf(link);
            if (index !== -1) setSelected(index);

            if (!skipHistory && window.location.hash !== href) {
                history.pushState(null, '', href);
            }
        };

        document.querySelectorAll('.nav a').forEach((link) => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                activatePage(link);
            });
        });

        const navLinks = Array.from(document.querySelectorAll('.nav-links .nav-link'));
        let selectedIndex = Math.max(navLinks.findIndex((link) => link.classList.contains('active')), 0);

        const setSelected = (index) => {
            selectedIndex = index;
            navLinks.forEach((link, i) => link.classList.toggle('selected', i === selectedIndex));
        };

        const initialLink = navLinks.find((link) => link.getAttribute('href') === window.location.hash);
        if (initialLink) {
            activatePage(initialLink, { skipHistory: true });
        } else {
            setSelected(selectedIndex);
            updateItemSelection(document.querySelector('.page.active'));
        }

        window.addEventListener('popstate', () => {
            const hash = window.location.hash || '#hero';
            const link = navLinks.find((l) => l.getAttribute('href') === hash);
            if (link) activatePage(link, { skipHistory: true });
        });

        if (!initialLink) setFocusMode('nav');

        document.addEventListener('keydown', (e) => {
            const activePage = document.querySelector('.page.active');
            const items = getPageItems(activePage);

            if (e.key === 'ArrowRight') {
                e.preventDefault();
                if (items.length) setFocusMode('content');
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setFocusMode('nav');
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (focusMode === 'content' && items.length) {
                    const idx = ((pageItemIndex[activePage.id] || 0) + 1) % items.length;
                    pageItemIndex[activePage.id] = idx;
                    updateItemSelection(activePage);
                } else {
                    setSelected((selectedIndex + 1) % navLinks.length);
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (focusMode === 'content' && items.length) {
                    const idx = ((pageItemIndex[activePage.id] || 0) - 1 + items.length) % items.length;
                    pageItemIndex[activePage.id] = idx;
                    updateItemSelection(activePage);
                } else {
                    setSelected((selectedIndex - 1 + navLinks.length) % navLinks.length);
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (focusMode === 'content' && items.length) {
                    const selectedItem = items[pageItemIndex[activePage.id] || 0];
                    if (activePage.id === 'experience') {
                        toggleCollapse(selectedItem);
                    } else {
                        const itemLink = selectedItem && (selectedItem.matches('a, button') ? selectedItem : selectedItem.querySelector('a, button'));
                        if (itemLink) itemLink.click();
                    }
                } else {
                    navLinks[selectedIndex].click();
                }
            }
        });
    };

    const streamPortrait = (pre, rows) => {
        pre.textContent = '';
        pre.style.visibility = 'visible';

        const ops = [];
        rows.forEach((row, i) => {
            if (i > 0) ops.push({ newline: true });
            row.forEach((run) => ops.push({ run }));
        });

        const totalChars = ops.reduce((sum, op) => sum + (op.run ? op.run.t.length : 0), 0);
        const targetFrames = 20;
        const charsPerFrame = Math.max(1, Math.ceil(totalChars / targetFrames));

        let opIndex = 0;
        let node = null;
        let charIndex = 0;

        return new Promise((resolve) => {
            const step = () => {
                for (let i = 0; i < charsPerFrame && opIndex < ops.length; i++) {
                    const op = ops[opIndex];
                    if (op.newline) {
                        pre.appendChild(document.createTextNode('\n'));
                        opIndex++;
                        continue;
                    }
                    if (!node) {
                        node = op.run.c
                            ? document.createElement('span')
                            : document.createTextNode('');
                        if (op.run.c) node.style.color = `rgb(${op.run.c.join(',')})`;
                        pre.appendChild(node);
                        charIndex = 0;
                    }
                    node.textContent += op.run.t[charIndex];
                    charIndex++;
                    if (charIndex >= op.run.t.length) {
                        node = null;
                        opIndex++;
                    }
                }
                if (opIndex < ops.length) {
                    requestAnimationFrame(step);
                } else {
                    resolve();
                }
            };
            requestAnimationFrame(step);
        });
    };

    const initContactForm = () => {
        const toggle = document.getElementById('email-toggle');
        const toggleIcon = document.getElementById('email-toggle-icon');
        const toggleLabel = document.getElementById('email-toggle-label');
        const wrap = document.getElementById('contact-form-wrap');

        const resetToggle = () => {
            toggle.classList.remove('sent');
            toggleIcon.className = 'fa fa-envelope fa-2x';
            toggleLabel.textContent = 'send an email';
        };

        if (toggle && wrap) {
            toggle.addEventListener('click', () => {
                const expanded = wrap.classList.toggle('expanded');
                toggle.setAttribute('aria-expanded', String(expanded));
                if (expanded) {
                    if (toggle.classList.contains('sent')) resetToggle();
                    const nameField = wrap.querySelector('input[name="name"]');
                    setTimeout(() => nameField && nameField.focus(), 350);
                }
            });
        }

        const form = document.getElementById('contact-form');
        const status = document.getElementById('form-status');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = form.querySelector('.form-submit');
            submitBtn.disabled = true;
            status.textContent = 'sending...';
            status.className = 'form-status';

            try {
                const res = await fetch('https://api.web3forms.com/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify(Object.fromEntries(new FormData(form))),
                });
                const data = await res.json();
                if (data.success) {
                    status.textContent = 'Thanks — your email has been sent!';
                    status.className = 'form-status success';
                    form.reset();

                    toggle.classList.add('sent');
                    toggleIcon.className = 'fa fa-check fa-2x';
                    toggleLabel.textContent = 'message sent';

                    setTimeout(() => {
                        wrap.classList.remove('expanded');
                        toggle.setAttribute('aria-expanded', 'false');
                    }, 1200);
                } else {
                    throw new Error(data.message || 'Submission failed');
                }
            } catch (err) {
                status.textContent = 'Something went wrong — try again later.';
                status.className = 'form-status error';
            } finally {
                submitBtn.disabled = false;
            }
        });
    };

    const init = () => {
        initInteractive();
        initContactForm();
    };

    init();

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const typeChars = async (node, text, speed) => {
        node.textContent = '';
        for (const ch of text) {
            node.textContent += ch;
            await sleep(speed);
        }
    };

    const bootHero = async () => {
        const cmd = document.getElementById('typed-command');
        const cursor = document.getElementById('typing-cursor');
        const loading = document.getElementById('loading-line');
        const output = document.getElementById('output-line');
        const portrait = document.getElementById('ascii-portrait');
        if (!cmd || !loading || !output) return;

        const portraitRowsPromise = portrait ? loadJson('./data/ascii-portrait.json') : null;

        await typeChars(cmd, 'whoami', 90);
        await sleep(300);
        if (cursor) cursor.style.display = 'none';

        for (let i = 0; i < 2; i++) {
            for (let dots = 1; dots <= 3; dots++) {
                loading.textContent = 'loading' + '.'.repeat(dots);
                await sleep(180);
            }
        }

        await sleep(150);
        loading.textContent = '';
        if (portraitRowsPromise) {
            const rows = await portraitRowsPromise;
            await streamPortrait(portrait, rows);
            portrait.classList.add('glitch-soft');
            setTimeout(() => portrait.classList.remove('glitch-soft'), 250);
        }
        output.style.visibility = 'visible';
        output.classList.add('glitch');
        setTimeout(() => output.classList.remove('glitch'), 250);
    };

    bootHero();
})();
