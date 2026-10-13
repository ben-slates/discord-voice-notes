/*
 * Vencord Plugin: SoundboardEverywhere
 * Unlocks Soundboard from any server anywhere and routes playback directly
 * through the microphone stream, bypassing Discord server-side Nitro checks.
 * Also replaces soundmojis in chat with playable CDN links.
 */

interface AudioInput {
    context: AudioContext;
    mute: boolean;
    setPTTActive(active: boolean): void;
    setSpeaking(active: boolean): void;
}

interface MixedInput {
    input: AudioInput;
    sourceStream: MediaStream;
    source: MediaStreamAudioSourceNode;
    microphoneGain: GainNode;
    destination: MediaStreamAudioDestinationNode;
}

interface SoundboardSound {
    soundId: string;
    volume?: number;
    name?: string;
    guildId?: string;
}

interface PlaybackSource {
    input: AudioInput;
    source: AudioBufferSourceNode;
    gain: GainNode;
}

interface Playback {
    controller: AbortController;
    sources: PlaybackSource[];
    onStop?: () => void;
}

const mixedInputs = new Map<MediaStream, MixedInput>();
const playbacks = new Set<Playback>();

function stopPlayback(active: Playback): void {
    if (!playbacks.delete(active)) return;

    active.controller.abort();
    for (const { input, source, gain } of active.sources) {
        source.onended = null;
        try {
            source.stop();
        } catch (_) {}
        source.disconnect();
        gain.disconnect();
        const isStillPlaying = [...playbacks].some(playback => playback.sources.some(s => s.input === input));
        if (input.mute) input.setSpeaking(isStillPlaying);
        else input.setPTTActive(isStillPlaying);

        for (const mixed of mixedInputs.values()) {
            if (mixed.input !== input) continue;
            mixed.microphoneGain.gain.value = input.mute ? 0 : 1;
            for (const track of mixed.destination.stream.getAudioTracks()) {
                track.enabled = !input.mute || isStillPlaying;
            }
        }
    }
    active.onStop?.();
}

function startPlaybackSources(buffer: AudioBuffer, volume: number, active: Playback, inputs: MixedInput[]): void {
    for (const [index, { input, microphoneGain, destination }] of inputs.entries()) {
        const source = input.context.createBufferSource();
        const gain = input.context.createGain();
        source.buffer = buffer;
        gain.gain.value = volume;
        source.connect(gain).connect(destination);
        if (index === 0) gain.connect(input.context.destination);
        source.onended = () => stopPlayback(active);
        active.sources.push({ input, source, gain });
        microphoneGain.gain.value = input.mute ? 0 : 1;
        for (const track of destination.stream.getAudioTracks()) track.enabled = true;
        if (input.mute) input.setSpeaking(true);
        else input.setPTTActive(true);
        source.start();
    }
}

