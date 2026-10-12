// src/components/Icons.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var MicrophoneIcon = ({ size = 20, color = "currentColor", ...props }) => /* @__PURE__ */ jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", ...props, children: [
  /* @__PURE__ */ jsx("path", { d: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" }),
  /* @__PURE__ */ jsx("path", { d: "M19 10v2a7 7 0 0 1-14 0v-2" }),
  /* @__PURE__ */ jsx("line", { x1: "12", y1: "19", x2: "12", y2: "22" })
] });
var StopIcon = ({ size = 20, color = "currentColor", ...props }) => /* @__PURE__ */ jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: color, ...props, children: /* @__PURE__ */ jsx("rect", { x: "6", y: "6", width: "12", height: "12", rx: "2" }) });
var TrashIcon = ({ size = 20, color = "currentColor", ...props }) => /* @__PURE__ */ jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", ...props, children: [
  /* @__PURE__ */ jsx("polyline", { points: "3 6 5 6 21 6" }),
  /* @__PURE__ */ jsx("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" })
] });
var PlayIcon = ({ size = 20, color = "currentColor", ...props }) => /* @__PURE__ */ jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: color, ...props, children: /* @__PURE__ */ jsx("polygon", { points: "5 3 19 12 5 21 5 3" }) });
var PauseIcon = ({ size = 20, color = "currentColor", ...props }) => /* @__PURE__ */ jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: color, ...props, children: [
  /* @__PURE__ */ jsx("rect", { x: "6", y: "4", width: "4", height: "16", rx: "1" }),
  /* @__PURE__ */ jsx("rect", { x: "14", y: "4", width: "4", height: "16", rx: "1" })
] });
var SendIcon = ({ size = 20, color = "currentColor", ...props }) => /* @__PURE__ */ jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", ...props, children: [
  /* @__PURE__ */ jsx("line", { x1: "22", y1: "2", x2: "11", y2: "13" }),
  /* @__PURE__ */ jsx("polygon", { points: "22 2 15 22 11 13 2 9 22 2" })
] });

// src/plugin/VoiceBarButton.tsx
import React2, { useState as useState2 } from "react";

// src/components/VoicePanel.tsx
import { useState, useEffect, useRef } from "react";

// src/discord/types.ts
var MessageFlags = {
  CROSSPOSTED: 1 << 0,
  IS_CROSSPOST: 1 << 1,
  SUPPRESS_EMBEDS: 1 << 2,
  SOURCE_MESSAGE_DELETED: 1 << 3,
  URGENT: 1 << 4,
  HAS_THREAD: 1 << 5,
  EPHEMERAL: 1 << 6,
  LOADING: 1 << 7,
  FAILED_TO_MENTION_SOME_ROLES_IN_THREAD: 1 << 8,
  SUPPRESS_NOTIFICATIONS: 1 << 12,
  IS_VOICE_MESSAGE: 1 << 13,
  // 8192
  HAS_SNAPSHOT: 1 << 14
};
var EMPTY_AUDIO_METADATA = {
  waveform: "AAAAAAAAAAAA",
  duration: 1,
  sampleRate: 48e3,
  channels: 1,
  codec: "audio/ogg; codecs=opus"
};

