(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.WavestFrequencyRanges = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const INAUDIBLE_SHIFT_FACTOR = 1.0867;
    const SPEED_NAMES = ['NORMAL', 'FAST', 'FASTEST'];
    const RANGE_NAMES = ['audible', 'inaudible', 'ultrasound'];

    function getProtocolId(protocolIds, range, speed) {
        if (!RANGE_NAMES.includes(range)) throw new RangeError(`Unknown frequency range: ${range}`);
        if (!Number.isInteger(speed) || speed < 0 || speed >= SPEED_NAMES.length) {
            throw new RangeError(`Unknown protocol speed: ${speed}`);
        }

        const family = range === 'audible' ? 'AUDIBLE' : 'ULTRASOUND';
        return protocolIds[`GGWAVE_PROTOCOL_${family}_${SPEED_NAMES[speed]}`];
    }

    function getPlaybackSampleRate(range, sampleRate) {
        return range === 'inaudible'
            ? Math.round(sampleRate * INAUDIBLE_SHIFT_FACTOR)
            : sampleRate;
    }

    function resampleBuffer(inputBuffer, factor) {
        const outputLength = Math.floor(inputBuffer.length / factor);
        const outputBuffer = new Float32Array(outputLength);
        for (let i = 0; i < outputLength; i++) {
            const pos = i * factor;
            const idx = Math.floor(pos);
            const nextIdx = Math.min(inputBuffer.length - 1, idx + 1);
            const weight = pos - idx;
            outputBuffer[i] = (1 - weight) * inputBuffer[idx] + weight * inputBuffer[nextIdx];
        }
        return outputBuffer;
    }

    function restoreInaudibleSamples(inputBuffer) {
        return resampleBuffer(inputBuffer, 1 / INAUDIBLE_SHIFT_FACTOR);
    }

    class StreamingLinearResampler {
        constructor(factor) {
            if (!Number.isFinite(factor) || factor <= 0) {
                throw new RangeError(`Invalid resampling factor: ${factor}`);
            }
            this.factor = factor;
            this.pending = new Float32Array(0);
            this.position = 0;
        }

        push(inputBuffer) {
            if (!inputBuffer || inputBuffer.length === 0) return new Float32Array(0);

            const combined = new Float32Array(this.pending.length + inputBuffer.length);
            combined.set(this.pending);
            combined.set(inputBuffer, this.pending.length);

            const output = new Float32Array(Math.ceil((combined.length - this.position) / this.factor));
            let outputLength = 0;
            while (this.position + 1 < combined.length) {
                const idx = Math.floor(this.position);
                const weight = this.position - idx;
                output[outputLength] = (1 - weight) * combined[idx] + weight * combined[idx + 1];
                outputLength += 1;
                this.position += this.factor;
            }

            const consumed = Math.floor(this.position);
            this.pending = combined.slice(consumed);
            this.position -= consumed;
            return output.slice(0, outputLength);
        }

        reset() {
            this.pending = new Float32Array(0);
            this.position = 0;
        }
    }

    function createInaudibleReceiveResampler() {
        return new StreamingLinearResampler(1 / INAUDIBLE_SHIFT_FACTOR);
    }

    class FixedSizeChunker {
        constructor(chunkSize) {
            if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
                throw new RangeError(`Invalid chunk size: ${chunkSize}`);
            }
            this.chunkSize = chunkSize;
            this.pending = new Float32Array(0);
        }

        push(inputBuffer) {
            if (!inputBuffer || inputBuffer.length === 0) return [];

            const combined = new Float32Array(this.pending.length + inputBuffer.length);
            combined.set(this.pending);
            combined.set(inputBuffer, this.pending.length);

            const chunks = [];
            let offset = 0;
            while (offset + this.chunkSize <= combined.length) {
                chunks.push(combined.slice(offset, offset + this.chunkSize));
                offset += this.chunkSize;
            }
            this.pending = combined.slice(offset);
            return chunks;
        }

        reset() {
            this.pending = new Float32Array(0);
        }
    }

    function createInaudibleReceivePipeline(chunkSize = 1024) {
        const resampler = createInaudibleReceiveResampler();
        const chunker = new FixedSizeChunker(chunkSize);
        return {
            push(inputBuffer) {
                return chunker.push(resampler.push(inputBuffer));
            },
            reset() {
                resampler.reset();
                chunker.reset();
            },
        };
    }

    return {
        INAUDIBLE_SHIFT_FACTOR,
        RANGE_NAMES,
        SPEED_NAMES,
        FixedSizeChunker,
        StreamingLinearResampler,
        createInaudibleReceivePipeline,
        createInaudibleReceiveResampler,
        getPlaybackSampleRate,
        getProtocolId,
        resampleBuffer,
        restoreInaudibleSamples,
    };
}));
