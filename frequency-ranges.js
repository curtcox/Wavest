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

    return {
        INAUDIBLE_SHIFT_FACTOR,
        RANGE_NAMES,
        SPEED_NAMES,
        getPlaybackSampleRate,
        getProtocolId,
        resampleBuffer,
        restoreInaudibleSamples,
    };
}));
