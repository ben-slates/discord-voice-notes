import React from "react";

export interface IconProps extends React.SVGProps<SVGSVGElement> {
    size?: number;
    color?: string;
}

export const MicrophoneIcon: React.FC<IconProps> = ({ size = 20, color = "currentColor", ...props }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
);

export const StopIcon: React.FC<IconProps> = ({ size = 20, color = "currentColor", ...props }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} {...props}>
        <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
);

export const TrashIcon: React.FC<IconProps> = ({ size = 20, color = "currentColor", ...props }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
);

export const PlayIcon: React.FC<IconProps> = ({ size = 20, color = "currentColor", ...props }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} {...props}>
        <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
);

export const PauseIcon: React.FC<IconProps> = ({ size = 20, color = "currentColor", ...props }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} {...props}>
        <rect x="6" y="4" width="4" height="16" rx="1" />
        <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
);

export const SendIcon: React.FC<IconProps> = ({ size = 20, color = "currentColor", ...props }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
);
