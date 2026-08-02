# Wavest 🔒🤳🏼🔊

### Wavest is a modernized demonstration of the amazing [GGWave](https://github.com/ggerganov/ggwave). 
#### It allows any device with a microphone and speaker to communicate via audible or ultrasonic waves. Wavest also adds different audio modes, callsigns, and encryption.

Enable **Live Keyboard Mode** in Settings to poll the message field and queue typed characters for transmission. Keys accumulated during an active transmission are consolidated into the next audio payload.

## Try it [here](https://curtcox.github.io/Wavest/).

## Automated verification

The bundled GGWave WebAssembly codec is tested end to end across audible, inaudible, and ultrasound frequency ranges, all three transmission speeds, messages from 1 to 120 bytes, and six deterministic noise levels. Inaudible reception is also verified with 128-, 1,024-, and 2,048-sample capture chunks to match streaming browser audio. The live-mode integration test types into the page input queue and verifies every character after audio encode and decode. Every decoded payload must exactly match the message that was encoded.

[View the latest test results](https://curtcox.github.io/Wavest/test-results/) · Run locally with `npm test`

This project is based on the original [bennjordan/Wavest](https://github.com/bennjordan/Wavest) repository.

A free Android version will be published to the Play Store in the future.

![App Screenshot](https://github.com/bennjordan/Wavest/blob/main/screen.png?raw=true)
