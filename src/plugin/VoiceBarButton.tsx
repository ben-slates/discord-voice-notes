import React, { useState } from "react";
import { VoicePanel } from "../components/VoicePanel";
import { MicrophoneIcon } from "../components/Icons";
import { sendVoiceMessage } from "../discord/uploader";
import { AudioMetadata } from "../discord/types";

export const activePanels = new Map<string, (active: boolean) => void>();

export const VoiceNoteChatBarButton: React.FC<{
    channel?: { id: string; guild_id?: string };
    channelId?: string;
    disabled?: boolean;
}> = ({ channel, channelId, disabled }) => {
    const activeChannelId = channel?.id || channelId || "";
    const [isPanelOpen, setIsPanelOpen] = useState(false);

    React.useEffect(() => {
        if (activeChannelId) {
            activePanels.set(activeChannelId, setIsPanelOpen);
            return () => {
                activePanels.delete(activeChannelId);
            };
        }
        return undefined;
    }, [activeChannelId]);

    const handleSend = async (blob: Blob, metadata: AudioMetadata, asNormalAttachment: boolean) => {
        const vencordWebpack = (window as any).Vencord?.Webpack;
        const CloudUpload = vencordWebpack?.findLazy?.((m: any) => m.prototype?.trackUploadFinished) || (window as any).CloudUpload;
        const RestAPI = vencordWebpack?.Common?.RestAPI || (window as any).RestAPI;
        const Constants = vencordWebpack?.Common?.Constants || (window as any).Constants;
        const SnowflakeUtils = vencordWebpack?.Common?.SnowflakeUtils || (window as any).SnowflakeUtils;
        const showToast = vencordWebpack?.Common?.showToast || ((msg: string) => console.log("[VoiceNotes]", msg));

        await sendVoiceMessage(
            activeChannelId,
            blob,
            metadata,
            { CloudUpload, RestAPI, Constants, SnowflakeUtils, showToast },
            { asNormalAttachment }
        );
    };

    if (disabled) return null;

    return (
        <>
            {isPanelOpen && (
                <div style={{ position: "absolute", bottom: "100%", left: 0, right: 0, zIndex: 1000 }}>
                    <VoicePanel
                        channelId={activeChannelId}
                        onClose={() => setIsPanelOpen(false)}
                        onSend={handleSend}
                    />
                </div>
            )}
            <div
                className="expression-picker-chat-input-button vc-chatbar-button"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            >
                <button
                    type="button"
                    aria-label="Record Voice Message"
                    title="Record Voice Message (Discord Voice Notes)"
                    onClick={() => setIsPanelOpen(!isPanelOpen)}
                    style={{
                        background: isPanelOpen ? "var(--brand-experiment, #5865f2)" : "transparent",
                        border: "none",
                        borderRadius: "4px",
                        padding: "6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: isPanelOpen ? "#ffffff" : "var(--interactive-normal, #b5bac1)"
                    }}
                >
                    <MicrophoneIcon size={20} />
                </button>
            </div>
        </>
    );
};
