const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { after, before, test } = require('node:test');

const ggwaveFactory = require('../ggwave.js');
const {
  INAUDIBLE_SHIFT_FACTOR,
  getProtocolId,
  resampleBuffer,
  restoreInaudibleSamples,
} = require('../frequency-ranges.js');

const SAMPLE_RATE = 48_000;
const ENCODE_VOLUME = 35;
const NOISE_LEVELS = [0, 0.01, 0.025, 0.05, 0.075, 0.1];

function messageOfLength(prefix, length) {
  return (prefix + '0123456789abcdefghijklmnopqrstuvwxyz'.repeat(4)).slice(0, length);
}

const MESSAGES = [
  'A',
  'Wavest08',
  messageOfLength('Round-trip payload: ', 24),
  messageOfLength('Medium payload: ', 48),
  messageOfLength('Long payload: ', 80),
  messageOfLength('Maximum test payload: ', 120),
];
const FREQUENCY_RANGES = ['audible', 'inaudible', 'ultrasound'];

let ggwave;
let parameters;
let transmitter;
const results = [];
const startedAt = new Date();

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function addGaussianNoise(samples, amplitude, seed) {
  const output = samples.slice();
  if (amplitude === 0) return output;

  const random = seededRandom(seed);
  for (let index = 0; index < output.length; index += 1) {
    const first = Math.max(random(), Number.EPSILON);
    const second = random();
    const gaussian = Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
    output[index] = Math.max(-1, Math.min(1, output[index] + gaussian * amplitude));
  }
  return output;
}

function byteViewToFloat32(bytes) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Float32Array(buffer);
}

function float32ToByteView(samples) {
  return new Int8Array(samples.buffer, samples.byteOffset, samples.byteLength);
}