// src/audio/waveform.ts
function encodeWaveformBase64(bytes) {
  if (!bytes || bytes.length === 0) {
    return EMPTY_AUDIO_METADATA.waveform;
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
function decodeWaveformBase64(base64) {
  if (!base64 || typeof base64 !== "string") {
    return new Uint8Array(0);
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    return new Uint8Array(0);
  }
  try {
    if (typeof Buffer !== "undefined") {
      const buf = Buffer.from(base64, "base64");
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
    }
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return new Uint8Array(0);
  }
}
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}
function calculateBinCount(durationSecs, totalSamples) {
  if (totalSamples <= 0) return 0;
  const desired = Math.floor(durationSecs * 10);
  const minBins = Math.min(32, totalSamples);
  return clamp(desired, minBins, 256);
}
function generateWaveformFromSamples(channelData, sampleRate = 48e3) {
  if (!channelData || channelData.length === 0 || sampleRate <= 0) {
    return { ...EMPTY_AUDIO_METADATA };
  }
  const duration = channelData.length / sampleRate;
  const binCount = calculateBinCount(duration, channelData.length);
  if (binCount === 0) {
    return { ...EMPTY_AUDIO_METADATA, duration };
  }
  const bins = new Uint8Array(binCount);
  const samplesPerBin = Math.max(1, Math.floor(channelData.length / binCount));
  for (let binIdx = 0; binIdx < binCount; binIdx++) {
    let sumSquares = 0;
    const start = binIdx * samplesPerBin;
    const end = Math.min(start + samplesPerBin, channelData.length);
    const count = end - start;
    if (count > 0) {
      for (let i = start; i < end; i++) {
        const sample = channelData[i];
        sumSquares += sample * sample;
      }
      const rms = Math.sqrt(sumSquares / count);
      bins[binIdx] = Math.min(255, Math.floor(rms * 255));
    } else {
      bins[binIdx] = 0;
    }
  }
  let maxBin = 0;
  for (let i = 0; i < bins.length; i++) {
    if (bins[i] > maxBin) maxBin = bins[i];
  }
  if (maxBin > 0) {
    const ratio = 1 + (255 / maxBin - 1) * Math.min(1, 100 * (maxBin / 255) ** 3);
    for (let i = 0; i < bins.length; i++) {
      bins[i] = Math.min(255, Math.floor(bins[i] * ratio));
    }
  }
  return {
    waveform: encodeWaveformBase64(bins),
    duration: Math.round(duration * 100) / 100,
    sampleRate,
    channels: 1,
    codec: "audio/ogg; codecs=opus"
  };
}

// src/audio/recorder.ts
var VoiceRecorderController = class _VoiceRecorderController {
  state = "idle";
  mediaStream = null;
  mediaRecorder = null;
  recordedChunks = [];
  timerInterval = null;
  elapsedSeconds = 0;
  startTime = 0;
  options;
  audioContext = null;
  analyser = null;
  constructor(options = {}) {
    this.options = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...options
    };
  }
  getState() {
    return this.state;
  }
  getElapsedSeconds() {
    return this.elapsedSeconds;
  }
  updateStatus(errorMessage, audioBlob, metadata) {
    if (this.options.onStatusChange) {
      this.options.onStatusChange({
        state: this.state,
        elapsedSeconds: this.elapsedSeconds,
        errorMessage,
        audioBlob,
        metadata
      });
    }
  }
  static getSupportedMimeType() {
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
      return "audio/ogg; codecs=opus";
    }
    const candidateTypes = [
      "audio/ogg; codecs=opus",
      "audio/ogg",
      "audio/webm; codecs=opus",
      "audio/webm"
    ];
    for (const type of candidateTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return "";
  }
  async start() {
    if (this.state === "recording") {
      return;
    }
    this.cleanup();
    this.state = "requesting_permission";
    this.updateStatus();
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      this.state = "error";
      const err = "Audio recording is not supported in this environment (missing navigator.mediaDevices)";
      this.updateStatus(err);
      throw new Error(err);
    }
    try {
      const constraints = {
        audio: {
          echoCancellation: this.options.echoCancellation,
          noiseSuppression: this.options.noiseSuppression,
          autoGainControl: this.options.autoGainControl,
          deviceId: this.options.deviceId ? { exact: this.options.deviceId } : void 0
        },
        video: false
      };
      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      const mimeType = this.options.preferredMimeType || _VoiceRecorderController.getSupportedMimeType();
      const recorderOptions = {};
      if (mimeType) {
        recorderOptions.mimeType = mimeType;
      }
      this.mediaRecorder = new MediaRecorder(this.mediaStream, recorderOptions);
      this.recordedChunks = [];
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          this.audioContext = new AudioContextClass();
          const source = this.audioContext.createMediaStreamSource(this.mediaStream);
          this.analyser = this.audioContext.createAnalyser();
          this.analyser.fftSize = 256;
          source.connect(this.analyser);
        }
      } catch {
      }
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };
      this.mediaRecorder.onerror = (event) => {
        this.state = "error";
        const err = event.error?.message || "MediaRecorder error";
        this.cleanup();
        this.updateStatus(err);
      };
      this.mediaRecorder.start(100);
      this.startTime = Date.now();
      this.elapsedSeconds = 0;
      this.state = "recording";
      this.startTimer();
      this.updateStatus();
    } catch (error) {
      this.cleanup();
      this.state = "error";
      const errName = error?.name;
      let friendlyMessage = "Failed to access microphone.";
      if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
        friendlyMessage = "Microphone access denied. Please grant microphone permissions in Discord / Linux.";
      } else if (errName === "NotFoundError" || errName === "DevicesNotFoundError") {
        friendlyMessage = "No microphone device found on this system.";
      } else if (errName === "NotReadableError" || errName === "TrackStartError") {
        friendlyMessage = "Microphone is in use by another application or unavailable.";
      } else if (error instanceof Error) {
        friendlyMessage = error.message;
      }
      this.updateStatus(friendlyMessage);
      throw new Error(friendlyMessage);
    }
  }
  pause() {
    if (this.state !== "recording" || !this.mediaRecorder) {
      return;
    }
    if (this.mediaRecorder.state === "recording") {
      this.mediaRecorder.pause();
    }
    this.stopTimer();
    this.state = "paused";
    this.updateStatus();
  }
  resume() {
    if (this.state !== "paused" || !this.mediaRecorder) {
      return;
    }
    if (this.mediaRecorder.state === "paused") {
      this.mediaRecorder.resume();
    }
    this.startTimer();
    this.state = "recording";
    this.updateStatus();
  }
  async stop() {
    if (this.state !== "recording" && this.state !== "paused") {
      throw new Error(`Cannot stop recording when in '${this.state}' state`);
    }
    this.stopTimer();
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        this.cleanup();
        this.state = "idle";
        return reject(new Error("No active MediaRecorder"));
      }
      this.mediaRecorder.onstop = async () => {
        try {
          const finalMime = this.mediaRecorder?.mimeType || "audio/ogg; codecs=opus";
          const blob = new Blob(this.recordedChunks, { type: finalMime });
          let metadata;
          try {
            const arrayBuf = await blob.arrayBuffer();
            if (this.audioContext && this.audioContext.state !== "closed") {
              const decoded = await this.audioContext.decodeAudioData(arrayBuf.slice(0));
              const channelData = decoded.getChannelData(0);
              metadata = generateWaveformFromSamples(channelData, decoded.sampleRate);
            } else {
              metadata = {
                waveform: "AAAAAAAAAAAA",
                duration: Math.max(0.1, Math.round(this.elapsedSeconds * 100) / 100),
                sampleRate: 48e3,
                channels: 1,
                codec: finalMime
              };
            }
          } catch {
            metadata = {
              waveform: "AAAAAAAAAAAA",
              duration: Math.max(0.1, Math.round(this.elapsedSeconds * 100) / 100),
              sampleRate: 48e3,
              channels: 1,
              codec: finalMime
            };
          }
          this.state = "stopped";
          this.updateStatus(void 0, blob, metadata);
          this.cleanup();
          resolve({ blob, metadata });
        } catch (e) {
          this.cleanup();
          this.state = "error";
          const msg = e instanceof Error ? e.message : "Failed to finalize recording";
          this.updateStatus(msg);
          reject(e);
        }
      };
      this.mediaRecorder.stop();
    });
  }
  cancel() {
    this.cleanup();
    this.state = "idle";
    this.recordedChunks = [];
    this.elapsedSeconds = 0;
    this.updateStatus();
  }
  getLiveAudioData(outputArray) {
    if (this.analyser && this.state === "recording") {
      this.analyser.getByteFrequencyData(outputArray);
    } else {
      outputArray.fill(0);
    }
  }
  startTimer() {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      this.elapsedSeconds = Math.round((Date.now() - this.startTime) / 1e3);
      this.updateStatus();
    }, 200);
  }
  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
  cleanup() {
    this.stopTimer();
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
        }
      });
      this.mediaStream = null;
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      try {
        this.audioContext.close();
      } catch {
      }
      this.audioContext = null;
    }
    this.analyser = null;
    this.mediaRecorder = null;
  }
};

