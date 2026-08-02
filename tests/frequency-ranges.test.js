const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');

const ggwaveFactory = require('../ggwave.js');
const {
  INAUDIBLE_SHIFT_FACTOR,
  RANGE_NAMES,
  SPEED_NAMES,
  getPlaybackSampleRate,
  getProtocolId,
  resampleBuffer,
  restoreInaudibleSamples,
} = require('../frequency-ranges.js');

const SAMPLE_RATE = 48_000;
const TEST_MESSAGE = 'All ranges and speeds';

function byteViewToFloat32(bytes) {
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function float32ToByteView(samples) {
  return new Int8Array(samples.buffer, samples.byteOffset, samples.byteLength);
}

let ggwave;
let parameters;
let transmitter;

before(async () => {
  ggwave = await ggwaveFactory();
  parameters = ggwave.getDefaultParameters();
  parameters.sampleRateInp = SAMPLE_RATE;
  parameters.sampleRateOut = SAMPLE_RATE;
  transmitter = ggwave.init(parameters);
});

after(() => {
  if (transmitter) ggwave.free(transmitter);
});

test('every frequency range supports every transmission speed', async (suite) => {
  for (const range of RANGE_NAMES) {
    for (const [speed, speedName] of SPEED_NAMES.entries()) {
      await suite.test(`${range} ${speedName.toLowerCase()}`, () => {
        const originalLog = console.log;
        const receiver = ggwave.init(parameters);
        let decodedBytes;

        try {
          console.log = () => {};
          const encodedBytes = ggwave.encode(
            transmitter,
            TEST_MESSAGE,
            getProtocolId(ggwave.ProtocolId, range, speed),
            35,
          );
          assert.ok(encodedBytes.length > 0, 'encoder returned audio');

          let capturedSamples = byteViewToFloat32(encodedBytes);
          if (range === 'inaudible') {
            assert.equal(
              getPlaybackSampleRate(range, SAMPLE_RATE),
              Math.round(SAMPLE_RATE * INAUDIBLE_SHIFT_FACTOR),
            );
            capturedSamples = resampleBuffer(capturedSamples, INAUDIBLE_SHIFT_FACTOR);
            capturedSamples = restoreInaudibleSamples(capturedSamples);
          } else {
            assert.equal(getPlaybackSampleRate(range, SAMPLE_RATE), SAMPLE_RATE);
          }

          decodedBytes = ggwave.decode(receiver, float32ToByteView(capturedSamples));
        } finally {
          console.log = originalLog;
          ggwave.free(receiver);
        }

        const decodedMessage = decodedBytes
          ? new TextDecoder('utf-8', { fatal: true }).decode(decodedBytes)
          : '';
        assert.equal(decodedMessage, TEST_MESSAGE);
      });
    }
  }
});

test('frequency range and speed validation rejects unsupported selections', () => {
  assert.throws(() => getProtocolId(ggwave.ProtocolId, 'subsonic', 1), /Unknown frequency range/);
  assert.throws(() => getProtocolId(ggwave.ProtocolId, 'audible', 3), /Unknown protocol speed/);
});
