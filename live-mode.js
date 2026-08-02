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
            this.activeCount = 0;
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
                        // Consolidate everything waiting at the transmission boundary.
                        // Keys typed while this batch is in flight remain queued and
                        // become the next batch rather than creating one transmission
                        // per character.
                        const batch = this.queue.splice(0).join('');
                        this.activeCount = Array.from(batch).length;
                        this.notify();
                        try {
                            await this.transmit(batch);
                        } catch (error) {
                            console.error('Live batch transmission failed:', error);
                        }
                        this.activeCount = 0;
                    }
                } finally {
                    this.transmitting = false;
                    this.activeCount = 0;
                    this.drainPromise = null;
                    this.notify();
                }
            })();
            return this.drainPromise;
        }

        get pendingCount() {
            return this.queue.length + this.activeCount;
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
