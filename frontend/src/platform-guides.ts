// The words of the "Add a destination" form. Everything here is written for someone who has
// never seen a stream key: each platform gets a few plain steps for finding its key. The rules
// themselves (what a key must look like, which platform has a backup) are in
// supabase/functions/_shared/platforms.ts.

export interface PlatformGuide {
    stepTitle: string;
    title: string;
    steps: string[];
    openUrl?: string;
    openLabel?: string;
    note: string;
    keyLabel: string;
    keyHelp: string;
    placeholder: string;
}

export const PLATFORM_GUIDES: Record<string, PlatformGuide> = {
    yt: {
        stepTitle: 'Get your YouTube stream key',
        title: 'How to find your key on YouTube',
        steps: [
            'Open YouTube Studio and sign in to the channel that will go live.',
            'Click “Create” at the top right, then “Go live”.',
            'Under “Stream settings”, find the “Stream key” and click “Copy”.',
            'Come back here and paste it into the box below.',
        ],
        openUrl: 'https://studio.youtube.com',
        openLabel: 'Open YouTube Studio',
        note: 'You only need the key. The server address is filled in for you, and YouTube’s backup connection is set up automatically.',
        keyLabel: 'YouTube stream key',
        keyHelp: 'It is a few groups of letters and numbers, like abcd-1234-efgh-5678-ijkl.',
        placeholder: 'abcd-1234-efgh-5678-ijkl',
    },
    fb: {
        stepTitle: 'Get your Facebook stream key',
        title: 'How to find your key on Facebook',
        steps: [
            'Open Facebook and go to the Page or profile that will go live.',
            'Choose “Live video”, then “Streaming software”. The Live Producer opens.',
            'Find the “Stream key” and click “Copy”.',
            'Come back here and paste it into the box below.',
        ],
        openUrl: 'https://www.facebook.com/live/producer',
        openLabel: 'Open Facebook Live',
        note: 'Facebook keys can stop working after a while, or after one use. If the stream will not start, get a fresh key and update it here.',
        keyLabel: 'Facebook stream key',
        keyHelp:
            'It starts with “FB-” followed by numbers and letters, like FB-1234567890-0-AbCdEfGh.',
        placeholder: 'FB-1234567890-0-AbCdEfGh',
    },
    ig: {
        stepTitle: 'Get your Instagram stream key',
        title: 'How to find your key on Instagram',
        steps: [
            'On a computer, open Instagram and start a live video (Create, then Live).',
            'Give the live a title, choose who can watch, and continue.',
            'Copy the “Stream key”.',
            'Come back here and paste the whole key into the box below.',
        ],
        openUrl: 'https://www.instagram.com/',
        openLabel: 'Open Instagram',
        note: 'Paste the whole key, including everything after “?s_prp=”. Instagram keys often work for one live only, so you may need a new one each time.',
        keyLabel: 'Instagram stream key',
        keyHelp: 'It is a long code that contains “?s_prp=”. Paste all of it.',
        placeholder: 'Paste the whole key, including ?s_prp=…',
    },
    vc: {
        stepTitle: 'Get your VdoCipher stream key',
        title: 'How to find your key on VdoCipher',
        steps: [
            'Sign in to your VdoCipher dashboard.',
            'Open your live stream, or create a new one.',
            'Copy its “Stream key”.',
            'Come back here and paste it into the box below.',
        ],
        openUrl: 'https://dashboard.vdocipher.com',
        openLabel: 'Open VdoCipher',
        note: 'You only need the key. The server address is filled in for you.',
        keyLabel: 'VdoCipher stream key',
        keyHelp: 'Paste the key exactly as VdoCipher shows it.',
        placeholder: 'Paste your stream key here',
    },
    rtmp: {
        stepTitle: 'Enter your stream details',
        title: 'What to ask your streaming provider for',
        steps: [
            'A server address. It starts with rtmp:// or rtmps://.',
            'A stream key. This is the secret code for your stream.',
            'Type or paste each one below. If you only have one long address, paste it into the stream key box and we will split it for you.',
        ],
        note: 'Not sure what to enter? Ask the person who set up the streaming service.',
        keyLabel: 'Stream key',
        keyHelp: 'The secret code from your provider.',
        placeholder: 'Paste your stream key here',
    },
    srt: {
        stepTitle: 'Enter your SRT details',
        title: 'What to ask your streaming provider for',
        steps: [
            'The server address and the port number of the SRT link.',
            'Whether you connect to them (Caller) or they connect to you (Listener).',
            'A password and a stream ID, only if they gave you these.',
        ],
        note: 'SRT is mostly used by technical teams. If you are not sure, ask the person who set up the stream.',
        keyLabel: 'Stream key',
        keyHelp: '',
        placeholder: '',
    },
};

// Shown above the backup section so nobody fills in what the platform does not need. Where the
// form hides the backup box (YouTube, Instagram) the note is all there is; for Facebook it
// explains the box that is left.
export const BACKUP_NOTES: Record<string, string> = {
    yt: 'YouTube’s backup uses the same stream key as your main stream. Only the server address is different, and we add it for you. Nothing to fill in here.',
    fb: 'Facebook’s backup uses the same server address as your main stream, but a different stream key. Paste the backup key from Facebook below.',
    ig: 'Instagram has no backup stream. Leave this empty: there is nothing to fill in.',
};