// src/components/VoicePanel.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var VoicePanel = ({
  channelId: _channelId,
  onClose,
  onSend
}) => {
  const [state, setState] = useState("idle");
  const [elapsed, setElapsed] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [asNormalAttachment, setAsNormalAttachment] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const controllerRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };
  useEffect(() => {
    const controller = new VoiceRecorderController({
      onStatusChange: (status) => {
        setState(status.state);
        setElapsed(status.elapsedSeconds);
        if (status.errorMessage) {
          setErrorMessage(status.errorMessage);
        }
      }
    });
    controllerRef.current = controller;
    controller.start().catch((err) => {
      const msg = err instanceof Error ? err.message : "Failed to start recording";
      setErrorMessage(msg);
    });
    return () => {
      controller.cleanup();
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, []);
  const handleStop = async () => {
    if (!controllerRef.current) return;
    try {
      const { blob, metadata: metadata2 } = await controllerRef.current.stop();
      setAudioBlob(blob);
      setMetadata(metadata2);
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to stop recording";
      setErrorMessage(msg);
    }
  };
  const handleCancel = () => {
    if (controllerRef.current) {
      controllerRef.current.cancel();
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    onClose();
  };
  const togglePlayback = () => {
    if (!audioPlayerRef.current) return;
    if (isPlaying) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    } else {
      audioPlayerRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        setIsPlaying(false);
      });
    }
  };
  const handleSend = async () => {
    if (!audioBlob || !metadata || isUploading) return;
    setIsUploading(true);
    setErrorMessage(null);
    try {
      await onSend(audioBlob, metadata, asNormalAttachment);
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send voice message";
      setErrorMessage(msg);
      setIsUploading(false);
    }
  };
  const waveformBytes = metadata?.waveform ? decodeWaveformBase64(metadata.waveform) : new Uint8Array(0);
  return /* @__PURE__ */ jsxs2("div", { className: "dvn-container", children: [
    errorMessage && /* @__PURE__ */ jsx2("div", { className: "dvn-error-banner", children: errorMessage }),
    audioUrl && /* @__PURE__ */ jsx2(
      "audio",
      {
        ref: audioPlayerRef,
        src: audioUrl,
        onTimeUpdate: () => {
          if (audioPlayerRef.current) {
            setPlaybackTime(audioPlayerRef.current.currentTime);
          }
        },
        onEnded: () => {
          setIsPlaying(false);
          setPlaybackTime(0);
        }
      }
    ),
    (state === "recording" || state === "requesting_permission" || state === "paused") && /* @__PURE__ */ jsxs2("div", { className: "dvn-row", children: [
      /* @__PURE__ */ jsxs2("div", { className: "dvn-recording-indicator", children: [
        /* @__PURE__ */ jsx2("div", { className: "dvn-pulse-dot" }),
        /* @__PURE__ */ jsx2("span", { children: state === "paused" ? "Paused" : "Recording" }),
        /* @__PURE__ */ jsx2("span", { className: "dvn-timer", children: formatTime(elapsed) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "dvn-controls", children: [
        state === "recording" ? /* @__PURE__ */ jsxs2(
          "button",
          {
            className: "dvn-btn dvn-btn-secondary",
            onClick: () => controllerRef.current?.pause(),
            title: "Pause recording",
            children: [
              /* @__PURE__ */ jsx2(PauseIcon, { size: 16 }),
              " Pause"
            ]
          }
        ) : state === "paused" ? /* @__PURE__ */ jsxs2(
          "button",
          {
            className: "dvn-btn dvn-btn-secondary",
            onClick: () => controllerRef.current?.resume(),
            title: "Resume recording",
            children: [
              /* @__PURE__ */ jsx2(MicrophoneIcon, { size: 16 }),
              " Resume"
            ]
          }
        ) : null,
        /* @__PURE__ */ jsxs2(
          "button",
          {
            className: "dvn-btn dvn-btn-primary",
            onClick: handleStop,
            title: "Finish and preview recording",
            children: [
              /* @__PURE__ */ jsx2(StopIcon, { size: 16 }),
              " Stop"
            ]
          }
        ),
        /* @__PURE__ */ jsxs2(
          "button",
          {
            className: "dvn-btn dvn-btn-danger",
            onClick: handleCancel,
            title: "Discard recording",
            children: [
              /* @__PURE__ */ jsx2(TrashIcon, { size: 16 }),
              " Cancel"
            ]
          }
        )
      ] })
    ] }),
    state === "stopped" && audioBlob && metadata && /* @__PURE__ */ jsxs2("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [
      /* @__PURE__ */ jsxs2("div", { className: "dvn-row", children: [
        /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
          /* @__PURE__ */ jsx2(
            "button",
            {
              className: "dvn-btn dvn-btn-secondary",
              onClick: togglePlayback,
              title: isPlaying ? "Pause" : "Play preview",
              children: isPlaying ? /* @__PURE__ */ jsx2(PauseIcon, { size: 16 }) : /* @__PURE__ */ jsx2(PlayIcon, { size: 16 })
            }
          ),
          /* @__PURE__ */ jsxs2("span", { className: "dvn-timer", children: [
            formatTime(playbackTime),
            " / ",
            formatTime(metadata.duration)
          ] })
        ] }),
        /* @__PURE__ */ jsx2("div", { className: "dvn-fallback-toggle", children: /* @__PURE__ */ jsxs2("label", { style: { display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }, children: [
          /* @__PURE__ */ jsx2(
            "input",
            {
              type: "checkbox",
              checked: asNormalAttachment,
              onChange: (e) => setAsNormalAttachment(e.target.checked)
            }
          ),
          "Send as normal attachment fallback"
        ] }) })
      ] }),
      waveformBytes.length > 0 && /* @__PURE__ */ jsx2("div", { className: "dvn-waveform-preview", children: Array.from(waveformBytes).slice(0, 64).map((val, idx) => {
        const heightPercent = Math.max(10, Math.round(val / 255 * 100));
        const playedProgress = metadata.duration > 0 ? playbackTime / metadata.duration : 0;
        const barProgress = idx / Math.min(64, waveformBytes.length);
        const isPlayed = barProgress <= playedProgress;
        return /* @__PURE__ */ jsx2(
          "div",
          {
            className: `dvn-waveform-bar ${isPlayed ? "played" : ""}`,
            style: { height: `${heightPercent}%` }
          },
          idx
        );
      }) }),
      /* @__PURE__ */ jsxs2("div", { className: "dvn-row", children: [
        /* @__PURE__ */ jsxs2(
          "button",
          {
            className: "dvn-btn dvn-btn-danger",
            onClick: handleCancel,
            title: "Discard voice message",
            children: [
              /* @__PURE__ */ jsx2(TrashIcon, { size: 16 }),
              " Discard"
            ]
          }
        ),
        /* @__PURE__ */ jsxs2(
          "button",
          {
            className: "dvn-btn dvn-btn-primary",
            onClick: handleSend,
            disabled: isUploading,
            title: "Send native voice message",
            children: [
              /* @__PURE__ */ jsx2(SendIcon, { size: 16 }),
              isUploading ? "Uploading..." : "Send Voice Note"
            ]
          }
        )
      ] })
    ] })
  ] });
};

