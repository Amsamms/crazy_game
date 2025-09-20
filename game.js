(() => {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");

    const hud = {
        score: document.getElementById("scoreValue"),
        combo: document.getElementById("comboValue"),
        lives: document.getElementById("livesValue"),
        level: document.getElementById("levelValue")
    };

    const startMenu = document.getElementById("startMenu");
    const startButton = document.getElementById("startButton");
    const gameOverMenu = document.getElementById("gameOverMenu");
    const restartButton = document.getElementById("restartButton");
    const finalScoreEl = document.getElementById("finalScore");
    const bestScoreEl = document.getElementById("bestScore");

    const audioToggle = document.getElementById("audioToggle");

    const player = {
        x: 0,
        y: 0,
        radius: 22,
        vx: 0,
        vy: 0,
        trailTimer: 0,
        hue: 180
    };

    const state = {
        playing: false,
        width: window.innerWidth,
        height: window.innerHeight,
        time: 0,
        score: 0,
        combo: 1,
        comboTimer: 0,
        lives: 3,
        level: 1,
        shieldTimer: 0,
        slowTimer: 0,
        godMode: false,
        godTapCount: 0,
        godTapTimer: 0,
        hazardInterval: 2.3,
        orbInterval: 0.75,
        shake: 0,
        bestScore: loadBestScore()
    };

    const timers = {
        orb: 0,
        hazard: 0.8,
        power: 9
    };

    const input = { up: false, down: false, left: false, right: false, shift: false };
    const pointerControl = { active: false, pointerId: null, x: 0, y: 0 };

    const orbs = [];
    const hazards = [];
    const powerUps = [];
    const particles = [];

    let lastTime = 0;
    let pixelRatio = window.devicePixelRatio || 1;
    let hudDirty = true;
    let lastPointerTapTime = 0;

    const audio = (() => {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            return {
                isSupported: () => false,
                isEnabled: () => false,
                resume: () => false,
                toggle: () => false,
                setEnabled: () => false,
                playOrb: () => {},
                playPower: () => {},
                playShield: () => {},
                playDamage: () => {},
                playLevel: () => {},
                playGameOver: () => {}
            };
        }

        let context = null;
        let masterGain;
        let musicGain;
        let fxGain;
        let padSource = null;
        let padGain = null;
        let patternTimer = null;
        let enabled = true;
        let started = false;
        let patternIndex = 0;

        const chords = [
            [174.61, 220.0, 261.63],
            [196.0, 246.94, 311.13],
            [164.81, 207.65, 246.94],
            [184.997, 233.082, 293.66]
        ];

        function ensureContext() {
            if (context) return true;
            try {
                context = new AudioContextClass();
            } catch (error) {
                console.warn('Audio context failed to start', error);
                return false;
            }

            masterGain = context.createGain();
            masterGain.gain.value = 0.72;
            masterGain.connect(context.destination);

            musicGain = context.createGain();
            musicGain.gain.value = 0.28;
            musicGain.connect(masterGain);

            fxGain = context.createGain();
            fxGain.gain.value = 0.6;
            fxGain.connect(masterGain);
            return true;
        }

        function createPadBuffer(ctx) {
            const seconds = 8;
            const length = ctx.sampleRate * seconds;
            const buffer = ctx.createBuffer(2, length, ctx.sampleRate);

            for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                const data = buffer.getChannelData(channel);
                for (let i = 0; i < length; i++) {
                    const t = i / ctx.sampleRate;
                    const env = Math.pow(Math.sin(Math.PI * (i / length)), 1.4);
                    const base = Math.sin(2 * Math.PI * (55 + 4 * Math.sin(t * 0.2)) * t);
                    const harmony = Math.sin(2 * Math.PI * (110 + 6 * Math.sin(t * 0.15 + channel)) * t);
                    const shimmer = Math.sin(2 * Math.PI * (440 + 30 * Math.sin(t * 0.35)) * t) * 0.2;
                    data[i] = (base * 0.55 + harmony * 0.35 + shimmer) * env * 0.6;
                }
            }

            return buffer;
        }

        function startPad() {
            if (!context || padSource) return;
            const buffer = createPadBuffer(context);
            padSource = context.createBufferSource();
            padSource.buffer = buffer;
            padSource.loop = true;

            padGain = context.createGain();
            padGain.gain.value = 0.42;
            padSource.connect(padGain);
            padGain.connect(musicGain);
            padSource.start();
        }

        function stopPad() {
            if (padSource) {
                try {
                    padSource.stop();
                } catch (error) {
                    // ignore
                }
                padSource.disconnect();
                padSource = null;
            }
            if (padGain) {
                padGain.disconnect();
                padGain = null;
            }
        }

        function schedulePattern() {
            if (!context || !enabled) return;
            const tempo = 108;
            const beat = 60 / tempo;
            const start = context.currentTime + 0.1;
            const chord = chords[patternIndex % chords.length];
            patternIndex += 1;

            for (let step = 0; step < 8; step++) {
                const time = start + step * (beat / 2);
                const note = chord[step % chord.length];
                playArp(note, time);
            }

            playBass(chord[0] / 2, start);

            const interval = beat * 8 * 1000;
            patternTimer = setTimeout(schedulePattern, interval);
        }

        function startPatternLoop() {
            if (patternTimer) return;
            schedulePattern();
        }

        function stopPatternLoop() {
            if (patternTimer) {
                clearTimeout(patternTimer);
                patternTimer = null;
            }
        }

        function playArp(freq, time) {
            if (!context) return;
            const osc = context.createOscillator();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, time);
            const gain = context.createGain();
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(0.22, time + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.45);
            const filter = context.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(freq * 4, time);
            filter.Q.value = 10;
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(musicGain);
            osc.start(time);
            osc.stop(time + 0.6);
        }

        function playBass(freq, time) {
            if (!context) return;
            const osc = context.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, time);
            osc.frequency.linearRampToValueAtTime(freq * 0.5, time + 0.8);
            const gain = context.createGain();
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(0.32, time + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + 1.6);
            const filter = context.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(freq * 2.5, time);
            filter.Q.value = 6;
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(musicGain);
            osc.start(time);
            osc.stop(time + 1.8);
        }

        function createNoiseBurst(duration = 0.25) {
            if (!context) return null;
            const length = Math.floor(context.sampleRate * duration);
            const buffer = context.createBuffer(1, length, context.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < length; i++) {
                const env = 1 - i / length;
                data[i] = (Math.random() * 2 - 1) * env;
            }
            const source = context.createBufferSource();
            source.buffer = buffer;
            return source;
        }

        function playOrb() {
            if (!isActive()) return;
            const start = context.currentTime;
            const osc = context.createOscillator();
            osc.type = 'sine';
            const initial = 520 + Math.random() * 220;
            osc.frequency.setValueAtTime(initial, start);
            osc.frequency.exponentialRampToValueAtTime(initial * 1.8, start + 0.18);

            const gain = context.createGain();
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.55, start + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.38);

            osc.connect(gain);
            gain.connect(fxGain);
            osc.start(start);
            osc.stop(start + 0.5);
        }

        function playPower() {
            if (!isActive()) return;
            const start = context.currentTime;
            const osc = context.createOscillator();
            osc.type = 'square';
            const base = 320;
            osc.frequency.setValueAtTime(base, start);
            osc.frequency.linearRampToValueAtTime(base * 2.2, start + 0.4);

            const gain = context.createGain();
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.42, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);

            const filter = context.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(base * 3, start);
            filter.Q.value = 8;

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(fxGain);
            osc.start(start);
            osc.stop(start + 0.7);
        }

        function playShield() {
            if (!isActive()) return;
            const start = context.currentTime;
            const noise = createNoiseBurst(0.5);
            if (!noise) return;
            const filter = context.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 600;

            const gain = context.createGain();
            gain.gain.setValueAtTime(0.4, start);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(fxGain);
            noise.start(start);
            noise.stop(start + 0.5);
        }

        function playDamage() {
            if (!isActive()) return;
            const start = context.currentTime;
            const osc = context.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(160, start);
            osc.frequency.exponentialRampToValueAtTime(60, start + 0.4);

            const gain = context.createGain();
            gain.gain.setValueAtTime(0.48, start);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);

            osc.connect(gain);
            gain.connect(fxGain);
            osc.start(start);
            osc.stop(start + 0.6);
        }

        function playLevel() {
            if (!isActive()) return;
            const start = context.currentTime;
            const freqs = [660, 880, 1046];
            freqs.forEach((freq, index) => {
                const time = start + index * 0.08;
                const osc = context.createOscillator();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, time);
                const gain = context.createGain();
                gain.gain.setValueAtTime(0, time);
                gain.gain.linearRampToValueAtTime(0.36, time + 0.03);
                gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.35);
                osc.connect(gain);
                gain.connect(fxGain);
                osc.start(time);
                osc.stop(time + 0.4);
            });
        }

        function playGameOver() {
            if (!isActive()) return;
            const start = context.currentTime;
            const osc = context.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(220, start);
            osc.frequency.exponentialRampToValueAtTime(55, start + 1.2);

            const gain = context.createGain();
            gain.gain.setValueAtTime(0.4, start);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.3);

            osc.connect(gain);
            gain.connect(fxGain);
            osc.start(start);
            osc.stop(start + 1.4);
        }

        function isActive() {
            if (!enabled) return false;
            if (!ensureContext()) return false;
            if (context.state === 'suspended') {
                context.resume().catch(() => {});
            }
            if (!started) {
                started = true;
                startPad();
                startPatternLoop();
            }
            return true;
        }

        function setEnabled(value) {
            enabled = value;
            if (!value) {
                stopPatternLoop();
                stopPad();
                if (context && context.state !== 'closed') {
                    context.suspend().catch(() => {});
                }
                return enabled;
            }
            if (ensureContext()) {
                context.resume().catch(() => {});
                startPad();
                startPatternLoop();
            }
            return enabled;
        }

        function resume() {
            if (!enabled) return enabled;
            if (ensureContext()) {
                context.resume().catch(() => {});
                startPad();
                startPatternLoop();
            }
            return enabled;
        }

        function toggle() {
            return setEnabled(!enabled);
        }

        return {
            isSupported: () => true,
            isEnabled: () => enabled,
            resume,
            toggle,
            setEnabled,
            playOrb,
            playPower,
            playShield,
            playDamage,
            playLevel,
            playGameOver
        };
    })();

    function updateAudioToggle() {
        if (!audioToggle) return;
        if (!audio.isSupported()) {
            audioToggle.textContent = 'Sound N/A';
            audioToggle.disabled = true;
            audioToggle.setAttribute('aria-pressed', 'false');
            return;
        }
        const enabled = audio.isEnabled();
        audioToggle.disabled = false;
        audioToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        audioToggle.textContent = enabled ? 'Sound On' : 'Sound Off';
    }

    updateAudioToggle();
    if (audioToggle) {
        audioToggle.addEventListener('click', () => {
            if (!audio.isSupported()) return;
            const enabled = audio.toggle();
            if (enabled) {
                audio.resume();
            }
            updateAudioToggle();
        });
    }

    function loadBestScore() {
        try {
            return Number(localStorage.getItem("chromatic-surge-best") || 0);
        } catch (error) {
            return 0;
        }
    }

    function persistBestScore(value) {
        try {
            localStorage.setItem("chromatic-surge-best", value.toString());
        } catch (error) {
            // storage may be unavailable in some contexts; ignore failures
        }
    }

    function resize() {
        pixelRatio = window.devicePixelRatio || 1;
        state.width = window.innerWidth;
        state.height = window.innerHeight;
        canvas.width = state.width * pixelRatio;
        canvas.height = state.height * pixelRatio;
        canvas.style.width = `${state.width}px`;
        canvas.style.height = `${state.height}px`;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(pixelRatio, pixelRatio);
    }

    resize();
    window.addEventListener("resize", resize);

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function rand(min, max) {
        return Math.random() * (max - min) + min;
    }

    function distSq(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return dx * dx + dy * dy;
    }

    function pickHue() {
        return rand(150, 330);
    }

    function queueHUDUpdate() {
        hudDirty = true;
    }

    function getTargetOrbCount() {
        return 6 + Math.floor(state.level / 2);
    }

    function updateHUD() {
        if (!hudDirty) return;
        hud.score.textContent = state.score.toString();
        hud.combo.textContent = `${state.combo}x`;
        hud.lives.textContent = state.lives.toString();
        hud.level.textContent = state.level.toString();
        hudDirty = false;
    }

    function resetGame() {
        state.playing = true;
        state.time = 0;
        state.score = 0;
        state.combo = 1;
        state.comboTimer = 0;
        state.lives = 3;
        state.level = 1;
        state.shieldTimer = 0;
        state.slowTimer = 0;
        state.godMode = false;
        state.godTapCount = 0;
        state.godTapTimer = 0;
        state.hazardInterval = 2.3;
        state.orbInterval = 0.75;
        state.shake = 0;

        timers.orb = 0.2;
        timers.hazard = 1.3;
        timers.power = rand(8, 13);

        orbs.length = 0;
        hazards.length = 0;
        powerUps.length = 0;
        particles.length = 0;

        pointerControl.active = false;
        pointerControl.pointerId = null;

        player.x = state.width / 2;
        player.y = state.height / 2;
        player.vx = 0;
        player.vy = 0;
        player.hue = 180;

        for (let i = 0; i < 7; i++) {
            spawnOrb(true);
        }

        queueHUDUpdate();
    }

    function startGame() {
        resetGame();
        audio.resume();
        startMenu.setAttribute("hidden", "hidden");
        gameOverMenu.setAttribute("hidden", "hidden");
        lastTime = performance.now();
        requestAnimationFrame(loop);
    }

    function gameOver() {
        state.playing = false;
        finalScoreEl.textContent = `Score: ${state.score}`;
        if (state.score > state.bestScore) {
            state.bestScore = state.score;
            persistBestScore(state.bestScore);
        }
        bestScoreEl.textContent = `Best: ${state.bestScore}`;
        audio.playGameOver();
        gameOverMenu.removeAttribute("hidden");
    }

    function spawnOrb(initial = false) {
        const protectionRadius = initial ? 180 : 120;
        let tries = 0;
        let orb;
        do {
            orb = {
                x: rand(80, state.width - 80),
                y: rand(80, state.height - 80),
                baseRadius: rand(12, 20),
                radius: 0,
                pulse: rand(0, Math.PI * 2),
                hue: pickHue(),
                drift: rand(-0.25, 0.25),
                life: 0
            };
            tries += 1;
        } while (distSq(orb, player) < protectionRadius * protectionRadius && tries < 8);
        orb.radius = orb.baseRadius;
        orbs.push(orb);
    }

    function spawnHazard() {
        const edge = Math.floor(Math.random() * 4);
        let x = 0;
        let y = 0;
        const padding = 60;
        if (edge === 0) {
            x = rand(-padding, state.width + padding);
            y = -padding;
        } else if (edge === 1) {
            x = state.width + padding;
            y = rand(-padding, state.height + padding);
        } else if (edge === 2) {
            x = rand(-padding, state.width + padding);
            y = state.height + padding;
        } else {
            x = -padding;
            y = rand(-padding, state.height + padding);
        }

        const angle = Math.atan2(player.y - y, player.x - x);
        const baseSpeed = rand(160, 220) + state.level * 18;
        hazards.push({
            x,
            y,
            vx: Math.cos(angle),
            vy: Math.sin(angle),
            speed: baseSpeed,
            size: rand(26, 42),
            rotation: angle,
            spin: rand(-2, 2),
            hue: rand(0, 360),
            glow: 0
        });
    }

    function spawnPowerUp() {
        const type = Math.random() < 0.6 ? "shield" : "slow";
        const baseHue = type === "shield" ? 180 : 45;
        powerUps.push({
            x: rand(100, state.width - 100),
            y: rand(100, state.height - 100),
            radius: 22,
            hue: baseHue,
            pulse: rand(0, Math.PI * 2),
            type,
            life: 0
        });
    }

    function pushBurst(x, y, hue, count = 22) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x,
                y,
                vx: Math.cos((i / count) * Math.PI * 2 + rand(-0.2, 0.2)) * rand(120, 320),
                vy: Math.sin((i / count) * Math.PI * 2 + rand(-0.2, 0.2)) * rand(120, 320),
                life: rand(0.4, 0.9),
                age: 0,
                hue: hue + rand(-12, 12),
                size: rand(4, 8)
            });
        }
    }

    function pushTrail() {
        particles.push({
            x: player.x + rand(-6, 6),
            y: player.y + rand(-6, 6),
            vx: player.vx * -0.25 + rand(-30, 30),
            vy: player.vy * -0.25 + rand(-30, 30),
            life: rand(0.35, 0.6),
            age: 0,
            hue: player.hue + rand(-20, 20),
            size: rand(3, 6)
        });
    }

    function activateGodMode() {
        if (state.godMode) return;
        state.godMode = true;
        state.godTapCount = 0;
        state.godTapTimer = 0;
        state.shieldTimer = Math.max(state.shieldTimer, 4);
        pushBurst(player.x, player.y, player.hue, 48);
        audio.playPower();
        state.shake = Math.max(state.shake, 12);
    }

    function updatePlayer(dt) {
        let accel = input.shift ? 380 : 540;
        let maxSpeed = input.shift ? 340 : 460;
        let friction = input.shift ? 0.86 : 0.82;

        if (state.godMode) {
            accel *= 1.45;
            maxSpeed *= 1.55;
            friction = input.shift ? 0.9 : 0.88;
        }

        if (input.up) player.vy -= accel * dt;
        if (input.down) player.vy += accel * dt;
        if (input.left) player.vx -= accel * dt;
        if (input.right) player.vx += accel * dt;

        if (pointerControl.active) {
            const pointerStrength = state.godMode ? 0.06 : 0.045;
            const normalizer = Math.min(dt * 60, 2);
            player.vx += (pointerControl.x - player.x) * pointerStrength * normalizer;
            player.vy += (pointerControl.y - player.y) * pointerStrength * normalizer;
        }

        player.vx *= friction;
        player.vy *= friction;

        const speedSq = player.vx * player.vx + player.vy * player.vy;
        const maxSpeedSq = maxSpeed * maxSpeed;
        if (speedSq > maxSpeedSq) {
            const scale = Math.sqrt(maxSpeedSq / speedSq);
            player.vx *= scale;
            player.vy *= scale;
        }

        player.x += player.vx * dt;
        player.y += player.vy * dt;

        player.x = clamp(player.x, player.radius, state.width - player.radius);
        player.y = clamp(player.y, player.radius, state.height - player.radius);

        player.hue += (state.combo - 1) * dt * 12;
        if (player.hue > 360) player.hue -= 360;

        player.trailTimer -= dt;
        if (player.trailTimer <= 0) {
            pushTrail();
            player.trailTimer = input.shift ? 0.045 : 0.03;
        }
    }

    function updateOrbs(dt) {
        for (let i = orbs.length - 1; i >= 0; i--) {
            const orb = orbs[i];
            orb.pulse += dt * 3.2;
            orb.life += dt;
            orb.radius = orb.baseRadius + Math.sin(orb.pulse) * 2.5;
            orb.y += Math.sin(orb.life * 2.2) * orb.drift;
            orb.x += Math.cos(orb.life * 1.8) * orb.drift;

            const combinedRadius = player.radius + orb.radius;
            if (distSq(player, orb) < combinedRadius * combinedRadius) {
                state.score += Math.floor(120 * state.combo);
                state.combo = Math.min(state.combo + 1, 9);
                state.comboTimer = 5;
                timers.orb = Math.max(0.18, state.orbInterval - state.level * 0.04);
                player.hue = orb.hue;
                pushBurst(orb.x, orb.y, orb.hue, 28);
                audio.playOrb();
                orbs.splice(i, 1);
                queueHUDUpdate();

                if (state.score > state.level * 600) {
                    state.level += 1;
                    audio.playLevel();
                    state.hazardInterval = Math.max(0.65, state.hazardInterval * 0.92);
                    state.orbInterval = Math.max(0.22, state.orbInterval * 0.94);
                    queueHUDUpdate();
                }
            }
        }

        const targetOrbs = getTargetOrbCount();
        while (orbs.length < targetOrbs) {
            spawnOrb();
        }
    }

    function updateHazards(dt) {
        const slowFactor = state.slowTimer > 0 ? 0.6 : 1;
        for (let i = hazards.length - 1; i >= 0; i--) {
            const hazard = hazards[i];
            hazard.x += hazard.vx * hazard.speed * slowFactor * dt;
            hazard.y += hazard.vy * hazard.speed * slowFactor * dt;
            hazard.rotation += hazard.spin * dt;
            hazard.glow = Math.min(hazard.glow + dt * 3, 1);

            if (
                hazard.x < -160 ||
                hazard.y < -160 ||
                hazard.x > state.width + 160 ||
                hazard.y > state.height + 160
            ) {
                hazards.splice(i, 1);
                continue;
            }

            const combined = player.radius + hazard.size * 0.45;
            if (distSq(player, hazard) < combined * combined) {
                if (state.godMode) {
                    pushBurst(hazard.x, hazard.y, player.hue, 24);
                    hazards.splice(i, 1);
                    state.shake = Math.max(state.shake, 6);
                    player.vx *= 1.05;
                    player.vy *= 1.05;
                    continue;
                }
                if (state.shieldTimer > 0) {
                    pushBurst(hazard.x, hazard.y, hazard.hue, 36);
                    audio.playShield();
                    hazards.splice(i, 1);
                    state.shieldTimer = Math.max(0, state.shieldTimer - 1.8);
                } else {
                    hazards.splice(i, 1);
                    state.lives -= 1;
                    audio.playDamage();
                    state.combo = 1;
                    state.comboTimer = 0;
                    state.shake = 16;
                    pushBurst(player.x, player.y, 0, 42);
                    queueHUDUpdate();
                    if (state.lives <= 0) {
                        gameOver();
                        return;
                    }
                }
            }
        }
    }

    function updatePowerUps(dt) {
        for (let i = powerUps.length - 1; i >= 0; i--) {
            const power = powerUps[i];
            power.pulse += dt * 4.2;
            power.life += dt;
            power.radius = 22 + Math.sin(power.pulse) * 3;

            if (distSq(player, power) < Math.pow(player.radius + power.radius * 0.7, 2)) {
                if (power.type === "shield") {
                    state.shieldTimer = Math.min(state.shieldTimer + 6, 12);
                } else {
                    state.slowTimer = Math.min(state.slowTimer + 5.5, 8);
                }
                pushBurst(power.x, power.y, power.type === "shield" ? 190 : 50, 30);
                audio.playPower();
                powerUps.splice(i, 1);
            }
        }
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.age += dt;
            if (p.age >= p.life) {
                particles.splice(i, 1);
                continue;
            }
            const t = p.age / p.life;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= 0.9;
            p.vy *= 0.9;
            p.size *= 0.98;
            p.alpha = 1 - t;
        }
    }

    function drawBackground(dt) {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(6, 8, 20, 0.5)";
        ctx.fillRect(0, 0, state.width, state.height);

        const gradient = ctx.createRadialGradient(player.x, player.y, 40, player.x, player.y, 420);
        gradient.addColorStop(0, `rgba(0, 180, 255, 0.42)`);
        gradient.addColorStop(0.3, `rgba(255, 70, 220, 0.24)`);
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.fillRect(player.x - 420, player.y - 420, 840, 840);

        const overlay = ctx.createLinearGradient(0, 0, state.width, state.height);
        overlay.addColorStop(0, "rgba(255, 255, 255, 0.04)");
        overlay.addColorStop(1, "rgba(0, 0, 0, 0.12)");
        ctx.fillStyle = overlay;
        ctx.fillRect(0, 0, state.width, state.height);

        state.shake = Math.max(0, state.shake - dt * 36);
    }

    function drawParticles() {
        ctx.globalCompositeOperation = "lighter";
        for (const p of particles) {
            ctx.beginPath();
            ctx.fillStyle = `hsla(${p.hue}, 95%, 65%, ${Math.max(p.alpha, 0)})`;
            ctx.arc(p.x, p.y, Math.max(p.size, 0.5), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawOrbs() {
        ctx.globalCompositeOperation = "lighter";
        for (const orb of orbs) {
            const glow = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.radius * 2.4);
            glow.addColorStop(0, `hsla(${orb.hue}, 95%, 68%, 0.9)`);
            glow.addColorStop(0.65, `hsla(${orb.hue}, 95%, 55%, 0.4)`);
            glow.addColorStop(1, "transparent");
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(orb.x, orb.y, orb.radius * 2.4, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.fillStyle = `hsla(${orb.hue}, 95%, 70%, 0.9)`;
            ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawHazards() {
        ctx.globalCompositeOperation = "screen";
        for (const hazard of hazards) {
            ctx.save();
            ctx.translate(hazard.x, hazard.y);
            ctx.rotate(hazard.rotation);
            const glow = ctx.createLinearGradient(-hazard.size, 0, hazard.size, 0);
            glow.addColorStop(0, `hsla(${hazard.hue}, 100%, 65%, 0)`);
            glow.addColorStop(0.5, `hsla(${hazard.hue}, 100%, 65%, ${0.25 + hazard.glow * 0.4})`);
            glow.addColorStop(1, `hsla(${hazard.hue}, 100%, 65%, 0)`);
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.moveTo(-hazard.size * 0.5, -hazard.size * 0.25);
            ctx.lineTo(hazard.size * 0.7, 0);
            ctx.lineTo(-hazard.size * 0.5, hazard.size * 0.25);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = `hsla(${hazard.hue}, 100%, 75%, 0.9)`;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        }
    }

    function drawPowerUps() {
        ctx.globalCompositeOperation = "lighter";
        for (const power of powerUps) {
            const pulseAlpha = 0.3 + Math.sin(power.pulse) * 0.15;
            ctx.beginPath();
            ctx.fillStyle = `hsla(${power.hue}, 100%, 62%, ${pulseAlpha})`;
            ctx.arc(power.x, power.y, power.radius * 1.8, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.fillStyle = `hsla(${power.hue}, 100%, 65%, 0.9)`;
            ctx.arc(power.x, power.y, power.radius * 0.65, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "rgba(2,2,10,0.85)";
            ctx.font = "bold 14px 'Segoe UI', sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(power.type === "shield" ? "S" : "?", power.x, power.y);
        }
    }

    function drawPlayer() {
        ctx.globalCompositeOperation = "lighter";
        const gradient = ctx.createRadialGradient(player.x, player.y, player.radius * 0.2, player.x, player.y, player.radius * 2.8);
        gradient.addColorStop(0, `hsla(${player.hue}, 92%, 75%, 0.95)`);
        gradient.addColorStop(0.6, `hsla(${player.hue}, 88%, 60%, 0.45)`);
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius * 2.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = `hsla(${player.hue}, 95%, 70%, 0.92)`;
        ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
        ctx.fill();

        if (state.shieldTimer > 0) {
            const shieldAlpha = 0.35 + Math.sin(state.time * 8) * 0.1;
            ctx.beginPath();
            ctx.strokeStyle = `hsla(${player.hue + 40}, 90%, 70%, ${shieldAlpha})`;
            ctx.lineWidth = 4;
            ctx.arc(player.x, player.y, player.radius + 16 + Math.sin(state.time * 6) * 2, 0, Math.PI * 2);
            ctx.stroke();
        }
        if (state.godMode) {
            const auraPulse = 0.45 + Math.sin(state.time * 6) * 0.15;
            ctx.beginPath();
            ctx.strokeStyle = `hsla(${player.hue}, 100%, 85%, ${auraPulse})`;
            ctx.lineWidth = 6;
            ctx.arc(player.x, player.y, player.radius + 28 + Math.sin(state.time * 3) * 3, 0, Math.PI * 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.strokeStyle = `hsla(${player.hue + 80}, 100%, 70%, ${auraPulse * 0.6})`;
            ctx.lineWidth = 2;
            ctx.arc(player.x, player.y, player.radius + 42 + Math.sin(state.time * 5) * 4, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    function updateTimers(dt) {
        timers.orb -= dt;
        timers.hazard -= dt;
        timers.power -= dt;

        const desiredOrbs = getTargetOrbCount();

        if (timers.orb <= 0) {
            if (orbs.length < desiredOrbs + 2) {
                spawnOrb();
            }
            timers.orb = Math.max(0.2, state.orbInterval - state.level * 0.035);
        }
        if (timers.hazard <= 0) {
            spawnHazard();
            timers.hazard = Math.max(0.7, state.hazardInterval - state.level * 0.04);
        }
        if (timers.power <= 0) {
            spawnPowerUp();
            timers.power = rand(12, 18);
        }
    }

    function updateEffects(dt) {
        if (state.combo > 1) {
            state.comboTimer -= dt;
            if (state.comboTimer <= 0) {
                state.combo = Math.max(1, state.combo - 1);
                state.comboTimer = state.combo > 1 ? 3 : 0;
                queueHUDUpdate();
            }
        }
        if (state.shieldTimer > 0) {
            state.shieldTimer -= dt;
            if (state.shieldTimer < 0) state.shieldTimer = 0;
        }
        if (state.slowTimer > 0) {
            state.slowTimer -= dt;
            if (state.slowTimer < 0) state.slowTimer = 0;
        }
        if (!state.godMode && state.godTapCount > 0) {
            state.godTapTimer -= dt;
            if (state.godTapTimer <= 0) {
                state.godTapCount = 0;
                state.godTapTimer = 0;
            }
        }
    }

    function loop(timestamp) {
        if (!state.playing) return;
        const delta = Math.min((timestamp - lastTime) / 1000, 0.035);
        lastTime = timestamp;
        state.time += delta;

        updateTimers(delta);
        updatePlayer(delta);
        updateOrbs(delta);
        updateHazards(delta);
        updatePowerUps(delta);
        updateParticles(delta);
        updateEffects(delta);
        updateHUD();

        const shakeStrength = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
        ctx.save();
        ctx.translate(shakeStrength, shakeStrength);
        drawBackground(delta);
        drawOrbs();
        drawPowerUps();
        drawParticles();
        drawHazards();
        drawPlayer();
        ctx.restore();

        requestAnimationFrame(loop);
    }

    function getPointerPosition(event) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }

    function nudgeTowardsPoint(x, y, multiplier = 0.02) {
        const dx = x - player.x;
        const dy = y - player.y;
        const boost = state.godMode ? 1.4 : 1;
        player.vx += dx * multiplier * boost;
        player.vy += dy * multiplier * boost;
    }

    function handleGodTap(x, y) {
        if (!state.playing || state.godMode) return;
        const radius = player.radius + 24;
        const dx = x - player.x;
        const dy = y - player.y;
        if (dx * dx + dy * dy <= radius * radius) {
            state.godTapCount += 1;
            state.godTapTimer = 1.3;
            if (state.godTapCount >= 8) {
                activateGodMode();
            }
        } else {
            state.godTapCount = 0;
            state.godTapTimer = 0;
        }
    }

    function endPointerControl(event) {
        if (!pointerControl.active || pointerControl.pointerId !== event.pointerId) {
            return;
        }
        pointerControl.active = false;
        pointerControl.pointerId = null;
        try {
            canvas.releasePointerCapture(event.pointerId);
        } catch (error) {
            // ignore environments without pointer capture support
        }
    }

    window.addEventListener("keydown", (event) => {
        if (event.repeat) return;
        switch (event.key) {
            case "ArrowUp":
            case "w":
            case "W":
                input.up = true;
                break;
            case "ArrowDown":
            case "s":
            case "S":
                input.down = true;
                break;
            case "ArrowLeft":
            case "a":
            case "A":
                input.left = true;
                break;
            case "ArrowRight":
            case "d":
            case "D":
                input.right = true;
                break;
            case "Shift":
                input.shift = true;
                break;
            case " ":
                if (!state.playing && startMenu.hasAttribute("hidden")) {
                    startGame();
                }
                break;
        }
    });

    window.addEventListener("keyup", (event) => {
        switch (event.key) {
            case "ArrowUp":
            case "w":
            case "W":
                input.up = false;
                break;
            case "ArrowDown":
            case "s":
            case "S":
                input.down = false;
                break;
            case "ArrowLeft":
            case "a":
            case "A":
                input.left = false;
                break;
            case "ArrowRight":
            case "d":
            case "D":
                input.right = false;
                break;
            case "Shift":
                input.shift = false;
                break;
        }
    });

    canvas.addEventListener("pointerdown", (event) => {
        if (!state.playing) return;
        event.preventDefault();
        const { x, y } = getPointerPosition(event);
        pointerControl.active = true;
        pointerControl.pointerId = event.pointerId;
        pointerControl.x = x;
        pointerControl.y = y;
        try {
            canvas.setPointerCapture(event.pointerId);
        } catch (error) {
            // pointer capture is optional; ignore failures
        }
        nudgeTowardsPoint(x, y, state.godMode ? 0.035 : 0.025);
        handleGodTap(x, y);
        lastPointerTapTime = performance.now();
    });

    canvas.addEventListener("pointermove", (event) => {
        if (!pointerControl.active || pointerControl.pointerId !== event.pointerId) return;
        if (!state.playing) return;
        event.preventDefault();
        const { x, y } = getPointerPosition(event);
        pointerControl.x = x;
        pointerControl.y = y;
    });

    canvas.addEventListener("pointerup", (event) => {
        endPointerControl(event);
    });

    canvas.addEventListener("pointercancel", (event) => {
        endPointerControl(event);
    });

    canvas.addEventListener("pointerleave", (event) => {
        endPointerControl(event);
    });

    canvas.addEventListener("mousemove", (event) => {
        if (!state.playing || pointerControl.active) return;
        const { x, y } = getPointerPosition(event);
        nudgeTowardsPoint(x, y, state.godMode ? 0.03 : 0.02);
    });

    canvas.addEventListener("click", (event) => {
        if (!state.playing) return;
        if (performance.now() - lastPointerTapTime < 250) {
            return;
        }
        const { x, y } = getPointerPosition(event);
        handleGodTap(x, y);
    });

    startButton.addEventListener("click", () => {
        startGame();
    });

    restartButton.addEventListener("click", () => {
        startGame();
    });

    updateHUD();
})();
