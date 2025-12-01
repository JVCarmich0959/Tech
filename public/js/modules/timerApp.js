export function initializeTimerApp() {
      // Feature detection and polyfills
      (function() {
        'use strict';

        // Check for requestAnimationFrame (IE9 fallback)
        if (!window.requestAnimationFrame) {
          window.requestAnimationFrame = window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame ||
            window.msRequestAnimationFrame ||
            function(callback) {
              return window.setTimeout(callback, 1000 / 60);
            };
        }

        if (!window.cancelAnimationFrame) {
          window.cancelAnimationFrame = window.webkitCancelAnimationFrame ||
            window.mozCancelAnimationFrame ||
            window.msCancelAnimationFrame ||
            function(id) {
              window.clearTimeout(id);
            };
        }

        // Performance.now polyfill
        if (!window.performance) {
          window.performance = {};
        }
        if (!window.performance.now) {
          var startTime = Date.now();
          window.performance.now = function() {
            return Date.now() - startTime;
          };
        }
      })();

      var phaseOrder = ["Setup", "Work Time", "Clean Up"];
      var STORAGE_KEY = "tech-class-timer";
      var defaults = [5, 30, 5];

      var els = {
        clock: document.getElementById("clock"),
        bar: document.getElementById("bar"),
        phase: document.getElementById("phaseLabel"),
        progress: document.querySelector('.progress'),
        setup: document.getElementById("setupMin"),
        work: document.getElementById("workMin"),
        away: document.getElementById("awayMin"),
        start: document.getElementById("startBtn"),
        pause: document.getElementById("pauseBtn"),
        reset: document.getElementById("resetBtn"),
        next: document.getElementById("nextBtn")
      };

      var state = {
        idx: 0,
        remaining: 0,
        duration: 0,
        running: false,
        lastTick: null
      };

      var rafId = null;
      var lastPersist = 0;
      var storageUnavailable = false;

      // Test localStorage availability
      function isLocalStorageAvailable() {
        try {
          var test = '__storage_test__';
          localStorage.setItem(test, test);
          localStorage.removeItem(test);
          return true;
        } catch (e) {
          return false;
        }
      }

      storageUnavailable = !isLocalStorageAvailable();

      function clampFromInput(input, fallback) {
        var min = Number(input.min) || 1;
        var max = Number(input.max) || 999;
        var value = parseInt(input.value, 10);
        if (isNaN(value)) { value = fallback; }
        value = Math.min(max, Math.max(min, value));
        if (String(value) !== String(input.value)) { input.value = value; }
        return value;
      }

      function getMinutesForIndex(index) {
        if (index === 0) { return clampFromInput(els.setup, defaults[0]); }
        if (index === 1) { return clampFromInput(els.work, defaults[1]); }
        return clampFromInput(els.away, defaults[2]);
      }

      function format(t) {
        var total = Math.max(0, Math.floor(t));
        var m = Math.floor(total / 60);
        var s = total % 60;
        return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      }

      function render() {
        els.clock.textContent = format(state.remaining);
        var pct = state.duration > 0 ? 100 * (1 - state.remaining / state.duration) : 0;
        var safePct = Math.min(100, Math.max(0, pct));
        els.bar.style.width = safePct + '%';

        // Update ARIA progress
        if (els.progress) {
          els.progress.setAttribute('aria-valuenow', Math.round(safePct));
        }
      }

      function persist(force) {
        if (storageUnavailable) {
          return;
        }
        var now = performance.now();
        if (state.running && !force && now - lastPersist < 1000) {
          return;
        }
        lastPersist = now;
        var payload = {
          idx: state.idx,
          remaining: Math.max(0, state.remaining),
          running: state.running,
          durations: {
            setup: getMinutesForIndex(0),
            work: getMinutesForIndex(1),
            away: getMinutesForIndex(2)
          },
          savedAt: Date.now()
        };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (err) {
          if (!storageUnavailable) {
            storageUnavailable = true;
            console.warn("Unable to persist timer state", err);
          }
        }
      }

      function setPhase(index, opts) {
        opts = opts || {};
        var clamped = Math.max(0, Math.min(phaseOrder.length - 1, index));
        state.idx = clamped;
        els.phase.textContent = phaseOrder[clamped];
        var mins = getMinutesForIndex(clamped);
        state.duration = mins * 60;
        if (opts.keepProgress && typeof opts.remaining === "number") {
          state.remaining = Math.min(state.duration, Math.max(0, opts.remaining));
        } else {
          state.remaining = state.duration;
        }
        state.lastTick = null;
        render();
        if (!opts.skipPersist) {
          persist(true);
        }
      }

      function scheduleTick() {
        if (rafId === null) {
          rafId = requestAnimationFrame(tick);
        }
      }

      function stopTick() {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      }

      function tick(ts) {
        rafId = null;
        if (!state.running) {
          return;
        }
        if (state.lastTick === null) {
          state.lastTick = ts;
        }
        var dt = (ts - state.lastTick) / 1000;
        state.lastTick = ts;
        state.remaining = Math.max(0, state.remaining - dt);
        if (state.remaining <= 0.01) {
          var next = state.idx + 1;
          if (next < phaseOrder.length) {
            setPhase(next, { skipPersist: true });
            state.lastTick = ts;
          } else {
            state.running = false;
            state.remaining = 0;
            render();
            persist(true);
            return;
          }
        }
        render();
        persist();
        scheduleTick();
      }

      function handleDurationChange(index) {
        var minutes = getMinutesForIndex(index);
        if (state.idx === index) {
          state.duration = minutes * 60;
          state.remaining = state.running ? Math.min(state.remaining, state.duration) : state.duration;
          state.lastTick = null;
          render();
        }
        persist(true);
      }

      function applySavedState() {
        try {
          var raw = localStorage.getItem(STORAGE_KEY);
          if (!raw) {
            setPhase(0);
            return;
          }
          var saved = JSON.parse(raw);
          if (saved && saved.durations) {
            if (saved.durations.setup) { els.setup.value = saved.durations.setup; }
            if (saved.durations.work) { els.work.value = saved.durations.work; }
            if (saved.durations.away) { els.away.value = saved.durations.away; }
          }
          var savedIdx = (typeof saved.idx === 'number' && !isNaN(saved.idx)) 
            ? Math.max(0, Math.min(phaseOrder.length - 1, saved.idx)) 
            : 0;
          var remaining = (typeof saved.remaining === "number") ? saved.remaining : null;
          var savedRunning = Boolean(saved.running);
          var savedAt = (typeof saved.savedAt === "number") ? saved.savedAt : null;
          var durationsSec = [
            getMinutesForIndex(0) * 60,
            getMinutesForIndex(1) * 60,
            getMinutesForIndex(2) * 60
          ];
          var idx = savedIdx;
          if (savedRunning && remaining !== null) {
            var elapsed = savedAt ? Math.max(0, (Date.now() - savedAt) / 1000) : 0;
            while (elapsed > 0 && idx < phaseOrder.length) {
              if (remaining > elapsed) {
                remaining -= elapsed;
                elapsed = 0;
              } else {
                elapsed -= remaining;
                idx += 1;
                if (idx >= phaseOrder.length) {
                  remaining = 0;
                  break;
                }
                remaining = durationsSec[idx];
              }
            }
            if (idx >= phaseOrder.length) {
              idx = phaseOrder.length - 1;
              setPhase(idx, { keepProgress: true, remaining: 0, skipPersist: true });
              state.running = false;
              state.lastTick = null;
              render();
              persist(true);
              return;
            }
            setPhase(idx, { keepProgress: true, remaining: remaining, skipPersist: true });
            state.running = remaining > 0;
            state.lastTick = null;
            render();
            persist(true);
            if (state.running) {
              scheduleTick();
            }
            return;
          }
          if (remaining === null) {
            setPhase(idx, { skipPersist: true });
          } else {
            setPhase(idx, { keepProgress: true, remaining: remaining, skipPersist: true });
          }
          state.running = false;
          state.lastTick = null;
          render();
          persist(true);
        } catch (err) {
          console.warn("Timer state restore failed, clearing corrupted data", err);
          try {
            localStorage.removeItem(STORAGE_KEY);
            storageUnavailable = false;
          } catch (removeErr) {
            console.warn("Cannot clear corrupted storage key", removeErr);
            storageUnavailable = true;
          }
          setPhase(0, { skipPersist: true });
          state.running = false;
          state.lastTick = null;
          render();
        }
      }

      // Event listeners with both mouse and touch support
      function addEventListeners() {
        [els.setup, els.work, els.away].forEach(function(input, index) {
          input.addEventListener("change", function() { handleDurationChange(index); });
          // Handle blur for mobile keyboards
          input.addEventListener("blur", function() { handleDurationChange(index); });
        });

        els.start.addEventListener("click", function() {
          if (state.running) { return; }
          state.running = true;
          state.lastTick = null;
          persist(true);
          scheduleTick();
        });

        els.pause.addEventListener("click", function() {
          if (!state.running) { return; }
          state.running = false;
          state.lastTick = null;
          stopTick();
          persist(true);
        });

        els.reset.addEventListener("click", function() {
          state.running = false;
          state.lastTick = null;
          stopTick();
          setPhase(0);
        });

        els.next.addEventListener("click", function() {
          if (state.idx >= phaseOrder.length - 1) {
            state.running = false;
            state.remaining = 0;
            state.lastTick = null;
            stopTick();
            render();
            persist(true);
            return;
          }
          var wasRunning = state.running;
          setPhase(state.idx + 1);
          state.running = wasRunning;
          state.lastTick = null;
          if (wasRunning) {
            scheduleTick();
          } else {
            stopTick();
          }
        });
      }

      addEventListeners();
      applySavedState();

      // Expandable step details with keyboard support
      document.querySelectorAll('.step-expandable').forEach(function(step) {
        function toggleStep(e) {
          // Don't toggle if clicking on interactive elements
          if (e && e.target && (e.target.tagName === 'A' || e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT')) {
            return;
          }
          var details = step.querySelector('.step-details');
          var isExpanded = step.classList.contains('expanded');
          if (isExpanded) {
            details.style.display = 'none';
            step.classList.remove('expanded');
            step.setAttribute('aria-expanded', 'false');
          } else {
            details.style.display = 'block';
            step.classList.add('expanded');
            step.setAttribute('aria-expanded', 'true');
          }
        }

        step.addEventListener('click', toggleStep);

        // Keyboard support
        step.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleStep(e);
          }
        });
      });

      // Handle visibility change (pause timer when tab is hidden on mobile)
      document.addEventListener('visibilitychange', function() {
        if (document.hidden && state.running) {
          // Timer continues but we update lastTick when visible again
          state.lastTick = null;
        }
      });

      // Prevent double-tap zoom on buttons (iOS)
      document.querySelectorAll('.btn').forEach(function(btn) {
        btn.addEventListener('touchend', function(e) {
          e.preventDefault();
          btn.click();
        });
      });

}