// src/discord/uploader.ts
function buildVoiceMessagePayload(channelId, uploadedFilename, metadata, options = {}) {
  const filename = options.filename || "voice-message.ogg";
  const nonce = options.nonce || String(Date.now());
  const flags = options.asNormalAttachment ? 0 : MessageFlags.IS_VOICE_MESSAGE;
  const attachmentObj = {
    id: "0",
    filename,
    uploaded_filename: uploadedFilename
  };
  if (!options.asNormalAttachment) {
    attachmentObj.waveform = metadata.waveform;
    attachmentObj.duration_secs = metadata.duration;
  }
  return {
    flags,
    channel_id: channelId,
    content: "",
    nonce,
    sticker_ids: [],
    type: 0,
    attachments: [attachmentObj],
    message_reference: options.messageReference || null
  };
}
async function sendVoiceMessage(channelId, audioBlob, metadata, discordModules, options = {}) {
  const { CloudUpload, RestAPI, Constants, SnowflakeUtils, showToast } = discordModules;
  if (!CloudUpload || !RestAPI || !Constants?.Endpoints) {
    const error = new Error("Discord upload modules not found. Ensure Discord is fully initialized.");
    if (showToast) showToast(error.message, "failure");
    options.onError?.(error);
    throw error;
  }
  const filename = "voice-message.ogg";
  const file = new File([audioBlob], filename, { type: audioBlob.type || "audio/ogg; codecs=opus" });
  return new Promise((resolve, reject) => {
    try {
      const upload = new CloudUpload(
        {
          file,
          isThumbnail: false,
          platform: 1
        },
        channelId
      );
      if (options.onProgress && typeof upload.on === "function") {
        upload.on("progress", (progress) => {
          if (progress.total > 0) {
            options.onProgress?.(Math.round(progress.loaded / progress.total * 100));
          }
        });
      }
      upload.on("complete", async () => {
        try {
          const nonce = SnowflakeUtils?.fromTimestamp ? SnowflakeUtils.fromTimestamp(Date.now()) : String(Date.now());
          const payload = buildVoiceMessagePayload(
            channelId,
            upload.uploadedFilename,
            metadata,
            {
              nonce,
              filename,
              asNormalAttachment: options.asNormalAttachment,
              messageReference: options.replyMessageReference
            }
          );
          await RestAPI.post({
            url: Constants.Endpoints.MESSAGES(channelId),
            body: payload
          });
          if (showToast) {
            showToast(
              options.asNormalAttachment ? "Audio attachment sent!" : "Voice message sent!",
              "success"
            );
          }
          options.onSuccess?.();
          resolve();
        } catch (sendError) {
          const err = sendError instanceof Error ? sendError : new Error(String(sendError));
          if (showToast) {
            showToast(`Failed to send message: ${err.message}`, "failure");
          }
          options.onError?.(err);
          reject(err);
        }
      });
      upload.on("error", (uploadError) => {
        const innerMsg = uploadError instanceof Error ? uploadError.message : "Failed to upload audio to Discord CDN";
        const err = new Error(`Voice message upload failed: ${innerMsg}`);
        if (showToast) {
          showToast(err.message, "failure");
        }
        options.onError?.(err);
        reject(err);
      });
      upload.upload();
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (showToast) showToast(err.message, "failure");
      options.onError?.(err);
      reject(err);
    }
  });
}