function rms(samples) {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

function simulateCapturedAudio(encodedSamples, range) {
  // An AudioBuffer whose sample rate is above the AudioContext rate is
  // resampled into fewer output samples during playback.
  return range === 'inaudible'
    ? resampleBuffer(encodedSamples, INAUDIBLE_SHIFT_FACTOR)
    : encodedSamples;
}

function prepareForDecode(capturedSamples, range) {
  return range === 'inaudible'
    ? restoreInaudibleSamples(capturedSamples)
    : capturedSamples;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderReport(report) {
  const rows = report.results.map((result) => `
          <tr>
            <td><span class="status ${result.passed ? 'pass' : 'fail'}">${result.passed ? 'PASS' : 'FAIL'}</span></td>
            <td>${escapeHtml(result.range)}</td>
            <td>${result.messageBytes}</td>
            <td>${(result.noiseAmplitude * 100).toFixed(1)}%</td>
            <td>${result.signalRms.toFixed(4)}</td>
            <td>${result.encodedSamples.toLocaleString('en-US')}</td>
            <td>${result.durationMs.toFixed(1)} ms</td>
            <td><code>${escapeHtml(result.message)}</code></td>
          </tr>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Wavest codec test results</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #09090b; color: #f4f4f5; }
    main { width: min(1180px, calc(100% - 32px)); margin: 48px auto; }
    a { color: #c4b5fd; }
    .eyebrow { color: #a1a1aa; font: 700 12px ui-monospace, monospace; letter-spacing: .16em; }
    h1 { margin: 10px 0; font-size: clamp(30px, 6vw, 52px); }
    .lede { max-width: 760px; color: #a1a1aa; line-height: 1.6; }
    .summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 28px 0; }
    .card { padding: 20px; border: 1px solid #27272a; border-radius: 12px; background: #111113; }
    .card strong { display: block; font-size: 30px; }
    .card span { color: #a1a1aa; font-size: 13px; }
    .table-wrap { overflow-x: auto; border: 1px solid #27272a; border-radius: 12px; }
    table { width: 100%; border-collapse: collapse; background: #111113; font-size: 13px; }
    th, td { padding: 12px 14px; border-bottom: 1px solid #27272a; text-align: left; white-space: nowrap; }
    th { color: #a1a1aa; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
    td:last-child { max-width: 340px; overflow: hidden; text-overflow: ellipsis; }
    code { color: #d4d4d8; }
    .status { font: 700 11px ui-monospace, monospace; }
    .pass { color: #86efac; } .fail { color: #fda4af; }
    footer { color: #71717a; margin-top: 20px; font-size: 12px; }
    @media (max-width: 640px) { .summary { grid-template-columns: 1fr; } main { margin-top: 28px; } }
  </style>
</head>
<body>
  <main>
    <a href="../">← Back to Wavest</a>
    <p class="eyebrow">AUTOMATED CODEC VERIFICATION</p>
    <h1>${report.failed === 0 ? 'All round-trip tests passed' : 'Round-trip failures detected'}</h1>
    <p class="lede">Every codec case encodes a message with the bundled GGWave WebAssembly engine, adds deterministic Gaussian noise directly to the waveform, decodes it with a fresh receiver, and requires an exact byte-for-byte message match. The companion live-mode integration test polls page input, queues typed characters, and passes each one through the same audio encode/decode path.</p>
    <section class="summary" aria-label="Test summary">
      <div class="card"><strong>${report.passed}/${report.total}</strong><span>cases passed</span></div>
      <div class="card"><strong>${report.messageLengths.length}</strong><span>message lengths (${report.messageLengths.join(', ')} bytes)</span></div>
      <div class="card"><strong>${report.noiseLevels.length}</strong><span>noise levels (0–${Math.max(...report.noiseLevels) * 100}% RMS amplitude)</span></div>
    </section>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Result</th><th>Range</th><th>Bytes</th><th>Noise</th><th>Signal RMS</th><th>Samples</th><th>Time</th><th>Message</th></tr></thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>
    <footer>Generated ${escapeHtml(report.generatedAt)} · Node ${escapeHtml(report.nodeVersion)} · Audible, inaudible, and ultrasound fast protocols · 48 kHz · encode volume ${ENCODE_VOLUME}</footer>
  </main>
</body>
</html>`;
}

function writeReport() {
  const reportDirectory = process.env.TEST_REPORT_DIR;
  if (!reportDirectory) return;

  const absoluteDirectory = path.resolve(reportDirectory);
  const report = {
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    durationMs: Date.now() - startedAt.getTime(),
    total: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    messageLengths: [...new Set(results.map((result) => result.messageBytes))],
    frequencyRanges: FREQUENCY_RANGES,
    noiseLevels: NOISE_LEVELS,
    results,
  };

  fs.mkdirSync(absoluteDirectory, { recursive: true });
  fs.writeFileSync(path.join(absoluteDirectory, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(absoluteDirectory, 'index.html'), renderReport(report));
}

before(async () => {
  ggwave = await ggwaveFactory();
  parameters = ggwave.getDefaultParameters();
  parameters.sampleRateInp = SAMPLE_RATE;
  parameters.sampleRateOut = SAMPLE_RATE;
  transmitter = ggwave.init(parameters);
});

after(() => {
  if (transmitter) ggwave.free(transmitter);
  writeReport();
});

test('GGWave returns the exact encoded message in every frequency range', async (suite) => {
  for (const range of FREQUENCY_RANGES) {
    for (const [messageIndex, message] of MESSAGES.entries()) {
      const originalLog = console.log;
      let encodedBytes;
      try {
        console.log = () => {};
        encodedBytes = ggwave.encode(
          transmitter,
          message,
          getProtocolId(ggwave.ProtocolId, range, 1),
          ENCODE_VOLUME,
        );
      } finally {
        console.log = originalLog;
      }

      assert.ok(encodedBytes.length > 0, `encoder returned audio for ${range} ${message.length}-byte message`);
      const encodedSamples = byteViewToFloat32(encodedBytes);
      const capturedSamples = simulateCapturedAudio(encodedSamples, range);
      const signalRms = rms(capturedSamples);

      for (const [noiseIndex, noiseAmplitude] of NOISE_LEVELS.entries()) {
        await suite.test(`${range}: ${message.length} bytes with ${(noiseAmplitude * 100).toFixed(1)}% noise`, () => {
          const started = process.hrtime.bigint();
          const receiver = ggwave.init(parameters);
          let decodedBytes;

          try {
            const noisyCapturedSamples = addGaussianNoise(
              capturedSamples,
              noiseAmplitude,
              0x57415645 + messageIndex * 101 + noiseIndex,
            );
            const samplesForDecode = prepareForDecode(noisyCapturedSamples, range);
            console.log = () => {};
            decodedBytes = ggwave.decode(receiver, float32ToByteView(samplesForDecode));
          } finally {
            console.log = originalLog;
            ggwave.free(receiver);
          }

          const decodedMessage = decodedBytes
            ? new TextDecoder('utf-8', { fatal: true }).decode(decodedBytes)
            : '';
          const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
          const passed = decodedMessage === message;

          results.push({
            passed,
            range,
            message,
            messageBytes: Buffer.byteLength(message),
            noiseAmplitude,
            signalRms,
            encodedSamples: capturedSamples.length,
            durationMs,
            decodedMessage,
          });

          assert.equal(decodedMessage, message);
        });
      }
    }
  }
});
