import React, { useState, useEffect, useRef } from "react";
import { VoiceRecorderController } from "../audio/recorder";
import { decodeWaveformBase64 } from "../audio/waveform";
import { AudioMetadata, RecordingState } from "../discord/types";
import { MicrophoneIcon, StopIcon, TrashIcon, PlayIcon, PauseIcon, SendIcon } from "./Icons";
import "./VoiceNotes.css";

export interface VoicePanelProps {
    channelId: string;
    onClose: () => void;
    onSend: (audioBlob: Blob, metadata: AudioMetadata, asNormalAttachment: boolean) => Promise<void>;
}

export const VoicePanel: React.FC<VoicePanelProps> = ({
    channelId: _channelId,
    onClose,
    onSend
}) => {
    const [state, setState] = useState<RecordingState>("idle");
    const [elapsed, setElapsed] = useState(0);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [metadata, setMetadata] = useState<AudioMetadata | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackTime, setPlaybackTime] = useState(0);
    const [asNormalAttachment, setAsNormalAttachment] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    const controllerRef = useRef<VoiceRecorderController | null>(null);
    const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

    const formatTime = (seconds: number) => {
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

        controller.start().catch((err: unknown) => {
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
            const { blob, metadata } = await controllerRef.current.stop();
            setAudioBlob(blob);
            setMetadata(metadata);
            const url = URL.createObjectURL(blob);
            setAudioUrl(url);
        } catch (err: unknown) {
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
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to send voice message";
            setErrorMessage(msg);
            setIsUploading(false);
        }
    };

    const waveformBytes = metadata?.waveform ? decodeWaveformBase64(metadata.waveform) : new Uint8Array(0);

    return (
        <div className="dvn-container">
            {errorMessage && (
                <div className="dvn-error-banner">
                    {errorMessage}
                </div>
            )}

            {audioUrl && (
                <audio
                    ref={audioPlayerRef}
                    src={audioUrl}
                    onTimeUpdate={() => {
                        if (audioPlayerRef.current) {
                            setPlaybackTime(audioPlayerRef.current.currentTime);
                        }
                    }}
                    onEnded={() => {
                        setIsPlaying(false);
                        setPlaybackTime(0);
                    }}
                />
            )}

            {(state === "recording" || state === "requesting_permission" || state === "paused") && (
                <div className="dvn-row">
                    <div className="dvn-recording-indicator">
                        <div className="dvn-pulse-dot" />
                        <span>{state === "paused" ? "Paused" : "Recording"}</span>
                        <span className="dvn-timer">{formatTime(elapsed)}</span>
                    </div>

                    <div className="dvn-controls">
                        {state === "recording" ? (
                            <button
                                className="dvn-btn dvn-btn-secondary"
                                onClick={() => controllerRef.current?.pause()}
                                title="Pause recording"
                            >
                                <PauseIcon size={16} /> Pause
                            </button>
                        ) : state === "paused" ? (
                            <button
                                className="dvn-btn dvn-btn-secondary"
                                onClick={() => controllerRef.current?.resume()}
                                title="Resume recording"
                            >
                                <MicrophoneIcon size={16} /> Resume
                            </button>
                        ) : null}

                        <button
                            className="dvn-btn dvn-btn-primary"
                            onClick={handleStop}
                            title="Finish and preview recording"
                        >
                            <StopIcon size={16} /> Stop
                        </button>

                        <button
                            className="dvn-btn dvn-btn-danger"
                            onClick={handleCancel}
                            title="Discard recording"
                        >
                            <TrashIcon size={16} /> Cancel
                        </button>
                    </div>
                </div>
            )}

            {state === "stopped" && audioBlob && metadata && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div className="dvn-row">
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <button
                                className="dvn-btn dvn-btn-secondary"
                                onClick={togglePlayback}
                                title={isPlaying ? "Pause" : "Play preview"}
                            >
                                {isPlaying ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
                            </button>
                            <span className="dvn-timer">
                                {formatTime(playbackTime)} / {formatTime(metadata.duration)}
                            </span>
                        </div>

                        <div className="dvn-fallback-toggle">
                            <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                                <input
                                    type="checkbox"
                                    checked={asNormalAttachment}
                                    onChange={(e) => setAsNormalAttachment(e.target.checked)}
                                />
                                Send as normal attachment fallback
                            </label>
                        </div>
                    </div>

                    {waveformBytes.length > 0 && (
                        <div className="dvn-waveform-preview">
                            {Array.from(waveformBytes).slice(0, 64).map((val, idx) => {
                                const heightPercent = Math.max(10, Math.round((val / 255) * 100));
                                const playedProgress = metadata.duration > 0 ? playbackTime / metadata.duration : 0;
                                const barProgress = idx / Math.min(64, waveformBytes.length);
                                const isPlayed = barProgress <= playedProgress;

                                return (
                                    <div
                                        key={idx}
                                        className={`dvn-waveform-bar ${isPlayed ? "played" : ""}`}
                                        style={{ height: `${heightPercent}%` }}
                                    />
                                );
                            })}
                        </div>
                    )}

                    <div className="dvn-row">
                        <button
                            className="dvn-btn dvn-btn-danger"
                            onClick={handleCancel}
                            title="Discard voice message"
                        >
                            <TrashIcon size={16} /> Discard
                        </button>

                        <button
                            className="dvn-btn dvn-btn-primary"
                            onClick={handleSend}
                            disabled={isUploading}
                            title="Send native voice message"
                        >
                            <SendIcon size={16} />
                            {isUploading ? "Uploading..." : "Send Voice Note"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
