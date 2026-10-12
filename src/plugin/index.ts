/**
 * Discord Voice Notes - Vencord Custom Plugin
 */

import { MicrophoneIcon } from "../components/Icons";
import { VoiceNoteChatBarButton, activePanels } from "./VoiceBarButton";

export const pluginDefinition = {
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
        "channel-attach": (children: any[], props: any) => {
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

export default pluginDefinition;