// src/plugin/VoiceBarButton.tsx
import { Fragment, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var activePanels = /* @__PURE__ */ new Map();
var VoiceNoteChatBarButton = ({ channel, channelId, disabled }) => {
  const activeChannelId = channel?.id || channelId || "";
  const [isPanelOpen, setIsPanelOpen] = useState2(false);
  React2.useEffect(() => {
    if (activeChannelId) {
      activePanels.set(activeChannelId, setIsPanelOpen);
      return () => {
        activePanels.delete(activeChannelId);
      };
    }
    return void 0;
  }, [activeChannelId]);
  const handleSend = async (blob, metadata, asNormalAttachment) => {
    const vencordWebpack = window.Vencord?.Webpack;
    const CloudUpload = vencordWebpack?.findLazy?.((m) => m.prototype?.trackUploadFinished) || window.CloudUpload;
    const RestAPI = vencordWebpack?.Common?.RestAPI || window.RestAPI;
    const Constants = vencordWebpack?.Common?.Constants || window.Constants;
    const SnowflakeUtils = vencordWebpack?.Common?.SnowflakeUtils || window.SnowflakeUtils;
    const showToast = vencordWebpack?.Common?.showToast || ((msg) => console.log("[VoiceNotes]", msg));
    await sendVoiceMessage(
      activeChannelId,
      blob,
      metadata,
      { CloudUpload, RestAPI, Constants, SnowflakeUtils, showToast },
      { asNormalAttachment }
    );
  };
  if (disabled) return null;
  return /* @__PURE__ */ jsxs3(Fragment, { children: [
    isPanelOpen && /* @__PURE__ */ jsx3("div", { style: { position: "absolute", bottom: "100%", left: 0, right: 0, zIndex: 1e3 }, children: /* @__PURE__ */ jsx3(
      VoicePanel,
      {
        channelId: activeChannelId,
        onClose: () => setIsPanelOpen(false),
        onSend: handleSend
      }
    ) }),
    /* @__PURE__ */ jsx3(
      "div",
      {
        className: "expression-picker-chat-input-button vc-chatbar-button",
        style: { display: "inline-flex", alignItems: "center", justifyContent: "center" },
        children: /* @__PURE__ */ jsx3(
          "button",
          {
            type: "button",
            "aria-label": "Record Voice Message",
            title: "Record Voice Message (Discord Voice Notes)",
            onClick: () => setIsPanelOpen(!isPanelOpen),
            style: {
              background: isPanelOpen ? "var(--brand-experiment, #5865f2)" : "transparent",
              border: "none",
              borderRadius: "4px",
              padding: "6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: isPanelOpen ? "#ffffff" : "var(--interactive-normal, #b5bac1)"
            },
            children: /* @__PURE__ */ jsx3(MicrophoneIcon, { size: 20 })
          }
        )
      }
    )
  ] });
};

// src/plugin/index.ts
var pluginDefinition = {
  name: "DiscordVoiceNotes",
  description: "Enables recording and sending native Discord voice messages from the message composer on Debian Linux.",
  authors: [
    {
      name: "Debian Voice Notes Maintainers",
      id: 0n
    }
  ],
  tags: ["Voice", "Chat"],
  chatBarButton: {
    icon: MicrophoneIcon,
    render: VoiceNoteChatBarButton
  },
  contextMenus: {
    "channel-attach": (children, props) => {
      const channelId = props?.channel?.id;
      if (!channelId) return;
      children.push({
        type: "item",
        id: "dvn-record-voice-note",
        label: "Record Voice Note",
        action: () => {
          const setter = activePanels.get(channelId);
          if (setter) {
            setter(true);
          }
        }
      });
    }
  },
  start() {
    console.log("[DiscordVoiceNotes] Plugin loaded successfully.");
  },
  stop() {
    activePanels.clear();
    console.log("[DiscordVoiceNotes] Plugin unloaded.");
  }
};
var index_default = pluginDefinition;
export {
  index_default as default,
  pluginDefinition
};
