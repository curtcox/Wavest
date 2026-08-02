const assert = require('node:assert/strict');
const { test } = require('node:test');

const ggwaveFactory = require('../ggwave.js');
const { LiveKeyboardQueue } = require('../live-mode.js');

const SAMPLE_RATE = 48_000;

function byteViewToFloat32(bytes) {
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function float32ToByteView(samples) {
  return new Int8Array(samples.buffer, samples.byteOffset, samples.byteLength);
}

test('live page input sends and receives typed characters through audio', async () => {
  const ggwave = await ggwaveFactory();
  const parameters = ggwave.getDefaultParameters();
  parameters.sampleRateInp = SAMPLE_RATE;
  parameters.sampleRateOut = SAMPLE_RATE;
  const transmitter = ggwave.init(parameters);
  const received = [];
  let pageInput = '';

  const queue = new LiveKeyboardQueue({
    readValue: () => pageInput,
    clearValue: () => { pageInput = ''; },
    transmit: async (character) => {
      const receiver = ggwave.init(parameters);
      try {
        const encoded = ggwave.encode(
          transmitter,
          character,
          ggwave.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST,
          25,
        );
        assert.ok(encoded.length > 0, 'page produced an audio waveform');

        const capturedAudio = byteViewToFloat32(encoded);
        const decoded = ggwave.decode(receiver, float32ToByteView(capturedAudio));
        assert.ok(decoded && decoded.length > 0, 'page received data from captured audio');
        received.push(new TextDecoder('utf-8', { fatal: true }).decode(decoded));
      } finally {
        ggwave.free(receiver);
      }
    },
  });

  try {
    queue.start();
    pageInput = 'Wav';
    queue.poll();
    pageInput = 'est!';
    queue.poll();
    await queue.drain();

    assert.equal(pageInput, '', 'polled keyboard input is moved into the queue');
    assert.equal(received.join(''), 'Wavest!');
    assert.equal(queue.pendingCount, 0);
  } finally {
    queue.stop();
    ggwave.free(transmitter);
  }
});
