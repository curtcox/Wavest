(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.WavestLiveMode = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    class LiveKeyboardQueue {
        constructor({ readValue, clearValue, transmit, pollInterval = 40, onStateChange = null }) {
            if (typeof readValue !== 'function' || typeof transmit !== 'function') {
                throw new TypeError('LiveKeyboardQueue requires readValue and transmit functions.');
            }

            this.readValue = readValue;
            this.clearValue = clearValue;
            this.transmit = transmit;
            this.pollInterval = pollInterval;
            this.onStateChange = onStateChange;
            this.queue = [];
            this.enabled = false;
            this.transmitting = false;
            this.timer = null;
            this.drainPromise = null;
        }

        start() {
            if (this.enabled) return;
            this.enabled = true;
            this.timer = setInterval(() => this.poll(), this.pollInterval);
            this.notify();
        }

        stop() {
            if (!this.enabled) return;
            this.enabled = false;
            clearInterval(this.timer);
            this.timer = null;
            this.notify();
        }

        poll() {
            if (!this.enabled) return;
            const typed = this.readValue();
            if (!typed) return;

            this.queue.push(...Array.from(typed));
            if (this.clearValue) this.clearValue();
            this.notify();
            void this.drain();
        }

        drain() {
            if (this.transmitting) return this.drainPromise;
            this.transmitting = true;
            this.notify();

            this.drainPromise = (async () => {
                try {
                    while (this.queue.length > 0) {
                        const character = this.queue.shift();
                        this.notify();
                        try {
                            await this.transmit(character);
                        } catch (error) {
                            console.error('Live character transmission failed:', error);
                        }
                    }
                } finally {
                    this.transmitting = false;
                    this.drainPromise = null;
                    this.notify();
                }
            })();
            return this.drainPromise;
        }

        get pendingCount() {
            return this.queue.length + (this.transmitting ? 1 : 0);
        }

        notify() {
            if (this.onStateChange) {
                this.onStateChange({
                    enabled: this.enabled,
                    transmitting: this.transmitting,
                    pendingCount: this.pendingCount,
                });
            }
        }
    }

    return { LiveKeyboardQueue };
}));
