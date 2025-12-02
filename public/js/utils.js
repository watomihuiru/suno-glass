function getDisplayModelName(rawName) {
    if (!rawName) return 'AI';
    const lower = rawName.toLowerCase();
    if (lower.includes('v5')) return 'v5';
    // Check for v4_5plus or v4_5_plus before v4_5 to avoid matching v4_5 first
    if (lower.includes('v4_5plus') || lower.includes('v4_5_plus') || lower.includes('v4.5+')) return 'v4.5+';
    if (lower.includes('v4_5') || lower.includes('v4.5')) return 'v4.5';
    if (lower.includes('v4')) return 'v4';
    if (lower.includes('v3_5') || lower.includes('v3.5')) return 'v3.5';
    return rawName;
}

function formatTime(s) {
    const m = Math.floor(s / 60);
    const sc = Math.floor(s % 60);
    return `${m}:${sc < 10 ? '0' : ''}${sc}`;
}