export const SoundboardEverywhere = {
    name: "SoundboardEverywhere",
    description: "Allows using soundboard sounds from any server anywhere and sends soundmojis seamlessly.",
    authors: [
        { name: "Vendicated", id: 0n },
        { name: "Ben", id: 0n }
    ],
    tags: ["Soundboard", "Voice", "Chat", "Nitro"],

    patches: [
        {
            find: 'type:"GUILD_SOUNDBOARD_SOUND_CREATE"',
            replacement: {
                match: /(?<=type:"(?:SOUNDBOARD_SOUNDS_RECEIVED|GUILD_SOUNDBOARD_SOUND_CREATE|GUILD_SOUNDBOARD_SOUND_UPDATE|GUILD_SOUNDBOARD_SOUNDS_UPDATE)".{0,200}?available:)\i\.available/g,
                replace: "!0",
            },
        },
        {
            find: /getFlattenedGuildIds\(\).{0,100}USE_EXTERNAL_SOUNDS.{0,100}canUseSoundboardEverywhere/,
            replacement: {
                match: /\i\.\i\.can\(\i\.\i\.USE_EXTERNAL_SOUNDS,\i\)/,
                replace: "!0",
            },
        },
        {
            find: "CALLABLE.has(e.type))return!0;let",
            replacement: {
                match: /(?<=return \i\.isGuildVoiceOrThread\(\))&&\i&&(\i)/,
                replace: "&&$1",
            },
        },
        {
            find: ".SEND_SOUNDBOARD_SOUND(",
            group: true,
            replacement: [
                {
                    match: /function \i\((\i),(\i),\i,\i\)\{(?=\(0,\i\.\i\)\(\2,\1\))/,
                    replace: "$&return $self.playSound($1);",
                },
                {
                    match: /\(\i\.Ay\.canUseSoundboardEverywhere\(\i\)\|\|\i\.guildId===\i\?\.guild_id\|\|"0"===\i\.guildId\)/,
                    replace: "!0",
                },
                {
                    match: /\i\.A\.can\(\i\.xBc\.USE_EXTERNAL_SOUNDS,\i\)/,
                    replace: "!0",
                },
            ],
        },
        {
            find: "AudioInput: No MediaStream",
            group: true,
            replacement: [
                {
                    match: /(?<=}else this\.stream=\i;)return this\.updateMode\(\)/,
                    replace: "this.stream=$self.mixInput(this,this.stream);return this.updateMode()",
                },
                {
                    match: /release\((\i)\)\{\1\.getTracks\(\)/,
                    replace: "release($1){$self.releaseInput($1);$1.getTracks()",
                },
                {
                    match: /(?<=\.enabled=)!this\._mute/,
                    replace: "$self.shouldEnableInput(this)",
                },
                {
                    match: /set mute\((\i)\)\{this\._mute=\1,this\.updateAudioTracks\(\),this\.setSpeaking\(!1\)/,
                    replace: "set mute($1){this._mute=$1,this.updateAudioTracks(),this.setSpeaking($self.isInputPlaying(this))",
                },
            ],
        },
    ],

    mixInput(input: AudioInput, stream: MediaStream): MediaStream {
        const source = input.context.createMediaStreamSource(stream);
        const microphoneGain = input.context.createGain();
        const destination = input.context.createMediaStreamDestination();
        source.connect(microphoneGain).connect(destination);

        const mixedStream = destination.stream;
        mixedInputs.set(mixedStream, { input, sourceStream: stream, source, microphoneGain, destination });
        return mixedStream;
    },

    releaseInput(stream: MediaStream): void {
        const mixed = mixedInputs.get(stream);
        if (mixed == null) return;

        mixedInputs.delete(stream);
        mixed.source.disconnect();
        mixed.microphoneGain.disconnect();
        for (const track of mixed.sourceStream.getTracks()) track.stop();
    },

    shouldEnableInput(input: AudioInput): boolean {
        for (const mixed of mixedInputs.values()) {
            if (mixed.input === input) mixed.microphoneGain.gain.value = input.mute ? 0 : 1;
        }
        return !input.mute || this.isInputPlaying(input);
    },

    isInputPlaying(input: AudioInput): boolean {
        for (const playback of playbacks) {
            if (playback.sources.some(source => source.input === input)) return true;
        }
        return false;
    },

    async playSound(sound: SoundboardSound): Promise<void> {
        try {
            const cdn = (window as any).GLOBAL_ENV?.CDN_HOST || "cdn.discordapp.com";
            const soundUrl = `https://${cdn}/soundboard-sounds/${encodeURIComponent(sound.soundId)}`;

            // 1. Web Audio injection (Web / Vesktop)
            const inputs = [...mixedInputs.values()];
            if (inputs.length > 0) {
                const controller = new AbortController();
                const active: Playback = { controller, sources: [] };
                playbacks.add(active);

                try {
                    const [{ input: firstInput }] = inputs;
                    const { context } = firstInput;
                    await context.resume();

                    const response = await fetch(soundUrl, { signal: controller.signal });
                    if (response.ok) {
                        const buffer = await context.decodeAudioData(await response.arrayBuffer());
                        if (playbacks.has(active)) {
                            const volume = Math.max(0, Math.min(1, sound.volume ?? 1));
                            startPlaybackSources(buffer, volume, active, inputs);
                        }
                    }
                } catch (_) {
                    stopPlayback(active);
                }
            }

            // 2. Direct local monitoring & Virtual Bridge sink injection
            try {
                const monitorAudio = new Audio(soundUrl);
                monitorAudio.volume = Math.max(0, Math.min(1, sound.volume ?? 1));
                monitorAudio.play().catch(() => {});

                if (navigator?.mediaDevices?.enumerateDevices) {
                    navigator.mediaDevices.enumerateDevices().then(devices => {
                        const bridgeSink = devices.find(d => d.kind === "audiooutput" && (
                            d.label.includes("DiscordSoundboardBridge") ||
                            d.label.includes("Combined") ||
                            d.label.includes("CABLE Input")
                        ));
                        if (bridgeSink) {
                            const bridgeAudio = new Audio(soundUrl);
                            bridgeAudio.volume = Math.max(0, Math.min(1, sound.volume ?? 1));
                            if (typeof (bridgeAudio as any).setSinkId === "function") {
                                (bridgeAudio as any).setSinkId(bridgeSink.deviceId).then(() => bridgeAudio.play()).catch(() => {});
                            }
                        }
                    }).catch(() => {});
                }
            } catch (_) {}

            // 3. Native Audio Bridge playback into virtual microphone
            try {
                if ((window as any).VencordNative?.pluginHelpers?.SoundboardBridge?.controlBridge) {
                    (window as any).VencordNative.pluginHelpers.SoundboardBridge.controlBridge("play", soundUrl);
                }
            } catch (_) {}
        } catch (e) {
            console.error("[SoundboardEverywhere] playSound error:", e);
        }
    },

    onBeforeMessageSend(_channelId: string, msg: any) {
        if (!msg?.content) return;
        const soundRegex = /<sound:\d+:(\d+)>/g;
        if (soundRegex.test(msg.content)) {
            msg.content = msg.content.replace(soundRegex, (_: string, soundId: string) => {
                return `https://cdn.discordapp.com/soundboard-sounds/${soundId}`;
            });
        }
    },

    start() {
        try {
            if ((window as any)._sb_hooked) return;
            (window as any)._sb_hooked = true;
            const self = this;

            const origFetch = window.fetch;
            window.fetch = function(resource, init) {
                const url = typeof resource === "string" ? resource : (resource as Request)?.url;
                if (url && typeof url === "string" && url.includes("/send-soundboard-sound")) {
                    try {
                        let soundId = null;
                        if (init?.body) {
                            const parsed = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
                            soundId = parsed?.sound_id;
                        }
                        if (soundId) {
                            self.playSound({ soundId: soundId, volume: 1 });
                            return Promise.resolve(new Response(null, { status: 204 }));
                        }
                    } catch (e) {
                        console.error("[SoundboardEverywhere] fetch intercept error:", e);
                    }
                }
                return origFetch.apply(this, arguments as any);
            };

            const origOpen = XMLHttpRequest.prototype.open;
            const origSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.open = function(_method: string, url: string | URL) {
                (this as any)._sb_url = String(url);
                return origOpen.apply(this, arguments as any);
            };
            XMLHttpRequest.prototype.send = function(body) {
                if ((this as any)._sb_url && typeof (this as any)._sb_url === "string" && (this as any)._sb_url.includes("/send-soundboard-sound")) {
                    try {
                        let soundId = null;
                        if (body) {
                            const parsed = typeof body === "string" ? JSON.parse(body) : body;
                            soundId = parsed?.sound_id;
                        }
                        if (soundId) {
                            self.playSound({ soundId: soundId, volume: 1 });
                            Object.defineProperty(this, "status", { value: 204, writable: true });
                            Object.defineProperty(this, "readyState", { value: 4, writable: true });
                            Object.defineProperty(this, "responseText", { value: "", writable: true });
                            setTimeout(() => {
                                this.dispatchEvent(new Event("readystatechange"));
                                this.dispatchEvent(new Event("load"));
                                this.dispatchEvent(new Event("loadend"));
                            }, 5);
                            return;
                        }
                    } catch (e) {
                        console.error("[SoundboardEverywhere] XHR intercept error:", e);
                    }
                }
                return origSend.apply(this, arguments as any);
            };
        } catch (err) {
            console.error("[SoundboardEverywhere] start hook error:", err);
        }
    },

    stop() {
        for (const playback of playbacks) stopPlayback(playback);
        for (const [stream] of mixedInputs) {
            this.releaseInput(stream);
            for (const track of stream.getTracks()) track.stop();
        }
    },
};

export default SoundboardEverywhere;
